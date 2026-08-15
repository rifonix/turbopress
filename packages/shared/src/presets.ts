import { SiteConfig } from './types.js';

export const DEFAULT_QUERY_PARAMS_STRIP = [
  'utm_*',
  'fbclid',
  'gclid',
  '_ga',
  '_gl',
  'mc_cid',
  'mc_eid',
  'msclkid',
  'adgroupid',
  'campaignid',
  'vgo_ee'
];

export const DEFAULT_EXCLUDED_COOKIES = [
  'wordpress_logged_in_*',
  'wp-postpass_*',
  'comment_author_*',
  'woocommerce_items_in_cart',
  'edd_items_in_cart'
];

export const DEFAULT_EXCLUDED_URLS = [
  '/wp-admin/*',
  '/wp-login.php',
  '/cart/*',
  '/checkout/*',
  '/my-account/*',
  '/edd-checkout/*',
  '*.xml',
  '*.xsl'
];

/**
 * v1.2.0: exclusions apply ONLY to interaction_delay mode. Blanket builder
 * keywords (elementor, jquery.js, …) were removed — they made defer mode a
 * no-op. This list is scripts that must run before first interaction:
 * consent banners, payments, bot checks, cart fragments.
 */
export const DEFAULT_SCRIPT_EXCLUSIONS = [
  'turbopress-loader',
  'turbopress-hydrator',
  'cookiebot',
  'complianz',
  'onetrust',
  'cookie-law-info',
  'cookie-notice',
  'wp-consent-api',
  'stripe',
  'recaptcha',
  'turnstile',
  'woocommerce-cart',
  'wc-cart-fragments',
  'wc-add-to-cart'
];

export const DEFAULT_EXCLUDED_PRERENDER_PATHS = [
  '/wp-admin/**',
  '/wp-login.php',
  '/cart/**',
  '/checkout/**',
  '/my-account/**',
  '/logout/**',
  '/wp-json/**',
  '*.pdf',
  '*.zip',
  '*.tar.gz'
];

export const PRESET_SAFE: SiteConfig = {
  version: '1.4.0',
  preset: 'safe',
  caching: {
    enabled: true,
    ttl: 604800, // 7 days
    mobile_cache: false,
    purge_on_post_update: true,
    purge_on_comment: false,
    strip_query_params: DEFAULT_QUERY_PARAMS_STRIP,
    excluded_urls: DEFAULT_EXCLUDED_URLS,
    excluded_cookies: DEFAULT_EXCLUDED_COOKIES
  },
  critical_css: {
    enabled: false,
    inline: false,
    async_load_full: false,
    font_display_swap: true,
    viewports: ['mobile', 'desktop'],
    excluded_stylesheets: []
  },
  css: {
    combine: false,
    minify: true,
    max_files: 40
  },
  javascript: {
    execution_mode: 'none', // v1.3.0 risk ladder: safe = no JS changes at all
    delay_timeout_ms: 0,
    preserve_execution_order: true,
    exclusions: DEFAULT_SCRIPT_EXCLUSIONS,
    remove_jquery_migrate: false,
    worker_offload: []
  },
  fonts: {
    localize_google: false,
    bundle_vendor_css: true,
    preload_lcp_font: true
  },
  hints: {
    resource_hints: true
  },
  deployment: {
    status: 'test', // new sites start in Test Mode; existing migrate as live
    auto_degrade: true
  },
  media: {
    auto_fetchpriority_lcp: true,
    preload_lcp_image: true,
    inject_missing_dimensions: true,
    serve_nextgen_formats: false,
    lazyload_images: true,
    lazyload_iframes: true,
    lazyload_offset_px: 300,
    excluded_images: []
  },
  dynamic: {
    speculation_rules_prerender: true,
    speculation_rules_eagerness: 'moderate',
    nonce_ajax_refresh: true,
    cart_micro_hydration: true,
    excluded_prerender_paths: DEFAULT_EXCLUDED_PRERENDER_PATHS
  }
};

