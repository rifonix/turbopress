import { Hono } from 'hono';
import { Env, AppVariables } from '../types/env.js';
import { OptimizationDispatchSchema, generateJobId, ViewportMode } from '@turbopress/shared';
import { siteAuthMiddleware } from '../middleware/auth.js';

export const optimizeRoutes = new Hono<{ Bindings: Env; Variables: AppVariables }>();

/**
 * Dispatch Optimization Job (Critical CSS & LCP Candidate extraction)
 * POST /api/v1/optimize/dispatch
 */
optimizeRoutes.post('/dispatch', siteAuthMiddleware, async (c) => {
  const site = c.get('site')!;
  const body = await c.req.json();
  const payload = OptimizationDispatchSchema.parse(body);

  const viewports: ViewportMode[] = payload.viewports && payload.viewports.length > 0 ? payload.viewports : ['mobile', 'desktop'];
  const createdJobs: Array<{ jobId: string; viewport: ViewportMode; status: string }> = [];

  for (const viewport of viewports) {
    const jobId = generateJobId();

    // Insert into D1
    await c.env.DB.prepare(`
      INSERT INTO optimization_jobs (id, site_id, url, viewport, status, attempts, created_at)
      VALUES (?, ?, ?, ?, 'queued', 0, unixepoch())
    `)
      .bind(jobId, site.id, payload.url, viewport)
      .run();

    // Cache initial status in KV
    await c.env.KV.put(
      `job:${jobId}`,
      JSON.stringify({ status: 'queued', url: payload.url, viewport }),
      { expirationTtl: 3600 }
    );

    // Push message to Cloudflare Queue
    await c.env.OPTIMIZATION_QUEUE.send({
      jobId,
      siteId: site.id,
      url: payload.url,
      viewport,
      attempt: 1,
    });

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
 * Check Optimization Job Status
 * GET /api/v1/optimize/status/:job_id
 */
optimizeRoutes.get('/status/:job_id', async (c) => {
  const jobId = c.req.param('job_id');

  // Fast KV cache lookup
  const cached = await c.env.KV.get(`job:${jobId}`, 'json');
  if (cached) {
    return c.json({
      success: true,
      data: cached,
    });
  }

  // Fallback to D1
  const job = await c.env.DB.prepare(
    'SELECT * FROM optimization_jobs WHERE id = ?'
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
