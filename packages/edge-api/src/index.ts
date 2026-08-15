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
import { processOptimizationQueue } from './services/queue-consumer.js';

// @ts-ignore - OpenNext worker handler generated during build
import openNextHandler from '../../saas-app/.open-next/worker.js';

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
    service: 'Turbopress Edge Engine API',
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

// Export Cloudflare Worker Handlers
export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    // Route API endpoints and health checks to Hono
    if (url.pathname.startsWith('/api/') || url.pathname === '/health') {
      return app.fetch(request, env, ctx);
    }

    // Delegate all multi-page Next.js application routes & assets to OpenNext
    if (openNextHandler && typeof openNextHandler.fetch === 'function') {
      return (await openNextHandler.fetch(request as any, env as any, ctx as any)) as unknown as Response;
    }

    // Fallback to static assets
    if (env.ASSETS) {
      return (await env.ASSETS.fetch(request as any)) as unknown as Response;
    }

    return new Response('Not found', { status: 404 });
  },

  async queue(batch: any, env: Env): Promise<void> {
    await processOptimizationQueue(batch, env);
  },
};
