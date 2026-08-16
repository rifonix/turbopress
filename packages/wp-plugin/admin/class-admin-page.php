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
 *  - Connect (wp-admin/admin.php?page=turbopress-connect): local onboarding
 *    screen. If already connected, sends the user to the Dashboard.
 *
 * Also renders the admin-bar actions (purge this page / re-optimize this
 * page / purge all) for logged-in administrators.
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
     * Access control: the Dashboard requires a connection; the Connect
     * page is only useful while disconnected.
     */
    public function guard_pages(): void {
        $screen = isset($_GET['page']) ? sanitize_key($_GET['page']) : '';
        if ($screen === self::PAGE_DASHBOARD && !$this->config->is_connected()) {
            wp_safe_redirect(add_query_arg(['page' => self::PAGE_CONNECT], admin_url('admin.php')));
            exit;
        }
        if ($screen === self::PAGE_CONNECT
            && $this->config->is_connected()
            && empty($_GET['force'])) {
            wp_safe_redirect(add_query_arg(['page' => self::PAGE_DASHBOARD], admin_url('admin.php')));
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
    /* Dashboard page (embedded SaaS control panel)                         */
    /* ------------------------------------------------------------------ */

    public function render_dashboard_page(): void {
        $site_id = $this->config->get_site_id();
        $domain = wp_parse_url(home_url(), PHP_URL_HOST) ?: '';

        // Signed embed token: siteId.expiry.hmac(callback_secret). The
        // edge verifies it, so the iframe needs no Clerk session and no
        // API key exposure in the browser.
        $exp = time() + HOUR_IN_SECONDS;
        $sig = hash_hmac('sha256', $site_id . '.' . $exp, Config::get_callback_secret_static());
        $embed_url = rtrim($this->config->get_api_url(), '/')
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
                </div>
                <div class="tp-dashboard-actions">
                    <?php if (!empty($_GET['connected'])): ?>
                        <span class="tp-notice-ok"><span class="dashicons dashicons-yes-alt"></span> Connected — optimization started in the background.</span>
                    <?php endif; ?>
                    <button type="button" id="tp-purge-cache-btn" class="button button-secondary">
                        <span class="dashicons dashicons-trash"></span> Purge Cache
                    </button>
                    <button type="button" id="tp-disconnect-btn" class="button button-link-delete">
                        <span class="dashicons dashicons-editor-unlink"></span> Disconnect
                    </button>
                </div>
            </header>

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
                signed command channel.
            </p>
        </div>

        <script>
        document.addEventListener('DOMContentLoaded', function() {
            const purgeBtn = document.getElementById('tp-purge-cache-btn');
            const disconnectBtn = document.getElementById('tp-disconnect-btn');

            if (purgeBtn) {
                purgeBtn.addEventListener('click', function() {
                    purgeBtn.disabled = true;
                    const label = purgeBtn.innerHTML;
                    purgeBtn.innerHTML = '<span class="dashicons dashicons-update spin"></span> Purging…';

                    const data = new FormData();
                    data.append('action', 'turbopress_purge_cache');
                    data.append('nonce', '<?php echo wp_create_nonce('turbopress_admin'); ?>');

                    fetch(ajaxurl, { method: 'POST', body: data })
                        .then(r => r.json())
                        .then(() => { purgeBtn.innerHTML = label; purgeBtn.disabled = false; })
                        .catch(() => { purgeBtn.innerHTML = label; purgeBtn.disabled = false; });
                });
            }

            if (disconnectBtn) {
                disconnectBtn.addEventListener('click', function() {
                    if (!confirm('Disconnect from Turbopress? The site keeps working; optimization stops until you reconnect.')) {
                        return;
                    }
                    const data = new FormData();
                    data.append('action', 'turbopress_disconnect');
                    data.append('nonce', '<?php echo wp_create_nonce('turbopress_admin'); ?>');

                    fetch(ajaxurl, { method: 'POST', body: data })
                        .then(r => r.json())
                        .then(() => { window.location = '<?php echo esc_url(add_query_arg(['page' => self::PAGE_CONNECT], admin_url('admin.php'))); ?>'; });
                });
            }
        });
        </script>
        <?php
    }

    /* ------------------------------------------------------------------ */
    /* Connect page (local)                                                 */
    /* ------------------------------------------------------------------ */

    public function render_connect_page(): void {
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
                    <a href="<?php echo esc_url($connect_url); ?>" class="button button-primary button-hero">
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
        if (!is_admin() && $this->config->is_connected()) {
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

            $wp_admin_bar->add_node([
                'id' => 'turbopress-reoptimize-page',
                'parent' => 'turbopress',
                'title' => '<span class="dashicons dashicons-update"></span> Re-optimize this page',
                'href' => wp_nonce_url(
                    add_query_arg(['turbopress_action' => 'reoptimize', 'tp_url' => $current], $current),
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
    }

    /**
     * Admin-bar action endpoint: runs on init (before any output) so it can
     * redirect back to the page the user was viewing.
     */
    public function handle_admin_bar_action(): void {
        $action = isset($_GET['turbopress_action']) ? sanitize_key($_GET['turbopress_action']) : '';
        if (!in_array($action, ['purge_page', 'reoptimize', 'purge_all'], true)) {
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

            case 'reoptimize':
                if ($url && $this->config->is_connected()) {
                    wp_schedule_single_event(time() + 10, 'turbopress_async_optimize', ['url' => $url, 'attempt' => 1]);
                    spawn_cron();
                    CacheManager::purge_url($url);
                    CacheIntegration::purge_foreign_caches('url', $url);
                }
                break;

            case 'purge_all':
                CacheManager::purge_all_static();
                CacheIntegration::purge_foreign_caches('all');
                break;
        }

        wp_safe_redirect($back);
        exit;
    }

    /* ------------------------------------------------------------------ */
    /* Ajax handlers used by the dashboard bar                              */
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
