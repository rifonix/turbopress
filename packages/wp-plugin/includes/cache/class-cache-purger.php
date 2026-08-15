<?php
namespace Turbopress;

if (!defined('ABSPATH')) {
    exit;
}

class CachePurger {
    private CacheManager $cache_manager;

    public function __construct(CacheManager $cache_manager) {
        $this->cache_manager = $cache_manager;
    }

    public function init(): void {
        add_action('save_post', [$this, 'on_save_post'], 10, 2);
        add_action('deleted_post', [$this, 'on_deleted_post'], 10, 2);
        add_action('edit_terms', [$this, 'on_edit_terms']);
        add_action('wp_update_nav_menu', [$this, 'on_menu_update']);
        add_action('comment_post', [$this, 'on_comment_post'], 10, 2);
        add_action('turbopress_purge_all', [CacheManager::class, 'purge_all_static']);
    }

    public function on_save_post(int $post_id, \WP_Post $post): void {
        if (wp_is_post_revision($post_id) || wp_is_post_autosave($post_id) || $post->post_status !== 'publish') {
            return;
        }

        $permalink = get_permalink($post_id);
        if ($permalink) {
            CacheManager::purge_url($permalink);
            CacheIntegration::purge_foreign_caches('url', $permalink);
        }

        // Purge Homepage
        $home_url = get_home_url();
        CacheManager::purge_url($home_url);
        CacheManager::purge_url($home_url . '/');
        CacheIntegration::purge_foreign_caches('url', $home_url);

        // Purge Blog Archive if set
        $page_for_posts = get_option('page_for_posts');
        if ($page_for_posts) {
            $blog_url = get_permalink($page_for_posts);
            if ($blog_url) {
                CacheManager::purge_url($blog_url);
                CacheIntegration::purge_foreign_caches('url', $blog_url);
            }
        }
    }

    public function on_deleted_post(int $post_id, \WP_Post $post): void {
        $permalink = get_permalink($post_id);
        if ($permalink) {
            CacheManager::purge_url($permalink);
            CacheIntegration::purge_foreign_caches('url', $permalink);
        }
        CacheManager::purge_url(get_home_url());
        CacheIntegration::purge_foreign_caches('url', get_home_url());
    }

    public function on_edit_terms(): void {
        CacheManager::purge_all_static();
        CacheIntegration::purge_foreign_caches('all');
    }

    public function on_menu_update(): void {
        CacheManager::purge_all_static();
        CacheIntegration::purge_foreign_caches('all');
    }

    public function on_comment_post(int $comment_id, int|string $approved): void {
        if ($approved === 1 || $approved === '1') {
            $comment = get_comment($comment_id);
            if ($comment && $comment->comment_post_ID) {
                $url = get_permalink($comment->comment_post_ID);
                if ($url) {
                    CacheManager::purge_url($url);
                    CacheIntegration::purge_foreign_caches('url', $url);
                }
            }
        }
    }
}
