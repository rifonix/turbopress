<?php
namespace Turbopress;

if (!defined('ABSPATH')) {
    exit;
}

class AdminPage {
    private static ?AdminPage $instance = null;
    private Config $config;
    private ApiClient $api_client;
    private CacheManager $cache_manager;

    public static function get_instance(): AdminPage {
        if (self::$instance === null) {
            self::$instance = new self();
        }
        return self::$instance;
    }

    public function init(Config $config, ApiClient $api_client, CacheManager $cache_manager): void {
        $this->config = $config;
        $this->api_client = $api_client;
        $this->cache_manager = $cache_manager;

        add_action('admin_menu', [$this, 'register_menu']);
        add_action('admin_enqueue_scripts', [$this, 'enqueue_assets']);
        add_action('wp_ajax_turbopress_save_settings', [$this, 'ajax_save_settings']);
        add_action('wp_ajax_turbopress_purge_cache', [$this, 'ajax_purge_cache']);
        add_action('wp_ajax_turbopress_disconnect', [$this, 'ajax_disconnect']);
    }

    public function register_menu(): void {
        add_menu_page(
            'Turbopress Optimizer',
            'Turbopress',
            'manage_options',
            'turbopress',
            [$this, 'render_admin_page'],
            'dashicons-performance',
            58
        );
    }

    public function enqueue_assets(string $hook): void {
        if (strpos($hook, 'turbopress') === false) {
            return;
        }

        wp_enqueue_style(
            'turbopress-admin-css',
            TURBOPRESS_URL . 'assets/css/admin-dashboard.css',
            [],
            TURBOPRESS_VERSION
        );
    }

