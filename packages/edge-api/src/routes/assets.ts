import { Hono } from 'hono';
import { Env, AppVariables } from '../types/env.js';

export const assetRoutes = new Hono<{ Bindings: Env; Variables: AppVariables }>();

/**
 * Proxy & Serve Generated Critical CSS directly from R2
 * GET /api/v1/assets/css/:site_id/:css_file
 */
assetRoutes.get('/css/:site_id/:css_file', async (c) => {
  const siteId = c.req.param('site_id');
  const cssFile = c.req.param('css_file');
  const r2Key = `sites/${siteId}/css/${cssFile}`;

  const object = await c.env.ASSETS_BUCKET.get(r2Key);
  if (!object) {
    return c.text('/* Critical CSS not found */', 404, {
      'Content-Type': 'text/css; charset=utf-8',
    });
  }

  c.header('Content-Type', 'text/css; charset=utf-8');
  c.header('Cache-Control', 'public, max-age=31536000, immutable');
  c.header('Access-Control-Allow-Origin', '*');

  return c.body(object.body as any);
});