export const PRESET_AGGRESSIVE: SiteConfig = {
  version: '1.4.0',
  preset: 'aggressive',
  caching: {
    enabled: true,
    ttl: 604800,
    mobile_cache: true,
    purge_on_post_update: true,
    purge_on_comment: false,
    strip_query_params: DEFAULT_QUERY_PARAMS_STRIP,
    excluded_urls: DEFAULT_EXCLUDED_URLS,
    excluded_cookies: DEFAULT_EXCLUDED_COOKIES
  },
  critical_css: {
    enabled: true,
    inline: true,
    async_load_full: true,
    font_display_swap: true,
    viewports: ['mobile', 'desktop'],
    excluded_stylesheets: []
  },
  css: {
    combine: true,
    minify: true,
    max_files: 40
  },
  javascript: {
    execution_mode: 'defer',
    delay_timeout_ms: 0,
    preserve_execution_order: true,
    exclusions: DEFAULT_SCRIPT_EXCLUSIONS,
    remove_jquery_migrate: false,
    worker_offload: ['googletagmanager.com', 'connect.facebook.net']
  },
  fonts: {
    localize_google: true,
    bundle_vendor_css: true,
    preload_lcp_font: true
  },
  hints: {
    resource_hints: true
  },
  deployment: {
    status: 'test', // new sites start in Test Mode; existing migrate as live
    auto_degrade: true
  },
  media: {
    auto_fetchpriority_lcp: true,
    preload_lcp_image: true,
    inject_missing_dimensions: true,
    serve_nextgen_formats: true,
    lazyload_images: true,
    lazyload_iframes: true,
    lazyload_offset_px: 300,
    excluded_images: []
  },
  dynamic: {
    speculation_rules_prerender: true,
    speculation_rules_eagerness: 'moderate',
    nonce_ajax_refresh: true,
    cart_micro_hydration: true,
    excluded_prerender_paths: DEFAULT_EXCLUDED_PRERENDER_PATHS
  }
};

export const PRESET_LUDICROUS: SiteConfig = {
  version: '1.4.0',
  preset: 'ludicrous',
  caching: {
    enabled: true,
    ttl: 604800,
    mobile_cache: true,
    purge_on_post_update: true,
    purge_on_comment: false,
    strip_query_params: DEFAULT_QUERY_PARAMS_STRIP,
    excluded_urls: DEFAULT_EXCLUDED_URLS,
    excluded_cookies: DEFAULT_EXCLUDED_COOKIES
  },
  critical_css: {
    enabled: true,
    inline: true,
    async_load_full: true,
    font_display_swap: true,
    viewports: ['mobile', 'desktop'],
    excluded_stylesheets: []
  },
  css: {
    combine: true,
    minify: true,
    max_files: 40
  },
  javascript: {
    execution_mode: 'interaction_delay',
    delay_timeout_ms: 3500,
    preserve_execution_order: true,
    exclusions: DEFAULT_SCRIPT_EXCLUSIONS,
    remove_jquery_migrate: false,
    worker_offload: ['googletagmanager.com', 'connect.facebook.net', 'google-analytics.com']
  },
  fonts: {
    localize_google: true,
    bundle_vendor_css: true,
    preload_lcp_font: true
  },
  hints: {
    resource_hints: true
  },
  deployment: {
    status: 'test', // new sites start in Test Mode; existing migrate as live
    auto_degrade: true
  },
  media: {
    auto_fetchpriority_lcp: true,
    preload_lcp_image: true,
    inject_missing_dimensions: true,
    serve_nextgen_formats: true,
    lazyload_images: true,
    lazyload_iframes: true,
    lazyload_offset_px: 300,
    excluded_images: []
  },
  dynamic: {
    speculation_rules_prerender: true,
    speculation_rules_eagerness: 'eager',
    nonce_ajax_refresh: true,
    cart_micro_hydration: true,
    excluded_prerender_paths: DEFAULT_EXCLUDED_PRERENDER_PATHS
  }
};

export const PRESETS_RECORD: Record<string, SiteConfig> = {
  safe: PRESET_SAFE,
  aggressive: PRESET_AGGRESSIVE,
  ludicrous: PRESET_LUDICROUS
};

export function getPresetConfig(preset: string): SiteConfig {
  return PRESETS_RECORD[preset] || PRESET_LUDICROUS;
}
