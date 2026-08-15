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

        // Async optimization pipeline: dispatch to edge, poll, download critical CSS
        add_action('turbopress_async_optimize', [$this, 'run_async_optimize'], 10, 1);

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

    /**
     * Cron handler for 'turbopress_async_optimize'.
     * Lifecycle: dispatch job(s) -> poll every 60s -> download CSS per viewport
     * -> write local cache -> purge page cache. Reschedules itself until done.
     */
    public function run_async_optimize(array $args = []): void {
        $url = $args['url'] ?? '';
        $attempt = (int) ($args['attempt'] ?? 0);

        if (empty($url) || !$this->config->is_connected()) {
            return;
        }

        $transient_key = 'tp_jobs_' . md5($url);
        $jobs = get_transient($transient_key);

        // Phase 1: dispatch the extraction job(s).
        if (empty($jobs)) {
            $dispatch = $this->api_client->dispatch_optimization($url);
            $created = $dispatch['data']['jobs'] ?? null;

            if (empty($created)) {
                // Let the 10-minute throttle transient retry later.
                return;
            }

            $jobs = array_map(static fn(array $j): array => ['id' => $j['jobId'], 'viewport' => $j['viewport']], $created);
            set_transient($transient_key, $jobs, 30 * MINUTE_IN_SECONDS);
            wp_schedule_single_event(time() + 60, 'turbopress_async_optimize', ['url' => $url, 'attempt' => 1]);
            return;
        }

        // Phase 2: poll each job; download CSS as jobs complete.
        foreach ($jobs as $i => $job) {
            $status = $this->api_client->get_job_status($job['id']);
            $state = $status['data']['status'] ?? null;

            if ($state === 'completed') {
                $css = $this->api_client->download_critical_css($url, $job['viewport']);
                if (!empty($css)) {
                    CriticalCssTransformer::write_cache_for_url($url, $job['viewport'], $css);
                }
                unset($jobs[$i]);
            } elseif ($state === 'failed') {
                unset($jobs[$i]);
            }
        }

        if (empty($jobs)) {
            delete_transient($transient_key);
            // Fresh HTML with inlined critical CSS on next request.
            CacheManager::purge_url($url);
            return;
        }

        set_transient($transient_key, array_values($jobs), 30 * MINUTE_IN_SECONDS);

        // Keep polling (cap ~30 attempts / 30 min).
        if ($attempt < 30) {
            wp_schedule_single_event(time() + 60, 'turbopress_async_optimize', ['url' => $url, 'attempt' => $attempt + 1]);
        } else {
            delete_transient($transient_key);
        }
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
