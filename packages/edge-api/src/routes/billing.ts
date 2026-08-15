import { Hono } from 'hono';
import { Env, AppVariables } from '../types/env.js';
import { Polar } from '@polar-sh/sdk';
import { validateEvent, WebhookVerificationError } from '@polar-sh/sdk/webhooks';
import { saasUserAuthMiddleware } from '../middleware/auth.js';

export const billingRoutes = new Hono<{ Bindings: Env; Variables: AppVariables }>();

/**
 * Initialize Polar SDK client
 */
function getPolarClient(env: Env): Polar {
  return new Polar({
    accessToken: env.POLAR_ACCESS_TOKEN || 'polar_test_token',
    server: env.ENVIRONMENT === 'production' ? 'production' : 'sandbox',
  });
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
  const isStarter =
    planId === 'ca0c63de-5a98-4829-8b0f-8e81f579b58a' ||
    planId === '3907e862-b1e1-4006-9289-040cabe18c2d' ||
    planId.includes('starter');
  const isAgency = planId.includes('agency');
  const isEnterprise = planId.includes('enterprise');
  const isPro = planId.includes('pro');

  const planName = isEnterprise
    ? 'Enterprise Plan'
    : isAgency
    ? 'Agency Plan'
    : isPro
    ? 'Pro Plan'
    : 'Starter Plan';

  const maxSites = subscription.max_sites || (isAgency ? 25 : isEnterprise ? 100 : isPro ? 10 : 5);
  const maxRuns = isAgency ? 2000 : isEnterprise ? 10000 : isPro ? 1000 : 500;
  const priceMonthly = isAgency ? 79 : isEnterprise ? 299 : isPro ? 49 : 19;

  return c.json({
    success: true,
    data: {
      hasActivePlan: true,
      subscription,
      plan: {
        id: planId,
        name: planName,
        priceMonthly,
        status: subscription.status,
        maxSites,
        usedSites: activeSites,
        maxRuns,
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

  const polar = getPolarClient(c.env);
  const saasUrl = c.env.SAAS_APP_URL || 'https://turbopress.webaccessibility.workers.dev';
  const successUrl = returnTo
    ? `${saasUrl}${returnTo.startsWith('/') ? returnTo : `/${returnTo}`}${
        returnTo.includes('?') ? '&' : '?'
      }checkout_success=1&checkoutId={CHECKOUT_ID}`
    : `${saasUrl}/billing?success=1&checkoutId={CHECKOUT_ID}`;

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

    const session = await polar.checkouts.create(checkoutPayload);

    return c.json({
      success: true,
      data: {
        checkoutUrl: session.url,
        checkoutId: session.id,
      },
    });
  } catch (err: any) {
    console.error('[Polar Checkout Error]', err);
    return c.json({ success: false, error: err?.message || 'Failed to create checkout' }, 500);
  }
});

/**
 * Create Polar Customer Portal Session
 * POST /api/v1/billing/portal
 */
billingRoutes.post('/portal', saasUserAuthMiddleware, async (c) => {
  const userId = c.get('userId')!;
  const polar = getPolarClient(c.env);

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
    const session = await polar.customerSessions.create({
      customerExternalId: userId,
    });

    return c.json({
      success: true,
      data: {
        portalUrl: session.customerPortalUrl,
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
        let maxSites = 5;
        const productName = (data.product?.name || '').toLowerCase();
        if (productName.includes('agency') || planId.includes('agency')) {
          maxSites = 25;
        } else if (productName.includes('enterprise') || planId.includes('enterprise')) {
          maxSites = 100;
        } else if (productName.includes('pro') || planId.includes('pro')) {
          maxSites = 10;
        }

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
          .bind(subId, userId, planId, status, maxSites, currentPeriodEnd)
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
