import { Hono } from 'hono';
import { Env, AppVariables } from '../types/env.js';
import { hmacSha256Hex, normalizeDomain, SiteConfigSchema, generateJobId } from '@turbopress/shared';
import type { ViewportMode } from '@turbopress/shared';

/**
 * Embed routes: let the WP-admin iframe drive the SaaS control plane
 * without a Clerk session. Auth is a short-lived HMAC token minted by the
 * plugin (`siteId.expiry.hmac` keyed by the per-site callback secret) and
 * passed via the X-Embed-Token header. Every mutation additionally pushes
 * a signed `optimize-callback` command to the plugin so dashboard changes
 * apply instantly.
 */

interface EmbedSiteRow {
  id: string;
  domain: string;
  config_json: string | null;
  is_active: number;
  site_url: string | null;
  callback_secret: string | null;
  health_json: string | null;
  plugin_version: string | null;
  wp_version: string | null;
  last_ping_at: number | null;
}

async function verifyEmbedToken(
  token: string,
  env: Env
): Promise<EmbedSiteRow | null> {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [siteId, expRaw, mac] = parts;
  const exp = parseInt(expRaw, 10);
  if (!Number.isFinite(exp) || exp < Math.floor(Date.now() / 1000)) return null;

  const row = await env.DB.prepare(
    'SELECT id, domain, config_json, is_active, site_url, callback_secret, health_json, plugin_version, wp_version, last_ping_at FROM sites WHERE id = ? LIMIT 1'
  )
    .bind(siteId)
    .first<EmbedSiteRow>();
  if (!row || !row.callback_secret) return null;

  const expected = await hmacSha256Hex(row.callback_secret, `${siteId}.${expRaw}`);
  if (mac.length !== expected.length) return null;
  // timing-safe compare
  let diff = 0;
  for (let i = 0; i < expected.length; i++) {
    diff |= mac.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  if (diff !== 0) return null;

  return row;
}

async function pushPluginCommand(
  env: Env,
  site: EmbedSiteRow,
  payload: Record<string, unknown>
): Promise<boolean> {
  if (!site.site_url || !site.callback_secret) return false;
  const body = JSON.stringify(payload);
  const signature = await hmacSha256Hex(site.callback_secret, body);
  try {
    const res = await fetch(`${site.site_url.replace(/\/+$/, '')}/wp-json/turbopress/v1/optimize-callback`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Turbopress-Signature': signature,
      },
      body,
      signal: AbortSignal.timeout(8000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export const embedRoutes = new Hono<{ Bindings: Env; Variables: AppVariables }>();

// --- Embed token auth -------------------------------------------------------
embedRoutes.use('*', async (c, next) => {
  const token = c.req.header('X-Embed-Token') || c.req.query('t') || '';
  if (!token) {
    return c.json({ success: false, error: 'Missing embed token' }, 401);
  }
  const site = await verifyEmbedToken(token, c.env);
  if (!site) {
    return c.json({ success: false, error: 'Invalid or expired embed token' }, 401);
  }
  if (!site.is_active) {
    return c.json({ success: false, error: 'Site is inactive' }, 403);
  }
  c.set('embedSite', site as unknown as NonNullable<AppVariables['embedSite']>);
  await next();
});

// --- Site overview (meta + config + health + recent jobs) -------------------
embedRoutes.get('/site', async (c) => {
  const site = c.get('embedSite') as unknown as EmbedSiteRow;

  let config: unknown = {};
  try {
    config = site.config_json ? JSON.parse(site.config_json) : {};
  } catch {
    config = {};
  }

  let health: unknown = null;
  try {
    health = site.health_json ? JSON.parse(site.health_json) : null;
  } catch {
    health = null;
  }

  const jobs = await c.env.DB.prepare(
    `SELECT id, url, viewport, status, error_message, attempts, created_at, completed_at,
            critical_css_bytes, lcp_selector, lcp_image_url
     FROM optimization_jobs WHERE site_id = ?
     ORDER BY created_at DESC LIMIT 50`
  )
    .bind(site.id)
    .all();

  const offloadLog = (await c.env.KV.get<any[]>(`sitelogs:${site.id}`, 'json')) || [];

  return c.json({
    success: true,
    data: {
      site: {
        id: site.id,
        domain: site.domain,
        pluginVersion: site.plugin_version,
        wpVersion: site.wp_version,
        lastPingAt: site.last_ping_at,
      },
      config,
      health,
      jobs: jobs.results || [],
      offloadLog,
    },
  });
});

// --- Update config (instantly pushed to the plugin) --------------------------
embedRoutes.put('/site/config', async (c) => {
  const site = c.get('embedSite') as unknown as EmbedSiteRow;
  const body = await c.req.json();

  const parsed = SiteConfigSchema.safeParse(body);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return c.json({
      success: false,
      error: `Invalid config: ${issue?.path?.join('.') || 'config'} ${issue?.message || 'failed validation'}`,
    }, 400);
  }
  const validatedConfig = parsed.data;

  // Dashboard-issued Deploy/Test carries provenance the plugin honors.
  if (validatedConfig.deployment) {
    (validatedConfig as any).deployment = {
      ...validatedConfig.deployment,
      source: 'dashboard',
    };
  }

  const configJson = JSON.stringify(validatedConfig);

  const prev = await c.env.DB.prepare('SELECT config_json FROM sites WHERE id = ?')
    .bind(site.id)
    .first<{ config_json: string | null }>();
  let prevStatus: string | undefined;
  try {
    prevStatus = prev?.config_json ? JSON.parse(prev.config_json)?.deployment?.status : undefined;
  } catch {
    prevStatus = undefined;
  }

  await c.env.DB.prepare(
    'UPDATE sites SET config_json = ?, updated_at = unixepoch() WHERE id = ?'
  )
    .bind(configJson, site.id)
    .run();

  const kvKey = `site:${site.domain}`;
  const existingKv = await c.env.KV.get<any>(kvKey, 'json');
  if (existingKv) {
    existingKv.config_json = configJson;
    await c.env.KV.put(kvKey, JSON.stringify(existingKv), { expirationTtl: 3600 });
  }

  // Instant apply: signed config push (plugin merges + purges).
  const pushed = await pushPluginCommand(c.env, site, {
    command: 'config',
    config: validatedConfig,
  });

  // Deployment status transitions also ride the explicit deploy command
  // so the plugin's provenance rules stay intact.
  if (
    validatedConfig.deployment?.status &&
    prevStatus !== validatedConfig.deployment.status
  ) {
    await pushPluginCommand(c.env, site, {
      command: 'deploy',
      deployment: { status: validatedConfig.deployment.status, source: 'dashboard' },
    });
  }

  return c.json({
    success: true,
    data: { config: validatedConfig, pushedToPlugin: pushed },
  });
});

// --- Purge site cache (pushed to the plugin) --------------------------------
embedRoutes.post('/site/purge', async (c) => {
  const site = c.get('embedSite') as unknown as EmbedSiteRow;
  const pushed = await pushPluginCommand(c.env, site, { command: 'purge' });
  return c.json({ success: true, data: { pushedToPlugin: pushed } });
});

// --- Dispatch optimization jobs ----------------------------------------------
embedRoutes.post('/site/dispatch', async (c) => {
  const site = c.get('embedSite') as unknown as EmbedSiteRow;
  const body = await c.req.json().catch(() => ({}));
  const url: string = (body.url || `https://${site.domain}/`).replace(/\/+$/, '/') ;
  const viewports: ViewportMode[] =
    Array.isArray(body.viewports) && body.viewports.length > 0
      ? body.viewports
      : ['mobile', 'desktop'];

  // Only dispatch for this site's own origin.
  let targetHost = '';
  try {
    targetHost = new URL(url).hostname;
  } catch {
    return c.json({ success: false, error: 'Invalid URL' }, 400);
  }
  if (normalizeDomain(targetHost) !== normalizeDomain(site.domain)) {
    return c.json({ success: false, error: 'URL does not belong to this site' }, 400);
  }

  const createdJobs: Array<{ jobId: string; viewport: ViewportMode; status: string }> = [];
  for (const viewport of viewports) {
    const jobId = generateJobId();
    await c.env.DB.prepare(
      `INSERT INTO optimization_jobs (id, site_id, url, viewport, status, attempts, created_at)
       VALUES (?, ?, ?, ?, 'queued', 0, unixepoch())`
    )
      .bind(jobId, site.id, url, viewport)
      .run();

    await c.env.KV.put(
      `job:${jobId}`,
      JSON.stringify({ status: 'queued', url, viewport, siteId: site.id, targetDomain: site.domain }),
      { expirationTtl: 3600 }
    );

    if (c.env.OPTIMIZATION_QUEUE) {
      try {
        await c.env.OPTIMIZATION_QUEUE.send({
          jobId,
          siteId: site.id,
          url,
          viewport,
          attempt: 1,
        });
      } catch (err) {
        console.warn('[Embed Dispatch Queue Warning]', err);
      }
    }

    createdJobs.push({ jobId, viewport, status: 'queued' });
  }

  return c.json({ success: true, data: { jobs: createdJobs } });
});
