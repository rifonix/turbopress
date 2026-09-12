import type { Env } from '../types/env.js';
import { computeStructureHash } from './structure-hash.js';

export type OptimizeScope = 'all' | 'main-pages' | 'templates-only';

export interface SiteScope {
  scope: OptimizeScope;
  /** main-pages allowlist (CacheRules wildcard syntax, matched on path) */
  allowlist: string[];
  /** auto-crawl discovered links after root jobs (default OFF) */
  crawlEnabled: boolean;
}

/**
 * Parse the optimization scope from a site's config_json. Unknown/missing
 * values fail closed to main-pages with crawling off — the posture that
 * cannot surprise-spend.
 */
export function parseSiteScope(configJson: string | null | undefined): SiteScope {
  let caching: Record<string, unknown> = {};
  try {
    const parsed = configJson ? (JSON.parse(configJson) as Record<string, unknown>) : {};
    if (parsed && typeof parsed.caching === 'object' && parsed.caching !== null) {
      caching = parsed.caching as Record<string, unknown>;
    }
  } catch {
    caching = {};
  }
  const rawScope = typeof caching.optimize_scope === 'string' ? caching.optimize_scope : 'main-pages';
  const scope: OptimizeScope =
    rawScope === 'all' || rawScope === 'templates-only' ? rawScope : 'main-pages';
  const allowlist = Array.isArray(caching.optimize_only_urls)
    ? (caching.optimize_only_urls as unknown[]).filter((v): v is string => typeof v === 'string' && v !== '')
    : [];
  return { scope, allowlist, crawlEnabled: caching.crawl_enabled === true };
}

/**
 * CacheRules wildcard semantics (WordPress side): `*` matches any run of
 * characters, pattern is anchored ^…$ and case-insensitive.
 */
export function wildcardMatch(pattern: string, path: string): boolean {
  const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
  try {
    return new RegExp(`^${escaped}$`, 'i').test(path);
  } catch {
    return false;
  }
}

function urlPath(url: string): string | null {
  try {
    return new URL(url).pathname || '/';
  } catch {
    return null;
  }
}

/**
 * Whether a dispatch target may spend extraction credits under the site's
 * scope. The homepage is always in scope (connect kickoff + dashboard
 * "optimize homepage" must keep working on every mode).
 */
export function urlInScope(url: string, site: SiteScope): boolean {
  const path = urlPath(url);
  if (path === null) return false;
  if (site.scope === 'all') return true;
  if (path === '/') return true;
  if (site.scope === 'main-pages') {
    return site.allowlist.some((pattern) => wildcardMatch(pattern, path));
  }
  // templates-only: allowed through to the template-dedup gate — the first
  // page of each template pays once, every repeat completes free.
  return true;
}

/**
 * Fetch the RAW origin document for hashing. The `wp_instant_extract`
 * flag makes the plugin (and its drop-in) step aside so we hash what the
 * extractor sees, not optimized output.
 */
export async function fetchRawHtml(env: Env, url: string, timeoutMs = 8000): Promise<string | null> {
  let target: string;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
    parsed.searchParams.set('wp_instant_extract', '1');
    target = parsed.toString();
  } catch {
    return null;
  }
  try {
    const res = await fetch(target, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; WPInstant-Hasher/1.0)',
        'Cache-Control': 'no-cache',
      },
      redirect: 'follow',
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) return null;
    const html = await res.text();
    if (html.length < 512 || html.indexOf('</head>') === -1) return null;
    return html;
  } catch {
    return null;
  }
}

/** Structure hash for a URL, fetched edge-side. Null when unreachable. */
export async function hashUrlContent(env: Env, url: string): Promise<string | null> {
  const html = await fetchRawHtml(env, url);
  if (!html) return null;
  try {
    return computeStructureHash(html);
  } catch {
    return null;
  }
}
