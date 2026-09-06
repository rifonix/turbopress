import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Hono } from 'hono';
import { createHmac, createHash } from 'node:crypto';
import { createTestEnv } from '../test-helpers/mock-env.js';
import { assetRoutes } from './assets.js';
import type { Env, AppVariables } from '../types/env.js';

// In-memory R2 with retention, head() and range reads. The shared mock's
// ASSETS_BUCKET is a recording stub without retention, so these tests bring
// their own to exercise cold -> warm transitions for real.
function createMemoryR2() {
  const store = new Map<string, { bytes: Uint8Array; httpMetadata: any }>();
  return {
    store,
    async put(key: string, body: any, opts?: any) {
      const bytes = new Uint8Array(await new Response(body).arrayBuffer());
      store.set(key, { bytes, httpMetadata: opts?.httpMetadata ?? {} });
      return {};
    },
    async head(key: string) {
      const o = store.get(key);
      return o ? { size: o.bytes.length, httpMetadata: o.httpMetadata } : null;
    },
    async get(key: string, opts?: any) {
      const o = store.get(key);
      if (!o) return null;
      let bytes = o.bytes;
      const range = opts?.range;
      if (range && typeof range.offset === 'number') {
        bytes = bytes.slice(range.offset, range.length ? range.offset + range.length : undefined);
      }
      return { body: new Response(bytes as unknown as ArrayBuffer).body, httpMetadata: o.httpMetadata };
    },
  } as any;
}

function buildApp(env: Env, pending: Promise<unknown>[]) {
  const app = new Hono<{ Bindings: Env; Variables: AppVariables }>();
  app.route('/api/v1/assets', assetRoutes);
  return {
    fetch: (req: Request) =>
      app.fetch(req, env, {
        // Capture waitUntil work so tests can await the R2 fill explicitly.
        waitUntil: (p: Promise<unknown>) => pending.push(p),
        passThroughOnException: () => {},
      } as any),
  };
}

const SITE_ID = 'site_1';
const SECRET = 'test-callback-secret';

async function seedSite(env: any) {
  await env.DB.prepare(
    'INSERT OR IGNORE INTO users (id, email, created_at, updated_at) VALUES (?, ?, unixepoch(), unixepoch())'
  )
    .bind('user_a', 'a@test.dev')
    .run();
  await env.DB.prepare(
    "INSERT INTO subscriptions (id, user_id, plan_id, status, max_sites, current_period_end, created_at, updated_at) VALUES ('sub_a', 'user_a', 'starter', 'active', 5, unixepoch() + 2592000, unixepoch(), unixepoch())"
  ).run();
  await env.DB.prepare(
    "INSERT INTO sites (id, user_id, subscription_id, domain, site_api_key_hash, callback_secret, config_json, is_active, created_at, updated_at) VALUES (?, 'user_a', 'sub_a', 'a.com', 'hash', ?, '{}', 1, unixepoch(), unixepoch())"
  )
    .bind(SITE_ID, SECRET)
    .run();
}

function signParams(u: string, w: string, f: string) {
  // Must match verifyMediaSignature: HMAC-SHA256 hex over u|w|f|siteId, truncated to 32 chars.
  return createHmac('sha256', SECRET).update(`${u}|${w}|${f}|${SITE_ID}`).digest('hex').slice(0, 32);
}

function urlHashFor(src: string) {
  // Must match the plugin: hash('sha256', $src) hex, first 24 chars.
  return createHash('sha256').update(src).digest('hex').slice(0, 24);
}

function mediaUrl(src: string, f = 'raw', w = '0', hash?: string) {
  // The plugin base64url-encodes the original URL directly (no percent-decoding).
  const u = Buffer.from(src).toString('base64url');
  const s = signParams(u, w, f);
  return `https://api.test/api/v1/assets/media/${SITE_ID}/${hash ?? urlHashFor(src)}?u=${u}&w=${w}&f=${f}&s=${s}`;
}

