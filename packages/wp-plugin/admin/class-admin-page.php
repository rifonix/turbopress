<?php
namespace Turbopress;

if (!defined('ABSPATH')) {
    exit;
}

/**
 * Admin experience: two pages.
 *
 *  - Dashboard (wp-admin/admin.php?page=turbopress): the full SaaS control
 *    panel, embedded full-width via a signed 1h HMAC token. Requires a
 *    connection; otherwise visitors are bounced to the Connect page.
 *  - Connect (wp-admin/admin.php?page=turbopress-connect): local page. When
 *    disconnected it is the onboarding screen; when connected it shows the
 *    connection details and hosts the Disconnect action.
 *
 * Also renders the admin-bar actions (purge this page / purge all caches /
 * warm cache) for logged-in administrators.
 */
class AdminPage {
    private static ?AdminPage $instance = null;
    private Config $config;
    private ApiClient $api_client;
    private CacheManager $cache_manager;
    private HealthCheck $health_check;

    public const PAGE_DASHBOARD = 'turbopress';
    public const PAGE_CONNECT = 'turbopress-connect';
    public const ACTIVATION_REDIRECT_OPTION = 'turbopress_do_activation_redirect';

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
        $this->health_check = new HealthCheck($config, $api_client);

        add_action('admin_menu', [$this, 'register_menu']);
        add_action('admin_enqueue_scripts', [$this, 'enqueue_assets']);
        add_action('admin_init', [$this, 'maybe_redirect_after_activation']);
        add_action('admin_init', [$this, 'guard_pages']);
        add_action('admin_bar_menu', [$this, 'register_admin_bar'], 100);
        add_action('init', [$this, 'handle_admin_bar_action']);
        // Dashicons are not loaded on the front end by default, but the
        // admin-bar actions rely on them.
        add_action('wp_enqueue_scripts', static function (): void {
            if (current_user_can('manage_options')) {
                wp_enqueue_style('dashicons');
            }
        });
        add_action('wp_ajax_turbopress_purge_cache', [$this, 'ajax_purge_cache']);
        add_action('wp_ajax_turbopress_warm_cache', [$this, 'ajax_warm_cache']);
        add_action('wp_ajax_turbopress_deploy', [$this, 'ajax_deploy']);
        add_action('wp_ajax_turbopress_disconnect', [$this, 'ajax_disconnect']);
    }

    /* ------------------------------------------------------------------ */
    /* Routing & lifecycle                                                  */
    /* ------------------------------------------------------------------ */

    public function register_menu(): void {
        add_menu_page(
            'Turbopress',
            'Turbopress',
            'manage_options',
            self::PAGE_DASHBOARD,
            [$this, 'render_dashboard_page'],
            'dashicons-performance',
            58
        );

        add_submenu_page(
            self::PAGE_DASHBOARD,
            'Dashboard',
            'Dashboard',
            'manage_options',
            self::PAGE_DASHBOARD,
            [$this, 'render_dashboard_page']
        );

        add_submenu_page(
            self::PAGE_DASHBOARD,
            'Connect',
            'Connect',
            'manage_options',
            self::PAGE_CONNECT,
            [$this, 'render_connect_page']
        );
    }

    /**
     * After activation, drop the user straight onto the Connect page
     * (or the Dashboard when a connection already exists).
     */
    public function maybe_redirect_after_activation(): void {
        if (!get_option(self::ACTIVATION_REDIRECT_OPTION)) {
            return;
        }

        // Never hijack ajax/cron; leave the flag for the next page load.
        if (wp_doing_ajax() || wp_doing_cron()) {
            return;
        }

        delete_option(self::ACTIVATION_REDIRECT_OPTION);

        if (isset($_GET['activate-multi'])) {
            return;
        }

        $target = $this->config->is_connected()
            ? self::PAGE_DASHBOARD
            : self::PAGE_CONNECT;
        wp_safe_redirect(add_query_arg(['page' => $target], admin_url('admin.php')));
        exit;
    }

    /**
     * Access control: the Dashboard requires a connection. The Connect page
     * stays reachable when connected (it hosts the connection details and
     * the Disconnect action).
     */
    public function guard_pages(): void {
        $screen = isset($_GET['page']) ? sanitize_key($_GET['page']) : '';
        if ($screen === self::PAGE_DASHBOARD && !(new Config())->is_connected()) {
            wp_safe_redirect(add_query_arg(['page' => self::PAGE_CONNECT], admin_url('admin.php')));
            exit;
        }
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

        // Dashicons for the icon-based UI (usually already loaded in admin).
        wp_enqueue_style('dashicons');
    }

    /* ------------------------------------------------------------------ */
    /* Shared JS: toasts + button plumbing                                  */
    /* ------------------------------------------------------------------ */

    private function render_toast_shell(): void {
        ?>
        <div id="tp-toast" class="tp-toast" role="status" aria-live="polite"></div>
        <script>
        window.tpToast = function(message, kind) {
            var el = document.getElementById('tp-toast');
            if (!el) return;
            el.textContent = message;
            el.className = 'tp-toast tp-toast--' + (kind || 'info') + ' tp-toast--show';
            clearTimeout(window.__tpToastTimer);
            window.__tpToastTimer = setTimeout(function() {
                el.className = 'tp-toast';
            }, 4200);
        };

        document.addEventListener('DOMContentLoaded', function() {
            // Toasts queued via redirect (?tp_toast=...).
            var queued = new URLSearchParams(window.location.search).get('tp_toast');
            if (queued === 'warm_test') {
                window.tpToast('Warm Cache is disabled in Test Mode. Deploy to visitors first, then warm the cache.', 'warn');
            } else if (queued === 'warm_ok') {
                window.tpToast('Warm cache started — pages are being optimized and cached in the background.', 'ok');
            }

            // Auto-warm trigger (?warm=1 from the admin bar).
            if (new URLSearchParams(window.location.search).get('warm') === '1') {
                var btn = document.getElementById('tp-warm-btn');
                if (btn) btn.click();
            }
        });
        </script>
        <?php
    }

    /* ------------------------------------------------------------------ */
    /* Dashboard page (embedded SaaS control panel)                         */
    /* ------------------------------------------------------------------ */

    public function render_dashboard_page(): void {
        $config = new Config();
        $site_id = $config->get_site_id();
        $domain = wp_parse_url(home_url(), PHP_URL_HOST) ?: '';
        $is_test = $config->get('deployment.status', 'live') === 'test';
        $preview_url = add_query_arg('tp_preview', '1', home_url('/'));

        // Signed embed token: siteId.expiry.hmac(callback_secret). The
        // edge verifies it, so the iframe needs no Clerk session and no
        // API key exposure in the browser.
        $exp = time() + HOUR_IN_SECONDS;
        $sig = hash_hmac('sha256', $site_id . '.' . $exp, Config::get_callback_secret_static());
        $embed_url = rtrim($config->get_api_url(), '/')
            . '/embed/sites/' . rawurlencode($site_id)
            . '?t=' . rawurlencode($site_id . '.' . $exp . '.' . $sig);
        ?>
        <div class="wrap turbopress-admin-wrap tp-dashboard-wrap">
            <header class="tp-dashboard-bar">
                <div class="tp-dashboard-brand">
                    <span class="dashicons dashicons-performance tp-brand-icon"></span>
                    <div>
                        <strong>Turbopress Control Panel</strong>
                        <span class="tp-dashboard-domain"><?php echo esc_html($domain); ?></span>
                    </div>
                    <span class="tp-pill <?php echo $is_test ? 'tp-pill--test' : 'tp-pill--live'; ?>">
                        <?php echo $is_test ? 'Test Mode' : 'Live'; ?>
                    </span>
                </div>
                <div class="tp-dashboard-actions">
                    <?php if (!empty($_GET['connected'])): ?>
                        <span class="tp-notice-ok"><span class="dashicons dashicons-yes-alt"></span> Connected — optimization started in the background.</span>
                    <?php endif; ?>
                    <a href="<?php echo esc_url($preview_url); ?>" target="_blank" rel="noopener" class="tp-btn tp-btn--ghost">
                        <span class="dashicons dashicons-visibility"></span> Preview Cached Website
                    </a>
                    <button type="button" id="tp-purge-cache-btn" class="tp-btn tp-btn--ghost">
                        <span class="dashicons dashicons-trash"></span> Purge All Cache
                    </button>
                    <button type="button" id="tp-warm-btn" class="tp-btn tp-btn--ghost">
                        <span class="dashicons dashicons-update"></span> Warm Cache
                    </button>
                    <?php if ($is_test): ?>
                        <button type="button" id="tp-deploy-btn" class="tp-btn tp-btn--primary">
                            <span class="dashicons dashicons-superhero-alt"></span> Deploy to Visitors
                        </button>
                    <?php endif; ?>
                </div>
            </header>

            <?php if ($is_test): ?>
                <div class="tp-testmode-banner">
                    <span class="dashicons dashicons-info-outline"></span>
                    <div>
                        <strong>Not deployed to real visitors yet.</strong>
                        Real visitors currently see the unoptimized website. Use
                        <a href="<?php echo esc_url($preview_url); ?>" target="_blank" rel="noopener">Preview Cached Website</a>
                        to test the optimized version, then click <strong>Deploy to Visitors</strong> once everything looks right.
                    </div>
                </div>
            <?php endif; ?>

            <div class="tp-embed-frame">
                <iframe
                    src="<?php echo esc_url($embed_url); ?>"
                    title="Turbopress Control Panel"
                    loading="lazy"
                ></iframe>
            </div>

            <p class="tp-embed-footnote">
                Every optimization control for this site lives in the panel above — presets, critical CSS,
                JavaScript engine, media offload, fonts, deployment. Changes apply instantly through the
                signed command channel. Connection details live on the
                <a href="<?php echo esc_url(add_query_arg(['page' => self::PAGE_CONNECT], admin_url('admin.php'))); ?>">Connect page</a>.
            </p>
        </div>

        <?php $this->render_toast_shell(); ?>

        <script>
        document.addEventListener('DOMContentLoaded', function() {
            var purgeBtn = document.getElementById('tp-purge-cache-btn');
            var warmBtn = document.getElementById('tp-warm-btn');
            var deployBtn = document.getElementById('tp-deploy-btn');
            var nonce = '<?php echo wp_create_nonce('turbopress_admin'); ?>';

            function post(action, onDone) {
                var data = new FormData();
                data.append('action', action);
                data.append('nonce', nonce);
                return fetch(ajaxurl, { method: 'POST', body: data })
                    .then(function(r) { return r.json(); })
                    .then(onDone || function() {});
            }

            function setBusy(btn, busy) {
                if (!btn) return;
                btn.disabled = busy;
                btn.classList.toggle('is-busy', busy);
            }

            if (purgeBtn) {
                purgeBtn.addEventListener('click', function() {
                    setBusy(purgeBtn, true);
                    post('turbopress_purge_cache', function() {
                        setBusy(purgeBtn, false);
                        window.tpToast('All caches purged.', 'ok');
                    }).catch(function() { setBusy(purgeBtn, false); window.tpToast('Purge request failed.', 'err'); });
                });
            }

            if (warmBtn) {
                warmBtn.addEventListener('click', function() {
                    setBusy(warmBtn, true);
                    fetch(ajaxurl, {
                        method: 'POST',
                        body: (function() {
                            var d = new FormData();
                            d.append('action', 'turbopress_warm_cache');
                            d.append('nonce', nonce);
                            return d;
                        })()
                    })
                    .then(function(r) { return r.json(); })
                    .then(function(res) {
                        setBusy(warmBtn, false);
                        if (res.success) {
                            window.tpToast('Warm cache started — pages are being optimized and cached in the background.', 'ok');
                        } else if (res.data === 'test_mode') {
                            window.tpToast('Warm Cache is disabled in Test Mode. Deploy to visitors first, then warm the cache.', 'warn');
                        } else {
                            window.tpToast('Warm cache failed to start.', 'err');
                        }
                    })
                    .catch(function() { setBusy(warmBtn, false); window.tpToast('Warm cache request failed.', 'err'); });
                });
            }

            if (deployBtn) {
                deployBtn.addEventListener('click', function() {
                    var ok = confirm(
                        'Deploy the optimized website to ALL visitors now?\n\n' +
                        'Make sure you have tested the optimized site with "Preview Cached Website" — ' +
                        'pages, styling, menus, forms and checkout — before deploying.'
                    );
                    if (!ok) return;
                    setBusy(deployBtn, true);
                    var data = new FormData();
                    data.append('action', 'turbopress_deploy');
                    data.append('status', 'live');
                    data.append('nonce', nonce);
                    fetch(ajaxurl, { method: 'POST', body: data })
                        .then(function(r) { return r.json(); })
                        .then(function() { window.location.reload(); })
                        .catch(function() { setBusy(deployBtn, false); window.tpToast('Deploy failed.', 'err'); });
                });
            }
        });
        </script>
        <?php
    }

    /* ------------------------------------------------------------------ */
    /* Connect page (local): onboarding OR connection details               */
    /* ------------------------------------------------------------------ */

    public function render_connect_page(): void {
        if ($this->config->is_connected()) {
            $this->render_connection_details();
            return;
        }

        $connect_url = Handshake::generate_connect_url();
        ?>
        <div class="wrap turbopress-admin-wrap tp-connect-wrap">
            <div class="tp-connect-card">
                <div class="tp-connect-head">
                    <span class="dashicons dashicons-performance tp-connect-logo"></span>
                    <h1>Connect to Turbopress</h1>
                    <p>
                        Link this site to the Turbopress edge to unlock automated critical CSS, JavaScript
                        optimization, R2 media delivery and the cloud control panel.
                    </p>
                </div>

                <ul class="tp-connect-benefits">
                    <li>
                        <span class="dashicons dashicons-dashboard"></span>
                        <div><strong>Cloud control panel</strong><span>Every optimization setting, job status and deploy control — embedded right in your dashboard.</span></div>
                    </li>
                    <li>
                        <span class="dashicons dashicons-media-code"></span>
                        <div><strong>Edge Critical CSS</strong><span>Real-browser extraction per page, inlined for zero render-blocking CSS.</span></div>
                    </li>
                    <li>
                        <span class="dashicons dashicons-images-alt2"></span>
                        <div><strong>R2 media offload</strong><span>Images and video served from the edge with webp derivatives and immutable caching.</span></div>
                    </li>
                    <li>
                        <span class="dashicons dashicons-shield-alt"></span>
                        <div><strong>Auto-Protect safety net</strong><span>Real-user error monitoring steps aggressiveness down automatically — never a broken page.</span></div>
                    </li>
                </ul>

                <div class="tp-connect-cta">
                    <a href="<?php echo esc_url($connect_url); ?>" class="tp-btn tp-btn--primary tp-btn--hero">
                        <span class="dashicons dashicons-admin-links"></span> Connect this site
                    </a>
                    <p class="tp-connect-note">
                        One click — you will be returned here automatically once the handshake completes.
                        A free Turbopress account is created on first connect.
                    </p>
                </div>

                <div class="tp-connect-secure">
                    <span class="dashicons dashicons-lock"></span>
                    The connection uses a scoped site key and signed callbacks only — no credentials are
                    stored in the browser.
                </div>
            </div>
        </div>
        <?php
    }

    private function render_connection_details(): void {
        $config = new Config();
        $domain = wp_parse_url(home_url(), PHP_URL_HOST) ?: '';
        $site_id = $config->get_site_id();
        $is_test = $config->get('deployment.status', 'live') === 'test';

        // Cheap connectivity probe, cached by HealthCheck transients.
        $verify = get_transient('turbopress_health_edge');
        $edge_ok = is_array($verify) ? (bool) ($verify['ok'] ?? false) : null;
        ?>
        <div class="wrap turbopress-admin-wrap tp-connect-wrap">
            <div class="tp-connect-card tp-connect-card--wide">
                <div class="tp-connect-head">
                    <span class="dashicons dashicons-yes-alt tp-connected-logo"></span>
                    <h1>Site Connected</h1>
                    <p>This WordPress site is linked to the Turbopress edge. All controls live in the dashboard.</p>
                </div>

                <table class="tp-connection-table">
                    <tbody>
                        <tr>
                            <th>Status</th>
                            <td>
                                <span class="tp-pill <?php echo $is_test ? 'tp-pill--test' : 'tp-pill--live'; ?>">
                                    <?php echo $is_test ? 'Test Mode' : 'Live'; ?>
                                </span>
                                <?php if ($edge_ok === true): ?>
                                    <span class="tp-pill tp-pill--live">Edge reachable</span>
                                <?php elseif ($edge_ok === false): ?>
                                    <span class="tp-pill tp-pill--warn">Edge unreachable</span>
                                <?php endif; ?>
                            </td>
                        </tr>
                        <tr>
                            <th>Domain</th>
                            <td><code><?php echo esc_html($domain); ?></code></td>
                        </tr>
                        <tr>
                            <th>Site ID</th>
                            <td><code><?php echo esc_html($site_id); ?></code></td>
                        </tr>
                        <tr>
                            <th>Edge API</th>
                            <td><code><?php echo esc_html($config->get_api_url()); ?></code></td>
                        </tr>
                        <tr>
                            <th>Plugin version</th>
                            <td><code>v<?php echo esc_html(TURBOPRESS_VERSION); ?></code></td>
                        </tr>
                    </tbody>
                </table>

                <div class="tp-connect-cta tp-connect-cta--row">
                    <a href="<?php echo esc_url(add_query_arg(['page' => self::PAGE_DASHBOARD], admin_url('admin.php'))); ?>"
                       class="tp-btn tp-btn--primary">
                        <span class="dashicons dashicons-dashboard"></span> Go to Dashboard
                    </a>
                    <button type="button" id="tp-disconnect-btn" class="tp-btn tp-btn--danger">
                        <span class="dashicons dashicons-editor-unlink"></span> Disconnect
                    </button>
                </div>

                <div class="tp-connect-secure">
                    <span class="dashicons dashicons-lock"></span>
                    Disconnecting keeps the site working — optimization simply stops until you reconnect.
                    Deleting the plugin removes all connection keys automatically.
                </div>
            </div>
        </div>

        <?php $this->render_toast_shell(); ?>

        <script>
        document.addEventListener('DOMContentLoaded', function() {
            var disconnectBtn = document.getElementById('tp-disconnect-btn');
            if (!disconnectBtn) return;

            disconnectBtn.addEventListener('click', function() {
                if (!confirm('Disconnect from Turbopress? The site keeps working; optimization stops until you reconnect.')) {
                    return;
                }
                disconnectBtn.disabled = true;
                var data = new FormData();
                data.append('action', 'turbopress_disconnect');
                data.append('nonce', '<?php echo wp_create_nonce('turbopress_admin'); ?>');

                fetch(ajaxurl, { method: 'POST', body: data })
                    .then(function(r) { return r.json(); })
                    .then(function() { window.location.reload(); })
                    .catch(function() { disconnectBtn.disabled = false; window.tpToast('Disconnect failed.', 'err'); });
            });
        });
        </script>
        <?php
    }

    /* ------------------------------------------------------------------ */
    /* Admin bar: quick actions while browsing the site                     */
    /* ------------------------------------------------------------------ */

    public function register_admin_bar(\WP_Admin_Bar $wp_admin_bar): void {
        if (!current_user_can('manage_options')) {
            return;
        }

        $wp_admin_bar->add_node([
            'id' => 'turbopress',
            'title' => '<span class="ab-icon dashicons dashicons-performance"></span> Turbopress',
            'href' => add_query_arg(['page' => self::PAGE_DASHBOARD], admin_url('admin.php')),
        ]);

        // Page-scoped actions only make sense on the front end.
        if (!is_admin()) {
            $current = home_url(esc_url_raw($_SERVER['REQUEST_URI'] ?? '/'));

            $wp_admin_bar->add_node([
                'id' => 'turbopress-purge-page',
                'parent' => 'turbopress',
                'title' => '<span class="dashicons dashicons-trash"></span> Purge this page',
                'href' => wp_nonce_url(
                    add_query_arg(['turbopress_action' => 'purge_page', 'tp_url' => $current], $current),
                    'turbopress_bar'
                ),
            ]);
        }

        $wp_admin_bar->add_node([
            'id' => 'turbopress-purge-all',
            'parent' => 'turbopress',
            'title' => '<span class="dashicons dashicons-editor-removeformatting"></span> Purge all caches',
            'href' => wp_nonce_url(
                add_query_arg(['turbopress_action' => 'purge_all', 'tp_url' => home_url('/')], home_url('/')),
                'turbopress_bar'
            ),
        ]);

        $wp_admin_bar->add_node([
            'id' => 'turbopress-warm-cache',
            'parent' => 'turbopress',
            'title' => '<span class="dashicons dashicons-update"></span> Warm cache',
            'href' => wp_nonce_url(
                add_query_arg(['turbopress_action' => 'warm_cache', 'tp_url' => home_url('/')], home_url('/')),
                'turbopress_bar'
            ),
        ]);
    }

    /**
     * Admin-bar action endpoint: runs on init (before any output) so it can
     * redirect back to the page the user was viewing.
     */
    public function handle_admin_bar_action(): void {
        $action = isset($_GET['turbopress_action']) ? sanitize_key($_GET['turbopress_action']) : '';
        if (!in_array($action, ['purge_page', 'purge_all', 'warm_cache'], true)) {
            return;
        }

        if (!current_user_can('manage_options') || !check_admin_referer('turbopress_bar')) {
            return;
        }

        $url = isset($_GET['tp_url']) ? esc_url_raw(wp_unslash($_GET['tp_url'])) : '';
        $back = wp_get_referer() ?: home_url('/');
        $back = remove_query_arg(['turbopress_action', '_wpnonce', 'tp_url'], $back);

        switch ($action) {
            case 'purge_page':
                if ($url) {
                    CacheManager::purge_url($url);
                    CacheIntegration::purge_foreign_caches('url', $url);
                } else {
                    CacheManager::purge_all_static();
                    CacheIntegration::purge_foreign_caches('all');
                }
                break;

            case 'purge_all':
                CacheManager::purge_all_static();
                CacheIntegration::purge_foreign_caches('all');
                break;

            case 'warm_cache':
                $config = new Config();
                if ($config->get('deployment.status', 'live') === 'test') {
                    // Surface why nothing happened as a toast on the dashboard.
                    wp_safe_redirect(add_query_arg(
                        ['page' => self::PAGE_DASHBOARD, 'tp_toast' => 'warm_test'],
                        admin_url('admin.php')
                    ));
                    exit;
                }
                $home = home_url('/');
                if ($config->is_connected()) {
                    wp_schedule_single_event(time(), 'turbopress_async_optimize', ['url' => $home, 'attempt' => 1]);
                    wp_schedule_single_event(time(), 'turbopress_media_offload', []);
                    spawn_cron();
                }
                wp_remote_get($home, [
                    'timeout' => 5,
                    'blocking' => false,
                    'headers' => ['X-Turbopress-Revalidate' => '1', 'Cache-Control' => 'no-cache'],
                ]);
                break;
        }

        wp_safe_redirect($back);
        exit;
    }

    /* ------------------------------------------------------------------ */
    /* Ajax handlers                                                        */
    /* ------------------------------------------------------------------ */

    public function ajax_purge_cache(): void {
        check_ajax_referer('turbopress_admin', 'nonce');

        if (!current_user_can('manage_options')) {
            wp_send_json_error('Unauthorized');
        }

        CacheManager::purge_all_static();
        CacheIntegration::purge_foreign_caches('all');
        wp_send_json_success();
    }

    /**
     * Warm cache: (re)optimize + (re)fill caches now. Disabled in Test Mode —
     * the caller shows the explanatory toast.
     */
    public function ajax_warm_cache(): void {
        check_ajax_referer('turbopress_admin', 'nonce');

        if (!current_user_can('manage_options')) {
            wp_send_json_error('Unauthorized');
        }

        $config = new Config();
        if ($config->get('deployment.status', 'live') === 'test') {
            wp_send_json_error('test_mode');
        }

        $home = home_url('/');
        if ($config->is_connected()) {
            wp_schedule_single_event(time(), 'turbopress_async_optimize', ['url' => $home, 'attempt' => 1]);
            wp_schedule_single_event(time(), 'turbopress_media_offload', []);
            spawn_cron();
        }

        // Prime the local page cache (and any host cache) in the background.
        wp_remote_get($home, [
            'timeout' => 5,
            'blocking' => false,
            'headers' => ['X-Turbopress-Revalidate' => '1', 'Cache-Control' => 'no-cache'],
        ]);

        wp_send_json_success();
    }

    /**
     * Deploy / Test Mode switch from the dashboard header. Deploy is the
     * destructive direction — the JS side forces a confirm() first.
     */
    public function ajax_deploy(): void {
        check_ajax_referer('turbopress_admin', 'nonce');

        if (!current_user_can('manage_options')) {
            wp_send_json_error('Unauthorized');
        }

        $status = sanitize_text_field($_POST['status'] ?? 'live');
        if (!in_array($status, ['test', 'live'], true)) {
            wp_send_json_error('Invalid status');
        }

        (new Config())->set('deployment.status', $status);

        // Switching either way invalidates every cached variant.
        CacheManager::purge_all_static();
        CacheIntegration::purge_foreign_caches('all');

        wp_send_json_success(['status' => $status]);
    }

    public function ajax_disconnect(): void {
        check_ajax_referer('turbopress_admin', 'nonce');

        if (!current_user_can('manage_options')) {
            wp_send_json_error('Unauthorized');
        }

        $this->config->set_api_key('');
        $this->config->set_site_id('');
        CacheManager::purge_all_static();
        CacheIntegration::purge_foreign_caches('all');

        wp_send_json_success();
    }
}
