<?php
namespace WPInstant;

if (!defined('ABSPATH')) {
    exit;
}

class Handshake {
    public const STATE_TRANSIENT_PREFIX = 'wpins_auth_state_';

    public static function generate_connect_url(string $saas_app_url = 'https://app.wpinstant.dev'): string {
        $state = wp_generate_password(32, false);
        set_transient(self::STATE_TRANSIENT_PREFIX . $state, time(), 3600);

        $domain = get_home_url();
        $parsed = parse_url($domain);
        $clean_domain = $parsed['host'] ?? $_SERVER['HTTP_HOST'] ?? 'localhost';

        $return_url = add_query_arg([
            'page' => 'wp-instant',
            'wp_instant_pair' => '1',
            'state' => $state,
        ], admin_url('admin.php'));

        return add_query_arg([
            'domain' => $clean_domain,
            'state' => $state,
            'return_url' => urlencode($return_url),
            'wp_version' => get_bloginfo('version'),
            'plugin_version' => WP_INSTANT_VERSION,
        ], rtrim($saas_app_url, '/') . '/connect');
    }

    public static function handle_return(): void {
        if (!is_admin() || !current_user_can('manage_options')) {
            return;
        }

        if (empty($_GET['page']) || $_GET['page'] !== 'wp-instant' || empty($_GET['wp_instant_pair'])) {
            return;
        }

        $state = sanitize_text_field($_GET['state'] ?? '');
        $api_key = sanitize_text_field($_GET['api_key'] ?? '');
        $site_id = sanitize_text_field($_GET['site_id'] ?? '');

        if (empty($state)) {
            add_settings_error('wp_instant', 'invalid_handshake', 'Invalid handshake payload received.', 'error');
            return;
        }

        $transient_key = self::STATE_TRANSIENT_PREFIX . $state;
        $stored_time = get_transient($transient_key);

        if (!$stored_time) {
            add_settings_error('wp_instant', 'expired_state', 'Handshake session expired or invalid. Please try connecting again.', 'error');
            return;
        }

        // OAuth-style redeem (v1.12.1+ edge): the key is not in the URL —
        // exchange the validated state for it server-to-server. The legacy
        // api_key-in-URL path is kept for older edge deployments.
        if (empty($api_key)) {
            $config = new Config();
            $parsed = parse_url(home_url());
            $domain = strtolower($parsed['host'] ?? '');
            $redeem = (new ApiClient($config))->redeem_handshake($state, $domain);
            if (empty($redeem['success'])) {
                add_settings_error('wp_instant', 'redeem_failed', 'Handshake key exchange failed: ' . ($redeem['error'] ?? 'Unknown'), 'error');
                return;
            }
            $api_key = $redeem['api_key'];
            $site_id = $redeem['site_id'] ?? '';
        }

        delete_transient($transient_key);

        // Save API Key & Site ID
        $config = new Config();
        $config->set_api_key($api_key);
        if ($site_id) {
            $config->set_site_id($site_id);
        }

        // Test verify with Edge API (state closes the handshake loop:
        // single-use, bound to this domain edge-side)
        $api_client = new ApiClient($config);
        $verify = $api_client->verify_connection($state);

        if ($verify['success']) {
            // Set-and-forget kickoff: the moment the site is connected,
            // dispatch the first optimization pass inline (edge critical
            // CSS + LCP measurement for the homepage) so it starts even
            // when WP-Cron is slow or disabled, then keep the cron poller
            // as the delivery fallback. Media offload starts immediately
            // via a due-now single event + spawn_cron().
            $home = home_url('/');
            $dispatch = $api_client->dispatch_optimization($home);
            if (!empty($dispatch['data']['jobs'])) {
                $jobs = array_map(
                    static fn(array $j): array => ['id' => $j['jobId'], 'viewport' => $j['viewport']],
                    $dispatch['data']['jobs']
                );
                set_transient('wpins_jobs_' . md5($home), $jobs, 30 * MINUTE_IN_SECONDS);
                wp_schedule_single_event(time() + 60, 'wp_instant_async_optimize', [$home, 1]);
            }
            wp_schedule_single_event(time(), 'wp_instant_media_offload', []);
            spawn_cron();

            // Clean redirect back to main settings page with success flag
            wp_safe_redirect(add_query_arg(['page' => 'wp-instant', 'connected' => '1'], admin_url('admin.php')));
            exit;
        } else {
            add_settings_error('wp-instant', 'verify_failed', 'Connected but verification failed: ' . ($verify['error'] ?? 'Unknown'), 'warning');
        }
    }
}
