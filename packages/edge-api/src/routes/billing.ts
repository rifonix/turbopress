import { Hono } from 'hono';
import { Env, AppVariables } from '../types/env.js';
import { Polar } from '@polar-sh/sdk';
import { validateEvent, WebhookVerificationError } from '@polar-sh/sdk/webhooks';
import { saasUserAuthMiddleware } from '../middleware/auth.js';
import {
  PLAN_CONTRACT,
  SELF_SERVE_PLAN_IDS,
  getPlanContract,
  normalizeBillingInterval,
  normalizePlanId,
  type BillingInterval,
  type PlanId,
} from '@wpinstant/shared';
import {
  countActiveFleetJobs,
  getUsageSnapshot,
  loadSubscriptionForScope,
  resolveBillingScope,
  type SubscriptionRow,
} from '../services/entitlements.js';

export const billingRoutes = new Hono<{ Bindings: Env; Variables: AppVariables }>();

type PolarServer = 'sandbox' | 'production';

/**
 * Determine which Polar environment ('sandbox' = test checkout, 'production' = live checkout)
 * should be attempted first for the configured access token.
 *
 * Order of precedence:
 *  1. Explicit POLAR_SERVER / POLAR_ENVIRONMENT override
 *  2. Known token-prefix heuristics (polar_s_ / polar_test_ / ... -> sandbox)
 *  3. Previously probed value cached in KV (see withPolarServerRetry)
 *  4. Default: production when a token is present, sandbox otherwise
 *
 * NOTE: Polar access tokens from sandbox.polar.sh and polar.sh frequently share the
 * same `polar_pat_` prefix, so prefix sniffing alone is not reliable. The runtime
 * probe in `withPolarServerRetry` guarantees a test key always lands on the test
 * checkout and caches the result so subsequent calls are instant.
 */
export async function getPreferredPolarServer(env: Env): Promise<PolarServer> {
  // 1. Explicit override via POLAR_SERVER or POLAR_ENVIRONMENT takes top priority
  const explicit = (env.POLAR_SERVER || env.POLAR_ENVIRONMENT || '').toLowerCase();
  if (explicit === 'sandbox' || explicit === 'test') {
    return 'sandbox';
  }
  if (explicit === 'production' || explicit === 'live') {
    return 'production';
  }

  // 2. Inspect Polar access token prefix
  const polarToken = (env.POLAR_ACCESS_TOKEN || '').trim();
  if (
    polarToken.startsWith('polar_s_') ||
    polarToken.startsWith('polar_test_') ||
    polarToken.startsWith('polar_sandbox_') ||
    polarToken.startsWith('sand_') ||
    polarToken === 'polar_test_token'
  ) {
    return 'sandbox';
  }

  if (
    polarToken.startsWith('polar_o_') ||
    polarToken.startsWith('polar_at_') ||
    polarToken.startsWith('polar_live_') ||
    polarToken.startsWith('live_')
  ) {
    return 'production';
  }

  // 3. Consult the KV probe cache (keyed by token fingerprint)
  const cached = await getPolarServerFromCache(env);
  if (cached) {
    return cached;
  }

  // 4. Fallback to production if access token is provided, otherwise sandbox
  return polarToken ? 'production' : 'sandbox';
}

function polarServerCacheKey(env: Env): string {
  const token = (env.POLAR_ACCESS_TOKEN || '').trim();
  const fingerprint = token.length >= 8 ? token.slice(-8) : token || 'empty';
  return `polar:server:${fingerprint}`;
}

async function getPolarServerFromCache(env: Env): Promise<PolarServer | null> {
  try {
    const value = await env.KV.get(polarServerCacheKey(env));
    return value === 'sandbox' || value === 'production' ? value : null;
  } catch {
    return null;
  }
}

async function cachePolarServer(env: Env, server: PolarServer): Promise<void> {
  try {
    await env.KV.put(polarServerCacheKey(env), server, { expirationTtl: 86400 });
  } catch {
    // KV unavailable — probe again next time
  }
}

