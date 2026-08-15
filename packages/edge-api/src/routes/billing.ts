import { Hono } from 'hono';
import { Env, AppVariables } from '../types/env.js';
import { Polar } from '@polar-sh/sdk';
import { validateEvent, WebhookVerificationError } from '@polar-sh/sdk/webhooks';
import { saasUserAuthMiddleware } from '../middleware/auth.js';

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
      // Neither environment accepted the token — surface the original error
      throw retryErr && isPolarAuthError(retryErr) ? retryErr : err;
    }
  }
}

const PLAN_LIMITS: Record<string, { maxSites: number; maxRuns: number; priceMonthly: number; label: string }> = {
  starter: { maxSites: 1, maxRuns: 200, priceMonthly: 19, label: 'Starter Plan' },
  pro: { maxSites: 5, maxRuns: 1000, priceMonthly: 49, label: 'Pro Plan' },
  agency: { maxSites: 10, maxRuns: 2000, priceMonthly: 79, label: 'Agency Plan' },
  enterprise: { maxSites: 100, maxRuns: 10000, priceMonthly: 299, label: 'Enterprise Plan' },
};

const STARTER_PRODUCT_IDS = new Set([
  'ca0c63de-5a98-4829-8b0f-8e81f579b58a',
  '3907e862-b1e1-4006-9289-040cabe18c2d',
]);

function resolvePlan(planId: string, productName = ''): { maxSites: number; maxRuns: number; priceMonthly: number; label: string } {
  const id = (planId || '').toLowerCase();
  const name = productName.toLowerCase();
  if (id.includes('enterprise') || name.includes('enterprise')) return PLAN_LIMITS.enterprise;
  if (id.includes('agency') || name.includes('agency')) return PLAN_LIMITS.agency;
  if (id.includes('pro') || name.includes('pro')) return PLAN_LIMITS.pro;
  if (id.includes('starter') || name.includes('starter') || STARTER_PRODUCT_IDS.has(planId)) return PLAN_LIMITS.starter;
  return PLAN_LIMITS.starter;
}

/**
 * Get Subscription and Usage Status
 * GET /api/v1/billing/status
 */
billingRoutes.get('/status', saasUserAuthMiddleware, async (c) => {
  const userId = c.get('userId')!;
  const userEmail = c.get('userEmail') || 'customer@turbopress.io';

  const subscription = await c.env.DB.prepare(
    'SELECT * FROM subscriptions WHERE user_id = ? AND status IN ("active", "trialing") ORDER BY created_at DESC LIMIT 1'
  )
    .bind(userId)
    .first<{
      id: string;
      plan_id: string;
      status: string;
      max_sites: number;
      current_period_end: number;
    }>();

  const countRow = await c.env.DB.prepare(
    'SELECT COUNT(*) as active_sites FROM sites WHERE user_id = ? AND is_active = 1'
  )
    .bind(userId)
    .first<{ active_sites: number }>();

  const jobsCountRow = await c.env.DB.prepare(`
    SELECT COUNT(*) as monthly_runs
    FROM optimization_jobs j
    JOIN sites s ON j.site_id = s.id
    WHERE s.user_id = ? AND j.created_at >= unixepoch() - 86400 * 30
  `)
    .bind(userId)
    .first<{ monthly_runs: number }>();

  const activeSites = countRow?.active_sites || 0;
  const monthlyRuns = jobsCountRow?.monthly_runs || 0;

  if (!subscription) {
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
          usedRuns: monthlyRuns,
          currentPeriodEnd: 0,
        },
        customer: {
          userId,
          email: userEmail,
        },
      },
    });
  }

  const planId = subscription.plan_id;
  const plan = resolvePlan(planId);

  return c.json({
    success: true,
    data: {
      hasActivePlan: true,
      subscription,
      plan: {
        id: planId,
        name: plan.label,
        priceMonthly: plan.priceMonthly,
        status: subscription.status,
        maxSites: subscription.max_sites || plan.maxSites,
        usedSites: activeSites,
        maxRuns: plan.maxRuns,
        usedRuns: monthlyRuns,
        currentPeriodEnd: subscription.current_period_end,
      },
      customer: {
        userId,
        email: userEmail,
      },
    },
  });
});

/**
 * Create Polar Checkout Session
 * POST /api/v1/billing/checkout
 */
