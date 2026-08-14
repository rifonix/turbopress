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
 * Create Polar Checkout Session
 * POST /api/v1/billing/checkout
 */
billingRoutes.post('/checkout', saasUserAuthMiddleware, async (c) => {
  const userId = c.get('userId')!;
  const userEmail = c.get('userEmail') || 'customer@turbopress.io';
  const body = await c.req.json().catch(() => ({}));
  const productId = body.productId || body.product_id;

  if (!productId) {
    return c.json({ success: false, error: 'Missing productId' }, 400);
  }

  const polar = getPolarClient(c.env);
  const saasUrl = c.env.SAAS_APP_URL || 'https://app.turbopress.io';
  const successUrl = `${saasUrl}/billing?success=1&checkoutId={CHECKOUT_ID}`;

  try {
    const session = await polar.checkouts.create({
      products: [productId],
      successUrl,
      customerEmail: userEmail,
      metadata: {
        userId,
        source: 'turbopress_saas_checkout',
      },
    });

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
  const saasUrl = c.env.SAAS_APP_URL || 'https://app.turbopress.io';

  try {
    const session = await polar.customerSessions.create({
      customerId: userId,
    });

    return c.json({
      success: true,
      data: {
        portalUrl: session.customerPortalUrl,
      },
    });
  } catch (err: any) {
    console.error('[Polar Portal Error]', err);
    return c.json({ success: false, error: err?.message || 'Failed to create customer portal' }, 500);
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
        const customerId = data.customer_id || data.customerId || data.user_id;
        const status = data.status || 'active';
        const planId = data.product_id || data.productId || data.plan_id || 'plan_starter';
        const currentPeriodEnd = data.current_period_end || data.currentPeriodEnd
          ? Math.floor(new Date(data.current_period_end || data.currentPeriodEnd).getTime() / 1000)
          : Math.floor(Date.now() / 1000) + 86400 * 30;

        // Determine max site slots based on product name / metadata
        let maxSites = 5;
        const productName = (data.product?.name || '').toLowerCase();
        if (productName.includes('agency') || planId.includes('agency')) {
          maxSites = 25;
        } else if (productName.includes('enterprise') || planId.includes('enterprise')) {
          maxSites = 100;
        } else if (productName.includes('pro') || planId.includes('pro')) {
          maxSites = 10;
        }

        // Find user by polar_customer_id or email
        const user = await c.env.DB.prepare(
          'SELECT id FROM users WHERE polar_customer_id = ? OR email = ?'
        )
          .bind(customerId, data.customer?.email || '')
          .first<{ id: string }>();

        const userId = user?.id || `user_${customerId}`;

        // Upsert subscription
        await c.env.DB.prepare(`
          INSERT INTO subscriptions (id, user_id, plan_id, status, max_sites, current_period_end, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, unixepoch())
          ON CONFLICT(id) DO UPDATE SET
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