describe('media asset route — raw delivery without first-request redirects', () => {
  beforeEach(() => {
    // Cache API is not available under Node/vitest; force cold-cache misses
    // so the R2/origin paths run.
    vi.stubGlobal('caches', {
      open: async () => ({
        match: async () => undefined,
        put: async () => {},
        delete: async () => false,
      }),
    });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('cold raw MISS streams origin bytes with HTTP 200 — no 302 — and fills R2 in the background', async () => {
    const r2 = createMemoryR2();
    const env = createTestEnv({ ASSETS_BUCKET: r2 });
    await seedSite(env);
    const css = 'body{color:red}.hero{width:calc(100% - 2rem)}';
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(css, {
            status: 200,
            headers: { 'content-type': 'text/css', 'content-length': String(css.length) },
          })
      )
    );
    const pending: Promise<unknown>[] = [];
    const app = buildApp(env, pending);

    const res = await app.fetch(new Request(mediaUrl('https://a.com/wp-content/themes/x/style.css')));
    expect(res.status).toBe(200);
    expect(res.headers.get('location')).toBeNull();
    // CSS fills get url()-rewritten and carry the MISS-CSS marker.
    expect(res.headers.get('x-wp-instant-media')).toBe('MISS-CSS');
    expect(res.headers.get('content-type')).toContain('text/css');
    expect(await res.text()).toBe(css);

    await Promise.all(pending);
    const keys = [...r2.store.keys()];
    expect(keys.length).toBe(1);
    expect(keys[0]).toBe(`sites/${SITE_ID}/media/${urlHashFor('https://a.com/wp-content/themes/x/style.css')}_0_82.raw`);
    expect(r2.store.get(keys[0])!.httpMetadata.contentType).toContain('text/css');
    expect(Buffer.from(r2.store.get(keys[0])!.bytes).toString()).toBe(css);
  });

  it('warm HIT serves R2 bytes; extension-derived Content-Type beats missing or wrong legacy metadata', async () => {
    const r2 = createMemoryR2();
    const env = createTestEnv({ ASSETS_BUCKET: r2 });
    await seedSite(env);
    const src = 'https://a.com/style.css';
    const key = `sites/${SITE_ID}/media/${urlHashFor(src)}_0_82.raw`;
    // Legacy object stored with wrong metadata (the pre-fix behavior).
    r2.store.set(key, { bytes: new TextEncoder().encode('a{b:c}'), httpMetadata: { contentType: 'video/mp4' } });
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('origin must not be contacted on a warm HIT');
      })
    );
    const pending: Promise<unknown>[] = [];
    const app = buildApp(env, pending);

    const res = await app.fetch(new Request(mediaUrl(src)));
    expect(res.status).toBe(200);
    expect(res.headers.get('x-wp-instant-media')).toBe('HIT');
    expect(res.headers.get('content-type')).toContain('text/css');
    expect(await res.text()).toBe('a{b:c}');
  });

  it('metadata-less R2 object still gets the extension-derived Content-Type', async () => {
    const r2 = createMemoryR2();
    const env = createTestEnv({ ASSETS_BUCKET: r2 });
    await seedSite(env);
    const key = `sites/${SITE_ID}/media/${urlHashFor('https://a.com/style.css')}_0_82.raw`;
    r2.store.set(key, { bytes: new TextEncoder().encode('x{y:z}'), httpMetadata: {} });
    vi.stubGlobal('fetch', vi.fn());
    const pending: Promise<unknown>[] = [];
    const app = buildApp(env, pending);

    const res = await app.fetch(new Request(mediaUrl('https://a.com/style.css')));
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/css');
  });

  it('range requests against a warm object return 206 slices; unsatisfiable ranges return 416', async () => {
    const r2 = createMemoryR2();
    const env = createTestEnv({ ASSETS_BUCKET: r2 });
    await seedSite(env);
    const bytes = new TextEncoder().encode('0123456789');
    r2.store.set(`sites/${SITE_ID}/media/${urlHashFor('https://a.com/vid.mp4')}_0_82.raw`, { bytes, httpMetadata: {} });
    vi.stubGlobal('fetch', vi.fn());
    const pending: Promise<unknown>[] = [];
    const app = buildApp(env, pending);
    const url = mediaUrl('https://a.com/vid.mp4');

    const partial = await app.fetch(new Request(url, { headers: { range: 'bytes=2-4' } }));
    expect(partial.status).toBe(206);
    expect(partial.headers.get('content-range')).toBe('bytes 2-4/10');
    expect(partial.headers.get('content-length')).toBe('3');
    expect(await partial.text()).toBe('234');

    const suffix = await app.fetch(new Request(url, { headers: { range: 'bytes=-3' } }));
    expect(suffix.status).toBe(206);
    expect(suffix.headers.get('content-range')).toBe('bytes 7-9/10');
    expect(await suffix.text()).toBe('789');

    const unsatisfiable = await app.fetch(new Request(url, { headers: { range: 'bytes=99-' } }));
    expect(unsatisfiable.status).toBe(416);
    expect(unsatisfiable.headers.get('content-range')).toBe('bytes */10');
  });

  it('origin failure on a cold raw asset returns the origin status — never a redirect', async () => {
    const r2 = createMemoryR2();
    const env = createTestEnv({ ASSETS_BUCKET: r2 });
    await seedSite(env);
    vi.stubGlobal('fetch', vi.fn(async () => new Response('nope', { status: 404 })));
    const pending: Promise<unknown>[] = [];
    const app = buildApp(env, pending);

    const res = await app.fetch(new Request(mediaUrl('https://a.com/missing.css')));
    expect(res.status).toBe(404);
    expect(res.headers.get('location')).toBeNull();
    expect(r2.store.size).toBe(0);
  });

  it('CSS fill rewrites absolute asset url()s to signed CDN media URLs and persists the rewritten body', async () => {
    const r2 = createMemoryR2();
    const env = createTestEnv({ ASSETS_BUCKET: r2 });
    await seedSite(env);
    const fontSrc = 'https://a.com/wp-content/cache/wp-instant/fonts/abc/font-1.woff2';
    const css = `@font-face{font-family:X;src:url(${fontSrc}) format("woff2")}.hero{background:url("https://a.com/wp-content/uploads/2026/01/hero.jpg")}`;
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(css, {
            status: 200,
            headers: { 'content-type': 'text/css; charset=utf-8', 'content-length': String(css.length) },
          })
      )
    );
    const pending: Promise<unknown>[] = [];
    const app = buildApp(env, pending);

    const res = await app.fetch(new Request(mediaUrl('https://a.com/wp-content/cache/wp-instant/fonts/abc/fonts.css')));
    expect(res.status).toBe(200);
    expect(res.headers.get('x-wp-instant-media')).toBe('MISS-CSS');
    const body = await res.text();
    expect(body).toContain(`/api/v1/assets/media/${SITE_ID}/${urlHashFor(fontSrc)}`);

    await Promise.all(pending);
    // The persisted object must be the REWRITTEN css, and both referenced
    // assets must carry valid signatures (u|w|f|siteId HMAC).
    const storedKey = `sites/${SITE_ID}/media/${urlHashFor('https://a.com/wp-content/cache/wp-instant/fonts/abc/fonts.css')}_0_82.raw`;
    const stored = Buffer.from(r2.store.get(storedKey)!.bytes).toString();
    expect(stored).toBe(body);

    const fontUrlMatch = body.match(/https:\/\/[^)"' ]+\/api\/v1\/assets\/media\/[^)"' ]+\/[0-9a-f]{24}\?[^)"' ]+/);
    expect(fontUrlMatch).toBeTruthy();
    const rewritten = new URL(fontUrlMatch![0]);
    // Minted URLs are same-origin (the cdn host in production).
    expect(rewritten.origin).toBe('https://api.test');
    expect(rewritten.searchParams.get('f')).toBe('orig');
    expect(rewritten.searchParams.get('w')).toBe('0');
    const uFont = Buffer.from(fontSrc).toString('base64url');
    const expectedSig = createHmac('sha256', SECRET)
      .update(`${uFont}|0|orig|${SITE_ID}`)
      .digest('hex')
      .slice(0, 32);
    expect(rewritten.searchParams.get('s')).toBe(expectedSig);
  });

  it('chunked origin (no Content-Length) still persists to R2 — no perpetual MISS', async () => {
    const r2 = createMemoryR2();
    const env = createTestEnv({ ASSETS_BUCKET: r2 });
    await seedSite(env);
    const css = 'body{color:red}';
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(css, {
            status: 200,
            headers: { 'content-type': 'text/css' }, // no content-length
          })
      )
    );
    const pending: Promise<unknown>[] = [];
    const app = buildApp(env, pending);

    const res = await app.fetch(new Request(mediaUrl('https://a.com/chunked.css')));
    expect(res.status).toBe(200);
    expect(await res.text()).toBe(css);

    await Promise.all(pending);
    const keys = [...r2.store.keys()];
    expect(keys.length).toBe(1);
    expect(Buffer.from(r2.store.get(keys[0])!.bytes).toString()).toBe(css);
  });

  it('webp derivative of a png source serves image/webp from stored metadata — not image/png', async () => {
    const r2 = createMemoryR2();
    const env = createTestEnv({ ASSETS_BUCKET: r2 });
    await seedSite(env);
    const src = 'https://a.com/uploads/photo.png';
    const key = `sites/${SITE_ID}/media/${urlHashFor(src)}_800_82.webp`;
    r2.store.set(key, { bytes: new Uint8Array([1, 2, 3]), httpMetadata: { contentType: 'image/webp' } });
    const pending: Promise<unknown>[] = [];
    const app = buildApp(env, pending);

    const res = await app.fetch(new Request(mediaUrl(src, 'webp', '800')));
    expect(res.status).toBe(200);
    expect(res.headers.get('x-wp-instant-media')).toBe('HIT');
    expect(res.headers.get('content-type')).toBe('image/webp');
  });

  it('AVIF-capable requests reuse the persisted .avif R2 object', async () => {
    const r2 = createMemoryR2();
    const env = createTestEnv({ ASSETS_BUCKET: r2 });
    await seedSite(env);
    const src = 'https://a.com/uploads/photo.jpg';
    const avifKey = `sites/${SITE_ID}/media/${urlHashFor(src)}_800_82.webp.avif`;
    r2.store.set(avifKey, { bytes: new Uint8Array([9, 9]), httpMetadata: { contentType: 'image/avif' } });
    const pending: Promise<unknown>[] = [];
    const app = buildApp(env, pending);

    const res = await app.fetch(
      new Request(mediaUrl(src, 'webp', '800'), { headers: { accept: 'image/avif,image/webp,*/*' } })
    );
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('image/avif');
    expect(res.headers.get('x-wp-instant-media')).toBe('HIT-AVIF');
  });
});

