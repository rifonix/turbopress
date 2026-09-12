import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { generateKeyPairSync, sign as nodeSign, createHash, createHmac } from 'node:crypto';
import { Hono } from 'hono';
import { createTestEnv } from '../test-helpers/mock-env.js';
import { authRoutes } from './auth.js';
import { optimizeRoutes } from './optimize.js';
import { siteRoutes } from './sites.js';
import { billingRoutes } from './billing.js';
import { assetRoutes } from './assets.js';
import { runSweeper } from '../services/maintenance.js';
import type { Env, AppVariables } from '../types/env.js';

function buildApp(env: Env) {
  const app = new Hono<{ Bindings: Env; Variables: AppVariables }>();
  app.route('/api/v1/auth', authRoutes);
  app.route('/api/v1/optimize', optimizeRoutes);
  app.route('/api/v1/sites', siteRoutes);
  app.route('/api/v1/billing', billingRoutes);
  app.route('/api/v1/assets', assetRoutes);
  return {
    fetch: (req: Request) => app.fetch(req, env, { waitUntil: () => {}, passThroughOnException: () => {} } as any),
  };
}

async function pairDomain(app: ReturnType<typeof buildApp>, userToken: string, domain: string) {
  return app.fetch(
    new Request('https://api.test/api/v1/auth/pair', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${userToken}` },
      body: JSON.stringify({
        domain,
        state: 'state-' + Math.random().toString(36).slice(2, 10),
        return_url: `https://${domain}/wp-admin/admin.php`,
      }),
    })
  );
}

async function seedSubscription(env: any, userId: string) {
  await env.DB.prepare(
    'INSERT OR IGNORE INTO users (id, email, created_at, updated_at) VALUES (?, ?, unixepoch(), unixepoch())'
  )
    .bind(userId, `${userId}@test.dev`)
    .run();
  await env.DB.prepare(
    "INSERT INTO subscriptions (id, user_id, plan_id, status, max_sites, current_period_end, created_at, updated_at) VALUES (?, ?, 'starter', 'active', 5, unixepoch() + 2592000, unixepoch(), unixepoch())"
  )
    .bind(`sub_${userId}`, userId)
    .run();
}

