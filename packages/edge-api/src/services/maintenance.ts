import { MessageBatch } from '@cloudflare/workers-types';
import { Env, OptimizationQueueMessage } from '../types/env.js';
import { releaseReservationForJob } from './entitlements.js';

/**
 * Dead-letter queue consumer: messages here exhausted all retries on the
 * optimization queue. Mark the job terminally failed (unless it already
 * reached a terminal state) so it stops showing as perpetually 'queued'
 * in the dashboard, then ack — the DLQ must never grow unboundedly.
 *
 * Terminal queue failures are NOT charged: release the reservation.
 */
export async function processDlqBatch(
  batch: MessageBatch<OptimizationQueueMessage>,
  env: Env
): Promise<void> {
  for (const msg of batch.messages) {
    try {
      const jobId = msg.body?.jobId;
      if (jobId) {
        await env.DB.prepare(`
          UPDATE optimization_jobs
          SET status = 'failed',
              error_message = coalesce(error_message, 'Job exhausted all queue retries'),
              completed_at = unixepoch()
          WHERE id = ? AND status IN ('queued', 'processing')
        `)
          .bind(jobId)
          .run();
        await env.KV.put(
          `job:${jobId}`,
          JSON.stringify({ status: 'failed', error: 'Job exhausted all queue retries' }),
          { expirationTtl: 3600 }
        );
        await releaseReservationForJob(env, jobId);
      }
      msg.ack();
    } catch (err) {
      console.error('[DLQ] failed to process message', err);
      msg.retry();
    }
  }
}

/**
 * Periodic sweeper (cron): reaps zombie jobs whose queue message was lost
 * or whose execution died silently, and enforces subscription end-of-period
 * deactivation for canceled (not revoked) plans.
 */
export async function runSweeper(env: Env): Promise<void> {
  // 1. Zombie jobs: queued/processing for over 30 minutes means the queue
  // message never landed (or the consumer died before the first UPDATE).
  const zombies = await env.DB.prepare(`
    SELECT id FROM optimization_jobs
    WHERE status IN ('queued', 'processing')
      AND created_at < unixepoch() - 1800
  `).all<{ id: string }>();

  if (zombies.results?.length) {
    await env.DB.prepare(`
      UPDATE optimization_jobs
      SET status = 'failed',
          error_message = 'Job timed out before execution (stuck in queue)',
          completed_at = unixepoch()
      WHERE status IN ('queued', 'processing')
        AND created_at < unixepoch() - 1800
    `).run();
    for (const z of zombies.results) {
      await releaseReservationForJob(env, z.id);
      await env.KV.put(
        `job:${z.id}`,
        JSON.stringify({ status: 'failed', error: 'Job timed out before execution (stuck in queue)' }),
        { expirationTtl: 3600 }
      );
    }
    console.log(`[Sweeper] Reaped ${zombies.results.length} zombie job(s)`);
  }

  // 2. Canceled subscriptions whose paid period has ended → deactivate sites
  //    (revoked subscriptions are deactivated immediately in the webhook).
  const expired = await env.DB.prepare(`
    SELECT s.id, s.domain FROM sites s
    JOIN subscriptions sub ON s.subscription_id = sub.id
    WHERE sub.status = 'canceled'
      AND sub.current_period_end IS NOT NULL
      AND sub.current_period_end < unixepoch()
      AND s.is_active = 1
  `).all<{ id: string; domain: string }>();

  if (expired.results?.length) {
    await env.DB.prepare(`
      UPDATE sites SET is_active = 0, updated_at = unixepoch()
      WHERE subscription_id IN (
        SELECT id FROM subscriptions
        WHERE status = 'canceled'
          AND current_period_end IS NOT NULL
          AND current_period_end < unixepoch()
      )
    `).run();
    for (const row of expired.results) {
      await env.KV.delete(`site:${row.domain}`);
      await env.KV.delete(`msecret:${row.id}`);
      await env.KV.delete(`siteactive:${row.id}`);
    }
    console.log(`[Sweeper] Deactivated ${expired.results.length} site(s) past period end`);
  }
}
