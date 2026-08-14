import { Hono } from 'hono';
import { Env, AppVariables } from '../types/env.js';
import {
  HandshakeRequestSchema,
  generateApiKey,
  generateSiteId,
  sha256,
  normalizeDomain,
  PRESET_LUDICROUS,
} from '@turbopress/shared';
import { siteAuthMiddleware, saasUserAuthMiddleware } from '../middleware/auth.js';

export const authRoutes = new Hono<{ Bindings: Env; Variables: AppVariables }>();

/**
 * 1-Click Handshake: Pair WordPress Plugin with SaaS Account
 * POST /api/v1/auth/pair
 */
authRoutes.post('/pair', saasUserAuthMiddleware, async (c) => {
  const body = await c.req.json();
  const payload = HandshakeRequestSchema.parse(body);

  const userId = c.get('userId')!;
  const userEmail = c.get('userEmail') || 'user@turbopress.io';
  const domain = normalizeDomain(payload.domain);

  // 1. Ensure User exists in D1
  await c.env.DB.prepare(
    'INSERT OR IGNORE INTO users (id, email) VALUES (?, ?)'
  )
    .bind(userId, userEmail)
    .run();

  // 2. Check Polar Subscription / Entitlements
  const subscription = await c.env.DB.prepare(
    'SELECT id, plan_id, status, max_sites FROM subscriptions WHERE user_id = ? AND status IN ("active", "trialing") ORDER BY created_at DESC LIMIT 1'
  )
    .bind(userId)
    .first<{ id: string; plan_id: string; status: string; max_sites: number }>();

  // Default demo / starter subscription if none yet created
  const subscriptionId = subscription?.id || `sub_starter_${userId}`;
  const maxSites = subscription?.max_sites || 5;

  if (!subscription) {
    await c.env.DB.prepare(
      'INSERT OR IGNORE INTO subscriptions (id, user_id, plan_id, status, max_sites, current_period_end) VALUES (?, ?, ?, ?, ?, ?)'
    )
      .bind(subscriptionId, userId, 'plan_starter', 'active', maxSites, Math.floor(Date.now() / 1000) + 86400 * 365)
      .run();
  }

  // 3. Check site count limit
  const countResult = await c.env.DB.prepare(
    'SELECT COUNT(*) as count FROM sites WHERE user_id = ? AND is_active = 1'
  )
    .bind(userId)
    .first<{ count: number }>();

  const currentCount = countResult?.count || 0;
  if (currentCount >= maxSites) {
    // Check if re-pairing the exact same domain
    const existing = await c.env.DB.prepare(
      'SELECT id FROM sites WHERE domain = ? AND user_id = ?'
    )
      .bind(domain, userId)
      .first<{ id: string }>();

    if (!existing) {
      return c.json(
        {
          success: false,
          error: `Site limit reached (${maxSites} max). Please upgrade your Turbopress subscription.`,
        },
        403
      );
    }
  }

  // 4. Generate API Key and Hash
  const apiKey = generateApiKey('sk_live_');
  const apiKeyHash = await sha256(apiKey);
  const siteId = generateSiteId();
  const initialConfig = PRESET_LUDICROUS;
  const configJson = JSON.stringify(initialConfig);

  // 5. Insert or Update in D1
  await c.env.DB.prepare(`
    INSERT INTO sites (id, user_id, subscription_id, domain, site_api_key_hash, config_json, is_active, wp_version, plugin_version, last_ping_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?, unixepoch(), unixepoch())
    ON CONFLICT(domain) DO UPDATE SET
      site_api_key_hash = excluded.site_api_key_hash,
      subscription_id = excluded.subscription_id,
      is_active = 1,
      wp_version = excluded.wp_version,
      plugin_version = excluded.plugin_version,
      last_ping_at = unixepoch(),
      updated_at = unixepoch()
  `)
    .bind(
      siteId,
      userId,
      subscriptionId,
      domain,
      apiKeyHash,
      configJson,
      payload.wp_version || null,
      payload.plugin_version || null
    )
    .run();

  // Retrieve actual site ID in case of conflict update
  const siteRow = await c.env.DB.prepare(
    'SELECT id FROM sites WHERE domain = ?'
  )
    .bind(domain)
    .first<{ id: string }>();

  const activeSiteId = siteRow?.id || siteId;

  // 6. Populate KV Cache for ultra-fast verification
  await c.env.KV.put(
    `site:${domain}`,
    JSON.stringify({
      id: activeSiteId,
      user_id: userId,
      domain,
      site_api_key_hash: apiKeyHash,
      config_json: configJson,
      is_active: 1,
    }),
    { expirationTtl: 3600 }
  );

  return c.json({
    success: true,
    data: {
      siteId: activeSiteId,
      domain,
      apiKey,
      config: initialConfig,
      message: 'Site successfully paired with Turbopress Edge Engine',
    },
  });
});

/**
 * Verify Site Token & Sync Settings
 * POST /api/v1/auth/verify
 */
authRoutes.post('/verify', siteAuthMiddleware, async (c) => {
  const site = c.get('site')!;
  const config = c.get('siteConfig')!;
  const wpVersion = c.req.header('X-WP-Version');
  const pluginVersion = c.req.header('X-Turbopress-Version');

  // Update ping metadata in background
  if (wpVersion || pluginVersion) {
    await c.env.DB.prepare(
      'UPDATE sites SET wp_version = coalesce(?, wp_version), plugin_version = coalesce(?, plugin_version), last_ping_at = unixepoch() WHERE id = ?'
    )
      .bind(wpVersion || null, pluginVersion || null, site.id)
      .run();
  }

  return c.json({
    success: true,
    data: {
      siteId: site.id,
      domain: site.domain,
      isActive: Boolean(site.is_active),
      config,
    },
  });
});
