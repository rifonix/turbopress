<?php
namespace WPInstant\Admin;

if (!defined('ABSPATH')) {
    exit;
}

/**
 * WP Instant → Assets. Everything media & delivery: CDN offload, lazy
 * loading, asset proxy, fonts, and per-post-type plugin asset control.
 */
class Page_Assets extends Settings_Page {
    protected string $slug = 'wp-instant-assets';
    protected string $title = 'Assets';
    protected string $description = 'Images, video, css & js delivery — serve media from the CDN and load assets only when needed.';

    public static function field_definitions(): array {
        return [
            'media.offload_images' => ['type' => 'bool'],
            'media.offload_video' => ['type' => 'bool'],
            'media.offload_widths' => ['type' => 'int_list', 'min' => 16, 'max' => 4000],
            'media.image_quality' => ['type' => 'int', 'min' => 40, 'max' => 100],
            'media.excluded_images' => ['type' => 'str_list'],
            'media.lazyload_images' => ['type' => 'bool'],
            'media.lazyload_iframes' => ['type' => 'bool'],
            'media.lazyload_backgrounds' => ['type' => 'bool'],
            'media.video_facades' => ['type' => 'bool'],
            'media.video_lazyload_selfhosted' => ['type' => 'bool'],
            'media.preload_lcp_image' => ['type' => 'bool'],
            'media.auto_fetchpriority_lcp' => ['type' => 'bool'],
            'assets.proxy_enabled' => ['type' => 'bool'],
            'assets.serve_own_from_cdn' => ['type' => 'bool'],
            'fonts.localize_google' => ['type' => 'bool'],
            'fonts.preload_lcp_font' => ['type' => 'bool'],
            'plugins.unload_rules' => ['type' => 'unload_rules'],
        ];
    }

    public function render(): void {
        ?>
        <div class="wpins-grid-2">
            <?php $this->card_open('CDN Offload', 'cloud', 'Serve images and video from the global CDN — resized, converted to modern formats and cached at the edge. A rewrite can never break an asset: worst case it falls back to the original file.'); ?>
                <?php
                $this->toggle('media', 'offload_images', 'Offload images to the CDN', 'Responsive variants in modern formats, sized to each visitor\'s screen');
                $this->toggle('media', 'offload_video', 'Offload video to the CDN', 'Self-hosted video streamed from the edge with seek support');
                $this->range_field('media', 'image_quality', 'Image quality', 40, 100, 1, ' / 100');
                $this->text_field('media', 'offload_widths', 'Image widths (px)', 'Responsive sizes generated for every image — comma or space separated', false, '320 480 768 1200 1600');
                $this->list_field('media', 'excluded_images', 'Excluded images', 'Image URLs never offloaded or lazy-loaded (one per line)', 'wp-content/uploads/logo.png');
                ?>
            <?php $this->card_close(); ?>

            <?php $this->card_open('Lazy Loading', 'image', 'Load below-the-fold media only as it approaches the viewport.'); ?>
                <?php
                $this->toggle('media', 'lazyload_images', 'Lazy-load images');
                $this->toggle('media', 'lazyload_iframes', 'Lazy-load embeds & iframes', 'Maps, social embeds and other third-party frames');
                $this->toggle('media', 'lazyload_backgrounds', 'Lazy-load CSS background images', 'Builder section backgrounds below the fold');
                $this->toggle('media', 'video_facades', 'Video facades', 'YouTube embeds load the player only after a click');
                $this->toggle('media', 'video_lazyload_selfhosted', 'Lazy-load self-hosted video', 'preload=none on non-autoplaying videos');
                ?>
            <?php $this->card_close(); ?>

            <?php $this->card_open('LCP Priority', 'gauge', 'Make the largest element on each page paint as fast as possible.'); ?>
                <?php
                $this->toggle('media', 'preload_lcp_image', 'Preload the LCP image');
                $this->toggle('media', 'auto_fetchpriority_lcp', 'High-priority fetch for the LCP image');
                ?>
            <?php $this->card_close(); ?>

            <?php $this->card_open('CSS & JS Delivery', 'layers', 'Serve stylesheets and scripts from the CDN edge cache instead of your origin.'); ?>
                <?php
                $this->toggle('assets', 'proxy_enabled', 'Proxy third-party css & js', 'Foreign CDN assets served through the signed edge route');
                $this->toggle('assets', 'serve_own_from_cdn', 'Serve own css & js from the CDN', 'Theme bundles, combined CSS and scripts via the edge CDN');
                ?>
            <?php $this->card_close(); ?>

            <?php $this->card_open('Fonts', 'type', 'Eliminate third-party font handshakes.'); ?>
                <?php
                $this->toggle('fonts', 'localize_google', 'Localize Google Fonts', 'Self-host the font files with font-display:swap');
                $this->toggle('fonts', 'preload_lcp_font', 'Preload the primary font');
                ?>
            <?php $this->card_close(); ?>
        </div>

        <?php $this->render_plugin_asset_control(); ?>
        <?php
    }

