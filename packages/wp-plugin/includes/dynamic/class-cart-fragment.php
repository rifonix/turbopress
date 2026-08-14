<?php
namespace Turbopress;

if (!defined('ABSPATH')) {
    exit;
}

class CartFragment {
    private Config $config;

    public function __construct(Config $config) {
        $this->config = $config;
    }

    public function init(): void {
        if (!$this->config->get('dynamic.cart_micro_hydration', true)) {
            return;
        }

        // Optimize WooCommerce cart fragments script loading
        add_action('wp_enqueue_scripts', [$this, 'optimize_wc_fragments'], 99);
    }

    public function optimize_wc_fragments(): void {
        if (!function_exists('is_woocommerce')) {
            return;
        }

        // If not on shop, cart, checkout, or single product, we can safely defer wc-cart-fragments
        if (!is_cart() && !is_checkout()) {
            wp_dequeue_script('wc-cart-fragments');
        }
    }
}
