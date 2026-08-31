<?php
namespace WPInstant;

if (!defined('ABSPATH')) {
    exit;
}

class Config {
    public const OPTION_KEY = 'wp_instant_config';
    public const API_KEY_OPTION = 'wp_instant_api_key';
    public const SITE_ID_OPTION = 'wp_instant_site_id';
    public const API_URL_OPTION = 'wp_instant_api_url';
    public const CALLBACK_SECRET_OPTION = 'wp_instant_callback_secret';

    /**
     * Structural config version. Bumped when defaults change in a way that
     * must override values persisted by older plugin releases.
     */
    public const CONFIG_VERSION = '1.10.0';

    private array $data = [];

    public function __construct() {
        $this->load();
    }

    public function load(): void {
        $stored = get_option(self::OPTION_KEY, []);
        $preset = is_array($stored) && !empty($stored['preset']) ? (string) $stored['preset'] : 'ludicrous';
        $defaults = $this->get_default_config($preset);
        // List-aware merge: stored LISTS replace default lists wholesale.
        // (array_replace_recursive merges numeric arrays index-by-index, so
        // a stored 3-item exclusions list inherited 11 leftover defaults —
        // user edits to list settings were silently corrupted on every load.)
        $this->data = is_array($stored) ? self::merge_config($defaults, $stored) : $defaults;
        $this->migrate_legacy_config($preset, is_array($stored) ? $stored : []);
    }

    /**
     * Deep-merge $override over $base with correct list semantics:
     * associative arrays merge recursively (so new default keys appear on
     * upgrade); numerically-indexed lists and empty arrays REPLACE outright
     * (so dashboard edits that remove an entry actually stick).
     */
    public static function merge_config(array $base, array $override): array {
        foreach ($override as $key => $value) {
            if (
                is_array($value) && $value !== []
                && isset($base[$key]) && is_array($base[$key])
                && self::is_assoc($value) && self::is_assoc($base[$key])
            ) {
                $base[$key] = self::merge_config($base[$key], $value);
                continue;
            }
            $base[$key] = $value;
        }
        return $base;
    }

    private static function is_assoc(array $arr): bool {
        return $arr !== [] && array_keys($arr) !== range(0, count($arr) - 1);
    }

