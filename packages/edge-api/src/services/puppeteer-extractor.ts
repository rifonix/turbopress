import puppeteer, { Browser } from '@cloudflare/puppeteer';
import { Env } from '../types/env.js';
import { ViewportMode } from '@turbopress/shared';

export interface ExtractionResult {
  criticalCss: string;
  lcpSelector: string | null;
  lcpImageUrl: string | null;
  r2Key: string;
}

/**
 * AST-Enriched Critical CSS & LCP Extraction Engine
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

    // 1. Start CSS Coverage Profiler
    await page.coverage.startCSSCoverage({ resetOnNavigation: false });

    // 2. Navigate to target URL with safety timeout
    await page.goto(url, {
      waitUntil: 'networkidle2',
      timeout: 30000,
    });

    // 3. Stop Coverage and extract used ranges
    const coverage = await page.coverage.stopCSSCoverage();
    let rawCriticalCss = '';

    for (const entry of coverage) {
      for (const range of entry.ranges) {
        rawCriticalCss += entry.text.slice(range.start, range.end) + '\n';
      }
    }

    // 4. Extract :root variables and @font-face from original stylesheets to prevent FOUT/CLS
    const enrichedRules = await page.evaluate(() => {
      let rootVars = '';
      let fontFaces = '';

      for (let i = 0; i < document.styleSheets.length; i++) {
        try {
          const sheet = document.styleSheets[i];
          const rules = sheet.cssRules || sheet.rules;
          if (!rules) continue;

          for (let j = 0; j < rules.length; j++) {
            const rule = rules[j];
            if (rule instanceof CSSStyleRule && (rule.selectorText === ':root' || rule.selectorText === 'html')) {
              rootVars += rule.cssText + '\n';
            } else if (rule instanceof CSSFontFaceRule) {
              fontFaces += rule.cssText + '\n';
            }
          }
        } catch {
          // Cross-origin stylesheet access restriction handling
        }
      }
      return { rootVars, fontFaces };
    });

    // Combine with AST preservation
    let fullCriticalCss = enrichedRules.rootVars + enrichedRules.fontFaces + rawCriticalCss;

    // Remove empty rules and minify
    fullCriticalCss = fullCriticalCss
      .replace(/\/\*[\s\S]*?\*\//g, '') // remove comments
      .replace(/\s+/g, ' ') // collapse whitespace
      .replace(/\s*([{}:;,])\s*/g, '$1') // trim around syntax tokens
      .replace(/;}/g, '}') // remove trailing semicolons
      .trim();

    // 5. Detect LCP Element & Image Candidate via PerformanceObserver
    const lcpData = await page.evaluate(() => {
      return new Promise<{ selector: string | null; imageUrl: string | null }>((resolve) => {
        let detectedSelector: string | null = null;
        let detectedUrl: string | null = null;

        try {
          const observer = new PerformanceObserver((entryList: any) => {
            const entries = entryList.getEntries();
            if (entries.length > 0) {
              const lastEntry = entries[entries.length - 1] as any;
              if (lastEntry.element) {
                const el = lastEntry.element as HTMLElement;
                const tag = el.tagName.toLowerCase();
                const id = el.id ? `#${el.id}` : '';
                const className = el.className && typeof el.className === 'string' ? `.${el.className.trim().split(/\s+/).join('.')}` : '';
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
          // Fallback if observer is unsupported
        }

        setTimeout(() => {
          resolve({ selector: detectedSelector, imageUrl: detectedUrl });
        }, 1500);
      });
    });

    // 6. Store Critical CSS in Cloudflare R2
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
      },
    });

    return {
      criticalCss: fullCriticalCss,
      lcpSelector: lcpData.selector,
      lcpImageUrl: lcpData.imageUrl,
      r2Key,
    };
  } finally {
    await page.close();
  }
}
