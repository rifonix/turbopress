<?php
/**
 * Boot smoke test: stub the WordPress surface, include the plugin bootstrap,
 * and assert every class the plugin instantiates actually loads.
 *
 * C1 regression guard: a missing require_once is a fatal on EVERY request
 * in production — php -l cannot catch it, this can.
 *
 * Usage: php tests/boot-smoke.php
 */

error_reporting(E_ALL & ~E_DEPRECATED);

define('ABSPATH', '/tmp/wp/');
define('WP_CONTENT_DIR', '/tmp/wp-content');
define('MINUTE_IN_SECONDS', 60);
define('HOUR_IN_SECONDS', 3600);
define('DAY_IN_SECONDS', 86400);

function plugin_dir_path($f) { return dirname($f) . '/'; }
function plugin_dir_url($f) { return 'https://example.test/wp-content/plugins/wp-instant/'; }
function register_activation_hook($f, $cb) {}
function register_deactivation_hook($f, $cb) {}
function add_action(...$a) {}
function add_filter(...$a) {}

require dirname(__DIR__) . '/wp-instant.php';

$required = [
    'WPInstant\Plugin',
    'WPInstant\Config',
    'WPInstant\ApiClient',
    'WPInstant\Handshake',
    'WPInstant\CacheManager',
    'WPInstant\CachePurger',
    'WPInstant\CacheRules',
    'WPInstant\CacheIntegration',
    'WPInstant\Htaccess_Manager',
    'WPInstant\AutoPurge',
    'WPInstant\BloatRemover',
    'WPInstant\DomEngine',
    'WPInstant\CriticalCssTransformer',
    'WPInstant\CssOptimizer',
    'WPInstant\MediaOffloader',
    'WPInstant\AssetProxy',
    'WPInstant\PluginAssets',
    'WPInstant\ScriptDelayer',
    'WPInstant\MediaOptimizer',
    'WPInstant\FontOptimizer',
    'WPInstant\ResourceHints',
    'WPInstant\SpeculationRules',
    'WPInstant\BgLazyLoader',
    'WPInstant\VideoFacade',
    'WPInstant\HtmlOptimizer',
    'WPInstant\GravatarLocalizer',
    'WPInstant\NonceRefresher',
    'WPInstant\CartFragment',
    'WPInstant\PresetEngine',
    'WPInstant\HealthCheck',
    'WPInstant\OptimizeCallback',
    'WPInstant\Telemetry',
    'WPInstant\AutoDegrade',
    'WPInstant\AdminPage',
];

$failures = 0;
foreach ($required as $class) {
    if (!class_exists($class)) {
        fwrite(STDERR, "FAIL: class not loaded: {$class}\n");
        $failures++;
    }
}

if (!defined('WP_INSTANT_VERSION')) {
    fwrite(STDERR, "FAIL: WP_INSTANT_VERSION not defined\n");
    $failures++;
}

if ($failures > 0) {
    fwrite(STDERR, "BOOT SMOKE FAILED ({$failures} failures)\n");
    exit(1);
}
echo "BOOT SMOKE OK — " . count($required) . " classes loaded, bootstrap fatal-free\n";