    /**
     * v1.2.0 migration: earlier releases shipped blanket script exclusions
     * ('elementor', 'jquery.js', …) that were also applied in plain defer
     * mode — which effectively disabled script deferral on every Elementor
     * site. Exclusions now only apply to interaction_delay mode, so legacy
     * blanket keywords are stripped from stored configs. Structure-only
     * keywords (consent banners, payment providers) are kept.
     */
    private function migrate_legacy_config(string $preset, array $stored): void {
        $stored_version = (string) ($this->data['version'] ?? '1.0.0');
        if (version_compare($stored_version, self::CONFIG_VERSION, '>=')) {
            return;
        }

        $this->data['version'] = self::CONFIG_VERSION;

        if (version_compare($stored_version, '1.1.0', '<')) {
            $this->data['javascript']['execution_mode'] = $preset === 'safe' ? 'none' : 'defer';
            $this->data['dynamic']['speculation_rules_eagerness'] = 'moderate';
        }

        if (version_compare($stored_version, '1.2.0', '<')) {
            // Strip blanket keywords that must no longer gate defer mode.
            $blanket = $this->get_blanket_exclusion_keywords();
            $stored_exclusions = (array) ($this->data['javascript']['exclusions'] ?? []);
            $this->data['javascript']['exclusions'] = array_values(array_filter(
                $stored_exclusions,
                static fn(string $ex): bool => !in_array(strtolower($ex), $blanket, true)
            ));
        }

        if (version_compare($stored_version, '1.2.1', '<')) {
            // 1.2.0's exact-match strip missed path-style legacy keywords
            // (e.g. 'elementor/assets/js/frontend'), which kept builder
            // scripts excluded/synchronous while jQuery & their inline
            // configs were delayed — scrambling execution order. Remove ANY
            // exclusion containing a builder/jQuery marker.
            $this->data['javascript']['exclusions'] = array_values(array_filter(
                (array) ($this->data['javascript']['exclusions'] ?? []),
                static fn(string $ex): bool => !preg_match(
                    '/elementor|jquery|divi|bricks|wp-includes\/js/i',
                    (string) $ex
                )
            ));
        }

        if (version_compare($stored_version, '1.3.0', '<')) {
            // interaction_delay is only defensible as an explicit, top-tier
            // choice. Sites that inherited it from old defaults (or picked a
            // lower preset later) step down to order-safe defer.
            if (
                ($this->data['javascript']['execution_mode'] ?? '') === 'interaction_delay'
                && $preset !== 'ludicrous'
            ) {
                $this->data['javascript']['execution_mode'] = 'defer';
            }
        }

        if (version_compare($stored_version, '1.4.0', '<')) {
            // Test Mode is the default for NEW sites, but existing sites
            // must keep serving optimized HTML after the upgrade. Decide by
            // what the STORED config (pre-defaults-merge) contained.
            if (!isset($stored['deployment']['status'])) {
                $this->data['deployment']['status'] = 'live';
            }
            if (!isset($stored['deployment']['auto_degrade'])) {
                $this->data['deployment']['auto_degrade'] = true;
            }
        }

        if (version_compare($stored_version, '1.5.1', '<')) {
            // v1.5.0 bug: /verify treated the edge's pair-default
            // deployment ('test', no provenance marker) as authoritative
            // and flipped live sites into Test Mode on connect. Revert to
            // live; dashboard Deploy/Test commands now carry
            // source=dashboard and bypass this check.
            if (($this->data['deployment']['status'] ?? '') === 'test') {
                $this->data['deployment']['status'] = 'live';
            }
        }

        // 1.7.0 adds css.inline_all*, assets.*, htaccess.* and the 320px
        // media width — pure defaults additions handled by the merge; no
        // persisted values need rewriting.

        if (version_compare($stored_version, '1.8.0', '<')) {
            // v1.7.0 shipped a 150KB inline threshold; typical Elementor
            // sites (40+ sheets, ~500KB) fell through to Tier 2 critical
            // CSS + async deferral, where incomplete pseudo-element
            // (::before/::after overlay) extraction visibly broke styling.
            // Inline-all is safe (page-cache brotli keeps the wire small),
            // so raise the ceiling to 512KB unless the site tuned it.
            $current_threshold = (int) ($this->data['css']['inline_all_threshold'] ?? 0);
            if ($current_threshold === 153600) {
                $this->data['css']['inline_all_threshold'] = 524288;
            }
        }

        if (version_compare($stored_version, '1.10.0', '<')) {
            // PresetEngine auto-exclusions (retired in v1.10.0) persisted
            // builder/form keywords into javascript.exclusions. In
            // interaction_delay mode those keywords matched the builder's
            // script ids/srcs, leaving them synchronous against the
            // loader's jQuery stub — broken menus, sticky headers and
            // "elementorModules is not defined" chains. Strip every
            // auto-added keyword; user-managed exclusions (consent,
            // payments, cart fragments) never match these prefixes.
            $this->data['javascript']['exclusions'] = array_values(array_filter(
                (array) ($this->data['javascript']['exclusions'] ?? []),
                static fn($ex): bool => !preg_match(
                    '/^(?:elementor|elementor-|divi|et_pb_|bricks|wpcf7|contact-form-7|gravityforms|gform|wpforms)/i',
                    (string) $ex
                )
                && !in_array(strtolower((string) $ex), ['woocommerce', 'woocommerce-gateway-stripe'], true)
            ));
        }

        update_option(self::OPTION_KEY, $this->data);
    }

    /**
     * Keywords removed by the 1.2.0 migration. These matched nearly every
     * script handle/path on builder sites and made defer mode a no-op.
     */
    private function get_blanket_exclusion_keywords(): array {
        return array_map('strtolower', [
            'jquery.min.js', 'jquery.js', 'jquery-migrate', 'wp-includes/js/jquery/jquery.min.js',
            'elementor', 'elementor-frontend', 'elementor-pro',
            'elementorFrontendConfig', 'elementorProFrontendConfig',
            'woocommerce', 'divi-custom-script', 'bricks-scripts',
        ]);
    }

    public function save(array $new_data): bool {
        $preset = is_array($new_data) && !empty($new_data['preset']) ? (string) $new_data['preset'] : 'ludicrous';
        $defaults = $this->get_default_config($preset);
        $this->data = self::merge_config($defaults, $new_data);
        $this->data['version'] = self::CONFIG_VERSION;
        return update_option(self::OPTION_KEY, $this->data);
    }

