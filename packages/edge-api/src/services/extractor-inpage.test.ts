import { describe, it, expect } from 'vitest';
import { inPageCssomSource } from './puppeteer-extractor';

/**
 * Regression net for the in-page CSSOM extractor source.
 *
 * The source is a TS template literal evaluated into a string and run inside
 * the remote browser via CDP. Escape depth matters: `\/` in the template
 * becomes a bare `/` at runtime, which once terminated an in-page regex
 * early and killed EVERY extraction job with
 * "Invalid regular expression: ... Unterminated group" (site revamp.cogwheel-
 * marketing.com, 8/8 jobs failed). Compiling the file text is not enough —
 * these tests compile and EXECUTE the evaluated runtime string.
 */

class CSSStyleRule {
  constructor(public selectorText: string, public cssText: string, public style: { length: number } = { length: 1 }) {}
}
class CSSMediaRule {
  constructor(public media: { mediaText: string }, public cssText: string) {}
}
class CSSFontFaceRule {
  constructor(public cssText: string) {}
}

interface FakeSheet {
  href: string | null;
  disabled?: boolean;
  media?: { mediaText: string };
  cssRules?: unknown[];
  throwOnCssRules?: boolean;
}

function runExtractor(sheets: FakeSheet[], opts: { querySelector?: (sel: string) => boolean } = {}) {
  const src = inPageCssomSource();

  // 1. Must COMPILE after template evaluation (the unterminated-group bug
  //    failed here).
  const make = new Function('document', 'window', 'location', `"use strict"; return (${src});`);

  const document = {
    styleSheets: sheets.map((s) => ({
      href: s.href,
      disabled: s.disabled ?? false,
      media: s.media ?? { mediaText: 'all' },
      get cssRules() {
        if (s.throwOnCssRules) throw new Error('SecurityError');
        return s.cssRules ?? [];
      },
    })),
    querySelector: (sel: string) => (opts.querySelector ? (opts.querySelector(sel) ? {} : null) : {}),
  };
  const window = { matchMedia: (q: string) => ({ matches: q === 'all' || /min-width/.test(q) }) };
  const location = { href: 'https://page.test/blog/post/' };

  return make(document, window, location) as {
    segments: Array<string | { __xref: string }>;
    crossOriginHrefs: string[];
  };
}

describe('in-page CSSOM extractor source (runtime string)', () => {
  it('compiles and returns segments after template-literal evaluation', () => {
    const r = runExtractor([{ href: null, cssRules: [new CSSStyleRule('p', 'p { color: red }')] }]);
    expect(r.segments.length).toBeGreaterThan(0);
  });

  it('rebases relative url() against the sheet href and leaves absolute/data/protocol-relative untouched', () => {
    const css = [
      '.a { background-image: url(img/rel.png) }',
      ".b { background-image: url('//cdn.other.test/x.png') }",
      '.c { background-image: url(data:image/png;base64,AAA) }',
      '.d { background-image: url(https://abs.test/y.png) }',
    ].join('\n');
    const r = runExtractor([{ href: 'https://page.test/wp-content/themes/t/a.css', cssRules: [new CSSStyleRule('.a,.b,.c,.d', css)] }]);
    const out = r.segments.filter((s): s is string => typeof s === 'string').join('\n');
    expect(out).toContain('url(https://page.test/wp-content/themes/t/img/rel.png)');
    expect(out).toContain("url('//cdn.other.test/x.png')");
    expect(out).toContain('url(data:image/png;base64,AAA)');
    expect(out).toContain('url(https://abs.test/y.png)');
  });

  it('keeps :root custom-property foundations even when selectors match nothing', () => {
    const r = runExtractor([
      { href: null, cssRules: [new CSSStyleRule(':root', ':root { --brand: #f03e2f; --pad: 4px }')] },
    ], { querySelector: () => false });
    const out = r.segments.filter((s): s is string => typeof s === 'string').join('\n');
    expect(out).toContain('--brand');
  });

  it('keeps matching @media blocks whole and skips print sheets', () => {
    const r = runExtractor([
      { href: null, cssRules: [new CSSMediaRule({ mediaText: '(min-width: 600px)' }, '@media (min-width: 600px){ .x{background:linear-gradient(red,blue)} }')] },
      { href: null, media: { mediaText: 'print' }, cssRules: [new CSSStyleRule('.nav', '.nav { display: none }')] },
    ]);
    const out = r.segments.filter((s): s is string => typeof s === 'string').join('\n');
    expect(out).toContain('linear-gradient');
    expect(out).not.toContain('.nav');
  });

  it('marks cross-origin sheets with an __xref marker at their cascade position', () => {
    const r = runExtractor([
      { href: 'https://same.test/a.css', cssRules: [new CSSStyleRule('.a', '.a{}')] },
      { href: 'https://foreign.test/b.css', throwOnCssRules: true },
      { href: 'https://same.test/c.css', cssRules: [new CSSStyleRule('.c', '.c{}')] },
    ]);
    expect(r.crossOriginHrefs).toContain('https://foreign.test/b.css');
    const idx = r.segments.findIndex((s) => typeof s === 'object' && (s as { __xref: string }).__xref === 'https://foreign.test/b.css');
    expect(idx).toBeGreaterThan(0);
    expect(idx).toBeLessThan(r.segments.length - 1);
  });

  it('always keeps @font-face rules', () => {
    const r = runExtractor([{ href: null, cssRules: [new CSSFontFaceRule("@font-face { font-family: X; src: url(f.woff2) format('woff2') }")] }]);
    const out = r.segments.filter((s): s is string => typeof s === 'string').join('\n');
    expect(out).toContain('@font-face');
    expect(out).toContain('url(https://page.test/blog/post/f.woff2)');
  });
});
