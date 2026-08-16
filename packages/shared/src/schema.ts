import { z } from 'zod';

export const PresetTypeSchema = z.enum(['safe', 'aggressive', 'ludicrous', 'custom']);
export const ViewportModeSchema = z.enum(['mobile', 'desktop']);
export const JobStatusSchema = z.enum(['queued', 'processing', 'completed', 'failed', 'needs_attention']);
export const SubscriptionStatusSchema = z.enum(['active', 'past_due', 'canceled', 'revoked', 'trialing']);

export const CachingConfigSchema = z.object({
  enabled: z.boolean().default(true),
  ttl: z.number().int().positive().default(604800),
  mobile_cache: z.boolean().default(true),
  purge_on_post_update: z.boolean().default(true),
  purge_on_comment: z.boolean().default(false),
  strip_query_params: z.array(z.string()).default([]),
  excluded_urls: z.array(z.string()).default([]),
  excluded_cookies: z.array(z.string()).default([])
});

export const CriticalCssConfigSchema = z.object({
  enabled: z.boolean().default(true),
  inline: z.boolean().default(true),
  async_load_full: z.boolean().default(true),
  font_display_swap: z.boolean().default(true),
  viewports: z.array(ViewportModeSchema).default(['mobile', 'desktop']),
  custom_css_injections: z.string().optional(),
  excluded_stylesheets: z.array(z.string()).default([])
});

export const JavascriptConfigSchema = z.object({
  execution_mode: z.enum(['none', 'defer', 'interaction_delay']).default('defer'),
  delay_timeout_ms: z.number().int().min(0).max(10000).default(3500),
  preserve_execution_order: z.boolean().default(true),
  exclusions: z.array(z.string()).default([]),
  remove_jquery_migrate: z.boolean().default(false),
  worker_offload: z.array(z.string()).default([])
});

export const CssConfigSchema = z.object({
  combine: z.boolean().default(true),
  minify: z.boolean().default(true),
  max_files: z.number().int().min(2).max(100).default(40),
  inline_all: z.boolean().default(true),
  inline_all_threshold: z.number().int().min(10240).max(524288).default(153600)
});

export const AssetsConfigSchema = z.object({
  proxy_enabled: z.boolean().default(false),
  keep_origins: z.array(z.string()).default([])
});

export const HtaccessConfigSchema = z.object({
  enabled: z.boolean().default(true),
  brotli_filters: z.boolean().default(true)
});

export const PluginsConfigSchema = z.object({
  unload_rules: z.record(z.string(), z.array(z.string().min(1).max(100)).max(50)).default({})
});

export const FontsConfigSchema = z.object({
  localize_google: z.boolean().default(true),
  preload_lcp_font: z.boolean().default(true)
});

export const HintsConfigSchema = z.object({
  resource_hints: z.boolean().default(true)
});

export const DeploymentConfigSchema = z.object({
  status: z.enum(['test', 'live']).default('test'),
  auto_degrade: z.boolean().default(true),
  source: z.enum(['dashboard', 'plugin']).optional()
});

export const MediaConfigSchema = z.object({
  auto_fetchpriority_lcp: z.boolean().default(true),
  preload_lcp_image: z.boolean().default(true),
  inject_missing_dimensions: z.boolean().default(true),
  serve_nextgen_formats: z.boolean().default(true),
  lazyload_images: z.boolean().default(true),
  lazyload_iframes: z.boolean().default(true),
  lazyload_offset_px: z.number().int().min(0).max(2000).default(300),
  excluded_images: z.array(z.string()).default([]),
  offload_images: z.boolean().default(false),
  offload_video: z.boolean().default(false),
  offload_widths: z.array(z.number().int().min(16).max(4000)).default([320, 480, 768, 1200, 1600])
});

export const DynamicConfigSchema = z.object({
  speculation_rules_prerender: z.boolean().default(true),
  speculation_rules_eagerness: z.enum(['immediate', 'eager', 'moderate', 'conservative']).default('moderate'),
  nonce_ajax_refresh: z.boolean().default(true),
  cart_micro_hydration: z.boolean().default(true),
  excluded_prerender_paths: z.array(z.string()).default([])
});

export const SiteConfigSchema = z.object({
  version: z.string().default('1.0.0'),
  preset: PresetTypeSchema.default('ludicrous'),
  caching: CachingConfigSchema,
  critical_css: CriticalCssConfigSchema,
  javascript: JavascriptConfigSchema,
  media: MediaConfigSchema,
  dynamic: DynamicConfigSchema,
  css: CssConfigSchema.optional(),
  assets: AssetsConfigSchema.optional(),
  htaccess: HtaccessConfigSchema.optional(),
  plugins: PluginsConfigSchema.optional(),
  fonts: FontsConfigSchema.optional(),
  hints: HintsConfigSchema.optional(),
  deployment: DeploymentConfigSchema.optional()
});

export const HandshakeRequestSchema = z
  .object({
    domain: z.string().optional(),
    site_url: z.string().optional(),
    state: z.string().optional(),
    state_nonce: z.string().optional(),
    return_url: z.string(),
    wp_version: z.string().optional(),
    plugin_version: z.string().optional(),
  })
  .transform((data) => {
    const rawDomain = data.domain || data.site_url || '';
    const cleanDomain = rawDomain.replace(/^https?:\/\//i, '').replace(/\/.*$/, '').trim().toLowerCase();
    const cleanState = data.state || data.state_nonce || '';
    return {
      domain: cleanDomain,
      state: cleanState,
      return_url: data.return_url,
      wp_version: data.wp_version,
      plugin_version: data.plugin_version,
    };
  })
  .refine((data) => data.domain.length >= 3, { message: 'A valid domain is required' })
  .refine((data) => data.state.length >= 6, { message: 'A valid state nonce is required' });

export const OptimizationDispatchSchema = z.object({
  url: z.string().url(),
  viewports: z.array(ViewportModeSchema).optional().default(['mobile', 'desktop'])
});

export const PurgeCacheRequestSchema = z.object({
  urls: z.array(z.string()).optional(),
  purge_all: z.boolean().optional().default(false)
});
