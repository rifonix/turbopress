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
    public CacheIntegration $cache_integration;
    public HealthCheck $health_check;

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
        $this->cache_integration = new CacheIntegration();
        $this->health_check = new HealthCheck($this->config, $this->api_client);
    }

    public function init(): void {
        // Upgrade housekeeping: when the plugin version changes, purge the
        // static page cache so HTML transformed by an older release (e.g.
        // with the broken script-delaying logic) is never served stale.
        $installed_version = get_option('turbopress_version', '');
        if ($installed_version !== TURBOPRESS_VERSION) {
            update_option('turbopress_version', TURBOPRESS_VERSION);
            CacheManager::purge_all_static();
            // Propagate to host/foreign caches (LiteSpeed etc.): without this,
            // HTML transformed by the OLD release stays served indefinitely.
            CacheIntegration::purge_foreign_caches('all');
            // Re-assert our drop-in on upgrades (source file may have changed).
            CacheIntegration::install_dropin();
        }

        // Initialize Cache Purger hooks
        $this->cache_purger->init();

        // Drop-in conflict detection + foreign purge mirroring
        $this->cache_integration->init();

        // Async optimization pipeline: dispatch to edge, poll, download critical CSS
        add_action('turbopress_async_optimize', [$this, 'run_async_optimize'], 10, 1);

        // Daily health heartbeat to the SaaS control plane
        add_action('turbopress_health_heartbeat', [$this, 'run_health_heartbeat']);
        if (!wp_next_scheduled('turbopress_health_heartbeat')) {
            wp_schedule_event(time() + HOUR_IN_SECONDS, 'daily', 'turbopress_health_heartbeat');
        }

        // Edge push callback (HMAC-verified REST route)
        OptimizeCallback::register_routes();

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
            $this->health_check->maybe_run();
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
        // Airlift-style response gate: only ever transform successful,
        // non-trivial HTML documents. Error pages/redirects/fragments pass
        // through untouched.
        if (
            strlen($buffer) <= 255 ||
            http_response_code() !== 200 ||
            stripos($buffer, '<html') === false
        ) {
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
                // Push-mode parity: record the edge-verified LCP image so the
                // MediaOptimizer can preload CSS-background LCP candidates.
                $lcp_url = $status['data']['lcpImageUrl'] ?? null;
                if (!empty($lcp_url)) {
                    MediaOptimizer::store_lcp_image($url, $job['viewport'], (string) $lcp_url);
                }

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
            CacheIntegration::purge_foreign_caches('url', $url);
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

    /** Cron: run the health check and push results to the SaaS dashboard. */
    public function run_health_heartbeat(): void {
        $this->health_check->run();
        $this->health_check->push_to_edge();
    }

    public static function activate(): void {
        // Create cache folders (pages separated from artifacts)
        foreach ([TURBOPRESS_CACHE_DIR, TURBOPRESS_PAGES_DIR] as $dir) {
            if (!file_exists($dir)) {
                wp_mkdir_p($dir);
            }
        }

        // Install advanced-cache.php drop-in — only when the slot is free
        // (never clobber LiteSpeed / WP Rocket / host-level drop-ins).
        CacheIntegration::install_dropin();

        // Stale host-cache entries from before activation must not survive.
        CacheIntegration::purge_foreign_caches('all');
    }

    public static function deactivate(): void {
        // Remove OUR drop-in only; a foreign one is left untouched.
        CacheIntegration::remove_dropin();

        // Clear all cached pages
        CacheManager::purge_all_static();

        // Host caches may still hold OUR transformed HTML (localized font
        // links, combined bundles) — force a fresh unoptimized render.
        CacheIntegration::purge_foreign_caches('all');

        // Unschedule heartbeat
        $timestamp = wp_next_scheduled('turbopress_health_heartbeat');
        if ($timestamp) {
            wp_unschedule_event($timestamp, 'turbopress_health_heartbeat');
        }
    }
}
