// One-off walkthrough: execute the ACTUAL in-page extractor source string
// from puppeteer-extractor.ts against stubbed DOM objects, verifying that
// late Elementor stylesheet rules (gradients/overlays) survive the output
// budget under the new per-rule granularity.
import fs from 'node:fs';

const ts = fs.readFileSync(new URL('../src/services/puppeteer-extractor.ts', import.meta.url), 'utf8');
// Target the extractUsedCssViaCssom block specifically (extractInternalLinks
// also declares `const src` but is a different in-page program).
const fnAt = ts.indexOf('async function extractUsedCssViaCssom');
const start = ts.indexOf('const src = `', fnAt);
const end = ts.indexOf('`;', start);
if (fnAt < 0 || start < 0 || end < 0) throw new Error('source block not found');
if (ts.slice(start, end).includes('${')) throw new Error('unexpected interpolation');
// Disk text contains template-literal escaping (\\s on disk = \s at runtime).
// eval() here is intentional and safe-by-construction: the string is this
// repo's own shipped in-page extractor, read straight from source control,
// not user input.
const pageSrc = ts.slice(start + 'const src = `'.length, end).replace(/\\\\/g, '\\');

// ---- Minimal DOM/CSSOM stubs ----
class CSSStyleRule {
  constructor(selectorText, cssText, props = []) {
    this.selectorText = selectorText;
    this.cssText = cssText;
    this.style = { length: props.length, item: (i) => props[i], [Symbol.iterator]: function* () { yield* props; } };
  }
}
class CSSMediaRule {
  constructor(query, inner) { this.media = { mediaText: query }; this._inner = inner; }
  get cssText() { return `@media ${this.media.mediaText}{${this._inner.map((r) => r.cssText).join('')}}`; }
  get cssRules() { return this._inner; }
}
class CSSFontFaceRule { constructor(cssText) { this.cssText = cssText; } }

const elSheetRules = [];
for (let i = 0; i < 20; i++) {
  elSheetRules.push(new CSSStyleRule(
    `.elementor-element-${i} > .elementor-background-overlay`,
    `.elementor-element-${i} > .elementor-background-overlay{background-image:linear-gradient(180deg,#000 0%,#fff 100%);opacity:.5}`
  ));
}
const themeRules = [];
for (let i = 0; i < 900; i++) {
  themeRules.push(new CSSStyleRule(
    `.theme-unused-${i}`,
    `.theme-unused-${i}{color:#333;margin:0 0 10px;padding:4px 8px;border-radius:3px;display:block}`.repeat(11)
  ));
}
const matching = [
  new CSSStyleRule('.match-me', '.match-me{color:#f00}', ['color']),
  new CSSStyleRule('.has-gradient', '.has-gradient{background-image:linear-gradient(90deg,#111 0%,#222 100%)}'),
  new CSSStyleRule('::placeholder-x .x::before', '.x::before{content:"icon"}'),
  new CSSFontFaceRule('@font-face{font-family:Sirivenne;src:url(/fonts/sirivenne.woff2) format("woff2")}'),
];
const media = new CSSMediaRule('(max-width: 767px)', [
  new CSSStyleRule('.elementor-element-9 > .elementor-background-overlay', '.elementor-element-9 > .elementor-background-overlay{background-color:#0af}'),
]);

const sheets = [
  { cssRules: themeRules, href: 'https://site.com/wp-content/themes/big/style.css' },        // big early sheet
  { cssRules: [media, ...matching], href: 'https://site.com/wp-content/elementor/css/post-12.css' }, // late builder sheet
  { cssRules: elSheetRules, href: 'https://site.com/wp-content/elementor/css/post-12-widgets.css' },
];

globalThis.document = {
  styleSheets: sheets,
  // Real DOM: used selectors match rendered elements, and INVALID selectors
  // (unknown pseudo-elements) throw SyntaxError like a real qSA — the
  // extractor keeps throwing selectors conservatively.
  querySelector: (sel) => {
    if (/::/.test(String(sel))) throw new Error('not a valid selector');
    return /\.match-me|\.theme-unused-|\.elementor-element-|\.has-gradient|^\.x$/.test(String(sel)) ? {} : null;
  },
};
globalThis.window = { matchMedia: (q) => ({ matches: String(q).includes('767') }) };
globalThis.CSS = { supports: () => true };

const result = eval(pageSrc);
// The extractor now returns ordered segments (strings + cross-origin
// {__xref} markers); join the string segments like the caller does.
const css = result.segments.filter((s) => typeof s === 'string').join('\n');

const checks = {
  'late gradient/overlay rules survive': [...css.matchAll(/elementor-background-overlay/g)].length >= 20,
  'gradient declarations present': css.includes('linear-gradient(180deg,#000 0%,#fff 100%)'),
  'media block overlay kept': css.includes('background-color:#0af'),
  'matching rule kept': css.includes('.match-me{color:#f00}'),
  'pseudo-element rule kept': css.includes('::before{content:"icon"}'),
  'font-face kept': css.includes('@font-face'),
  'unused non-protected rules dropped past budget': !css.includes('.theme-unused-899'),
  'no protected rules dropped': (() => {
    const keptGradients = [...css.matchAll(/linear-gradient/g)].length;
    return keptGradients >= 21; // 20 overlay rules + .has-gradient
  })(),
};
let ok = true;
for (const [name, pass] of Object.entries(checks)) {
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}`);
  if (!pass) ok = false;
}
console.log(`output: ${(Buffer.byteLength(css) / 1024).toFixed(1)}KB, crossOrigin: ${result.crossOriginHrefs.length}`);
process.exit(ok ? 0 : 1);
