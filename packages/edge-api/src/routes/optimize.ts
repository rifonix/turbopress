import { Hono } from 'hono';
import { Env, AppVariables } from '../types/env.js';
import { OptimizationDispatchSchema, generateJobId, ViewportMode, normalizeDomain, sha256 } from '@wpinstant/shared';
import { saasUserAuthMiddleware, verifyClerkJwt } from '../middleware/auth.js';
import { checkRateLimit } from '../middleware/rate-limit.js';

export const optimizeRoutes = new Hono<{ Bindings: Env; Variables: AppVariables }>();

function formatRelativeTime(timestampSec: number): string {
  const diff = Math.floor(Date.now() / 1000) - timestampSec;
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

/**
 * List all optimization jobs across user's sites
 * GET /api/v1/optimize/jobs
 */
optimizeRoutes.get('/jobs', saasUserAuthMiddleware, async (c) => {
  const userId = c.get('userId')!;
  const before = Math.min(parseInt(c.req.query('before') || '0', 10) || 0, 2147483647);
  const limit = Math.min(parseInt(c.req.query('limit') || '50', 10) || 50, 100);

  const { results: jobs } = await c.env.DB.prepare(`
    SELECT j.*, s.domain as site_domain
    FROM optimization_jobs j
    JOIN sites s ON j.site_id = s.id
    WHERE s.user_id = ? ${before > 0 ? 'AND j.created_at < ?' : ''}
    ORDER BY j.created_at DESC
    LIMIT ?
  `)
    .bind(...(before > 0 ? [userId, before, limit + 1] : [userId, limit + 1]))
    .all<{
      id: string;
      site_id: string;
      url: string;
      viewport: ViewportMode;
      status: string;
      critical_css_r2_key?: string | null;
      critical_css_bytes?: number | null;
      lcp_selector?: string | null;
      lcp_image_url?: string | null;
      error_message?: string | null;
      attempts: number;
      created_at: number;
      completed_at?: number | null;
      site_domain: string;
    }>();

  const hasMore = jobs.length > limit;
  const page = hasMore ? jobs.slice(0, limit) : jobs;
  const nextCursor = hasMore && page.length > 0 ? page[page.length - 1].created_at : null;

  return c.json({
    success: true,
    data: page.map((job) => ({
      id: job.id,
      siteDomain: job.site_domain,
      url: job.url,
      viewport: job.viewport,
      status: job.status,
      criticalCssSizeKb:
        job.critical_css_bytes != null
          ? Math.round((job.critical_css_bytes / 1024) * 10) / 10
          : null,
      lcpSelector: job.lcp_selector || null,
      durationMs: job.completed_at ? Math.max(0, (job.completed_at - job.created_at) * 1000) : 0,
      createdAt: formatRelativeTime(job.created_at),
      errorMessage: job.error_message || null,
    })),
    nextCursor,
  });
});

/**
 * Dispatch Optimization Job (Critical CSS & LCP Candidate extraction)
 * POST /api/v1/optimize/dispatch
 * Accepts both User Token or Site API Key
 */
optimizeRoutes.post('/dispatch', async (c) => {
  const authHeader = c.req.header('Authorization') || '';
  const rawDomain = c.req.header('X-Site-Domain');
  const body = await c.req.json().catch(() => ({}));
  const payload = OptimizationDispatchSchema.parse(body);

  let siteId = '';
  let targetDomain = '';

  if (rawDomain && authHeader.startsWith('Bearer sk_live_')) {
    // Site-authenticated request: verify the API key against the stored hash.
    targetDomain = normalizeDomain(rawDomain);
    const apiKeyHash = await sha256(authHeader.replace('Bearer ', '').trim());
    const site = await c.env.DB.prepare(
      'SELECT id FROM sites WHERE domain = ? AND site_api_key_hash = ? AND is_active = 1'
    )
      .bind(targetDomain, apiKeyHash)
      .first<{ id: string }>();
    if (!site) {
      return c.json({ success: false, error: 'Invalid site credentials' }, 403);
    }
    siteId = site.id;
  } else {
    // User-authenticated request (from SaaS Dashboard): full Clerk JWKS
    // verification — identical to saasUserAuthMiddleware. NEVER trust
    // user_* prefixes or unverified JWT payloads in production.
    const token = authHeader.replace('Bearer ', '').trim();
    if (!token) {
      return c.json({ success: false, error: 'Unauthorized' }, 401);
    }

    const verified = await verifyClerkJwt(token, c.env);
    let userId = verified?.sub || '';
    // Dev-only bypass (mirrors saasUserAuthMiddleware)
    if (!userId && c.env.ENVIRONMENT !== 'production' && token.startsWith('user_')) {
      userId = token;
    }
    if (!userId) {
      return c.json({ success: false, error: 'Unauthorized: Invalid or expired token' }, 401);
    }

    // Extract domain from target URL
    try {
      targetDomain = new URL(payload.url).hostname;
    } catch {
      targetDomain = payload.url.split('/')[0];
    }
    targetDomain = normalizeDomain(targetDomain);

    const site = await c.env.DB.prepare(
      'SELECT id FROM sites WHERE (domain = ? OR id = ?) AND user_id = ? AND is_active = 1'
    )
      .bind(targetDomain, body.site_id || '', userId)
      .first<{ id: string }>();

    if (!site) {
      // No auto-create: sites are established exclusively via the pairing
      // handshake (POST /api/v1/auth/pair), which enforces plan limits.
      return c.json({ success: false, error: 'Site not registered. Pair the site from your WordPress admin first.' }, 404);
    }
    siteId = site.id;
  }

  const viewports: ViewportMode[] = payload.viewports && payload.viewports.length > 0 ? payload.viewports : ['mobile', 'desktop'];
  const createdJobs: Array<{ jobId: string; viewport: ViewportMode; status: string }> = [];

  // Abuse guards: per-site dispatch rate limit + active job cap (the cap
  // previously only existed in the crawl fan-out, not user-facing dispatch).
  const allowed = await checkRateLimit(c.env, 'dispatch', siteId, 20, 60);
  if (!allowed) {
    return c.json({ success: false, error: 'Rate limit exceeded — max 20 dispatches per minute per site' }, 429);
  }
  const activeRow = await c.env.DB.prepare(
    "SELECT COUNT(*) as count FROM optimization_jobs WHERE site_id = ? AND status IN ('queued','processing')"
  )
    .bind(siteId)
    .first<{ count: number }>();
  if ((activeRow?.count || 0) >= 12) {
    return c.json({ success: false, error: 'Too many active optimization jobs for this site — wait for running jobs to finish' }, 429);
  }

  for (const viewport of viewports) {
    const jobId = generateJobId();

    // Cloudflare KV Template Structure Hash Deduplication:
    // If structure_hash is supplied and already cached in KV for this site/template/viewport,
    // fulfill the job instantly from edge KV without launching Chromium Puppeteer.
    if (payload.structure_hash) {
      try {
        const templateKey = `template:${siteId}:${payload.structure_hash}:${viewport}`;
        const cachedTemplate = await c.env.KV.get<{
          criticalCssR2Key: string;
          criticalCssBytes: number;
          lcpSelector?: string;
          lcpImageUrl?: string;
        }>(templateKey, 'json');

        if (cachedTemplate?.criticalCssR2Key) {
          // Instant completion from Cloudflare KV template cache
          await c.env.DB.prepare(`
            INSERT INTO optimization_jobs (id, site_id, url, viewport, status, critical_css_r2_key, critical_css_bytes, lcp_selector, lcp_image_url, attempts, created_at, completed_at)
            VALUES (?, ?, ?, ?, 'completed', ?, ?, ?, ?, 1, unixepoch(), unixepoch())
          `)
            .bind(
              jobId,
              siteId,
              payload.url,
              viewport,
              cachedTemplate.criticalCssR2Key,
              cachedTemplate.criticalCssBytes,
              cachedTemplate.lcpSelector || null,
              cachedTemplate.lcpImageUrl || null
            )
            .run();

          await c.env.KV.put(
            `job:${jobId}`,
            JSON.stringify({
              status: 'completed',
              url: payload.url,
              viewport,
              siteId,
              criticalCssR2Key: cachedTemplate.criticalCssR2Key,
              criticalCssBytes: cachedTemplate.criticalCssBytes,
              lcpImageUrl: cachedTemplate.lcpImageUrl,
              fromTemplateCache: true,
            }),
            { expirationTtl: 86400 }
          );

          createdJobs.push({ jobId, viewport, status: 'completed' });
          continue;
        }
      } catch (kvErr) {
        console.warn('[Template KV lookup warning]', kvErr);
      }
    }

    // Insert into D1
    await c.env.DB.prepare(`
      INSERT INTO optimization_jobs (id, site_id, url, viewport, status, attempts, created_at)
      VALUES (?, ?, ?, ?, 'queued', 0, unixepoch())
    `)
      .bind(jobId, siteId, payload.url, viewport)
      .run();

    // Cache initial status in KV
    await c.env.KV.put(
      `job:${jobId}`,
      JSON.stringify({ status: 'queued', url: payload.url, viewport, siteId, targetDomain, structureHash: payload.structure_hash }),
      { expirationTtl: 3600 }
    );

    // Push message to Cloudflare Queue if bound. On failure, roll back the
    // D1 row + KV marker instead of leaving a zombie 'queued' job while
    // falsely reporting 202.
    if (c.env.OPTIMIZATION_QUEUE) {
      try {
        await c.env.OPTIMIZATION_QUEUE.send({
          jobId,
          siteId,
          url: payload.url,
          viewport,
          attempt: 1,
          structureHash: payload.structure_hash,
        });
      } catch (err) {
        console.error('[Optimization Queue Error — rolling back job]', err);
        await c.env.DB.prepare('DELETE FROM optimization_jobs WHERE id = ?').bind(jobId).run();
        await c.env.KV.delete(`job:${jobId}`);
        return c.json({ success: false, error: 'Failed to enqueue optimization job — please retry' }, 503);
      }
    }

    createdJobs.push({ jobId, viewport, status: 'queued' });
  }

  return c.json(
    {
      success: true,
      data: {
        jobs: createdJobs,
        url: payload.url,
        message: 'Optimization tasks successfully enqueued to Cloudflare Browser Workers',
      },
    },
    202
  );
});

/**
 * Attention Queue: failed / needs_attention jobs + site health warnings
 * GET /api/v1/optimize/attention
 */
optimizeRoutes.get('/attention', saasUserAuthMiddleware, async (c) => {
  const userId = c.get('userId')!;

  const { results: jobs } = await c.env.DB.prepare(`
    SELECT j.*, s.domain as site_domain
    FROM optimization_jobs j
    JOIN sites s ON j.site_id = s.id
    WHERE s.user_id = ? AND j.status IN ('failed', 'needs_attention')
    ORDER BY j.created_at DESC
    LIMIT 50
  `)
    .bind(userId)
    .all<{
      id: string;
      site_id: string;
      site_domain: string;
      url: string;
      viewport: ViewportMode;
      status: string;
      error_message: string | null;
      attempts: number;
      created_at: number;
    }>();

  const { results: siteRows } = await c.env.DB.prepare(
    `SELECT id, domain, health_json FROM sites
     WHERE user_id = ? AND health_json IS NOT NULL
     ORDER BY updated_at DESC LIMIT 100`
  )
    .bind(userId)
    .all<{ id: string; domain: string; health_json: string | null }>();

  const warnings: Array<{
    siteId: string;
    domain: string;
    kind: 'auto_degrade' | 'health_error';
    message: string;
    at?: number;
  }> = [];

  const now = Math.floor(Date.now() / 1000);
  for (const s of siteRows) {
    if (!s.health_json) continue;
    let health: any;
    try {
      health = JSON.parse(s.health_json);
    } catch {
      continue;
    }

    const degrade = health?.auto_degrade;
    if (
      degrade &&
      typeof degrade.at === 'number' &&
      now - degrade.at < 7 * 86400 &&
      typeof degrade.from === 'string' &&
      typeof degrade.to === 'string'
    ) {
      warnings.push({
        siteId: s.id,
        domain: s.domain,
        kind: 'auto_degrade',
        message: `Auto-protect stepped JavaScript mode down from "${degrade.from}" to "${degrade.to}"` +
          (typeof degrade.rate === 'number' ? ` (error rate ${(degrade.rate * 100).toFixed(1)}%)` : ''),
        at: degrade.at,
      });
    }

    if (Array.isArray(health?.checks)) {
      for (const check of health.checks) {
        if (check?.status === 'error') {
          warnings.push({
            siteId: s.id,
            domain: s.domain,
            kind: 'health_error',
            message: `${check.label || check.name || 'Health check'}: ${check.detail || 'failed'}`,
          });
        }
      }
    }
  }

  return c.json({
    success: true,
    data: {
      jobs: jobs.map((j) => ({
        id: j.id,
        siteId: j.site_id,
        siteDomain: j.site_domain,
        url: j.url,
        viewport: j.viewport,
        status: j.status,
        errorMessage: j.error_message || null,
        attempts: j.attempts,
        createdAt: formatRelativeTime(j.created_at),
      })),
      warnings: warnings.slice(0, 50),
    },
  });
});

/**
 * Re-run an existing optimization job
 * POST /api/v1/optimize/jobs/:job_id/rerun
 */
optimizeRoutes.post('/jobs/:job_id/rerun', saasUserAuthMiddleware, async (c) => {
  const jobId = c.req.param('job_id');
  const userId = c.get('userId')!;

  const job = await c.env.DB.prepare(`
    SELECT j.*, s.domain
    FROM optimization_jobs j
    JOIN sites s ON j.site_id = s.id
    WHERE j.id = ? AND s.user_id = ?
  `)
    .bind(jobId, userId)
    .first<{ id: string; site_id: string; url: string; viewport: ViewportMode; domain: string }>();

  if (!job) {
    return c.json({ success: false, error: 'Job not found' }, 404);
  }

  // Update status in D1
  await c.env.DB.prepare(
    'UPDATE optimization_jobs SET status = "queued", attempts = attempts + 1, created_at = unixepoch(), completed_at = NULL WHERE id = ?'
  )
    .bind(jobId)
    .run();

  // Update KV
  await c.env.KV.put(
    `job:${jobId}`,
    JSON.stringify({ status: 'queued', url: job.url, viewport: job.viewport, siteId: job.site_id, targetDomain: job.domain }),
    { expirationTtl: 3600 }
  );

  // Send to queue — roll back the re-queue if the send fails
  if (c.env.OPTIMIZATION_QUEUE) {
    try {
      await c.env.OPTIMIZATION_QUEUE.send({
        jobId,
        siteId: job.site_id,
        url: job.url,
        viewport: job.viewport,
        attempt: 1,
      });
    } catch (err) {
      console.error('[Optimization Queue Error — reverting requeue]', err);
      await c.env.DB.prepare('UPDATE optimization_jobs SET status = "failed" WHERE id = ?').bind(jobId).run();
      await c.env.KV.delete(`job:${jobId}`);
      return c.json({ success: false, error: 'Failed to enqueue job — please retry' }, 503);
    }
  }

  return c.json({
    success: true,
    data: {
      jobId,
      status: 'queued',
      message: 'Job re-queued for execution',
    },
  });
});

/**
 * Check Optimization Job Status
 * GET /api/v1/optimize/status/:job_id
 * Auth: site API key of the job's site, or a user token for the owning account.
 */
optimizeRoutes.get('/status/:job_id', async (c) => {
  const jobId = c.req.param('job_id');

  // Resolve the owning site (KV fast path, then D1)
  let siteId: string | null = null;
  let cached: any = await c.env.KV.get(`job:${jobId}`, 'json');
  if (cached?.siteId) {
    siteId = cached.siteId;
  } else {
    const row = await c.env.DB.prepare('SELECT site_id FROM optimization_jobs WHERE id = ?')
      .bind(jobId)
      .first<{ site_id: string }>();
    if (!row) {
      return c.json({ success: false, error: 'Job not found' }, 404);
    }
    siteId = row.site_id;
  }

  // Authorize: site key matching this job's site, or user owning the site.
  const authHeader = c.req.header('Authorization') || '';
  if (authHeader.startsWith('Bearer sk_live_')) {
    const rawDomain = c.req.header('X-Site-Domain') || '';
    const apiKeyHash = await sha256(authHeader.replace('Bearer ', '').trim());
    const site = await c.env.DB.prepare(
      'SELECT id FROM sites WHERE id = ? AND domain = ? AND site_api_key_hash = ?'
    )
      .bind(siteId, normalizeDomain(rawDomain), apiKeyHash)
      .first<{ id: string }>();
    if (!site) {
      return c.json({ success: false, error: 'Invalid site credentials' }, 403);
    }
  } else {
    const token = authHeader.replace('Bearer ', '').trim();
    const verified = token ? await verifyClerkJwt(token, c.env) : null;
    let userId = verified?.sub || '';
    if (!userId && c.env.ENVIRONMENT !== 'production' && token.startsWith('user_')) {
      userId = token;
    }
    if (!userId) {
      return c.json({ success: false, error: 'Unauthorized' }, 401);
    }
    const owned = await c.env.DB.prepare('SELECT id FROM sites WHERE id = ? AND user_id = ?')
      .bind(siteId, userId)
      .first<{ id: string }>();
    if (!owned) {
      return c.json({ success: false, error: 'Forbidden' }, 403);
    }
  }

  if (cached) {
    return c.json({ success: true, data: cached });
  }

  const job = await c.env.DB.prepare(
    'SELECT id, site_id, url, viewport, status, critical_css_bytes, lcp_selector, lcp_image_url, error_message, attempts, created_at, completed_at FROM optimization_jobs WHERE id = ?'
  )
    .bind(jobId)
    .first();

  if (!job) {
    return c.json({ success: false, error: 'Job not found' }, 404);
  }

  return c.json({
    success: true,
    data: job,
  });
});

/**
 * Fetch the latest completed Critical CSS for a URL/viewport.
 * GET /api/v1/optimize/css?url=...&viewport=mobile|desktop
 * Auth: site API key (Authorization: Bearer sk_live_... + X-Site-Domain header).
 * Used by the WordPress plugin to download generated critical CSS.
 */
optimizeRoutes.get('/css', async (c) => {
  const authHeader = c.req.header('Authorization') || '';
  const rawDomain = c.req.header('X-Site-Domain') || '';
  const url = (c.req.query('url') || '').trim();
  const viewport = c.req.query('viewport') === 'desktop' ? 'desktop' : 'mobile';

  if (!authHeader.startsWith('Bearer sk_live_')) {
    return c.json({ success: false, error: 'Site API key required' }, 401);
  }
  if (!rawDomain || !url) {
    return c.json({ success: false, error: 'X-Site-Domain and url query param are required' }, 400);
  }

  const domain = normalizeDomain(rawDomain);
  const apiKeyHash = await sha256(authHeader.replace('Bearer ', '').trim());

  const site = await c.env.DB.prepare(
    'SELECT id FROM sites WHERE domain = ? AND site_api_key_hash = ?'
  )
    .bind(domain, apiKeyHash)
    .first<{ id: string }>();

  if (!site) {
    return c.json({ success: false, error: 'Invalid site credentials' }, 403);
  }

  // Match the job URL case-insensitively with/without trailing slash.
  const normalized = url.replace(/\/+$/, '');
  const candidates = [normalized, normalized + '/'];

  const job = await c.env.DB.prepare(
    `SELECT critical_css_r2_key FROM optimization_jobs
     WHERE site_id = ? AND viewport = ? AND status = 'completed'
       AND critical_css_r2_key IS NOT NULL
       AND (lower(url) = lower(?) OR lower(url) = lower(?) OR lower(rtrim(url, '/')) = lower(?))
     ORDER BY created_at DESC LIMIT 1`
  )
    .bind(site.id, viewport, candidates[0], candidates[1], normalized)
    .first<{ critical_css_r2_key: string }>();

  if (!job) {
    return c.json({ success: false, error: 'No completed critical CSS for this URL yet' }, 404);
  }

  const object = await c.env.ASSETS_BUCKET.get(job.critical_css_r2_key);
  if (!object) {
    return c.json({ success: false, error: 'Critical CSS artifact not found' }, 404);
  }

  return c.body(await object.text(), 200, {
    'Content-Type': 'text/css; charset=utf-8',
    'Cache-Control': 'public, max-age=300',
    'X-WP-Instant-Css-Key': job.critical_css_r2_key,
  });
});

