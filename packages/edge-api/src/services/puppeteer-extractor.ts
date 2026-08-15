import puppeteer, { Browser } from '@cloudflare/puppeteer';
import { Env } from '../types/env.js';
import { ViewportMode } from '@turbopress/shared';

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
  return page.evaluate(() => {
    const MAX_RULES = 15000;
    const MAX_OUTPUT_BYTES = 120 * 1024;
    const out: string[] = [];
    const crossOrigin: string[] = [];
    let ruleCount = 0;
    let outputBytes = 0;

    const selectorMatches = (sel: string): boolean => {
      try {
        // Strip pseudo-elements/classes that don't match elements themselves.
        const test = sel.replace(/::?(before|after|first-line|first-letter|selection|hover|focus|active|visited|marker|placeholder|backdrop|file-selector-button)\b/g, '');
        if (!test.trim()) return true;
        return document.querySelector(test) !== null;
      } catch {
        return true; // Old/unknown selector syntax: keep conservatively.
      }
    };

    const push = (text: string) => {
      outputBytes += text.length;
      if (outputBytes <= MAX_OUTPUT_BYTES) out.push(text);
    };    const collectRules = (rules: CSSRuleList): string => {
      const parts: string[] = [];
      for (let i = 0; i < rules.length; i++) {
        if (ruleCount++ > MAX_RULES || outputBytes > MAX_OUTPUT_BYTES) return parts.join('\n');

        const rule = rules[i];
        switch (rule.constructor.name) {
          case 'CSSMediaRule': {
            const media = rule as CSSMediaRule;
            const query = media.media.mediaText;
            let matches: boolean;
            try {
              matches = window.matchMedia(query).matches;
            } catch {
              matches = false;
            }
            if (matches) {
              const innerCss = collectRules(media.cssRules);
              if (innerCss) parts.push(`@media ${query}{${innerCss}}`);
            }
            break;
          }
          case 'CSSSupportsRule': {
            const supports = rule as CSSSupportsRule;
            let ok = false;
            try {
              ok = CSS.supports(supports.conditionText);
            } catch {
              ok = true;
            }
            if (ok) {
              const innerCss = collectRules(supports.cssRules);
              if (innerCss) parts.push(`@supports ${supports.conditionText}{${innerCss}}`);
            }
            break;
          }
          case 'CSSStyleRule': {
            const style = rule as CSSStyleRule;
            // Always keep :root / html / body foundation rules.
            const foundation = /(^|,)\s*(:root|html|body)\b/.test(style.selectorText);
            if (foundation || style.selectorText.split(',').some(selectorMatches)) {
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
            } catch {
              //
            }
        }
      }
      return parts.join('\n');
    };

    for (let i = 0; i < document.styleSheets.length; i++) {
      const sheet = document.styleSheets[i];
      let rules: CSSRuleList | null = null;
      try {
        rules = sheet.cssRules;
      } catch {
        // Cross-origin without CORS — fall back to coverage for this sheet.
        if (sheet.href) crossOrigin.push(sheet.href);
        continue;
      }
      if (!rules) continue;
      push(collectRules(rules));
    }

    return { css: out.join('\n'), crossOriginHrefs: crossOrigin };
  });
}

/**
 * Extract only the used ranges for specific stylesheet URLs from coverage entries.
 * Used as fallback for cross-origin stylesheets that block cssRules access.
 */
