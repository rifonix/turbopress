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

export const DEFAULT_SCRIPT_EXCLUSIONS = [
  'turbopress-loader',
  'turbopress-hydrator',
  'jquery.min.js',
  'jquery.js',
  'wp-includes/js/jquery/jquery.min.js',
  'elementor-frontend',
  'elementor/assets/js/frontend',
  'elementorProFrontendConfig',
  'elementorFrontendConfig',
  'cookiebot',
  'complianz',
  'onetrust',
  'cookie-law-info',
  'wp-consent-api',
  'recaptcha',
  'turnstile',
  'stripe',
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
  version: '1.0.0',
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
  javascript: {
    execution_mode: 'defer',
    delay_timeout_ms: 0,
    preserve_execution_order: true,
    exclusions: DEFAULT_SCRIPT_EXCLUSIONS,
    worker_offload: []
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
  version: '1.0.0',
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
  javascript: {
    execution_mode: 'defer',
    delay_timeout_ms: 0,
    preserve_execution_order: true,
    exclusions: DEFAULT_SCRIPT_EXCLUSIONS,
    worker_offload: ['googletagmanager.com', 'connect.facebook.net']
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
  version: '1.0.0',
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
  javascript: {
    execution_mode: 'interaction_delay',
    delay_timeout_ms: 3500,
    preserve_execution_order: true,
    exclusions: DEFAULT_SCRIPT_EXCLUSIONS,
    worker_offload: ['googletagmanager.com', 'connect.facebook.net', 'google-analytics.com']
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
