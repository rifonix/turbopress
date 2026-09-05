<?php
namespace WPInstant\Admin;

use WPInstant\Telemetry;

if (!defined('ABSPATH')) {
    exit;
}

/**
 * WP Instant → Dashboard.
 *
 * The simple view: template (preset) selection, deployment status and
 * controls, real-user monitoring stats and quick actions. Every granular
 * control lives on the dedicated sub-pages — this page stays scannable.
 */
class Page_Dashboard extends Settings_Page {
    protected string $slug = 'wp-instant';
    protected string $title = 'Dashboard';
    protected string $description = '';

    /** The dashboard owns no granular settings — presets only. */
    public static function field_definitions(): array {
        return [];
    }

    public function render_form(): void {
        $config = $this->config;
        $preset = (string) $config->get('preset', 'ludicrous');
        $is_test = $config->get('deployment.status', 'live') === 'test';
        $connected = $config->is_connected();
        $edge_ok = get_transient('wp_instant_health_edge');
        $edge_state = is_array($edge_ok) ? (bool) ($edge_ok['ok'] ?? false) : null;
        $rum = $this->rum_summary();
        $counts = $this->pipeline_counts();

        $presets = [
            'safe' => ['Safe', 'dashicons-shield-alt', 'Caching and minification only. No JavaScript changes — guaranteed compatibility.', '100% compat'],
            'aggressive' => ['Aggressive', 'dashicons-performance', 'Critical CSS, deferred scripts, combined CSS and CDN asset delivery.', 'Balanced'],
            'ludicrous' => ['Ludicrous', 'dashicons-superhero', 'Everything, plus interaction-delayed JavaScript and dynamic nonces.', 'Recommended'],
        ];
        ?>
        <div class="wrap wp-instant-admin-wrap wpins-settings-wrap">
            <?php if (isset($_GET['connected'])): ?>
                <div class="notice notice-success is-dismissible" style="margin:0 0 14px;">
                    <p><strong>Connected.</strong> Optimization started in the background — your first critical CSS lands within a couple of minutes.</p>
                </div>
            <?php elseif (isset($_GET['wpins_saved'])): ?>
                <div class="notice notice-success is-dismissible" style="margin:0 0 14px;">
                    <p><strong>Saved.</strong> Changes were applied to your site and its caches were refreshed.</p>
                </div>
            <?php endif; ?>

            <!-- Status strip -->
            <div class="wpins-stat-strip">
                <span class="wpins-pill <?php echo $is_test ? 'wpins-pill--test' : 'wpins-pill--live'; ?>">
                    <?php echo $is_test ? 'Test Mode — visitors see the unoptimized site' : 'Live — visitors get the optimized site'; ?>
                </span>
                <?php if ($edge_state === true): ?>
                    <span class="wpins-pill wpins-pill--live">Edge reachable</span>
                <?php elseif ($edge_state === false): ?>
                    <span class="wpins-pill wpins-pill--warn">Edge unreachable</span>
                <?php endif; ?>
                <?php
                $degrade_state = get_option(\WPInstant\AutoDegrade::OPTION, []);
                if (is_array($degrade_state) && !empty($degrade_state['to'])) :
                    ?>
                    <span class="wpins-pill wpins-pill--neutral">Auto-Protect: JS stepped down to <?php echo esc_html((string) $degrade_state['to']); ?></span>
                <?php endif; ?>
            </div>

            <?php if ($is_test): ?>
            <div class="wpins-banner wpins-banner--warn">
                <span class="dashicons dashicons-warning"></span>
                <div>
                    <strong>Not deployed to real visitors yet.</strong>
                    <a href="<?php echo esc_url(home_url('/?wpins_preview=1')); ?>" target="_blank" rel="noreferrer">Test the optimized version</a>,
                    then click <em>Deploy to Visitors</em> when everything looks right.
                </div>
            </div>
            <?php endif; ?>

            <div class="wpins-page-head">
                <h1>Optimization Template</h1>
                <p>Pick how aggressive the optimization should be. Fine-grained controls live on the sub-pages — templates are the fast path.</p>
            </div>

            <!-- Template cards -->
            <div class="wpins-preset-grid">
                <?php foreach ($presets as $id => [$name, $icon, $desc, $tag]): ?>
                <form method="post" action="<?php echo esc_url(admin_url('admin-post.php')); ?>" class="wpins-preset-card <?php echo $preset === $id ? 'is-active' : ''; ?>">
                    <?php wp_nonce_field('wp_instant_save_settings', 'wp_instant_nonce'); ?>
                    <input type="hidden" name="action" value="wp_instant_save_settings">
                    <input type="hidden" name="wpins_page" value="<?php echo esc_attr($this->slug); ?>">
                    <input type="hidden" name="wpins_preset" value="<?php echo esc_attr($id); ?>">
                    <div class="wpins-preset-head">
                        <span class="dashicons <?php echo esc_attr($icon); ?>"></span>
                        <strong><?php echo esc_html($name); ?></strong>
                        <?php if ($preset === $id): ?><span class="wpins-preset-active">Active</span><?php endif; ?>
                    </div>
                    <p><?php echo esc_html($desc); ?></p>
                    <span class="wpins-preset-tag"><?php echo esc_html($tag); ?></span>
                    <button type="submit" class="button <?php echo $preset === $id ? 'button-secondary' : 'button-primary'; ?>">
                        <?php echo $preset === $id ? 'Re-apply template' : 'Use this template'; ?>
                    </button>
                </form>
                <?php endforeach; ?>
            </div>

            <!-- Deployment + quick actions -->
            <div class="wpins-grid-2">
                <div class="wpins-card">
                    <div class="wpins-card-head">
                        <span class="dashicons dashicons-cloud"></span>
                        <div><h2>Deployment</h2><p>Serve the optimized site to visitors, or hold it back while you test.</p></div>
                    </div>
                    <div class="wpins-card-body wpins-deploy-row">
                        <button type="button" id="wpins-deploy-btn" class="button <?php echo $is_test ? 'button-primary' : 'button-secondary'; ?>" data-target="<?php echo $is_test ? 'live' : 'test'; ?>">
                            <?php echo $is_test
                                ? '<span class="dashicons dashicons-yes-alt"></span> Deploy to Visitors'
                                : '<span class="dashicons dashicons-lab"></span> Enter Test Mode'; ?>
                        </button>
                        <a class="button button-secondary" href="<?php echo esc_url(home_url('/?wpins_preview=1')); ?>" target="_blank" rel="noreferrer">
                            <span class="dashicons dashicons-visibility"></span> Preview optimized site
                        </a>
                    </div>
                </div>

                <div class="wpins-card">
                    <div class="wpins-card-head">
                        <span class="dashicons dashicons-controls-play"></span>
                        <div><h2>Quick Actions</h2><p>Re-optimize now or clear the caches.</p></div>
                    </div>
                    <div class="wpins-card-body wpins-deploy-row">
                        <button type="button" id="wpins-warm-btn" class="button button-secondary">
                            <span class="dashicons dashicons-update"></span> Optimize &amp; Warm Cache
                        </button>
                        <button type="button" id="wpins-purge-btn" class="button button-secondary">
                            <span class="dashicons dashicons-trash"></span> Purge All Caches
                        </button>
                    </div>
                </div>
            </div>

            <!-- RUM + pipeline -->
            <div class="wpins-grid-2">
                <div class="wpins-card">
                    <div class="wpins-card-head">
                        <span class="dashicons dashicons-chart-line"></span>
                        <div><h2>Real Visitors (last 7 days)</h2><p>Measured in your visitors' browsers by the monitoring beacon.</p></div>
                    </div>
                    <div class="wpins-card-body">
                        <?php if ($rum === null): ?>
                            <p class="wpins-muted">No visitor data yet — data appears as soon as the optimized site serves traffic.</p>
                        <?php else: ?>
                            <div class="wpins-stat-grid">
                                <div class="wpins-stat"><span>Pageviews</span><strong><?php echo esc_html(number_format_i18n($rum['views'])); ?></strong></div>
                                <div class="wpins-stat"><span>JS errors</span><strong class="<?php echo $rum['error_rate'] > 1 ? 'wpins-bad' : 'wpins-good'; ?>"><?php echo esc_html(number_format_i18n($rum['errors'])); ?></strong><small><?php echo esc_html(number_format_i18n($rum['error_rate'], 2)); ?>% rate</small></div>
                                <div class="wpins-stat"><span>LCP p75</span><strong><?php echo $rum['lcp_p75'] !== null ? esc_html(number_format_i18n($rum['lcp_p75'] / 1000, 2)) . 's' : '—'; ?></strong></div>
                                <div class="wpins-stat"><span>CLS p75</span><strong><?php echo $rum['cls_p75'] !== null ? esc_html(number_format_i18n($rum['cls_p75'], 3)) : '—'; ?></strong></div>
                            </div>
                        <?php endif; ?>
                    </div>
                </div>

                <div class="wpins-card">
                    <div class="wpins-card-head">
                        <span class="dashicons dashicons-database"></span>
                        <div><h2>Optimization Pipeline</h2><p>What the engine has generated for this site.</p></div>
                    </div>
                    <div class="wpins-card-body">
                        <div class="wpins-stat-grid">
                            <div class="wpins-stat"><span>Pages with critical CSS</span><strong><?php echo esc_html(number_format_i18n($counts['css_pages'])); ?></strong></div>
                            <div class="wpins-stat"><span>Cached pages</span><strong><?php echo esc_html(number_format_i18n($counts['cached_pages'])); ?></strong></div>
                            <div class="wpins-stat"><span>CDN images queued</span><strong><?php echo esc_html(number_format_i18n($counts['media_queue'])); ?></strong></div>
                            <div class="wpins-stat"><span>Combined CSS bundles</span><strong><?php echo esc_html(number_format_i18n($counts['bundles'])); ?></strong></div>
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <script>
        (function() {
            var nonce = '<?php echo wp_create_nonce('wp_instant_admin'); ?>';
            var post = function(action, btn, extra) {
                btn.disabled = true;
                var d = new FormData();
                d.append('action', action);
                d.append('nonce', nonce);
                if (extra) { for (var k in extra) { d.append(k, extra[k]); } }
                return fetch(ajaxurl, { method: 'POST', body: d })
                    .then(function(r) { return r.json(); })
                    .finally(function() { btn.disabled = false; });
            };

            var deploy = document.getElementById('wpins-deploy-btn');
            if (deploy) {
                deploy.addEventListener('click', function() {
                    var goingLive = deploy.dataset.target === 'live';
                    if (goingLive && !confirm('Deploy the optimized website to ALL visitors now?\n\nMake sure you tested the optimized site with "Preview optimized site" first.')) return;
                    // Always send the explicit target: the server rejects a
                    // missing/invalid status instead of assuming 'live'.
                    post('wp_instant_deploy', deploy, { status: goingLive ? 'live' : 'test' }).then(function(res) {
                        if (res.success) { window.location.reload(); }
                        else if (window.wpinsToast) { window.wpinsToast(res.data || 'Failed', 'err'); }
                    });
                });
            }

            var warm = document.getElementById('wpins-warm-btn');
            if (warm) {
                warm.addEventListener('click', function() {
                    post('wp_instant_warm_cache', warm).then(function(res) {
                        if (!window.wpinsToast) return;
                        if (res.success) { window.wpinsToast('Optimization started — pages are being optimized and cached in the background.', 'ok'); }
                        else if (res.data === 'test_mode') { window.wpinsToast('Disabled in Test Mode. Deploy to visitors first.', 'warn'); }
                        else { window.wpinsToast('Failed to start.', 'err'); }
                    });
                });
            }

            var purge = document.getElementById('wpins-purge-btn');
            if (purge) {
                purge.addEventListener('click', function() {
                    post('wp_instant_purge_cache', purge).then(function(res) {
                        if (window.wpinsToast) { window.wpinsToast(res.success ? 'All caches purged.' : 'Purge failed.', res.success ? 'ok' : 'err'); }
                    });
                });
            }
        })();
        </script>
        <?php
    }

