<?php
namespace WPInstant\Admin;

use WPInstant\CacheIntegration;
use WPInstant\CacheManager;
use WPInstant\Config;
use WPInstant\Htaccess_Manager;

if (!defined('ABSPATH')) {
    exit;
}

/**
 * Base class for the native (local) WP Instant settings pages.
 *
 * Each subclass renders its own cards through the field helpers below and
 * declares a whitelist of the config paths it owns. Every page posts to the
 * SAME admin-post handler, which:
 *   1. sanitizes only whitelisted paths (booleans, bounded ints, string
 *      lists, selects, plugin unload rules),
 *   2. saves through Config::save() (merged over the preset defaults),
 *   3. purges the page cache + foreign caches,
 *   4. kicks the media offload worker when offload settings changed,
 *   5. schedules an edge config sync (the SaaS dashboard mirrors it),
 *   6. redirects back with a success toast.
 */
abstract class Settings_Page {
    protected Config $config;
    protected string $slug;
    protected string $title;
    protected string $description = '';

    public function __construct(Config $config) {
        $this->config = $config;
    }

    public function get_slug(): string {
        return $this->slug;
    }

    public function get_title(): string {
        return $this->title;
    }

    /* ---------------------------------------------------------------- */
    /* Whitelist                                                         */
    /* ---------------------------------------------------------------- */

    /**
     * Config paths this page may write, as `path => spec` where spec is one
     * of: ['type'=>'bool'], ['type'=>'int','min'=>..,'max'=>..],
     * ['type'=>'int_list','min'=>..,'max'=>..], ['type'=>'str_list'],
     * ['type'=>'text'], ['type'=>'select','options'=>[...]].
     * The special path 'plugins.unload_rules' has its own sanitizer.
     */
    abstract public static function field_definitions(): array;

    /* ---------------------------------------------------------------- */
    /* Rendering                                                         */
    /* ---------------------------------------------------------------- */

    abstract public function render(): void;

    /** Wrap the page in the shared form + save bar. */
    public function render_form(): void {
        $saved = isset($_GET['wpins_saved']);
        $connected = isset($_GET['connected']);
        ?>
        <div class="wrap wp-instant-admin-wrap wpins-settings-wrap">
            <?php $this->render_shell_open(); ?>

            <?php if ($connected): ?>
                <div class="wpins-banner wpins-banner--ok">
                    <?php echo Icon::render('check'); ?>
                    <span><strong>Connected.</strong> Optimization started in the background — your first critical CSS lands within a couple of minutes.</span>
                </div>
            <?php elseif ($saved): ?>
                <div class="wpins-banner wpins-banner--ok">
                    <?php echo Icon::render('check'); ?>
                    <span><strong>Saved.</strong> Changes were applied to your site and its caches were refreshed.</span>
                </div>
            <?php endif; ?>

            <form method="post" action="<?php echo esc_url(admin_url('admin-post.php')); ?>">
                <?php
                wp_nonce_field('wp_instant_save_settings', 'wp_instant_nonce');
                ?>
                <input type="hidden" name="action" value="wp_instant_save_settings">
                <input type="hidden" name="wpins_page" value="<?php echo esc_attr($this->slug); ?>">

                <?php $this->render(); ?>

                <div class="wpins-save-bar">
                    <span class="wpins-field-note">Changes apply to your site instantly — caches refresh automatically.</span>
                    <button type="submit" class="wpins-btn wpins-btn--primary">
                        <?php echo Icon::render('check', 15); ?> Save Changes
                    </button>
                </div>
            </form>
        </div>
        <?php
    }

    /** Shared brand header + tab navigation (used by every settings page). */
    protected function render_shell_open(): void {
        $current = isset($_GET['page']) ? sanitize_key(wp_unslash($_GET['page'])) : $this->slug;
        $tab_icons = [
            'wp-instant' => 'gauge',
            'wp-instant-assets' => 'image',
            'wp-instant-html-css' => 'code',
            'wp-instant-js' => 'braces',
            'wp-instant-advanced' => 'database',
        ];
        ?>
        <div class="wpins-shell-head">
            <span class="wpins-brand"><?php echo Icon::render('bolt', 22); ?></span>
            <div>
                <h1 class="wpins-shell-title"><?php echo esc_html($this->title); ?></h1>
                <?php if ($this->description !== ''): ?>
                    <p class="wpins-shell-desc"><?php echo esc_html($this->description); ?></p>
                <?php endif; ?>
            </div>
            <div class="wpins-shell-chips"><?php $this->render_header_chips(); ?></div>
        </div>
        <nav class="wpins-tabs" aria-label="WP Instant sections">
            <?php foreach (self::registered_pages() as $slug => $class): ?>
                <?php $label = (new $class($this->config))->get_title(); ?>
                <a href="<?php echo esc_url(admin_url('admin.php?page=' . $slug)); ?>"
                    class="<?php echo $slug === $current ? 'wpins-tab-active' : ''; ?>">
                    <?php echo Icon::render($tab_icons[$slug] ?? 'gauge', 14); ?>
                    <?php echo esc_html($label); ?>
                </a>
            <?php endforeach; ?>
        </nav>
        <?php
    }