function isPolarAuthError(err: any): boolean {
  const status = err?.status ?? err?.statusCode ?? err?.response?.status;
  if (status === 401 || status === 403) return true;
  const msg = String(err?.message || '').toLowerCase();
  return msg.includes('invalid_token') || msg.includes('unauthorized') || msg.includes('token is invalid');
}

/**
 * Run a Polar SDK operation against the preferred server. If the token is rejected
 * (401 invalid_token etc. — which happens when a sandbox test key is used against
 * production or vice versa), transparently retry against the other environment and
 * cache the winning server in KV. This guarantees test API keys always produce a
 * Polar *test* checkout URL (sandbox.polar.sh) instead of the live checkout.
 */
async function withPolarServerRetry<T>(
  env: Env,
  fn: (client: Polar, server: PolarServer) => Promise<T>
): Promise<{ result: T; server: PolarServer }> {
  const preferred = await getPreferredPolarServer(env);
  const token = env.POLAR_ACCESS_TOKEN || 'polar_test_token';

  try {
    const result = await fn(new Polar({ accessToken: token, server: preferred }), preferred);
    return { result, server: preferred };
  } catch (err: any) {
    if (!isPolarAuthError(err)) throw err;

    const flipped: PolarServer = preferred === 'sandbox' ? 'production' : 'sandbox';
    try {
      const result = await fn(new Polar({ accessToken: token, server: flipped }), flipped);
      await cachePolarServer(env, flipped);
      console.log(`[Polar] Auto-detected ${flipped} environment for this access token`);
      return { result, server: flipped };
    } catch (retryErr: any) {
      // Neither environment accepted the token — surface what each attempt said
      const first = describePolarError(preferred, err);
      const second = describePolarError(flipped, retryErr);
      const combined = new Error(
        `Access token rejected by both Polar environments — ${first} | ${second}`
      ) as any;
      throw combined;
    }
  }
}

function describePolarError(server: PolarServer, err: any): string {
  const status = err?.status ?? err?.statusCode ?? err?.response?.status ?? 'n/a';
  const body = err?.error || err?.body || err?.response?.body;
  let detail = String(err?.message || err || 'unknown error');
  if (body) {
    try {
      const parsed = typeof body === 'string' ? JSON.parse(body) : body;
      const polarDetail = parsed?.detail;
      if (polarDetail) detail = typeof polarDetail === 'string' ? polarDetail : JSON.stringify(polarDetail);
    } catch {
      /* keep message */
    }
  }
  return `${server} (HTTP ${status}): ${detail}`;
}

/**
 * Canonical Polar Product Catalog for WP Instant (Production).
 * Automatically created via Polar API / MCP.
 */
const DEFAULT_POLAR_PRODUCTS: Record<PlanId, Record<BillingInterval, string>> = {
  starter: {
    monthly: '85cd5e34-7bce-4287-b7a4-c23801f77ba0',
    annual: '5341856b-8513-48ea-a460-054fe4caf158',
  },
  growth: {
    monthly: '79f0e741-6764-430d-89da-33edc87f2afd',
    annual: 'a70a8efc-77cc-4ebe-a633-8fb1e8c0f857',
  },
  agency: {
    monthly: '5c487ae7-a75a-48c9-a3aa-22c064599fca',
    annual: '315269ae-c534-4e48-8d13-06fef2cf05f3',
  },
  scale: {
    monthly: '',
    annual: '',
  },
};

/**
 * Resolve the Polar product ID for a self-serve plan + interval from worker
 * vars or canonical product catalog. Client-supplied product IDs are never trusted —
 * checkout is server-authoritative on (planId, interval) alone. Legacy `PRO` var names
 * are honored for `growth` until deployments rotate to the new names.
 */