describe('Security regression tests (review criticals)', () => {
  beforeEach(() => {
    // No real network in tests: JWKS fetch rejects instantly → production
    // auth deterministically fails closed for invalid tokens.
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('C5: second user cannot hijack a paired domain (409, ownership WHERE)', async () => {
    const env = createTestEnv();
    const app = buildApp(env);
    await seedSubscription(env, 'user_alice');
    await seedSubscription(env, 'user_eve');

    const resA = await pairDomain(app, 'user_alice', 'victim.com');
    expect(resA.status).toBe(200);

    const resB = await pairDomain(app, 'user_eve', 'victim.com');
    expect(resB.status).toBe(409);
    const body = (await resB.json()) as any;
    expect(body.code).toBe('DOMAIN_OWNED_BY_OTHER_ACCOUNT');

    // Alice's key hash must be untouched
    const site = (await env.DB.prepare('SELECT user_id FROM sites WHERE domain = ?').bind('victim.com').first()) as any;
    expect(site.user_id).toBe('user_alice');
  });

  it('C6: optimization_jobs accepts needs_attention status (CHECK rebuilt)', async () => {
    const env = createTestEnv();
    await seedSubscription(env, 'user_a');
    await env.DB.prepare(
      "INSERT INTO sites (id, user_id, subscription_id, domain, site_api_key_hash, config_json, is_active, created_at, updated_at) VALUES ('site_1', 'user_a', 'sub_user_a', 'a.com', 'hash', '{}', 1, unixepoch(), unixepoch())"
    ).run();
    await env.DB.prepare(
      "INSERT INTO optimization_jobs (id, site_id, url, viewport, status, attempts, created_at) VALUES ('job_1', 'site_1', 'https://a.com/', 'mobile', 'queued', 0, unixepoch())"
    ).run();
    await env.DB.prepare(
      "UPDATE optimization_jobs SET status = 'needs_attention', error_message = 'challenge', completed_at = unixepoch() WHERE id = 'job_1'"
    ).run();
    const job = (await env.DB.prepare('SELECT status FROM optimization_jobs WHERE id = ?').bind('job_1').first()) as any;
    expect(job.status).toBe('needs_attention');
  });

  it('C4: dispatch rejects garbage/user_* tokens in production', async () => {
    const env = createTestEnv({ ENVIRONMENT: 'production' });
    const app = buildApp(env);
    const res = await app.fetch(
      new Request('https://api.test/api/v1/optimize/dispatch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer user_attacker' },
        body: JSON.stringify({ url: 'https://example.com/' }),
      })
    );
    expect(res.status).toBe(401);
  });

  it('C1: production ignores a forged X-Organization-Id on a verified JWT without an org claim', async () => {
    // Real RS256 keypair so verifyClerkJwt passes cryptographically in
    // production mode; the JWKS is pre-seeded into the KV cache.
    const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
    const kid = 'kid-' + Math.random().toString(36).slice(2);
    const jwk = { ...publicKey.export({ format: 'jwk' }), kid };

    const env = createTestEnv({ ENVIRONMENT: 'production' });
    await env.KV.put('clerk:jwks', JSON.stringify({ keys: [jwk] }));

    await seedSubscription(env, 'user_victim');
    await env.DB.prepare(
      "INSERT INTO sites (id, user_id, organization_id, subscription_id, domain, site_api_key_hash, config_json, is_active, created_at, updated_at) VALUES ('site_org', 'user_victim', 'org_victim', 'sub_user_victim', 'victim.com', 'hash', '{}', 1, unixepoch(), unixepoch())"
    ).run();

    // Verified JWT for user_mallory WITHOUT any org_id claim.
    const b64u = (s: string) => Buffer.from(s).toString('base64url');
    const header = b64u(JSON.stringify({ alg: 'RS256', kid }));
    const payload = b64u(JSON.stringify({ sub: 'user_mallory', exp: Math.floor(Date.now() / 1000) + 600 }));
    const signature = nodeSign('sha256', Buffer.from(`${header}.${payload}`), privateKey).toString('base64url');
    const jwt = `${header}.${payload}.${signature}`;

    const app = buildApp(env);
    const res = await app.fetch(
      new Request('https://api.test/api/v1/sites', {
        headers: { Authorization: `Bearer ${jwt}`, 'X-Organization-Id': 'org_victim' },
      })
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.data.some((s: any) => s.domain === 'victim.com')).toBe(false);
  });

  it('C1-dev: development harness still honors X-Organization-Id for user_* tokens', async () => {
    const env = createTestEnv(); // ENVIRONMENT: development
    await seedSubscription(env, 'user_victim');
    await env.DB.prepare(
      "INSERT INTO sites (id, user_id, organization_id, subscription_id, domain, site_api_key_hash, config_json, is_active, created_at, updated_at) VALUES ('site_org', 'user_victim', 'org_victim', 'sub_user_victim', 'victim.com', 'hash', '{}', 1, unixepoch(), unixepoch())"
    ).run();
    const app = buildApp(env);
    const res = await app.fetch(
      new Request('https://api.test/api/v1/sites', {
        headers: { Authorization: 'Bearer user_mallory', 'X-Organization-Id': 'org_victim' },
      })
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.data.some((s: any) => s.domain === 'victim.com')).toBe(true);
  });

  it('C4-rollback: queue-send failure deletes the job row and returns 503', async () => {
    const env = createTestEnv();
    await seedSubscription(env, 'user_a');
    await env.DB.prepare(
      "INSERT INTO sites (id, user_id, subscription_id, domain, site_api_key_hash, config_json, is_active, created_at, updated_at) VALUES ('site_1', 'user_a', 'sub_user_a', 'a.com', 'hash', '{}', 1, unixepoch(), unixepoch())"
    ).run();
    (env as any).OPTIMIZATION_QUEUE = {
      send: async () => {
        throw new Error('queue down');
      },
    };
    const app = buildApp(env);
    const res = await app.fetch(
      new Request('https://api.test/api/v1/optimize/dispatch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer user_a' },
        body: JSON.stringify({ url: 'https://a.com/' }),
      })
    );
    expect(res.status).toBe(503);
    const count = (await env.DB.prepare('SELECT COUNT(*) as c FROM optimization_jobs').bind().first()) as any;
    expect(count.c).toBe(0);
  });

  it('Serializer: GET /sites never leaks site_api_key_hash or callback_secret', async () => {
    const env = createTestEnv();
    await seedSubscription(env, 'user_a');
    await env.DB.prepare(
      "INSERT INTO sites (id, user_id, subscription_id, domain, site_api_key_hash, config_json, is_active, callback_secret, created_at, updated_at) VALUES ('site_1', 'user_a', 'sub_user_a', 'a.com', 'supersecret_hash', '{}', 1, 'supersecret_cb', unixepoch(), unixepoch())"
    ).run();
    const app = buildApp(env);
    const res = await app.fetch(
      new Request('https://api.test/api/v1/sites', {
        headers: { Authorization: 'Bearer user_a' },
      })
    );
    expect(res.status).toBe(200);
    const raw = await res.text();
    expect(raw).not.toContain('supersecret_hash');
    expect(raw).not.toContain('supersecret_cb');
  });

  it('Secret rotation: /verify drops the cached media secret so new signatures verify immediately', async () => {
    const env = createTestEnv();
    await seedSubscription(env, 'user_a');
    const OLD = 'old-callback-secret-0123456789abcdef';
    const NEW = 'new-callback-secret-0123456789abcdef';
    const apiKey = 'sk_live_rotationtestkey';
    const keyHash = createHash('sha256').update(apiKey).digest('hex');
    await env.DB.prepare(
      "INSERT INTO sites (id, user_id, subscription_id, domain, site_api_key_hash, callback_secret, config_json, is_active, created_at, updated_at) VALUES ('site_1', 'user_a', 'sub_user_a', 'a.com', ?, ?, '{}', 1, unixepoch(), unixepoch())"
    )
      .bind(keyHash, OLD)
      .run();

    // Simulate the 1h media-secret cache (msecret:*) warmed before rotation.
    await env.KV.put('msecret:site_1', OLD);

    const srcUrl = 'https://a.com/style.css';
    const u = Buffer.from(srcUrl).toString('base64url');
    const hash = createHash('sha256').update(srcUrl).digest('hex').slice(0, 24);
    const mediaUrlWith = (secret: string) => {
      const s = createHmac('sha256', secret).update(`${u}|0|raw|site_1`).digest('hex').slice(0, 32);
      return `https://api.test/api/v1/assets/media/site_1/${hash}?u=${u}&w=0&f=raw&s=${s}`;
    };

    const app = buildApp(env);
    // Pre-rotation, a URL signed with the NEW secret must fail.
    const before = await app.fetch(new Request(mediaUrlWith(NEW)));
    expect(before.status).toBe(403);

    const verify = await app.fetch(
      new Request('https://api.test/api/v1/auth/verify', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
          'X-Site-Domain': 'a.com',
        },
        body: JSON.stringify({ callback_secret: NEW }),
      })
    );
    expect(verify.status).toBe(200);

    // Post-rotation, the same URL verifies immediately (no 1h stale-cache
    // window). The origin fetch is stubbed offline, so the asset route ends
    // at 502 — anything except the 403 signature rejection proves the fix.
    const after = await app.fetch(new Request(mediaUrlWith(NEW)));
    expect(after.status).not.toBe(403);
  });

  it('Redeem: state exchanges for API key once, bound to domain', async () => {
    const env = createTestEnv();
    const app = buildApp(env);
    await env.KV.put(
      'pair_redeem:state123',
      JSON.stringify({ apiKey: 'sk_live_secret', siteId: 'site_1', domain: 'a.com' })
    );

    const ok = await app.fetch(
      new Request('https://api.test/api/v1/auth/redeem', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ state: 'state123', domain: 'a.com' }),
      })
    );
    expect(ok.status).toBe(200);
    const body = (await ok.json()) as any;
    expect(body.data.apiKey).toBe('sk_live_secret');

    // Single-use: replay is rejected
    const replay = await app.fetch(
      new Request('https://api.test/api/v1/auth/redeem', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ state: 'state123', domain: 'a.com' }),
      })
    );
    expect(replay.status).toBe(403);

    // Domain binding: state issued for b.com cannot redeem as a.com
    await env.KV.put(
      'pair_redeem:state456',
      JSON.stringify({ apiKey: 'sk_live_other', siteId: 'site_2', domain: 'b.com' })
    );
    const bad = await app.fetch(
      new Request('https://api.test/api/v1/auth/redeem', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ state: 'state456', domain: 'a.com' }),
      })
    );
    expect(bad.status).toBe(403);
  });

  it('Sweeper: zombie queued jobs older than 30min are reaped as failed', async () => {
    const env = createTestEnv();
    await seedSubscription(env, 'user_a');
    await env.DB.prepare(
      "INSERT INTO sites (id, user_id, subscription_id, domain, site_api_key_hash, config_json, is_active, created_at, updated_at) VALUES ('site_1', 'user_a', 'sub_user_a', 'a.com', 'hash', '{}', 1, unixepoch(), unixepoch())"
    ).run();
    await env.DB.prepare(
      "INSERT INTO optimization_jobs (id, site_id, url, viewport, status, attempts, created_at) VALUES ('job_old', 'site_1', 'https://a.com/', 'mobile', 'queued', 0, unixepoch() - 3600)"
    ).run();
    await runSweeper(env);
    const job = (await env.DB.prepare('SELECT status FROM optimization_jobs WHERE id = ?').bind('job_old').first()) as any;
    expect(job.status).toBe('failed');
  });

  it('Billing: GET /billing/status returns locked contract plans, interval, and reported traffic tags', async () => {
    const env = createTestEnv();
    await seedSubscription(env, 'user_a');
    const app = buildApp(env);
    const res = await app.fetch(
      new Request('https://api.test/api/v1/billing/status', {
        headers: { Authorization: 'Bearer user_a' },
      })
    );
    expect(res.status).toBe(200);
    const json = (await res.json()) as any;
    expect(json.success).toBe(true);
    expect(json.data.hasActivePlan).toBe(true);
    expect(json.data.plan.id).toBe('starter');
    expect(json.data.plan.monthlyCredits).toBe(250);
    expect(json.data.plan.priceMonthlyCents).toBe(1900);
    expect(json.data.plan.priceAnnualCents).toBe(18240);
    expect(json.data.plan.pageviewsSource).toBe('reported');
  });

  it('Entitlements: Dispatch rejects with 402 CREDITS_EXHAUSTED when in-plan credits are fully exhausted', async () => {
    const env = createTestEnv();
    await seedSubscription(env, 'user_a');
    await env.DB.prepare(
      "INSERT INTO sites (id, user_id, subscription_id, domain, site_api_key_hash, config_json, is_active, created_at, updated_at) VALUES ('site_1', 'user_a', 'sub_user_a', 'a.com', 'hash', '{}', 1, unixepoch(), unixepoch())"
    ).run();

    // Fill up the credits on the usage period
    const app = buildApp(env);
    // Call billing status to initialize the usage period
    await app.fetch(
      new Request('https://api.test/api/v1/billing/status', {
        headers: { Authorization: 'Bearer user_a' },
      })
    );
    await env.DB.prepare(
      'UPDATE usage_periods SET credits_used = credit_limit, credits_reserved = 0 WHERE subscription_id = ?'
    )
      .bind('sub_user_a')
      .run();

    const res = await app.fetch(
      new Request('https://api.test/api/v1/optimize/dispatch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer user_a' },
        body: JSON.stringify({ url: 'https://a.com/page-1' }),
      })
    );
    expect(res.status).toBe(402);
    const body = (await res.json()) as any;
    expect(body.code).toBe('CREDITS_EXHAUSTED');
  });

  it('Concurrency: Dispatch rejects with 429 CONCURRENCY_LIMIT when active jobs reach the plan limit', async () => {
    const env = createTestEnv();
    await seedSubscription(env, 'user_a');
    await env.DB.prepare(
      "INSERT INTO sites (id, user_id, subscription_id, domain, site_api_key_hash, config_json, is_active, created_at, updated_at) VALUES ('site_1', 'user_a', 'sub_user_a', 'a.com', 'hash', '{}', 1, unixepoch(), unixepoch())"
    ).run();

    // Starter plan has maxConcurrentJobs = 1. Insert 1 active job.
    await env.DB.prepare(
      "INSERT INTO optimization_jobs (id, site_id, url, viewport, status, attempts, created_at) VALUES ('job_active', 'site_1', 'https://a.com/', 'mobile', 'processing', 1, unixepoch())"
    ).run();

    const app = buildApp(env);
    const res = await app.fetch(
      new Request('https://api.test/api/v1/optimize/dispatch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer user_a' },
        body: JSON.stringify({ url: 'https://a.com/page-2' }),
      })
    );
    expect(res.status).toBe(429);
    const body = (await res.json()) as any;
    expect(body.code).toBe('CONCURRENCY_LIMIT');
  });

  it('Overage: Dispatch succeeds when in-plan credits are exhausted but overage is enabled with an available limit', async () => {
    const env = createTestEnv();
    await seedSubscription(env, 'user_a');
    await env.DB.prepare(
      "INSERT INTO sites (id, user_id, subscription_id, domain, site_api_key_hash, config_json, is_active, created_at, updated_at) VALUES ('site_1', 'user_a', 'sub_user_a', 'a.com', 'hash', '{}', 1, unixepoch(), unixepoch())"
    ).run();

    const app = buildApp(env);
    // Initialize usage period
    await app.fetch(
      new Request('https://api.test/api/v1/billing/status', {
        headers: { Authorization: 'Bearer user_a' },
      })
    );

    // Exhaust in-plan credits and enable overage with limit 100
    await env.DB.prepare(
      'UPDATE subscriptions SET overage_enabled = 1, overage_limit_credits = 100 WHERE id = ?'
    )
      .bind('sub_user_a')
      .run();
    await env.DB.prepare(
      'UPDATE usage_periods SET credits_used = credit_limit, credits_reserved = 0, overage_enabled = 1, overage_limit_credits = 100 WHERE subscription_id = ?'
    )
      .bind('sub_user_a')
      .run();

    const res = await app.fetch(
      new Request('https://api.test/api/v1/optimize/dispatch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer user_a' },
        body: JSON.stringify({ url: 'https://a.com/overage-page' }),
      })
    );
    expect(res.status).toBe(202);
    const body = (await res.json()) as any;
    expect(body.data.jobs.length).toBeGreaterThan(0);
  });

  it('Template dedup: a structure_hash KV hit completes free — no credit reservation, no queue send', async () => {
    const env = createTestEnv();
    await seedSubscription(env, 'user_a');
    await env.DB.prepare(
      "INSERT INTO sites (id, user_id, subscription_id, domain, site_api_key_hash, config_json, is_active, created_at, updated_at) VALUES ('site_1', 'user_a', 'sub_user_a', 'a.com', 'hash', '{}', 1, unixepoch(), unixepoch())"
    ).run();

    const app = buildApp(env);
    // Initialize the usage period via billing status.
    await app.fetch(
      new Request('https://api.test/api/v1/billing/status', {
        headers: { Authorization: 'Bearer user_a' },
      })
    );

    // Seed the template cache so thisUrlKey === cached key (no R2 copy needed;
    // the mock bucket returns null on get).
    const url = 'https://a.com/dedup-page';
    const thisUrlKey = `sites/site_1/css/${createHash('sha256').update(url).digest('hex').slice(0, 32)}_mobile`;
    await env.KV.put(
      'template:site_1:tmplhash123:mobile',
      JSON.stringify({
        criticalCssR2Key: thisUrlKey,
        criticalCssBytes: 1234,
        lcpSelector: null,
        lcpImageUrl: null,
      })
    );

    const res = await app.fetch(
      new Request('https://api.test/api/v1/optimize/dispatch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer user_a' },
        body: JSON.stringify({ url, viewports: ['mobile'], structure_hash: 'tmplhash123' }),
      })
    );
    expect(res.status).toBe(202);
    const body = (await res.json()) as any;
    expect(body.data.jobs).toHaveLength(1);
    expect(body.data.jobs[0].status).toBe('completed');
    expect(body.data.freeDeduped).toBe(1);

    // No credit was reserved or consumed for the deduped job…
    const reservations = await env.DB.prepare('SELECT * FROM optimization_credit_reservations')
      .all()
      .then((r: any) => r.results);
    expect(reservations).toHaveLength(0);
    const period = await env.DB.prepare('SELECT credits_used, credits_reserved FROM usage_periods WHERE subscription_id = ?')
      .bind('sub_user_a')
      .first<any>();
    expect(period.credits_used).toBe(0);
    expect(period.credits_reserved).toBe(0);
    // …and nothing was sent to the Chromium queue.
    expect((env as any).__queueSent).toHaveLength(0);
    // The completed job carries a NULL reservation id.
    const job = await env.DB.prepare('SELECT status, credit_reservation_id, critical_css_r2_key FROM optimization_jobs')
      .first<any>();
    expect(job.status).toBe('completed');
    expect(job.credit_reservation_id).toBeNull();
    expect(job.critical_css_r2_key).toBe(thisUrlKey);
  });

  it('Asset Cutoff: Inactive site returns 403 on GET /assets/css/:site_id/:css_file', async () => {
    const env = createTestEnv();
    await seedSubscription(env, 'user_a');
    await env.DB.prepare(
      "INSERT INTO sites (id, user_id, subscription_id, domain, site_api_key_hash, config_json, is_active, created_at, updated_at) VALUES ('site_inactive', 'user_a', 'sub_user_a', 'inactive.com', 'hash', '{}', 0, unixepoch(), unixepoch())"
    ).run();

    const app = buildApp(env);
    const res = await app.fetch(
      new Request('https://api.test/api/v1/assets/css/site_inactive/style.css')
    );
    expect(res.status).toBe(403);
  });
});
