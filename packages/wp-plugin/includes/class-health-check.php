<?php
namespace Turbopress;

if (!defined('ABSPATH')) {
    exit;
}

/**
 * 12-point self-diagnostic. Results are stored in the 'turbopress_health'
 * option (drives the admin checklist UI), and pushed daily to the SaaS
 * control plane via the heartbeat route so fleet health is visible remotely.
 */
class HealthCheck {
    private const OPTION_KEY = 'turbopress_health';
    private const THROTTLE = 900; // 15 minutes

    private Config $config;
    private ApiClient $api_client;

    public function __construct(Config $config, ApiClient $api_client) {
        $this->config = $config;
        $this->api_client = $api_client;
    }

    /** Lazy run on admin page views, throttled. */
    public function maybe_run(): void {
        $stored = get_option(self::OPTION_KEY, []);
        $last = is_array($stored) ? (int) ($stored['checked_at'] ?? 0) : 0;
        if ((time() - $last) < self::THROTTLE) {
            return;
        }
        $this->run();
    }

    public function run(): array {
        $host = strtolower((string) parse_url(home_url(), PHP_URL_HOST));
        $css_glob = TURBOPRESS_CACHE_DIR . '/' . md5($host) . '/css/*.css';
        $css_files = glob($css_glob) ?: [];

        $foreign = CacheIntegration::detect_foreign_dropin();

        // Loopback self-test: does our own cache serve a HIT? Cached for the
        // report's lifetime to avoid a request storm on every admin view.
        $loopback = get_transient('turbopress_health_loopback');
        if ($loopback === false) {
            $loopback = $this->probe_loopback();
            set_transient('turbopress_health_loopback', $loopback, self::THROTTLE);
        }

        // Edge reachability (cached — a slow/failed probe shouldn't stall admin).
        $edge = get_transient('turbopress_health_edge');
        if ($edge === false) {
            $edge = $this->config->is_connected() ? $this->probe_edge() : null;
            if ($edge !== null) {
                set_transient('turbopress_health_edge', $edge, self::THROTTLE);
            }
        }

        $checks = [
            [
                'key' => 'dropin_installed',
                'label' => 'Turbopress drop-in installed',
                'status' => CacheIntegration::is_our_dropin_installed() ? 'ok' : 'warning',
                'detail' => CacheIntegration::is_our_dropin_installed()
                    ? 'advanced-cache.php is ours'
                    : 'advanced-cache.php is not installed',
            ],
            [
                'key' => 'wp_cache_constant',
                'label' => 'WP_CACHE constant enabled',
                'status' => (defined('WP_CACHE') && WP_CACHE) ? 'ok' : 'warning',
                'detail' => (defined('WP_CACHE') && WP_CACHE) ? 'true' : 'not defined/false',
            ],
            [
                'key' => 'foreign_cache_conflict',
                'label' => 'Page-cache conflict',
                'status' => $foreign === null ? 'ok' : 'warning',
                'detail' => $foreign === null
                    ? 'No foreign advanced-cache.php'
                    : $foreign['label'] . ' owns the drop-in; Turbopress page cache paused (DOM optimizations active)',
            ],
            [
                'key' => 'loopback_cache_hit',
                'label' => 'Page cache serving (loopback test)',
                'status' => $loopback ? 'ok' : 'warning',
                'detail' => $loopback ? 'X-Turbopress-Cache: HIT observed' : 'No cache HIT on loopback request',
            ],
            [
                'key' => 'cache_dir_writable',
                'label' => 'Cache directory writable',
                'status' => wp_is_writable(TURBOPRESS_PAGES_DIR) ? 'ok' : 'error',
                'detail' => TURBOPRESS_PAGES_DIR,
            ],
            [
                'key' => 'compression_available',
                'label' => 'Pre-compression available',
                'status' => function_exists('gzencode') ? 'ok' : 'warning',
                'detail' => function_exists('gzencode')
                    ? (function_exists('brotli_compress') ? 'gzip + brotli' : 'gzip only')
                    : 'none',
            ],
            [
                'key' => 'wp_cron_enabled',
                'label' => 'WP-Cron enabled',
                'status' => !defined('DISABLE_WP_CRON') || !DISABLE_WP_CRON ? 'ok' : 'warning',
                'detail' => defined('DISABLE_WP_CRON') && DISABLE_WP_CRON
                    ? 'DISABLE_WP_CRON is set — edge dispatch relies on push callbacks only'
                    : 'Default scheduler active',
            ],
            [
                'key' => 'edge_api_reachable',
                'label' => 'Edge API reachable',
                'status' => $edge === null ? 'warning' : ($edge ? 'ok' : 'error'),
                'detail' => $edge === null ? 'Not connected' : ($edge ? 'verify ok' : 'verify failed'),
            ],
            [
                'key' => 'critical_css_generated',
                'label' => 'Critical CSS generated',
                'status' => !empty($css_files) ? 'ok' : 'warning',
                'detail' => count($css_files) . ' file(s) cached',
            ],
            [
                'key' => 'callback_secret_configured',
                'label' => 'Callback secret configured',
                'status' => strlen(Config::get_callback_secret_static()) >= 32 ? 'ok' : 'error',
                'detail' => 'HMAC push verification',
            ],
            [
                'key' => 'plugin_version_current',
                'label' => 'Plugin version current',
                'status' => get_option('turbopress_version') === TURBOPRESS_VERSION ? 'ok' : 'warning',
                'detail' => TURBOPRESS_VERSION,
            ],
            [
                'key' => 'output_buffering_active',
                'label' => 'DOM engine active',
                'status' => (bool) $this->config->get('caching.enabled', true) || (bool) $this->config->get('critical_css.enabled', true) ? 'ok' : 'warning',
                'detail' => 'Critical CSS / deferral pipeline',
            ],
        ];

        $report = [
            'checked_at' => time(),
            'checks' => $checks,
        ];
        update_option(self::OPTION_KEY, $report);

        return $report;
    }

    private function probe_loopback(): bool {
        $response = wp_remote_get(home_url('/'), [
            'timeout' => 10,
            'headers' => ['Cache-Control' => 'no-cache'],
        ]);
        if (is_wp_error($response)) {
            return false;
        }
        // HIT = our drop-in served the page. On LiteSpeed-conflicted hosts this
        // stays false until the conflict is resolved — exactly what we report.
        $header = (string) wp_remote_retrieve_header($response, 'x-turbopress-cache');
        return stripos($header, 'HIT') !== false;
    }

    private function probe_edge(): bool {
        $result = $this->api_client->verify_connection();
        return !is_wp_error($result) && !empty($result['success']);
    }

    /**
     * Push the latest report to the SaaS control plane (daily cron).
     */
    public function push_to_edge(): void {
        if (!$this->config->is_connected()) {
            return;
        }

        $report = get_option(self::OPTION_KEY, []);
        if (!is_array($report) || empty($report['checked_at'])) {
            return;
        }

        $this->api_client->send_heartbeat($report);
    }

    public static function get_latest(): array {
        $report = get_option(self::OPTION_KEY, []);
        return is_array($report) ? $report : [];
    }
}