function productForServer(env: Env, planId: PlanId, interval: BillingInterval): string | null {
  const readVar = (...names: string[]): string | null => {
    for (const name of names) {
      const value = (env as unknown as Record<string, unknown>)[name];
      if (typeof value === 'string' && value.length > 8) return value;
    }
    return null;
  };
  const intervalKey = interval === 'annual' ? 'ANNUAL' : 'MONTHLY';
  const planKey = planId === 'growth' ? 'GROWTH' : planId === 'agency' ? 'AGENCY' : 'STARTER';
  const fromEnv = readVar(`POLAR_PRODUCT_${planKey}_${intervalKey}`, ...(planId === 'growth' ? [`POLAR_PRODUCT_PRO_${intervalKey}`] : []));
  if (fromEnv) return fromEnv;
  return DEFAULT_POLAR_PRODUCTS[planId]?.[interval] || null;
}

/**
 * Normalize whatever Polar sends (product UUID, product name, or our checkout
 * metadata) to an internal plan id. Checkout metadata is authoritative because
 * we write it server-side; name matching is the fallback for subscriptions
 * created before this contract existed.
 */
function resolvePlanFromPolar(productId: string, productName: string, metadataPlanId: unknown): PlanId {
  const fromMetadata = normalizePlanId(metadataPlanId);
  if (fromMetadata) return fromMetadata;

  const haystack = `${productId} ${productName}`.toLowerCase();
  if (haystack.includes('enterprise')) return 'scale';
  if (haystack.includes('agency')) return 'agency';
  if (haystack.includes('growth')) return 'growth';
  if (/\bpro\b/.test(haystack)) return 'growth';
  if (haystack.includes('starter')) return 'starter';
  return 'starter';
}

function isProductNotFoundError(err: any): boolean {
  const status = err?.status ?? err?.statusCode ?? err?.response?.status;
  const msg = String(err?.message || '').toLowerCase();
  if (status === 404) return true;
  return /product.*(not found|not exist|invalid)|not found.*product/.test(msg);
}

/**
 * Look up a plan product in the org's live Polar catalog by plan name and
 * billing interval. Used to auto-resolve sandbox products, since sandbox and
 * production organizations have completely separate catalogs.
 */
async function resolveProductFromCatalog(
  client: Polar,
  planId: PlanId,
  interval: BillingInterval
): Promise<string | null> {
  const list: any = await client.products.list({ limit: 100, isArchived: false });
  const products: any[] = list?.result || list || [];
  if (products.length === 0) return null;

  const contract = PLAN_CONTRACT[planId];
  const candidates = products.filter((p) => {
    const name = String(p.name || '').toLowerCase();
    return name.includes(planId) || name.includes(contract.name.toLowerCase());
  });
  if (candidates.length === 0) return null;

  const wantsAnnual = interval === 'annual';
  const byInterval = candidates.find((p) => {
    const name = String(p.name || '').toLowerCase();
    const hasAnnual = name.includes('annual') || name.includes('yearly') || name.includes('year');
    return wantsAnnual ? hasAnnual : !hasAnnual;
  });

  const chosen = byInterval || candidates[0];
  return chosen?.id || null;
}

function siteScopeClause(scope: { organizationId: string | null; userId: string | null }): { clause: string; params: string[] } {
  if (scope.organizationId) {
    return { clause: '(organization_id = ? OR user_id = ?)', params: [scope.organizationId, scope.userId || scope.organizationId] };
  }
  return { clause: 'user_id = ?', params: [scope.userId as string] };
}

/**
 * Get Subscription and Usage Status
 * GET /api/v1/billing/status
 */
