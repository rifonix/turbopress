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
    protected string $description = 'Optimization template, deployment and real-user performance at a glance.';

    /** The dashboard owns no granular settings — presets only. */
    public static function field_definitions(): array {
        return [];
    }

    /** Status chips in the shell header: deployment mode, edge reachability, auto-protect. */
    protected function render_header_chips(): void {
        $is_test = $this->config->get('deployment.status', 'live') === 'test';
        $edge_ok = get_transient('wp_instant_health_edge');
        $edge_state = is_array($edge_ok) ? (bool) ($edge_ok['ok'] ?? false) : null;
        ?>
        <span class="wpins-pill <?php echo $is_test ? 'wpins-pill--test' : 'wpins-pill--live'; ?>">
            <?php echo $is_test ? 'Test Mode' : 'Live'; ?>
        </span>
        <?php if ($edge_state === true): ?>
            <span class="wpins-pill wpins-pill--live">Edge connected</span>
        <?php elseif ($edge_state === false): ?>
            <span class="wpins-pill wpins-pill--test">Edge unreachable</span>
        <?php endif; ?>
        <?php
        $degrade_state = get_option(\WPInstant\AutoDegrade::OPTION, []);
        if (is_array($degrade_state) && !empty($degrade_state['to'])) :
            ?>
            <span class="wpins-pill wpins-pill--neutral">Auto-Protect: JS stepped down to <?php echo esc_html((string) $degrade_state['to']); ?></span>
        <?php endif;
    }

    public function render_form(): void {
        $config = $this->config;
        $preset = (string) $config->get('preset', 'ludicrous');
        $is_test = $config->get('deployment.status', 'live') === 'test';
        $rum = $this->rum_summary();
        $counts = $this->pipeline_counts();

        $presets = [
            'safe' => ['Safe', 'shield', 'Caching and minification only. No JavaScript changes — guaranteed compatibility.', '100% compatible'],
            'aggressive' => ['Aggressive', 'bolt', 'Critical CSS, deferred scripts, combined CSS and CDN asset delivery.', 'Balanced'],
            'ludicrous' => ['Ludicrous', 'rocket', 'Everything, plus interaction-delayed JavaScript and dynamic nonces.', 'Recommended'],
        ];
        ?>
        <div class="wrap wp-instant-admin-wrap wpins-settings-wrap">
            <?php $this->render_shell_open(); ?>

            <?php if (isset($_GET['connected'])): ?>
                <div class="wpins-banner wpins-banner--ok">
                    <?php echo Icon::render('check'); ?>
                    <span><strong>Connected.</strong> Optimization started in the background — your first critical CSS lands within a couple of minutes.</span>
                </div>
            <?php elseif (isset($_GET['wpins_saved'])): ?>
                <div class="wpins-banner wpins-banner--ok">
                    <?php echo Icon::render('check'); ?>
                    <span><strong>Saved.</strong> Changes were applied to your site and its caches were refreshed.</span>
                </div>
            <?php endif; ?>

            <?php if ($is_test): ?>
            <div class="wpins-banner wpins-banner--warn">
                <?php echo Icon::render('alert'); ?>
                <span><strong>Not deployed to real visitors yet.</strong>
                    <a href="<?php echo esc_url(home_url('/?wpins_preview=1')); ?>" target="_blank" rel="noreferrer">Preview the optimized version</a>,
                    then click <em>Deploy to Visitors</em> when everything looks right.</span>
            </div>
            <?php endif; ?>

            <div class="wpins-page-head">
                <h2>Optimization Template</h2>
                <p>Pick how aggressive the optimization should be. Fine-grained controls live on the other tabs — templates are the fast path.</p>
            </div>

            <!-- Template cards -->
            <div class="wpins-preset-grid">
                <?php foreach ($presets as $id => [$name, $icon, $desc, $tag]): ?>
                <form method="post" action="<?php echo esc_url(admin_url('admin-post.php')); ?>" class="wpins-preset-card <?php echo $preset === $id ? 'wpins-preset-active' : ''; ?>">
                    <?php wp_nonce_field('wp_instant_save_settings', 'wp_instant_nonce'); ?>
                    <input type="hidden" name="action" value="wp_instant_save_settings">
                    <input type="hidden" name="wpins_page" value="<?php echo esc_attr($this->slug); ?>">
                    <input type="hidden" name="wpins_preset" value="<?php echo esc_attr($id); ?>">
                    <?php if ($preset === $id): ?>
                        <span class="wpins-preset-active-chip wpins-pill wpins-pill--live">Active</span>
                    <?php endif; ?>
                    <div class="wpins-preset-head">
                        <span class="wpins-card-icon"><?php echo Icon::render($icon, 17); ?></span>
                        <h4><?php echo esc_html($name); ?></h4>
                        <span class="wpins-preset-tag wpins-pill wpins-pill--neutral"><?php echo esc_html($tag); ?></span>
                    </div>
                    <p><?php echo esc_html($desc); ?></p>
                    <button type="submit" class="wpins-btn <?php echo $preset === $id ? 'wpins-btn--ghost' : 'wpins-btn--primary'; ?>">
                        <?php if ($preset === $id): ?>
                            <?php echo Icon::render('refresh', 14); ?> Re-apply template
                        <?php else: ?>
                            <?php echo Icon::render('arrow', 14); ?> Use this template
                        <?php endif; ?>
                    </button>
                </form>
                <?php endforeach; ?>
            </div>

            <!-- Deployment + quick actions -->
            <div class="wpins-grid-2">
                <div class="wpins-card">
                    <div class="wpins-card-head">
                        <span class="wpins-card-icon"><?php echo Icon::render('cloud', 17); ?></span>
                        <div class="wpins-card-titles"><h3>Deployment</h3><p class="wpins-card-desc">Serve the optimized site to visitors, or hold it back while you test.</p></div>
                    </div>
                    <div class="wpins-card-body wpins-deploy-row">
                        <button type="button" id="wpins-deploy-btn" class="wpins-btn <?php echo $is_test ? 'wpins-btn--primary' : 'wpins-btn--ghost'; ?>" data-target="<?php echo $is_test ? 'live' : 'test'; ?>">
                            <?php if ($is_test): ?>
                                <?php echo Icon::render('rocket', 14); ?> Deploy to Visitors
                            <?php else: ?>
                                <?php echo Icon::render('eye', 14); ?> Enter Test Mode
                            <?php endif; ?>
                        </button>
                        <a class="wpins-btn wpins-btn--ghost" href="<?php echo esc_url(home_url('/?wpins_preview=1')); ?>" target="_blank" rel="noreferrer">
                            <?php echo Icon::render('external', 14); ?> Preview optimized site
                        </a>
                    </div>
                </div>

                <div class="wpins-card">
                    <div class="wpins-card-head">
                        <span class="wpins-card-icon"><?php echo Icon::render('bolt', 17); ?></span>
                        <div class="wpins-card-titles"><h3>Quick Actions</h3><p class="wpins-card-desc">Re-optimize now or clear the caches.</p></div>
                    </div>
                    <div class="wpins-card-body wpins-deploy-row">
                        <button type="button" id="wpins-warm-btn" class="wpins-btn wpins-btn--ghost">
                            <?php echo Icon::render('refresh', 14); ?> Optimize &amp; Warm Cache
                        </button>
                        <button type="button" id="wpins-purge-btn" class="wpins-btn wpins-btn--danger">
                            <?php echo Icon::render('trash', 14); ?> Purge All Caches
                        </button>
                    </div>
                </div>
            </div>

            <!-- RUM + pipeline -->
            <div class="wpins-grid-2">
                <div class="wpins-card">
                    <div class="wpins-card-head">
                        <span class="wpins-card-icon"><?php echo Icon::render('activity', 17); ?></span>
                        <div class="wpins-card-titles"><h3>Real Visitors — last 7 days</h3><p class="wpins-card-desc">Measured in your visitors' browsers by the monitoring beacon.</p></div>
                    </div>
                    <div class="wpins-card-body">
                        <?php if ($rum === null): ?>
                            <p class="wpins-card-desc">No visitor data yet — data appears as soon as the optimized site serves traffic.</p>
                        <?php else: ?>
                            <div class="wpins-grid-2" style="margin-bottom:14px;">
                                <?php $this->render_ring($rum['lcp_p75'], 4000, 'LCP p75', 's', 2500, 4000, 1000); ?>
                                <?php $this->render_ring($rum['cls_p75'], 0.25, 'CLS p75', '', 0.1, 0.25, 1); ?>
                            </div>
                            <div class="wpins-stat-grid">
                                <div class="wpins-stat">
                                    <div class="wpins-stat-value"><?php echo esc_html(number_format_i18n($rum['views'])); ?></div>
                                    <div class="wpins-stat-label">Pageviews</div>
                                </div>
                                <div class="wpins-stat <?php echo $rum['error_rate'] > 1 ? 'wpins-bad' : 'wpins-good'; ?>">
                                    <div class="wpins-stat-value"><?php echo esc_html(number_format_i18n($rum['errors'])); ?></div>
                                    <div class="wpins-stat-label">JS errors · <?php echo esc_html(number_format_i18n($rum['error_rate'], 2)); ?>% rate</div>
                                </div>
                            </div>
                        <?php endif; ?>
                    </div>
                </div>

                <div class="wpins-card">
                    <div class="wpins-card-head">
                        <span class="wpins-card-icon"><?php echo Icon::render('cpu', 17); ?></span>
                        <div class="wpins-card-titles"><h3>Optimization Pipeline</h3><p class="wpins-card-desc">What the engine has generated for this site.</p></div>
                    </div>
                    <div class="wpins-card-body">
                        <div class="wpins-stat-grid">
                            <div class="wpins-stat">
                                <div class="wpins-stat-value"><?php echo esc_html(number_format_i18n($counts['css_pages'])); ?></div>
                                <div class="wpins-stat-label">Pages with critical CSS</div>
                            </div>
                            <div class="wpins-stat">
                                <div class="wpins-stat-value"><?php echo esc_html(number_format_i18n($counts['cached_pages'])); ?></div>
                                <div class="wpins-stat-label">Cached pages</div>
                            </div>
                            <div class="wpins-stat">
                                <div class="wpins-stat-value"><?php echo esc_html(number_format_i18n($counts['media_queue'])); ?></div>
                                <div class="wpins-stat-label">CDN images queued</div>
                            </div>
                            <div class="wpins-stat">
                                <div class="wpins-stat-value"><?php echo esc_html(number_format_i18n($counts['bundles'])); ?></div>
                                <div class="wpins-stat-label">Combined CSS bundles</div>
                            </div>
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
                btn.classList.add('is-busy');
                var d = new FormData();
                d.append('action', action);
                d.append('nonce', nonce);
                if (extra) { for (var k in extra) { d.append(k, extra[k]); } }
                return fetch(ajaxurl, { method: 'POST', body: d })
                    .then(function(r) { return r.json(); })
                    .finally(function() { btn.disabled = false; btn.classList.remove('is-busy'); });
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
     * Ring gauge for a p75 metric against its Core Web Vitals thresholds.
     * Fraction fills toward $max; color flips good → warn → poor.
     */
    private function render_ring(?float $value, float $max, string $label, string $suffix, float $good, float $poor, float $divisor): void {
        $radius = 24;
        $circumference = 2 * M_PI * $radius;
        if ($value === null) {
            $fraction = 0.0;
            $display = '—';
            $color = '#d4d4d8';
        } else {
            $scaled = $value / $divisor;
            $fraction = max(0.0, min(1.0, $value / $max));
            $display = $divisor === 1000.0
                ? number_format($scaled, 1) . $suffix
                : number_format($scaled, 2) . $suffix;
            $color = $value <= $good ? '#16a34a' : ($value <= $poor ? '#f59e0b' : '#dc2626');
        }
        $offset = $circumference * (1 - $fraction);
        ?>
        <div class="wpins-ring-wrap">
            <div class="wpins-ring">
                <svg width="56" height="56" viewBox="0 0 56 56">
                    <circle class="wpins-ring-track" cx="28" cy="28" r="<?php echo (int) $radius; ?>" fill="none" stroke-width="5"/>
                    <circle class="wpins-ring-value" cx="28" cy="28" r="<?php echo (int) $radius; ?>" fill="none"
                        stroke="<?php echo esc_attr($color); ?>" stroke-width="5" stroke-linecap="round"
                        stroke-dasharray="<?php echo esc_attr(number_format($circumference, 2)); ?>"
                        stroke-dashoffset="<?php echo esc_attr(number_format($offset, 2)); ?>"/>
                </svg>
                <span class="wpins-ring-num"><?php echo esc_html($display); ?></span>
            </div>
            <div>
                <div class="wpins-field-label"><?php echo esc_html($label); ?></div>
                <div class="wpins-field-note"><?php echo esc_html($label === 'LCP p75' ? 'Good ≤ 2.5s' : 'Good ≤ 0.10'); ?></div>
            </div>
        </div>
        <?php
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
