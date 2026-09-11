<?php
/**
 * Plugin Name: WP Instant - Next-Gen Page Optimizer
 * Plugin URI: https://wpinstant.dev
 * Description: Ultra-high performance WordPress page speed optimization engine powered by global Edge Delivery & Real-Browser Engine.
 * Version: 1.17.0
 * Author: WP Instant Team
 * Author URI: https://wpinstant.dev
 * License: GPLv2 or later
 * Text Domain: wp-instant
 * Requires at least: 6.0
 * Requires PHP: 8.1
 */

if (!defined('ABSPATH')) {
    exit;
}

define('WP_INSTANT_VERSION', '1.17.0');
define('WP_INSTANT_PLUGIN_FILE', __FILE__);
define('WP_INSTANT_PATH', plugin_dir_path(__FILE__));
define('WP_INSTANT_URL', plugin_dir_url(__FILE__));
define('WP_INSTANT_CACHE_DIR', WP_CONTENT_DIR . '/cache/wp-instant');
// Static page cache lives in its own subtree so full purges never destroy
// expensive artifacts (critical CSS, combined CSS, localized fonts).
define('WP_INSTANT_PAGES_DIR', WP_INSTANT_CACHE_DIR . '/pages');
define('WP_INSTANT_DEFAULT_API_BASE', 'https://api.wpinstant.dev');
// Visitor-facing asset delivery (media derivatives, proxied CSS/JS) goes
// through the CDN hostname; the control plane stays on api.wpinstant.dev.
define('WP_INSTANT_DEFAULT_CDN_BASE', 'https://cdn.wpinstant.dev');
// Direct R2 custom domain for immutable public media derivatives. Critical
// CSS and subscription-sensitive artifacts intentionally stay behind the
// Worker-controlled cdn.wpinstant.dev hostname.
define('WP_INSTANT_DEFAULT_OBJECT_BASE', 'https://objects.wpinstant.dev');

// Autoload Includes
require_once WP_INSTANT_PATH . 'includes/class-plugin.php';
require_once WP_INSTANT_PATH . 'includes/class-config.php';
require_once WP_INSTANT_PATH . 'includes/class-api-client.php';
require_once WP_INSTANT_PATH . 'includes/class-handshake.php';
require_once WP_INSTANT_PATH . 'includes/class-updater.php';
require_once WP_INSTANT_PATH . 'includes/cache/class-cache-manager.php';
require_once WP_INSTANT_PATH . 'includes/cache/class-cache-purger.php';
require_once WP_INSTANT_PATH . 'includes/cache/class-cache-rules.php';
require_once WP_INSTANT_PATH . 'includes/transformer/class-dom-engine.php';
require_once WP_INSTANT_PATH . 'includes/transformer/class-critical-css.php';
require_once WP_INSTANT_PATH . 'includes/transformer/class-css-optimizer.php';
require_once WP_INSTANT_PATH . 'includes/transformer/class-media-offloader.php';
require_once WP_INSTANT_PATH . 'includes/transformer/class-asset-proxy.php';
require_once WP_INSTANT_PATH . 'includes/transformer/class-plugin-assets.php';
require_once WP_INSTANT_PATH . 'includes/transformer/class-script-delayer.php';
require_once WP_INSTANT_PATH . 'includes/transformer/class-media-optimizer.php';
require_once WP_INSTANT_PATH . 'includes/transformer/class-font-optimizer.php';
require_once WP_INSTANT_PATH . 'includes/transformer/class-resource-hints.php';
require_once WP_INSTANT_PATH . 'includes/transformer/class-speculation.php';
require_once WP_INSTANT_PATH . 'includes/transformer/class-bg-lazyloader.php';
require_once WP_INSTANT_PATH . 'includes/transformer/class-video-facade.php';
require_once WP_INSTANT_PATH . 'includes/transformer/class-html-optimizer.php';
require_once WP_INSTANT_PATH . 'includes/transformer/class-gravatar-localizer.php';
require_once WP_INSTANT_PATH . 'includes/optimizer/class-bloat-remover.php';
require_once WP_INSTANT_PATH . 'includes/dynamic/class-nonce-refresher.php';
require_once WP_INSTANT_PATH . 'includes/dynamic/class-cart-fragment.php';
require_once WP_INSTANT_PATH . 'includes/compatibility/class-preset-engine.php';
require_once WP_INSTANT_PATH . 'includes/cache/class-cache-integration.php';
require_once WP_INSTANT_PATH . 'includes/cache/class-htaccess-manager.php';
require_once WP_INSTANT_PATH . 'includes/cache/class-auto-purge.php';
require_once WP_INSTANT_PATH . 'includes/class-health-check.php';
require_once WP_INSTANT_PATH . 'includes/class-optimize-callback.php';
require_once WP_INSTANT_PATH . 'includes/class-telemetry.php';
require_once WP_INSTANT_PATH . 'includes/class-auto-degrade.php';
require_once WP_INSTANT_PATH . 'admin/class-admin-icons.php';
require_once WP_INSTANT_PATH . 'admin/class-admin-settings-base.php';
require_once WP_INSTANT_PATH . 'admin/class-admin-page-dashboard.php';
require_once WP_INSTANT_PATH . 'admin/class-admin-page-assets.php';
require_once WP_INSTANT_PATH . 'admin/class-admin-page-html-css.php';
require_once WP_INSTANT_PATH . 'admin/class-admin-page-js.php';
require_once WP_INSTANT_PATH . 'admin/class-admin-page-advanced.php';
require_once WP_INSTANT_PATH . 'admin/class-admin-page.php';

// Activation Hook
register_activation_hook(__FILE__, function() {
    WPInstant\Plugin::activate();
});

// Deactivation Hook
register_deactivation_hook(__FILE__, function() {
    WPInstant\Plugin::deactivate();
});

// Bootstrap Plugin
add_action('plugins_loaded', function() {
    WPInstant\Plugin::get_instance()->init();
});
