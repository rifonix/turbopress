<?php
namespace Turbopress;

if (!defined('ABSPATH')) {
    exit;
}

class Handshake {
    public const STATE_TRANSIENT_PREFIX = 'tp_auth_state_';

    public static function generate_connect_url(string $saas_app_url = 'https://turbopress.webaccessibility.workers.dev'): string {
        $state = wp_generate_password(32, false);
        set_transient(self::STATE_TRANSIENT_PREFIX . $state, time(), 3600);

        $domain = get_home_url();
        $parsed = parse_url($domain);
        $clean_domain = $parsed['host'] ?? $_SERVER['HTTP_HOST'] ?? 'localhost';

        $return_url = add_query_arg([
            'page' => 'turbopress',
            'turbopress_pair' => '1',
            'state' => $state,
        ], admin_url('admin.php'));

        return add_query_arg([
            'domain' => $clean_domain,
            'state' => $state,
            'return_url' => urlencode($return_url),
            'wp_version' => get_bloginfo('version'),
            'plugin_version' => TURBOPRESS_VERSION,
        ], rtrim($saas_app_url, '/') . '/connect');
    }

    public static function handle_return(): void {
        if (!is_admin() || !current_user_can('manage_options')) {
            return;
        }

        if (empty($_GET['page']) || $_GET['page'] !== 'turbopress' || empty($_GET['turbopress_pair'])) {
            return;
        }

        $state = sanitize_text_field($_GET['state'] ?? '');
        $api_key = sanitize_text_field($_GET['api_key'] ?? '');
        $site_id = sanitize_text_field($_GET['site_id'] ?? '');

        if (empty($state) || empty($api_key)) {
            add_settings_error('turbopress', 'invalid_handshake', 'Invalid handshake payload received.', 'error');
            return;
        }

        $transient_key = self::STATE_TRANSIENT_PREFIX . $state;
        $stored_time = get_transient($transient_key);

        if (!$stored_time) {
            add_settings_error('turbopress', 'expired_state', 'Handshake session expired or invalid. Please try connecting again.', 'error');
            return;
        }

        delete_transient($transient_key);

        // Save API Key & Site ID
        $config = new Config();
        $config->set_api_key($api_key);
        if ($site_id) {
            $config->set_site_id($site_id);
        }

        // Test verify with Edge API
        $api_client = new ApiClient($config);
        $verify = $api_client->verify_connection();

        if ($verify['success']) {
            // Set-and-forget kickoff: now that the site is connected,
            // immediately queue the first optimization pass (edge critical
            // CSS + LCP measurement for the homepage) and nudge the media
            // offload worker so R2 derivatives start generating in the
            // background without any manual action.
            wp_schedule_single_event(time() + 10, 'turbopress_async_optimize', ['url' => home_url('/'), 'attempt' => 1]);
            wp_schedule_single_event(time() + 60, 'turbopress_media_offload', []);
            spawn_cron();

            // Clean redirect back to main settings page with success flag
            wp_safe_redirect(add_query_arg(['page' => 'turbopress', 'connected' => '1'], admin_url('admin.php')));
            exit;
        } else {
            add_settings_error('turbopress', 'verify_failed', 'Connected but verification failed: ' . ($verify['error'] ?? 'Unknown'), 'warning');
        }
    }
}
