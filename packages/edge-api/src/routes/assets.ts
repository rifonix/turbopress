import { Hono } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import { optimizeImage } from 'wasm-image-optimization';
import { sha256 } from '@wpinstant/shared';
import { Env, AppVariables } from '../types/env.js';
import { siteAuthMiddleware } from '../middleware/auth.js';
import { checkRateLimit } from '../middleware/rate-limit.js';

export const assetRoutes = new Hono<{ Bindings: Env; Variables: AppVariables }>();

/**
 * Background work without an execution context: Hono's c.executionCtx getter
 * THROWS when the app was fetched without one (tests, direct dispatch), so
 * every fire-and-forget write goes through this guard.
 */
function defer(c: any, p: Promise<unknown>): void {
  try {
    c.executionCtx.waitUntil(p);
  } catch {
    /* no execution context — run inline, swallow result */
    p.catch(() => {});
  }
}

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
 * Public version probe for the plugin's self-update channel. Version comes
 * from the `plugin/latest.json` sidecar ({"version":"X.Y.Z"}) uploaded next
 * to the zip — this wrangler's r2 put has no --custom-metadata — with R2
 * customMetadata as a preferred override when present. Without either the
 * endpoint reports null and the plugin stays silent (no bogus prompts).
 * GET /api/v1/assets/plugin/version
 */
assetRoutes.get('/plugin/version', async (c) => {
  const head = await c.env.ASSETS_BUCKET.head('plugin/wp-instant.zip').catch(() => null);
  if (!head) {
    return c.json({ success: false, error: 'Plugin package not published yet' }, 404);
  }

  let version: string | null = null;
  const meta = (head as any).customMetadata || {};
  if (typeof meta.version === 'string' && meta.version) {
    version = meta.version;
  } else {
    const sidecar = await c.env.ASSETS_BUCKET.get('plugin/latest.json').catch(() => null);
    if (sidecar) {
      try {
        const parsed = (await sidecar.json()) as { version?: unknown };
        if (typeof parsed?.version === 'string' && parsed.version) {
          version = parsed.version;
        }
      } catch {
        /* malformed sidecar: report null */
      }
    }
  }

  return c.json(
    {
      success: true,
      data: {
        version,
        uploaded: head.uploaded instanceof Date ? head.uploaded.toISOString() : String(head.uploaded),
        download: '/api/v1/assets/plugin/download',
      },
    },
    200,
    { 'Cache-Control': 'public, max-age=60' }
  );
});

/**
 * Proxy & Serve Generated Critical CSS directly from R2
 * GET /api/v1/assets/css/:site_id/:css_file
 */
assetRoutes.get('/css/:site_id/:css_file', async (c) => {
  const siteId = c.req.param('site_id');
  const cssFile = c.req.param('css_file');

  // Per-colo memoization: the commercial-policy checks below still run per
  // request, but R2 reads and misses are absorbed by the edge cache.
  const cache = typeof caches !== 'undefined' ? await caches.open('wpins-css-v1').catch(() => null) : null;
  const cacheKey = new Request(c.req.url);
  if (cache) {
    const cached = await cache.match(cacheKey).catch(() => null);
    if (cached) return cached;
  }

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
    const resp = c.text('/* Site optimization inactive */', 403, {
      'Content-Type': 'text/css; charset=utf-8',
      'Cache-Control': 'public, max-age=30',
    });
    if (cache) defer(c, cache.put(cacheKey, resp.clone()).catch(() => {}));
    return resp;
  }

  const r2Key = `sites/${siteId}/css/${cssFile}`;

  const object = await c.env.ASSETS_BUCKET.get(r2Key);
  if (!object) {
    // Missing artifacts are retried aggressively by browsers (font/CSS
    // pull-ups); a short negative TTL absorbs the burst without pinning.
    const resp = c.text('/* Critical CSS not found */', 404, {
      'Content-Type': 'text/css; charset=utf-8',
      'Cache-Control': 'public, max-age=30',
    });
    if (cache) defer(c, cache.put(cacheKey, resp.clone()).catch(() => {}));
    return resp;
  }

  c.header('Content-Type', 'text/css; charset=utf-8');
  // Artifact keys are URL+viewport (mutable across regenerations), so the
  // policy must stay short-lived — immutable here would pin stale CSS.
  c.header('Cache-Control', 'public, max-age=3600, stale-while-revalidate=86400');
  c.header('Access-Control-Allow-Origin', '*');
  c.header('X-WP-Instant-Media', 'CSS-HIT');

  const resp = c.body(object.body as any);
  if (cache) defer(c, cache.put(cacheKey, resp.clone()).catch(() => {}));
  return resp;
});

/**
 * Store a small, public, content-addressed media derivative in the bucket
 * exposed at objects.wpinstant.dev. The plugin uploads only derivatives whose
 * exact source version and dimensions it knows, then records the returned
 * public URL in a local manifest. Until that manifest entry exists, generated
 * HTML continues using the legacy Worker URL and its origin fallback.
 *
 * PUT /api/v1/assets/public-media/:site_id/:signature/:source_hash/:width/:quality/:format
 */