billingRoutes.get('/status', saasUserAuthMiddleware, async (c) => {
  const userEmail = c.get('userEmail') || 'customer@wpinstant.dev';
  const scope = resolveBillingScope({ organizationId: c.get('organizationId'), userId: c.get('userId') });

  const loaded = await loadSubscriptionForScope(c.env, scope);
  const { clause, params } = siteScopeClause(scope);
  const countRow = await c.env.DB.prepare(
    `SELECT COUNT(*) as active_sites FROM sites WHERE is_active = 1 AND ${clause}`
  )
    .bind(...params)
    .first<{ active_sites: number }>();
  const activeSites = countRow?.active_sites || 0;

  if (!loaded) {
    return c.json({
      success: true,
      data: {
        hasActivePlan: false,
        subscription: null,
        plan: {
          id: 'none',
          name: 'No Active Plan',
          priceMonthly: 0,
          status: 'inactive',
          maxSites: 0,
          usedSites: activeSites,
          maxRuns: 0,
          usedRuns: 0,
          currentPeriodEnd: 0,
        },
        customer: {
          userId: scope.userId,
          email: userEmail,
        },
      },
    });
  }

  const { subscription, plan } = loaded;
  const period = await getUsageSnapshot(c.env, subscription);
  const concurrencyUsed = await countActiveFleetJobs(c.env, subscription.id);
  const creditsUsed = period.credits_used;
  const creditsReserved = period.credits_reserved;

  return c.json({
    success: true,
    data: {
      hasActivePlan: true,
      subscription: {
        id: subscription.id,
        status: subscription.status,
        billingInterval: subscription.billing_interval,
        currentPeriodStart: subscription.current_period_start ?? period.period_start,
        currentPeriodEnd: subscription.current_period_end ?? period.period_end,
        overageEnabled: subscription.overage_enabled === 1,
        overageLimitCredits: subscription.overage_limit_credits,
      },
      plan: {
        id: plan.id,
        name: plan.name,
        status: subscription.status,
        billingInterval: subscription.billing_interval,
        priceMonthly: plan.priceMonthlyCents !== null ? plan.priceMonthlyCents / 100 : null,
        priceMonthlyCents: plan.priceMonthlyCents,
        priceAnnualCents: plan.priceAnnualCents,
        priceAnnualMonthlyEquivalentCents:
          plan.priceAnnualCents !== null ? Math.round(plan.priceAnnualCents / 12) : null,
        maxSites: plan.maxSites,
        usedSites: activeSites,
        monthlyCredits: plan.monthlyCredits,
        creditsUsed,
        creditsReserved,
        creditsRemaining: Math.max(0, plan.monthlyCredits - creditsUsed - creditsReserved),
        maxConcurrentJobs: plan.maxConcurrentJobs,
        concurrencyUsed,
        maxRuns: plan.monthlyCredits,
        usedRuns: creditsUsed,
        monthlyPageviews: plan.monthlyPageviews,
        pageviewsUsed: period.pageviews_used,
        pageviewsSource: 'reported',
        monthlyBytes: plan.monthlyBytes,
        bytesUsed: period.bytes_used,
        bytesSource: 'reported',
        overageEnabled: period.overage_enabled === 1,
        overageLimitCredits: period.overage_limit_credits,
        overageCreditsUsed: period.overage_credits_used,
        overageCreditsReserved: period.overage_credits_reserved,
        currentPeriodStart: subscription.current_period_start ?? period.period_start,
        currentPeriodEnd: subscription.current_period_end ?? period.period_end,
      },
      customer: {
        userId: scope.userId,
        email: userEmail,
      },
    },
  });
});

/**
 * Update opt-in overage settings for the caller's active subscription.
 * Overage is always explicit: a limit of 0 with enabled=false blocks all
 * usage past the in-plan credits. PUT /api/v1/billing/overage
 */