    public function get(string $key, mixed $default = null): mixed {
        $segments = explode('.', $key);
        $curr = $this->data;
        foreach ($segments as $seg) {
            if (!is_array($curr) || !array_key_exists($seg, $curr)) {
                return $default;
            }
            $curr = $curr[$seg];
        }
        return $curr;
    }

    public function set(string $key, mixed $value): void {
        $segments = explode('.', $key);
        $curr = &$this->data;
        foreach ($segments as $seg) {
            if (!isset($curr[$seg]) || !is_array($curr[$seg])) {
                $curr[$seg] = [];
            }
            $curr = &$curr[$seg];
        }
        $curr = $value;
        update_option(self::OPTION_KEY, $this->data);
    }

    public function get_api_key(): string {
        return (string) get_option(self::API_KEY_OPTION, '');
    }

    public function set_api_key(string $key): bool {
        return update_option(self::API_KEY_OPTION, $key);
    }

    public function get_site_id(): string {
        return (string) get_option(self::SITE_ID_OPTION, '');
    }

    public function set_site_id(string $id): bool {
        return update_option(self::SITE_ID_OPTION, $id);
    }

    public function get_api_url(): string {
        return (string) get_option(self::API_URL_OPTION, WP_INSTANT_DEFAULT_API_BASE);
    }

    public function is_connected(): bool {
        return !empty($this->get_api_key());
    }

    /**
     * HMAC secret used to verify optimization-callback pushes from the edge.
     * Generated lazily and persisted; shared with the edge during
     * verify_connection.
     */
    public static function get_callback_secret_static(): string {
        $secret = (string) get_option(self::CALLBACK_SECRET_OPTION, '');
        if (strlen($secret) < 32) {
            $secret = wp_generate_password(64, false, false);
            update_option(self::CALLBACK_SECRET_OPTION, $secret);
        }
        return $secret;
    }

    public function get_callback_secret(): string {
        return self::get_callback_secret_static();
    }

    public function get_all(): array {
        return $this->data;
    }

