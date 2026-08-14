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
            'body' => json_encode([]),
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
}
