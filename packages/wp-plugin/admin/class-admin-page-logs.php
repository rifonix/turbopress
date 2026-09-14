<?php
namespace WPInstant\Admin;

use WPInstant\CacheIntegration;
use WPInstant\Config;
use WPInstant\Logger;

if (!defined('ABSPATH')) {
    exit;
}

/**
 * WP Instant → Logs. Live pipeline log + current delivery state, so
 * "optimization is not applying" is answerable from WP Admin: what the
 * pipeline did on the last requests, why it bypassed (if it did), and
 * whether CSS/CDN artifacts are flowing in from the edge.
 */
class Page_Logs extends Settings_Page {
    protected string $slug = 'wp-instant-logs';
    protected string $title = 'Logs';
    protected string $description = 'Pipeline events and delivery state — what WP Instant did on recent requests, and why.';

    public static function field_definitions(): array {
        return []; // Read-only page (clear/pause actions only).
    }

    public function render(): void {
        $notice = null;
        if (isset($_GET['wpins_log_action'], $_GET['_wpnonce'])) {
            $action = sanitize_key((string) $_GET['wpins_log_action']);
            if (wp_verify_nonce((string) $_GET['_wpnonce'], 'wpins-log-' . $action)) {
                if ($action === 'clear') {
                    Logger::clear();
                    $notice = 'Log cleared.';
                } elseif ($action === 'pause') {
                    Logger::set_paused(true);
                    $notice = 'Logging paused.';
                } elseif ($action === 'resume') {
                    Logger::set_paused(false);
                    $notice = 'Logging resumed.';
                }
            }
        }

        $paused = Logger::is_paused();
        $entries = Logger::all();
        $config = $this->config;

        $host = strtolower((string) parse_url(home_url(), PHP_URL_HOST));
        $css_count = count((array) glob(WP_INSTANT_CACHE_DIR . '/' . md5($host) . '/css/*.css'));
        $queue = get_option('wp_instant_media_queue', []);
        $manifest = get_option(Config::PUBLIC_MEDIA_MANIFEST_OPTION, []);

        $state = [
            ['Deployment', esc_html((string) $config->get('deployment.status', 'live')), (string) $config->get('deployment.status', 'live') === 'live' ? 'ok' : 'warn'],
            ['Connected', $config->get_site_id() !== '' ? 'yes (' . esc_html(substr($config->get_site_id(), 0, 12)) . '…)' : 'no', $config->get_site_id() !== '' ? 'ok' : 'err'],
            ['Image CDN', $config->get('media.offload_images', false) ? 'on' : 'off', $config->get('media.offload_images', false) ? 'ok' : 'warn'],
            ['Video CDN', $config->get('media.offload_video', false) ? 'on' : 'off', $config->get('media.offload_video', false) ? 'ok' : 'warn'],
            ['Own CSS/JS CDN', $config->get('assets.serve_own_from_cdn', false) ? 'on' : 'off', $config->get('assets.serve_own_from_cdn', false) ? 'ok' : 'warn'],
            ['Drop-in', CacheIntegration::is_our_dropin_installed() ? 'installed' : 'missing', CacheIntegration::is_our_dropin_installed() ? 'ok' : 'warn'],
            ['WP_CACHE', (defined('WP_CACHE') && WP_CACHE) ? 'true' : 'not defined', (defined('WP_CACHE') && WP_CACHE) ? 'ok' : 'warn'],
            ['Critical CSS files', (string) $css_count, $css_count > 0 ? 'ok' : 'warn'],
            ['Media queue', (string) (is_array($queue) ? count($queue) : 0), 'ok'],
            ['Direct-R2 proven', (string) (is_array($manifest) ? count($manifest) : 0), 'ok'],
            ['Last config sync', ($ts = (int) get_option('wp_instant_config_synced_at', 0)) ? esc_html(human_time_diff($ts) . ' ago') : 'never', $ts ? 'ok' : 'warn'],
        ];

        if ($notice): ?>
            <div class="wpins-banner wpins-banner--ok"><span><?php echo esc_html($notice); ?></span></div>
        <?php endif; ?>

        <div class="wpins-card">
            <div class="wpins-card-head">
                <span class="wpins-card-icon"><?php echo Icon::render('gauge', 17); ?></span>
                <div class="wpins-card-titles">
                    <h3>Delivery state</h3>
                    <p class="wpins-card-desc">If any row looks wrong, optimization will not reach visitors. Check <code>X-WP-Instant-Pipeline</code> response header for the live gate on any page.</p>
                </div>
                <div style="margin-left:auto;display:flex;gap:8px;">
                    <?php if ($paused): ?>
                        <a class="button" href="<?php echo esc_url(wp_nonce_url(admin_url('admin.php?page=wp-instant-logs&wpins_log_action=resume'), 'wpins-log-resume', '_wpnonce')); ?>">Resume logging</a>
                    <?php else: ?>
                        <a class="button" href="<?php echo esc_url(wp_nonce_url(admin_url('admin.php?page=wp-instant-logs&wpins_log_action=pause'), 'wpins-log-pause', '_wpnonce')); ?>">Pause logging</a>
                    <?php endif; ?>
                    <a class="button" href="<?php echo esc_url(wp_nonce_url(admin_url('admin.php?page=wp-instant-logs&wpins_log_action=clear'), 'wpins-log-clear', '_wpnonce')); ?>">Clear log</a>
                </div>
            </div>
            <div class="wpins-card-body">
                <table class="widefat striped" style="max-width:980px;">
                    <tbody>
                        <?php foreach ($state as [$label, $value, $tone]): ?>
                            <tr>
                                <th style="width:220px;"><?php echo esc_html($label); ?></th>
                                <td>
                                    <span class="wpins-count" style="background:<?php echo $tone === 'ok' ? '#ecfdf3;color:#027a48' : ($tone === 'err' ? '#fef2f2;color:#b91c1c' : '#fffaeb;color:#b54708'); ?>;padding:2px 8px;border-radius:99px;">
                                        <?php echo $value; ?>
                                    </span>
                                </td>
                            </tr>
                        <?php endforeach; ?>
                    </tbody>
                </table>
            </div>
        </div>

        <div class="wpins-card" style="margin-top:16px;">
            <div class="wpins-card-head">
                <span class="wpins-card-icon"><?php echo Icon::render('refresh', 17); ?></span>
                <div class="wpins-card-titles">
                    <h3>Pipeline log <?php echo $paused ? '(paused)' : ''; ?></h3>
                    <p class="wpins-card-desc">Newest first, last <?php echo count($entries); ?> events. Key events: <code>pipeline.bypass-*</code> (why a page was skipped), <code>transform.done</code>, <code>callback.css</code> (edge CSS arrived), <code>css.dispatch</code>, <code>cdn.onboarded</code>, <code>cache.write</code>.</p>
                </div>
            </div>
            <div class="wpins-card-body">
                <?php if ($entries === []): ?>
                    <p style="color:#71717a;font-size:13px;">No events yet — visit the front-end in a logged-out window and refresh this page.</p>
                <?php else: ?>
                    <table class="widefat striped">
                        <thead>
                            <tr>
                                <th style="width:150px;">Time</th>
                                <th style="width:220px;">Event</th>
                                <th>Context</th>
                            </tr>
                        </thead>
                        <tbody>
                            <?php foreach ($entries as $entry):
                                $ctx = '';
                                if (!empty($entry['c']) && is_array($entry['c'])) {
                                    $pairs = [];
                                    foreach ($entry['c'] as $k => $v) {
                                        $pairs[] = esc_html((string) $k) . '=' . esc_html(is_scalar($v) ? (string) $v : wp_json_encode($v));
                                    }
                                    $ctx = implode(' · ', $pairs);
                                }
                            ?>
                                <tr>
                                    <td style="font-family:monospace;font-size:11px;color:#71717a;"><?php echo esc_html(date('Y-m-d H:i:s', (int) ($entry['t'] ?? 0))); ?></td>
                                    <td style="font-family:monospace;font-size:12px;"><?php echo esc_html((string) ($entry['e'] ?? '')); ?></td>
                                    <td style="font-family:monospace;font-size:11px;color:#3f3f46;word-break:break-all;"><?php echo $ctx; ?></td>
                                </tr>
                            <?php endforeach; ?>
                        </tbody>
                    </table>
                <?php endif; ?>
            </div>
        </div>
        <?php
    }
}
