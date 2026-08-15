<?php
namespace Turbopress;

if (!defined('ABSPATH')) {
    exit;
}

class PresetEngine {
    private Config $config;

    public function __construct(Config $config) {
        $this->config = $config;
    }

    public function apply_auto_presets(): void {
        // v1.2.0: exclusions only gate interaction_delay mode. In defer mode
        // every external script is deferred (order-safe), so blanket builder
        // exclusions are no longer added — they previously made deferral a
        // no-op on Elementor/Divi/Woo sites.
        if ($this->config->get('javascript.execution_mode', 'defer') !== 'interaction_delay') {
            return;
        }

        $auto_exclusions = [];

        // 1. Elementor / Elementor Pro
        if (defined('ELEMENTOR_VERSION')) {
            $auto_exclusions[] = 'elementor-frontend';
            $auto_exclusions[] = 'elementor-pro';
            $auto_exclusions[] = 'elementorFrontendConfig';
            $auto_exclusions[] = 'elementorProFrontendConfig';
        }

        // 2. Divi Builder / Extra Theme
        if (defined('ET_BUILDER_VERSION')) {
            $auto_exclusions[] = 'divi-custom-script';
            $auto_exclusions[] = 'et_pb_custom';
            $auto_exclusions[] = 'et_shortcodes_frontend';
        }

        // 3. Bricks Builder
        if (defined('BRICKS_VERSION')) {
            $auto_exclusions[] = 'bricks-scripts';
            $auto_exclusions[] = 'bricks-alpine';
        }

        // 4. Contact Form 7
        if (defined('WPCF7_VERSION')) {
            $auto_exclusions[] = 'contact-form-7';
            $auto_exclusions[] = 'wpcf7';
        }

        // 5. Gravity Forms
        if (class_exists('GFCommon')) {
            $auto_exclusions[] = 'gravityforms';
            $auto_exclusions[] = 'gform';
        }

        // 6. WPForms
        if (defined('WPFORMS_VERSION')) {
            $auto_exclusions[] = 'wpforms';
            $auto_exclusions[] = 'wpforms-elementor';
        }

        // 7. Cookie Consent Banners (Complianz, Cookiebot, OneTrust, Cookie Notice)
        if (defined('cmplz_version') || defined('COOKIEBOT_VERSION') || defined('CN_ALL_COOKIES_TAB')) {
            $auto_exclusions[] = 'complianz';
            $auto_exclusions[] = 'cookiebot';
            $auto_exclusions[] = 'onetrust';
            $auto_exclusions[] = 'cookie-law-info';
            $auto_exclusions[] = 'cookie-notice';
        }

        // 8. WooCommerce & Stripe
        if (class_exists('WooCommerce')) {
            $auto_exclusions[] = 'woocommerce';
            $auto_exclusions[] = 'wc-add-to-cart';
            $auto_exclusions[] = 'stripe';
            $auto_exclusions[] = 'woocommerce-gateway-stripe';
        }

        if (!empty($auto_exclusions)) {
            $existing_exclusions = (array) $this->config->get('javascript.exclusions', []);
            $merged = array_unique(array_merge($existing_exclusions, $auto_exclusions));
            if (count($merged) !== count($existing_exclusions)) {
                $this->config->set('javascript.exclusions', array_values($merged));
            }
        }
    }
}