assetRoutes.put(
  '/public-media/:site_id/:signature/:source_hash/:width/:quality/:format',
  siteAuthMiddleware,
  async (c) => {
    const siteId = c.req.param('site_id');
    if (c.get('site')?.id !== siteId) {
      return c.json({ success: false, error: 'Site identity mismatch' }, 403);
    }

    const bucket = c.env.PUBLIC_MEDIA_BUCKET;
    if (!bucket) {
      return c.json({ success: false, error: 'Public media bucket is not configured' }, 503);
    }

    const signature = c.req.param('signature');
    const sourceHash = c.req.param('source_hash');
    const extension = c.req.param('format').toLowerCase();
    const allowedExtensions = [
      'gif', 'jpg', 'jpeg', 'png', 'webp', 'avif', 'svg', 'mp4', 'm4v',
      'webm', 'mov', 'woff', 'woff2', 'ttf', 'otf',
    ];
    const format = extension === 'webp' ? 'webp' : 'orig';
    const width = Number.parseInt(c.req.param('width'), 10);
    const quality = Number.parseInt(c.req.param('quality'), 10);

    if (!/^[0-9a-f]{32}$/i.test(signature) || !/^[0-9a-f]{32}$/i.test(sourceHash)) {
      return c.json({ success: false, error: 'Invalid artifact identity' }, 400);
    }
    if (!Number.isInteger(width) || width < 0 || width > 4000) {
      return c.json({ success: false, error: 'Invalid width' }, 400);
    }
    if (!Number.isInteger(quality) || quality < 40 || quality > 100) {
      return c.json({ success: false, error: 'Invalid quality' }, 400);
    }
    if (!allowedExtensions.includes(extension)) {
      return c.json({ success: false, error: 'Invalid public media extension' }, 400);
    }

    const sec = await siteSecret(c, siteId);
    if (!sec.ok) {
      return c.json({ success: false, error: 'Secret lookup temporarily unavailable' }, 502);
    }
    if (!sec.secret) {
      return c.json({ success: false, error: 'Site not found' }, 404);
    }

    const signedParts = `v1|${siteId}|${sourceHash}|${width}|${quality}|${format}`;
    const expectedSignature = (await hmacHex(sec.secret, signedParts)).slice(0, 32);
    if (!timingSafeEq(expectedSignature, signature)) {
      return c.json({ success: false, error: 'Invalid artifact signature' }, 403);
    }

    const body = await c.req.arrayBuffer().catch(() => null);
    if (!body || body.byteLength === 0 || body.byteLength > 3 * 1024 * 1024) {
      return c.json({ success: false, error: 'Body out of bounds (max 3MB)' }, 400);
    }

    const declaredType = (c.req.header('Content-Type') || '').split(';')[0].trim().toLowerCase();
    const contentType = format === 'webp' ? 'image/webp' : declaredType;
    const allowedOriginalType =
      /^image\//i.test(contentType) ||
      /^video\//i.test(contentType) ||
      /^font\//i.test(contentType) ||
      ['application/octet-stream', 'image/svg+xml'].includes(contentType);
    if (!contentType || !allowedOriginalType) {
      return c.json({ success: false, error: 'Only public media content types are accepted' }, 400);
    }

    const r2Key = publicMediaR2Key({
      signature,
      siteId,
      sourceHash,
      width,
      quality,
      format: extension,
    });
    await bucket.put(r2Key, body, {
      httpMetadata: {
        contentType,
        cacheControl: PUBLIC_MEDIA_PUBLIC_CACHE_CONTROL,
      },
    });

    const baseUrl = c.env.PUBLIC_MEDIA_CDN_BASE_URL || 'https://objects.wpinstant.dev';
    const publicUrl = publicMediaPublicUrl(baseUrl, r2Key);
    return c.json({ success: true, data: { key: r2Key, publicUrl } }, 200, {
      'Cache-Control': 'no-store',
    });
  }
);

/* ------------------------------------------------------------------ */
/* Zero-DNS media CDN (R2-backed, signed, 302-to-origin on miss)       */
/* ------------------------------------------------------------------ */

const MEDIA_TYPES: Record<string, string> = {
  webp: 'image/webp',
  orig: 'application/octet-stream',
  raw: 'application/octet-stream',
};

/**
 * Resolve a serving content type for raw/orig objects from the source URL
 * extension. Origin HEAD responses may omit Content-Type, and the previous
 * hardcoded video/mp4 default made proxied stylesheets fail the browser's
 * strict MIME check (a blocking <link rel=stylesheet> served as video/mp4
 * is discarded). The extension map keeps CSS/JS/fonts/videos/images correct
 * regardless of what the origin reports.
 */
