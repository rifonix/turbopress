import { Hono } from 'hono';
import { Env, AppVariables } from '../types/env.js';
import {
  OptimizationDispatchSchema,
  generateJobId,
  ViewportMode,
  normalizeDomain,
  sha256,
  type JobPriority,
  type PlanContract,
} from '@wpinstant/shared';
import { saasUserAuthMiddleware, verifyClerkJwt } from '../middleware/auth.js';
import { checkRateLimit } from '../middleware/rate-limit.js';
import {
  consumeReservationForJob,
  countActiveFleetJobs,
  loadSubscriptionForSite,
  loadSubscriptionForScope,
  releaseReservationForJob,
  reserveCredits,
  resolveBillingScope,
} from '../services/entitlements.js';

export const optimizeRoutes = new Hono<{ Bindings: Env; Variables: AppVariables }>();

function jobPriorityForPlan(plan: PlanContract): JobPriority {
  return plan.priority === 'priority' || plan.priority === 'dedicated' ? 'high' : 'normal';
}

function quotaError(c: any, outcome: { inPlanRemaining: number; overageRemaining: number; overageEnabled: boolean }) {
  return c.json(
    {
      success: false,
      code: 'CREDITS_EXHAUSTED',
      error: 'Monthly optimization credits exhausted for this plan.',
      ...outcome,
    },
    402
  );
}

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
  const organizationId = c.get('organizationId') || null;
  const before = Math.min(parseInt(c.req.query('before') || '0', 10) || 0, 2147483647);
  const limit = Math.min(parseInt(c.req.query('limit') || '50', 10) || 50, 100);

  const scopeClause = organizationId ? '(s.user_id = ? OR s.organization_id = ?)' : 's.user_id = ?';
  const { results: jobs } = await c.env.DB.prepare(`
    SELECT j.*, s.domain as site_domain
    FROM optimization_jobs j
    JOIN sites s ON j.site_id = s.id
    WHERE ${scopeClause} ${before > 0 ? 'AND j.created_at < ?' : ''}
    ORDER BY j.created_at DESC
    LIMIT ?
  `)
    .bind(
      ...(organizationId
        ? before > 0
          ? [userId, organizationId, before, limit + 1]
          : [userId, organizationId, limit + 1]
        : before > 0
          ? [userId, before, limit + 1]
          : [userId, limit + 1])
    )
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

  // The dispatch target must be an absolute http(s) URL; its host is the
  // canonical identity used to bind the job to the authenticated site.
  let payloadHost = '';
  try {
    payloadHost = normalizeDomain(new URL(payload.url).hostname);
  } catch {
    payloadHost = '';
  }
  if (!payloadHost) {
    return c.json({ success: false, error: 'A valid absolute http(s) URL is required' }, 400);
  }

  let siteId = '';
  let targetDomain = '';

  if (rawDomain && authHeader.startsWith('Bearer sk_live_')) {
    // Site-authenticated request: verify the API key against the stored hash.
    targetDomain = normalizeDomain(rawDomain);
    if (payloadHost !== targetDomain) {
      return c.json({ success: false, error: 'Dispatch URL does not belong to the authenticated site' }, 403);
    }
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
    let orgId = verified?.orgId || '';
    // Dev-only bypass (mirrors saasUserAuthMiddleware)
    if (!userId && c.env.ENVIRONMENT !== 'production' && token.startsWith('user_')) {
      userId = token;
      orgId = c.req.header('X-Organization-Id') || '';
    }
    if (!userId) {
      return c.json({ success: false, error: 'Unauthorized: Invalid or expired token' }, 401);
    }

    // Extract domain from target URL (already validated above)
    targetDomain = payloadHost;

    const site = await c.env.DB.prepare(
      orgId
        ? 'SELECT id, domain FROM sites WHERE (domain = ? OR id = ?) AND (user_id = ? OR organization_id = ?) AND is_active = 1'
        : 'SELECT id, domain FROM sites WHERE (domain = ? OR id = ?) AND user_id = ? AND is_active = 1'
    )
      .bind(
        targetDomain,
        body.site_id || '',
        userId,
        ...(orgId ? [orgId] : [])
      )
      .first<{ id: string; domain: string }>();

    if (!site) {
      // No auto-create: sites are established exclusively via the pairing
      // handshake (POST /api/v1/auth/pair), which enforces plan limits.
      return c.json({ success: false, error: 'Site not registered. Pair the site from your WordPress admin first.' }, 404);
    }
    // Prevent site_id-of-A + URL-of-B mismatches: the resolved site must own
    // the dispatch URL's host.
    if (normalizeDomain(site.domain) !== payloadHost) {
      return c.json({ success: false, error: 'Dispatch URL does not belong to the selected site' }, 403);
    }
    siteId = site.id;
  }

  const requestedViewports = payload.viewports.length > 0 ? payload.viewports : (['mobile', 'desktop'] as ViewportMode[]);
  const viewports: ViewportMode[] = [...new Set(requestedViewports)];
  const createdJobs: Array<{ jobId: string; viewport: ViewportMode; status: string }> = [];

  // Commercial gate: the site must map to an active/trialing subscription,
  // and the plan's fleet-wide concurrency cap applies (plus a per-site
  // safety cap for queue fairness).
  const loaded = await loadSubscriptionForSite(c.env, siteId);
  if (!loaded) {
    return c.json(
      { success: false, code: 'SUBSCRIPTION_REQUIRED', error: 'No active subscription for this site.' },
      402
    );
  }
  const { subscription, plan } = loaded;
  const jobPriority = jobPriorityForPlan(plan);

  // Abuse guards: per-site dispatch rate limit + active job caps.
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
    return c.json(
      { success: false, code: 'CONCURRENCY_LIMIT', error: 'Too many active optimization jobs for this site — wait for running jobs to finish' },
      429
    );
  }
  const fleetActive = await countActiveFleetJobs(c.env, subscription.id);
  if (fleetActive >= plan.maxConcurrentJobs) {
    return c.json(
      {
        success: false,
        code: 'CONCURRENCY_LIMIT',
        error: `Plan concurrency limit reached (${plan.maxConcurrentJobs} concurrent optimizations). Wait for running jobs to finish.`,
      },
      429
    );
  }

  // The whole batch must fit in the remaining capacity so one dispatch with
  // multiple viewports cannot exceed either cap.
  const remainingCapacity = Math.min(12 - (activeRow?.count || 0), plan.maxConcurrentJobs - fleetActive);
  if (viewports.length > remainingCapacity) {
    return c.json(
      {
        success: false,
        code: 'CONCURRENCY_LIMIT',
        error: `Requested ${viewports.length} viewport jobs but only ${remainingCapacity} slot(s) remain — wait for running jobs to finish.`,
      },
      429
    );
  }

  for (const viewport of viewports) {
    const jobId = generateJobId();

    // Cloudflare KV Template Structure Hash Deduplication FIRST — before any
    // credit reservation. A page sharing another page's DOM structure is
    // fulfilled instantly from the edge KV cache and costs NO optimization
    // credits: no Chromium job runs, so none is charged. Only genuinely new
    // structures fall through to the reserving path below.
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
          // Instant completion from Cloudflare KV template cache. The
          // artifact must exist under THIS url's key before the job is
          // marked completed — the plugin downloads per-URL (sha256(url)),
          // so a bare status flip would 404 the fetch and silently drop
          // the deduped page's critical CSS. Copy is cheap (KBs of CSS).
          const thisUrlKey = `sites/${siteId}/css/${(await sha256(payload.url)).slice(0, 32)}_${viewport}`;
          let fulfilledKey = cachedTemplate.criticalCssR2Key;
          if (thisUrlKey !== cachedTemplate.criticalCssR2Key) {
            try {
              const src = await c.env.ASSETS_BUCKET.get(cachedTemplate.criticalCssR2Key);
              if (src) {
                await c.env.ASSETS_BUCKET.put(thisUrlKey, src.body, {
                  httpMetadata: src.httpMetadata,
                });
                fulfilledKey = thisUrlKey;
              } else {
                // Template artifact is gone (site cleanup): fall through to
                // a real extraction instead of completing into a dead key.
                console.warn('[Template KV] artifact missing, falling back to extraction', cachedTemplate.criticalCssR2Key);
                fulfilledKey = '';
              }
            } catch (copyErr) {
              console.warn('[Template KV] artifact copy failed, falling back to extraction', copyErr);
              fulfilledKey = '';
            }
          }

          if (fulfilledKey) {
            // Instant completion from Cloudflare KV template cache — free:
            // no credit reservation was made, so none is consumed.
            await c.env.DB.prepare(`
            INSERT INTO optimization_jobs (id, site_id, url, viewport, status, priority, credit_reservation_id, critical_css_r2_key, critical_css_bytes, lcp_selector, lcp_image_url, attempts, created_at, completed_at)
            VALUES (?, ?, ?, ?, 'completed', ?, NULL, ?, ?, ?, ?, 1, unixepoch(), unixepoch())
          `)
              .bind(
                jobId,
                siteId,
                payload.url,
                viewport,
                jobPriority,
                fulfilledKey,
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
                criticalCssR2Key: fulfilledKey,
                criticalCssBytes: cachedTemplate.criticalCssBytes,
                lcpImageUrl: cachedTemplate.lcpImageUrl,
                fromTemplateCache: true,
              }),
              { expirationTtl: 86400 }
            );

            createdJobs.push({ jobId, viewport, status: 'completed' });
            continue;
          }
          // Artifact unavailable — fall through to a real extraction below.
        }
      } catch (kvErr) {
        console.warn('[Template KV lookup warning]', kvErr);
      }
    }

    // Reserve 1 credit = 1 URL + 1 viewport before any work happens.
    const reservation = await reserveCredits(c.env, subscription, {
      units: 1,
      runKey: `job_${jobId}`,
      jobId,
      source: 'manual',
    });
    if (!reservation.ok) {
      if (createdJobs.length === 0) {
        return quotaError(c, reservation);
      }
      break;
    }

    // Insert into D1
    await c.env.DB.prepare(`
      INSERT INTO optimization_jobs (id, site_id, url, viewport, status, priority, credit_reservation_id, attempts, created_at)
      VALUES (?, ?, ?, ?, 'queued', ?, ?, 0, unixepoch())
    `)
      .bind(jobId, siteId, payload.url, viewport, jobPriority, reservation.reservationId)
      .run();

    // Cache initial status in KV
    await c.env.KV.put(
      `job:${jobId}`,
      JSON.stringify({ status: 'queued', url: payload.url, viewport, siteId, targetDomain, structureHash: payload.structure_hash }),
      { expirationTtl: 3600 }
    );

    // Push message to Cloudflare Queue if bound. On failure, roll back the
    // D1 row + KV marker + credit reservation instead of leaving a zombie
    // 'queued' job while falsely reporting 202.
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
        await releaseReservationForJob(c.env, jobId);
        return c.json({ success: false, error: 'Failed to enqueue optimization job — please retry' }, 503);
      }
    }

    createdJobs.push({ jobId, viewport, status: 'queued' });
  }

  const skipped = viewports.length - createdJobs.length;
  const freeDeduped = createdJobs.filter((j) => j.status === 'completed').length;
  return c.json(
    {
      success: true,
      data: {
        jobs: createdJobs,
        url: payload.url,
        // Template-deduped viewports completed instantly from the edge cache
        // and consumed no optimization credits.
        freeDeduped,
        ...(skipped > 0
          ? { skippedViewports: skipped, note: 'Some viewports were skipped — monthly credits exhausted.' }
          : {}),
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
  const organizationId = c.get('organizationId') || null;
  const scopeClause = organizationId ? '(s.user_id = ? OR s.organization_id = ?)' : 's.user_id = ?';
  const scopeParams = organizationId ? [userId, organizationId] : [userId];

  const { results: jobs } = await c.env.DB.prepare(`
    SELECT j.*, s.domain as site_domain
    FROM optimization_jobs j
    JOIN sites s ON j.site_id = s.id
    WHERE ${scopeClause} AND j.status IN ('failed', 'needs_attention')
    ORDER BY j.created_at DESC
    LIMIT 50
  `)
    .bind(...scopeParams)
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
     WHERE ${organizationId ? '(user_id = ? OR organization_id = ?)' : 'user_id = ?'} AND health_json IS NOT NULL
     ORDER BY updated_at DESC LIMIT 100`
  )
    .bind(...scopeParams)
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
  const organizationId = c.get('organizationId') || null;

  const job = await c.env.DB.prepare(`
    SELECT j.*, s.domain
    FROM optimization_jobs j
    JOIN sites s ON j.site_id = s.id
    WHERE j.id = ? ${organizationId ? 'AND (s.user_id = ? OR s.organization_id = ?)' : 'AND s.user_id = ?'}
  `)
    .bind(...(organizationId ? [jobId, userId, organizationId] : [jobId, userId]))
    .first<{ id: string; site_id: string; url: string; viewport: ViewportMode; domain: string }>();

  if (!job) {
    return c.json({ success: false, error: 'Job not found' }, 404);
  }

  const loaded = await loadSubscriptionForSite(c.env, job.site_id);
  if (!loaded) {
    return c.json(
      { success: false, code: 'SUBSCRIPTION_REQUIRED', error: 'No active subscription for this site.' },
      402
    );
  }
  const fleetActive = await countActiveFleetJobs(c.env, loaded.subscription.id);
  if (fleetActive >= loaded.plan.maxConcurrentJobs) {
    return c.json(
      {
        success: false,
        code: 'CONCURRENCY_LIMIT',
        error: `Plan concurrency limit reached (${loaded.plan.maxConcurrentJobs} concurrent optimizations).`,
      },
      429
    );
  }

  const reservation = await reserveCredits(c.env, loaded.subscription, {
    units: 1,
    runKey: `rerun_${jobId}_${Date.now()}`,
    jobId,
    source: 'rerun',
  });
  if (!reservation.ok) {
    return quotaError(c, reservation);
  }

  // Update status in D1
  await c.env.DB.prepare(
    "UPDATE optimization_jobs SET status = 'queued', priority = ?, credit_reservation_id = ?, attempts = attempts + 1, created_at = unixepoch(), completed_at = NULL WHERE id = ?"
  )
    .bind(jobPriorityForPlan(loaded.plan), reservation.reservationId, jobId)
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
      await c.env.DB.prepare("UPDATE optimization_jobs SET status = 'failed' WHERE id = ?").bind(jobId).run();
      await c.env.KV.delete(`job:${jobId}`);
      await releaseReservationForJob(c.env, jobId);
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
      'SELECT id FROM sites WHERE id = ? AND domain = ? AND site_api_key_hash = ? AND is_active = 1'
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
    let orgId = verified?.orgId || '';
    if (!userId && c.env.ENVIRONMENT !== 'production' && token.startsWith('user_')) {
      userId = token;
      orgId = c.req.header('X-Organization-Id') || '';
    }
    if (!userId) {
      return c.json({ success: false, error: 'Unauthorized' }, 401);
    }
    const owned = await c.env.DB.prepare(
      orgId
        ? 'SELECT id FROM sites WHERE id = ? AND is_active = 1 AND (user_id = ? OR organization_id = ?)'
        : 'SELECT id FROM sites WHERE id = ? AND is_active = 1 AND user_id = ?'
    )
      .bind(...(orgId ? [siteId, userId, orgId] : [siteId, userId]))
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
    'SELECT id FROM sites WHERE domain = ? AND site_api_key_hash = ? AND is_active = 1'
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
     WHERE site_id = ? AND viewport = ? AND status = "completed"
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