    /**
     * Plugin Asset Control: per-post-type stripping of plugin css/js.
     * Rendered from the live plugin/theme catalogs (no edge round-trip).
     */
    private function render_plugin_asset_control(): void {
        $rules = (array) $this->get('plugins.unload_rules', []);
        $post_types = [['*', 'All pages']];
        foreach (get_post_types(['show_ui' => true], 'objects') as $pt) {
            if (in_array($pt->name, ['attachment', 'revision', 'nav_menu_item', 'custom_css'], true)) {
                continue;
            }
            $post_types[] = [$pt->name, $pt->labels->name ?? $pt->name];
        }

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
        $stylesheet = get_stylesheet();
        $template = get_template();
        $theme = wp_get_theme($stylesheet);
        // PluginAssets matches themes by their 'theme:<stylesheet>' marker —
        // the checkbox value must carry the same prefix or the rule never applies.
        if ($theme->exists()) {
            $plugins['theme:' . $stylesheet] = (string) ($theme->get('Name') ?: $stylesheet) . ' — theme';
        }
        if ($template !== $stylesheet) {
            $parent = wp_get_theme($template);
            if ($parent->exists()) {
                $plugins['theme:' . $template] = (string) ($parent->get('Name') ?: $template) . ' — parent theme';
            }
        }
        asort($plugins);
        ?>
        <div class="wpins-card">
            <div class="wpins-card-head">
                <span class="wpins-card-icon"><?php echo Icon::render('sliders', 17); ?></span>
                <div class="wpins-card-titles">
                    <h3>Plugin Asset Control</h3>
                    <p class="wpins-card-desc">Strip the css &amp; js of plugins a page doesn't use — big wins when many plugins are active.</p>
                </div>
            </div>
            <div class="wpins-card-body wpins-unload">
                <?php foreach ($post_types as [$pt_name, $pt_label]): ?>
                    <?php
                    $active = array_intersect($rules[$pt_name] ?? [], array_keys($plugins));
                    ?>
                    <details <?php echo $active ? 'open' : ''; ?> class="wpins-unload-group">
                        <summary>
                            <?php echo esc_html($pt_label); ?>
                            <?php if ($active): ?>
                                <span class="wpins-count"><?php echo count($active); ?> unloaded</span>
                            <?php endif; ?>
                        </summary>
                        <div class="wpins-unload-plugins">
                            <?php foreach ($plugins as $slug => $name): ?>
                                <label>
                                    <input type="checkbox"
                                        name="wpins[plugins][unload_rules][<?php echo esc_attr($pt_name); ?>][]"
                                        value="<?php echo esc_attr($slug); ?>"
                                        <?php checked(in_array($slug, $rules[$pt_name] ?? [], true)); ?>>
                                    <span><?php echo esc_html($name); ?></span>
                                </label>
                            <?php endforeach; ?>
                        </div>
                    </details>
                <?php endforeach; ?>
            </div>
        </div>
        <?php
    }
}
