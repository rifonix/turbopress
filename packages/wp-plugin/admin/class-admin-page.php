<?php
namespace WPInstant;

use WPInstant\Admin\Icon;

if (!defined('ABSPATH')) {
    exit;
}

/**
 * Admin experience: native multi-page UI.
 *
 *  - Dashboard (wp-instant): templates/presets, deployment, RUM stats,
 *    quick actions. Native page (no embed) since v1.14.0.
 *  - Assets (wp-instant-assets): CDN offload, lazy loading, css/js
 *    delivery, fonts, plugin asset control.
 *  - HTML & CSS (wp-instant-html-css), JavaScript (wp-instant-js),
 *    Cache & Advanced (wp-instant-advanced): granular settings pages.
 *  - Connect (wp-instant-connect): onboarding when disconnected;
 *    connection details + Disconnect when connected.
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

    public const PAGE_DASHBOARD = 'wp-instant';
    public const PAGE_CONNECT = 'wp-instant-connect';
    public const ACTIVATION_REDIRECT_OPTION = 'wp_instant_do_activation_redirect';

    /**
     * Front-end registration for logged-in admins: the admin-bar Purge/Warm
     * links point at front-end URLs, so without this the handler never runs
     * and the clicks are dead. Static-safe: the handler/menu renderer use
     * only statics (CacheManager, CacheIntegration, Config).
     */
    public function register_frontend_bar_hooks(): void {
        add_action('admin_bar_menu', [$this, 'register_admin_bar'], 100);
        add_action('init', [$this, 'handle_admin_bar_action']);
    }

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
        add_action('add_meta_boxes', [$this, 'register_meta_boxes']);
        add_action('save_post', [$this, 'save_plugin_assets_metabox'], 10, 2);
        add_action('admin_bar_menu', [$this, 'register_admin_bar'], 100);
        add_action('init', [$this, 'handle_admin_bar_action']);
        // Central save handler shared by every native settings page.
        add_action('admin_post_wp_instant_save_settings', [Admin\Settings_Page::class, 'handle_save']);
        add_action('wp_ajax_wp_instant_purge_cache', [$this, 'ajax_purge_cache']);
        add_action('wp_ajax_wp_instant_warm_cache', [$this, 'ajax_warm_cache']);
        add_action('wp_ajax_wp_instant_deploy', [$this, 'ajax_deploy']);
        add_action('wp_ajax_wp_instant_disconnect', [$this, 'ajax_disconnect']);
        add_action('wp_ajax_wp_instant_sync_config', [$this, 'ajax_sync_config']);
    }

    /* ------------------------------------------------------------------ */
    /* Routing & lifecycle                                                  */
    /* ------------------------------------------------------------------ */

    public function register_menu(): void {
        $titles = [
            'wp-instant' => 'Dashboard',
            'wp-instant-assets' => 'Assets',
            'wp-instant-html-css' => 'HTML & CSS',
            'wp-instant-js' => 'JavaScript',
            'wp-instant-advanced' => 'Cache & Advanced',
        ];

        add_menu_page(
            'WP Instant',
            'WP Instant',
            'manage_options',
            self::PAGE_DASHBOARD,
            [$this, 'render_settings_page'],
            Admin\Icon::menu_icon_uri(),
            58
        );

        foreach ($titles as $slug => $title) {
            add_submenu_page(
                self::PAGE_DASHBOARD,
                'WP Instant — ' . $title,
                $title,
                'manage_options',
                $slug,
                [$this, 'render_settings_page']
            );
        }

        add_submenu_page(
            self::PAGE_DASHBOARD,
            'Connect',
            'Connect',
            'manage_options',
            self::PAGE_CONNECT,
            [$this, 'render_connect_page']
        );
    }

    /** Render one of the native settings pages (Dashboard/Assets/…). */
    public function render_settings_page(): void {
        $slug = isset($_GET['page']) ? sanitize_key(wp_unslash($_GET['page'])) : '';
        $registered = Admin\Settings_Page::registered_pages();
        if (!isset($registered[$slug])) {
            wp_safe_redirect(add_query_arg(['page' => self::PAGE_DASHBOARD], admin_url('admin.php')));
            exit;
        }

        $class = $registered[$slug];
        (new $class(new Config()))->render_form();
        $this->render_toast_shell();
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
     * Access control: every settings page requires a connection. The
     * Connect page stays reachable when connected (it hosts the connection
     * details and the Disconnect action).
     */
    public function guard_pages(): void {
        $screen = isset($_GET['page']) ? sanitize_key($_GET['page']) : '';
        $needs_connection = isset(Admin\Settings_Page::registered_pages()[$screen]);
        if ($needs_connection && !(new Config())->is_connected()) {
            wp_safe_redirect(add_query_arg(['page' => self::PAGE_CONNECT], admin_url('admin.php')));
            exit;
        }
    }

    public function enqueue_assets(string $hook): void {
        // Menu titles are 'WP Instant' (capital T) — the top-level hook is
        // `toplevel_page_WP Instant`, so this must be case-insensitive or
        // the stylesheet silently never loads on the dashboard page.
        if (stripos($hook, 'wp-instant') === false) {
            return;
        }

        // Web-app typefaces (Inter + Roboto Mono) to keep the admin UI on-brand.
        wp_enqueue_style(
            'wp-instant-admin-fonts',
            'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Roboto+Mono:wght@400;500;600&display=swap',
            [],
            null
        );

        wp_enqueue_style(
            'wp-instant-admin-css',
            WP_INSTANT_URL . 'assets/css/admin-dashboard.css',
            ['wp-instant-admin-fonts'],
            WP_INSTANT_VERSION
        );
    }

    /* ------------------------------------------------------------------ */
    /* Shared JS: toasts + button plumbing                                  */
    /* ------------------------------------------------------------------ */

    private function render_toast_shell(): void {
        ?>
        <div id="wpins-toast" class="wpins-toast" role="status" aria-live="polite"></div>
        <script>
        window.wpinsToast = function(message, kind) {
            var el = document.getElementById('wpins-toast');
            if (!el) return;
            el.textContent = message;
            el.className = 'wpins-toast wpins-toast--' + (kind || 'info') + ' wpins-toast--show';
            clearTimeout(window.__tpToastTimer);
            window.__tpToastTimer = setTimeout(function() {
                el.className = 'wpins-toast';
            }, 4200);
        };

        document.addEventListener('DOMContentLoaded', function() {
            var params = new URLSearchParams(window.location.search);

            // Toasts queued via redirect (?wpins_toast=...).
            var queued = params.get('wpins_toast');
            if (queued === 'warm_test') {
                window.wpinsToast('Warm Cache is disabled in Test Mode. Deploy to visitors first, then warm the cache.', 'warn');
            } else if (queued === 'warm_ok') {
                window.wpinsToast('Warm cache started — pages are being optimized and cached in the background.', 'ok');
            }

            // Auto-warm trigger (?warm=1 from the admin bar) — fires the
            // ajax action directly (the dashboard header button is gone;
            // the embed panel owns the UI now).
            if (params.get('warm') === '1') {
                var d = new FormData();
                d.append('action', 'wp_instant_warm_cache');
                d.append('nonce', '<?php echo wp_create_nonce('wp_instant_admin'); ?>');
                fetch(ajaxurl, { method: 'POST', body: d })
                    .then(function(r) { return r.json(); })
                    .then(function(res) {
                        if (res.success) {
                            window.wpinsToast('Warm cache started — pages are being optimized and cached in the background.', 'ok');
                        } else if (res.data === 'test_mode') {
                            window.wpinsToast('Warm Cache is disabled in Test Mode. Deploy to visitors first, then warm the cache.', 'warn');
                        } else {
                            window.wpinsToast('Warm cache failed to start.', 'err');
                        }
                    })
                    .catch(function() { window.wpinsToast('Warm cache request failed.', 'err'); });
            }
        });
        </script>
        <?php
    }

    /* ------------------------------------------------------------------ */
    /* Page optimization controls (every post type, editor sidebar)         */
    /* ------------------------------------------------------------------ */

    /**
     * Register page status and per-post asset controls for every post type
     * that has an editor. The side context is supported by both the classic
     * editor and Gutenberg's document sidebar.
     */
    public function register_meta_boxes(): void {
        if (!current_user_can('manage_options')) {
            return;
        }

        foreach (get_post_types(['show_ui' => true], 'objects') as $post_type) {
            if (in_array($post_type->name, ['attachment', 'revision', 'nav_menu_item', 'custom_css'], true)) {
                continue;
            }

            add_meta_box(
                'wp_instant_page_optimization',
                'WP Instant Optimization',
                [$this, 'render_page_optimization_metabox'],
                $post_type->name,
                'side',
                'high'
            );
            add_meta_box(
                'wp_instant_page_assets',
                'WP Instant Asset Exclusions',
                [$this, 'render_plugin_assets_metabox'],
                $post_type->name,
                'side',
                'high'
            );
        }
    }

    public function render_page_optimization_metabox(\WP_Post $post): void {
        $url = get_permalink($post);
        $status = $this->get_page_optimization_status($post, $url);
        $rules = $this->get_post_asset_rules($post->ID);
        $status_colors = [
            'optimized' => '#16a34a',
            'optimizing' => '#f59e0b',
            'test' => '#f59e0b',
            'not_connected' => '#dc2626',
            'pending' => '#71717a',
        ];
        $color = $status_colors[$status['key']] ?? '#71717a';
        ?>
        <div style="font-size:12px;line-height:1.45;">
            <div style="display:flex;align-items:center;gap:7px;margin:0 0 10px;">
                <span style="width:8px;height:8px;border-radius:50%;background:<?php echo esc_attr($color); ?>;display:inline-block;"></span>
                <strong><?php echo esc_html($status['label']); ?></strong>
            </div>
            <dl style="margin:0;">
                <div style="display:flex;justify-content:space-between;gap:8px;margin:0 0 5px;">
                    <dt style="color:#646970;">Publish status</dt>
                    <dd style="margin:0;font-weight:600;"><?php echo esc_html($status['post_status']); ?></dd>
                </div>
                <div style="display:flex;justify-content:space-between;gap:8px;margin:0 0 5px;">
                    <dt style="color:#646970;">Critical CSS</dt>
                    <dd style="margin:0;font-weight:600;"><?php echo esc_html($status['css']); ?></dd>
                </div>
                <div style="display:flex;justify-content:space-between;gap:8px;margin:0 0 5px;">
                    <dt style="color:#646970;">Featured image</dt>
                    <dd style="margin:0;font-weight:600;"><?php echo esc_html($status['featured_image']); ?></dd>
                </div>
                <div style="display:flex;justify-content:space-between;gap:8px;margin:0 0 5px;">
                    <dt style="color:#646970;">Page exclusions</dt>
                    <dd style="margin:0;font-weight:600;"><?php echo esc_html((string) (count($rules['plugins']) + count($rules['themes'] ?? []) + count($rules['assets']))); ?></dd>
                </div>
            </dl>
            <?php if ($url): ?>
                <p style="margin:9px 0 0;word-break:break-all;color:#646970;">
                    <a href="<?php echo esc_url($url); ?>" target="_blank" rel="noreferrer">View optimized page</a>
                </p>
            <?php endif; ?>
        </div>
        <?php
    }

    public function render_plugin_assets_metabox(\WP_Post $post): void {
        wp_nonce_field('wp_instant_page_assets', 'wp_instant_page_assets_nonce');

        $current = $this->get_post_asset_rules($post->ID);
        $pto = get_post_type_object($post->post_type);
        $label = $pto->labels->singular_name ?? $post->post_type;
        $plugins = self::active_plugin_catalog();
        $themes = self::active_theme_catalog();
        ?>
        <p class="description" style="margin:0 0 10px;">
            Exclude assets from this <?php echo esc_html(strtolower($label)); ?> only. Selected plugins/themes lose all matching CSS/JS on this page.
        </p>

        <?php if ($plugins === []): ?>
            <p class="description">No other active plugins detected.</p>
        <?php else: ?>
            <div style="max-height:190px;overflow:auto;border:1px solid #e4e4e7;border-radius:10px;padding:7px;background:#fff;">
                <?php foreach ($plugins as $slug => $name): ?>
                    <label style="display:flex;align-items:flex-start;gap:6px;font-size:12px;margin:0 0 7px;">
                        <input type="checkbox"
                            name="wp_instant_page_plugins[]"
                            value="<?php echo esc_attr($slug); ?>"
                            <?php checked(in_array($slug, $current['plugins'], true)); ?> />
                        <span><?php echo esc_html($name); ?></span>
                    </label>
                <?php endforeach; ?>
            </div>
        <?php endif; ?>

        <?php if ($themes !== []): ?>
            <label style="display:block;font-size:12px;font-weight:600;margin:12px 0 4px;">Themes</label>
            <div style="border:1px solid #e4e4e7;border-radius:10px;padding:7px;background:#fff;">
                <?php foreach ($themes as $slug => $name): ?>
                    <label style="display:flex;align-items:flex-start;gap:6px;font-size:12px;margin:0 0 7px;">
                        <input type="checkbox"
                            name="wp_instant_page_themes[]"
                            value="<?php echo esc_attr($slug); ?>"
                            <?php checked(in_array($slug, $current['themes'], true)); ?> />
                        <span><?php echo esc_html($name); ?> <em style="color:#a1a1aa;">(theme)</em></span>
                    </label>
                <?php endforeach; ?>
            </div>
        <?php endif; ?>

        <label for="wp-instant-page-assets" style="display:block;font-size:12px;font-weight:600;margin:12px 0 4px;">
            Specific CSS/JS asset matches
        </label>
        <textarea id="wp-instant-page-assets" name="wp_instant_page_assets" rows="5" spellcheck="false"
            placeholder="swiper.js\n/wp-content/plugins/example/assets/\nregex:/leaflet|mapbox/i"
            style="width:100%;font:11px/1.4 monospace;resize:vertical;"><?php echo esc_textarea(implode("\n", $current['assets'])); ?></textarea>
        <p class="description" style="margin:5px 0 0;">
            One per line. Use a keyword or URL fragment, or prefix a PHP-compatible pattern with <code>regex:</code>.
            Rules target script/link tags on this page.
        </p>
        <p class="description" style="margin-top:8px;">
            For reusable rules across this post type or “All pages”, use the
            <a href="<?php echo esc_url(admin_url('admin.php?page=wp-instant-assets')); ?>">WP Instant → Assets</a>
            Plugin Asset Control card.
        </p>
        <?php
    }

    /**
     * Persist per-post plugin and custom asset rules and purge the affected
     * page. The nonce check prevents REST/autosave requests from wiping them.
     */
    public function save_plugin_assets_metabox(int $post_id, \WP_Post $post): void {
        if (!current_user_can('manage_options')
            || wp_is_post_revision($post_id)
            || wp_is_post_autosave($post_id)
            || !isset($_POST['wp_instant_page_assets_nonce'])
            || !wp_verify_nonce(sanitize_key(wp_unslash($_POST['wp_instant_page_assets_nonce'])), 'wp_instant_page_assets')) {
            return;
        }

        $plugins = array_values(array_unique(array_filter(
            array_map('sanitize_key', (array) ($_POST['wp_instant_page_plugins'] ?? [])),
            static fn (string $s): bool => $s !== '' && $s !== 'wp-instant'
        )));
        $themes = array_values(array_unique(array_filter(
            array_map('sanitize_key', (array) ($_POST['wp_instant_page_themes'] ?? [])),
            static fn (string $s): bool => $s !== ''
        )));
        $assets = self::sanitize_asset_patterns(wp_unslash((string) ($_POST['wp_instant_page_assets'] ?? '')));

        if ($plugins === [] && $themes === [] && $assets === []) {
            delete_post_meta($post_id, PluginAssets::POST_META_KEY);
        } else {
            update_post_meta($post_id, PluginAssets::POST_META_KEY, [
                'plugins' => $plugins,
                'themes' => $themes,
                'assets' => $assets,
            ]);
        }

        $url = get_permalink($post_id);
        if ($url) {
            CacheManager::purge_url($url);
            CacheIntegration::purge_foreign_caches('url', $url);
        } else {
            CacheManager::purge_all_static();
            CacheIntegration::purge_foreign_caches('all');
        }
    }

    /** @return array{plugins: string[], themes: string[], assets: string[]} */
    private function get_post_asset_rules(int $post_id): array {
        $raw = get_post_meta($post_id, PluginAssets::POST_META_KEY, true);
        if (!is_array($raw)) {
            return ['plugins' => [], 'themes' => [], 'assets' => []];
        }

        return [
            'plugins' => array_values(array_filter(array_map('sanitize_key', (array) ($raw['plugins'] ?? [])))),
            'themes' => array_values(array_filter(array_map('sanitize_key', (array) ($raw['themes'] ?? [])))),
            'assets' => self::sanitize_asset_patterns(implode("\n", (array) ($raw['assets'] ?? []))),
        ];
    }

    private static function sanitize_asset_patterns(string $raw): array {
        $patterns = [];
        foreach (preg_split('/\R/u', $raw) ?: [] as $pattern) {
            $pattern = trim(wp_check_invalid_utf8((string) $pattern));
            $pattern = preg_replace('/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/', '', $pattern) ?? '';
            if ($pattern !== '' && strlen($pattern) <= 512) {
                $patterns[] = $pattern;
            }
        }
        return array_values(array_unique($patterns));
    }

    /** @return array{key: string, label: string, post_status: string, css: string, featured_image: string} */
    private function get_page_optimization_status(\WP_Post $post, string|false $url): array {
        $status_object = get_post_status_object($post->post_status);
        $post_status = $status_object ? (string) $status_object->label : ucfirst($post->post_status);
        $featured = post_type_supports($post->post_type, 'thumbnail')
            ? (has_post_thumbnail($post) ? 'Present' : 'None')
            : 'Not supported';

        if (!$this->config->is_connected()) {
            return ['key' => 'not_connected', 'label' => 'Connect to optimize', 'post_status' => $post_status, 'css' => 'Unavailable', 'featured_image' => $featured];
        }
        if ($this->config->get('deployment.status', 'live') === 'test') {
            return ['key' => 'test', 'label' => 'Test mode', 'post_status' => $post_status, 'css' => 'Preview only', 'featured_image' => $featured];
        }
        if (!$url) {
            return ['key' => 'pending', 'label' => 'Needs a permalink', 'post_status' => $post_status, 'css' => 'Waiting', 'featured_image' => $featured];
        }

        $jobs = get_transient('wpins_jobs_' . md5($url));
        if (is_array($jobs) && $jobs !== []) {
            return ['key' => 'optimizing', 'label' => 'Optimization in progress', 'post_status' => $post_status, 'css' => 'Generating', 'featured_image' => $featured];
        }

        $host = strtolower((string) parse_url($url, PHP_URL_HOST));
        $path = (string) (parse_url($url, PHP_URL_PATH) ?: '/');
        $css_dir = WP_INSTANT_CACHE_DIR . '/' . md5($host) . '/css';
        $ready = false;
        foreach (['mobile', 'desktop'] as $viewport) {
            if (is_readable($css_dir . '/' . md5($path . '_' . $viewport) . '.css')) {
                $ready = true;
                break;
            }
        }

        return [
            'key' => $ready ? 'optimized' : 'pending',
            'label' => $ready ? 'Optimized' : 'Ready to optimize',
            'post_status' => $post_status,
            'css' => $ready ? 'Available' : 'Waiting',
            'featured_image' => $featured,
        ];
    }

    /**
     * Active plugin catalog (slug => Name) for the metabox checkboxes.
     */
    private static function active_plugin_catalog(): array {
        $plugins = [];
        if (function_exists('wp_get_active_and_valid_plugins')) {
            foreach (wp_get_active_and_valid_plugins() as $file) {
                $slug = basename(dirname($file));
                if ($slug === 'wp-instant') {
                    continue;
                }
                $data = get_file_data($file, ['Name' => 'Plugin Name']);
                $plugins[$slug] = (string) ($data['Name'] ?: $slug);
            }
        }
        return $plugins;
    }

    /**
     * Active theme catalog (stylesheet => Name): the current theme plus its
     * parent when a child theme is in use. Only these can realistically
     * print assets on the front end.
     */
    private static function active_theme_catalog(): array {
        $themes = [];
        $stylesheet = get_stylesheet();
        $template = get_template();

        $current = wp_get_theme($stylesheet);
        if ($current->exists()) {
            $themes[$stylesheet] = (string) ($current->get('Name') ?: $stylesheet);
        }
        if ($template !== $stylesheet) {
            $parent = wp_get_theme($template);
            if ($parent->exists()) {
                $themes[$template] = (string) ($parent->get('Name') ?: $template) . ' (parent)';
            }
        }
        return $themes;
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
        <div class="wrap wp-instant-admin-wrap wpins-connect-wrap">
            <div class="wpins-connect-card">
                <div class="wpins-connect-head">
                    <span class="wpins-connect-brand"><?php echo Icon::render('bolt', 26); ?></span>
                    <h1>Connect to WP Instant</h1>
                    <p>
                        Link this site to the WP Instant edge to unlock automated critical CSS, JavaScript
                        optimization, CDN media delivery and the cloud control panel.
                    </p>
                </div>

                <ul class="wpins-connect-benefits">
                    <li>
                        <?php echo Icon::render('sliders', 20); ?>
                        <div><strong>Cloud control panel</strong><span>Every optimization setting, job status and deploy control — embedded right in your dashboard.</span></div>
                    </li>
                    <li>
                        <?php echo Icon::render('bolt', 20); ?>
                        <div><strong>Edge Critical CSS</strong><span>Real-browser extraction per page, inlined for zero render-blocking CSS.</span></div>
                    </li>
                    <li>
                        <?php echo Icon::render('image', 20); ?>
                        <div><strong>CDN media offload</strong><span>Images and video served from the edge with modern-format derivatives and immutable caching.</span></div>
                    </li>
                    <li>
                        <?php echo Icon::render('shield', 20); ?>
                        <div><strong>Auto-Protect safety net</strong><span>Real-user error monitoring steps aggressiveness down automatically — never a broken page.</span></div>
                    </li>
                </ul>

                <div class="wpins-connect-cta">
                    <a href="<?php echo esc_url($connect_url); ?>" class="wpins-btn wpins-btn--primary wpins-btn--hero">
                        <?php echo Icon::render('plug', 17); ?> Connect this site
                    </a>
                    <p class="wpins-connect-note">
                        One click — you will be returned here automatically once the handshake completes.
                        An active WP Instant plan or trial is required to connect your site.
                    </p>
                </div>

                <div class="wpins-connect-secure">
                    <?php echo Icon::render('lock', 15); ?>
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
        $verify = get_transient('wp_instant_health_edge');
        $edge_ok = is_array($verify) ? (bool) ($verify['ok'] ?? false) : null;
        ?>
        <div class="wrap wp-instant-admin-wrap wpins-connect-wrap">
            <div class="wpins-connect-card wpins-connect-card--wide">
                <div class="wpins-connect-head">
                    <span class="wpins-connect-brand"><?php echo Icon::render('check', 24); ?></span>
                    <h1>Site Connected</h1>
                    <p>This WordPress site is linked to the WP Instant edge. All controls live in the dashboard.</p>
                </div>

                <table class="wpins-connection-table">
                    <tbody>
                        <tr>
                            <th>Status</th>
                            <td>
                                <span class="wpins-pill <?php echo $is_test ? 'wpins-pill--test' : 'wpins-pill--live'; ?>">
                                    <?php echo $is_test ? 'Test Mode' : 'Live'; ?>
                                </span>
                                <?php if ($edge_ok === true): ?>
                                    <span class="wpins-pill wpins-pill--live">Edge reachable</span>
                                <?php elseif ($edge_ok === false): ?>
                                    <span class="wpins-pill wpins-pill--warn">Edge unreachable</span>
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
                            <td><code>v<?php echo esc_html(WP_INSTANT_VERSION); ?></code></td>
                        </tr>
                    </tbody>
                </table>

                <div class="wpins-connect-cta wpins-connect-cta--row">
                    <a href="<?php echo esc_url(add_query_arg(['page' => self::PAGE_DASHBOARD], admin_url('admin.php'))); ?>"
                       class="wpins-btn wpins-btn--primary">
                        <?php echo Icon::render('gauge', 15); ?> Go to Dashboard
                    </a>
                    <button type="button" id="wpins-disconnect-btn" class="wpins-btn wpins-btn--danger">
                        <?php echo Icon::render('unlink', 15); ?> Disconnect
                    </button>
                </div>

                <div class="wpins-connect-secure">
                    <?php echo Icon::render('lock', 15); ?>
                    Disconnecting keeps the site working — optimization simply stops until you reconnect.
                    Deleting the plugin removes all connection keys automatically.
                </div>
            </div>
        </div>

        <?php $this->render_toast_shell(); ?>

        <script>
        document.addEventListener('DOMContentLoaded', function() {
            var disconnectBtn = document.getElementById('wpins-disconnect-btn');
            if (!disconnectBtn) return;

            disconnectBtn.addEventListener('click', function() {
                if (!confirm('Disconnect from WP Instant? The site keeps working; optimization stops until you reconnect.')) {
                    return;
                }
                disconnectBtn.disabled = true;
                var data = new FormData();
                data.append('action', 'wp_instant_disconnect');
                data.append('nonce', '<?php echo wp_create_nonce('wp_instant_admin'); ?>');

                fetch(ajaxurl, { method: 'POST', body: data })
                    .then(function(r) { return r.json(); })
                    .then(function() { window.location.reload(); })
                    .catch(function() { disconnectBtn.disabled = false; window.wpinsToast('Disconnect failed.', 'err'); });
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
            'id' => 'wp-instant',
            'title' => '<span class="ab-icon wpins-ab-icon" style="position:relative;top:3px;margin-right:2px;display:inline-block;line-height:0;">' . Icon::render('bolt', 15) . '</span> WP Instant',
            'href' => add_query_arg(['page' => self::PAGE_DASHBOARD], admin_url('admin.php')),
        ]);

        // Page-scoped actions only make sense on the front end.
        if (!is_admin()) {
            $current = home_url(esc_url_raw($_SERVER['REQUEST_URI'] ?? '/'));

            $wp_admin_bar->add_node([
                'id' => 'wp-instant-purge-page',
                'parent' => 'wp-instant',
                'title' => '<span class="wpins-ab-icon" style="display:inline-block;line-height:0;vertical-align:-2px;margin-right:5px;">' . Icon::render('trash', 14) . '</span> Purge this page',
                'href' => wp_nonce_url(
                    add_query_arg(['wp_instant_action' => 'purge_page', 'wpins_url' => $current], $current),
                    'wp_instant_bar'
                ),
            ]);
        }

        $wp_admin_bar->add_node([
            'id' => 'wp-instant-purge-all',
            'parent' => 'wp-instant',
            'title' => '<span class="wpins-ab-icon" style="display:inline-block;line-height:0;vertical-align:-2px;margin-right:5px;">' . Icon::render('trash', 14) . '</span> Purge all caches',
            'href' => wp_nonce_url(
                add_query_arg(['wp_instant_action' => 'purge_all', 'wpins_url' => home_url('/')], home_url('/')),
                'wp_instant_bar'
            ),
        ]);

        $wp_admin_bar->add_node([
            'id' => 'wp-instant-warm-cache',
            'parent' => 'wp-instant',
            'title' => '<span class="wpins-ab-icon" style="display:inline-block;line-height:0;vertical-align:-2px;margin-right:5px;">' . Icon::render('refresh', 14) . '</span> Warm cache',
            'href' => wp_nonce_url(
                add_query_arg(['wp_instant_action' => 'warm_cache', 'wpins_url' => home_url('/')], home_url('/')),
                'wp_instant_bar'
            ),
        ]);
    }

    /**
     * Admin-bar action endpoint: runs on init (before any output) so it can
     * redirect back to the page the user was viewing.
     */
    public function handle_admin_bar_action(): void {
        $action = isset($_GET['wp_instant_action']) ? sanitize_key($_GET['wp_instant_action']) : '';
        if (!in_array($action, ['purge_page', 'purge_all', 'warm_cache'], true)) {
            return;
        }

        if (!current_user_can('manage_options') || !check_admin_referer('wp_instant_bar')) {
            return;
        }

        $url = isset($_GET['wpins_url']) ? esc_url_raw(wp_unslash($_GET['wpins_url'])) : '';
        $back = wp_get_referer() ?: home_url('/');
        $back = remove_query_arg(['wp_instant_action', '_wpnonce', 'wpins_url'], $back);

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
                        ['page' => self::PAGE_DASHBOARD, 'wpins_toast' => 'warm_test'],
                        admin_url('admin.php')
                    ));
                    exit;
                }
                $home = home_url('/');
                if ($config->is_connected()) {
                    wp_schedule_single_event(time(), 'wp_instant_async_optimize', [$home, 1]);
                    wp_schedule_single_event(time(), 'wp_instant_media_offload', []);
                    spawn_cron();
                }
                wp_remote_get($home, [
                    'timeout' => 5,
                    'blocking' => false,
                    'headers' => ['X-WP-Instant-Revalidate' => '1', 'Cache-Control' => 'no-cache'],
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
        check_ajax_referer('wp_instant_admin', 'nonce');

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
        check_ajax_referer('wp_instant_admin', 'nonce');

        if (!current_user_can('manage_options')) {
            wp_send_json_error('Unauthorized');
        }

        $config = new Config();
        if ($config->get('deployment.status', 'live') === 'test') {
            wp_send_json_error('test_mode');
        }

        $home = home_url('/');
        if ($config->is_connected()) {
            wp_schedule_single_event(time(), 'wp_instant_async_optimize', [$home, 1]);
            wp_schedule_single_event(time(), 'wp_instant_media_offload', []);
            spawn_cron();
        }

        // Prime the local page cache (and any host cache) in the background.
        wp_remote_get($home, [
            'timeout' => 5,
            'blocking' => false,
            'headers' => ['X-WP-Instant-Revalidate' => '1', 'Cache-Control' => 'no-cache'],
        ]);

        wp_send_json_success();
    }

    /**
     * Deploy / Test Mode switch from the dashboard header. Deploy is the
     * destructive direction — the JS side forces a confirm() first.
     */
    public function ajax_deploy(): void {
        check_ajax_referer('wp_instant_admin', 'nonce');

        if (!current_user_can('manage_options')) {
            wp_send_json_error('Unauthorized');
        }

        if (!isset($_POST['status'])) {
            // Never assume a direction: a missing target previously flipped
            // "Enter Test Mode" into 'live'.
            wp_send_json_error('Missing status');
        }
        $status = sanitize_text_field(wp_unslash((string) $_POST['status']));
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
        check_ajax_referer('wp_instant_admin', 'nonce');

        if (!current_user_can('manage_options')) {
            wp_send_json_error('Unauthorized');
        }

        $this->config->set_api_key('');
        $this->config->set_site_id('');
        CacheManager::purge_all_static();
        CacheIntegration::purge_foreign_caches('all');

        wp_send_json_success();
    }

    /**
     * Push the current config to the cloud dashboard now (verify_connection
     * mirrors it) instead of waiting for the daily heartbeat.
     */
    public function ajax_sync_config(): void {
        check_ajax_referer('wp_instant_admin', 'nonce');

        if (!current_user_can('manage_options')) {
            wp_send_json_error('Unauthorized');
        }

        $result = $this->api_client->verify_connection();
        if (!empty($result['success'])) {
            update_option('wp_instant_config_synced_at', time());
            wp_send_json_success();
        }

        wp_send_json_error($result['error'] ?? 'Sync failed');
    }
}
