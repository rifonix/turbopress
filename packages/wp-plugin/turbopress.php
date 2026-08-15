<?php
/**
 * Plugin Name: Turbopress - Next-Gen Page Optimizer
 * Plugin URI: https://turbopress.io
 * Description: Ultra-high performance WordPress page speed optimization engine powered by Cloudflare Edge & Browser Rendering.
 * Version: 1.5.1
 * Author: Turbopress Team
 * Author URI: https://turbopress.io
 * License: GPLv2 or later
 * Text Domain: turbopress
 * Requires at least: 6.0
 * Requires PHP: 8.1
 */

if (!defined('ABSPATH')) {
    exit;
}

define('TURBOPRESS_VERSION', '1.5.1');
define('TURBOPRESS_PLUGIN_FILE', __FILE__);
define('TURBOPRESS_PATH', plugin_dir_path(__FILE__));
define('TURBOPRESS_URL', plugin_dir_url(__FILE__));
define('TURBOPRESS_CACHE_DIR', WP_CONTENT_DIR . '/cache/turbopress');
// Static page cache lives in its own subtree so full purges never destroy
// expensive artifacts (critical CSS, combined CSS, localized fonts).
define('TURBOPRESS_PAGES_DIR', TURBOPRESS_CACHE_DIR . '/pages');
define('TURBOPRESS_DEFAULT_API_BASE', 'https://turbopress.webaccessibility.workers.dev');

// Autoload Includes
require_once TURBOPRESS_PATH . 'includes/class-plugin.php';
require_once TURBOPRESS_PATH . 'includes/class-config.php';
require_once TURBOPRESS_PATH . 'includes/class-api-client.php';
require_once TURBOPRESS_PATH . 'includes/class-handshake.php';
require_once TURBOPRESS_PATH . 'includes/cache/class-cache-manager.php';
require_once TURBOPRESS_PATH . 'includes/cache/class-cache-purger.php';
require_once TURBOPRESS_PATH . 'includes/cache/class-cache-rules.php';
require_once TURBOPRESS_PATH . 'includes/transformer/class-dom-engine.php';
require_once TURBOPRESS_PATH . 'includes/transformer/class-critical-css.php';
require_once TURBOPRESS_PATH . 'includes/transformer/class-css-optimizer.php';
require_once TURBOPRESS_PATH . 'includes/transformer/class-script-delayer.php';
require_once TURBOPRESS_PATH . 'includes/transformer/class-media-optimizer.php';
require_once TURBOPRESS_PATH . 'includes/transformer/class-font-optimizer.php';
require_once TURBOPRESS_PATH . 'includes/transformer/class-resource-hints.php';
require_once TURBOPRESS_PATH . 'includes/transformer/class-speculation.php';
require_once TURBOPRESS_PATH . 'includes/dynamic/class-nonce-refresher.php';
require_once TURBOPRESS_PATH . 'includes/dynamic/class-cart-fragment.php';
require_once TURBOPRESS_PATH . 'includes/compatibility/class-preset-engine.php';
require_once TURBOPRESS_PATH . 'includes/cache/class-cache-integration.php';
require_once TURBOPRESS_PATH . 'includes/class-health-check.php';
require_once TURBOPRESS_PATH . 'includes/class-optimize-callback.php';
require_once TURBOPRESS_PATH . 'includes/class-telemetry.php';
require_once TURBOPRESS_PATH . 'includes/class-auto-degrade.php';
require_once TURBOPRESS_PATH . 'admin/class-admin-page.php';

// Activation Hook
register_activation_hook(__FILE__, function() {
    Turbopress\Plugin::activate();
});

// Deactivation Hook
register_deactivation_hook(__FILE__, function() {
    Turbopress\Plugin::deactivate();
});

// Bootstrap Plugin
add_action('plugins_loaded', function() {
    Turbopress\Plugin::get_instance()->init();
});