    public function render(): void {
        // Unused — render_form() is fully custom for this page.
    }

    /**
     * Real-user summary over the local telemetry window: total views,
     * errors, error rate and the latest day's LCP/CLS p75.
     */
    private function rum_summary(): ?array {
        $agg = Telemetry::aggregate();
        $days = $agg['days'] ?? [];
        if ($days === []) {
            return null;
        }

        $views = 0;
        $errors = 0;
        foreach ($days as $day) {
            foreach (($day['modes'] ?? []) as $bucket) {
                $views += (int) ($bucket['views'] ?? 0);
                $errors += (int) ($bucket['errors'] ?? 0);
            }
        }
        if ($views === 0) {
            return null;
        }

        // Latest day's p75 values across modes.
        $latest = $days[count($days) - 1];
        $lcp = null;
        $cls = null;
        foreach (($latest['modes'] ?? []) as $bucket) {
            if ($bucket['lcpP75'] !== null && ($lcp === null || $bucket['lcpP75'] > $lcp)) {
                $lcp = (int) $bucket['lcpP75'];
            }
            if ($bucket['clsP75'] !== null && ($cls === null || $bucket['clsP75'] > $cls)) {
                $cls = (float) $bucket['clsP75'];
            }
        }

        return [
            'views' => $views,
            'errors' => $errors,
            'error_rate' => ($errors / $views) * 100,
            'lcp_p75' => $lcp,
            'cls_p75' => $cls,
        ];
    }