billingRoutes.put('/overage', saasUserAuthMiddleware, async (c) => {
  const scope = resolveBillingScope({ organizationId: c.get('organizationId'), userId: c.get('userId') });
  const loaded = await loadSubscriptionForScope(c.env, scope);
  if (!loaded) {
    return c.json({ success: false, code: 'NO_ACTIVE_SUBSCRIPTION', error: 'No active subscription found.' }, 400);
  }

  const body = await c.req.json().catch(() => ({}));
  const enabled = body.enabled === true || body.overageEnabled === true;
  const rawLimit = Number(body.limitCredits ?? body.overageLimitCredits ?? 0);
  const limitCredits = Number.isFinite(rawLimit) ? Math.max(0, Math.min(200_000, Math.floor(rawLimit))) : 0;
  if (enabled && limitCredits === 0) {
    return c.json({ success: false, error: 'Enabling overage requires a positive limitCredits.' }, 400);
  }

  const now = Math.floor(Date.now() / 1000);
  await c.env.DB.prepare(
    'UPDATE subscriptions SET overage_enabled = ?, overage_limit_credits = ?, updated_at = ? WHERE id = ?'
  )
    .bind(enabled ? 1 : 0, limitCredits, now, loaded.subscription.id)
    .run();

  const refreshed = { ...loaded.subscription, overage_enabled: enabled ? 1 : 0, overage_limit_credits: limitCredits };
  const period = await getUsageSnapshot(c.env, refreshed);
  await c.env.DB.prepare(
    'UPDATE usage_periods SET overage_enabled = ?, overage_limit_credits = ?, updated_at = ? WHERE id = ?'
  )
    .bind(enabled ? 1 : 0, limitCredits, now, period.id)
    .run();

  return c.json({
    success: true,
    data: { overageEnabled: enabled, overageLimitCredits: limitCredits },
  });
});

/**
 * Create Polar Checkout Session (server-authoritative on planId + interval)
 * POST /api/v1/billing/checkout
 */
billingRoutes.post('/checkout', saasUserAuthMiddleware, async (c) => {
  const userId = c.get('userId')!;
  const organizationId = c.get('organizationId') || undefined;
  const authUserEmail = c.get('userEmail') || '';
  const body = await c.req.json().catch(() => ({}));

  const planId = normalizePlanId(body.planId || body.plan_id || body.productId || body.product_id);
  const interval = normalizeBillingInterval(body.interval || body.billing_interval || 'monthly');
  const returnTo = body.returnTo || body.return_to;
  const bodyEmail = body.customerEmail || body.customer_email || body.email;

  if (!planId) {
    return c.json({ success: false, error: 'Missing or invalid planId' }, 400);
  }
  if (!SELF_SERVE_PLAN_IDS.includes(planId)) {
    return c.json(
      {
        success: false,
        code: 'PLAN_NOT_SELF_SERVE',
        error: 'The Scale plan is custom-priced. Contact sales to get provisioned.',
      },
      400
    );
  }

  // Validate candidate email
  const candidateEmail = (bodyEmail || authUserEmail || '').trim().toLowerCase();
  const isValidRealEmail =
    candidateEmail.includes('@') &&
    !candidateEmail.endsWith('@users.wpinstant.dev') &&
    !candidateEmail.endsWith('@user.local') &&
    !candidateEmail.includes('wp-instant.internal');

  const saasUrl = c.env.SAAS_APP_URL || 'https://wpinstant.dev';
  const successUrl = returnTo
    ? `${saasUrl}${returnTo.startsWith('/') ? returnTo : `/${returnTo}`}${
        returnTo.includes('?') ? '&' : '?'
      }checkout_success=1&checkoutId={CHECKOUT_ID}`
    : `${saasUrl}/dashboard/billing?checkout_success=1&checkoutId={CHECKOUT_ID}`;

  const configuredProductId = productForServer(c.env, planId, interval);

  try {
    const checkoutPayload: any = {
      products: [configuredProductId || 'unconfigured'],
      successUrl,
      customerExternalId: userId,
      metadata: {
        userId,
        organizationId: organizationId ?? null,
        planId,
        interval,
        source: 'wp_instant_saas_checkout',
      },
    };

    if (isValidRealEmail) {
      checkoutPayload.customerEmail = candidateEmail;
    }

    // Polar sandbox orgs process card payments through a live-mode Stripe rail,
    // so test cards (4242…) are always declined. When a 100%-off discount is
    // configured for the sandbox org, apply it automatically so test checkouts
    // can actually complete with a $0 total (no card required).
    const sandboxDiscountId = (c.env.POLAR_SANDBOX_DISCOUNT_ID || '').trim();
    let discountApplied = false;
    let effectiveProductId: string | null = configuredProductId;

    const createSession = (client: Polar, srv: PolarServer) => {
      if (!effectiveProductId) throw noProductError(planId, interval);
      const payload: any = { ...checkoutPayload, products: [effectiveProductId] };
      if (srv === 'sandbox' && sandboxDiscountId) {
        payload.discountId = sandboxDiscountId;
        discountApplied = true;
      }
      return client.checkouts.create(payload);
    };

    let result: any;
    let server: PolarServer;
    try {
      ({ result, server } = await withPolarServerRetry(c.env, createSession));
    } catch (createErr: any) {
      const isProductError = isProductNotFoundError(createErr);
      if (!isProductError || !configuredProductId) throw createErr;

      // Env-configured product exists in the other Polar org's catalog —
      // auto-resolve this plan+interval from the live catalog instead.
      const resolved = await withPolarServerRetry(c.env, async (client, srv) => {
        const found = await resolveProductFromCatalog(client, planId, interval);
        if (!found) return null;
        effectiveProductId = found;
        return createSession(client, srv);
      });
      if (!resolved || !resolved.result) {
        throw noProductError(planId, interval);
      }
      ({ result, server } = resolved as { result: any; server: PolarServer });
      console.log(`[Polar] Resolved ${planId} (${interval}) product in catalog: ${effectiveProductId}`);
    }

    return c.json({
      success: true,
      data: {
        checkoutUrl: result.url,
        checkoutId: result.id,
        // 'sandbox' = Polar test checkout, 'production' = live checkout
        server,
        discountApplied,
        planId,
        interval,
      },
    });
  } catch (err: any) {
    console.error('[Polar Checkout Error]', err);
    const msg = String(err?.message || '');
    if (err?.code === 'PRODUCT_NOT_CONFIGURED' || isProductNotFoundError(err)) {
      return c.json(
        {
          success: false,
          code: 'PRODUCT_NOT_FOUND',
          error: err?.code === 'PRODUCT_NOT_CONFIGURED'
            ? err.message
            : `No Polar product is configured for plan "${planId}" (${interval}). Set POLAR_PRODUCT_${planId.toUpperCase()}_${interval === 'annual' ? 'ANNUAL' : 'MONTHLY'} or create the product in the matching Polar catalog.`,
        },
        500
      );
    }
    if (msg.includes('rejected by both Polar environments')) {
      return c.json({ success: false, code: 'POLAR_TOKEN_REJECTED', error: msg }, 500);
    }
    return c.json({ success: false, error: msg || 'Failed to create checkout' }, 500);
  }
});

