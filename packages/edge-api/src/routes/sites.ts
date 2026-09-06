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
  hmacSha256Hex,
  normalizeDomain,
  PRESET_LUDICROUS,
} from '@wpinstant/shared';
import { saasUserAuthMiddleware, siteAuthMiddleware } from '../middleware/auth.js';
import { loadSubscriptionForScope, resolveBillingScope } from '../services/entitlements.js';
import { pushPluginCommand } from '../services/plugin-commands.js';

export const siteRoutes = new Hono<{ Bindings: Env; Variables: AppVariables }>();

function siteScopeClause(scope: { organizationId: string | null; userId: string | null }, alias = 's'): string {
  if (scope.organizationId) {
    return `(${alias}.organization_id = ? OR (${alias}.organization_id IS NULL AND ${alias}.user_id = ?))`;
  }
  return `${alias}.user_id = ?`;
}

function siteScopeBindings(scope: { organizationId: string | null; userId: string | null }): string[] {
  if (scope.organizationId) {
    return [scope.organizationId, scope.userId as string];
  }
  return [scope.userId as string];
}

function formatRelativeTime(timestampSec: number): string {
  const diff = Math.floor(Date.now() / 1000) - timestampSec;
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

/**
 * List all sites for logged-in user / organization
 * GET /api/v1/sites
 */
siteRoutes.get('/', saasUserAuthMiddleware, async (c) => {
  const scope = resolveBillingScope({
    organizationId: c.get('organizationId'),
    userId: c.get('userId'),
  });

  const clause = siteScopeClause(scope, 's');
  const bindings = siteScopeBindings(scope);

  const { results: sites } = await c.env.DB.prepare(`
    SELECT s.*, 
      (SELECT COUNT(*) FROM optimization_jobs j WHERE j.site_id = s.id) as total_jobs,
      (SELECT performance_score FROM performance_audits a WHERE a.site_id = s.id AND a.device = 'mobile' ORDER BY a.created_at DESC LIMIT 1) as mobile_score,
      (SELECT performance_score FROM performance_audits a WHERE a.site_id = s.id AND a.device = 'desktop' ORDER BY a.created_at DESC LIMIT 1) as desktop_score,
      (SELECT lcp_ms FROM performance_audits a WHERE a.site_id = s.id AND a.device = 'mobile' ORDER BY a.created_at DESC LIMIT 1) as mobile_lcp,
      (SELECT cls_score FROM performance_audits a WHERE a.site_id = s.id AND a.device = 'mobile' ORDER BY a.created_at DESC LIMIT 1) as mobile_cls,
      (SELECT fcp_ms FROM performance_audits a WHERE a.site_id = s.id AND a.device = 'mobile' ORDER BY a.created_at DESC LIMIT 1) as mobile_fcp,
      (SELECT ttfb_ms FROM performance_audits a WHERE a.site_id = s.id AND a.device = 'mobile' ORDER BY a.created_at DESC LIMIT 1) as mobile_ttfb,
      (SELECT status FROM optimization_jobs j WHERE j.site_id = s.id ORDER BY j.created_at DESC LIMIT 1) as latest_job_status,
      (SELECT created_at FROM optimization_jobs j WHERE j.site_id = s.id ORDER BY j.created_at DESC LIMIT 1) as latest_job_time
    FROM sites s
    WHERE ${clause}
    ORDER BY s.created_at DESC
  `)
    .bind(...bindings)
    .all<
      Site & {
        total_jobs: number;
        mobile_score: number | null;
        desktop_score: number | null;
        mobile_lcp: number | null;
        mobile_cls: number | null;
        mobile_fcp: number | null;
        mobile_ttfb: number | null;
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

      // Front-end reality signals from the plugin's daily heartbeat. A site
      // whose served HTML carries no current fingerprint (host cache pinning
      // unoptimized HTML, test mode, DOM engine inactive) must NOT read
      // "optimized" just because extraction jobs completed — the extractor
      // always sees the raw origin, so job rows alone can't prove visitors
      // get optimized HTML.
      let servedFingerprint: 'ok' | 'stale' | 'missing' | null = null;
      let healthAgeDays: number | null = null;
      try {
        if (s.health_json) {
          const health = JSON.parse(s.health_json) as {
            checked_at?: number;
            checks?: Array<{ key?: string; status?: string }>;
          };
          if (typeof health.checked_at === 'number') {
            healthAgeDays = Math.max(0, Math.floor((Date.now() / 1000 - health.checked_at) / 86400));
          }
          const served = (health.checks || []).find((ch) => ch.key === 'served_html_current');
          if (served) {
            servedFingerprint =
              served.status === 'ok' ? 'ok' : served.status === 'error' ? 'stale' : 'missing';
          }
        }
      } catch {
        /* malformed health report: ignore */
      }

      const deploymentStatus = parsedConfig?.deployment?.status ?? 'live';

      let status: 'connected' | 'optimized' | 'optimizing' | 'attention' | 'disconnected' = 'connected';
      let statusReason: string | null = null;
      if (!s.is_active) {
        status = 'disconnected';
      } else if (s.latest_job_status === 'processing' || s.latest_job_status === 'queued') {
        status = 'optimizing';
      } else if (s.latest_job_status === 'needs_attention') {
        status = 'attention';
        statusReason = 'Extraction hit a bot challenge or firewall — allowlist the extractor (attention feed has details)';
      } else if (s.latest_job_status === 'failed' || (score != null && score < 60)) {
        status = 'attention';
        statusReason = s.latest_job_status === 'failed' ? 'Latest optimization job failed' : 'Performance score below 60';
      } else if (deploymentStatus === 'test') {
        status = 'attention';
        statusReason = 'Test Mode is active — visitors receive the unoptimized page until you Deploy';
      } else if (
        healthAgeDays !== null &&
        healthAgeDays <= 3 &&
        (servedFingerprint === 'stale' || servedFingerprint === 'missing')
      ) {
        status = 'attention';
        statusReason =
          servedFingerprint === 'stale'
            ? 'A host/foreign cache is serving outdated HTML — purge it (LiteSpeed etc.)'
            : 'No WP Instant fingerprint on served HTML — front-end optimization is not reaching visitors';
      } else if (s.latest_job_status === 'completed' || (score != null && servedFingerprint === 'ok')) {
        status = 'optimized';
      }

      // Never leak server-side secrets to the dashboard: site_api_key_hash
      // is the site credential, callback_secret signs plugin push commands.
      const { site_api_key_hash: _hash, callback_secret: _secret, ...publicSite } = s;

      return {
        ...publicSite,
        config: parsedConfig,
        score,
        mobileScore: s.mobile_score,
        desktopScore: s.desktop_score,
        lcp,
        cls: s.mobile_cls,
        ttfbMs: s.mobile_ttfb != null ? Math.round(s.mobile_ttfb) : null,
        cacheHitRate: null,
        status,
        statusReason,
        lastJobTime: s.latest_job_time ? formatRelativeTime(s.latest_job_time) : null,
        subTitle: s.wp_version
          ? `WordPress ${s.wp_version} · WP Instant`
          : s.is_active
            ? 'Connected · WP Instant'
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
  const scope = resolveBillingScope({
    organizationId: c.get('organizationId'),
    userId: c.get('userId'),
  });
  const userId = c.get('userId')!;
  const body = await c.req.json().catch(() => ({}));
  const rawDomain = body.domain || body.site_url;

  if (!rawDomain) {
    return c.json({ success: false, error: 'Domain is required' }, 400);
  }

  const domain = normalizeDomain(rawDomain);

  // Check subscription / max site limit
  const loaded = await loadSubscriptionForScope(c.env, scope);
  if (!loaded) {
    return c.json(
      {
        success: false,
        code: 'SUBSCRIPTION_REQUIRED',
        error: 'Active subscription required. Please purchase a WP Instant plan to register a site.',
      },
      402
    );
  }

  const subscriptionId = loaded.subscription.id;
  const maxSites = loaded.subscription.max_sites || loaded.plan.maxSites || 1;

  const countClause = siteScopeClause(scope, 'sites');
  const countBindings = siteScopeBindings(scope);
  const countRow = await c.env.DB.prepare(
    `SELECT COUNT(*) as count FROM sites WHERE ${countClause} AND is_active = 1`
  )
    .bind(...countBindings)
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

  // Ownership check lives in the WHERE clause: re-registering your OWN
  // domain rotates its key; a domain owned by someone else is a no-op
  // (0 changes) and returns 409 instead of silently hijacking the site.
  const upsert = await c.env.DB.prepare(`
    INSERT INTO sites (id, user_id, organization_id, subscription_id, domain, site_api_key_hash, config_json, is_active, wp_version, plugin_version, last_ping_at, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, 1, NULL, NULL, NULL, unixepoch(), unixepoch())
    ON CONFLICT(domain) DO UPDATE SET
      site_api_key_hash = excluded.site_api_key_hash,
      organization_id = coalesce(excluded.organization_id, sites.organization_id),
      is_active = 1,
      updated_at = unixepoch()
    WHERE sites.user_id = excluded.user_id OR (excluded.organization_id IS NOT NULL AND sites.organization_id = excluded.organization_id)
  `)
    .bind(siteId, userId, scope.organizationId, subscriptionId, domain, apiKeyHash, configJson)
    .run();

  if ((upsert.meta?.changes ?? 0) === 0) {
    return c.json(
      {
        success: false,
        code: 'DOMAIN_OWNED_BY_OTHER_ACCOUNT',
        error: 'This domain is already registered to a different WP Instant account. Contact support to transfer ownership.',
      },
      409
    );
  }

  // On conflict-update the row keeps its original id — fetch the real one
  // (returning the freshly generated id here would desync KV from D1).
  const siteRow = await c.env.DB.prepare(
    `SELECT id FROM sites WHERE domain = ? AND ${countClause}`
  )
    .bind(domain, ...countBindings)
    .first<{ id: string }>();
  const activeSiteId = siteRow?.id || siteId;

  // Populate KV cache
  await c.env.KV.put(
    `site:${domain}`,
    JSON.stringify({
      id: activeSiteId,
      user_id: userId,
      organization_id: scope.organizationId,
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
      siteId: activeSiteId,
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
  const scope = resolveBillingScope({
    organizationId: c.get('organizationId'),
    userId: c.get('userId'),
  });
  const siteId = c.req.param('site_id');

  const clause = siteScopeClause(scope, 'sites');
  const bindings = siteScopeBindings(scope);

  const site = await c.env.DB.prepare(
    `SELECT * FROM sites WHERE id = ? AND ${clause}`
  )
    .bind(siteId, ...bindings)
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

  // Strip server-side secrets before returning the row to the dashboard.
  const { site_api_key_hash: _hash, callback_secret: _secret, ...publicSite } = site;

  return c.json({
    success: true,
    data: {
      site: publicSite,
      config,
      jobs,
      audits,
    },
  });
});

/**
 * Per-URL optimization status + RUM vitals (Pages tab)
 * GET /api/v1/sites/:site_id/pages
 */
siteRoutes.get('/:site_id/pages', saasUserAuthMiddleware, async (c) => {
  const scope = resolveBillingScope({
    organizationId: c.get('organizationId'),
    userId: c.get('userId'),
  });
  const siteId = c.req.param('site_id');

  const clause = siteScopeClause(scope, 'sites');
  const bindings = siteScopeBindings(scope);

  const site = await c.env.DB.prepare(
    `SELECT id FROM sites WHERE id = ? AND ${clause}`
  )
    .bind(siteId, ...bindings)
    .first<{ id: string }>();

  if (!site) {
    return c.json({ success: false, error: 'Site not found' }, 404);
  }

  // Determine RUM retention window per plan (Starter=30d, Growth=90d, Agency=180d)
  const loaded = await loadSubscriptionForScope(c.env, scope);
  const rumRetentionDays = Math.max(7, loaded?.plan.rumRetentionDays || 30);

  const { results: pageRows } = await c.env.DB.prepare(`
    SELECT url,
      COUNT(*) as total_jobs,
      SUM(CASE WHEN status = "completed" THEN 1 ELSE 0 END) as completed_jobs,
      SUM(CASE WHEN status IN ('failed', 'needs_attention') THEN 1 ELSE 0 END) as failed_jobs,
      MAX(created_at) as last_run_at,
      MAX(CASE WHEN status = "completed" THEN created_at END) as last_completed_at,
      MAX(CASE WHEN status = "completed" THEN critical_css_bytes END) as critical_css_bytes,
      MAX(CASE WHEN status = "completed" THEN lcp_image_url END) as lcp_image_url
    FROM optimization_jobs
    WHERE site_id = ?
    GROUP BY lower(rtrim(url, '/'))
    ORDER BY last_run_at DESC
    LIMIT 100
  `)
    .bind(siteId)
    .all<{
      url: string;
      total_jobs: number;
      completed_jobs: number;
      failed_jobs: number;
      last_run_at: number;
      last_completed_at: number | null;
      critical_css_bytes: number | null;
      lcp_image_url: string | null;
    }>();

  const { results: rumRows } = await c.env.DB.prepare(
    `SELECT day, mode, pageviews, errors, lcp_p75_ms, cls_p75, error_pages_json, transfer_bytes
     FROM rum_daily
     WHERE site_id = ? AND day >= date('now', '-' || ? || ' days')
     ORDER BY day DESC`
  )
    .bind(siteId, String(rumRetentionDays))
    .all<{
      day: string;
      mode: string;
      pageviews: number;
      errors: number;
      lcp_p75_ms: number | null;
      cls_p75: number | null;
      error_pages_json: string | null;
      transfer_bytes?: number;
    }>();

  // Aggregate RUM per day across modes (sum views/errors, pick the dominant mode's vitals)
  const rumByDay = new Map<
    string,
    { day: string; views: number; errors: number; lcpP75: number | null; clsP75: number | null; bytes: number }
  >();
  for (const r of rumRows) {
    const agg =
      rumByDay.get(r.day) || { day: r.day, views: 0, errors: 0, lcpP75: null, clsP75: null, bytes: 0 };
    agg.views += r.pageviews || 0;
    agg.errors += r.errors || 0;
    agg.bytes += r.transfer_bytes || 0;
    if (r.lcp_p75_ms != null && agg.lcpP75 == null) agg.lcpP75 = r.lcp_p75_ms;
    if (r.cls_p75 != null && agg.clsP75 == null) agg.clsP75 = r.cls_p75;
    rumByDay.set(r.day, agg);
  }

  return c.json({
    success: true,
    data: {
      pages: pageRows.map((p) => ({
        url: p.url,
        path: (() => {
          try {
            return new URL(p.url).pathname;
          } catch {
            return p.url;
          }
        })(),
        totalJobs: p.total_jobs,
        completedJobs: p.completed_jobs,
        failedJobs: p.failed_jobs,
        lastRunAt: p.last_run_at,
        lastRunRelative: p.last_run_at ? formatRelativeTime(p.last_run_at) : null,
        cssAgeHours:
          p.last_completed_at != null
            ? Math.max(0, Math.round((Date.now() / 1000 - p.last_completed_at) / 3600))
            : null,
        criticalCssKb:
          p.critical_css_bytes != null
            ? Math.round((p.critical_css_bytes / 1024) * 10) / 10
            : null,
        lcpImageUrl: p.lcp_image_url || null,
      })),
      rum: Array.from(rumByDay.values()),
      rumRetentionDays,
    },
  });
});

/**
 * Update Site Configuration
 * PUT /api/v1/sites/:site_id/config
 */
siteRoutes.put('/:site_id/config', saasUserAuthMiddleware, async (c) => {
  const scope = resolveBillingScope({
    organizationId: c.get('organizationId'),
    userId: c.get('userId'),
  });
  const siteId = c.req.param('site_id');
  const body = await c.req.json();

  const validatedConfig = SiteConfigSchema.parse(body);

  const clause = siteScopeClause(scope, 'sites');
  const bindings = siteScopeBindings(scope);

  const site = await c.env.DB.prepare(
    `SELECT domain FROM sites WHERE id = ? AND ${clause}`
  )
    .bind(siteId, ...bindings)
    .first<{ domain: string }>();

  if (!site) {
    return c.json({ success: false, error: 'Site not found' }, 404);
  }

  // Dashboard-issued Deploy/Test commands carry provenance: the plugin
  // only adopts deployment changes marked source='dashboard'.
  let deployCommand: 'test' | 'live' | null = null;
  if (validatedConfig.deployment?.status === 'test' || validatedConfig.deployment?.status === 'live') {
    const prev = await c.env.DB.prepare('SELECT config_json FROM sites WHERE id = ?')
      .bind(siteId)
      .first<{ config_json: string | null }>();
    let prevStatus: string | undefined;
    try {
      prevStatus = prev?.config_json ? JSON.parse(prev.config_json)?.deployment?.status : undefined;
    } catch {
      prevStatus = undefined;
    }
    (validatedConfig as any).deployment = {
      ...validatedConfig.deployment,
      source: 'dashboard',
    };
    if (prevStatus !== validatedConfig.deployment.status) {
      deployCommand = validatedConfig.deployment.status;
    }
  }

  const configJson = JSON.stringify(validatedConfig);

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

  // Push dashboard Deploy/Test commands to the plugin instantly through the
  // HMAC-verified optimize-callback channel (same secret the queue consumer
  // uses for critical-CSS delivery).
  if (deployCommand) {
    const row = await c.env.DB.prepare('SELECT site_url, callback_secret FROM sites WHERE id = ?')
      .bind(siteId)
      .first<{ site_url: string | null; callback_secret: string | null }>();
    if (row?.site_url && row?.callback_secret) {
      const base = row.site_url.replace(/\/+$/, '');
      const commandBody = JSON.stringify({
        command: 'deploy',
        deployment: { status: deployCommand, source: 'dashboard' },
      });
      const signature = await hmacSha256Hex(row.callback_secret, commandBody);
      c.executionCtx.waitUntil(
        fetch(`${base}/wp-json/wp-instant/v1/optimize-callback`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-WP-Instant-Signature': signature,
          },
          body: commandBody,
          signal: AbortSignal.timeout(8000),
        }).catch(() => {
          // Best-effort: the plugin also converges via /verify + heartbeat.
        })
      );
    }
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
  const scope = resolveBillingScope({
    organizationId: c.get('organizationId'),
    userId: c.get('userId'),
  });
  const siteId = c.req.param('site_id');
  const body = await c.req.json().catch(() => ({}));
  const payload = PurgeCacheRequestSchema.parse(body);

  const clause = siteScopeClause(scope, 'sites');
  const bindings = siteScopeBindings(scope);

  const site = await c.env.DB.prepare(
    `SELECT domain, site_url, callback_secret FROM sites WHERE id = ? AND ${clause}`
  )
    .bind(siteId, ...bindings)
    .first<{ domain: string; site_url: string | null; callback_secret: string | null }>();

  if (!site) {
    return c.json({ success: false, error: 'Site not found' }, 404);
  }

  // Push a signed purge command straight to the plugin so the static cache
  // is actually cleared. (The plugin purges all static entries; per-URL
  // payloads are therefore covered.) The previous purge:<domain> KV record
  // had no reader and has been removed.
  const pushed = await pushPluginCommand(c.env, site, { command: 'purge' });

  return c.json({
    success: true,
    data: {
      message: pushed
        ? `Cache purge pushed to plugin for ${site.domain}`
        : `Plugin unreachable; purge not delivered for ${site.domain}`,
      pushedToPlugin: pushed,
      details: payload,
    },
  });
});

/**
 * Delete Site
 * DELETE /api/v1/sites/:site_id
 */
siteRoutes.delete('/:site_id', saasUserAuthMiddleware, async (c) => {
  const scope = resolveBillingScope({
    organizationId: c.get('organizationId'),
    userId: c.get('userId'),
  });
  const siteId = c.req.param('site_id');

  const clause = siteScopeClause(scope, 'sites');
  const bindings = siteScopeBindings(scope);

  const site = await c.env.DB.prepare(
    `SELECT domain FROM sites WHERE id = ? AND ${clause}`
  )
    .bind(siteId, ...bindings)
    .first<{ domain: string }>();

  if (!site) {
    return c.json({ success: false, error: 'Site not found' }, 404);
  }

  await c.env.DB.prepare('DELETE FROM sites WHERE id = ?').bind(siteId).run();
  await c.env.KV.delete(`site:${site.domain}`);
  await c.env.KV.delete(`sitelogs:${siteId}`);
  await c.env.KV.delete(`msecret:${siteId}`);
  await c.env.KV.delete(`siteactive:${siteId}`);

  // Purge the site's R2 artifacts (critical CSS, media derivatives) so
  // deleted sites don't leave orphaned objects forever. Best-effort.
  try {
    let cursor: string | undefined;
    do {
      const page = await c.env.ASSETS_BUCKET.list({ prefix: `sites/${siteId}/`, cursor });
      if (page.objects.length > 0) {
        await c.env.ASSETS_BUCKET.delete(page.objects.map((o) => o.key));
      }
      cursor = page.truncated ? page.cursor : undefined;
    } while (cursor);
  } catch (err) {
    console.warn('[Site Delete] R2 orphan purge failed (non-fatal):', err);
  }

  return c.json({
    success: true,
    message: `Site ${site.domain} successfully deleted`,
  });
});

/* ------------------------------------------------------------------ */
/* R2 offload logs (KV ring buffer per site)                           */
/* ------------------------------------------------------------------ */

const OFFLOAD_LOG_KEY = (siteId: string) => `sitelogs:${siteId}`;
const OFFLOAD_LOG_MAX = 300;

interface OffloadLogEntry {
  t: number;
  src: string;
  w: number;
  f: string;
  status: string;
}

async function readOffloadLog(env: Env, siteId: string): Promise<OffloadLogEntry[]> {
  const existing = await env.KV.get<OffloadLogEntry[]>(OFFLOAD_LOG_KEY(siteId), 'json');
  return Array.isArray(existing) ? existing : [];
}

/**
 * Push offload log entries (plugin worker, site-key auth).
 * POST /api/v1/sites/:site_id/logs
 */
siteRoutes.post('/:site_id/logs', siteAuthMiddleware, async (c) => {
  const site = c.get('site') as { id: string };
  const siteId = c.req.param('site_id');
  if (site.id !== siteId) {
    return c.json({ success: false, error: 'Site mismatch' }, 403);
  }

  const body = await c.req.json().catch(() => null);
  const incoming = Array.isArray(body?.logs) ? body.logs : null;
  if (!incoming || incoming.length === 0) {
    return c.json({ success: false, error: 'Missing logs array' }, 400);
  }

  const sanitized: OffloadLogEntry[] = incoming
    .filter((e: any) => e && typeof e.src === 'string')
    .slice(0, 30)
    .map((e: any) => ({
      t: Number.isFinite(e.t) ? Math.max(0, Math.min(e.t, 4102444800)) : Math.floor(Date.now() / 1000),
      src: String(e.src).slice(0, 300),
      w: Number.isFinite(e.w) ? Math.max(0, Math.min(e.w, 100000)) : 0,
      f: ['webp', 'orig', 'raw'].includes(e.f) ? e.f : 'webp',
      status: ['ok', 'retry'].includes(e.status) ? e.status : 'retry',
    }));

  if (sanitized.length === 0) {
    return c.json({ success: false, error: 'No valid entries' }, 400);
  }

  const merged = [...sanitized, ...(await readOffloadLog(c.env, siteId))].slice(0, OFFLOAD_LOG_MAX);
  await c.env.KV.put(OFFLOAD_LOG_KEY(siteId), JSON.stringify(merged));

  return c.json({ success: true, data: { stored: sanitized.length } });
});

/**
 * Read offload logs (dashboard, user auth).
 * GET /api/v1/sites/:site_id/logs
 */
siteRoutes.get('/:site_id/logs', saasUserAuthMiddleware, async (c) => {
  const scope = resolveBillingScope({
    organizationId: c.get('organizationId'),
    userId: c.get('userId'),
  });
  const siteId = c.req.param('site_id');

  const clause = siteScopeClause(scope, 'sites');
  const bindings = siteScopeBindings(scope);

  const site = await c.env.DB.prepare(
    `SELECT id FROM sites WHERE id = ? AND ${clause}`
  )
    .bind(siteId, ...bindings)
    .first<{ id: string }>();

  if (!site) {
    return c.json({ success: false, error: 'Site not found' }, 404);
  }

  const logs = await readOffloadLog(c.env, siteId);
  return c.json({ success: true, data: { logs } });
});
