import { MiddlewareHandler } from 'hono';
import { Env, AppVariables } from '../types/env.js';
import { sha256, normalizeDomain, Site, SiteConfig } from '@turbopress/shared';

export interface CachedSiteData {
  id: string;
  user_id: string;
  domain: string;
  site_api_key_hash: string;
  config_json: string;
  is_active: number;
}

export const siteAuthMiddleware: MiddlewareHandler<{ Bindings: Env; Variables: AppVariables }> = async (c, next) => {
  const authHeader = c.req.header('Authorization');
  const rawDomain = c.req.header('X-Site-Domain');

  if (!authHeader || !authHeader.startsWith('Bearer ') || !rawDomain) {
    return c.json({ success: false, error: 'Unauthorized: Missing Authorization or X-Site-Domain header' }, 401);
  }

  const apiKey = authHeader.replace('Bearer ', '').trim();
  const domain = normalizeDomain(rawDomain);
  const keyHash = await sha256(apiKey);

  const kvKey = `site:${domain}`;
  const cached = await c.env.KV.get<CachedSiteData>(kvKey, 'json');

  let siteData: CachedSiteData | null = cached;

  if (!siteData) {
    // Fallback query to D1 SQL
    const row = await c.env.DB.prepare(
      'SELECT id, user_id, domain, site_api_key_hash, config_json, is_active FROM sites WHERE domain = ? LIMIT 1'
    )
      .bind(domain)
      .first<CachedSiteData>();

    if (!row) {
      return c.json({ success: false, error: 'Site not registered' }, 401);
    }

    siteData = row;
    // Cache in KV for 1 hour
    await c.env.KV.put(kvKey, JSON.stringify(siteData), { expirationTtl: 3600 });
  }

  if (siteData.site_api_key_hash !== keyHash) {
    return c.json({ success: false, error: 'Invalid API Key' }, 403);
  }

  if (!siteData.is_active) {
    return c.json({ success: false, error: 'Site license is inactive or subscription expired' }, 403);
  }

  let parsedConfig: SiteConfig;
  try {
    parsedConfig = JSON.parse(siteData.config_json);
  } catch {
    parsedConfig = {} as SiteConfig;
  }

  c.set('site', siteData as unknown as Site);
  c.set('siteConfig', parsedConfig);

  await next();
};

export const saasUserAuthMiddleware: MiddlewareHandler<{ Bindings: Env; Variables: AppVariables }> = async (c, next) => {
  const authHeader = c.req.header('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return c.json({ success: false, error: 'Unauthorized: Missing user auth token' }, 401);
  }

  const token = authHeader.replace('Bearer ', '').trim();

  // In production with Clerk, decode & verify JWT or header.
  let userId = 'user_admin';
  let userEmail = 'admin@turbopress.io';

  if (token.startsWith('user_')) {
    userId = token;
    userEmail = `${userId}@users.turbopress.io`;
  } else if (token.includes('.')) {
    try {
      const parts = token.split('.');
      // Base64url decode
      const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
      const payload = JSON.parse(atob(base64));
      userId = payload.sub || userId;
      userEmail = payload.email || payload.primary_email_address || `${userId}@users.turbopress.io`;
    } catch {
      // Fallback
    }
  }

  c.set('userId', userId);
  c.set('userEmail', userEmail);

  // Auto-provision user in D1 if not present
  try {
    await c.env.DB.prepare(
      'INSERT OR IGNORE INTO users (id, email, created_at, updated_at) VALUES (?, ?, unixepoch(), unixepoch())'
    )
      .bind(userId, userEmail)
      .run();

    // Auto-provision starter subscription if none exists
    const existingSub = await c.env.DB.prepare(
      'SELECT id FROM subscriptions WHERE user_id = ? LIMIT 1'
    )
      .bind(userId)
      .first();

    if (!existingSub) {
      const subId = `sub_starter_${userId}`;
      await c.env.DB.prepare(
        'INSERT OR IGNORE INTO subscriptions (id, user_id, plan_id, status, max_sites, current_period_end, created_at, updated_at) VALUES (?, ?, ?, ?, ?, unixepoch() + 86400 * 365, unixepoch(), unixepoch())'
      )
        .bind(subId, userId, 'plan_starter', 'active', 5)
        .run();
    }
  } catch (err) {
    console.error('[saasUserAuthMiddleware] Error auto-provisioning user:', err);
  }

  await next();
};
