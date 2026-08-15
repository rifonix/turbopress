<?php
namespace Turbopress;

if (!defined('ABSPATH')) {
    exit;
}

class Config {
    public const OPTION_KEY = 'turbopress_config';
    public const API_KEY_OPTION = 'turbopress_api_key';
    public const SITE_ID_OPTION = 'turbopress_site_id';
    public const API_URL_OPTION = 'turbopress_api_url';
    public const CALLBACK_SECRET_OPTION = 'turbopress_callback_secret';

    /**
     * Structural config version. Bumped when defaults change in a way that
     * must override values persisted by older plugin releases.
     */
    public const CONFIG_VERSION = '1.3.0';

    private array $data = [];

    public function __construct() {
        $this->load();
    }

    public function load(): void {
        $stored = get_option(self::OPTION_KEY, []);
        $preset = is_array($stored) && !empty($stored['preset']) ? (string) $stored['preset'] : 'ludicrous';
        $defaults = $this->get_default_config($preset);
        $this->data = is_array($stored) ? array_replace_recursive($defaults, $stored) : $defaults;
        $this->migrate_legacy_config($preset);
    }

    /**
     * v1.2.0 migration: earlier releases shipped blanket script exclusions
     * ('elementor', 'jquery.js', …) that were also applied in plain defer
     * mode — which effectively disabled script deferral on every Elementor
     * site. Exclusions now only apply to interaction_delay mode, so legacy
     * blanket keywords are stripped from stored configs. Structure-only
     * keywords (consent banners, payment providers) are kept.
     */
    private function migrate_legacy_config(string $preset): void {
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
        $this->data = array_replace_recursive($defaults, $new_data);
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
        return (string) get_option(self::API_URL_OPTION, TURBOPRESS_DEFAULT_API_BASE);
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

        return [
            'version' => self::CONFIG_VERSION,
            'preset' => $preset,
            'caching' => [
                'enabled' => true,
                'ttl' => 604800,
                'mobile_cache' => true,
                'purge_on_post_update' => true,
                'purge_on_comment' => false,
                'strip_query_params' => ['utm_*', 'fbclid', 'gclid', '_ga', '_gl', 'mc_cid', 'msclkid'],
                'excluded_urls' => ['/wp-admin/*', '/wp-login.php', '/cart/*', '/checkout/*', '/my-account/*'],
                'excluded_cookies' => ['wordpress_logged_in_*', 'wp-postpass_*', 'comment_author_*']
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
                // disk-cached bundle with a single async loader. Requires
                // critical CSS (avoids FOUC).
                'combine' => $preset !== 'safe',
                'minify' => true,
                'max_files' => 40
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
                // font-display:swap) and pin 3rd-party vendor CSS bundles.
                'localize_google' => $preset !== 'safe',
                'bundle_vendor_css' => true,
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
                'excluded_images' => []
            ],
            'hints' => [
                // Auto preconnect/dns-prefetch for detected 3rd-party origins.
                'resource_hints' => true
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