    public function get_default_config(string $preset = 'ludicrous'): array {
        // Exclusions ONLY affect interaction_delay mode (scripts that must
        // run even before first interaction: consent banners, payments).
        $interaction_exclusions = [
            'wp-instant-loader',
            'wp-instant-hydrator',
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

        return [
            'version' => self::CONFIG_VERSION,
            'preset' => $preset,
            'caching' => [
                'enabled' => true,
                'ttl' => 604800,
                'mobile_cache' => true,
                'purge_on_post_update' => true,
                'purge_on_comment' => false,
                // Keep in sync with advanced-cache.php $wp_instant_ignored_params
                'strip_query_params' => ['utm_*', 'fbclid', 'gclid', '_ga', '_gl', 'mc_cid', 'mc_eid', 'msclkid', 'adgroupid', 'campaignid', 'vgo_ee'],
                'excluded_urls' => ['/wp-admin/*', '/wp-login.php', '/cart/*', '/checkout/*', '/my-account/*'],
                'excluded_cookies' => ['wordpress_logged_in_*', 'wp-postpass_*', 'comment_author_*', 'wp_woocommerce_session_*', 'woocommerce_items_in_cart', 'woocommerce_cart_hash', 'woocommerce_recently_viewed'],
                // When non-empty, ONLY these paths are optimized/cached
                // (inverse of excluded_urls — "Optimize-only URLs").
                'optimize_only_urls' => []
            ],
            'critical_css' => [
                'enabled' => $preset !== 'safe',
                'inline' => true,
                'async_load_full' => true,
                'font_display_swap' => true,
                'viewports' => ['mobile', 'desktop'],
                'excluded_stylesheets' => []
            ],
            'css' => [
                // Combine + minify render-blocking stylesheets into one
                // disk-cached bundle. Tier 1: when the whole site CSS fits
                // under inline_all_threshold it is inlined into the HTML —
                // zero render-blocking requests, zero FOUC by construction.
                // Tier 2 (large sites): single async bundle behind verified
                // critical CSS.
                'combine' => $preset !== 'safe',
                'minify' => true,
                'max_files' => 40,
                'inline_all' => $preset !== 'safe',
                'inline_all_threshold' => 524288 // 512KB raw (~60-80KB brotli on the wire)
            ],
            'assets' => [
                // Generic 3rd-party asset proxy: foreign css/js (unpkg,
                // code.jquery.com, arbitrary CDNs) served through the signed
                // R2 worker route — case-by-case, no vendored files in the
                // plugin. Consent/payment origins are always kept original.
                'proxy_enabled' => $preset !== 'safe',
                'keep_origins' => []
            ],
            'htaccess' => [
                // Long-cache immutable optimized assets + precompressed
                // .br/.gz serving + brotli output filters (Apache/LiteSpeed
                // only, auto-loopback-verified with restore-on-failure).
                'enabled' => true,
                'brotli_filters' => true
            ],
            'javascript' => [
                // Risk ladder: safe = no JS changes, aggressive = defer
                // (order-safe, spec-guaranteed), ludicrous = defer everything
                // until first interaction + safety timer. Exclusions only
                // affect interaction_delay (see list above).
                'execution_mode' => $preset === 'safe' ? 'none' : ($preset === 'ludicrous' ? 'interaction_delay' : 'defer'),
                'delay_timeout_ms' => 3500,
                'preserve_execution_order' => true,
                'exclusions' => $interaction_exclusions,
                'remove_jquery_migrate' => false,
                'worker_offload' => ['googletagmanager.com', 'connect.facebook.net']
            ],
            'fonts' => [
                // Localize Google Fonts (woff2 + css served same-origin,
                // font-display:swap, brotli twins). 3rd-party vendor CSS
                // is handled generically by the AssetProxy stage.
                'localize_google' => $preset !== 'safe',
                'preload_lcp_font' => true
            ],
            'media' => [
                'auto_fetchpriority_lcp' => true,
                'preload_lcp_image' => true,
                'inject_missing_dimensions' => true,
                'serve_nextgen_formats' => $preset !== 'safe',
                'lazyload_images' => true,
                'lazyload_iframes' => true,
                'lazyload_offset_px' => 300,
                'excluded_images' => [],
                // Zero-DNS R2 media CDN (worker 302-fallback makes rewrites
                // always safe; derivatives generated eagerly + at the edge).
                'offload_images' => false,
                'offload_video' => false,
                'offload_widths' => [320, 480, 768, 1200, 1600],
                // Derivative quality (Lossy ≈82; 100 ≈ Lossless).
                'image_quality' => 82,
                // Lazy CSS background images, YouTube facades, self-hosted
                // video preload=none.
                'lazyload_backgrounds' => true,
                'video_facades' => true,
                'video_lazyload_selfhosted' => true
            ],
            'html' => [
                // "Minify Resources": safe whitespace minification, JSON-LD
                // compaction, comment control, normalization.
                'minify' => $preset !== 'safe',
                'minify_jsonld' => true,
                'remove_html_comments' => false,
                'normalize' => true
            ],
            // Site-owner custom CSS, injected last in <head>.
            'custom_css' => '',
            'hints' => [
                // Auto preconnect/dns-prefetch for detected 3rd-party origins.
                'resource_hints' => true
            ],
            'plugins' => [
                // Per-post-type plugin asset control: on pages of a given
                // post type, every <script src> / <link href> coming from
                // /plugins/{slug}/ is stripped entirely. '*' applies to all
                // pages. Big-plugin-on-small-page wins without disabling
                // the plugin site-wide.
                'unload_rules' => []
            ],
            'deployment' => [
                // Test Mode: fresh installs serve visitors UNOPTIMIZED while
                // admins verify the optimized page via ?wpins_preview=1, then
                // hit Deploy. Existing sites are migrated to 'live'.
                'status' => 'test',
                // Safety net: automatically step down interaction_delay →
                // defer → none when live RUM error rates spike.
                'auto_degrade' => true
            ],
            'dynamic' => [
                'speculation_rules_prerender' => true,
                // 'moderate' hovers the link before prerendering — 'eager' wastes
                // bandwidth prerendering every link on the page.
                'speculation_rules_eagerness' => 'moderate',
                'nonce_ajax_refresh' => true,
                'cart_micro_hydration' => true,
                'excluded_prerender_paths' => ['/wp-admin/**', '/cart/**', '/checkout/**', '/my-account/**']
            ]
        ];
    }
}
