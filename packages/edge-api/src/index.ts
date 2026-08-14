import { Hono } from 'hono';
import { Env, AppVariables } from './types/env.js';
import { corsMiddleware } from './middleware/cors.js';
import { errorHandler } from './middleware/error.js';
import { authRoutes } from './routes/auth.js';
import { siteRoutes } from './routes/sites.js';
import { optimizeRoutes } from './routes/optimize.js';
import { billingRoutes } from './routes/billing.js';
import { assetRoutes } from './routes/assets.js';
import { processOptimizationQueue } from './services/queue-consumer.js';

const app = new Hono<{ Bindings: Env; Variables: AppVariables }>();

// Global Middlewares
app.use('*', corsMiddleware);
app.onError(errorHandler);

// Health Check
app.get('/health', (c) => {
  return c.json({
    status: 'ok',
    service: 'Turbopress Edge Engine API',
    timestamp: Date.now(),
    environment: c.env.ENVIRONMENT || 'development',
  });
});

// Mount Routes
app.route('/api/v1/auth', authRoutes);
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
