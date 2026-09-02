import { Hono } from 'hono';
import { optimizeImage } from 'wasm-image-optimization';
import { Env, AppVariables } from '../types/env.js';
import { siteAuthMiddleware } from '../middleware/auth.js';
import { checkRateLimit } from '../middleware/rate-limit.js';

export const assetRoutes = new Hono<{ Bindings: Env; Variables: AppVariables }>();

/**
 * Public download of the latest WP Instant WordPress plugin zip.
 * GET /api/v1/assets/plugin/download
 */
assetRoutes.get('/plugin/download', async (c) => {
  const obj = await c.env.ASSETS_BUCKET.get('plugin/wp-instant.zip');
  if (!obj) {
    return c.json({ success: false, error: 'Plugin package not published yet' }, 404);
  }
  return new Response(obj.body as any, {
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': 'attachment; filename="wp-instant.zip"',
      'Cache-Control': 'public, max-age=300',
    },
  });
});

/**
 * Proxy & Serve Generated Critical CSS directly from R2
 * GET /api/v1/assets/css/:site_id/:css_file
 */
assetRoutes.get('/css/:site_id/:css_file', async (c) => {
  const siteId = c.req.param('site_id');
  const cssFile = c.req.param('css_file');

  // Commercial policy: stop edge serving CSS immediately if the site is inactive
  // (subscription canceled/revoked). KV-cached for 5m to protect R2 performance.
  const activeKvKey = `siteactive:${siteId}`;
  let isActive = await c.env.KV.get(activeKvKey);
  if (isActive === null) {
    const row = await c.env.DB.prepare('SELECT is_active FROM sites WHERE id = ?')
      .bind(siteId)
      .first<{ is_active: number }>();
    isActive = row && row.is_active === 1 ? '1' : '0';
    await c.env.KV.put(activeKvKey, isActive, { expirationTtl: 300 });
  }
  if (isActive !== '1') {
    return c.text('/* Site optimization inactive */', 403, {
      'Content-Type': 'text/css; charset=utf-8',
    });
  }

  const r2Key = `sites/${siteId}/css/${cssFile}`;

  const object = await c.env.ASSETS_BUCKET.get(r2Key);
  if (!object) {
    return c.text('/* Critical CSS not found */', 404, {
      'Content-Type': 'text/css; charset=utf-8',
    });
  }

  c.header('Content-Type', 'text/css; charset=utf-8');
  c.header('Cache-Control', 'public, max-age=31536000, immutable');
  c.header('Access-Control-Allow-Origin', '*');

  return c.body(object.body as any);
});

/* ------------------------------------------------------------------ */
/* Zero-DNS media CDN (R2-backed, signed, 302-to-origin on miss)       */
/* ------------------------------------------------------------------ */

const MEDIA_TYPES: Record<string, string> = {
  webp: 'image/webp',
  orig: 'application/octet-stream', // sniffed/provided at upload time
  raw: 'application/octet-stream',
};

function b64urlDecode(u: string): string {
  const pad = '='.repeat((4 - (u.length % 4)) % 4);
  const b64 = u.replace(/-/g, '+').replace(/_/g, '/') + pad;
  return atob(b64);
}

