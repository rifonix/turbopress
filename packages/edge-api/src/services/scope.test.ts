import { describe, it, expect } from 'vitest';
import { computeStructureHash, normalizeAssetUrl } from './structure-hash.js';
import { parseSiteScope, urlInScope, wildcardMatch } from './scope.js';
import { canonicalizeDispatchUrl, groupingKeyForUrl } from './canonical-url.js';

describe('optimize scope', () => {
  it('fails closed to main-pages with crawling off', () => {
    expect(parseSiteScope(null)).toEqual({ scope: 'main-pages', allowlist: [], crawlEnabled: false, stripParams: [] });
    expect(parseSiteScope('not-json')).toEqual({ scope: 'main-pages', allowlist: [], crawlEnabled: false, stripParams: [] });
    expect(parseSiteScope('{"caching":{"optimize_scope":"nonsense"}}').scope).toBe('main-pages');
  });

  it('parses explicit scope, allowlist and crawl flag', () => {
    expect(
      parseSiteScope('{"caching":{"optimize_scope":"all","optimize_only_urls":["/x"],"crawl_enabled":true}}')
    ).toEqual({ scope: 'all', allowlist: ['/x'], crawlEnabled: true, stripParams: [] });
  });

  it('wildcard matching mirrors CacheRules semantics', () => {
    expect(wildcardMatch('/blog/*', '/blog/hello')).toBe(true);
    expect(wildcardMatch('/blog/*', '/blog/')).toBe(true);
    expect(wildcardMatch('/blog/*', '/other')).toBe(false);
    expect(wildcardMatch('/Pricing', '/pricing')).toBe(true);
    expect(wildcardMatch('/exact', '/exact/extra')).toBe(false);
  });

  it('homepage is always in scope; main-pages consults the allowlist', () => {
    const main = { scope: 'main-pages' as const, allowlist: ['/blog/*'], crawlEnabled: false, stripParams: [] };
    expect(urlInScope('https://a.com/', main)).toBe(true);
    expect(urlInScope('https://a.com/blog/x', main)).toBe(true);
    expect(urlInScope('https://a.com/shop/x', main)).toBe(false);
    expect(urlInScope('not-a-url', main)).toBe(false);
    expect(urlInScope('https://a.com/anything', { scope: 'all', allowlist: [], crawlEnabled: false, stripParams: [] })).toBe(true);
    // templates-only passes through to the template-dedup gate
    expect(urlInScope('https://a.com/anything', { scope: 'templates-only', allowlist: [], crawlEnabled: false, stripParams: [] })).toBe(true);
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

describe('dispatch URL canonicalization', () => {
  it('strips ad-click tracking params to one identity', () => {
    const plain = canonicalizeDispatchUrl('https://thebensonhotel.com/');
    const ads = canonicalizeDispatchUrl(
      'https://thebensonhotel.com/?utm_source=google&utm_medium=cpc&utm_campaign=x&gad_campaignid=24157012477&wbraid=ClYKCQ&gclid=abc&fbclid=def'
    );
    expect(plain).toBe('https://thebensonhotel.com/');
    expect(ads).toBe(plain);
  });

  it('strips internal loopback/preview params', () => {
    expect(canonicalizeDispatchUrl('https://a.com/?wp_instant_htaccess_check=1010099667')).toBe('https://a.com/');
    expect(canonicalizeDispatchUrl('https://a.com/page?wpins_preview=1')).toBe('https://a.com/page');
    expect(canonicalizeDispatchUrl('https://a.com/page?preview=true')).toBe('https://a.com/page');
    expect(canonicalizeDispatchUrl('https://a.com/page?elementor-preview=5')).toBe('https://a.com/page');
  });

  it('honors the site strip list and keeps real params sorted', () => {
    expect(canonicalizeDispatchUrl('https://a.com/s?foo=1&vgo_ee=2', ['vgo_ee'])).toBe('https://a.com/s?foo=1');
    expect(canonicalizeDispatchUrl('https://a.com/s?b=2&a=1')).toBe('https://a.com/s?a=1&b=2');
  });

  it('lowercases hosts, drops default ports and fragments, rejects non-http', () => {
    expect(canonicalizeDispatchUrl('HTTPS://A.COM:443/p#frag')).toBe('https://a.com/p');
    expect(canonicalizeDispatchUrl('ftp://a.com/x')).toBeNull();
    expect(canonicalizeDispatchUrl('not-a-url')).toBeNull();
  });

  it('groups dashboard rows by host+path', () => {
    expect(groupingKeyForUrl('https://a.com/?utm_source=x')).toBe(groupingKeyForUrl('https://a.com/'));
    expect(groupingKeyForUrl('https://a.com/Blog/')).toBe('a.com/blog');
  });
});