    public function render_admin_page(): void {
        $is_connected = $this->config->is_connected();
        $api_key = $this->config->get_api_key();
        $site_id = $this->config->get_site_id();
        $connect_url = Handshake::generate_connect_url();
        $current_preset = $this->config->get('preset', 'ludicrous');
        $caching_enabled = $this->config->get('caching.enabled', true);
        $critical_css_enabled = $this->config->get('critical_css.enabled', true);
        $js_delay_enabled = $this->config->get('javascript.execution_mode', 'interaction_delay') === 'interaction_delay';
        $speculation_enabled = $this->config->get('dynamic.speculation_rules_prerender', true);
        $nonce_refresh_enabled = $this->config->get('dynamic.nonce_ajax_refresh', true);

        ?>
        <div class="wrap turbopress-admin-wrap">
            <div class="tp-header">
                <div class="tp-logo-block">
                    <span class="tp-badge">SpeedForge Engine</span>
                    <h1>⚡ Turbopress Optimizer</h1>
                    <p class="tp-subtitle">High-performance zero-DNS edge optimization & dynamic DOM transformation</p>
                </div>
                <div class="tp-header-actions">
                    <button type="button" id="tp-purge-cache-btn" class="button button-secondary">
                        🧹 Purge Static Cache
                    </button>
                </div>
            </div>

            <!-- Connection Status Banner -->
            <div class="tp-card tp-status-card <?php echo $is_connected ? 'connected' : 'disconnected'; ?>">
                <div class="tp-card-content">
                    <div class="tp-status-indicator">
                        <span class="tp-dot"></span>
                        <div class="tp-status-text">
                            <h3><?php echo $is_connected ? 'Connected to Cloudflare Edge' : 'Edge Pipeline Disconnected'; ?></h3>
                            <p><?php echo $is_connected ? 'Site ID: <code>' . esc_html($site_id) . '</code> | API Key: <code>' . esc_html(substr($api_key, 0, 12)) . '...</code>' : 'Connect to the Turbopress SaaS Control Plane for automated Critical CSS, LCP preloading, and Edge Workers.'; ?></p>
                        </div>
                    </div>
                    <div class="tp-status-action">
                        <?php if ($is_connected): ?>
                            <button type="button" id="tp-disconnect-btn" class="button button-link-delete">Disconnect</button>
                        <?php else: ?>
                            <a href="<?php echo esc_url($connect_url); ?>" class="button button-primary tp-connect-btn">
                                🔗 1-Click Connect to Turbopress
                            </a>
                        <?php endif; ?>
                    </div>
                </div>
            </div>

            <!-- Master Preset Selector -->
            <div class="tp-card">
                <h2>🎯 Master Performance Preset</h2>
                <p class="tp-desc">Choose a pre-tuned configuration profile or customize granular rules below.</p>

                <div class="tp-presets-grid">
                    <label class="tp-preset-box <?php echo $current_preset === 'safe' ? 'active' : ''; ?>">
                        <input type="radio" name="tp_preset" value="safe" <?php checked($current_preset, 'safe'); ?>>
                        <div class="tp-preset-content">
                            <span class="tp-preset-tag">Safe Mode</span>
                            <h4>Standard Cache & Defer</h4>
                            <p>Sub-15ms page caching, basic script deferral, image dimensions, and instant prerendering. 100% theme compatibility guarantee.</p>
                        </div>
                    </label>

                    <label class="tp-preset-box <?php echo $current_preset === 'aggressive' ? 'active' : ''; ?>">
                        <input type="radio" name="tp_preset" value="aggressive" <?php checked($current_preset, 'aggressive'); ?>>
                        <div class="tp-preset-content">
                            <span class="tp-preset-tag">Aggressive (90+ Score)</span>
                            <h4>Critical CSS + Next-Gen Media</h4>
                            <p>Edge Critical CSS inlining, automatic LCP image priority preload, Next-Gen image negotiation, and speculative prerender.</p>
                        </div>
                    </label>

                    <label class="tp-preset-box <?php echo $current_preset === 'ludicrous' ? 'active' : ''; ?>">
                        <input type="radio" name="tp_preset" value="ludicrous" <?php checked($current_preset, 'ludicrous'); ?>>
                        <div class="tp-preset-content">
                            <span class="tp-preset-tag tp-tag-gold">Ludicrous Speed (98-100 Score)</span>
                            <h4>3-Tier JS Delay + Micro-Hydration</h4>
                            <p>Interaction-based JavaScript execution with jQuery queueing, zero-breakage nonce hydration, and full edge optimization.</p>
                        </div>
                    </label>
                </div>
            </div>

            <!-- Granular Feature Switches -->
            <div class="tp-card">
                <h2>⚙️ Optimization Modules</h2>
                <form id="tp-settings-form">
                    <table class="form-table tp-table">
                        <tr>
                            <th scope="row">Drop-In Page Caching</th>
                            <td>
                                <label class="tp-switch">
                                    <input type="checkbox" name="caching_enabled" value="1" <?php checked($caching_enabled); ?>>
                                    <span class="tp-slider"></span>
                                </label>
                                <span class="tp-label-desc">Sub-15ms TTFB delivery via <code>advanced-cache.php</code> bypassing WordPress core.</span>
                            </td>
                        </tr>
                        <tr>
                            <th scope="row">Edge Critical CSS</th>
                            <td>
                                <label class="tp-switch">
                                    <input type="checkbox" name="critical_css_enabled" value="1" <?php checked($critical_css_enabled); ?>>
                                    <span class="tp-slider"></span>
                                </label>
                                <span class="tp-label-desc">Extract above-the-fold CSS via Cloudflare Browser Rendering and defer non-critical styles.</span>
                            </td>
                        </tr>
                        <tr>
                            <th scope="row">3-Tier JS Delay Engine</th>
                            <td>
                                <label class="tp-switch">
                                    <input type="checkbox" name="js_delay_enabled" value="1" <?php checked($js_delay_enabled); ?>>
                                    <span class="tp-slider"></span>
                                </label>
                                <span class="tp-label-desc">Delays non-critical scripts until first user interaction or safety timer (3.5s). Stubs jQuery & <code>$()</code> to prevent errors.</span>
                            </td>
                        </tr>
                        <tr>
                            <th scope="row">Speculation Rules API</th>
                            <td>
                                <label class="tp-switch">
                                    <input type="checkbox" name="speculation_enabled" value="1" <?php checked($speculation_enabled); ?>>
                                    <span class="tp-slider"></span>
                                </label>
                                <span class="tp-label-desc">W3C browser prerendering for instantaneous &lt;50ms link transitions.</span>
                            </td>
                        </tr>
                        <tr>
                            <th scope="row">Dynamic Nonce & Cart Micro-Hydration</th>
                            <td>
                                <label class="tp-switch">
                                    <input type="checkbox" name="nonce_refresh_enabled" value="1" <?php checked($nonce_refresh_enabled); ?>>
                                    <span class="tp-slider"></span>
                                </label>
                                <span class="tp-label-desc">Asynchronously refreshes WordPress nonces and WooCommerce cart badges client-side, preventing expired form errors.</span>
                            </td>
                        </tr>
                    </table>

                    <div class="tp-form-footer">
                        <button type="submit" class="button button-primary button-large" id="tp-save-btn">
                            Save Changes
                        </button>
                        <span id="tp-save-status" class="tp-status-msg"></span>
                    </div>
                </form>
            </div>
        </div>

        <script>
        document.addEventListener('DOMContentLoaded', function() {
            const form = document.getElementById('tp-settings-form');
            const saveBtn = document.getElementById('tp-save-btn');
            const saveStatus = document.getElementById('tp-save-status');
            const purgeBtn = document.getElementById('tp-purge-cache-btn');
            const disconnectBtn = document.getElementById('tp-disconnect-btn');

            // Preset Switcher
            document.querySelectorAll('input[name="tp_preset"]').forEach(radio => {
                radio.addEventListener('change', function() {
                    document.querySelectorAll('.tp-preset-box').forEach(b => b.classList.remove('active'));
                    this.closest('.tp-preset-box').classList.add('active');
                });
            });

            // Save Settings
            form.addEventListener('submit', function(e) {
                e.preventDefault();
                saveBtn.disabled = true;
                saveStatus.textContent = 'Saving...';
                saveStatus.style.color = '#666';

                const preset = document.querySelector('input[name="tp_preset"]:checked').value;
                const caching = document.querySelector('input[name="caching_enabled"]').checked;
                const criticalCss = document.querySelector('input[name="critical_css_enabled"]').checked;
                const jsDelay = document.querySelector('input[name="js_delay_enabled"]').checked;
                const speculation = document.querySelector('input[name="speculation_enabled"]').checked;
                const nonceRefresh = document.querySelector('input[name="nonce_refresh_enabled"]').checked;

                const data = new FormData();
                data.append('action', 'turbopress_save_settings');
                data.append('nonce', '<?php echo wp_create_nonce('turbopress_admin'); ?>');
                data.append('preset', preset);
                data.append('caching_enabled', caching ? '1' : '0');
                data.append('critical_css_enabled', criticalCss ? '1' : '0');
                data.append('js_delay_enabled', jsDelay ? '1' : '0');
                data.append('speculation_enabled', speculation ? '1' : '0');
                data.append('nonce_refresh_enabled', nonceRefresh ? '1' : '0');

                fetch(ajaxurl, {
                    method: 'POST',
                    body: data
                })
                .then(r => r.json())
                .then(res => {
                    saveBtn.disabled = false;
                    if (res.success) {
                        saveStatus.textContent = '✓ Saved successfully';
                        saveStatus.style.color = '#10b981';
                        setTimeout(() => { saveStatus.textContent = ''; }, 3000);
                    } else {
                        saveStatus.textContent = '✗ Error: ' + (res.data || 'Failed to save');
                        saveStatus.style.color = '#ef4444';
                    }
                })
                .catch(() => {
                    saveBtn.disabled = false;
                    saveStatus.textContent = '✗ Request failed';
                    saveStatus.style.color = '#ef4444';
                });
            });

            // Purge Cache
            if (purgeBtn) {
                purgeBtn.addEventListener('click', function() {
                    purgeBtn.disabled = true;
                    purgeBtn.textContent = 'Purging...';

                    const data = new FormData();
                    data.append('action', 'turbopress_purge_cache');
                    data.append('nonce', '<?php echo wp_create_nonce('turbopress_admin'); ?>');

                    fetch(ajaxurl, {
                        method: 'POST',
                        body: data
                    })
                    .then(r => r.json())
                    .then(res => {
                        purgeBtn.disabled = false;
                        purgeBtn.textContent = '🧹 Purge Static Cache';
                        alert(res.success ? 'Static cache purged successfully!' : 'Error purging cache.');
                    });
                });
            }

            // Disconnect
            if (disconnectBtn) {
                disconnectBtn.addEventListener('click', function() {
                    if (!confirm('Are you sure you want to disconnect from Turbopress SaaS?')) return;

                    const data = new FormData();
                    data.append('action', 'turbopress_disconnect');
                    data.append('nonce', '<?php echo wp_create_nonce('turbopress_admin'); ?>');

                    fetch(ajaxurl, {
                        method: 'POST',
                        body: data
                    })
                    .then(r => r.json())
                    .then(() => {
                        location.reload();
                    });
                });
            }
        });
        </script>
        <?php
    }