async function hmacHex(secret: string, data: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(data));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function timingSafeEq(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** Site callback secret (for URL signing), cached in KV for 1h. Only returned if active. */
async function siteSecret(c: any, siteId: string): Promise<string | null> {
  const kvKey = `msecret:${siteId}`;
  const cached = await c.env.KV.get(kvKey);
  if (cached) return cached;
  const row = (await c.env.DB.prepare('SELECT callback_secret, is_active FROM sites WHERE id = ?')
    .bind(siteId)
    .first()) as { callback_secret: string | null; is_active: number } | null;
  if (!row?.callback_secret || row.is_active !== 1) return null;
  await c.env.KV.put(kvKey, row.callback_secret, { expirationTtl: 3600 });
  return row.callback_secret;
}

async function verifyMediaSignature(
  c: any,
  siteId: string,
  u: string,
  w: string,
  f: string,
  s: string
): Promise<{ ok: true; src: string } | { ok: false; response: any }> {
  if (!u || !s || !f) {
    return { ok: false, response: c.json({ success: false, error: 'Missing media params' }, 400) };
  }

  const secret = await siteSecret(c, siteId);
  if (!secret) {
    return { ok: false, response: c.json({ success: false, error: 'Site not found' }, 404) };
  }

  const expected = (await hmacHex(secret, `${u}|${w}|${f}|${siteId}`)).slice(0, 32);
  if (!timingSafeEq(expected, s)) {
    return { ok: false, response: c.json({ success: false, error: 'Invalid signature' }, 403) };
  }

  let src: string;
  try {
    src = decodeURIComponent(b64urlDecode(u));
  } catch {
    return { ok: false, response: c.json({ success: false, error: 'Invalid source' }, 400) };
  }
  if (!/^https?:\/\//i.test(src)) {
    return { ok: false, response: c.json({ success: false, error: 'Invalid source URL' }, 400) };
  }

  return { ok: true, src };
}

/**
 * Serve a media derivative from R2; on miss, optimize AT THE EDGE (WASM
 * resize/convert) and fill R2 — images never redirect to the origin except
 * as a last-resort fallback. Videos (f=raw) are cache-filled from the
 * origin in the background (≤100MB).
 *
 * GET /api/v1/assets/media/:site_id/:url_hash?u=<b64url src>&w=&f=&q=&s=<hmac>
 */
assetRoutes.get('/media/:site_id/:url_hash', async (c) => {
  const siteId = c.req.param('site_id');
  const urlHash = c.req.param('url_hash');
  const u = c.req.query('u') || '';
  const w = c.req.query('w') || '0';
  const f = c.req.query('f') || 'webp';
  const q = c.req.query('q') || '82';
  const s = c.req.query('s') || '';

  const verified = await verifyMediaSignature(c, siteId, u, w, f, s);
  if (!verified.ok) return verified.response;

  const width = Math.max(0, Math.min(4000, parseInt(w, 10) || 0));
  const quality = Math.max(40, Math.min(100, parseInt(q, 10) || 82));
  const r2Key = `sites/${siteId}/media/${urlHash}_${width}_${quality}.${f}`;

  // AVIF upgrade: when the browser accepts it we can serve an even smaller
  // variant — but the R2 key implies the requested format, so AVIF lives
  // only in the Cache API as a per-client variant.
  const accept = c.req.header('accept') || '';
  const wantsAvif = f === 'webp' && /image\/avif/i.test(accept);

  // Cache API fast path (per URL + format variant).
  const cache = await caches.open('wpins-media-v1');
  const cacheKey = new Request(c.req.url + (wantsAvif ? '&fmt=avif' : ''));
  const cachedHit = await cache.match(cacheKey).catch(() => null);
  if (cachedHit && cachedHit.ok) {
    return cachedHit;
  }

  // Range request support (video seeking) against an R2 hit.
  const rangeHeader = c.req.header('range');
  if (rangeHeader) {
    const meta = await c.env.ASSETS_BUCKET.head(r2Key).catch(() => null);
    if (meta) {
      const size = meta.size;
      const match = /bytes=(\d+)-(\d*)/.exec(rangeHeader);
      if (match) {
        const start = Math.min(Number(match[1]), Math.max(0, size - 1));
        const end = match[2] ? Math.min(Number(match[2]), size - 1) : size - 1;
        const partial = (await c.env.ASSETS_BUCKET.get(r2Key, {
          range: { offset: start, length: end - start + 1 },
        } as any)) as { body: ReadableStream } | null;
        if (partial) {
          c.status(206);
          c.header('Content-Range', `bytes ${start}-${end}/${size}`);
          c.header('Accept-Ranges', 'bytes');
          c.header('Content-Length', String(end - start + 1));
          c.header('Content-Type', meta.httpMetadata?.contentType || 'application/octet-stream');
          c.header('Cache-Control', 'public, max-age=31536000, immutable');
          c.header('Access-Control-Allow-Origin', '*');
          return c.body(partial.body as any);
        }
      }
    }
  }

  const object = await c.env.ASSETS_BUCKET.get(r2Key);
  if (object) {
    const hit = new Response(object.body as any, {
      headers: {
        'Content-Type': object.httpMetadata?.contentType || MEDIA_TYPES[f] || 'application/octet-stream',
        'Cache-Control': 'public, max-age=31536000, immutable',
        'Accept-Ranges': 'bytes',
        'Access-Control-Allow-Origin': '*',
        'X-WP-Instant-Media': 'HIT',
      },
    });
    c.executionCtx.waitUntil(cache.put(cacheKey, hit.clone()).catch(() => {}));
    return hit;
  }

  /* ------------------------- MISS path ------------------------- */

  // MISSes trigger origin fetches + edge transcoding — throttle per site so
  // a hostile crawler can't burn CPU through freshly-minted signed URLs.
  const allowed = await checkRateLimit(c.env, 'media-miss', siteId, 120, 60);
  if (!allowed) {
    return c.json({ success: false, error: 'Rate limit exceeded' }, 429);
  }

  // Videos: fill in the background, redirect meanwhile (unchanged).
  if (f === 'raw') {
    try {
      c.executionCtx.waitUntil(
        (async () => {
          const head = await fetch(verified.src, { method: 'HEAD' }).catch(() => null);
          const len = head ? Number(head.headers.get('content-length') || '0') : 0;
          if (head && len > 0 && len <= 100 * 1024 * 1024) {
            const res = await fetch(verified.src);
            if (res.ok && res.body) {
              await c.env.ASSETS_BUCKET.put(r2Key, res.body as any, {
                httpMetadata: {
                  contentType: head.headers.get('content-type') || 'video/mp4',
                },
              });
            }
          }
        })()
      );
    } catch {
      // best effort
    }
    c.header('Cache-Control', 'public, max-age=60');
    c.header('X-WP-Instant-Media', 'MISS');
    return c.redirect(verified.src, 302);
  }

  // Images: fetch the origin bytes once, then optimize AT THE EDGE.
  const srcRes = await fetch(verified.src, {
    headers: { Accept: 'image/avif,image/webp,image/*,*/*;q=0.8' },
    cf: { cacheKey: verified.src } as any,
  }).catch(() => null);

  if (!srcRes || !srcRes.ok) {
    // Origin unreachable: last-resort redirect (kept from the old design —
    // a rewrite can never permanently break an image).
    c.header('Cache-Control', 'public, max-age=60');
    c.header('X-WP-Instant-Media', 'MISS');
    return c.redirect(verified.src, 302);
  }

  // Guard against Worker OOM: origin files > 5MB skip synchronous edge WASM transcoding
  const contentLength = Number(srcRes.headers.get('content-length') || '0');
  if (contentLength > 5 * 1024 * 1024) {
    c.header('Cache-Control', 'public, max-age=300');
    c.header('X-WP-Instant-Media', 'PASS-OVERSIZE');
    return c.redirect(verified.src, 302);
  }

  const srcBytes = await srcRes.arrayBuffer();
  if (srcBytes.byteLength > 5 * 1024 * 1024) {
    c.header('Cache-Control', 'public, max-age=300');
    c.header('X-WP-Instant-Media', 'PASS-OVERSIZE');
    return c.redirect(verified.src, 302);
  }

  const srcType = srcRes.headers.get('content-type') || '';

  // Vector/animated formats are already optimal: store + serve untouched.
  const isVectorOrGif = /image\/(svg\+xml|gif)/i.test(srcType) || /\.svg(?:[?#]|$)/i.test(verified.src);
  if (isVectorOrGif || f === 'orig') {
    const ct = isVectorOrGif && srcType ? srcType : srcType || 'application/octet-stream';
    c.executionCtx.waitUntil(
      c.env.ASSETS_BUCKET.put(r2Key, srcBytes, { httpMetadata: { contentType: ct } }).catch(() => {})
    );
    const passthrough = new Response(srcBytes, {
      headers: {
        'Content-Type': ct,
        'Cache-Control': 'public, max-age=31536000, immutable',
        'Access-Control-Allow-Origin': '*',
        'X-WP-Instant-Media': 'EDGE-FILL',
      },
    });
    c.executionCtx.waitUntil(cache.put(cacheKey, passthrough.clone()).catch(() => {}));
    return passthrough;
  }

  // Raster images: WASM resize/convert at the edge. AVIF when accepted,
  // otherwise the requested format (webp). speed 8 = fast encode, fine for
  // an on-demand pipeline (the plugin's GD path converges to the same key).
  const outFormat = wantsAvif ? 'avif' : 'webp';
  try {
    const optimized = await optimizeImage({
      image: new Uint8Array(srcBytes),
      width: width > 0 ? width : undefined,
      quality,
      format: outFormat as 'avif' | 'webp',
      speed: 8,
    });

    if (optimized?.data && optimized.data.byteLength > 0) {
      const body: ArrayBuffer = optimized.data.buffer.slice(
        optimized.data.byteOffset,
        optimized.data.byteOffset + optimized.data.byteLength
      ) as ArrayBuffer;
      // Persist the requested-format derivative in R2 (the canonical,
      // plugin-compatible artifact). The AVIF variant stays cache-only.
      if (outFormat === f) {
        c.executionCtx.waitUntil(
          c.env.ASSETS_BUCKET.put(r2Key, body, {
            httpMetadata: { contentType: `image/${outFormat}` },
          }).catch(() => {})
        );
      }
      const response = new Response(body, {
        headers: {
          'Content-Type': `image/${outFormat}`,
          'Cache-Control': 'public, max-age=31536000, immutable',
          'Access-Control-Allow-Origin': '*',
          'X-WP-Instant-Media': 'EDGE-OPT',
        },
      });
      c.executionCtx.waitUntil(cache.put(cacheKey, response.clone()).catch(() => {}));
      return response;
    }
  } catch (err) {
    console.warn('[Media] WASM optimize failed, serving original:', err);
  }

  // Optimization failed: store + serve the original bytes (self-heals when
  // the plugin's derivative PUT lands — it overwrites the same R2 key).
  c.executionCtx.waitUntil(
    c.env.ASSETS_BUCKET.put(r2Key, srcBytes, {
      httpMetadata: { contentType: srcType || 'application/octet-stream' },
    }).catch(() => {})
  );
  return new Response(srcBytes, {
    headers: {
      'Content-Type': srcType || 'application/octet-stream',
      'Cache-Control': 'public, max-age=300',
      'Access-Control-Allow-Origin': '*',
      'X-WP-Instant-Media': 'ORIGINAL',
    },
  });
});

/**
 * Plugin derivative upload (site API-key auth): stores bytes in R2.
 * PUT /api/v1/assets/media/:site_id/:url_hash?u=&w=&f=&s=
 * Body: raw image bytes (≤3MB).
 */
assetRoutes.put('/media/:site_id/:url_hash', siteAuthMiddleware, async (c) => {
  const site = c.get('site')!;
  const urlHash = c.req.param('url_hash');
  const u = c.req.query('u') || '';
  const w = c.req.query('w') || '0';
  const f = c.req.query('f') || 'webp';
  const q = c.req.query('q') || '82';
  const s = c.req.query('s') || '';

  const verified = await verifyMediaSignature(c, site.id, u, w, f, s);
  if (!verified.ok) return verified.response;

  if (!['webp', 'orig', 'raw'].includes(f)) {
    return c.json({ success: false, error: 'Invalid format' }, 400);
  }

  const body = await c.req.arrayBuffer().catch(() => null);
  if (!body || body.byteLength === 0 || body.byteLength > 3 * 1024 * 1024) {
    return c.json({ success: false, error: 'Body out of bounds (max 3MB)' }, 400);
  }

  const contentType = c.req.header('Content-Type') || MEDIA_TYPES[f] || 'application/octet-stream';
  if (!/^image\//i.test(contentType) && f !== 'raw' && contentType !== 'application/octet-stream') {
    return c.json({ success: false, error: 'Invalid content type' }, 400);
  }

  const width = Math.max(0, Math.min(4000, parseInt(w, 10) || 0));
  const quality = Math.max(40, Math.min(100, parseInt(q, 10) || 82));
  const r2Key = `sites/${site.id}/media/${urlHash}_${width}_${quality}.${f}`;
  await c.env.ASSETS_BUCKET.put(r2Key, body, {
    httpMetadata: { contentType },
  });

  return c.json({ success: true, data: { key: r2Key, bytes: body.byteLength } });
});