    /** Status chips in the shell header — subclasses may override. */
    protected function render_header_chips(): void {
        // No chips on plain settings pages.
    }

    /** Config value at a dot path (defaults applied by Config). */
    protected function get(string $path, mixed $default = null): mixed {
        return $this->config->get($path, $default);
    }

    protected function card_open(string $title, string $icon, string $desc = ''): void {
        ?>
        <div class="wpins-card">
            <div class="wpins-card-head">
                <span class="wpins-card-icon"><?php echo Icon::render($icon, 17); ?></span>
                <div class="wpins-card-titles">
                    <h3><?php echo esc_html($title); ?></h3>
                    <?php if ($desc !== ''): ?><p class="wpins-card-desc"><?php echo esc_html($desc); ?></p><?php endif; ?>
                </div>
            </div>
            <div class="wpins-card-body">
        <?php
    }

    protected function card_close(): void {
        echo '</div></div>';
    }

    /** Boolean switch row. */
    protected function toggle(string $section, string $key, string $label, string $hint = ''): void {
        $checked = (bool) $this->get($section . '.' . $key);
        ?>
        <label class="wpins-field wpins-toggle">
            <span class="wpins-field-label">
                <?php echo esc_html($label); ?>
                <?php if ($hint !== ''): ?><small><?php echo esc_html($hint); ?></small><?php endif; ?>
            </span>
            <span class="wpins-switch">
                <input type="checkbox" name="wpins[<?php echo esc_attr($section); ?>][<?php echo esc_attr($key); ?>]" value="1" <?php checked($checked); ?>>
                <span class="wpins-switch-track" aria-hidden="true"></span>
            </span>
        </label>
        <?php
    }

    /** Multi-line string list (one entry per line). */
    protected function list_field(string $section, string $key, string $label, string $hint = '', string $placeholder = ''): void {
        $value = implode("\n", (array) $this->get($section . '.' . $key, []));
        ?>
        <div class="wpins-field">
            <span class="wpins-field-label">
                <?php echo esc_html($label); ?>
                <?php if ($hint !== ''): ?><small><?php echo esc_html($hint); ?></small><?php endif; ?>
            </span>
            <textarea rows="3" spellcheck="false" placeholder="<?php echo esc_attr($placeholder); ?>"
                name="wpins[<?php echo esc_attr($section); ?>][<?php echo esc_attr($key); ?>]"><?php echo esc_textarea($value); ?></textarea>
            <small class="wpins-field-note">One entry per line — matches by file name, URL fragment or path segment.</small>
        </div>
        <?php
    }

    /** Bounded integer slider + numeric readout. */
    protected function range_field(string $section, string $key, string $label, int $min, int $max, int $step, string $suffix = ''): void {
        $value = (int) $this->get($section . '.' . $key, $min);
        ?>
        <div class="wpins-field">
            <span class="wpins-field-label">
                <?php echo esc_html($label); ?>
                <small id="<?php echo esc_attr("wpins-{$section}-{$key}-out"); ?>"><?php echo esc_html($value . $suffix); ?></small>
            </span>
            <input type="range" min="<?php echo (int) $min; ?>" max="<?php echo (int) $max; ?>" step="<?php echo (int) $step; ?>"
                value="<?php echo (int) $value; ?>"
                name="wpins[<?php echo esc_attr($section); ?>][<?php echo esc_attr($key); ?>]"
                data-output="#<?php echo esc_attr("wpins-{$section}-{$key}-out"); ?>" data-suffix="<?php echo esc_attr($suffix); ?>"
                oninput="var o=document.querySelector(this.dataset.output);if(o)o.textContent=this.value+this.dataset.suffix;">
        </div>
        <?php
    }

    /** Segmented single-choice control (radio group styled as buttons). */
    protected function segmented(string $section, string $key, string $label, array $options, string $hint = ''): void {
        $value = (string) $this->get($section . '.' . $key, '');
        ?>
        <div class="wpins-field">
            <span class="wpins-field-label">
                <?php echo esc_html($label); ?>
                <?php if ($hint !== ''): ?><small><?php echo esc_html($hint); ?></small><?php endif; ?>
            </span>
            <div class="wpins-segmented">
                <?php foreach ($options as $opt_value => $opt_label): ?>
                    <label class="wpins-segment">
                        <input type="radio" name="wpins[<?php echo esc_attr($section); ?>][<?php echo esc_attr($key); ?>]"
                            value="<?php echo esc_attr((string) $opt_value); ?>" <?php checked($value, (string) $opt_value); ?>>
                        <span class="wpins-segment-label"><?php echo esc_html($opt_label); ?></span>
                    </label>
                <?php endforeach; ?>
            </div>
        </div>
        <?php
    }

