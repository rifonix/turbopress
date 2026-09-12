import { sha256, type JobPriority } from '@wpinstant/shared';
import type { Env } from '../types/env.js';

export interface TemplateArtifact {
  criticalCssR2Key: string;
  criticalCssBytes: number;
  lcpSelector?: string | null;
  lcpImageUrl?: string | null;
}

/** Read a template entry from the edge KV cache. */
export async function lookupTemplate(
  env: Env,
  siteId: string,
  structureHash: string,
  viewport: string
): Promise<TemplateArtifact | null> {
  if (!structureHash) return null;
  try {
    const cached = await env.KV.get<TemplateArtifact>(
      `template:${siteId}:${structureHash}:${viewport}`,
      'json'
    );
    return cached?.criticalCssR2Key ? cached : null;
  } catch (err) {
    console.warn('[Template KV lookup warning]', err);
    return null;
  }
}

/**
 * Fulfill a job instantly from the template cache — free: no credit
 * reservation is made, so none is consumed.
 *
 * The artifact must exist under THIS url's key before completion: the
 * plugin downloads per-URL, so a bare status flip would 404 and silently
 * drop the page's critical CSS. Returns false when the artifact is gone,
 * so the caller falls through to a real extraction.
 */
export async function completeFromTemplate(
  env: Env,
  input: {
    siteId: string;
    url: string;
    viewport: string;
    jobId: string;
    priority: 'high' | 'normal';
    template: TemplateArtifact;
  }
): Promise<boolean> {
  const { siteId, url, viewport, jobId, priority, template } = input;
  const fulfilledKey = await ensureUrlArtifact(env, siteId, url, viewport, template);
  if (!fulfilledKey) return false;

  await env.DB.prepare(`
    INSERT INTO optimization_jobs (id, site_id, url, viewport, status, priority, credit_reservation_id, critical_css_r2_key, critical_css_bytes, lcp_selector, lcp_image_url, attempts, created_at, completed_at)
    VALUES (?, ?, ?, ?, 'completed', ?, NULL, ?, ?, ?, ?, 1, unixepoch(), unixepoch())
  `)
    .bind(
      jobId,
      siteId,
      url,
      viewport,
      priority,
      fulfilledKey,
      template.criticalCssBytes,
      template.lcpSelector || null,
      template.lcpImageUrl || null
    )
    .run();

  await putCompletedJobMarker(env, {
    jobId,
    siteId,
    url,
    viewport,
    criticalCssR2Key: fulfilledKey,
    criticalCssBytes: template.criticalCssBytes,
    lcpImageUrl: template.lcpImageUrl || null,
  });
  return true;
}

/**
 * Rerun variant: same free fulfillment, but UPDATES the existing job row
 * (same id) instead of inserting — avoids a primary-key conflict and keeps
 * the job's history/attempts intact.
 */
export async function completeRerunFromTemplate(
  env: Env,
  input: {
    siteId: string;
    url: string;
    viewport: string;
    jobId: string;
    priority: JobPriority;
    template: TemplateArtifact;
  }
): Promise<boolean> {
  const { siteId, url, viewport, jobId, priority, template } = input;
  const fulfilledKey = await ensureUrlArtifact(env, siteId, url, viewport, template);
  if (!fulfilledKey) return false;

  await env.DB.prepare(`
    UPDATE optimization_jobs
    SET status = 'completed', priority = ?, critical_css_r2_key = ?, critical_css_bytes = ?,
        lcp_selector = ?, lcp_image_url = ?, attempts = attempts + 1, completed_at = unixepoch()
    WHERE id = ?
  `)
    .bind(
      priority,
      fulfilledKey,
      template.criticalCssBytes,
      template.lcpSelector || null,
      template.lcpImageUrl || null,
      jobId
    )
    .run();

  await putCompletedJobMarker(env, {
    jobId,
    siteId,
    url,
    viewport,
    criticalCssR2Key: fulfilledKey,
    criticalCssBytes: template.criticalCssBytes,
    lcpImageUrl: template.lcpImageUrl || null,
  });
  return true;
}

/**
 * Ensure the template artifact is addressable under this URL's per-URL key
 * (copy is cheap, KBs of CSS). Returns the key to serve, or null when the
 * template artifact is gone and a real extraction is required.
 */
async function ensureUrlArtifact(
  env: Env,
  siteId: string,
  url: string,
  viewport: string,
  template: TemplateArtifact
): Promise<string | null> {
  const thisUrlKey = `sites/${siteId}/css/${(await sha256(url)).slice(0, 32)}_${viewport}`;
  if (thisUrlKey === template.criticalCssR2Key) return thisUrlKey;
  try {
    const src = await env.ASSETS_BUCKET.get(template.criticalCssR2Key);
    if (src) {
      await env.ASSETS_BUCKET.put(thisUrlKey, src.body, {
        httpMetadata: src.httpMetadata,
      });
      return thisUrlKey;
    }
    console.warn('[Template KV] artifact missing, falling back to extraction', template.criticalCssR2Key);
    return null;
  } catch (copyErr) {
    console.warn('[Template KV] artifact copy failed, falling back to extraction', copyErr);
    return null;
  }
}

async function putCompletedJobMarker(
  env: Env,
  input: {
    jobId: string;
    siteId: string;
    url: string;
    viewport: string;
    criticalCssR2Key: string;
    criticalCssBytes: number;
    lcpImageUrl: string | null;
  }
): Promise<void> {
  try {
    await env.KV.put(
      `job:${input.jobId}`,
      JSON.stringify({
        status: 'completed',
        url: input.url,
        viewport: input.viewport,
        siteId: input.siteId,
        criticalCssR2Key: input.criticalCssR2Key,
        criticalCssBytes: input.criticalCssBytes,
        lcpImageUrl: input.lcpImageUrl,
        fromTemplateCache: true,
      }),
      { expirationTtl: 86400 }
    );
  } catch (err) {
    console.warn('[Template KV] job marker write failed (non-fatal)', err);
  }
}
