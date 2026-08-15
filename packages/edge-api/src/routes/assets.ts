import { Hono } from 'hono';
import { Env, AppVariables } from '../types/env.js';
import { siteAuthMiddleware } from '../middleware/auth.js';

export const assetRoutes = new Hono<{ Bindings: Env; Variables: AppVariables }>();

/**
 * Proxy & Serve Generated Critical CSS directly from R2
 * GET /api/v1/assets/css/:site_id/:css_file
 */
assetRoutes.get('/css/:site_id/:css_file', async (c) => {
  const siteId = c.req.param('site_id');
  const cssFile = c.req.param('css_file');
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

/** Site callback secret (for URL signing), cached in KV for 1h. */
async function siteSecret(c: any, siteId: string): Promise<string | null> {
  const kvKey = `msecret:${siteId}`;
  const cached = await c.env.KV.get(kvKey);
  if (cached) return cached;
  const row = (await c.env.DB.prepare('SELECT callback_secret FROM sites WHERE id = ?')
    .bind(siteId)
    .first()) as { callback_secret: string | null } | null;
  if (!row?.callback_secret) return null;
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
 * Serve a media derivative from R2; redirect to the origin URL on miss so
 * media can never break. Videos (f=raw) are cache-filled from the origin
 * in the background (≤100MB).
 *
 * GET /api/v1/assets/media/:site_id/:url_hash?u=<b64url src>&w=&f=&s=<hmac>
 */
assetRoutes.get('/media/:site_id/:url_hash', async (c) => {
  const siteId = c.req.param('site_id');
  const urlHash = c.req.param('url_hash');
  const u = c.req.query('u') || '';
  const w = c.req.query('w') || '0';
  const f = c.req.query('f') || 'webp';
  const s = c.req.query('s') || '';

  const verified = await verifyMediaSignature(c, siteId, u, w, f, s);
  if (!verified.ok) return verified.response;

  const r2Key = `sites/${siteId}/media/${urlHash}_${w}.${f}`;

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
    c.header('Content-Type', object.httpMetadata?.contentType || MEDIA_TYPES[f] || 'application/octet-stream');
    c.header('Cache-Control', 'public, max-age=31536000, immutable');
    c.header('Accept-Ranges', 'bytes');
    c.header('Access-Control-Allow-Origin', '*');
    c.header('X-Turbopress-Media', 'HIT');
    return c.body(object.body as any);
  }

  // MISS: fill in the background when worthwhile, redirect meanwhile.
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
  }

  // MISS: briefly cacheable redirect to the origin while derivatives
  // generate / video fills happen in the background.
  c.header('Cache-Control', 'public, max-age=60');
  c.header('X-Turbopress-Media', 'MISS');
  return c.redirect(verified.src, 302);
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

  const r2Key = `sites/${site.id}/media/${urlHash}_${w}.${f}`;
  await c.env.ASSETS_BUCKET.put(r2Key, body, {
    httpMetadata: { contentType },
  });

  return c.json({ success: true, data: { key: r2Key, bytes: body.byteLength } });
});