export function contentTypeFor(url: string, fallback: string): string {
  const path = url.split('?')[0].split('#')[0].toLowerCase();
  if (path.endsWith('.css')) return 'text/css; charset=utf-8';
  if (path.endsWith('.js') || path.endsWith('.mjs')) return 'text/javascript';
  if (path.endsWith('.mp4') || path.endsWith('.m4v')) return 'video/mp4';
  if (path.endsWith('.webm')) return 'video/webm';
  if (path.endsWith('.mov')) return 'video/quicktime';
  if (path.endsWith('.woff2')) return 'font/woff2';
  if (path.endsWith('.woff')) return 'font/woff';
  if (path.endsWith('.png')) return 'image/png';
  if (path.endsWith('.jpg') || path.endsWith('.jpeg')) return 'image/jpeg';
  if (path.endsWith('.webp')) return 'image/webp';
  if (path.endsWith('.avif')) return 'image/avif';
  if (path.endsWith('.gif')) return 'image/gif';
  if (path.endsWith('.svg')) return 'image/svg+xml';
  return fallback;
}

function b64urlDecode(u: string): string {
  const pad = '='.repeat((4 - (u.length % 4)) % 4);
  const b64 = u.replace(/-/g, '+').replace(/_/g, '/') + pad;
  return atob(b64);
}

