<?php
namespace Turbopress;

if (!defined('ABSPATH')) {
    exit;
}

/**
 * Relational Auto-Purge Engine:
 * Intelligently invalidates related taxonomy archives, author archives,
 * shop pages, and the homepage when content or stock changes.
 */
class AutoPurge {
    private Config $config;

    public function __construct(Config $config) {
        $this->config = $config;
    }

    public function init(): void {
        $caching = $this->config->get('caching', []);
        if (empty($caching['enabled'])) {
            return;
        }

        // Relational purge on post save/update
        if (!empty($caching['purge_on_post_update']) || !empty($caching['relational_auto_purge'])) {
            add_action('post_updated', [$this, 'handle_post_updated'], 10, 3);
            add_action('future_to_publish', [$this, 'handle_future_publish'], 10, 1);
        }

        // Comment update purge
        if (!empty($caching['purge_on_comment'])) {
            add_action('wp_update_comment_count', [$this, 'handle_comment_updated'], 10, 1);
        }

        // WooCommerce product and stock update integrations
        add_action('woocommerce_product_set_stock', [$this, 'handle_wc_product_purge'], 10, 1);
        add_action('woocommerce_variation_set_stock', [$this, 'handle_wc_product_purge'], 10, 1);
    }

    public function handle_future_publish(\WP_Post $post): void {
        $this->handle_post_updated($post->ID, $post, $post);
    }

    public function handle_post_updated(int $post_id, \WP_Post $post_after, \WP_Post $post_before): void {
        if (!in_array($post_after->post_status, ['publish', 'trash'], true) && !in_array($post_before->post_status, ['publish', 'trash'], true)) {
            return;
        }

        if ($post_after->post_type === 'nav_menu_item' || $post_after->post_type === 'revision') {
            return;
        }

        $urls = [];

        // 1. Post permalinks (before & after in case of slug change)
        $perm_after = get_permalink($post_after);
        if ($perm_after) {
            $urls[] = $perm_after;
        }
        $perm_before = get_permalink($post_before);
        if ($perm_before && $perm_before !== $perm_after) {
            $urls[] = $perm_before;
        }

        // 2. Relational archives
        $caching = $this->config->get('caching', []);
        $relational = !isset($caching['relational_auto_purge']) || !empty($caching['relational_auto_purge']);

        if ($relational) {
            // Homepage
            $urls[] = home_url('/');

            // Blog archive
            $posts_page_id = (int) get_option('page_for_posts');
            if ($posts_page_id > 0) {
                $blog_url = get_permalink($posts_page_id);
                if ($blog_url) {
                    $urls[] = $blog_url;
                }
            }

            // Post type archive
            $archive_url = get_post_type_archive_link($post_after->post_type);
            if ($archive_url) {
                $urls[] = $archive_url;
            }

            // Author archive
            if (!empty($post_after->post_author)) {
                $author_url = get_author_posts_url((int) $post_after->post_author);
                if ($author_url) {
                    $urls[] = $author_url;
                }
            }

            // Taxonomy archives (categories, tags, custom taxonomies)
            $tax_urls = $this->get_post_taxonomy_urls($post_id);
            foreach ($tax_urls as $tu) {
                $urls[] = $tu;
            }

            // WooCommerce shop page
            if (function_exists('wc_get_page_id') && class_exists('WooCommerce')) {
                $shop_id = wc_get_page_id('shop');
                if ($shop_id > 0) {
                    $shop_url = get_permalink($shop_id);
                    if ($shop_url) {
                        $urls[] = $shop_url;
                    }
                }
            }
        }

        $unique_urls = array_values(array_unique(array_filter($urls, 'is_string')));
        if (empty($unique_urls)) {
            return;
        }

        // Purge each URL from local drop-in cache
        foreach ($unique_urls as $u) {
            CacheManager::purge_url($u);
        }

        // Purge foreign and host reverse proxies
        CacheIntegration::purge_foreign_caches('urls');
    }

    public function handle_comment_updated(int $post_id): void {
        if (!is_post_type_viewable(get_post_type($post_id))) {
            return;
        }
        $url = get_permalink($post_id);
        if ($url) {
            CacheManager::purge_url($url);
        }
    }

    public function handle_wc_product_purge($product): void {
        if (!is_object($product)) {
            return;
        }
        $product_id = method_exists($product, 'get_id') ? $product->get_id() : (int) $product;
        if ($product_id <= 0) {
            return;
        }

        $post = get_post($product_id);
        if ($post instanceof \WP_Post) {
            $this->handle_post_updated($product_id, $post, $post);
        }
    }

    private function get_post_taxonomy_urls(int $post_id): array {
        $urls = [];
        $taxonomies = get_object_taxonomies(get_post_type($post_id), 'objects');

        foreach ($taxonomies as $tax) {
            if (empty($tax->publicly_queryable) && empty($tax->public)) {
                continue;
            }

            $terms = get_the_terms($post_id, $tax->name);
            if (!is_array($terms)) {
                continue;
            }

            foreach ($terms as $term) {
                $link = get_term_link($term, $tax->name);
                if (!is_wp_error($link) && is_string($link)) {
                    $urls[] = $link;
                }
            }
        }

        return $urls;
    }
}
