import { MessageBatch } from '@cloudflare/workers-types';
import puppeteer, { Browser } from '@cloudflare/puppeteer';
import { Env, OptimizationQueueMessage } from '../types/env.js';
import { extractCriticalCssAndLcp } from './puppeteer-extractor.js';

export async function processOptimizationQueue(
  batch: MessageBatch<OptimizationQueueMessage>,
  env: Env
): Promise<void> {
  let browser: Browser | null = null;

  try {
    browser = await puppeteer.launch(env.BROWSER as any);
  } catch (launchErr) {
    console.error('[Browser Launch Error]', launchErr);
    // Without a browser nothing can be processed: put every message back so
    // the queue retries (with backoff) instead of silently dropping jobs.
    for (const msg of batch.messages) {
      try {
        if (msg.attempts < 3) {
          await env.DB.prepare(
            "UPDATE optimization_jobs SET status = 'queued' WHERE id = ?"
          )
            .bind(msg.body.jobId)
            .run();
          await env.KV.put(`job:${msg.body.jobId}`, JSON.stringify({ status: 'queued', url: msg.body.url }), {
            expirationTtl: 3600,
          });
          msg.retry();
        } else {
          await env.DB.prepare(
            "UPDATE optimization_jobs SET status = 'failed', error_message = 'Browser rendering unavailable', completed_at = unixepoch() WHERE id = ?"
          )
            .bind(msg.body.jobId)
            .run();
          await env.KV.put(
            `job:${msg.body.jobId}`,
            JSON.stringify({ status: 'failed', error: 'Browser rendering unavailable' }),
            { expirationTtl: 3600 }
          );
          msg.ack();
        }
      } catch (dbErr) {
        console.error('[Queue Retry Error]', dbErr);
        msg.retry();
      }
    }
    return;
  }

  try {
    for (const msg of batch.messages) {
      const { jobId, siteId, url, viewport } = msg.body;

      try {
        // Mark job as processing
        await env.DB.prepare(
          "UPDATE optimization_jobs SET status = 'processing', attempts = attempts + 1 WHERE id = ?"
        )
          .bind(jobId)
          .run();

        // Run Critical CSS, LCP & real-metrics extractor
        const result = await extractCriticalCssAndLcp(browser, env, jobId, siteId, url, viewport);

        // Update D1 database with successful output
        await env.DB.prepare(`
          UPDATE optimization_jobs
          SET status = 'completed',
              critical_css_r2_key = ?,
              critical_css_bytes = ?,
              lcp_selector = ?,
              lcp_image_url = ?,
              completed_at = unixepoch()
          WHERE id = ?
        `)
          .bind(result.r2Key, result.criticalCssBytes, result.lcpSelector, result.lcpImageUrl, jobId)
          .run();

        // Persist REAL measured metrics (no fabricated values)
        if (result.metrics.performanceScore != null || result.metrics.lcpMs != null) {
          await env.DB.prepare(`
            INSERT INTO performance_audits (id, site_id, url, device, performance_score, lcp_ms, fid_inp_ms, cls_score, fcp_ms, created_at)
            VALUES (?, ?, ?, ?, ?, ?, NULL, ?, ?, unixepoch())
          `)
            .bind(
              `audit_${jobId}`,
              siteId,
              url,
              viewport,
              result.metrics.performanceScore,
              result.metrics.lcpMs,
              result.metrics.clsScore,
              result.metrics.fcpMs
            )
            .run();
        }

        // Update KV job status cache for fast polling
        await env.KV.put(
          `job:${jobId}`,
          JSON.stringify({
            status: 'completed',
            r2Key: result.r2Key,
            criticalCssBytes: result.criticalCssBytes,
            lcpSelector: result.lcpSelector,
            lcpImageUrl: result.lcpImageUrl,
            metrics: result.metrics,
          }),
          { expirationTtl: 3600 }
        );

        msg.ack();
      } catch (err: any) {
        console.error(`[Queue Error] Job ${jobId} failed:`, err);

        const errorMessage = err?.message || 'Optimization extraction error';
        await env.DB.prepare(`
          UPDATE optimization_jobs
          SET status = 'failed',
              error_message = ?,
              completed_at = unixepoch()
          WHERE id = ?
        `)
          .bind(errorMessage, jobId)
          .run();

        await env.KV.put(
          `job:${jobId}`,
          JSON.stringify({
            status: 'failed',
            error: errorMessage,
          }),
          { expirationTtl: 3600 }
        );

        if (msg.attempts < 3) {
          msg.retry();
        } else {
          msg.ack(); // let DLQ or failed state handle it
        }
      }
    }
  } finally {
    if (browser) {
      try {
        await browser.close();
      } catch {
        // ignore close error
      }
    }
  }
}
