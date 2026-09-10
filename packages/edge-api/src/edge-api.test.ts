import { describe, it, expect } from 'vitest';
import {
  HandshakeRequestSchema,
  SiteConfigSchema,
  OptimizationDispatchSchema,
  PRESET_LUDICROUS,
  PRESET_AGGRESSIVE,
  PRESET_SAFE,
  sha256,
  generateApiKey,
  normalizeDomain,
} from '@wpinstant/shared';
import { contentTypeFor } from './routes/assets.js';
import { safeMinifyCss } from './services/puppeteer-extractor.js';

describe('WP Instant Architecture & Core Engine Tests', () => {
  it('correctly hashes API keys with SHA-256', async () => {
    const key = generateApiKey('sk_live_');
    expect(key.startsWith('sk_live_')).toBe(true);
    const hash = await sha256(key);
    expect(hash).toHaveLength(64);
  });

  it('normalizes domains accurately', () => {
    expect(normalizeDomain('https://WWW.GrandemareHotel.com/blog')).toBe('www.grandemarehotel.com');
    expect(normalizeDomain('shop.example.com/products/')).toBe('shop.example.com');
  });

  it('resolves serving content types from source URL extensions', () => {
    expect(contentTypeFor('https://site.com/wp-content/cache/bundle.css?ver=3', 'application/octet-stream')).toBe(
      'text/css; charset=utf-8'
    );
    expect(contentTypeFor('https://site.com/wp-includes/js/jquery.min.js?ver=6.7', 'application/octet-stream')).toBe(
      'text/javascript'
    );
    expect(contentTypeFor('https://site.com/media/video.mp4', 'application/octet-stream')).toBe('video/mp4');
    expect(contentTypeFor('https://site.com/media/clip.webm#t=1', 'application/octet-stream')).toBe('video/webm');
    expect(contentTypeFor('https://site.com/fonts/a.woff2', 'application/octet-stream')).toBe('font/woff2');
    // Unknown extension: honour the caller's fallback (never video/mp4).
    expect(contentTypeFor('https://site.com/file.bin', 'application/octet-stream')).toBe('application/octet-stream');
  });

  it('safeMinifyCss keeps gradients and url() tokens intact', () => {
    const css =
      '.elementor-element-1 > .elementor-background-overlay{background-image:linear-gradient(180deg,#000 0%,#fff 100%);opacity:.5}\n' +
      '.hero{background-image:url("https://site.com/photo.jpg?w=100&h=50")}';
    const min = safeMinifyCss(css);
    expect(min).toContain('linear-gradient(180deg,#000 0%,#fff 100%)');
    expect(min).toContain('url("https://site.com/photo.jpg?w=100&h=50")');
    expect(min).not.toContain('\n');
  });

  it('safeMinifyCss preserves calc() operator spacing and descendant pseudo-selectors', () => {
    const min = safeMinifyCss(
      '.hero{width:calc(100% + 2px);margin:calc(1rem - 2px)}\n.hero :hover{color:red}\n.hero :is(a,b){color:blue}\n.a + .b{margin:0}'
    );
    // calc() + and - REQUIRE surrounding spaces — stripping them invalidates the declaration.
    expect(min).toContain('calc(100% + 2px)');
    expect(min).toContain('calc(1rem - 2px)');
    // A space before a pseudo-class is a descendant combinator, not noise.
    expect(min).toContain('.hero :hover');
    expect(min).toContain('.hero :is(a,b)');
    // Sibling combinator semantics survive (whitespace around + is left alone).
    expect(min).toContain('.b{margin:0}');
  });

  it('validates HandshakeRequestSchema', () => {
    const valid = {
      domain: 'grandemarehotel.com',
      state: 'state_nonce_123',
      return_url: 'https://grandemarehotel.com/wp-admin/admin.php?page=wp-instant',
      wp_version: '6.7',
      plugin_version: '1.0.0',
    };

    const parsed = HandshakeRequestSchema.parse(valid);
    expect(parsed.domain).toBe('grandemarehotel.com');
  });

  it('validates SiteConfigSchema with Ludicrous speed presets', () => {
    const parsed = SiteConfigSchema.parse(PRESET_LUDICROUS);
    expect(parsed.preset).toBe('ludicrous');
    expect(parsed.javascript.execution_mode).toBe('interaction_delay');
    expect(parsed.dynamic.speculation_rules_prerender).toBe(true);
  });

  it('validates Aggressive and Safe presets', () => {
    expect(SiteConfigSchema.parse(PRESET_AGGRESSIVE).preset).toBe('aggressive');
    expect(SiteConfigSchema.parse(PRESET_SAFE).preset).toBe('safe');
  });

  it('accepts the plugin-authoritative 768KB inline threshold', () => {
    const pluginConfig = {
      ...PRESET_LUDICROUS,
      css: { ...PRESET_LUDICROUS.css, inline_all_threshold: 786432 },
    };

    expect(SiteConfigSchema.parse(pluginConfig).css?.inline_all_threshold).toBe(786432);
  });

  it('rejects inline thresholds above the plugin maximum', () => {
    const oversized = {
      ...PRESET_LUDICROUS,
      css: { ...PRESET_LUDICROUS.css, inline_all_threshold: 786433 },
    };

    expect(() => SiteConfigSchema.parse(oversized)).toThrowError(/less than or equal to 786432/);
  });

  it('validates OptimizationDispatchSchema', () => {
    const valid = {
      url: 'https://grandemarehotel.com/products',
      viewports: ['mobile', 'desktop'],
      priority: 'high',
    };

    const parsed = OptimizationDispatchSchema.parse(valid);
    expect(parsed.viewports).toContain('mobile');
    expect(parsed.viewports).toContain('desktop');
  });

  it('validates Bloat, Video Facades, and Relational Purge in SiteConfigSchema', () => {
    const config = {
      ...PRESET_LUDICROUS,
      bloat: {
        disable_emojis: true,
        disable_dashicons_guest: true,
        disable_xmlrpc: true,
        disable_oembeds: true,
        heartbeat_control: true,
        post_revisions_limit: 3,
      },
      media: {
        ...PRESET_LUDICROUS.media,
        youtube_facades: true,
        vimeo_facades: true,
        self_host_gravatars: true,
      },
      caching: {
        ...PRESET_LUDICROUS.caching,
        relational_auto_purge: true,
      },
    };

    const parsed = SiteConfigSchema.parse(config);
    expect(parsed.bloat?.disable_emojis).toBe(true);
    expect(parsed.bloat?.disable_xmlrpc).toBe(true);
    expect(parsed.media.youtube_facades).toBe(true);
    expect(parsed.media.self_host_gravatars).toBe(true);
    expect(parsed.caching.relational_auto_purge).toBe(true);
  });

  it('validates structure_hash in OptimizationDispatchSchema', () => {
    const valid = {
      url: 'https://grandemarehotel.com/products/summer-tshirt',
      viewports: ['mobile', 'desktop'],
      structure_hash: 'd41d8cd98f00b204e9800998ecf8427e',
      priority: 'high',
    };

    const parsed = OptimizationDispatchSchema.parse(valid);
    expect(parsed.structure_hash).toBe('d41d8cd98f00b204e9800998ecf8427e');
    expect(parsed.priority).toBe('high');
  });

  it('rejects expired or invalid JWT structure in verifyClerkJwt', async () => {
    const { verifyClerkJwt } = await import('./middleware/auth.js');
    const dummyEnv: any = {
      ENVIRONMENT: 'production',
      KV: { get: async () => null, put: async () => {} },
      DB: { prepare: () => ({ bind: () => ({ first: async () => null }) }) },
    };

    // Invalid format
    const invalidRes = await verifyClerkJwt('not-a-jwt', dummyEnv);
    expect(invalidRes).toBeNull();

    // Expired payload
    const expiredPayload = btoa(JSON.stringify({ sub: 'user_123', exp: 1000 }));
    const header = btoa(JSON.stringify({ alg: 'RS256', kid: 'key_1' }));
    const expiredJwt = `${header}.${expiredPayload}.invalidsig`;
    const expiredRes = await verifyClerkJwt(expiredJwt, dummyEnv);
    expect(expiredRes).toBeNull();
  });
});
