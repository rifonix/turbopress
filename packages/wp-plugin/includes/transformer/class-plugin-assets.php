<?php
namespace Turbopress;

if (!defined('ABSPATH')) {
    exit;
}

/**
 * Per-page and per-post-type plugin asset control.
 *
 * Config shape (plugins.unload_rules):
 *   { '<post_type>': ['plugin-folder', ...], '*': ['plugin-folder', ...] }
 *
 * Per-post meta shape (_turbopress_asset_exclusions):
 *   { 'plugins': ['plugin-folder'], 'assets': ['keyword', 'regex:/…/i'] }
 *
 * A page can therefore exclude an entire installed plugin, or individual
 * CSS/JS tags by a URL fragment, tag attribute, or explicit regex. Rules are
 * applied only to the current document and never disable the WP plugin.
 *
 * Runs as the FIRST DomEngine stage: removed tags must not be counted,
 * deferred, combined or offloaded by later stages.
 */
class PluginAssets {
    public const POST_META_KEY = '_turbopress_asset_exclusions';

    private Config $config;

    public function __construct(Config $config) {
        $this->config = $config;
    }

    /** Whether this request has any global or per-page rules to apply. */
    public function has_rules(): bool {
        $rules = $this->config->get('plugins.unload_rules', []);
        if (is_array($rules)) {
            foreach ($rules as $slugs) {
                if (is_array($slugs) && $slugs !== []) {
                    return true;
                }
            }
        }

        $post_rules = $this->get_post_rules($this->current_post_id());
        return $post_rules['plugins'] !== [] || $post_rules['assets'] !== [];
    }

    public function transform(string $html): string {
        $post_type = $this->current_post_type();
        $post_rules = $this->get_post_rules($this->current_post_id());
        $patterns = $post_rules['assets'];

        // Global rules apply to every page or to the current main-query type.
        $global_rules = $this->config->get('plugins.unload_rules', []);
        $slugs = [];
        if (is_array($global_rules)) {
            foreach (['*', $post_type] as $key) {
                if ($key !== null && $key !== '' && isset($global_rules[$key]) && is_array($global_rules[$key])) {
                    foreach ($global_rules[$key] as $slug) {
                        $slugs[sanitize_key((string) $slug)] = true;
                    }
                }
            }
        }

        foreach ($post_rules['plugins'] as $slug) {
            $slugs[sanitize_key((string) $slug)] = true;
        }

        foreach (array_keys($slugs) as $slug) {
            if ($slug === '' || $slug === 'turbopress') {
                continue;
            }
            // Match the stable WordPress plugin directory segment rather
            // than a bare slug, which could hit an unrelated asset name.
            $patterns[] = '/plugins/' . $slug . '/';
        }

        $patterns = array_values(array_unique(array_filter(array_map('trim', $patterns))));
        if ($patterns === []) {
            return $html;
        }

        // Remove complete external script tags (including inline bodies) and
        // link tags. Matching the complete tag also allows custom exclusions
        // to target an id, handle, URL, or other asset attribute.
        $result = preg_replace_callback(
            '#<script\b[^>]*>[\s\S]*?</script\s*>|<link\b[^>]*>#i',
            function (array $match) use ($patterns): string {
                foreach ($patterns as $pattern) {
                    if ($this->matches_pattern($match[0], $pattern)) {
                        return '';
                    }
                }
                return $match[0];
            },
            $html
        );

        return is_string($result) ? $result : $html;
    }

    /** @return array{plugins: string[], assets: string[]} */
    private function get_post_rules(?int $post_id): array {
        if (!$post_id) {
            return ['plugins' => [], 'assets' => []];
        }

        $raw = get_post_meta($post_id, self::POST_META_KEY, true);
        if (!is_array($raw)) {
            return ['plugins' => [], 'assets' => []];
        }

        $plugins = array_values(array_filter(array_map('sanitize_key', (array) ($raw['plugins'] ?? []))));
        $assets = [];
        foreach ((array) ($raw['assets'] ?? []) as $asset) {
            $asset = trim((string) $asset);
            if ($asset !== '' && strlen($asset) <= 512) {
                $assets[] = $asset;
            }
        }

        return ['plugins' => array_values(array_unique($plugins)), 'assets' => array_values(array_unique($assets))];
    }

    private function matches_pattern(string $tag, string $pattern): bool {
        if (str_starts_with(strtolower($pattern), 'regex:')) {
            $regex = trim(substr($pattern, 6));
            if ($regex === '' || strlen($regex) > 512) {
                return false;
            }
            return @preg_match($regex, $tag) === 1;
        }

        return stripos($tag, $pattern) !== false;
    }

    /**
     * Post type of the page being rendered (main query), or null when it
     * cannot be determined reliably.
     */
    private function current_post_type(): ?string {
        $post_id = $this->current_post_id();
        if ($post_id) {
            $post = get_post($post_id);
            if ($post instanceof \WP_Post && !empty($post->post_type)) {
                return $post->post_type;
            }
        }

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

    private function current_post_id(): ?int {
        $q = $GLOBALS['wp_query'] ?? null;
        if (!$q instanceof \WP_Query || !$q->is_singular()) {
            return null;
        }

        $id = (int) $q->get_queried_object_id();
        return $id > 0 ? $id : null;
    }
}
