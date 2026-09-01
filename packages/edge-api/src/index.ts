import { Hono } from 'hono';
import { Env, AppVariables } from './types/env.js';
import { corsMiddleware } from './middleware/cors.js';
import { traceMiddleware } from './middleware/trace.js';
import { errorHandler } from './middleware/error.js';
import { authRoutes } from './routes/auth.js';
import { clerkWebhookRoutes } from './routes/clerk-webhook.js';
import { siteRoutes } from './routes/sites.js';
import { optimizeRoutes } from './routes/optimize.js';
import { billingRoutes } from './routes/billing.js';
import { assetRoutes } from './routes/assets.js';
import { embedRoutes } from './routes/embed.js';
import { processOptimizationQueue } from './services/queue-consumer.js';
import { processDlqBatch, runSweeper } from './services/maintenance.js';

const app = new Hono<{ Bindings: Env; Variables: AppVariables }>();

// API Middlewares
app.use('/api/*', traceMiddleware);
app.use('/api/*', corsMiddleware);
app.use('/health', traceMiddleware);
app.use('/health', corsMiddleware);
app.onError(errorHandler);

// Health Check & Worker Trace Diagnostic
app.get('/health', (c) => {
  return c.json({
    status: 'ok',
    service: 'WP Instant Edge Engine API',
    timestamp: Date.now(),
    environment: c.env.ENVIRONMENT || 'production',
  });
});

app.get('/api/v1/trace', (c) => {
  return c.json({
    status: 'ok',
    traceId: c.req.header('cf-ray') || 'local-trace',
    timestamp: new Date().toISOString(),
    colo: (c.req.raw as any)?.cf?.colo || 'LOCAL',
    region: (c.req.raw as any)?.cf?.country || 'GLOBAL',
    headers: {
      host: c.req.header('host'),
      userAgent: c.req.header('user-agent'),
      cfConnectingIp: c.req.header('cf-connecting-ip'),
    },
  });
});

// Mount API Routes
app.route('/api/v1/auth', authRoutes);
app.route('/api/v1/auth', clerkWebhookRoutes);
app.route('/api/v1/sites', siteRoutes);
app.route('/api/v1/optimize', optimizeRoutes);
app.route('/api/v1/billing', billingRoutes);
app.route('/api/v1/assets', assetRoutes);
app.route('/api/v1/embed', embedRoutes);

// Export Cloudflare Worker Handlers
export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const pathname = new URL(request.url).pathname;

    // API endpoints and health checks
    if (pathname.startsWith('/api/') || pathname === '/health') {
      return app.fetch(request, env, ctx);
    }

    // This worker is API + CDN only (api.wpinstant.com serves the control
    // plane; cdn.wpinstant.com serves visitor-facing media/CSS from R2).
    // The dashboard lives on the wpinstant-app worker (wpinstant.com).
    return new Response(JSON.stringify({ success: false, error: 'Not found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    });
  },

  async queue(batch: any, env: Env): Promise<void> {
    if (batch.queue === 'wpinstant-dlq') {
      await processDlqBatch(batch, env);
      return;
    }
    await processOptimizationQueue(batch, env);
  },

  // Cron: reap zombie jobs + enforce end-of-period deactivation.
  async scheduled(_event: any, env: Env, _ctx: ExecutionContext): Promise<void> {
    await runSweeper(env);
  },
};
