export type PresetType = 'safe' | 'aggressive' | 'ludicrous' | 'custom';

export type ViewportMode = 'mobile' | 'desktop';

export type JobStatus = 'queued' | 'processing' | 'completed' | 'failed';

export type SubscriptionStatus = 'active' | 'past_due' | 'canceled' | 'revoked' | 'trialing';

export interface CachingConfig {
  enabled: boolean;
  ttl: number; // in seconds, default 604800 (7 days)
  mobile_cache: boolean; // separate mobile & desktop cache
  purge_on_post_update: boolean;
  purge_on_comment: boolean;
  strip_query_params: string[];
  excluded_urls: string[];
  excluded_cookies: string[];
}

export interface CriticalCssConfig {
  enabled: boolean;
  inline: boolean;
  async_load_full: boolean;
  font_display_swap: boolean;
  viewports: ViewportMode[];
  custom_css_injections?: string;
  excluded_stylesheets: string[];
}

export interface CssConfig {
  combine: boolean; // merge render-blocking stylesheets into one bundle
  minify: boolean;
  max_files: number;
}

export interface JavascriptConfig {
  execution_mode: 'none' | 'defer' | 'interaction_delay';
  delay_timeout_ms: number; // default 3500ms
  preserve_execution_order: boolean;
  exclusions: string[]; // scripts exempted from delay (executed immediately)
  remove_jquery_migrate: boolean; // drop jquery-migrate entirely (defer mode)
  worker_offload: string[]; // 3rd party scripts to offload (GTM, FB Pixel, etc.)
}

export interface FontsConfig {
  localize_google: boolean; // serve Google Fonts same-origin w/ display:swap
  bundle_vendor_css: boolean; // pin leaflet / jquery-ui CSS to plugin bundles
  preload_lcp_font: boolean;
}

export interface HintsConfig {
  resource_hints: boolean; // auto preconnect/dns-prefetch for 3rd-party origins
}

export interface DeploymentConfig {
  /** test = visitors get unoptimized HTML, admins preview via ?tp_preview=1 */
  status: 'test' | 'live';
  /** auto step down interaction_delay→defer→none on rising JS error rates */
  auto_degrade: boolean;
  /** provenance: 'dashboard' marks a SaaS-issued command the plugin MUST adopt;
   *  absent/plugin = the plugin is authoritative and the edge value is a mirror */
  source?: 'dashboard' | 'plugin';
}

export interface MediaConfig {
  auto_fetchpriority_lcp: boolean;
  preload_lcp_image: boolean;
  inject_missing_dimensions: boolean;
  serve_nextgen_formats: boolean;
  lazyload_images: boolean;
  lazyload_iframes: boolean;
  lazyload_offset_px: number;
  excluded_images: string[];
  offload_images: boolean;
  offload_video: boolean;
  offload_widths: number[];
}

export interface DynamicConfig {
  speculation_rules_prerender: boolean;
  speculation_rules_eagerness: 'immediate' | 'eager' | 'moderate' | 'conservative';
  nonce_ajax_refresh: boolean;
  cart_micro_hydration: boolean;
  excluded_prerender_paths: string[];
}

export interface SiteConfig {
  version: string;
  preset: PresetType;
  caching: CachingConfig;
  critical_css: CriticalCssConfig;
  css?: CssConfig;
  javascript: JavascriptConfig;
  fonts?: FontsConfig;
  hints?: HintsConfig;
  deployment?: DeploymentConfig;
  media: MediaConfig;
  dynamic: DynamicConfig;
}

export interface User {
  id: string; // Clerk User ID (user_2x...)
  email: string;
  polar_customer_id?: string | null;
  created_at: number;
  updated_at: number;
}

export interface Subscription {
  id: string; // Polar Subscription ID
  user_id: string;
  plan_id: string;
  status: SubscriptionStatus;
  max_sites: number;
  current_period_end: number;
  created_at: number;
  updated_at: number;
}

export interface Site {
  id: string; // site_uuid
  user_id: string;
  subscription_id: string;
  domain: string; // e.g. "example.com"
  site_api_key_hash: string; // SHA-256
  config_json: string; // JSON encoded SiteConfig
  is_active: number; // 0 or 1
  site_url?: string | null; // canonical WP home URL (callback pushes)
  callback_secret?: string | null; // HMAC secret for optimize-callback
  health_json?: string | null; // latest plugin health report
  wp_version?: string | null;
  plugin_version?: string | null;
  last_ping_at?: number | null;
  created_at: number;
  updated_at: number;
}

export interface OptimizationJob {
  id: string; // job_uuid
  site_id: string;
  url: string;
  viewport: ViewportMode;
  status: JobStatus;
  critical_css_r2_key?: string | null;
  lcp_selector?: string | null;
  lcp_image_url?: string | null;
  error_message?: string | null;
  attempts: number;
  created_at: number;
  completed_at?: number | null;
}

export interface PerformanceAudit {
  id: string;
  site_id: string;
  url: string;
  device: ViewportMode;
  performance_score: number; // 0-100
  lcp_ms: number;
  fid_inp_ms: number;
  cls_score: number;
  fcp_ms: number;
  created_at: number;
}

export interface HandshakePayload {
  domain: string;
  state: string;
  return_url: string;
  wp_version?: string;
  plugin_version?: string;
}

export interface HandshakeResponse {
  apiKey: string;
  siteId: string;
  domain: string;
  config: SiteConfig;
  callback_url?: string;
  message?: string;
}

export interface NonceRefreshRequest {
  actions: string[];
  post_id?: number;
}

export interface NonceRefreshResponse {
  nonces: Record<string, string>;
  cart_hash?: string;
  cart_count?: number;
  timestamp: number;
}
