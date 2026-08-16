<?php
/**
 * Turbopress uninstall cleanup.
 *
 * Runs when the plugin is deleted from wp-admin. Removes every trace:
 * connection keys + site credentials, options, transients, cache
 * artifacts, our advanced-cache drop-in and the .htaccess marker block.
 *
 * Note: WP deactivates the plugin before deleting it, so deactivate()
 * (drop-in removal, htaccess strip, cache purge) has normally already
 * run — everything below is standalone-safe and idempotent.
 *
 * @package Turbopress
 */

if (!defined('WP_UNINSTALL_PLUGIN')) {
    exit;
}

$turbopress_options = [
    'turbopress_config',            // includes api_key + site_id (connection keys)
    'turbopress_callback_secret',
    'turbopress_api_url',
    'turbopress_version',
    'turbopress_health',
    'turbopress_auto_degrade',
    'turbopress_auto_degrade_dismissed',
    'turbopress_htaccess',
    'turbopress_media_queue',
    'turbopress_lcp_images',
    'turbopress_css_dispatched',
    'turbopress_dropin_conflict',
    'turbopress_do_activation_redirect',
];

foreach ($turbopress_options as $turbopress_option) {
    delete_option($turbopress_option);
}

// Transients (job pollers, dispatch throttles, health probes). Multisite:
// clean the current site; network-activated installs are not a target of
// this plugin.
global $wpdb;
$turbopress_transient_patterns = [
    '\_transient\_tp\_%',
    '\_transient\_turbopress\_%',
    '\_transient\_timeout\_tp\_%',
    '\_transient\_timeout\_turbopress\_%',
];
foreach ($turbopress_transient_patterns as $turbopress_pattern) {
    $turbopress_keys = $wpdb->get_col(
        $wpdb->prepare(
            "SELECT option_name FROM {$wpdb->options} WHERE option_name LIKE %s",
            $turbopress_pattern
        )
    );
    foreach ($turbopress_keys as $turbopress_key) {
        $turbopress_clean = str_replace('_transient_timeout_', '', $turbopress_key);
        $turbopress_clean = str_replace('_transient_', '', $turbopress_clean);
        delete_transient($turbopress_clean);
    }
}

// User preferences.
delete_metadata('user', 0, 'turbopress_view_mode', '', true);

// Cache artifacts: pages, critical CSS, combined bundles, fonts, media, RUM.
$turbopress_cache_dir = WP_CONTENT_DIR . '/cache/turbopress';
if (is_dir($turbopress_cache_dir)) {
    $turbopress_rm = static function (string $dir) use (&$turbopress_rm): void {
        $entries = @scandir($dir) ?: [];
        foreach ($entries as $entry) {
            if ($entry === '.' || $entry === '..') {
                continue;
            }
            $path = $dir . '/' . $entry;
            is_dir($path) ? $turbopress_rm($path) : @unlink($path);
        }
        @rmdir($dir);
    };
    $turbopress_rm($turbopress_cache_dir);
}

// Our advanced-cache drop-in (only when the checksum matches ours).
$turbopress_dropin = WP_CONTENT_DIR . '/advanced-cache.php';
$turbopress_source = dirname(__DIR__) . '/advanced-cache.php';
if (file_exists($turbopress_dropin) && file_exists($turbopress_source)) {
    if (md5_file($turbopress_dropin) === md5_file($turbopress_source)) {
        @unlink($turbopress_dropin);
    }
}

// .htaccess marker block (deactivate normally strips it; belt & braces).
$turbopress_htaccess = dirname(WP_CONTENT_DIR) . '/.htaccess';
if (file_exists($turbopress_htaccess) && is_writable($turbopress_htaccess)) {
    $turbopress_content = (string) file_get_contents($turbopress_htaccess);
    $turbopress_content = preg_replace(
        '/\n?# BEGIN TurboPress.*?# END TurboPress\n?/s',
        "\n",
        $turbopress_content
    );
    if ($turbopress_content !== null) {
        @file_put_contents($turbopress_htaccess, $turbopress_content);
    }
    @unlink($turbopress_htaccess . '.turbopress-bak');
}

// Scheduled events.
wp_clear_scheduled_hook('turbopress_async_optimize');
wp_clear_scheduled_hook('turbopress_health_heartbeat');
wp_clear_scheduled_hook('turbopress_rum_heartbeat');
wp_clear_scheduled_hook('turbopress_media_offload');
