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

const app = new Hono<{ Bindings: Env; Variables: AppVariables }>();

// Global Middlewares
app.use('*', traceMiddleware);
app.use('*', corsMiddleware);
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

// Mount Routes
app.route('/api/v1/auth', authRoutes);
app.route('/api/v1/auth', clerkWebhookRoutes);
app.route('/api/v1/sites', siteRoutes);
app.route('/api/v1/optimize', optimizeRoutes);
app.route('/api/v1/billing', billingRoutes);
app.route('/api/v1/assets', assetRoutes);

// Export Cloudflare Worker Handlers
export default {
  fetch: app.fetch,
  async queue(batch: any, env: Env): Promise<void> {
    await processOptimizationQueue(batch, env);
  },
};
