<?php
namespace WPInstant\Admin;

if (!defined('ABSPATH')) {
    exit;
}

/**
 * WP Instant → Cache & Advanced. Page caching, dynamic behavior
 * (prefetch, nonces, cart), the auto-protect safety net, and edge sync.
 */
class Page_Advanced extends Settings_Page {
    protected string $slug = 'wp-instant-advanced';
    protected string $title = 'Cache & Advanced';
    protected string $description = 'Page caching, dynamic optimizations, safety nets and edge synchronization.';

    public static function field_definitions(): array {
        return [
            'caching.enabled' => ['type' => 'bool'],
            'caching.mobile_cache' => ['type' => 'bool'],
            'caching.ttl' => ['type' => 'int', 'min' => 3600, 'max' => 2592000],
            'caching.purge_on_post_update' => ['type' => 'bool'],
            'caching.purge_on_comment' => ['type' => 'bool'],
            'caching.optimize_only_urls' => ['type' => 'str_list'],
            'dynamic.speculation_rules_prerender' => ['type' => 'bool'],
            'dynamic.nonce_ajax_refresh' => ['type' => 'bool'],
            'dynamic.cart_micro_hydration' => ['type' => 'bool'],
            'deployment.auto_degrade' => ['type' => 'bool'],
            'htaccess.enabled' => ['type' => 'bool'],
        ];
    }

    public function render(): void {
        $last_sync = get_option('wp_instant_config_synced_at', 0);
        ?>
        <div class="wpins-grid-2">
            <?php $this->card_open('Page Cache', 'dashicons-database', 'Full-page static caching with edge-cacheable headers — visitors bypass WordPress entirely.'); ?>
                <?php
                $this->toggle('caching', 'enabled', 'Page caching');
                $this->toggle('caching', 'mobile_cache', 'Separate mobile cache', 'Store a mobile and a desktop variant per page');
                $this->range_field('caching', 'ttl', 'Cache lifetime', 3600, 2592000, 3600, 's');
                $this->toggle('caching', 'purge_on_post_update', 'Purge when content changes');
                $this->toggle('caching', 'purge_on_comment', 'Purge on new comments');
                $this->list_field('caching', 'optimize_only_urls', 'Optimize-only URLs', 'When set, only these paths are optimized (wildcards ok). Leave empty for everything.', "/landing/*\n/");
                ?>
            <?php $this->card_close(); ?>

            <?php $this->card_open('Dynamic Optimizations', 'dashicons-randomize', 'Instant-feeling navigation and cached-page hydration.'); ?>
                <?php
                $this->toggle('dynamic', 'speculation_rules_prerender', 'Prefetch on hover', 'Native prerendering of links for near-instant navigation');
                $this->toggle('dynamic', 'nonce_ajax_refresh', 'Refresh form nonces', 'Keeps cached forms and login flows working');
                $this->toggle('dynamic', 'cart_micro_hydration', 'Cart micro-hydration', 'Updates WooCommerce cart badges on cached pages');
                ?>
            <?php $this->card_close(); ?>

            <?php $this->card_open('Safety Nets', 'dashicons-shield-alt', 'Automatic protection against optimization side effects.'); ?>
                <?php
                $this->toggle('deployment', 'auto_degrade', 'Auto-Protect', 'Steps JavaScript aggressiveness down automatically when real-visitor errors spike');
                $this->toggle('htaccess', 'enabled', 'Manage server cache rules', 'Precompressed assets and immutable cache lifetimes (Apache/LiteSpeed)');
                ?>
            <?php $this->card_close(); ?>

            <?php $this->card_open('Edge Sync', 'dashicons-cloud-upload', 'Your settings are mirrored to the WP Instant cloud dashboard automatically. Last synced: ' . ($last_sync ? esc_html(human_time_diff($last_sync) . ' ago') : 'never')); ?>
                <div class="wpins-field">
                    <span class="wpins-field-label">
                        Sync now
                        <small>Pushes the current configuration to the cloud dashboard and refreshes the connection health check.</small>
                    </span>
                    <button type="button" id="wpins-sync-btn" class="button button-secondary">
                        <span class="dashicons dashicons-update"></span> Sync configuration
                    </button>
                </div>
            <?php $this->card_close(); ?>
        </div>

        <script>
        (function() {
            var btn = document.getElementById('wpins-sync-btn');
            if (!btn) return;
            btn.addEventListener('click', function() {
                btn.disabled = true;
                var d = new FormData();
                d.append('action', 'wp_instant_sync_config');
                d.append('nonce', '<?php echo wp_create_nonce('wp_instant_admin'); ?>');
                fetch(ajaxurl, { method: 'POST', body: d })
                    .then(function(r) { return r.json(); })
                    .then(function(res) {
                        if (window.wpinsToast) {
                            window.wpinsToast(res.success ? 'Configuration synced to the cloud dashboard.' : 'Sync failed — check the connection.', res.success ? 'ok' : 'err');
                        }
                        if (res.success) window.location.reload();
                    })
                    .catch(function() { btn.disabled = false; });
            });
        })();
        </script>
        <?php
    }
}