    public function ajax_save_settings(): void {
        check_ajax_referer('turbopress_admin', 'nonce');

        if (!current_user_can('manage_options')) {
            wp_send_json_error('Unauthorized');
        }

        $preset = sanitize_text_field($_POST['preset'] ?? 'ludicrous');
        $caching_enabled = !empty($_POST['caching_enabled']);
        $critical_css_enabled = !empty($_POST['critical_css_enabled']);
        $js_delay_enabled = !empty($_POST['js_delay_enabled']);
        $speculation_enabled = !empty($_POST['speculation_enabled']);
        $nonce_refresh_enabled = !empty($_POST['nonce_refresh_enabled']);

        $config_data = $this->config->get_all();
        $config_data['preset'] = $preset;
        $config_data['caching']['enabled'] = $caching_enabled;
        $config_data['critical_css']['enabled'] = $critical_css_enabled;
        $config_data['javascript']['execution_mode'] = $js_delay_enabled ? 'interaction_delay' : 'defer';
        $config_data['dynamic']['speculation_rules_prerender'] = $speculation_enabled;
        $config_data['dynamic']['nonce_ajax_refresh'] = $nonce_refresh_enabled;

        $this->config->save($config_data);
        CacheManager::purge_all_static();

        wp_send_json_success();
    }

    public function ajax_purge_cache(): void {
        check_ajax_referer('turbopress_admin', 'nonce');

        if (!current_user_can('manage_options')) {
            wp_send_json_error('Unauthorized');
        }

        CacheManager::purge_all_static();
        wp_send_json_success();
    }

    public function ajax_disconnect(): void {
        check_ajax_referer('turbopress_admin', 'nonce');

        if (!current_user_can('manage_options')) {
            wp_send_json_error('Unauthorized');
        }

        $this->config->set_api_key('');
        $this->config->set_site_id('');
        CacheManager::purge_all_static();

        wp_send_json_success();
    }
}