billingRoutes.post('/checkout', saasUserAuthMiddleware, async (c) => {
  const userId = c.get('userId')!;
  const authUserEmail = c.get('userEmail') || '';
  const body = await c.req.json().catch(() => ({}));
  const productId = body.productId || body.product_id;
  const returnTo = body.returnTo || body.return_to;
  const bodyEmail = body.customerEmail || body.customer_email || body.email;

  if (!productId) {
    return c.json({ success: false, error: 'Missing productId' }, 400);
  }

  // Validate candidate email
  const candidateEmail = (bodyEmail || authUserEmail || '').trim().toLowerCase();
  const isValidRealEmail =
    candidateEmail.includes('@') &&
    !candidateEmail.endsWith('@users.turbopress.io') &&
    !candidateEmail.endsWith('@user.local') &&
    !candidateEmail.includes('turbopress.internal');

  const saasUrl = c.env.SAAS_APP_URL || 'https://turbopress.webaccessibility.workers.dev';
  const successUrl = returnTo
    ? `${saasUrl}${returnTo.startsWith('/') ? returnTo : `/${returnTo}`}${
        returnTo.includes('?') ? '&' : '?'
      }checkout_success=1&checkoutId={CHECKOUT_ID}`
    : `${saasUrl}/billing?checkout_success=1&checkoutId={CHECKOUT_ID}`;

  try {
    const checkoutPayload: any = {
      products: [productId],
      successUrl,
      customerExternalId: userId,
      metadata: {
        userId,
        source: 'turbopress_saas_checkout',
      },
    };

    if (isValidRealEmail) {
      checkoutPayload.customerEmail = candidateEmail;
    }

    const { result: session, server } = await withPolarServerRetry(c.env, (client) =>
      client.checkouts.create(checkoutPayload)
    );

    return c.json({
      success: true,
      data: {
        checkoutUrl: session.url,
        checkoutId: session.id,
        // 'sandbox' = Polar test checkout, 'production' = live checkout
        server,
      },
    });
  } catch (err: any) {
    console.error('[Polar Checkout Error]', err);
    const msg = String(err?.message || '');
    if (msg.includes('invalid_token') || msg.includes('Unauthorized') || msg.includes('token')) {
      return c.json(
        {
          success: false,
          error:
            'Polar rejected the configured access token. Verify POLAR_ACCESS_TOKEN matches the environment (sandbox tokens only work in sandbox).',
        },
        500
      );
    }
    return c.json({ success: false, error: err?.message || 'Failed to create checkout' }, 500);
  }
});

/**
 * Create Polar Customer Portal Session
 * POST /api/v1/billing/portal
 */
billingRoutes.post('/portal', saasUserAuthMiddleware, async (c) => {
  const userId = c.get('userId')!;

  // Check if user has an active subscription in D1
  const subscription = await c.env.DB.prepare(
    'SELECT id, status FROM subscriptions WHERE user_id = ? AND status IN ("active", "trialing") ORDER BY created_at DESC LIMIT 1'
  )
    .bind(userId)
    .first<{ id: string; status: string }>();

  if (!subscription) {
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
        customerExternalId: userId,
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
        const planId = data.product_id || data.productId || data.plan_id || 'plan_starter';
        const currentPeriodEnd = data.current_period_end || data.currentPeriodEnd
          ? Math.floor(new Date(data.current_period_end || data.currentPeriodEnd).getTime() / 1000)
          : Math.floor(Date.now() / 1000) + 86400 * 30;

        // Determine max site slots based on product ID / name
        const productName = data.product?.name || '';
        const plan = resolvePlan(planId, productName);

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

        // Upsert subscription
        await c.env.DB.prepare(`
          INSERT INTO subscriptions (id, user_id, plan_id, status, max_sites, current_period_end, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, unixepoch())
          ON CONFLICT(id) DO UPDATE SET
            user_id = excluded.user_id,
            status = excluded.status,
            plan_id = excluded.plan_id,
            max_sites = excluded.max_sites,
            current_period_end = excluded.current_period_end,
            updated_at = unixepoch()
        `)
          .bind(subId, userId, planId, status, plan.maxSites, currentPeriodEnd)
          .run();

        break;
      }

      case 'subscription.revoked':
      case 'subscription.canceled': {
        const subId = data.id;
        await c.env.DB.prepare(
          'UPDATE subscriptions SET status = "canceled", updated_at = unixepoch() WHERE id = ?'
        )
          .bind(subId)
          .run();

        // Deactivate associated sites
        await c.env.DB.prepare(
          'UPDATE sites SET is_active = 0, updated_at = unixepoch() WHERE subscription_id = ?'
        )
          .bind(subId)
          .run();

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