    /** Free-text field (sanitized as plain text, newlines allowed when multiline). */
    protected function text_field(string $section, string $key, string $label, string $hint = '', bool $multiline = false, string $placeholder = ''): void {
        $raw = $this->get($section . ($key !== '' ? '.' . $key : ''), '');
        // List-typed settings (e.g. media.offload_widths) are stored as
        // arrays; render them space-separated instead of casting to "Array".
        $value = is_array($raw)
            ? implode(' ', array_map(static fn($v) => (string) $v, $raw))
            : (string) $raw;
        $name = $key !== ''
            ? 'wpins[' . esc_attr($section) . '][' . esc_attr($key) . ']'
            : 'wpins[' . esc_attr($section) . ']';
        ?>
        <div class="wpins-field">
            <span class="wpins-field-label">
                <?php echo esc_html($label); ?>
                <?php if ($hint !== ''): ?><small><?php echo esc_html($hint); ?></small><?php endif; ?>
            </span>
            <?php if ($multiline): ?>
                <textarea rows="4" spellcheck="false" placeholder="<?php echo esc_attr($placeholder); ?>" name="<?php echo $name; ?>"><?php echo esc_textarea($value); ?></textarea>
            <?php else: ?>
                <input type="text" placeholder="<?php echo esc_attr($placeholder); ?>" name="<?php echo $name; ?>" value="<?php echo esc_attr($value); ?>">
            <?php endif; ?>
        </div>
        <?php
    }

    /* ---------------------------------------------------------------- */
    /* Save                                                              */
    /* ---------------------------------------------------------------- */

    /**
     * Central admin-post handler for every settings page (and preset
     * application). Registered once from AdminPage::init.
     */
    public static function handle_save(): void {
        if (!current_user_can('manage_options')) {
            wp_die('You are not allowed to manage WP Instant settings.');
        }
        check_admin_referer('wp_instant_save_settings', 'wp_instant_nonce');

        $page_slug = isset($_POST['wpins_page']) ? sanitize_key(wp_unslash($_POST['wpins_page'])) : '';
        $registered = self::registered_pages();
        if (!isset($registered[$page_slug])) {
            wp_die('Unknown settings page.');
        }
        $page_class = $registered[$page_slug];

        $config = new Config();

        // Preset application: replaces the config body with the preset's
        // tuned defaults (deployment decisions + custom CSS are preserved).
        if (isset($_POST['wpins_preset'])) {
            $preset = sanitize_key(wp_unslash($_POST['wpins_preset']));
            $defaults = $config->get_default_config($preset);
            $current = $config->get_all();
            $defaults['preset'] = $preset;
            $defaults['deployment'] = $current['deployment'] ?? $defaults['deployment'];
            $defaults['custom_css'] = (string) ($current['custom_css'] ?? '');
            $config->save($defaults);
            self::after_save($config, true);
            wp_safe_redirect(add_query_arg(['page' => $page_slug, 'wpins_saved' => '1'], admin_url('admin.php')));
            exit;
        }

        $posted = isset($_POST['wpins']) && is_array($_POST['wpins']) ? wp_unslash($_POST['wpins']) : [];
        $incoming = $config->get_all();

        foreach ($page_class::field_definitions() as $path => $spec) {
            $value = self::read_path($posted, $path);

            switch ($spec['type']) {
                case 'bool':
                    self::write_path($incoming, $path, $value !== null);
                    break;
                case 'int':
                    $int = is_numeric($value) ? (int) $value : null;
                    if ($int !== null) {
                        $int = max($spec['min'] ?? 0, min($spec['max'] ?? PHP_INT_MAX, $int));
                    }
                    if ($int !== null) {
                        self::write_path($incoming, $path, $int);
                    }
                    break;
                case 'int_list':
                    $items = [];
                    foreach (preg_split('/[\s,]+/', (string) $value) ?: [] as $item) {
                        $item = (int) $item;
                        if ($item >= ($spec['min'] ?? 16) && $item <= ($spec['max'] ?? 4000)) {
                            $items[] = $item;
                        }
                    }
                    self::write_path($incoming, $path, array_values(array_unique($items)));
                    break;
                case 'str_list':
                    $items = [];
                    foreach (preg_split('/\R/u', (string) $value) ?: [] as $item) {
                        $item = trim(sanitize_text_field($item));
                        if ($item !== '' && strlen($item) <= 256) {
                            $items[] = $item;
                        }
                    }
                    self::write_path($incoming, $path, array_values(array_unique($items)));
                    break;
                case 'text':
                    self::write_path($incoming, $path, sanitize_textarea_field((string) $value));
                    break;
                case 'select':
                    $val = (string) $value;
                    self::write_path($incoming, $path, in_array($val, $spec['options'] ?? [], true) ? $val : null);
                    break;
                case 'unload_rules':
                    self::write_path($incoming, $path, self::sanitize_unload_rules($value));
                    break;
            }
        }

        $config->save($incoming);
        self::after_save($config, false);

        wp_safe_redirect(add_query_arg(['page' => $page_slug, 'wpins_saved' => '1'], admin_url('admin.php')));
        exit;
    }

