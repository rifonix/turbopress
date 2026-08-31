import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Hono } from 'hono';
import { createTestEnv } from '../test-helpers/mock-env.js';
import { authRoutes } from './auth.js';
import { optimizeRoutes } from './optimize.js';
import { siteRoutes } from './sites.js';
import { runSweeper } from '../services/maintenance.js';
import type { Env, AppVariables } from '../types/env.js';

function buildApp(env: Env) {
  const app = new Hono<{ Bindings: Env; Variables: AppVariables }>();
  app.route('/api/v1/auth', authRoutes);
  app.route('/api/v1/optimize', optimizeRoutes);
  app.route('/api/v1/sites', siteRoutes);
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
});
