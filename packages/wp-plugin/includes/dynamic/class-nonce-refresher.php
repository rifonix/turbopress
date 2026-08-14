<?php
namespace Turbopress;

if (!defined('ABSPATH')) {
    exit;
}

class NonceRefresher {
    public function init(): void {
        add_action('rest_api_init', [$this, 'register_routes']);
    }

    public function register_routes(): void {
        register_rest_route('turbopress/v1', '/nonces', [
            'methods' => 'POST',
            'callback' => [$this, 'refresh_nonces'],
            'permission_callback' => '__return_true',
        ]);
    }

    public function refresh_nonces(\WP_REST_Request $request): \WP_REST_Response {
        $params = $request->get_json_params() ?: [];
        $actions = $params['actions'] ?? [];

        if (!is_array($actions)) {
            $actions = [];
        }

        $nonces = [];
        foreach ($actions as $action) {
            $sanitized_action = sanitize_key($action);
            if (!empty($sanitized_action)) {
                $nonces[$sanitized_action] = wp_create_nonce($sanitized_action);
            }
        }

        // Always include default wp_rest nonce for REST API requests
        $nonces['wp_rest'] = wp_create_nonce('wp_rest');

        // Optional WooCommerce cart fragment state
        $cart_count = 0;
        $cart_hash = '';
        if (function_exists('WC') && WC()->cart) {
            $cart_count = WC()->cart->get_cart_contents_count();
            $cart_hash = WC()->cart->get_cart_hash();
        }

        return new \WP_REST_Response([
            'success' => true,
            'nonces' => $nonces,
            'cart_count' => $cart_count,
            'cart_hash' => $cart_hash,
            'timestamp' => time(),
        ], 200, [
            'Cache-Control' => 'no-cache, no-store, must-revalidate',
            'Pragma' => 'no-cache',
            'Expires' => '0',
        ]);
    }
}
