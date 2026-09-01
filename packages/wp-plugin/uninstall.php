<?php
/**
 * WP Instant uninstall cleanup.
 *
 * Runs when the plugin is deleted from wp-admin. Removes every trace:
 * connection keys + site credentials, options, transients, cache
 * artifacts, our advanced-cache drop-in and the .htaccess marker block.
 *
 * Note: WP deactivates the plugin before deleting it, so deactivate()
 * (drop-in removal, htaccess strip, cache purge) has normally already
 * run — everything below is standalone-safe and idempotent.
 *
 * @package WP Instant
 */

if (!defined('WP_UNINSTALL_PLUGIN')) {
    exit;
}

$wp_instant_options = [
    'wp_instant_config',
    'wp_instant_api_key',           // connection credentials (separate options —
    'wp_instant_site_id',           // NOT inside wp_instant_config)
    'wp_instant_callback_secret',
    'wp_instant_api_url',
    'wp_instant_cdn_url',
    'wp_instant_version',
    'wp_instant_health',
    'wp_instant_auto_degrade',
    'wp_instant_auto_degrade_dismissed',
    'wp_instant_htaccess',
    'wp_instant_media_queue',
    'wp_instant_lcp_images',
    'wp_instant_css_dispatched',
    'wp_instant_dropin_conflict',
    'wp_instant_do_activation_redirect',
];

foreach ($wp_instant_options as $wp_instant_option) {
    delete_option($wp_instant_option);
}

// Transients (job pollers, dispatch throttles, health probes). Multisite:
// clean the current site; network-activated installs are not a target of
// this plugin.
global $wpdb;
$wp_instant_transient_patterns = [
    '\_transient\_wpins\_%',
    '\_transient\_wp\_instant\_%',
    '\_transient\_timeout\_wpins\_%',
    '\_transient\_timeout\_wp\_instant\_%',
];
foreach ($wp_instant_transient_patterns as $wp_instant_pattern) {
    $wp_instant_keys = $wpdb->get_col(
        $wpdb->prepare(
            "SELECT option_name FROM {$wpdb->options} WHERE option_name LIKE %s",
            $wp_instant_pattern
        )
    );
    foreach ($wp_instant_keys as $wp_instant_key) {
        $wp_instant_clean = str_replace('_transient_timeout_', '', $wp_instant_key);
        $wp_instant_clean = str_replace('_transient_', '', $wp_instant_clean);
        delete_transient($wp_instant_clean);
    }
}

// User preferences.
delete_metadata('user', 0, 'wp_instant_view_mode', '', true);

// Per-page asset exclusion rules (post meta, every post type).
delete_metadata('post', 0, '_wp_instant_asset_exclusions', '', true);

// Cache artifacts: pages, critical CSS, combined bundles, fonts, media, RUM.
$wp_instant_cache_dir = WP_CONTENT_DIR . '/cache/wp-instant';
if (is_dir($wp_instant_cache_dir)) {
    $wp_instant_rm = static function (string $dir) use (&$wp_instant_rm): void {
        $entries = @scandir($dir) ?: [];
        foreach ($entries as $entry) {
            if ($entry === '.' || $entry === '..') {
                continue;
            }
            $path = $dir . '/' . $entry;
            is_dir($path) ? $wp_instant_rm($path) : @unlink($path);
        }
        @rmdir($dir);
    };
    $wp_instant_rm($wp_instant_cache_dir);
}

// Our advanced-cache drop-in (only when the checksum matches ours).
$wp_instant_dropin = WP_CONTENT_DIR . '/advanced-cache.php';
$wp_instant_source = __DIR__ . '/advanced-cache.php';
if (file_exists($wp_instant_dropin) && file_exists($wp_instant_source)) {
    if (md5_file($wp_instant_dropin) === md5_file($wp_instant_source)) {
        @unlink($wp_instant_dropin);
    }
}

// .htaccess marker block (deactivate normally strips it; belt & braces).
$wp_instant_htaccess = dirname(WP_CONTENT_DIR) . '/.htaccess';
if (file_exists($wp_instant_htaccess) && is_writable($wp_instant_htaccess)) {
    $wp_instant_content = (string) file_get_contents($wp_instant_htaccess);
    $wp_instant_content = preg_replace(
        '/\n?# BEGIN WP Instant.*?# END WP Instant\n?/s',
        "\n",
        $wp_instant_content
    );
    if ($wp_instant_content !== null) {
        @file_put_contents($wp_instant_htaccess, $wp_instant_content);
    }
    @unlink($wp_instant_htaccess . '.wp-instant-bak');
}

// Scheduled events.
wp_clear_scheduled_hook('wp_instant_async_optimize');
wp_clear_scheduled_hook('wp_instant_health_heartbeat');
wp_clear_scheduled_hook('wp_instant_rum_heartbeat');
wp_clear_scheduled_hook('wp_instant_media_offload');