describe('plugin update channel', () => {
  const mount = (bucket: any) => {
    const env = createTestEnv({ ASSETS_BUCKET: bucket });
    const app = new Hono<{ Bindings: Env; Variables: AppVariables }>();
    app.route('/api/v1/assets', assetRoutes);
    return {
      fetch: (req: Request) =>
        app.fetch(req, env, { waitUntil: () => {}, passThroughOnException: () => {} } as any),
    };
  };

  it('version endpoint reports custom metadata and 404s when unpublished', async () => {
    const app = mount({
      async head(key: string) {
        if (key !== 'plugin/wp-instant.zip') return null;
        return { customMetadata: { version: '1.16.1' }, uploaded: new Date('2026-09-06T00:00:00Z') };
      },
    } as any);

    const res = await app.fetch(new Request('https://api.test/api/v1/assets/plugin/version'));
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.data.version).toBe('1.16.1');
    expect(body.data.download).toBe('/api/v1/assets/plugin/download');

    const unpublished = mount({ async head() { return null; } } as any);
    const res404 = await unpublished.fetch(new Request('https://api.test/api/v1/assets/plugin/version'));
    expect(res404.status).toBe(404);
  });

  it('version endpoint degrades to null version without metadata (no bogus prompts)', async () => {
    const app = mount({
      async head() {
        return { customMetadata: {}, uploaded: new Date() };
      },
      async get() {
        return null;
      },
    } as any);

    const res = await app.fetch(new Request('https://api.test/api/v1/assets/plugin/version'));
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.data.version).toBeNull();
  });

  it('version endpoint falls back to the latest.json sidecar when metadata is absent', async () => {
    const app = mount({
      async head() {
        return { customMetadata: {}, uploaded: new Date('2026-09-06T05:00:00Z') };
      },
      async get(key: string) {
        if (key !== 'plugin/latest.json') return null;
        return { json: async () => ({ version: '1.17.0' }) };
      },
    } as any);

    const res = await app.fetch(new Request('https://api.test/api/v1/assets/plugin/version'));
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.data.version).toBe('1.17.0');
    expect(body.data.uploaded).toBe('2026-09-06T05:00:00.000Z');
  });
});