function b64urlEncode(s: string): string {
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * Serve a content type for a stored object. Stored httpMetadata wins UNLESS
 * it contradicts the source extension (legacy objects were written with a
 * hardcoded video/mp4 content type for everything) or is generic.
 * Extension mapping then keeps CSS/JS/fonts/images correct regardless of
 * what the origin reported — a stylesheet served as video/mp4 is discarded
 * by the browser's strict MIME check.
 */
function servingContentType(src: string, stored: string | undefined, fallback: string): string {
  const path = src.split('?')[0].split('#')[0].toLowerCase();
  const byExtension = contentTypeFor(src, '');
  if (
    stored &&
    !/octet-stream/i.test(stored) &&
    !(byExtension && /^video\//i.test(stored) && !/^video\//i.test(byExtension))
  ) {
    return stored;
  }
  return byExtension || stored || fallback;
}

/**
 * Rewrite absolute image/font url() references inside a CSS body to signed
 * CDN media URLs (same HMAC contract as the plugin: u|w|f|siteId). Lets
 * proxied stylesheets (localized font packages, own-host Elementor sheets)
 * survive origin purges: the CSS and every referenced asset become immutable
 * R2-backed edge objects. data:/blob:/fragment/already-CDN URLs are skipped;
 * signing is local HMAC computation — no subrequests.
 */
const CSS_ASSET_EXT = /\.(?:woff2?|ttf|otf|eot|png|jpe?g|gif|webp|avif|svg|mp4|webm|mov|m4v)(?:[?#]|$)/i;
async function rewriteCssAssetUrls(css: string, siteId: string, secret: string, cdnBase: string): Promise<string> {
  if (!css || css.indexOf('url(') === -1) return css;
  const rewrite = async (m: string[]): Promise<string> => {
    const raw = m[2].trim().replace(/^['"]|['"]$/g, '');
    if (!raw) return m[0];
    let url = raw;
    try {
      url = decodeURIComponent(raw);
    } catch {
      /* keep raw — malformed escapes stay untouched */
    }
    if (!/^https?:\/\//i.test(url)) return m[0]; // relative/data/fragment stay as-is
    if (url.includes('/api/v1/assets/')) return m[0]; // already ours
    if (!CSS_ASSET_EXT.test(url)) return m[0];
    const f = /\.(?:woff2?|ttf|otf|eot|svg)(?:[?#]|$)/i.test(url) ? 'orig' : 'webp';
    const w = 0;
    const u = b64urlEncode(url);
    const sig = (await hmacHex(secret, `${u}|${w}|${f}|${siteId}`)).slice(0, 32);
    const hash = (await sha256(url)).slice(0, 24);
    return `url(${m[1]}${cdnBase}/api/v1/assets/media/${siteId}/${hash}?u=${u}&w=${w}&f=${f}&q=82&s=${sig}${m[1]})`;
  };
  const matches = [...css.matchAll(/url\((\s*['"]?)([^)'"]+)['"]?\s*\)/gi)];
  if (matches.length === 0) return css;
  let out = css;
  // Replace from the end so earlier offsets stay valid.
  for (let i = matches.length - 1; i >= 0; i--) {
    const m = matches[i];
    const replaced = await rewrite(m as unknown as string[]);
    if (replaced !== m[0]) {
      out = out.slice(0, m.index) + replaced + out.slice((m.index ?? 0) + m[0].length);
    }
  }
  return out;
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

const PUBLIC_MEDIA_SIGNATURE_PARTS = /^v1\|(.+)\|([0-9a-f]{32})\|([0-9]{1,4})\|([0-9]{2,3})\|(webp|orig)$/i;
const PUBLIC_MEDIA_PUBLIC_CACHE_CONTROL = 'public, max-age=31536000, immutable';

/**
 * Public media objects are addressed by the exact browser path. The signature
 * is therefore part of the R2 key: a direct R2 custom domain cannot execute
 * code to validate query parameters, but it will only expose an object when
 * the caller already knows this unguessable path.
 */
function publicMediaR2Key(input: {
  signature: string;
  siteId: string;
  sourceHash: string;
  width: number;
  quality: number;
  format: string;
}): string {
  const { signature, siteId, sourceHash, width, quality, format } = input;
  return `v1/${signature}/${siteId}/${sourceHash}/${width}/${quality}.${format}`;
}

function publicMediaPublicUrl(baseUrl: string, r2Key: string): string {
  return `${baseUrl.replace(/\/+$/, '')}/${r2Key}`;
}

/** Site callback secret (for URL signing), cached in KV for 1h. Only returned if active. */
async function siteSecret(
  c: any,
  siteId: string
): Promise<{ ok: true; secret: string | null } | { ok: false }> {
  const kvKey = `msecret:${siteId}`;
  // KV read is best-effort: on a transient KV error fall through to D1
  // instead of failing the whole asset request (a burst of first-load media
  // requests once 500'd wholesale on exactly this path).
  let cached: string | null = null;
  try {
    cached = await c.env.KV.get(kvKey);
  } catch (e) {
    console.warn('[assets] msecret KV read failed, falling back to D1', siteId, e);
  }
  if (cached) return { ok: true, secret: cached };

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const row = (await c.env.DB.prepare('SELECT callback_secret, is_active FROM sites WHERE id = ?')
        .bind(siteId)
        .first()) as { callback_secret: string | null; is_active: number } | null;
      if (!row?.callback_secret || row.is_active !== 1) return { ok: true, secret: null };
      try {
        await c.env.KV.put(kvKey, row.callback_secret, { expirationTtl: 3600 });
      } catch (e) {
        console.warn('[assets] msecret KV write failed (non-fatal)', siteId, e);
      }
      return { ok: true, secret: row.callback_secret };
    } catch (e) {
      if (attempt === 1) {
        console.error('[assets] site secret lookup failed after retry', siteId, e);
        return { ok: false };
      }
    }
  }
  return { ok: false };
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

  const sec = await siteSecret(c, siteId);
  if (!sec.ok) {
    c.header('Cache-Control', 'no-store');
    return {
      ok: false,
      response: c.json({ success: false, error: 'Secret lookup temporarily unavailable' }, 502),
    };
  }
  if (!sec.secret) {
    return { ok: false, response: c.json({ success: false, error: 'Site not found' }, 404) };
  }
  const secret = sec.secret;

  const expected = (await hmacHex(secret, `${u}|${w}|${f}|${siteId}`)).slice(0, 32);
  if (!timingSafeEq(expected, s)) {
    return { ok: false, response: c.json({ success: false, error: 'Invalid signature' }, 403) };
  }

  let src: string;
  try {
    // The plugin base64url-encodes the original URL without decoding it first.
    // decodeURIComponent() here changes legitimate escapes such as %2F and
    // %26 inside the origin URL, producing a different resource than the one
    // that was signed.
    src = b64urlDecode(u);
  } catch {
    return { ok: false, response: c.json({ success: false, error: 'Invalid source' }, 400) };
  }
  if (!/^https?:\/\//i.test(src)) {
    return { ok: false, response: c.json({ success: false, error: 'Invalid source URL' }, 400) };
  }

  return { ok: true, src };
}

/**
 * Stream an origin raw response to the visitor while persisting it: a
 * streaming clone into R2 when the origin declared its length (≤100MB),
 * a buffered put when it didn't (≤25MB — chunked origins used to never
 * persist, re-fetching the origin on every single request). The visitor-
 * facing response is immutable because the artifact is content-pinned.
 */
async function serveRawStream(
  origin: Response,
  src: string,
  siteId: string,
  c: any,
  r2Key: string,
  cache: Cache,
  cacheKey: Request,
  declaredLength = Number(origin.headers.get('content-length') || '0')
): Promise<Response> {
  const contentType = servingContentType(src, origin.headers.get('content-type') || undefined, 'application/octet-stream');
  const headers: Record<string, string> = {
    'Content-Type': contentType,
    'Cache-Control': 'public, max-age=31536000, immutable',
    'Accept-Ranges': 'bytes',
    'Access-Control-Allow-Origin': '*',
    'X-WP-Instant-Media': 'MISS',
  };

  if (declaredLength > 0 && origin.body) {
    headers['Content-Length'] = String(declaredLength);
    const cachedBody = origin.clone().body;
    if (cachedBody) {
      defer(c, 
        c.env.ASSETS_BUCKET.put(r2Key, cachedBody as any, { httpMetadata: { contentType } }).catch(() => {})
      );
    }
    const response = new Response(origin.body, { status: 200, headers });
    defer(c, cache.put(cacheKey, response.clone()).catch(() => {}));
    return response;
  }

  // Unknown length: buffer up to 25MB, persist, serve the buffered bytes.
  const bytes = await origin.arrayBuffer().catch(() => null);
  if (!bytes || bytes.byteLength === 0) {
    return new Response(null, { status: 502, headers: { 'X-WP-Instant-Media': 'EMPTY' } });
  }
  if (bytes.byteLength > 25 * 1024 * 1024) {
    return new Response(bytes, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Content-Length': String(bytes.byteLength),
        'Cache-Control': 'public, max-age=60',
        'Access-Control-Allow-Origin': '*',
        'X-WP-Instant-Media': 'PASS-OVERSIZE',
      },
    });
  }
  defer(c, 
    c.env.ASSETS_BUCKET.put(r2Key, bytes, { httpMetadata: { contentType } }).catch(() => {})
  );
  headers['Content-Length'] = String(bytes.byteLength);
  const response = new Response(bytes, { status: 200, headers });
  defer(c, cache.put(cacheKey, response.clone()).catch(() => {}));
  return response;
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

  // The signature only covers u|w|f|siteId — bind the path hash to the
  // signed source so a valid signature cannot be transplanted onto another
  // artifact key. The plugin computes hash = sha256(src)[0:24].
  const expectedHash = (await sha256(verified.src)).slice(0, 24);
  if (!timingSafeEq(urlHash, expectedHash)) {
    return c.json({ success: false, error: 'Invalid artifact identity' }, 403);
  }

  const width = Math.max(0, Math.min(4000, parseInt(w, 10) || 0));
  const quality = Math.max(40, Math.min(100, parseInt(q, 10) || 82));
  const r2Key = `sites/${siteId}/media/${urlHash}_${width}_${quality}.${f}`;

  // AVIF upgrade: when the browser accepts it we can serve an even smaller
  // variant — but the R2 key implies the requested format, so AVIF lives
  // only in the Cache API as a per-client variant.
  const accept = c.req.header('accept') || '';
  const wantsAvif = f === 'webp' && /image\/avif/i.test(accept);

  // Range request support (video seeking) against an R2 hit.
  const rangeHeader = c.req.header('range');
  if (rangeHeader) {
    const meta = await c.env.ASSETS_BUCKET.head(r2Key).catch(() => null);
    if (meta) {
      const size = meta.size;
      const match = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader.trim());
      if (match && size > 0) {
        let start: number;
        let end: number;
        if (match[1] === '') {
          const suffixLength = Number(match[2]);
          if (!Number.isFinite(suffixLength) || suffixLength <= 0) {
            return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${size}` } });
          }
          start = Math.max(0, size - suffixLength);
          end = size - 1;
        } else {
          start = Number(match[1]);
          end = match[2] === '' ? size - 1 : Number(match[2]);
          if (!Number.isFinite(start) || !Number.isFinite(end) || start >= size || end < start) {
            return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${size}` } });
          }
          end = Math.min(end, size - 1);
        }
        const partial = (await c.env.ASSETS_BUCKET.get(r2Key, {
          range: { offset: start, length: end - start + 1 },
        } as any)) as { body: ReadableStream } | null;
        if (partial) {
          c.status(206);
          c.header('Content-Range', `bytes ${start}-${end}/${size}`);
          c.header('Accept-Ranges', 'bytes');
          c.header('Content-Length', String(end - start + 1));
          c.header('Content-Type', servingContentType(verified.src, meta.httpMetadata?.contentType, 'application/octet-stream'));
          c.header('Cache-Control', 'public, max-age=31536000, immutable');
          c.header('Access-Control-Allow-Origin', '*');
          c.header('X-WP-Instant-Media', 'RANGE-HIT');
          return c.body(partial.body as any);
        }
      }
    }
  }

  // Cache API fast path (per URL + format variant). Range requests are
  // handled above so a cached full response can never satisfy a partial one.
  // Non-ok entries are negative-cached origin failures (60s TTL from their
  // Cache-Control) — returning them spares the origin the retry storm.
  // A no-op shim keeps the rest of the handler simple when the Cache API is
  // unavailable (plain Node test environments).
  const cache = typeof caches !== 'undefined'
    ? await caches.open('wpins-media-v1')
    : ({
        match: async () => undefined,
        put: async () => undefined,
        delete: async () => false,
      } as unknown as Cache);
  const cacheKey = new Request(c.req.url + (wantsAvif ? '&fmt=avif' : ''));
  const cachedHit = await cache.match(cacheKey).catch(() => null);
  if (cachedHit && (cachedHit.ok || cachedHit.status >= 400)) {
    if (cachedHit.ok && wantsAvif && !cachedHit.headers.get('x-wpins-avif')) {
      // A webp-only entry cached before the AVIF variant existed: keep
      // looking so the AVIF path below can fill its own R2 key.
    } else {
      return cachedHit;
    }
  }

  // AVIF variants are persisted under a suffixed key so a warm variant
  // survives colo eviction instead of being re-encoded per colo forever.
  if (wantsAvif) {
    const avifObject = await c.env.ASSETS_BUCKET.get(`${r2Key}.avif`).catch(() => null);
    if (avifObject) {
      const avifHit = new Response(avifObject.body as any, {
        headers: {
          'Content-Type': 'image/avif',
          ...(avifObject.size > 0 ? { 'Content-Length': String(avifObject.size) } : {}),
          'Cache-Control': 'public, max-age=31536000, immutable',
          'Access-Control-Allow-Origin': '*',
          Vary: 'Accept',
          'X-WP-Instant-Media': 'HIT-AVIF',
          'X-WPins-Avif': '1',
        },
      });
      defer(c, cache.put(cacheKey, avifHit.clone()).catch(() => {}));
      return avifHit;
    }
  }

  const object = await c.env.ASSETS_BUCKET.get(r2Key);
  if (object) {
    // Conditional request support: R2's stored ETag lets repeat visits 304
    // instead of re-downloading (matters for the short-TTL fallback paths'
    // siblings and for proxies that strip immutable).
    const etag = `"${object.httpEtag}"`;
    if (c.req.header('if-none-match') === etag) {
      object.body?.cancel().catch(() => {});
      return new Response(null, {
        status: 304,
        headers: {
          ETag: etag,
          'Cache-Control': 'public, max-age=31536000, immutable',
          'Access-Control-Allow-Origin': '*',
          ...(wantsAvif ? { Vary: 'Accept' } : {}),
        },
      });
    }
    const hit = new Response(object.body as any, {
      headers: {
        'Content-Type': servingContentType(verified.src, object.httpMetadata?.contentType, MEDIA_TYPES[f] || 'application/octet-stream'),
        ...(object.size > 0 ? { 'Content-Length': String(object.size) } : {}),
        'Cache-Control': 'public, max-age=31536000, immutable',
        'Accept-Ranges': 'bytes',
        ETag: etag,
        'Access-Control-Allow-Origin': '*',
        ...(wantsAvif ? { Vary: 'Accept' } : {}),
        'X-WP-Instant-Media': 'HIT',
      },
    });
    defer(c, cache.put(cacheKey, hit.clone()).catch(() => {}));
    return hit;
  }

  /* ------------------------- MISS path ------------------------- */

  // MISSes trigger origin fetches + edge transcoding — throttle per site so
  // a hostile crawler can't burn CPU through freshly-minted signed URLs.
  const allowed = await checkRateLimit(c.env, 'media-miss', siteId, 120, 60);
  if (!allowed) {
    return c.json({ success: false, error: 'Rate limit exceeded' }, 429);
  }

  // Raw assets include CSS and JavaScript as well as video. A redirect on a
  // cold stylesheet/script adds a second origin request and can make crawler
  // audits fail before the artifact is warmed. Proxy the first response from
  // the Worker, then persist a bounded clone. Chunked/unknown-length origins
  // are buffered (≤25MB) so they persist too — streaming-only persistence
  // left every request on those origins re-fetching forever.
  if (f === 'raw') {
    const originFailure = async (upstreamStatus: number): Promise<Response> => {
      const body = c.json({ success: false, error: 'Origin asset unavailable' }, upstreamStatus as ContentfulStatusCode, {
        // Mandatory: the Cache API does not expire headerless entries — a
        // missing TTL would poison this URL with a stale failure forever.
        'Cache-Control': 'public, max-age=60',
        'Access-Control-Allow-Origin': '*',
      });
      // Negative-cache origin failures for 60s so a burst of visitors (or a
      // page with the same missing sheet referenced 5×) doesn't hammer the
      // origin once per request.
      defer(c, cache.put(cacheKey, body.clone()).catch(() => {}));
      return body;
    };

    // Video seeking on a cold object: forward Range to the origin and pass
    // the 206 straight through (no R2 fill — partial bytes must never be
    // stored under the full-object key).
    const rangeHeader = c.req.header('range');
    if (rangeHeader) {
      const ranged = await fetch(verified.src, { headers: { Range: rangeHeader }, signal: AbortSignal.timeout(8000) }).catch(() => null);
      if (ranged && (ranged.status === 206 || ranged.status === 200) && ranged.body) {
        return new Response(ranged.body, {
          status: ranged.status,
          headers: {
            'Content-Type': servingContentType(verified.src, ranged.headers.get('content-type') || undefined, 'application/octet-stream'),
            ...(ranged.headers.get('content-range') ? { 'Content-Range': ranged.headers.get('content-range')! } : {}),
            ...(ranged.headers.get('content-length') ? { 'Content-Length': ranged.headers.get('content-length')! } : {}),
            'Accept-Ranges': 'bytes',
            'Cache-Control': 'public, max-age=60',
            'Access-Control-Allow-Origin': '*',
            'X-WP-Instant-Media': 'RANGE-MISS',
          },
        });
      }
      // Origin ignored/refused Range: fall through to the full GET below.
    }

    const origin = await fetch(verified.src, { signal: AbortSignal.timeout(8000) }).catch(() => null);
    if (!origin || !origin.ok || !origin.body) {
      const upstreamStatus = origin && origin.status >= 400 && origin.status < 600 ? origin.status : 502;
      return originFailure(upstreamStatus);
    }

    const declaredLength = Number(origin.headers.get('content-length') || '0');
    const contentType = servingContentType(
      verified.src,
      origin.headers.get('content-type') || undefined,
      'application/octet-stream'
    );
    if (declaredLength > 100 * 1024 * 1024) {
      return new Response(origin.body, {
        status: origin.status,
        headers: {
          'Content-Type': contentType,
          'Cache-Control': 'public, max-age=60',
          'Access-Control-Allow-Origin': '*',
          'X-WP-Instant-Media': 'PASS-OVERSIZE',
        },
      });
    }

    // CSS: rewrite absolute image/font url()s to signed CDN URLs so the
    // sheet (and everything it references) becomes edge-immutable. Applied
    // on fill only — stored objects keep their rewritten bodies.
    let fillBody: ArrayBuffer | ReadableStream = origin.body;
    let fillLength = declaredLength;
    const isCss = /text\/css/i.test(contentType);
    if (isCss) {
      try {
        const secret2 = await siteSecret(c, siteId);
        if (secret2.ok && secret2.secret) {
          const cssText = await origin.text();
          const rewritten = await rewriteCssAssetUrls(
            cssText,
            siteId,
            secret2.secret,
            new URL(c.req.url).origin
          );
          fillBody = new TextEncoder().encode(rewritten) as unknown as ArrayBuffer;
          fillLength = (fillBody as unknown as Uint8Array).byteLength;
          const cssResponse = new Response(fillBody, {
            status: 200,
            headers: {
              'Content-Type': contentType,
              'Content-Length': String(fillLength),
              'Cache-Control': 'public, max-age=31536000, immutable',
              'Access-Control-Allow-Origin': '*',
              'X-WP-Instant-Media': 'MISS-CSS',
            },
          });
          defer(c, 
            Promise.all([
              c.env.ASSETS_BUCKET.put(r2Key, fillBody as any, { httpMetadata: { contentType } }).catch(() => {}),
              cache.put(cacheKey, cssResponse.clone()).catch(() => {}),
            ])
          );
          return cssResponse;
        }
      } catch (e) {
        console.warn('[assets] css rewrite failed, serving raw', e);
        // Fall through to the generic raw path with the consumed body —
        // re-fetch instead of serving a half-processed stream.
        const refetch = await fetch(verified.src, { signal: AbortSignal.timeout(8000) }).catch(() => null);
        if (refetch && refetch.ok && refetch.body) {
          return serveRawStream(refetch, verified.src, siteId, c, r2Key, cache, cacheKey);
        }
        return originFailure(502);
      }
    }

    return serveRawStream(origin, verified.src, siteId, c, r2Key, cache, cacheKey, fillLength);
  }

  // Images: fetch the origin bytes once, then optimize AT THE EDGE.
  const srcRes = await fetch(verified.src, {
    headers: { Accept: 'image/avif,image/webp,image/*,*/*;q=0.8' },
    cf: { cacheKey: verified.src } as any,
    signal: AbortSignal.timeout(8000),
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

  // Raster cold fills use Cloudflare Images. The binding accepts the origin
  // stream (up to its documented 20MB input limit) and performs decode,
  // resize, and transcode outside the Worker JS heap. This prevents the
  // compressed-but-huge-pixel-dimension OOM case that WASM cannot solve.
  if (c.env.IMAGES && f !== 'orig') {
    const imagesBinding = c.env.IMAGES;
    const sourcePath = verified.src.split('?')[0].split('#')[0].toLowerCase();
    const isVectorOrGif =
      /image\/(svg\+xml|gif)/i.test(srcType) ||
      /\.(?:svg|gif)(?:[?#]|$)/i.test(sourcePath);

    if (!isVectorOrGif) {
      // This guard is deliberately larger only because Images itself owns the
      // input limit. Unknown/chunked lengths are delegated to Images; if its
      // runtime rejects an oversized stream we use the short-lived redirect.
      if (contentLength > 20 * 1024 * 1024) {
        return new Response(null, {
          status: 302,
          headers: {
            Location: verified.src,
            'Cache-Control': 'public, max-age=300',
            'Access-Control-Allow-Origin': '*',
            'X-WP-Instant-Media': 'PASS-OVERSIZE',
          },
        });
      }

      try {
        if (!srcRes.body) throw new Error('Origin response has no body');
        const image = imagesBinding.input(srcRes.body);
        if (width > 0) {
          image.transform({ width, fit: 'scale-down' });
        }
        const outputFormat = wantsAvif ? 'image/avif' : 'image/webp';
        const { response: outputResponseFactory } = await image.output({
          format: outputFormat,
          quality,
          anim: false,
        });
        const generated = await outputResponseFactory();
        if (!generated.ok || !generated.body) {
          throw new Error(`Images binding returned ${generated.status}`);
        }

        const optimizedResponse = new Response(generated.body, {
          status: 200,
          headers: {
            'Content-Type': outputFormat,
            'Cache-Control': 'public, max-age=31536000, immutable',
            'Access-Control-Allow-Origin': '*',
            ...(wantsAvif ? { Vary: 'Accept' } : {}),
            ...(wantsAvif ? { 'X-WPins-Avif': '1' } : {}),
            'X-WP-Instant-Media': 'EDGE-IMAGES',
            'X-WP-Instant-Engine': 'images-binding',
          },
        });
        const r2Copy = optimizedResponse.clone();
        const cacheCopy = optimizedResponse.clone();
        defer(
          c,
          Promise.all([
            c.env.ASSETS_BUCKET.put(
              wantsAvif ? `${r2Key}.avif` : r2Key,
              r2Copy.body as any,
              { httpMetadata: { contentType: outputFormat } }
            ).catch(() => {}),
            cache.put(cacheKey, cacheCopy).catch(() => {}),
          ])
        );
        return optimizedResponse;
      } catch (err) {
        console.warn('[Media] Images binding failed, serving original redirect:', err);
        // srcRes.body has already been consumed, so do not retry WASM (it
        // would require buffering exactly the class of input that caused the
        // OOM). A short-TTL redirect keeps a transient Images failure from
        // being pinned at the edge or permanently breaking the page image.
        return new Response(null, {
          status: 302,
          headers: {
            Location: verified.src,
            'Cache-Control': 'public, max-age=60',
            'Access-Control-Allow-Origin': '*',
            'X-WP-Instant-Media': 'IMAGE-BINDING-FAILED',
            'X-WP-Instant-Engine': 'images-binding-failed',
          },
        });
      }
    }
  }

  // Vector/animated formats are already optimal: store + serve untouched.
  const isVectorOrGif = /image\/(svg\+xml|gif)/i.test(srcType) || /\.svg(?:[?#]|$)/i.test(verified.src);
  if (isVectorOrGif || f === 'orig') {
    const ct = isVectorOrGif && srcType ? srcType : srcType || 'application/octet-stream';
    defer(c, 
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
    defer(c, cache.put(cacheKey, passthrough.clone()).catch(() => {}));
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
      // plugin-compatible artifact). AVIF variants get a suffixed key so a
      // warm encode is reused across colos instead of re-running the WASM
      // encoder after every eviction.
      if (outFormat === f) {
        defer(c, 
          c.env.ASSETS_BUCKET.put(r2Key, body, {
            httpMetadata: { contentType: `image/${outFormat}` },
          }).catch(() => {})
        );
      } else if (outFormat === 'avif') {
        defer(c, 
          c.env.ASSETS_BUCKET.put(`${r2Key}.avif`, body, {
            httpMetadata: { contentType: 'image/avif' },
          }).catch(() => {})
        );
      }
      const response = new Response(body, {
        headers: {
        'Content-Type': `image/${outFormat}`,
        'Cache-Control': 'public, max-age=31536000, immutable',
        'Access-Control-Allow-Origin': '*',
        ...(wantsAvif ? { Vary: 'Accept' } : {}),
        ...(wantsAvif ? { 'X-WPins-Avif': '1' } : {}),
        'X-WP-Instant-Media': 'EDGE-OPT',
        },
      });
      defer(c, cache.put(cacheKey, response.clone()).catch(() => {}));
      return response;
    }
  } catch (err) {
    console.warn('[Media] WASM optimize failed, serving original:', err);
  }

  // Optimization failed: serve the original bytes with a short TTL. The
  // bytes are deliberately NOT persisted — an original stored under the
  // derivative key would be served immutable on the next HIT even after the
  // plugin's real derivative PUT landed.
  return new Response(srcBytes, {
    headers: {
      'Content-Type': contentTypeFor(verified.src, srcType || 'application/octet-stream'),
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

  // Same identity binding as the GET route: path hash must be sha256(src)[0:24].
  const expectedHash = (await sha256(verified.src)).slice(0, 24);
  if (!timingSafeEq(urlHash, expectedHash)) {
    return c.json({ success: false, error: 'Invalid artifact identity' }, 403);
  }

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

  // The upload overwrites a mutable key: drop any cached variant (including
  // the AVIF cache-only variant) so the next GET sees the new bytes.
  const cache = await caches.open('wpins-media-v1').catch(() => null);
  if (cache) {
    defer(c, 
      Promise.all([
        cache.delete(new Request(c.req.url)).catch(() => false),
        cache.delete(new Request(c.req.url + '&fmt=avif')).catch(() => false),
      ])
    );
  }

  return c.json({ success: true, data: { key: r2Key, bytes: body.byteLength } });
});
