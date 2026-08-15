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

    private array $data = [];

    public function __construct() {
        $this->load();
    }

    public function load(): void {
        $stored = get_option(self::OPTION_KEY, []);
        $defaults = $this->get_default_config('ludicrous');
        $this->data = is_array($stored) ? array_replace_recursive($defaults, $stored) : $defaults;
    }

    public function save(array $new_data): bool {
        $defaults = $this->get_default_config('ludicrous');
        $this->data = array_replace_recursive($defaults, $new_data);
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

    public function get_all(): array {
        return $this->data;
    }

    public function get_default_config(string $preset = 'ludicrous'): array {
        $safe_exclusions = [
            'turbopress-loader',
            'turbopress-hydrator',
            'jquery.min.js',
            'jquery.js',
            'wp-includes/js/jquery/jquery.min.js',
            'elementor-frontend',
            'cookiebot',
            'complianz',
            'onetrust',
            'woocommerce-cart',
            'wc-cart-fragments',
            'stripe',
            'recaptcha',
            'turnstile'
        ];

        return [
            'version' => '1.0.0',
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
            'javascript' => [
                // Safe default: defer everything non-blocking. 'interaction_delay'
                // is available as an opt-in for maximum scores on simple sites.
                'execution_mode' => $preset === 'safe' ? 'none' : 'defer',
                'delay_timeout_ms' => 3500,
                'preserve_execution_order' => true,
                'exclusions' => $safe_exclusions,
                'worker_offload' => ['googletagmanager.com', 'connect.facebook.net']
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
