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
} from '@turbopress/shared';

describe('Turbopress Architecture & Core Engine Tests', () => {
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

  it('validates HandshakeRequestSchema', () => {
    const valid = {
      domain: 'grandemarehotel.com',
      state: 'state_nonce_123',
      return_url: 'https://grandemarehotel.com/wp-admin/admin.php?page=turbopress',
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
});
