import { MessageBatch } from '@cloudflare/workers-types';
import puppeteer, { Browser } from '@cloudflare/puppeteer';
import { Env, OptimizationQueueMessage } from '../types/env.js';
import { extractCriticalCssAndLcp } from './puppeteer-extractor.js';
import { generateJobId, hmacSha256Hex, ViewportMode } from '@turbopress/shared';

/** How many additional internal pages to optimize after the homepage. */
const MAX_CRAWL_PAGES = 5;
/** Hard cap of queued/processing jobs per site (prevents runaway crawling). */
const MAX_ACTIVE_JOBS_PER_SITE = 12;

/**
 * Push completed optimization results straight to the WordPress plugin's
 * HMAC-verified REST endpoint (instant critical CSS + LCP image delivery —
 * no plugin-side cron polling). Fully best-effort: failures are logged and
 * never fail the job (the plugin's polling fallback still works).
 */
async function pushOptimizationCallback(
  env: Env,
  siteId: string,
  payload: {
    jobId: string;
    url: string;
    viewport: ViewportMode;
    css: string;
    lcpImageUrl: string | null;
    lcpSelector: string | null;
    metrics: Record<string, unknown>;
  }
): Promise<void> {
  try {
    const site = await env.DB.prepare(
      'SELECT site_url, callback_secret FROM sites WHERE id = ?'
    )
      .bind(siteId)
      .first<{ site_url: string | null; callback_secret: string | null }>();

    if (!site?.site_url || !site.callback_secret) {
      return; // Plugin not on v1.2.0+ push protocol: polling fallback covers it.
    }

    const rawBody = JSON.stringify(payload);
    const signature = await hmacSha256Hex(site.callback_secret, rawBody);

    const callbackUrl = site.site_url.replace(/\/+$/, '') + '/wp-json/turbopress/v1/optimize-callback';
    const response = await fetch(callbackUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Turbopress-Signature': signature,
      },
      body: rawBody,
      signal: AbortSignal.timeout(8000),
    });

    if (!response.ok) {
      console.warn(`[Callback] ${callbackUrl} responded HTTP ${response.status}`);
    }
  } catch (err) {
    console.warn('[Callback] push failed (plugin polling fallback applies):', err);
  }
}

/**
 * Multi-page optimization: after a root-page job completes, enqueue jobs for
 * the most prominent internal links discovered on the page. Deduplicates
 * against every non-failed job the site already has, respects the active-jobs
 * cap, and never fails the seed job (best-effort, fully guarded).
 */
async function enqueueCrawlJobs(
  env: Env,
  siteId: string,
  seedUrl: string,
  links: string[]
): Promise<void> {
  try {
    if (links.length === 0 || !env.OPTIMIZATION_QUEUE) return;

    // Only crawl from root pages, otherwise every page would re-crawl the site.
    let path = '/';
    try {
      path = new URL(seedUrl).pathname || '/';
    } catch {
      return;
    }
    if (path !== '/') return;

    const active = await env.DB.prepare(
      "SELECT COUNT(*) as n FROM optimization_jobs WHERE site_id = ? AND status IN ('queued', 'processing')"
    )
      .bind(siteId)
      .first<{ n: number }>();
    const activeCount = active?.n || 0;
    if (activeCount >= MAX_ACTIVE_JOBS_PER_SITE) return;

    const picked: string[] = [];
    for (const link of links) {
      if (picked.length >= MAX_CRAWL_PAGES || activeCount + picked.length * 2 >= MAX_ACTIVE_JOBS_PER_SITE) break;
      const normalized = link.replace(/\/+$/, '');
      const exists = await env.DB.prepare(
        "SELECT id FROM optimization_jobs WHERE site_id = ? AND status != 'failed' AND lower(rtrim(url, '/')) = lower(?) LIMIT 1"
      )
        .bind(siteId, normalized)
        .first();
      if (!exists) picked.push(link);
    }
    if (picked.length === 0) return;

    console.log(`[Crawl] Enqueueing ${picked.length} internal pages for site ${siteId}`);
    for (const url of picked) {
      for (const viewport of ['mobile', 'desktop'] as ViewportMode[]) {
        const jobId = generateJobId();
        await env.DB.prepare(
          "INSERT INTO optimization_jobs (id, site_id, url, viewport, status, attempts, created_at) VALUES (?, ?, ?, ?, 'queued', 0, unixepoch())"
        )
          .bind(jobId, siteId, url, viewport)
          .run();
        await env.KV.put(
          `job:${jobId}`,
          JSON.stringify({ status: 'queued', url, viewport, siteId }),
          { expirationTtl: 3600 }
        );
        try {
          await env.OPTIMIZATION_QUEUE.send({ jobId, siteId, url, viewport, attempt: 1 });
        } catch (sendErr) {
          console.warn('[Crawl] queue send failed:', sendErr);
        }
      }
    }
  } catch (err) {
    console.warn('[Crawl] skipped:', err);
  }
}

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
            INSERT INTO performance_audits (id, site_id, url, device, performance_score, lcp_ms, fid_inp_ms, cls_score, fcp_ms, ttfb_ms, created_at)
            VALUES (?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, unixepoch())
          `)
            .bind(
              `audit_${jobId}`,
              siteId,
              url,
              viewport,
              result.metrics.performanceScore,
              result.metrics.lcpMs,
              result.metrics.clsScore,
              result.metrics.fcpMs,
              result.metrics.ttfbMs
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

        // Multi-page optimization: crawl internal links from root pages.
        await enqueueCrawlJobs(env, siteId, url, result.internalLinks);

        // Push results to the plugin instantly (HMAC-signed); the plugin's
        // cron polling remains as a degraded fallback.
        await pushOptimizationCallback(env, siteId, {
          jobId,
          url,
          viewport,
          css: result.criticalCss,
          lcpImageUrl: result.lcpImageUrl,
          lcpSelector: result.lcpSelector,
          metrics: result.metrics as unknown as Record<string, unknown>,
        });

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
