<?php
namespace Turbopress;

if (!defined('ABSPATH')) {
    exit;
}

class Plugin {
    private static ?Plugin $instance = null;
    public Config $config;
    public ApiClient $api_client;
    public CacheManager $cache_manager;
    public CachePurger $cache_purger;
    public DomEngine $dom_engine;
    public NonceRefresher $nonce_refresher;
    public CartFragment $cart_fragment;
    public PresetEngine $preset_engine;

    public static function get_instance(): Plugin {
        if (self::$instance === null) {
            self::$instance = new self();
        }
        return self::$instance;
    }

    private function __construct() {
        $this->config = new Config();
        $this->api_client = new ApiClient($this->config);
        $this->cache_manager = new CacheManager($this->config);
        $this->cache_purger = new CachePurger($this->cache_manager);
        $this->dom_engine = new DomEngine($this->config, $this->api_client);
        $this->nonce_refresher = new NonceRefresher();
        $this->cart_fragment = new CartFragment($this->config);
        $this->preset_engine = new PresetEngine($this->config);
    }

    public function init(): void {
        // Initialize Cache Purger hooks
        $this->cache_purger->init();

        // Initialize Dynamic Nonce & Cart Micro-Hydration
        $this->nonce_refresher->init();
        $this->cart_fragment->init();

        // Check Theme & Plugin Compatibility presets
        $this->preset_engine->apply_auto_presets();

        // Handle 1-Click Handshake Return
        Handshake::handle_return();

        // Initialize Admin UI
        if (is_admin()) {
            \Turbopress\AdminPage::get_instance()->init($this->config, $this->api_client, $this->cache_manager);
        }

        // Initialize Frontend Output Buffering for Cache & DOM Transformation
        if (!is_admin() && !wp_doing_ajax() && !wp_doing_cron()) {
            add_action('template_redirect', [$this, 'start_output_buffer'], -999999);
        }
    }

    public function start_output_buffer(): void {
        if (!CacheRules::should_cache_request($this->config)) {
            return;
        }

        ob_start([$this, 'process_output_buffer']);
    }

    public function process_output_buffer(string $buffer): string {
        // If response is empty or not HTML, return untouched
        if (empty($buffer) || stripos($buffer, '<html') === false) {
            return $buffer;
        }

        // Transform DOM (Inject Critical CSS, Delay Scripts, Preload LCP, Inject Nonce Markers)
        $transformed = $this->dom_engine->transform($buffer);

        // Save to static disk cache if caching is active
        if ($this->config->get('caching.enabled', true)) {
            $this->cache_manager->write_cache($transformed);
        }

        return $transformed;
    }

    public static function activate(): void {
        // Create cache folder
        if (!file_exists(TURBOPRESS_CACHE_DIR)) {
            wp_mkdir_p(TURBOPRESS_CACHE_DIR);
        }

        // Install advanced-cache.php drop-in
        $dropin_source = TURBOPRESS_PATH . 'advanced-cache.php';
        $dropin_dest = WP_CONTENT_DIR . '/advanced-cache.php';

        if (file_exists($dropin_source)) {
            @copy($dropin_source, $dropin_dest);
        }

        // Add WP_CACHE define in wp-config.php if missing
        self::ensure_wp_cache_constant();
    }

    public static function deactivate(): void {
        // Remove advanced-cache.php drop-in
        $dropin_dest = WP_CONTENT_DIR . '/advanced-cache.php';
        if (file_exists($dropin_dest)) {
            @unlink($dropin_dest);
        }

        // Clear all cached files
        CacheManager::purge_all_static();
    }

    private static function ensure_wp_cache_constant(): void {
        $wp_config = ABSPATH . 'wp-config.php';
        if (!file_exists($wp_config) || !is_writable($wp_config)) {
            return;
        }

        $content = file_get_contents($wp_config);
        if ($content && strpos($content, 'WP_CACHE') === false) {
            $content = preg_replace("/(<\?php)/i", "$1\ndefine('WP_CACHE', true); // Turbopress Drop-in", $content, 1);
            @file_put_contents($wp_config, $content);
        }
    }
}
