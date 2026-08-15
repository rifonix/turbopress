import { Hono } from 'hono';
import { Env, AppVariables } from '../types/env.js';
import {
  SiteConfigSchema,
  PurgeCacheRequestSchema,
  Site,
  SiteConfig,
  generateApiKey,
  generateSiteId,
  sha256,
  normalizeDomain,
  PRESET_LUDICROUS,
} from '@turbopress/shared';
import { saasUserAuthMiddleware } from '../middleware/auth.js';

export const siteRoutes = new Hono<{ Bindings: Env; Variables: AppVariables }>();

function formatRelativeTime(timestampSec: number): string {
  const diff = Math.floor(Date.now() / 1000) - timestampSec;
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

/**
 * List all sites for logged-in user
 * GET /api/v1/sites
 */
siteRoutes.get('/', saasUserAuthMiddleware, async (c) => {
  const userId = c.get('userId')!;

  const { results: sites } = await c.env.DB.prepare(`
    SELECT s.*, 
      (SELECT COUNT(*) FROM optimization_jobs j WHERE j.site_id = s.id) as total_jobs,
      (SELECT performance_score FROM performance_audits a WHERE a.site_id = s.id AND a.device = 'mobile' ORDER BY a.created_at DESC LIMIT 1) as mobile_score,
      (SELECT performance_score FROM performance_audits a WHERE a.site_id = s.id AND a.device = 'desktop' ORDER BY a.created_at DESC LIMIT 1) as desktop_score,
      (SELECT lcp_ms FROM performance_audits a WHERE a.site_id = s.id AND a.device = 'mobile' ORDER BY a.created_at DESC LIMIT 1) as mobile_lcp,
      (SELECT cls_score FROM performance_audits a WHERE a.site_id = s.id AND a.device = 'mobile' ORDER BY a.created_at DESC LIMIT 1) as mobile_cls,
      (SELECT fcp_ms FROM performance_audits a WHERE a.site_id = s.id AND a.device = 'mobile' ORDER BY a.created_at DESC LIMIT 1) as mobile_fcp,
      (SELECT status FROM optimization_jobs j WHERE j.site_id = s.id ORDER BY j.created_at DESC LIMIT 1) as latest_job_status,
      (SELECT created_at FROM optimization_jobs j WHERE j.site_id = s.id ORDER BY j.created_at DESC LIMIT 1) as latest_job_time
    FROM sites s
    WHERE s.user_id = ?
    ORDER BY s.created_at DESC
  `)
    .bind(userId)
    .all<
      Site & {
        total_jobs: number;
        mobile_score: number | null;
        desktop_score: number | null;
        mobile_lcp: number | null;
        mobile_cls: number | null;
        mobile_fcp: number | null;
        latest_job_status: string | null;
        latest_job_time: number | null;
      }
    >();

  return c.json({
    success: true,
    data: sites.map((s) => {
      let parsedConfig: SiteConfig | null = null;
      try {
        parsedConfig = JSON.parse(s.config_json);
      } catch {
        parsedConfig = PRESET_LUDICROUS;
      }

      const score = s.mobile_score != null ? s.mobile_score : s.desktop_score;
      const lcp = s.mobile_lcp != null ? Number((s.mobile_lcp / 1000).toFixed(1)) : null;

      let status: 'connected' | 'optimized' | 'optimizing' | 'attention' | 'disconnected' = 'connected';
      if (!s.is_active) {
        status = 'disconnected';
      } else if (s.latest_job_status === 'processing' || s.latest_job_status === 'queued') {
        status = 'optimizing';
      } else if (s.latest_job_status === 'failed' || (score != null && score < 60)) {
        status = 'attention';
      } else if (s.latest_job_status === 'completed' || score != null) {
        status = 'optimized';
      }

      return {
        ...s,
        config: parsedConfig,
        score,
        mobileScore: s.mobile_score,
        desktopScore: s.desktop_score,
        lcp,
        cls: s.mobile_cls,
        ttfbMs: null,
        cacheHitRate: null,
        status,
        lastJobTime: s.latest_job_time ? formatRelativeTime(s.latest_job_time) : null,
        subTitle: s.wp_version
          ? `WordPress ${s.wp_version} · TurboPress`
          : s.is_active
            ? 'Connected · TurboPress'
            : 'Not connected',
      };
    }),
  });
});

/**
 * Register a new site manually
 * POST /api/v1/sites
 */
siteRoutes.post('/', saasUserAuthMiddleware, async (c) => {
  const userId = c.get('userId')!;
  const body = await c.req.json().catch(() => ({}));
  const rawDomain = body.domain || body.site_url;

  if (!rawDomain) {
    return c.json({ success: false, error: 'Domain is required' }, 400);
  }

  const domain = normalizeDomain(rawDomain);

  // Check subscription / max site limit
  const subscription = await c.env.DB.prepare(
    'SELECT id, max_sites FROM subscriptions WHERE user_id = ? AND status IN ("active", "trialing") ORDER BY created_at DESC LIMIT 1'
  )
    .bind(userId)
    .first<{ id: string; max_sites: number }>();

  if (!subscription) {
    return c.json(
      {
        success: false,
        code: 'SUBSCRIPTION_REQUIRED',
        error: 'Active subscription required. Please purchase a TurboPress plan to register a site.',
      },
      402
    );
  }

  const subscriptionId = subscription.id;
  const maxSites = subscription.max_sites || 5;

  const countRow = await c.env.DB.prepare(
    'SELECT COUNT(*) as count FROM sites WHERE user_id = ? AND is_active = 1'
  )
    .bind(userId)
    .first<{ count: number }>();

  if ((countRow?.count || 0) >= maxSites) {
    return c.json(
      {
        success: false,
        error: `Plan site limit reached (${maxSites} max). Please upgrade your subscription on the Billing tab.`,
      },
      403
    );
  }

  const apiKey = generateApiKey('sk_live_');
  const apiKeyHash = await sha256(apiKey);
  const siteId = generateSiteId();
  const initialConfig = PRESET_LUDICROUS;
  const configJson = JSON.stringify(initialConfig);

  await c.env.DB.prepare(`
    INSERT INTO sites (id, user_id, subscription_id, domain, site_api_key_hash, config_json, is_active, wp_version, plugin_version, last_ping_at, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, 1, NULL, NULL, NULL, unixepoch(), unixepoch())
    ON CONFLICT(domain) DO UPDATE SET
      site_api_key_hash = excluded.site_api_key_hash,
      is_active = 1,
      updated_at = unixepoch()
  `)
    .bind(siteId, userId, subscriptionId, domain, apiKeyHash, configJson)
    .run();

  // Populate KV cache
  await c.env.KV.put(
    `site:${domain}`,
    JSON.stringify({
      id: siteId,
      user_id: userId,
      domain,
      site_api_key_hash: apiKeyHash,
      config_json: configJson,
      is_active: 1,
    }),
    { expirationTtl: 3600 }
  );

  return c.json({
    success: true,
    data: {
      siteId,
      domain,
      apiKey,
      config: initialConfig,
      message: `Site ${domain} created and ready for optimization`,
    },
  });
});

/**
 * Get Site Detail with Recent Jobs & Audits
 * GET /api/v1/sites/:site_id
 */
siteRoutes.get('/:site_id', saasUserAuthMiddleware, async (c) => {
  const userId = c.get('userId')!;
  const siteId = c.req.param('site_id');

  const site = await c.env.DB.prepare(
    'SELECT * FROM sites WHERE id = ? AND user_id = ?'
  )
    .bind(siteId, userId)
    .first<Site>();

  if (!site) {
    return c.json({ success: false, error: 'Site not found' }, 404);
  }

  // Fetch recent jobs
  const { results: jobs } = await c.env.DB.prepare(
    'SELECT * FROM optimization_jobs WHERE site_id = ? ORDER BY created_at DESC LIMIT 20'
  )
    .bind(siteId)
    .all();

  // Fetch recent performance audits
  const { results: audits } = await c.env.DB.prepare(
    'SELECT * FROM performance_audits WHERE site_id = ? ORDER BY created_at DESC LIMIT 10'
  )
    .bind(siteId)
    .all();

  let config: SiteConfig | null = null;
  try {
    config = JSON.parse(site.config_json);
  } catch {
    //
  }

  return c.json({
    success: true,
    data: {
      site,
      config,
      jobs,
      audits,
    },
  });
});

/**
 * Update Site Configuration
 * PUT /api/v1/sites/:site_id/config
 */
siteRoutes.put('/:site_id/config', saasUserAuthMiddleware, async (c) => {
  const userId = c.get('userId')!;
  const siteId = c.req.param('site_id');
  const body = await c.req.json();

  const validatedConfig = SiteConfigSchema.parse(body);
  const configJson = JSON.stringify(validatedConfig);

  const site = await c.env.DB.prepare(
    'SELECT domain FROM sites WHERE id = ? AND user_id = ?'
  )
    .bind(siteId, userId)
    .first<{ domain: string }>();

  if (!site) {
    return c.json({ success: false, error: 'Site not found' }, 404);
  }

  // Update D1
  await c.env.DB.prepare(
    'UPDATE sites SET config_json = ?, updated_at = unixepoch() WHERE id = ?'
  )
    .bind(configJson, siteId)
    .run();

  // Invalidate & update KV cache
  const kvKey = `site:${site.domain}`;
  const existingKv = await c.env.KV.get<any>(kvKey, 'json');
  if (existingKv) {
    existingKv.config_json = configJson;
    await c.env.KV.put(kvKey, JSON.stringify(existingKv), { expirationTtl: 3600 });
  }

  return c.json({
    success: true,
    data: {
      config: validatedConfig,
      message: 'Configuration updated and synchronized across edge',
    },
  });
});

/**
 * Trigger Site Cache Purge
 * POST /api/v1/sites/:site_id/purge
 */
siteRoutes.post('/:site_id/purge', saasUserAuthMiddleware, async (c) => {
  const userId = c.get('userId')!;
  const siteId = c.req.param('site_id');
  const body = await c.req.json().catch(() => ({}));
  const payload = PurgeCacheRequestSchema.parse(body);

  const site = await c.env.DB.prepare(
    'SELECT domain FROM sites WHERE id = ? AND user_id = ?'
  )
    .bind(siteId, userId)
    .first<{ domain: string }>();

  if (!site) {
    return c.json({ success: false, error: 'Site not found' }, 404);
  }

  // Record purge command timestamp in KV
  await c.env.KV.put(
    `purge:${site.domain}`,
    JSON.stringify({
      timestamp: Date.now(),
      urls: payload.urls || [],
      purgeAll: payload.purge_all,
    }),
    { expirationTtl: 300 }
  );

  return c.json({
    success: true,
    data: {
      message: `Cache purge broadcasted for ${site.domain}`,
      details: payload,
    },
  });
});

/**
 * Delete Site
 * DELETE /api/v1/sites/:site_id
 */
siteRoutes.delete('/:site_id', saasUserAuthMiddleware, async (c) => {
  const userId = c.get('userId')!;
  const siteId = c.req.param('site_id');

  const site = await c.env.DB.prepare(
    'SELECT domain FROM sites WHERE id = ? AND user_id = ?'
  )
    .bind(siteId, userId)
    .first<{ domain: string }>();

  if (!site) {
    return c.json({ success: false, error: 'Site not found' }, 404);
  }

  await c.env.DB.prepare('DELETE FROM sites WHERE id = ?').bind(siteId).run();
  await c.env.KV.delete(`site:${site.domain}`);

  return c.json({
    success: true,
    message: `Site ${site.domain} successfully deleted`,
  });
});