function noProductError(planId: PlanId, interval: BillingInterval): Error {
  const err = new Error(
    `No Polar product is configured for plan "${planId}" (${interval}). Set POLAR_PRODUCT_${planId.toUpperCase()}_${interval === 'annual' ? 'ANNUAL' : 'MONTHLY'} or create the product in the matching Polar catalog.`
  ) as any;
  err.code = 'PRODUCT_NOT_CONFIGURED';
  return err;
}

/**
 * Create Polar Customer Portal Session
 * POST /api/v1/billing/portal
 *
 * Portal identity stays pinned to the subscription's owning user (the
 * customerExternalId used at checkout) even when the caller is an
 * organization member, so Polar always resolves the same customer.
 */
billingRoutes.post('/portal', saasUserAuthMiddleware, async (c) => {
  const scope = resolveBillingScope({ organizationId: c.get('organizationId'), userId: c.get('userId') });

  const loaded = await loadSubscriptionForScope(c.env, scope);
  if (!loaded) {
    return c.json(
      {
        success: false,
        code: 'NO_ACTIVE_SUBSCRIPTION',
        error: 'No active subscription found. Please choose and activate a plan first.',
      },
      400
    );
  }

  try {
    const { result: session, server } = await withPolarServerRetry(c.env, (client) =>
      client.customerSessions.create({
        customerExternalId: loaded.subscription.user_id,
      })
    );

    return c.json({
      success: true,
      data: {
        portalUrl: session.customerPortalUrl,
        server,
      },
    });
  } catch (err: any) {
    console.warn('[Polar Portal Error]', err);
    const errorMsg = String(err?.message || '');
    if (errorMsg.includes('Customer does not exist') || errorMsg.includes('value_error')) {
      return c.json(
        {
          success: false,
          code: 'NO_CUSTOMER',
          error: 'No active billing account found on Polar. Please purchase a plan first.',
        },
        400
      );
    }
    return c.json({ success: false, error: err?.message || 'Failed to create customer portal session' }, 500);
  }
});

