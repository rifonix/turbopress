import { Hono } from 'hono';
import { Env, AppVariables } from '../types/env.js';
import {
  HandshakeRequestSchema,
  generateApiKey,
  generateSiteId,
  sha256,
  normalizeDomain,
  PRESET_LUDICROUS,
} from '@wpinstant/shared';
import { siteAuthMiddleware, saasUserAuthMiddleware } from '../middleware/auth.js';
import {
  resolveBillingScope,
  loadSubscriptionForScope,
  recordTrafficUsage,
  BillingScope,
} from '../services/entitlements.js';

function siteScopeClause(scope: BillingScope, prefix = ''): string {
  const col = prefix ? `${prefix}.` : '';
  if (scope.organizationId) {
    return `(${col}organization_id = ? OR (${col}organization_id IS NULL AND ${col}user_id = ?))`;
  }
  return `${col}user_id = ?`;
}

function siteScopeBindings(scope: BillingScope): string[] {
  if (scope.organizationId) {
    return [scope.organizationId, (scope.userId || '') as string];
  }
  return [(scope.userId || '') as string];
}

export const authRoutes = new Hono<{ Bindings: Env; Variables: AppVariables }>();

/**
 * 1-Click Handshake: Pair WordPress Plugin with SaaS Account
 * POST /api/v1/auth/pair
 */
