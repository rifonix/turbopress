<?php
namespace WPInstant;

if (!defined('ABSPATH')) {
    exit;
}

/**
 * Self-update channel. Without it, installed sites kept whatever zip version
 * they were given forever — edge redeploys cannot fix origin-side code, so
 * transformer fixes never reached live sites unless someone manually
 * re-downloaded and re-installed.
 *
 * Mechanism: WP refreshes the update-plugins transient twice a day; the
 * pre_set filter probes the control plane's version endpoint (12h-cached
 * here) and, when a newer published zip exists, injects a standard update
 * entry so WP-Admin shows the one-click "update now" row.
 *
 * Fail-silent by design: any API error leaves the transient untouched.
 */
class Updater {
    private const PLUGIN_SLUG = 'wp-instant/wp-instant.php';
    private const VERSION_TRANSIENT = 'wpins_remote_version';
    private Config $config;

    public function __construct(Config $config) {
        $this->config = $config;
    }

    public function register(): void {
        add_filter('pre_set_site_transient_update_plugins', [$this, 'inject_update']);
        add_filter('plugins_api', [$this, 'plugin_details'], 20, 3);
        add_action('wp_instant_updater_check', [$this, 'refresh_version_cache']);
    }

    /**
     * @return object{version: string|null, uploaded: string}|null
     */
    private function remote_version(bool $force = false): ?object {
        if (!$force) {
            $cached = get_transient(self::VERSION_TRANSIENT);
            if (is_object($cached) && isset($cached->version)) {
                return $cached;
            }
        }

        $api_url = rtrim($this->config->get_api_url(), '/') . '/api/v1/assets/plugin/version';
        $response = wp_remote_get($api_url, ['timeout' => 6]);
        if (is_wp_error($response) || wp_remote_retrieve_response_code($response) !== 200) {
            // Negative-cache briefly so a down API doesn't add latency to
            // every admin update-transient refresh.
            set_transient(self::VERSION_TRANSIENT, (object) ['version' => null, 'uploaded' => ''], 30 * MINUTE_IN_SECONDS);
            return null;
        }

        $body = json_decode((string) wp_remote_retrieve_body($response), true);
        $version = is_array($body) ? ($body['data']['version'] ?? null) : null;
        $uploaded = is_array($body) ? (string) ($body['data']['uploaded'] ?? '') : '';
        if (!is_string($version) || $version === '') {
            // Zip published without version metadata (old release flow).
            set_transient(self::VERSION_TRANSIENT, (object) ['version' => null, 'uploaded' => $uploaded], 30 * MINUTE_IN_SECONDS);
            return null;
        }

        $info = (object) ['version' => $version, 'uploaded' => $uploaded];
        set_transient(self::VERSION_TRANSIENT, $info, 12 * HOUR_IN_SECONDS);
        return $info;
    }

    /** Cron/admin refresh entry point (keeps the transient warm). */
    public function refresh_version_cache(): void {
        $this->remote_version(true);
    }

    /**
     * @param mixed $transient Update-plugins transient (stdClass|null).
     * @return mixed
     */
    public function inject_update($transient) {
        if (!$transient instanceof \stdClass) {
            return $transient;
        }

        // A manual upload of a newer zip must always win over the remote
        // channel for the same version — only offer strictly-newer builds.
        $remote = $this->remote_version();
        if ($remote === null || $remote->version === null) {
            return $transient;
        }
        if (version_compare($remote->version, WP_INSTANT_VERSION, '<=')) {
            return $transient;
        }

        $plugin_basename = plugin_basename(WP_INSTANT_PLUGIN_FILE);
        // Respect a user's explicit skip.
        if (!empty($transient->no_update) && isset($transient->no_update[$plugin_basename])) {
            return $transient;
        }

        $transient->response[$plugin_basename] = (object) [
            'slug' => 'wp-instant',
            'plugin' => $plugin_basename,
            'new_version' => $remote->version,
            'url' => 'https://wpinstant.dev/',
            'package' => rtrim($this->config->get_api_url(), '/') . '/api/v1/assets/plugin/download',
            'requires' => '6.0',
            'requires_php' => '8.1',
            'tested' => get_bloginfo('version'),
        ];
        return $transient;
    }

    /**
     * "View version details" modal on the plugins screen. Minimal but real:
     * the default WP dialog breaks without a plugins_api handler.
     */
    public function plugin_details($result, $action, $args) {
        if (($action ?? '') !== 'plugin_information' || ($args->slug ?? '') !== 'wp-instant') {
            return $result;
        }
        $remote = $this->remote_version();
        $result = (object) [
            'name' => 'WP Instant - Next-Gen Page Optimizer',
            'slug' => 'wp-instant',
            'version' => $remote->version ?? WP_INSTANT_VERSION,
            'author' => 'WP Instant Team',
            'homepage' => 'https://wpinstant.dev/',
            'download_link' => rtrim($this->config->get_api_url(), '/') . '/api/v1/assets/plugin/download',
            'sections' => [
                'description' => '<p>Ultra-high performance WordPress page speed optimization engine powered by global Edge Delivery &amp; Real-Browser Engine.</p>',
                'changelog' => '<p><strong>' . esc_html($remote->version ?? WP_INSTANT_VERSION) . '</strong> — see https://wpinstant.dev/changelog for release notes.</p>',
            ],
        ];
        return $result;
    }
}
