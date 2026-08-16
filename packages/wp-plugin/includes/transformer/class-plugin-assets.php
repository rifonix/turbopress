<?php
namespace Turbopress;

if (!defined('ABSPATH')) {
    exit;
}

/**
 * Per-post-type plugin asset control.
 *
 * Config shape (plugins.unload_rules):
 *   { '<post_type>': ['plugin-folder', ...], '*': ['plugin-folder', ...] }
 *
 * On a page whose main query post type matches a rule key, every
 * <script src="/…/plugins/{slug}/…"> and <link href="/…/plugins/{slug}/…">
 * is removed from the HTML entirely — the classic "big plugin active
 * site-wide but only used on two pages" win, without disabling the plugin.
 *
 * Runs as the FIRST DomEngine stage: removed tags must not be counted,
 * deferred, combined or offloaded by later stages.
 */
class PluginAssets {
    private Config $config;

    public function __construct(Config $config) {
        $this->config = $config;
    }

    public function transform(string $html): string {
        $rules = $this->config->get('plugins.unload_rules', []);
        if (!is_array($rules) || $rules === []) {
            return $html;
        }

        $post_type = $this->current_post_type();

        // Rule keys: the page's post type, or '*' (all pages).
        $slugs = [];
        foreach (['*', $post_type] as $key) {
            if ($key !== '' && isset($rules[$key]) && is_array($rules[$key])) {
                foreach ($rules[$key] as $slug) {
                    $slug = sanitize_key((string) $slug);
                    if ($slug !== '' && $slug !== 'turbopress') {
                        $slugs[$slug] = true;
                    }
                }
            }
        }
        if ($slugs === [] || $post_type === null) {
            return $html;
        }

        foreach (array_keys($slugs) as $slug) {
            $base = preg_quote($slug, '#');

            // External scripts shipped by the plugin (whole tag + body).
            $html = preg_replace(
                '#<script\b[^>]*src=["\'][^"\']*?/plugins/' . $base . '/[^"\']*["\'][^>]*>[\s\S]*?</script>#i',
                '',
                $html
            ) ?? $html;

            // Stylesheets (and any other <link>) shipped by the plugin.
            $html = preg_replace(
                '#<link\b[^>]*href=["\'][^"\']*?/plugins/' . $base . '/[^"\']*["\'][^>]*>#i',
                '',
                $html
            ) ?? $html;
        }

        return $html;
    }

    /**
     * Post type of the page being rendered (main query), or null when it
     * cannot be determined reliably.
     */
    private function current_post_type(): ?string {
        $q = $GLOBALS['wp_query'] ?? null;
        if (!$q instanceof \WP_Query) {
            return null;
        }

        if ($q->is_singular() || $q->is_single() || $q->is_page()) {
            $obj = $q->get_queried_object();
            if ($obj instanceof \WP_Post && !empty($obj->post_type)) {
                return $obj->post_type;
            }
            return 'post';
        }

        if ($q->is_post_type_archive()) {
            $obj = $q->get_queried_object();
            if ($obj instanceof \WP_Post_Type && !empty($obj->name)) {
                return $obj->name;
            }
        }

        if ($q->is_home()) {
            return 'post';
        }

        if ($q->is_search() || $q->is_404()) {
            return '*'; // treat listings/404 as "any"
        }

        return null;
    }
}