authRoutes.post('/pair', saasUserAuthMiddleware, async (c) => {
  const body = await c.req.json();
  const payload = HandshakeRequestSchema.parse(body);

  const scope = resolveBillingScope(c.var);
  const userId = scope.userId;
  const organizationId = scope.organizationId || null;
  const userEmail = c.get('userEmail') || 'user@wpinstant.dev';
  const domain = normalizeDomain(payload.domain);

  // Open-redirect hardening: the API key is appended to return_url, so the
  // return URL must provably belong to the site being paired. Host must
  // match the paired domain (www-insensitive) and be https (http allowed
  // only for localhost dev).
  let parsedReturn: URL;
  try {
    parsedReturn = new URL(payload.return_url);
  } catch {
    return c.json({ success: false, error: 'Invalid return_url' }, 400);
  }
  const returnHost = normalizeDomain(parsedReturn.hostname);
  const isLocalhost = returnHost === 'localhost' || returnHost === '127.0.0.1';
  if (parsedReturn.protocol !== 'https:' && !isLocalhost) {
    return c.json({ success: false, error: 'return_url must use https' }, 400);
  }
  if (returnHost !== domain) {
    return c.json(
      { success: false, error: 'return_url host does not match the paired domain' },
      400
    );
  }

  // 1. Ensure User exists in D1
  await c.env.DB.prepare(
    'INSERT OR IGNORE INTO users (id, email) VALUES (?, ?)'
  )
    .bind(userId, userEmail)
    .run();

  // 2. Check Polar Subscription / Entitlements (PLAN GATING)
  const subResult = await loadSubscriptionForScope(c.env, scope);

  if (!subResult) {
    return c.json(
      {
        success: false,
        code: 'SUBSCRIPTION_REQUIRED',
        error: 'Active subscription required. Please purchase a WP Instant plan to connect your WordPress site.',
      },
      402
    );
  }

  const subscription = subResult.subscription;
  const subscriptionId = subscription.id;
  const maxSites = subscription.max_sites || subResult.plan.maxSites || 5;

  // 3. Check site count limit within this billing scope
  const whereClause = siteScopeClause(scope);
  const bindings = siteScopeBindings(scope);
  const countResult = await c.env.DB.prepare(
    `SELECT COUNT(*) as count FROM sites WHERE ${whereClause} AND is_active = 1`
  )
    .bind(...bindings)
    .first<{ count: number }>();

  const currentCount = countResult?.count || 0;
  if (currentCount >= maxSites) {
    // Check if re-pairing the exact same domain within this scope
    const existing = await c.env.DB.prepare(
      `SELECT id FROM sites WHERE domain = ? AND ${whereClause}`
    )
      .bind(domain, ...bindings)
      .first<{ id: string }>();

    if (!existing) {
      return c.json(
        {
          success: false,
          error: `Site limit reached (${maxSites} max). Please upgrade your WP Instant subscription.`,
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

  // 5. Insert or Update in D1. The WHERE clause on the UPSERT is the
  // ownership check: if the domain row exists but belongs to a DIFFERENT
  // tenant, the update is a no-op (0 changes) and we refuse the pairing.
  const upsert = await c.env.DB.prepare(`
    INSERT INTO sites (id, user_id, organization_id, subscription_id, domain, site_api_key_hash, config_json, is_active, wp_version, plugin_version, last_ping_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?, unixepoch(), unixepoch())
    ON CONFLICT(domain) DO UPDATE SET
      site_api_key_hash = excluded.site_api_key_hash,
      subscription_id = excluded.subscription_id,
      organization_id = COALESCE(excluded.organization_id, sites.organization_id),
      is_active = 1,
      wp_version = excluded.wp_version,
      plugin_version = excluded.plugin_version,
      last_ping_at = unixepoch(),
      updated_at = unixepoch()
    WHERE sites.user_id = excluded.user_id OR (excluded.organization_id IS NOT NULL AND sites.organization_id = excluded.organization_id)
  `)
    .bind(
      siteId,
      userId,
      organizationId,
      subscriptionId,
      domain,
      apiKeyHash,
      configJson,
      payload.wp_version || null,
      payload.plugin_version || null
    )
    .run();

  if ((upsert.meta?.changes ?? 0) === 0) {
    return c.json(
      {
        success: false,
        code: 'DOMAIN_OWNED_BY_OTHER_ACCOUNT',
        error: 'This domain is already paired to a different WP Instant account. Contact support to transfer ownership.',
      },
      409
    );
  }

  // Retrieve actual site ID in case of conflict update
  const siteRow = await c.env.DB.prepare(
    `SELECT id FROM sites WHERE domain = ? AND ${whereClause}`
  )
    .bind(domain, ...bindings)
    .first<{ id: string }>();

  const activeSiteId = siteRow?.id || siteId;

  // 6. Populate KV Cache for ultra-fast verification
  await c.env.KV.put(
    `site:${domain}`,
    JSON.stringify({
      id: activeSiteId,
      user_id: userId,
      organization_id: organizationId,
      domain,
      site_api_key_hash: apiKeyHash,
      config_json: configJson,
      is_active: 1,
    }),
    { expirationTtl: 3600 }
  );

  // 6b. Bind the handshake state nonce to this domain+user (single-use,
  // 1h TTL). The plugin presents it on /verify, closing the loop on
  // "state was issued for THIS pairing" instead of just echoing it back.
  await c.env.KV.put(
    `pair_state:${payload.state}`,
    JSON.stringify({ domain, userId }),
    { expirationTtl: 3600 }
  );

  // 6c. OAuth-style redeem: the API key NEVER travels in the browser
  // redirect URL. It waits in KV (single-use, 10 min); the plugin exchanges
  // the state for it server-to-server via POST /auth/redeem.
  await c.env.KV.put(
    `pair_redeem:${payload.state}`,
    JSON.stringify({ apiKey, siteId: activeSiteId, domain }),
    { expirationTtl: 600 }
  );

  // 7. Construct Callback URL for WordPress return (no credentials in URL)
  const callbackUrl = (() => {
    try {
      const parsed = new URL(payload.return_url);
      parsed.searchParams.set('wp_instant_pair', '1');
      parsed.searchParams.set('state', payload.state);
      return parsed.toString();
    } catch {
      const sep = payload.return_url.includes('?') ? '&' : '?';
      return `${payload.return_url}${sep}wp_instant_pair=1&state=${encodeURIComponent(payload.state)}`;
    }
  })();

  return c.json({
    success: true,
    data: {
      siteId: activeSiteId,
      domain,
      apiKey,
      config: initialConfig,
      callback_url: callbackUrl,
      message: 'Site successfully paired with WP Instant Edge Engine',
    },
  });
});

/**
 * Redeem Handshake API Key (OAuth-style code exchange)
 * POST /api/v1/auth/redeem
 *
 * The plugin exchanges the single-use state nonce (delivered through the
 * host-validated return URL) for the actual API key, server-to-server.
 * No browser URL ever carries the key.
 */
authRoutes.post('/redeem', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const state = typeof body.state === 'string' ? body.state : '';
  const domain = typeof body.domain === 'string' ? normalizeDomain(body.domain) : '';
  if (state.length < 6 || !domain) {
    return c.json({ success: false, error: 'state and domain are required' }, 400);
  }

  const key = `pair_redeem:${state}`;
  const pending = await c.env.KV.get<{ apiKey: string; siteId: string; domain: string }>(key, 'json');
  if (!pending || pending.domain !== domain) {
    return c.json({ success: false, error: 'Invalid or expired handshake state' }, 403);
  }

  // Single-use: consume before responding.
  await c.env.KV.delete(key);

  return c.json({
    success: true,
    data: { apiKey: pending.apiKey, siteId: pending.siteId },
  });
});
/**
 * Verify Site Token & Sync Settings
 * POST /api/v1/auth/verify
 *
 * Body: { callback_secret?: string, site_url?: string, state?: string }
 * The plugin shares its HMAC callback secret here so the queue consumer can
 * sign optimization-callback pushes (instant critical CSS delivery instead
 * of plugin-side cron polling).
 */
authRoutes.post('/verify', siteAuthMiddleware, async (c) => {
  const site = c.get('site')!;
  const config = c.get('siteConfig')!;
  const wpVersion = c.req.header('X-WP-Version');
  const pluginVersion = c.req.header('X-WP-Instant-Version');

  let callbackSecret: string | null = null;
  let siteUrl: string | null = null;
  let wpConfig: Record<string, any> | null = null;
  let handshakeState: string | null = null;
  try {
    const body = (await c.req.json()) as {
      callback_secret?: string;
      site_url?: string;
      config?: Record<string, any>;
      state?: string;
    };
    if (typeof body?.callback_secret === 'string' && body.callback_secret.length >= 32) {
      callbackSecret = body.callback_secret;
    }
    if (typeof body?.site_url === 'string' && /^https?:\/\//i.test(body.site_url)) {
      siteUrl = body.site_url;
    }
    if (body?.config && typeof body.config === 'object' && !Array.isArray(body.config)) {
      wpConfig = body.config;
    }
    if (typeof body?.state === 'string' && body.state.length >= 6) {
      handshakeState = body.state;
    }
  } catch {
    // Empty/invalid body: header-only verify (legacy plugin versions).
  }

  // Handshake state binding (single-use): when the plugin presents the
  // state from its pairing redirect, it MUST map to this site in KV —
  // proves the key was delivered through the legitimate handshake.
  if (handshakeState) {
    const stateKey = `pair_state:${handshakeState}`;
    const binding = await c.env.KV.get<{ domain: string; userId: string }>(stateKey, 'json');
    if (!binding || binding.domain !== site.domain) {
      return c.json({ success: false, error: 'Invalid or expired handshake state' }, 403);
    }
    await c.env.KV.delete(stateKey);
  }

  // Sync the plugin's effective config into D1. Authority model: the
  // PLUGIN owns deployment.status unless the SaaS dashboard explicitly
  // issued a Deploy/Test command (persisted with source='dashboard').
  let configJson: string | null = null;
  if (wpConfig) {
    const merged: Record<string, any> = { ...wpConfig };
    const edgeDep = (config as Record<string, any>)?.deployment;
    const wpDep = merged.deployment;

    if (edgeDep?.source === 'dashboard' && (edgeDep.status === 'test' || edgeDep.status === 'live')) {
      // Dashboard command pending adoption: keep the dashboard value so
      // the plugin converges to it via the config in this response.
      merged.deployment = { ...edgeDep };
    } else if (wpDep && typeof wpDep === 'object') {
      // Plugin-authoritative: mirror the plugin's deployment, drop any
      // stale/foreign provenance marker.
      const { source: _ignored, ...pluginDep } = wpDep as Record<string, any>;
      merged.deployment = pluginDep;
    }
    // PHP round-trip fix: an empty associative array arrives as [] which
    // is not a valid record — normalize to {}.
    if (merged.plugins && Array.isArray((merged.plugins as any).unload_rules)) {
      (merged.plugins as any).unload_rules = {};
    }
    try {
      configJson = JSON.stringify(merged);
    } catch {
      configJson = null;
    }
  }

  await c.env.DB.prepare(
    `UPDATE sites SET
       wp_version = coalesce(?, wp_version),
       plugin_version = coalesce(?, plugin_version),
       callback_secret = coalesce(?, callback_secret),
       site_url = coalesce(?, site_url),
       config_json = coalesce(?, config_json),
       last_ping_at = unixepoch()
     WHERE id = ?`
  )
    .bind(wpVersion || null, pluginVersion || null, callbackSecret, siteUrl, configJson, site.id)
    .run();

  // Secret rotation: drop the media-signature secret cache so freshly signed
  // asset URLs verify immediately instead of failing for up to an hour.
  if (callbackSecret) {
    await c.env.KV.delete(`msecret:${site.id}`).catch(() => {});
  }

  // Keep the KV verification cache in sync when the config changed.
  if (configJson) {
    try {
      const cachedRaw = await c.env.KV.get(`site:${site.domain}`);
      if (cachedRaw) {
        const cached = JSON.parse(cachedRaw);
        cached.config_json = configJson;
        await c.env.KV.put(`site:${site.domain}`, JSON.stringify(cached), { expirationTtl: 3600 });
      }
    } catch {
      // KV update is best-effort; D1 is authoritative.
    }
  }

  // Response config: prefer the freshly merged config so a pending
  // dashboard-issued Deploy/Test command reaches the plugin immediately.
  let responseConfig = config;
  if (configJson) {
    try {
      responseConfig = JSON.parse(configJson);
    } catch {
      responseConfig = config;
    }
  }

  return c.json({
    success: true,
    data: {
      siteId: site.id,
      domain: site.domain,
      isActive: Boolean(site.is_active),
      config: responseConfig,
    },
  });
});

/**
 * Plugin Health Heartbeat + Deployment Command Channel
 * POST /api/v1/auth/heartbeat
 *
 * Body: the plugin's health report ({ checked_at, checks: [...],
 * deployment: { status }, auto_degrade: {...} }).
 * - Persisted to sites.health_json (capped) for the SaaS dashboard.
 * - Deployment reconciliation: D1's deployment.status is authoritative
 *   (set from the SaaS dashboard). If the plugin reports a different
 *   status, the response carries data.apply.deployment so the plugin
 *   converges to it.
 */
authRoutes.post('/heartbeat', siteAuthMiddleware, async (c) => {
  const site = c.get('site')!;

  let parsed: any = null;
  let healthJson: string | null = null;
  try {
    const body = await c.req.text();
    if (body.length > 0 && body.length <= 16384) {
      parsed = JSON.parse(body); // validate JSON before persisting
      healthJson = body;
    }
  } catch {
    return c.json({ success: false, error: 'Invalid JSON payload' }, 400);
  }

  await c.env.DB.prepare(
    'UPDATE sites SET health_json = ?, last_ping_at = unixepoch(), updated_at = unixepoch() WHERE id = ?'
  )
    .bind(healthJson, site.id)
    .run();

  // Deployment reconciliation. Authority model:
  // - D1 deployment with source='dashboard' = pending SaaS command → tell
  //   the plugin to adopt it.
  // - Otherwise the PLUGIN is authoritative → adopt its status into D1 so
  //   the dashboard reflects reality (plugin-local Test Mode entry, older
  //   plugins, manual option edits).
  const apply: Record<string, any> = {};
  const pluginStatus = parsed?.deployment?.status;
  if (pluginStatus === 'test' || pluginStatus === 'live') {
    const row = await c.env.DB.prepare('SELECT config_json FROM sites WHERE id = ?')
      .bind(site.id)
      .first<{ config_json: string | null }>();
    let edgeDep: any = null;
    try {
      edgeDep = row?.config_json ? JSON.parse(row.config_json)?.deployment : null;
    } catch {
      edgeDep = null;
    }

    if (
      edgeDep?.source === 'dashboard' &&
      (edgeDep.status === 'test' || edgeDep.status === 'live') &&
      edgeDep.status !== pluginStatus
    ) {
      apply.deployment = { status: edgeDep.status, source: 'dashboard' };
    } else if (edgeDep?.status !== pluginStatus) {
      // Adopt the plugin-reported status (strip provenance) unless a
      // dashboard command is pending.
      try {
        const cfg = row?.config_json ? JSON.parse(row.config_json) : {};
        if (cfg && typeof cfg === 'object') {
          cfg.deployment = { ...(cfg.deployment ?? {}), status: pluginStatus };
          delete cfg.deployment.source;
          await c.env.DB.prepare('UPDATE sites SET config_json = ?, updated_at = unixepoch() WHERE id = ?')
            .bind(JSON.stringify(cfg), site.id)
            .run();
          try {
            const cachedRaw = await c.env.KV.get(`site:${site.domain}`);
            if (cachedRaw) {
              const cached = JSON.parse(cachedRaw);
              cached.config_json = JSON.stringify(cfg);
              await c.env.KV.put(`site:${site.domain}`, JSON.stringify(cached), { expirationTtl: 3600 });
            }
          } catch {
            // KV update is best-effort; D1 is authoritative.
          }
        }
      } catch {
        // Adoption is best-effort; next heartbeat retries.
      }
    }
  }

  return c.json({ success: true, ...(Object.keys(apply).length ? { data: { apply } } : {}) });
});

/**
 * RUM Telemetry Ingest (plugin → edge)
 * POST /api/v1/rum
 *
 * Body: { days: [{ day: 'YYYY-MM-DD', modes: { <mode>: { views, errors,
 * lcpP75, clsP75, pages: { path: count } } } }], degraded?: {...} }
 * Upserted into rum_daily per (site, day, mode) for trend charts and the
 * SaaS auto-degrade activity feed.
 */
authRoutes.post('/rum', siteAuthMiddleware, async (c) => {
  const site = c.get('site')!;

  let body: any;
  try {
    const raw = await c.req.text();
    if (raw.length === 0 || raw.length > 16384) {
      return c.json({ success: false, error: 'Payload out of bounds' }, 400);
    }
    body = JSON.parse(raw);
  } catch {
    return c.json({ success: false, error: 'Invalid JSON payload' }, 400);
  }

  const days = Array.isArray(body?.days) ? body.days : [];
  let stored = 0;
  let batchPageviews = 0;
  let batchBytes = 0;

  for (const dayEntry of days.slice(0, 7)) {
    const day = typeof dayEntry?.day === 'string' ? dayEntry.day : '';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) continue;
    const modes = dayEntry.modes && typeof dayEntry.modes === 'object' ? dayEntry.modes : {};

    for (const [mode, m] of Object.entries<any>(modes)) {
      if (typeof m !== 'object' || m === null) continue;
      const views = Math.max(0, Math.min(10_000_000, Math.floor(Number(m.views) || 0)));
      const errors = Math.max(0, Math.min(views, Math.floor(Number(m.errors) || 0)));
      const transferBytes = Math.max(
        0,
        Math.min(100_000_000_000, Math.floor(Number(m.transfer_bytes || m.bytes) || 0))
      );
      const lcpP75 = m.lcpP75 == null ? null : Math.max(0, Math.min(600_000, Math.round(Number(m.lcpP75))));
      const clsP75 = m.clsP75 == null ? null : Math.max(0, Math.min(1, Number(m.clsP75)));
      let pagesJson: string | null = null;
      if (m.pages && typeof m.pages === 'object') {
        const entries = Object.entries(m.pages)
          .slice(0, 20)
          .map(([p, n]) => [String(p).slice(0, 120), Math.max(0, Math.floor(Number(n) || 0))] as [string, number]);
        pagesJson = JSON.stringify(entries.filter(([, n]) => n > 0));
      }

      await c.env.DB.prepare(`
        INSERT INTO rum_daily (site_id, day, mode, pageviews, transfer_bytes, errors, lcp_p75_ms, cls_p75, error_pages_json, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, unixepoch())
        ON CONFLICT(site_id, day, mode) DO UPDATE SET
          pageviews = excluded.pageviews,
          transfer_bytes = excluded.transfer_bytes,
          errors = excluded.errors,
          lcp_p75_ms = excluded.lcp_p75_ms,
          cls_p75 = excluded.cls_p75,
          error_pages_json = excluded.error_pages_json,
          updated_at = unixepoch()
      `)
        .bind(site.id, day, mode, views, transferBytes, errors, lcpP75, clsP75, pagesJson)
        .run();
      stored++;
      batchPageviews += views;
      batchBytes += transferBytes;
    }
  }

  // Record reported traffic usage against the site's active subscription usage period
  try {
    const subQuery = site.subscription_id
      ? 'SELECT * FROM subscriptions WHERE id = ?'
      : 'SELECT * FROM subscriptions WHERE user_id = ? AND status IN ("active", "trialing") ORDER BY created_at DESC LIMIT 1';
    const subParam = site.subscription_id || site.user_id;
    const sub = await c.env.DB.prepare(subQuery).bind(subParam).first<any>();
    if (sub && (batchPageviews > 0 || batchBytes > 0)) {
      await recordTrafficUsage(c.env, sub, batchPageviews, batchBytes);
    }
  } catch (err) {
    console.warn('[RUM Ingest] Traffic recording non-fatal error:', err);
  }

  return c.json({ success: true, data: { stored } });
});

/**
 * Get current authenticated user profile & summary
 * GET /api/v1/auth/me
 */
authRoutes.get('/me', saasUserAuthMiddleware, async (c) => {
  const scope = resolveBillingScope(c.var);
  const userId = scope.userId;
  const userEmail = c.get('userEmail') || 'user@wpinstant.dev';

  const user = await c.env.DB.prepare(
    'SELECT * FROM users WHERE id = ?'
  )
    .bind(userId)
    .first();

  const subResult = await loadSubscriptionForScope(c.env, scope);
  const subscription = subResult?.subscription || null;

  const whereClause = siteScopeClause(scope);
  const bindings = siteScopeBindings(scope);
  const countRow = await c.env.DB.prepare(
    `SELECT COUNT(*) as site_count FROM sites WHERE ${whereClause}`
  )
    .bind(...bindings)
    .first<{ site_count: number }>();

  return c.json({
    success: true,
    data: {
      user: {
        id: userId,
        email: userEmail,
        ...(user || {}),
      },
      organizationId: scope.organizationId || null,
      organizationRole: c.get('organizationRole') || null,
      hasActivePlan: Boolean(subscription),
      subscription: subscription || null,
      plan: subResult?.plan || null,
      siteCount: countRow?.site_count || 0,
    },
  });
});

