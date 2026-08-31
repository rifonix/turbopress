import puppeteer, { Browser } from '@cloudflare/puppeteer';
import { Env } from '../types/env.js';
import { ViewportMode, sha256 } from '@wpinstant/shared';

export interface PageMetrics {
  ttfbMs: number | null;
  fcpMs: number | null;
  lcpMs: number | null;
  clsScore: number | null;
  performanceScore: number | null;
}

export interface ExtractionResult {
  criticalCss: string;
  criticalCssBytes: number;
  lcpSelector: string | null;
  lcpImageUrl: string | null;
  r2Key: string;
  metrics: PageMetrics;
  /** Same-origin page URLs discovered in the DOM (document order, deduped). */
  internalLinks: string[];
}

/**
 * Discover internal (same-origin) page links for multi-page optimization.
 * Skips admin/login/API endpoints, cart/checkout flows and non-HTML assets.
 * Runs as a string source for the same __name-isolation reason as the CSSOM
 * extraction above.
 */
async function extractInternalLinks(page: any, limit = 15): Promise<string[]> {
  const src = `
    (() => {
      const LIMIT = ${limit};
      const skip = /\\/wp-(admin|login|json|cron|mail)|\\/(cart|checkout|my-account)(\\/|$)|\\/wp-(content|includes)\\/|\\.(php|xml|rss|zip|pdf|jpe?g|png|gif|webp|avif|svg|ico|mp4|webm|css|js|woff2?|ttf)(\\?|$)/i;
      const seen = new Set();
      const out = [];
      for (const a of document.querySelectorAll('a[href]')) {
        let href;
        try { href = new URL(a.getAttribute('href') || '', location.href); } catch (e) { continue; }
        if (href.origin !== location.origin) continue;
        if (skip.test(href.pathname)) continue;
        href.hash = '';
        href.search = '';
        let u = href.origin + (href.pathname === '/' ? '/' : href.pathname.replace(/\\/+$/, '') + '/');
        if (u === location.origin + '/') continue;
        if (!seen.has(u)) { seen.add(u); out.push(u); }
        if (out.length >= LIMIT) break;
      }
      return out;
    })()
  `;
  try {
    const links = await page.evaluate(src);
    return Array.isArray(links) ? links : [];
  } catch {
    return [];
  }
}

/**
 * Minify CSS without corrupting url() tokens or quoted strings.
 * Naive regex minifiers break url(data:image/svg+xml,...) and url(path with spaces)
 * which is the #1 cause of broken background images after inlining critical CSS.
 */