/**
 * Polar.sh Webhook Listener (Idempotent & HMAC Verified via validateEvent)
 * POST /api/v1/billing/polar-webhook
 */
billingRoutes.post('/polar-webhook', async (c) => {
  const rawBody = await c.req.text();
  const webhookSecret = c.env.POLAR_WEBHOOK_SECRET || '';

  const headers = {
    'webhook-id': c.req.header('webhook-id') || '',
    'webhook-timestamp': c.req.header('webhook-timestamp') || '',
    'webhook-signature': c.req.header('webhook-signature') || '',
  };

  const webhookId = headers['webhook-id'];

  // 1. Idempotency check via KV
  if (webhookId) {
    const processed = await c.env.KV.get(`polar_event:${webhookId}`);
    if (processed) {
      return c.json({ received: true, note: 'Event already processed' }, 200);
    }
  }

  // 2. Signature Validation with @polar-sh/sdk/webhooks
  let event: any;
  if (webhookSecret && webhookSecret !== 'polar_whsec_test_placeholder') {
    try {
      event = validateEvent(rawBody, headers, webhookSecret);
    } catch (err) {
      if (err instanceof WebhookVerificationError) {
        console.warn('[Polar Webhook] Signature verification failed');
        return c.json({ received: false, error: 'Signature mismatch' }, 403);
      }
      return c.json({ received: false, error: 'Invalid webhook payload' }, 400);
    }
  } else {
    // In production, unverified webhook calls MUST fail closed.
    if (c.env.ENVIRONMENT === 'production') {
      console.error('[Polar Webhook] Missing POLAR_WEBHOOK_SECRET in production');
      return c.json({ received: false, error: 'Webhook secret not configured' }, 403);
    }
    // Development / fallback parser
    try {
      event = JSON.parse(rawBody);
    } catch {
      return c.json({ received: false, error: 'Invalid JSON' }, 400);
    }
  }

  const eventType = event.type || event.event;
  const data = event.data || event;

  console.log(`[Polar Webhook] Processing event: ${eventType}`);

  try {
    switch (eventType) {
      case 'subscription.created':
      case 'subscription.updated':
      case 'subscription.active': {
        const subId = data.id;
        const customerId = data.customer_id || data.customerId;
        const externalCustomerId =
          data.customer?.external_id ||
          data.customer?.externalCustomerId ||
          data.metadata?.userId ||
          data.external_customer_id;
        const customerEmail = data.customer?.email || '';
        const status = data.status || 'active';
        const polarProductId = data.product_id || data.productId || '';
        const productName = data.product?.name || '';
        const planId = resolvePlanFromPolar(polarProductId, productName, data.metadata?.planId);
        const interval = normalizeBillingInterval(
          data.metadata?.interval || data.recurring_interval || data.recurringInterval || 'monthly'
        );
        const contract = getPlanContract(planId)!;
        const currentPeriodEnd = data.current_period_end || data.currentPeriodEnd
          ? Math.floor(new Date(data.current_period_end || data.currentPeriodEnd).getTime() / 1000)
          : Math.floor(Date.now() / 1000) + 86400 * 30;
        const currentPeriodStart = data.current_period_start || data.currentPeriodStart
          ? Math.floor(new Date(data.current_period_start || data.currentPeriodStart).getTime() / 1000)
          : null;
        const organizationId =
          (typeof data.metadata?.organizationId === 'string' && data.metadata.organizationId) || null;

        // Find or create user
        let userId = externalCustomerId;
        if (!userId) {
          const existingUser = await c.env.DB.prepare(
            'SELECT id FROM users WHERE polar_customer_id = ? OR email = ?'
          )
            .bind(customerId || '', customerEmail)
            .first<{ id: string }>();

          userId = existingUser?.id || `user_${customerId || Date.now()}`;
        }

        if (customerEmail) {
          await c.env.DB.prepare(`
            INSERT INTO users (id, email, polar_customer_id, updated_at)
            VALUES (?, ?, ?, unixepoch())
            ON CONFLICT(id) DO UPDATE SET
              email = excluded.email,
              polar_customer_id = coalesce(excluded.polar_customer_id, polar_customer_id),
              updated_at = unixepoch()
          `)
            .bind(userId, customerEmail, customerId || null)
            .run();
        }

        // Upsert subscription with the INTERNAL plan id (never the Polar
        // UUID) plus interval/period bounds so usage periods derive exactly.
        await c.env.DB.prepare(`
          INSERT INTO subscriptions
            (id, user_id, organization_id, plan_id, polar_product_id, billing_interval,
             status, max_sites, current_period_start, current_period_end, overage_enabled, overage_limit_credits, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, unixepoch())
          ON CONFLICT(id) DO UPDATE SET
            user_id = excluded.user_id,
            organization_id = coalesce(excluded.organization_id, subscriptions.organization_id),
            plan_id = excluded.plan_id,
            polar_product_id = excluded.polar_product_id,
            billing_interval = excluded.billing_interval,
            status = excluded.status,
            max_sites = excluded.max_sites,
            current_period_start = excluded.current_period_start,
            current_period_end = excluded.current_period_end,
            updated_at = unixepoch()
        `)
          .bind(
            subId,
            userId,
            organizationId,
            planId,
            polarProductId || null,
            interval,
            status,
            contract.maxSites,
            currentPeriodStart,
            currentPeriodEnd
          )
          .run();

        // Migrate the org's existing sites onto the subscription's org scope.
        if (organizationId) {
          await c.env.DB.prepare(
            'UPDATE sites SET organization_id = ?, updated_at = unixepoch() WHERE user_id = ? AND organization_id IS NULL'
          )
            .bind(organizationId, userId)
            .run();
        }

        break;
      }

      // Polar semantics: `canceled` = subscription runs until
      // current_period_end (user keeps paid service); `revoked` = immediate
      // cutoff. End-of-period deactivation for canceled subs is handled by
      // the cron sweeper (maintenance.ts).
      case 'subscription.canceled': {
        await c.env.DB.prepare(
          "UPDATE subscriptions SET status = 'canceled', updated_at = unixepoch() WHERE id = ?"
        )
          .bind(data.id)
          .run();
        break;
      }

      case 'subscription.revoked': {
        const subId = data.id;
        await c.env.DB.prepare(
          "UPDATE subscriptions SET status = 'revoked', updated_at = unixepoch() WHERE id = ?"
        )
          .bind(subId)
          .run();

        // Deactivate associated sites immediately + drop their KV auth
        // caches (otherwise revoked keys stay valid up to the 1h KV TTL).
        // Media signing secrets are cleared too so signed media URLs die
        // with the subscription.
        const affected = await c.env.DB.prepare(
          'SELECT id, domain FROM sites WHERE subscription_id = ? AND is_active = 1'
        )
          .bind(subId)
          .all<{ id: string; domain: string }>();
        await c.env.DB.prepare(
          'UPDATE sites SET is_active = 0, updated_at = unixepoch() WHERE subscription_id = ?'
        )
          .bind(subId)
          .run();
        for (const row of affected.results || []) {
          await c.env.KV.delete(`site:${row.domain}`);
          await c.env.KV.delete(`msecret:${row.id}`);
        }

        break;
      }
    }

    // Mark event as processed in KV with 24hr TTL
    if (webhookId) {
      await c.env.KV.put(`polar_event:${webhookId}`, 'processed', { expirationTtl: 86400 });
    }

    return c.json({ received: true });
  } catch (err: any) {
    console.error('[Polar Webhook Handler Error]', err);
    return c.json({ received: false, error: err.message }, 500);
  }
});
