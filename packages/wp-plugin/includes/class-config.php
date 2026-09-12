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
    public const CDN_URL_OPTION = 'wp_instant_cdn_url';
    public const OBJECT_URL_OPTION = 'wp_instant_object_url';
    public const PUBLIC_MEDIA_MANIFEST_OPTION = 'wp_instant_public_media_manifest';
    public const CALLBACK_SECRET_OPTION = 'wp_instant_callback_secret';

    /**
     * Structural config version. Bumped when defaults change in a way that
     * must override values persisted by older plugin releases.
     */
    public const CONFIG_VERSION = '1.13.0';

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

        if (version_compare($stored_version, '1.11.0', '<')) {
            // v1.13.0: builder sites with >512KB CSS fell through Tier 1
            // inline-all onto the Tier 2 critical-CSS path, where any
            // extraction gap shows up as missing gradients/overlays.
            // Inline-all is safe by construction (page-cache brotli keeps
            // the wire small), so raise the ceiling to 768KB unless the
            // site explicitly tuned it away from the old default.
            $current_threshold = (int) ($this->data['css']['inline_all_threshold'] ?? 0);
            if ($current_threshold === 524288) {
                $this->data['css']['inline_all_threshold'] = 786432;
            }
        }

        if (version_compare($stored_version, '1.12.0', '<')) {
            // v1.16.0 full CDN coverage: connected sites get videos and
            // own-host css/js served from the edge too. Set unconditionally
            // (not only when the key is absent): save() persists the full
            // defaults, so default-false and explicitly-chosen-false are
            // indistinguishable in stored data — keying on existence would
            // make this migration a no-op for every real site. Re-disabling
            // a flag after the upgrade is a one-toggle operation in the
            // dashboard. Sites not yet connected keep the flags untouched
            // (rewrites require site_id + secret anyway).
            if ($this->get_site_id() !== '' && $this->get_api_key() !== '') {
                $this->data['media']['offload_images'] = true;
                $this->data['media']['offload_video'] = true;
                $this->data['assets']['serve_own_from_cdn'] = true;
            }
        }

        if (version_compare($stored_version, '1.13.0', '<')) {
            // v1.13.0 retires the generic third-party asset proxy:
            // foreign css/js is never rewritten to the signed edge route.
            // Drop the retired keys so stored configs cannot re-enable it.
            if (isset($this->data['assets']) && is_array($this->data['assets'])) {
                unset($this->data['assets']['proxy_enabled'], $this->data['assets']['keep_origins']);
            }
        }

        update_option(self::OPTION_KEY, $this->data);
        $this->write_rules_manifest();
    }

    /**
     * Write the drop-in rules manifest. advanced-cache.php executes before
     * WordPress loads and cannot read options — it reads this JSON instead,
     * so drop-in and plugin cache keys/TTL/exclusions can never drift.
     */
    private function write_rules_manifest(): void {
        if (!defined('WP_INSTANT_CACHE_DIR')) {
            return;
        }
        $caching = $this->data['caching'] ?? [];
        $rules = [
            'enabled' => (bool) ($caching['enabled'] ?? true),
            'deployment_status' => (string) ($this->data['deployment']['status'] ?? 'live'),
            'ttl' => (int) ($caching['ttl'] ?? 604800),
            'mobile_cache' => (bool) ($caching['mobile_cache'] ?? true),
            'strip_query_params' => array_values((array) ($caching['strip_query_params'] ?? [])),
            'excluded_cookies' => array_values((array) ($caching['excluded_cookies'] ?? [])),
            'optimize_only_urls' => array_values((array) ($caching['optimize_only_urls'] ?? [])),
            'excluded_urls' => array_values((array) ($caching['excluded_urls'] ?? [])),
        ];
        if (!file_exists(WP_INSTANT_CACHE_DIR)) {
            wp_mkdir_p(WP_INSTANT_CACHE_DIR);
        }
        @file_put_contents(WP_INSTANT_CACHE_DIR . '/rules.json', json_encode($rules), LOCK_EX);
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
        $result = update_option(self::OPTION_KEY, $this->data);
        $this->write_rules_manifest();
        return $result;
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
        $this->write_rules_manifest();
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

    /**
     * CDN base for visitor-facing asset URLs (media derivatives, proxied
     * CSS/JS). Falls back to the API base when unset so older edge
     * deployments without a CDN hostname keep working.
     */
    public function get_cdn_url(): string {
        $cdn = (string) get_option(self::CDN_URL_OPTION, '');
        if ($cdn !== '') {
            return $cdn;
        }
        return defined('WP_INSTANT_DEFAULT_CDN_BASE') ? WP_INSTANT_DEFAULT_CDN_BASE : $this->get_api_url();
    }

    /**
     * Direct R2 custom domain for public media derivatives only. The plugin
     * uses a local manifest to avoid emitting this URL before the object has
     * been stored, so a first-ever derivative still uses the Worker fallback.
     */
    public function get_object_url(): string {
        $object_url = (string) get_option(self::OBJECT_URL_OPTION, '');
        if ($object_url !== '') {
            return $object_url;
        }
        return defined('WP_INSTANT_DEFAULT_OBJECT_BASE') ? WP_INSTANT_DEFAULT_OBJECT_BASE : $this->get_cdn_url();
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
                // Re-render purged URLs in the background (CacheWarmer) so
                // visitors never pay the purge -> cold-PHP cost.
                'warm_after_purge' => true,                // Keep in sync with advanced-cache.php $wp_instant_ignored_params
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
                'inline_all_threshold' => 786432 // 768KB raw (~90-120KB brotli on the wire)
            ],
            'assets' => [
                // Own-host css/js (theme bundles, the combined stylesheet,
                // localized font CSS, wp-includes scripts) served from the
                // CDN worker. OPT-IN: a warm CDN HIT changes the resource
                // base URL, which breaks relative CSS url()/@import and
                // module imports (no rebasing yet), so this ships disabled.
                //
                // Third-party origins are never rewritten. The former generic
                // proxy (proxy_enabled / keep_origins, retired in v1.13.0)
                // is stripped from stored configs below.
                'serve_own_from_cdn' => false
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
                // Blur-up placeholders: 24px CDN derivative shown instantly,
                // real image swapped in after decode (needs offload_images).
                'lazyload_lqip' => true,
                'excluded_images' => [],
                // Zero-DNS R2 media CDN (the worker serves a cold MISS
                // straight from origin — no redirect — then fills R2 in the
                // background; derivatives generated eagerly + at the edge).
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
                // Live by default: connecting a site must improve real
                // visitor and crawler performance immediately. Admins can
                // still flip to Test Mode from the dashboard to verify via
                // ?wpins_preview=1 before exposing optimizations.
                'status' => 'live',
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
