/**
 * Canonical dispatch-URL identity.
 *
 * The same page must never be optimized twice under different query
 * strings: ad-click URLs (?utm_source=…&wbraid=…), our own verification
 * loopbacks (?wp_instant_htaccess_check=…), previews and builder params
 * all describe the SAME document. Every dispatch surface normalizes to
 * this canonical form before job lookup, reservation, artifact keys and
 * dashboard grouping — one version per page, one charge per content.
 */

/** Exact tracking params stripped regardless of site config. */
const TRACKING_PARAMS = new Set([
  // Google (incl. Ads click ids missing from older strip lists)
  'gclid', 'gbraid', 'wbraid', 'gad_source', 'gad_campaignid', 'gclsrc', 'gclau', 'dclid',
  '_ga', '_gl', '_gac',
  // Meta / Microsoft / TikTok / Snap / X / LinkedIn / Pinterest
  'fbclid', 'fb_action_ids', 'fb_action_types', 'fb_source', 'fb_ref',
  'msclkid', 'ttclid', 'snap_click_id', 'twclid', 'li_fat_id',
  'mc_cid', 'mc_eid', 'igshid', 'srsltid', 'yclid',
  'vero_conv', 'vero_id', 'wickedid', 'wickedsource',
  'oly_anon_id', 'oly_enc_id', 'epik', 'eppfoil',
]);

/** Prefixes of marketing params stripped regardless of site config. */
const TRACKING_PREFIXES = ['utm_', 'pk_', 'piwik_', 'matomo_', 'hsa_', 'vero_'];

/**
 * Internal/operational params that never identify content. Prefix match —
 * covers our own loopbacks (wp_instant_*), preview flags and every major
 * builder/customizer/preview mechanism.
 */
const INTERNAL_PREFIXES = [
  'wp_instant_',
  'wpins_',
  'wpfc_',
  'litespeed_',
  'elementor-preview',
  'et_fb',
  'fl_builder',
  'vc_',
  'bt_',
  'customize',
  'doing_wp_cron',
];

const INTERNAL_EXACT = new Set([
  'preview',
  'preview_id',
  'preview_nonce',
  'theme_preview',
  'customize_messenger_channel',
  'customize_autosaved',
  'rest_route',
  's',
  'fbembed',
]);

/** A param the site configured to strip (`utm_*` style = prefix match). */
function matchesStripList(name: string, stripList: string[]): boolean {
  const lower = name.toLowerCase();
  for (const raw of stripList) {
    const pattern = String(raw || '').toLowerCase();
    if (!pattern) continue;
    if (pattern.endsWith('*')) {
      const prefix = pattern.slice(0, -1);
      if (prefix && lower.startsWith(prefix)) return true;
    } else if (lower === pattern) {
      return true;
    }
  }
  return false;
}

function isInternalParam(name: string): boolean {
  const lower = name.toLowerCase();
  if (INTERNAL_EXACT.has(lower)) return true;
  return INTERNAL_PREFIXES.some((p) => lower === p || lower.startsWith(p));
}

function isTrackingParam(name: string): boolean {
  const lower = name.toLowerCase();
  if (TRACKING_PARAMS.has(lower)) return true;
  return TRACKING_PREFIXES.some((p) => lower.startsWith(p));
}

/**
 * Normalize a dispatch URL to its canonical identity:
 * lowercase host, drop default ports + fragment, strip tracking params,
 * internal params and site-configured strip params, sort the survivors.
 * Returns null for non-http(s) URLs.
 */
export function canonicalizeDispatchUrl(rawUrl: string, siteStripList: string[] = []): string | null {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return null;
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;

  const params = new URLSearchParams();
  const survivors: Array<[string, string]> = [];
  parsed.searchParams.forEach((value, name) => {
    if (!name) return;
    if (isInternalParam(name)) return;
    if (isTrackingParam(name)) return;
    if (matchesStripList(name, siteStripList)) return;
    survivors.push([name, value]);
  });
  survivors.sort(([aName, aVal], [bName, bVal]) =>
    aName < bName ? -1 : aName > bName ? 1 : aVal < bVal ? -1 : aVal > bVal ? 1 : 0
  );
  params.sort();
  for (const [name, value] of survivors) params.append(name, value);

  let host = parsed.hostname.toLowerCase();
  const port = parsed.port;
  if ((parsed.protocol === 'http:' && port === '80') || (parsed.protocol === 'https:' && port === '443')) {
    // default port — drop below
  }
  const authority = host + ((parsed.protocol === 'http:' && port !== '80') || (parsed.protocol === 'https:' && port !== '443') && port ? `:${port}` : '');
  const query = params.toString();
  return `${parsed.protocol}//${authority}${parsed.pathname || '/'}${query ? `?${query}` : ''}`;
}

/**
 * Display grouping key for the dashboard: host + path only, so
 * `/?utm_…` and `/?wp_instant_…` variants collapse under the page.
 */
export function groupingKeyForUrl(rawUrl: string): string {
  try {
    const parsed = new URL(rawUrl);
    return `${parsed.hostname.toLowerCase()}${parsed.pathname || '/'}`.toLowerCase().replace(/\/+$/, '') || '/';
  } catch {
    return rawUrl.toLowerCase();
  }
}
