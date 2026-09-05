<?php
namespace WPInstant\Admin;

if (!defined('ABSPATH')) {
    exit;
}

/**
 * WP Instant → HTML & CSS. Critical CSS, stylesheet delivery, HTML output
 * minification and the site-owner custom CSS box.
 */
class Page_Html_Css extends Settings_Page {
    protected string $slug = 'wp-instant-html-css';
    protected string $title = 'HTML & CSS';
    protected string $description = 'Above-the-fold CSS extraction, stylesheet delivery, and HTML output shaping.';

    public static function field_definitions(): array {
        return [
            'critical_css.enabled' => ['type' => 'bool'],
            'critical_css.inline' => ['type' => 'bool'],
            'critical_css.async_load_full' => ['type' => 'bool'],
            'critical_css.font_display_swap' => ['type' => 'bool'],
            'critical_css.excluded_stylesheets' => ['type' => 'str_list'],
            'css.combine' => ['type' => 'bool'],
            'css.minify' => ['type' => 'bool'],
            'css.inline_all' => ['type' => 'bool'],
            'html.minify' => ['type' => 'bool'],
            'html.minify_jsonld' => ['type' => 'bool'],
            'html.remove_html_comments' => ['type' => 'bool'],
            'custom_css' => ['type' => 'text'],
        ];
    }

    public function render(): void {
        ?>
        <div class="wpins-grid-2">
            <?php $this->card_open('Critical CSS', 'dashicons-editor-code', 'A real browser loads every page, extracts the CSS actually needed for first paint, and inlines it — zero render-blocking stylesheet requests.'); ?>
                <?php
                $this->toggle('critical_css', 'enabled', 'Edge Critical CSS', 'Per-page extraction for mobile and desktop');
                $this->toggle('critical_css', 'inline', 'Inline critical CSS');
                $this->toggle('critical_css', 'async_load_full', 'Async-load the full CSS', 'Remaining styles load right after first paint');
                $this->toggle('critical_css', 'font_display_swap', 'Font display swap');
                $this->list_field('critical_css', 'excluded_stylesheets', 'Excluded stylesheets', 'Never combine or defer these (one per line)', "elementor/post-123\nblock-library");
                ?>
            <?php $this->card_close(); ?>

            <?php $this->card_open('Stylesheet Delivery', 'dashicons-media-default', 'Merge and shrink render-blocking stylesheets.'); ?>
                <?php
                $this->toggle('css', 'combine', 'Combine stylesheets', 'Merge blocking sheets into one cached bundle');
                $this->toggle('css', 'minify', 'Minify CSS');
                $this->toggle('css', 'inline_all', 'Inline the whole stylesheet', 'When it fits, the full CSS is embedded in the HTML — no request at all');
                ?>
            <?php $this->card_close(); ?>

            <?php $this->card_open('HTML Output', 'dashicons-editor-justify', 'Shrink the document itself.'); ?>
                <?php
                $this->toggle('html', 'minify', 'Minify HTML', 'Scripts, styles and pre-formatted blocks are never touched');
                $this->toggle('html', 'minify_jsonld', 'Minify structured data', 'Compact schema.org JSON-LD blocks');
                $this->toggle('html', 'remove_html_comments', 'Remove HTML comments', 'IE conditional comments are always kept');
                ?>
            <?php $this->card_close(); ?>

            <?php $this->card_open('Custom CSS', 'dashicons-editor-css', 'Your own rules, injected last in the head so they win the cascade.'); ?>
                <?php
                $this->text_field('custom_css', '', 'CSS', '', true, '.hero-title { text-wrap: balance; }');
                ?>
            <?php $this->card_close(); ?>
        </div>
        <?php
    }
}