    /**
     * Shared post-save side effects: purge caches, kick the media offload
     * worker when offload settings changed, schedule an edge config sync.
     */
    private static function after_save(Config $config, bool $preset_change): void {
        CacheManager::purge_all_static();
        CacheIntegration::purge_foreign_caches('all');

        // Offload toggles/widths must reach the CDN worker promptly — kick
        // the queue worker due-now instead of waiting for the next tick.
        if ($config->get('media.offload_images', false) || $config->get('media.offload_video', false)) {
            wp_schedule_single_event(time(), 'wp_instant_media_offload', []);
            if (function_exists('spawn_cron')) {
                spawn_cron();
            }
        }

        // Keep the .htaccess marker block in sync with the saved settings:
        // enabling installs/refreshes it, disabling removes it, and saves
        // that touch rule-affecting settings (e.g. brotli_filters) rewrite it.
        // install() is idempotent and only writes + loopback-checks on a diff.
        if ((bool) $config->get('htaccess.enabled', true)) {
            Htaccess_Manager::install();
        } else {
            Htaccess_Manager::remove();
        }

        // Mirror the new config to the SaaS dashboard (non-blocking cron).
        if ($config->is_connected()) {
            wp_schedule_single_event(time(), 'wp_instant_config_sync', []);
            if (function_exists('spawn_cron')) {
                spawn_cron();
            }
        }
    }

    /** slug => page class map, shared by menu registration and the saver. */
    public static function registered_pages(): array {
        return [
            'wp-instant' => Page_Dashboard::class,
            'wp-instant-assets' => Page_Assets::class,
            'wp-instant-html-css' => Page_Html_Css::class,
            'wp-instant-js' => Page_Javascript::class,
            'wp-instant-advanced' => Page_Advanced::class,
        ];
    }

    /** Dot-path read from the raw posted array. */
    private static function read_path(array $posted, string $path) {
        $curr = $posted;
        foreach (explode('.', $path) as $seg) {
            if (!is_array($curr) || !array_key_exists($seg, $curr)) {
                return null;
            }
            $curr = $curr[$seg];
        }
        return $curr;
    }

    /** Dot-path write on the incoming config array. */
    private static function write_path(array &$target, string $path, mixed $value): void {
        $segs = explode('.', $path);
        $curr = &$target;
        foreach (array_slice($segs, 0, -1) as $seg) {
            if (!isset($curr[$seg]) || !is_array($curr[$seg])) {
                $curr[$seg] = [];
            }
            $curr = &$curr[$seg];
        }
        $curr[$segs[count($segs) - 1]] = $value;
    }

    /**
     * plugins.unload_rules: map of post type ('*' or a real post type name)
     * => list of plugin/theme slugs whose css/js get stripped on those pages.
     */
    private static function sanitize_unload_rules(mixed $value): array {
        if (!is_array($value)) {
            return [];
        }
        $valid_types = ['*'];
        foreach (get_post_types(['show_ui' => true], 'names') as $pt) {
            $valid_types[] = $pt;
        }

        $out = [];
        foreach ($value as $post_type => $slugs) {
            // sanitize_key() would strip both the '*' wildcard marker and the
            // 'theme:' prefix separator — preserve them explicitly.
            $post_type_raw = trim((string) $post_type);
            $post_type = $post_type_raw === '*' ? '*' : sanitize_key($post_type_raw);
            if (!in_array($post_type, $valid_types, true) || !is_array($slugs)) {
                continue;
            }
            $clean = array_values(array_filter(array_map(static function ($slug): string {
                $slug = trim((string) $slug);
                if (str_starts_with($slug, 'theme:')) {
                    $rest = sanitize_key(substr($slug, 6));
                    return $rest !== '' ? 'theme:' . $rest : '';
                }
                return sanitize_key($slug);
            }, $slugs), fn(string $s): bool => $s !== ''));
            if ($clean !== []) {
                $out[$post_type] = $clean;
            }
        }
        return $out;
    }
}