export function safeMinifyCss(css: string): string {
  const saved: string[] = [];
  const stash = (s: string) => `\u0001${saved.push(s) - 1}\u0001`;

  // 1. Protect url(...) tokens (quoted or unquoted) and quoted strings.
  let out = css
    .replace(/url\(\s*(?:'[^']*'|"[^"]*"|[^)]*?)\s*\)/gi, (m) => stash(m))
    .replace(/'(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*"/g, (m) => stash(m));

  // 2. Strip comments.
  out = out.replace(/\/\*[\s\S]*?\*\//g, '');

  // 3. Collapse whitespace / trim around syntax tokens.
  out = out
    .replace(/\s+/g, ' ')
    .replace(/\s*([{}:;,>~+])\s*/g, '$1')
    .replace(/\s*([>+~])\s*/g, '$1')
    .replace(/;}/g, '}')
    .trim();

  // 4. Restore protected tokens.
  out = out.replace(/\u0001(\d+)\u0001/g, (_, i) => saved[Number(i)]);
  return out;
}

/**
 * Score from piecewise-linear anchors: [value, score] pairs, ascending by value.
 * Values at/below the first anchor score its points; same for the last.
 */
function anchorScore(value: number, anchors: Array<[number, number]>): number {
  if (value <= anchors[0][0]) return anchors[0][1];
  const last = anchors[anchors.length - 1];
  if (value >= last[0]) return last[1];
  for (let i = 0; i < anchors.length - 1; i++) {
    const [x0, y0] = anchors[i];
    const [x1, y1] = anchors[i + 1];
    if (value >= x0 && value <= x1) {
      return y0 + ((value - x0) / (x1 - x0)) * (y1 - y0);
    }
  }
  return 0;
}

export function computePerformanceScore(m: {
  ttfbMs: number | null;
  fcpMs: number | null;
  lcpMs: number | null;
  clsScore: number | null;
}): number | null {
  const parts: Array<{ score: number; weight: number }> = [];
  if (m.ttfbMs != null) parts.push({ score: anchorScore(m.ttfbMs, [[200, 100], [500, 85], [1800, 0]]), weight: 0.1 });
  if (m.fcpMs != null) parts.push({ score: anchorScore(m.fcpMs, [[1000, 100], [2000, 70], [3000, 0]]), weight: 0.2 });
  if (m.lcpMs != null) parts.push({ score: anchorScore(m.lcpMs, [[1200, 100], [2500, 50], [4000, 0]]), weight: 0.5 });
  if (m.clsScore != null) parts.push({ score: anchorScore(m.clsScore, [[0, 100], [0.1, 95], [0.25, 50], [0.4, 0]]), weight: 0.2 });
  if (parts.length === 0) return null;
  const weightSum = parts.reduce((a, p) => a + p.weight, 0);
  const total = parts.reduce((a, p) => a + p.score * p.weight, 0);
  return Math.round(total / weightSum);
}

/**
 * CSSOM-based in-page critical CSS extraction.
 * - Same-origin stylesheets: walks cssRules, keeps rules whose selectors actually
 *   match rendered elements at this viewport (media queries gated via matchMedia).
 * - Cross-origin stylesheets (cssRules access throws): reported back so the caller
 *   can fall back to Puppeteer CSS coverage slices for those URLs only.
 * - Always keeps :root vars, @font-face, @keyframes, @layer statements and
 *   property/declaration defaults needed to avoid FOUC.
 */
async function extractUsedCssViaCssom(page: any): Promise<{ css: string; crossOriginHrefs: string[] }> {
  // IMPORTANT: this code executes inside the remote browser via CDP.
  // It MUST be passed as a string: esbuild (keepNames) rewrites function
  // callbacks with a __name() wrapper that only exists in the worker bundle,
  // so serialized function callbacks throw "ReferenceError: __name is not
  // defined" in the page context. String sources are left untouched.
  const src = `
    (() => {
      const MAX_RULES = 60000;
      const MAX_OUTPUT_BYTES = 512 * 1024;
      // Second, larger envelope for rules that must never be dropped even
      // when the budget is exhausted: pseudo-element rules (::before/::after
      // carry icons/overlays), custom-property definitions and font/keyframes
      // foundations. These are byte-small but visually critical.
      const MAX_PROTECTED_BYTES = 768 * 1024;
      const out = [];
      const crossOrigin = [];
      let ruleCount = 0;
      let outputBytes = 0;
      let protectedBytes = 0;

      // Strip ONLY what cannot match in a static, untouched headless page:
      //  - pseudo-elements (::before, ::after, ::marker, …) incl. legacy
      //    single-colon forms (:before, :after, :first-letter, :first-line)
      //  - interaction/state pseudo-classes that are never active at
      //    extraction time (:hover, :focus, :focus-within, :checked, …)
      // Structural pseudos (:not, :is, :where, :has, :nth-*, :first-child…)
      // are KEPT — querySelector evaluates them against the live DOM.
      // Order matters: longer names (focus-within/-visible) must precede
      // their prefixes (focus), otherwise ":focus-within" degrades to
      // "-within" and the rule is dropped by a false querySelector miss.
      const STATE_PSEUDOS = /::?(?:before|after|first-letter|first-line|selection|marker|placeholder-shown|placeholder|backdrop|file-selector-button|spelling-error|grammar-error|highlight|target-text|cue-region|cue|part\\([^)]*\\)|slotted\\([^)]*\\))(?![\\w-])|:(?:hover|focus-within|focus-visible|focus|active|visited|link|target-within|target|checked|indeterminate|disabled|enabled|required|optional|valid|invalid|in-range|out-of-range|read-only|read-write|autofill|user-valid|user-invalid|placeholder-shown|playing|paused|seeking|buffering|stalled|fullscreen|picture-in-picture|modal|popover-open|open|defined)(?![\\w-])/g;

      function selectorMatches(sel) {
        try {
          const test = sel.replace(STATE_PSEUDOS, '');
          if (!test.trim() || !test.replace(/[\\s>+~*,]/g, '').trim()) return true;
          return document.querySelector(test) !== null;
        } catch (e) {
          return true; // Old/unknown selector syntax: keep conservatively.
        }
      }

      // Rules too important to lose when the output cap hits.
      function isProtectedRule(cssText) {
        return /::|:(?:before|after)\\b|@font-face|@keyframes|@property|--[\\w-]+\\s*:/.test(cssText);
      }

      function push(text) {
        if (outputBytes + text.length <= MAX_OUTPUT_BYTES) {
          outputBytes += text.length;
          out.push(text);
          return;
        }
        // Over budget: still keep visually-critical rules (bounded by the
        // larger protected envelope) so icons/overlays never go missing.
        if (isProtectedRule(text) && protectedBytes + text.length <= MAX_PROTECTED_BYTES) {
          protectedBytes += text.length;
          out.push(text);
        }
      }

      function collectRules(rules) {
        const parts = [];
        for (let i = 0; i < rules.length; i++) {
          // Stop only when even the protected envelope is full — pseudo/
          // foundation rules keep flowing past the main budget.
          if (ruleCount++ > MAX_RULES || (outputBytes > MAX_OUTPUT_BYTES && protectedBytes > MAX_PROTECTED_BYTES)) return parts.join('\\n');
          const rule = rules[i];
          switch (rule.constructor.name) {
            case 'CSSMediaRule': {
              const media = rule;
              const query = media.media.mediaText;
              let matches = false;
              try { matches = window.matchMedia(query).matches; } catch (e) {}
              if (matches) {
                // Keep the WHOLE matching block (v1.7.0): filtering inner
                // rules was how overlay/background rules inside media
                // queries went missing. Whole blocks are conservative —
                // size is bounded by the output cap.
                parts.push(media.cssText);
              }
              break;
            }
            case 'CSSSupportsRule': {
              const supports = rule;
              let ok = false;
              try { ok = CSS.supports(supports.conditionText); } catch (e) { ok = true; }
              if (ok) {
                parts.push('@supports ' + supports.conditionText + '{' + collectRules(supports.cssRules) + '}');
              }
              break;
            }
            case 'CSSStyleRule': {
              const style = rule;
              const foundation = /(^|,)\\s*(:root|html|body)\\b/.test(style.selectorText);
              // Rules that ONLY set custom properties are theme tokens —
              // dropping them breaks every var() consumer downstream.
              const onlyVars = style.style.length > 0 && Array.from(style.style).every((p) => String(p).startsWith('--'));
              if (foundation || onlyVars || style.selectorText.split(',').some(selectorMatches)) {
                parts.push(style.cssText);
              }
              break;
            }
            case 'CSSFontFaceRule':
            case 'CSSKeyframesRule':
            case 'CSSLayerStatementRule':
            case 'CSSLayerBlockRule':
            case 'CSSPropertyRule':
            case 'CSSCounterStyleRule':
            case 'CSSFontFeatureValuesRule':
              parts.push(rule.cssText);
              break;
            default:
              // Unknown/at-rule: keep cssText conservatively (e.g. @container, @scope).
              try {
                if (rule.cssText && !/^@import/i.test(rule.cssText)) {
                  parts.push(rule.cssText);
                }
              } catch (e) {}
          }
        }
        return parts.join('\\n');
      }

      for (let i = 0; i < document.styleSheets.length; i++) {
        const sheet = document.styleSheets[i];
        let rules = null;
        try {
          rules = sheet.cssRules;
        } catch (e) {
          // Cross-origin without CORS — fall back to coverage for this sheet.
          if (sheet.href) crossOrigin.push(sheet.href);
          continue;
        }
        if (!rules) continue;
        push(collectRules(rules));
      }

      return { css: out.join('\\n'), crossOriginHrefs: crossOrigin };
    })()
  `;
  return page.evaluate(src);
}

/**
 * Extract only the used ranges for specific stylesheet URLs from coverage entries.
 * Used as fallback for cross-origin stylesheets that block cssRules access.
 */
/**
 * Rewrite relative url() references in a raw CSS slice against the
 * stylesheet's URL — inlined into a page with a different base, relative
 * (and root-relative, for cross-origin sheets) asset URLs would 404.
 */
function rebaseCssUrls(css: string, baseHref: string): string {
  return css.replace(/url\(\s*(['"]?)([^'")]+)\1\s*\)/gi, (m, q: string, u: string) => {
    const t = u.trim();
    if (/^(?:data:|blob:|https?:|#|\/\/)/i.test(t)) return m;
    try {
      return `url(${q}${new URL(t, baseHref).href}${q})`;
    } catch {
      return m;
    }
  });
}

function coverageSlicesForUrls(
  coverage: Array<{ url: string; text: string; ranges: Array<{ start: number; end: number }> }>,
  urls: string[]
): string {
  const wanted = new Set(urls.map((u) => u.split('?')[0]));
  const parts: string[] = [];
  for (const entry of coverage) {
    if (!wanted.has(entry.url.split('?')[0])) continue;
    for (const range of entry.ranges) {
      // Raw text slices are NOT browser-serialized — rebase relative urls.
      parts.push(rebaseCssUrls(entry.text.slice(range.start, range.end), entry.url));
    }
  }
  return parts.join('\n');
}

/**
 * Thrown when the origin serves a bot-challenge/interstitial page to the
 * optimizer. Retryable with a rotated UA; terminal cases become
 * `needs_attention` with actionable guidance for the site owner.
 */
export class OriginChallengeError extends Error {
  constructor(message = 'Origin served a bot-challenge page to the optimizer (WAF/CAPTCHA).') {
    super(message);
    this.name = 'OriginChallengeError';
  }
}

/**
 * Realistic UA pool per form factor. Retries rotate through the pool so a
 * firewall rule that caught one fingerprint doesn't fail every attempt.
 * Kept Chromium-coherent (platform variety only) to avoid client-hint
 * mismatches that themselves trigger challenges.
 */
const MOBILE_USER_AGENTS = [
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36',
  'Mozilla/5.0 (Linux; Android 14; SM-S928B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Mobile Safari/537.36',
  'Mozilla/5.0 (Linux; Android 13; SM-A536B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36',
  'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Mobile Safari/537.36',
];
const DESKTOP_USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
];

/**
 * AST-Enriched Critical CSS & Real Metrics Extraction Engine
 * Uses Cloudflare Browser Rendering (Puppeteer)
 */
export async function extractCriticalCssAndLcp(
  browserInstance: Browser | null,
  env: Env,
  jobId: string,
  siteId: string,
  url: string,
  viewport: ViewportMode,
  attempt = 1
): Promise<ExtractionResult> {
  const isMobile = viewport === 'mobile';
  const browser = browserInstance || (await puppeteer.launch(env.BROWSER as any));
  const page = await browser.newPage();

  try {
    await page.setViewport({
      width: isMobile ? 393 : 1920,
      height: isMobile ? 852 : 1080,
      isMobile,
      hasTouch: isMobile,
      deviceScaleFactor: isMobile ? 3 : 1,
    });

    // 0. Mask the headless fingerprint: many origin firewalls (Wordfence,
    // hosting WAFs) block "HeadlessChrome" UAs or challenge datacenter
    // traffic. A realistic UA + Accept-Language avoids most naive checks;
    // retries rotate through the pool.
    const uaPool = isMobile ? MOBILE_USER_AGENTS : DESKTOP_USER_AGENTS;
    await page.setUserAgent(uaPool[Math.max(0, attempt - 1) % uaPool.length]);
    try {
      await page.setExtraHTTPHeaders({ 'Accept-Language': 'en-US,en;q=0.9' });
    } catch {
      // not fatal
    }

    // 1. Start CSS Coverage Profiler (fallback for cross-origin sheets).
    // Not every Browser Rendering build exposes the coverage API — degrade
    // gracefully to CSSOM-only extraction instead of failing the job.
    let coverage: Array<{ url: string; text: string; ranges: Array<{ start: number; end: number }> }> = [];
    try {
      if (typeof (page as any).coverage?.startCSSCoverage === 'function') {
        await (page as any).coverage.startCSSCoverage({ resetOnNavigation: false });
      }
    } catch (covErr) {
      console.warn('[Extractor] CSS coverage unavailable:', covErr);
    }

    // 2. Navigate to target URL with safety timeout.
    // IMPORTANT: append the extractor bypass flag so the WordPress plugin
    // (and its advanced-cache.php drop-in) serves the RAW, untransformed
    // page. Without it we would extract "critical" CSS from our own
    // optimized output — scripts withheld by interaction_delay never run in
    // a headless browser, JS-rendered elements (and their ::before/::after
    // rules) vanish from the DOM, and LCP is measured against the wrong
    // document. The flag is honored by the plugin since v1.11.0; on older
    // plugin versions it degrades to a harmless cache-miss query param.
    let fetchUrl = url;
    try {
      const u = new URL(url);
      u.searchParams.set('wp_instant_extract', '1');
      fetchUrl = u.toString();
    } catch {
      // keep original
    }
    await page.goto(fetchUrl, {
      waitUntil: 'networkidle2',
      timeout: 45000,
    });

    // 3. Let rendering settle so LCP/CLS observations stabilise.
    await new Promise((r) => setTimeout(r, 2500));

    // 3b. Bot-challenge detection: some origin firewalls occasionally serve
    // a CAPTCHA/interstitial page instead of the real site. Saving that as
    // "critical CSS" would inject garbage into real visitor pages. Detect it
    // and fail the job with a clear, retryable error instead.
    const challengeProbeSrc = `
      (() => {
        const text = ((document.body && document.body.innerText) || '').slice(0, 400).toLowerCase();
        // High-precision markers only: a bare-hostname title is normal on many
        // real sites (dev/staging/unbranded), so it must NOT count as a challenge.
        const markers = /checking your browser|verify (you are|that you're) human|one more step|are you a robot|human verification|challenge-platform|pardon our interruption|attention required|error code 1(02|023)/;
        return { challenged: markers.test(text), sheets: document.styleSheets.length };
      })()
    `;
    const probe = (await page.evaluate(challengeProbeSrc)) as { challenged: boolean; sheets: number };
    if (probe.challenged) {
      throw new OriginChallengeError();
    }

    // 4. Stop coverage (kept for cross-origin fallback)
    try {
      if (typeof (page as any).coverage?.stopCSSCoverage === 'function') {
        coverage = await (page as any).coverage.stopCSSCoverage();
      }
    } catch (covErr) {
      console.warn('[Extractor] CSS coverage stop failed:', covErr);
    }

    // 5. CSSOM-based extraction (same-origin) + coverage fallback (cross-origin)
    const cssomResult = await extractUsedCssViaCssom(page);
    let fullCriticalCss = cssomResult.css;
    if (cssomResult.crossOriginHrefs.length > 0) {
      const crossOriginCss = coverageSlicesForUrls(coverage as any, cssomResult.crossOriginHrefs);
      if (crossOriginCss) {
        fullCriticalCss += '\n' + crossOriginCss;
      }
    }

    // 6. Safe minification (protects url()/data-URIs → background images keep working)
    fullCriticalCss = safeMinifyCss(fullCriticalCss);
    const criticalCssBytes = Buffer.byteLength(fullCriticalCss, 'utf8');

    // 6b. Sanity guard: a real page virtually always yields more than 1KB of
    // used CSS with more than 2 stylesheets. Tiny output on a normal-looking
    // page means we captured an interstitial/error shell — do not save it.
    if (criticalCssBytes < 1024 && (probe.sheets ?? 99) <= 2) {
      throw new Error(
        'Extraction captured too little CSS (likely an error/interstitial page). Retrying is safe.'
      );
    }

    // 7. Detect LCP element + real Core-Web-Vitals-style metrics.
    // String source for the same __name-isolation reason as above.
    const perfSrc = `
      new Promise((resolve) => {
        let detectedSelector = null;
        let detectedUrl = null;
        let lcpMs = null;
        let clsScore = null;
        let ttfbMs = null;
        let fcpMs = null;

        try {
          const navEntry = performance.getEntriesByType('navigation')[0];
          ttfbMs = navEntry ? navEntry.responseStart - navEntry.startTime : null;
        } catch (e) {}

        try {
          const fcpEntry = performance.getEntriesByName('first-contentful-paint')[0];
          fcpMs = fcpEntry ? fcpEntry.startTime : null;
        } catch (e) {}

        let cls = 0;
        try {
          const layoutObserver = new PerformanceObserver((entryList) => {
            for (const entry of entryList.getEntries()) {
              if (!entry.hadRecentInput) cls += entry.value || 0;
            }
          });
          layoutObserver.observe({ type: 'layout-shift', buffered: true });
        } catch (e) {}

        try {
          const observer = new PerformanceObserver((entryList) => {
            const entries = entryList.getEntries();
            if (entries.length > 0) {
              const lastEntry = entries[entries.length - 1];
              lcpMs = lastEntry.startTime || null;
              if (lastEntry.element) {
                const el = lastEntry.element;
                const tag = el.tagName.toLowerCase();
                const id = el.id ? '#' + el.id : '';
                const cn = (el.className && typeof el.className === 'string')
                  ? '.' + el.className.trim().split(/\\s+/).slice(0, 3).join('.')
                  : '';
                detectedSelector = tag + id + cn;

                if (tag === 'img') {
                  detectedUrl = el.currentSrc || el.src;
                } else {
                  const bg = window.getComputedStyle(el).backgroundImage;
                  if (bg && bg.indexOf('url(') === 0) {
                    detectedUrl = bg.replace(/^url\\(['"]?/, '').replace(/['"]?\\)$/, '');
                  }
                }
              }
              if (lastEntry.url) detectedUrl = lastEntry.url;
            }
          });
          observer.observe({ type: 'largest-contentful-paint', buffered: true });
        } catch (e) {}

        setTimeout(() => {
          clsScore = Math.round(cls * 1000) / 1000;
          resolve({ selector: detectedSelector, imageUrl: detectedUrl, ttfbMs, fcpMs, lcpMs, clsScore });
        }, 500);
      })
    `;
    const perfData = await (page as any).evaluate(perfSrc);

    // 7b. Discover internal links for multi-page optimization.
    const internalLinks = await extractInternalLinks(page);

    const metrics: PageMetrics = {
      ttfbMs: perfData.ttfbMs != null ? Math.round(perfData.ttfbMs) : null,
      fcpMs: perfData.fcpMs != null ? Math.round(perfData.fcpMs) : null,
      lcpMs: perfData.lcpMs != null ? Math.round(perfData.lcpMs) : null,
      clsScore: perfData.clsScore,
      performanceScore: computePerformanceScore(perfData),
    };

    // 8. Store Critical CSS in Cloudflare R2
    // SHA-256 hash (hex): btoa() throws on non-Latin-1 URLs (i18n slugs).
    const urlHash = (await sha256(url)).slice(0, 32);
    const r2Key = `sites/${siteId}/css/${urlHash}_${viewport}.css`;

    await env.ASSETS_BUCKET.put(r2Key, fullCriticalCss, {
      httpMetadata: {
        contentType: 'text/css; charset=utf-8',
        cacheControl: 'public, max-age=31536000, immutable',
      },
      customMetadata: {
        siteId,
        url,
        viewport,
        generatedAt: Date.now().toString(),
        jobId,
        bytes: criticalCssBytes.toString(),
      },
    });

    return {
      criticalCss: fullCriticalCss,
      criticalCssBytes,
      lcpSelector: perfData.selector,
      lcpImageUrl: perfData.imageUrl,
      r2Key,
      metrics,
      internalLinks,
    };
  } finally {
    await page.close();
  }
}
