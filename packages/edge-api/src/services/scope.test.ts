import { describe, it, expect } from 'vitest';
import { computeStructureHash, normalizeAssetUrl } from './structure-hash.js';
import { parseSiteScope, urlInScope, wildcardMatch } from './scope.js';

describe('optimize scope', () => {
  it('fails closed to main-pages with crawling off', () => {
    expect(parseSiteScope(null)).toEqual({ scope: 'main-pages', allowlist: [], crawlEnabled: false });
    expect(parseSiteScope('not-json')).toEqual({ scope: 'main-pages', allowlist: [], crawlEnabled: false });
    expect(parseSiteScope('{"caching":{"optimize_scope":"nonsense"}}').scope).toBe('main-pages');
  });

  it('parses explicit scope, allowlist and crawl flag', () => {
    expect(
      parseSiteScope('{"caching":{"optimize_scope":"all","optimize_only_urls":["/x"],"crawl_enabled":true}}')
    ).toEqual({ scope: 'all', allowlist: ['/x'], crawlEnabled: true });
  });

  it('wildcard matching mirrors CacheRules semantics', () => {
    expect(wildcardMatch('/blog/*', '/blog/hello')).toBe(true);
    expect(wildcardMatch('/blog/*', '/blog/')).toBe(true);
    expect(wildcardMatch('/blog/*', '/other')).toBe(false);
    expect(wildcardMatch('/Pricing', '/pricing')).toBe(true);
    expect(wildcardMatch('/exact', '/exact/extra')).toBe(false);
  });

  it('homepage is always in scope; main-pages consults the allowlist', () => {
    const main = { scope: 'main-pages' as const, allowlist: ['/blog/*'], crawlEnabled: false };
    expect(urlInScope('https://a.com/', main)).toBe(true);
    expect(urlInScope('https://a.com/blog/x', main)).toBe(true);
    expect(urlInScope('https://a.com/shop/x', main)).toBe(false);
    expect(urlInScope('not-a-url', main)).toBe(false);
    expect(urlInScope('https://a.com/anything', { scope: 'all', allowlist: [], crawlEnabled: false })).toBe(true);
    // templates-only passes through to the template-dedup gate
    expect(urlInScope('https://a.com/anything', { scope: 'templates-only', allowlist: [], crawlEnabled: false })).toBe(true);
  });
});

describe('structure hash (TS port of DomEngine::compute_structure_hash)', () => {
  const html = (css: string) =>
    `<html><head><link rel="stylesheet" href="${css}"></head>` +
    `<body><div id="post-42" class="hero count-3"><script src="https://a.com/app.js"></script></div></body></html>`;

  it('is deterministic', () => {
    expect(computeStructureHash(html('https://a.com/a.css'))).toBe(computeStructureHash(html('https://a.com/a.css')));
    expect(computeStructureHash(html('https://a.com/a.css'))).toMatch(/^[0-9a-f]{32}$/);
  });

  it('ignores query strings and fragments on asset URLs (?ver= bumps share)', () => {
    expect(computeStructureHash(html('https://a.com/a.css?ver=6.8'))).toBe(
      computeStructureHash(html('https://a.com/a.css?ver=6.9#frag'))
    );
  });

  it('keeps distinct asset paths distinct (per-page bundles never share)', () => {
    expect(computeStructureHash(html('https://a.com/post-1.css'))).not.toBe(
      computeStructureHash(html('https://a.com/post-2.css'))
    );
  });

  it('strips numeric id/class tails like the PHP original', () => {
    const a = `<div id="item-1" class="col-2"></div>`;
    const b = `<div id="item-99" class="col-12"></div>`;
    expect(computeStructureHash(a)).toBe(computeStructureHash(b));
  });

  it('normalizeAssetUrl cuts at the first ? or #', () => {
    expect(normalizeAssetUrl('https://a.com/x.css?ver=1#y')).toBe('https://a.com/x.css');
    expect(normalizeAssetUrl('https://a.com/x.css')).toBe('https://a.com/x.css');
  });
});