    /** Cheap pipeline counters for the stats card. */
    private function pipeline_counts(): array {
        $host_hash = md5(wp_parse_url(home_url(), PHP_URL_HOST) ?: '');

        $css_pages = 0;
        $css_dir = WP_INSTANT_CACHE_DIR . '/' . $host_hash . '/css';
        if (is_dir($css_dir)) {
            foreach (glob($css_dir . '/*.css') ?: [] as $file) {
                // Each URL+viewport pair is one file: 2 files ≈ 1 page.
                $css_pages++;
            }
            $css_pages = (int) ceil($css_pages / 2);
        }

        $cached_pages = 0;
        try {
            $pages_dir = WP_INSTANT_PAGES_DIR . '/' . $host_hash;
            if (is_dir($pages_dir)) {
                $iterator = new \RecursiveIteratorIterator(
                    new \RecursiveDirectoryIterator($pages_dir, \FilesystemIterator::SKIP_DOTS),
                    \RecursiveIteratorIterator::LEAVES_ONLY
                );
                foreach ($iterator as $file) {
                    if (substr($file->getFilename(), -5) === '.html') {
                        $cached_pages++;
                    }
                    if ($cached_pages >= 5000) {
                        break; // bounded scan
                    }
                }
            }
        } catch (\Throwable $e) {
            // counting is cosmetic — never block the page
        }

        $media_queue = 0;
        $queue = get_option('wp_instant_media_queue', []);
        if (is_array($queue)) {
            $media_queue = count($queue);
        }

        $bundles = 0;
        $bundle_dir = WP_INSTANT_CACHE_DIR . '/' . $host_hash . '/combined';
        if (is_dir($bundle_dir)) {
            $bundles = count(glob($bundle_dir . '/wpins-*.css') ?: []);
        }

        return [
            'css_pages' => $css_pages,
            'cached_pages' => $cached_pages,
            'media_queue' => $media_queue,
            'bundles' => $bundles,
        ];
    }
}
