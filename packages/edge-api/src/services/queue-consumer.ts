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

    for (const msg of batch.messages) {
      const { jobId, siteId, url, viewport } = msg.body;

      try {
        // Mark job as processing
        await env.DB.prepare(
          'UPDATE optimization_jobs SET status = "processing", attempts = attempts + 1 WHERE id = ?'
        )
          .bind(jobId)
          .run();

        // Run Critical CSS & LCP extractor
        const result = await extractCriticalCssAndLcp(browser, env, jobId, siteId, url, viewport);

        // Update D1 database with successful output
        await env.DB.prepare(`
          UPDATE optimization_jobs
          SET status = 'completed',
              critical_css_r2_key = ?,
              lcp_selector = ?,
              lcp_image_url = ?,
              completed_at = unixepoch()
          WHERE id = ?
        `)
          .bind(result.r2Key, result.lcpSelector, result.lcpImageUrl, jobId)
          .run();

        // Update KV job status cache for fast polling
        await env.KV.put(
          `job:${jobId}`,
          JSON.stringify({
            status: 'completed',
            r2Key: result.r2Key,
            lcpSelector: result.lcpSelector,
            lcpImageUrl: result.lcpImageUrl,
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
  } catch (launchErr) {
    console.error('[Browser Launch Error]', launchErr);
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
