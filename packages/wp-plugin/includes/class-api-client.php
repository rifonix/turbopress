<?php
namespace Turbopress;

if (!defined('ABSPATH')) {
    exit;
}

class ApiClient {
    private Config $config;

    public function __construct(Config $config) {
        $this->config = $config;
    }

    public function verify_connection(): array {
        $api_key = $this->config->get_api_key();
        if (empty($api_key)) {
            return ['success' => false, 'error' => 'API Key is missing'];
        }

        $domain = $this->get_site_domain();
        $api_url = rtrim($this->config->get_api_url(), '/') . '/api/v1/auth/verify';

        $response = wp_remote_post($api_url, [
            'timeout' => 10,
            'headers' => [
                'Authorization' => 'Bearer ' . $api_key,
                'X-Site-Domain' => $domain,
                'X-Turbopress-Version' => TURBOPRESS_VERSION,
                'X-WP-Version' => get_bloginfo('version'),
                'Content-Type' => 'application/json',
            ],
            'body' => json_encode([
                // Shared once per verify so the edge can sign push callbacks.
                'callback_secret' => Config::get_callback_secret_static(),
                'site_url' => home_url('/'),
            ]),
        ]);

        if (is_wp_error($response)) {
            return ['success' => false, 'error' => $response->get_error_message()];
        }

        $code = wp_remote_retrieve_response_code($response);
        $body = json_decode(wp_remote_retrieve_body($response), true);

        if ($code === 200 && !empty($body['success'])) {
            return ['success' => true, 'data' => $body['data']];
        }

        return ['success' => false, 'error' => $body['error'] ?? 'Verification failed with HTTP ' . $code];
    }

    public function dispatch_optimization(string $url, array $viewports = ['mobile', 'desktop']): array {
        $api_key = $this->config->get_api_key();
        if (empty($api_key)) {
            return ['success' => false, 'error' => 'API Key is missing'];
        }

        $domain = $this->get_site_domain();
        $api_url = rtrim($this->config->get_api_url(), '/') . '/api/v1/optimize/dispatch';

        $response = wp_remote_post($api_url, [
            'timeout' => 15,
            'headers' => [
                'Authorization' => 'Bearer ' . $api_key,
                'X-Site-Domain' => $domain,
                'Content-Type' => 'application/json',
            ],
            'body' => json_encode([
                'url' => $url,
                'viewports' => $viewports,
            ]),
        ]);

        if (is_wp_error($response)) {
            return ['success' => false, 'error' => $response->get_error_message()];
        }

        $body = json_decode(wp_remote_retrieve_body($response), true);
        return $body ?? ['success' => false, 'error' => 'Invalid API response'];
    }

    public function get_site_domain(): string {
        $site_url = get_home_url();
        $parsed = parse_url($site_url);
        return $parsed['host'] ?? $_SERVER['HTTP_HOST'] ?? 'localhost';
    }

    /**
     * Push a health report to the SaaS control plane (daily heartbeat).
     */
    public function send_heartbeat(array $report): array {
        $api_key = $this->config->get_api_key();
        if (empty($api_key)) {
            return ['success' => false, 'error' => 'API Key is missing'];
        }

        $api_url = rtrim($this->config->get_api_url(), '/') . '/api/v1/auth/heartbeat';

        $response = wp_remote_post($api_url, [
            'timeout' => 10,
            'headers' => [
                'Authorization' => 'Bearer ' . $api_key,
                'X-Site-Domain' => $this->get_site_domain(),
                'X-Turbopress-Version' => TURBOPRESS_VERSION,
                'Content-Type' => 'application/json',
            ],
            'body' => wp_json_encode($report),
        ]);

        if (is_wp_error($response)) {
            return ['success' => false, 'error' => $response->get_error_message()];
        }

        $code = wp_remote_retrieve_response_code($response);
        $body = json_decode(wp_remote_retrieve_body($response), true);

        if ($code === 200 && !empty($body['success'])) {
            return ['success' => true];
        }

        return ['success' => false, 'error' => $body['error'] ?? 'Heartbeat failed with HTTP ' . $code];
    }

    /**
     * Poll the optimization job status (KV/D1 backed).
     * Returns ['status' => queued|processing|completed|failed, ...] or error array.
     */
    public function get_job_status(string $job_id): array {
        $api_key = $this->config->get_api_key();
        if (empty($api_key)) {
            return ['success' => false, 'error' => 'API Key is missing'];
        }

        $api_url = rtrim($this->config->get_api_url(), '/') . '/api/v1/optimize/status/' . rawurlencode($job_id);

        $response = wp_remote_get($api_url, [
            'timeout' => 10,
            'headers' => [
                'Authorization' => 'Bearer ' . $api_key,
                'X-Site-Domain' => $this->get_site_domain(),
            ],
        ]);

        if (is_wp_error($response)) {
            return ['success' => false, 'error' => $response->get_error_message()];
        }

        $code = wp_remote_retrieve_response_code($response);
        $body = json_decode(wp_remote_retrieve_body($response), true);

        if ($code === 200 && !empty($body['success'])) {
            return ['success' => true, 'data' => $body['data']];
        }

        return ['success' => false, 'error' => $body['error'] ?? 'Status check failed with HTTP ' . $code];
    }

    /**
     * Download generated Critical CSS for a URL/viewport from the edge.
     * Returns the raw CSS string, or null when unavailable.
     */
    public function download_critical_css(string $url, string $viewport): ?string {
        $api_key = $this->config->get_api_key();
        if (empty($api_key)) {
            return null;
        }

        $api_url = add_query_arg(
            ['url' => $url, 'viewport' => $viewport],
            rtrim($this->config->get_api_url(), '/') . '/api/v1/optimize/css'
        );

        $response = wp_remote_get($api_url, [
            'timeout' => 15,
            'headers' => [
                'Authorization' => 'Bearer ' . $api_key,
                'X-Site-Domain' => $this->get_site_domain(),
            ],
        ]);

        if (is_wp_error($response)) {
            return null;
        }

        $code = wp_remote_retrieve_response_code($response);
        $body = wp_remote_retrieve_body($response);

        if ($code === 200 && !empty($body) && stripos(wp_remote_retrieve_header($response, 'content-type'), 'text/css') !== false) {
            return $body;
        }

        return null;
    }
}
