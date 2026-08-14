import { Hono } from 'hono';
import { Env, AppVariables } from '../types/env.js';
import { SiteConfigSchema, PurgeCacheRequestSchema, Site, SiteConfig } from '@turbopress/shared';
import { saasUserAuthMiddleware } from '../middleware/auth.js';

export const siteRoutes = new Hono<{ Bindings: Env; Variables: AppVariables }>();

/**
 * List all sites for logged-in user
 * GET /api/v1/sites
 */
siteRoutes.get('/', saasUserAuthMiddleware, async (c) => {
  const userId = c.get('userId')!;

  const { results: sites } = await c.env.DB.prepare(`
    SELECT s.*, 
      (SELECT COUNT(*) FROM optimization_jobs j WHERE j.site_id = s.id) as total_jobs,
      (SELECT performance_score FROM performance_audits a WHERE a.site_id = s.id ORDER BY a.created_at DESC LIMIT 1) as latest_score
    FROM sites s
    WHERE s.user_id = ?
    ORDER BY s.created_at DESC
  `)
    .bind(userId)
    .all<Site & { total_jobs: number; latest_score: number | null }>();

  return c.json({
    success: true,
    data: sites.map((s) => ({
      ...s,
      config: (() => {
        try {
          return JSON.parse(s.config_json);
        } catch {
          return null;
        }
      })(),
    })),
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