function coverageSlicesForUrls(
  coverage: Array<{ url: string; text: string; ranges: Array<{ start: number; end: number }> }>,
  urls: string[]
): string {
  const wanted = new Set(urls.map((u) => u.split('?')[0]));
  const parts: string[] = [];
  for (const entry of coverage) {
    if (!wanted.has(entry.url.split('?')[0])) continue;
    for (const range of entry.ranges) {
      parts.push(entry.text.slice(range.start, range.end));
    }
  }
  return parts.join('\n');
}

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
  viewport: ViewportMode
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

    // 1. Start CSS Coverage Profiler (fallback for cross-origin sheets)
    await page.coverage.startCSSCoverage({ resetOnNavigation: false });

    // 2. Navigate to target URL with safety timeout
    await page.goto(url, {
      waitUntil: 'networkidle2',
      timeout: 45000,
    });

    // 3. Let rendering settle so LCP/CLS observations stabilise.
    await new Promise((r) => setTimeout(r, 2500));

    // 4. Stop coverage (kept for cross-origin fallback)
    const coverage = await page.coverage.stopCSSCoverage();

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

    // 7. Detect LCP element + real Core-Web-Vitals-style metrics
    const perfData = await page.evaluate(() => {
      return new Promise<{
        selector: string | null;
        imageUrl: string | null;
        ttfbMs: number | null;
        fcpMs: number | null;
        lcpMs: number | null;
        clsScore: number | null;
      }>((resolve) => {
        let detectedSelector: string | null = null;
        let detectedUrl: string | null = null;
        let lcpMs: number | null = null;
        let clsScore: number | null = null;
        let ttfbMs: number | null = null;
        let fcpMs: number | null = null;

        try {
          const navEntry = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined;
          ttfbMs = navEntry ? navEntry.responseStart - navEntry.startTime : null;
        } catch {
          //
        }

        try {
          const fcpEntry = performance.getEntriesByName('first-contentful-paint')[0];
          fcpMs = fcpEntry ? (fcpEntry as PerformanceEntry).startTime : null;
        } catch {
          //
        }

        let cls = 0;
        try {
          const layoutObserver = new PerformanceObserver((entryList: any) => {
            for (const entry of entryList.getEntries()) {
              if (!entry.hadRecentInput) {
                cls += entry.value || 0;
              }
            }
          });
          layoutObserver.observe({ type: 'layout-shift', buffered: true });
        } catch {
          //
        }

        try {
          const observer = new PerformanceObserver((entryList: any) => {
            const entries = entryList.getEntries();
            if (entries.length > 0) {
              const lastEntry = entries[entries.length - 1] as any;
              lcpMs = lastEntry.startTime || null;
              if (lastEntry.element) {
                const el = lastEntry.element as HTMLElement;
                const tag = el.tagName.toLowerCase();
                const id = el.id ? `#${el.id}` : '';
                const className = el.className && typeof el.className === 'string' ? `.${el.className.trim().split(/\s+/).slice(0, 3).join('.')}` : '';
                detectedSelector = `${tag}${id}${className}`;

                if (tag === 'img') {
                  detectedUrl = (el as HTMLImageElement).currentSrc || (el as HTMLImageElement).src;
                } else {
                  const bg = window.getComputedStyle(el).backgroundImage;
                  if (bg && bg.startsWith('url(')) {
                    detectedUrl = bg.replace(/^url\(['"]?/, '').replace(/['"]?\)$/, '');
                  }
                }
              }
              if (lastEntry.url) {
                detectedUrl = lastEntry.url;
              }
            }
          });

          observer.observe({ type: 'largest-contentful-paint', buffered: true });
        } catch {
          //
        }

        setTimeout(() => {
          clsScore = Math.round(cls * 1000) / 1000;
          resolve({ selector: detectedSelector, imageUrl: detectedUrl, ttfbMs, fcpMs, lcpMs, clsScore });
        }, 500);
      });
    });

    const metrics: PageMetrics = {
      ttfbMs: perfData.ttfbMs != null ? Math.round(perfData.ttfbMs) : null,
      fcpMs: perfData.fcpMs != null ? Math.round(perfData.fcpMs) : null,
      lcpMs: perfData.lcpMs != null ? Math.round(perfData.lcpMs) : null,
      clsScore: perfData.clsScore,
      performanceScore: computePerformanceScore(perfData),
    };

    // 8. Store Critical CSS in Cloudflare R2
    const urlHash = btoa(url).replace(/[/+=]/g, '_').slice(0, 32);
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
    };
  } finally {
    await page.close();
  }
}
