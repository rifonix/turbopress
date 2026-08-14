import { Hono } from 'hono';
import { Env, AppVariables } from '../types/env.js';
import { Webhook } from 'svix';

export const clerkWebhookRoutes = new Hono<{ Bindings: Env; Variables: AppVariables }>();

/**
 * Clerk Webhook Handler (Svix Signature Verified)
 * POST /api/v1/auth/clerk-webhook
 */
clerkWebhookRoutes.post('/clerk-webhook', async (c) => {
  const webhookSecret = c.env.CLERK_WEBHOOK_SIGNING_SECRET;
  const rawBody = await c.req.text();

  const svixHeaders = {
    'svix-id': c.req.header('svix-id') || '',
    'svix-timestamp': c.req.header('svix-timestamp') || '',
    'svix-signature': c.req.header('svix-signature') || '',
  };

  let event: any;

  // Verify Svix signature if secret is configured
  if (webhookSecret && webhookSecret.startsWith('whsec_')) {
    try {
      const wh = new Webhook(webhookSecret);
      event = wh.verify(rawBody, svixHeaders);
    } catch (err) {
      console.warn('[Clerk Webhook] Signature verification failed:', err);
      return c.json({ success: false, error: 'Signature verification failed' }, 400);
    }
  } else {
    // Development / fallback parser
    try {
      event = JSON.parse(rawBody);
    } catch {
      return c.json({ success: false, error: 'Invalid JSON payload' }, 400);
    }
  }

  const eventType = event.type;
  const data = event.data;

  console.log(`[Clerk Webhook] Received event: ${eventType}`);

  try {
    switch (eventType) {
      case 'user.created': {
        const userId = data.id;
        const email = data.email_addresses?.[0]?.email_address || '';
        
        await c.env.DB.prepare(`
          INSERT INTO users (id, email, created_at, updated_at)
          VALUES (?, ?, unixepoch(), unixepoch())
          ON CONFLICT(id) DO UPDATE SET
            email = excluded.email,
            updated_at = unixepoch()
        `)
          .bind(userId, email)
          .run();

        break;
      }

      case 'user.updated': {
        const userId = data.id;
        const email = data.email_addresses?.[0]?.email_address || '';

        await c.env.DB.prepare(`
          UPDATE users
          SET email = ?, updated_at = unixepoch()
          WHERE id = ?
        `)
          .bind(email, userId)
          .run();

        break;
      }

      case 'user.deleted': {
        const userId = data.id;

        // Delete user (foreign keys with ON DELETE CASCADE will clean up sites and subscriptions)
        await c.env.DB.prepare('DELETE FROM users WHERE id = ?')
          .bind(userId)
          .run();

        break;
      }
    }

    return c.json({ success: true, message: 'Clerk event processed successfully' }, 200);
  } catch (err: any) {
    console.error('[Clerk Webhook Error]', err);
    return c.json({ success: false, error: err?.message || 'Database sync error' }, 500);
  }
});
