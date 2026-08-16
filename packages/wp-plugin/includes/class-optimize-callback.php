<?php
namespace Turbopress;

if (!defined('ABSPATH')) {
    exit;
}

/**
 * HMAC-verified push endpoint for the edge pipeline.
 *
 * Replaces cron polling as the primary critical-CSS delivery path: when a
 * Puppeteer job completes, the edge POSTs the CSS + measured LCP image here
 * instantly. The signature (X-Turbopress-Signature: hex HMAC-SHA256 of the
 * raw body, keyed by the per-site callback secret shared during
 * verify_connection) makes the public endpoint unforgeable.
 */
class OptimizeCallback {
    public static function register_routes(): void {
        add_action('rest_api_init', static function (): void {
            register_rest_route('turbopress/v1', '/optimize-callback', [
                'methods' => 'POST',
                'callback' => [self::class, 'handle_callback'],
                'permission_callback' => '__return_true', // HMAC is the auth
                'args' => [],
            ]);
        });
    }

    public static function handle_callback(\WP_REST_Request $request) {
        $raw_body = (string) $request->get_body();
        if ($raw_body === '') {
            return new \WP_Error('turbopress_empty_body', 'Empty body', ['status' => 400]);
        }

        // Signature check: constant-time compare against HMAC of raw body.
        $signature = (string) $request->get_header('X-Turbopress-Signature');
        $secret = Config::get_callback_secret_static();
        $expected = hash_hmac('sha256', $raw_body, $secret);

        if ($signature === '' || !hash_equals($expected, strtolower($signature))) {
            return new \WP_Error('turbopress_invalid_signature', 'Invalid signature', ['status' => 403]);
        }

        $payload = json_decode($raw_body, true);
        if (!is_array($payload)) {
            return new \WP_Error('turbopress_invalid_json', 'Invalid JSON', ['status' => 400]);
        }

        // Command channel: dashboard Deploy/Test pushes ride the same
        // HMAC-verified pipe. Signed with the site secret, so this is the
        // explicit-command path for apply_remote_deployment.
        if (($payload['command'] ?? '') === 'deploy') {
            $status = (string) ($payload['deployment']['status'] ?? '');
            if (!in_array($status, ['test', 'live'], true)) {
                return new \WP_Error('turbopress_invalid_deploy', 'Invalid deployment status', ['status' => 400]);
            }
            $config = new Config();
            ApiClient::apply_remote_deployment(
                $config,
                ['deployment' => $payload['deployment']],
                true // signed dashboard command — explicit
            );
            return ['success' => true, 'command' => 'deploy', 'status' => $status];
        }

        // Config push from the dashboard (embed or web app): merge the
        // validated SiteConfig over the stored one so a dashboard save
        // reaches the plugin instantly (verify/heartbeat remain the
        // convergence fallbacks).
        if (($payload['command'] ?? '') === 'config') {
            $incoming = $payload['config'] ?? null;
            if (!is_array($incoming)) {
                return new \WP_Error('turbopress_invalid_config', 'Missing config payload', ['status' => 400]);
            }
            $config = new Config();
            $current = $config->get_all();
            if (!is_array($current)) {
                $current = [];
            }

            // R2 offload activation must start working instantly — not at
            // the next hourly cron tick. Detect any offload flag flipping
            // on (or widths changing while enabled) and kick the worker
            // due-now.
            $was_offloading = !empty($current['media']['offload_images']) || !empty($current['media']['offload_video']);
            $now_offloading = !empty($incoming['media']['offload_images']) || !empty($incoming['media']['offload_video']);
            $widths_changed = ($current['media']['offload_widths'] ?? null) !== ($incoming['media']['offload_widths'] ?? null)
                && $now_offloading;

            // Recursive merge keeps keys the dashboard payload omits;
            // save() re-applies defaults + bumps the version.
            $config->save(array_replace_recursive($current, $incoming));

            CacheManager::purge_all_static();
            CacheIntegration::purge_foreign_caches('all');

            if (($now_offloading && !$was_offloading) || $widths_changed) {
                wp_schedule_single_event(time(), 'turbopress_media_offload', []);
                spawn_cron();
            }

            return ['success' => true, 'command' => 'config', 'offload_kicked' => $now_offloading && (!$was_offloading || $widths_changed)];
        }

        // Purge push from the dashboard.
        if (($payload['command'] ?? '') === 'purge') {
            CacheManager::purge_all_static();
            CacheIntegration::purge_foreign_caches('all');
            return ['success' => true, 'command' => 'purge'];
        }

        $url = isset($payload['url']) ? esc_url_raw((string) $payload['url']) : '';
        $viewport = isset($payload['viewport']) ? (string) $payload['viewport'] : '';
        $css = isset($payload['css']) ? (string) $payload['css'] : '';
        $lcp_image_url = isset($payload['lcpImageUrl']) ? esc_url_raw((string) $payload['lcpImageUrl']) : '';

        if ($url === '' || !in_array($viewport, ['mobile', 'desktop'], true)) {
            return new \WP_Error('turbopress_invalid_payload', 'Invalid payload', ['status' => 400]);
        }

        // Only accept pushes for this site's own host.
        $payload_host = strtolower((string) parse_url($url, PHP_URL_HOST));
        $home_host = strtolower((string) parse_url(home_url(), PHP_URL_HOST));
        if ($payload_host === '' || $home_host === '' || $payload_host !== $home_host) {
            return new \WP_Error('turbopress_foreign_url', 'URL does not belong to this site', ['status' => 403]);
        }

        if ($css !== '') {
            CriticalCssTransformer::write_cache_for_url($url, $viewport, $css);
        }

        if ($lcp_image_url !== '') {
            MediaOptimizer::store_lcp_image($url, $viewport, $lcp_image_url);
        }

        // Fresh critical CSS → regenerate the cached page with it inlined.
        CacheManager::purge_url($url);
        CacheIntegration::purge_foreign_caches('url', $url);

        return ['success' => true, 'viewport' => $viewport, 'css_bytes' => strlen($css)];
    }
}
