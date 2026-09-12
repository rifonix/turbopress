<?php
namespace WPInstant;

if (!defined('ABSPATH')) {
    exit;
}

/**
 * Invalidation pump. Three safety layers borrowed from NitroPack:
 *
 * D2 — snapshot-diff: pre_post_update snapshots the visible state
 *      (post fields, terms, meta); save_post purges only when something
 *      actually changed. Cron-driven "modified" touches no longer nuke
 *      the whole cache for nothing.
 *
 * D3 — shutdown purge queue: purges are recorded and deduped, then
 *      executed after the response ships. Admin requests are never
 *      blocked and bursts collapse into one flush.
 *
 * D1 — soft invalidation: default purges rename entries to `.stale`
 *      (served up to 24h while revalidating). Hard deletes are reserved
 *      for URLs that disappear.
 */
class CachePurger {
    private CacheManager $cache_manager;

    /** @var array<string, array{url: string, hard: bool}> */
    private static array $queue = [];
    private static bool $queued_all = false;
    private static bool $flush_registered = false;

    /** @var array<int, array{post: array, terms: string, meta: string}> */
    private static array $pre_snapshots = [];

    public function __construct(CacheManager $cache_manager) {
        $this->cache_manager = $cache_manager;
    }

    public function init(): void {
        add_action('save_post', [$this, 'on_save_post'], 10, 2);
        add_action('deleted_post', [$this, 'on_deleted_post'], 10, 2);
        add_action('transition_post_status', [$this, 'on_transition_post_status'], 10, 3);
        add_action('edit_terms', [$this, 'on_edit_terms']);
        add_action('wp_update_nav_menu', [$this, 'on_menu_update']);
        add_action('comment_post', [$this, 'on_comment_post'], 10, 2);
        add_action('wp_instant_purge_all', [CacheManager::class, 'purge_all_static']);
        add_action('pre_post_update', [$this, 'on_pre_post_update']);

        if (!self::$flush_registered) {
            self::$flush_registered = true;
            register_shutdown_function([self::class, 'flush_queue']);
        }
    }

    /** D2: capture the pre-write state for diffing at save_post. */
    public function on_pre_post_update(int $post_id): void {
        $post = get_post($post_id);
        if (!$post || $post->post_type === 'revision') {
            return;
        }
        self::$pre_snapshots[$post_id] = [
            'post' => self::visible_post_fields($post),
            'terms' => self::terms_fingerprint($post_id),
            'meta' => self::meta_fingerprint($post_id),
        ];
    }

    public function on_save_post(int $post_id, \WP_Post $post): void {
        if (wp_is_post_revision($post_id) || wp_is_post_autosave($post_id) || $post->post_status !== 'publish') {
            return;
        }

        // D2: nothing visibly changed -> keep the cache warm.
        $snapshot = self::$pre_snapshots[$post_id] ?? null;
        unset(self::$pre_snapshots[$post_id]);
        if ($snapshot !== null) {
            $post_now = get_post($post_id);
            $unchanged = $post_now
                && self::visible_post_fields($post_now) === $snapshot['post']
                && self::terms_fingerprint($post_id) === $snapshot['terms']
                && self::meta_fingerprint($post_id) === $snapshot['meta'];
            if ($unchanged) {
                return;
            }
        }

        $permalink = get_permalink($post_id);
        if ($permalink) {
            self::queue_url($permalink);
            // Content/layout changed → cached critical CSS is stale; drop it
            // so the next request re-extracts (no TTL-only waiting).
            if (class_exists(CriticalCssTransformer::class)) {
                CriticalCssTransformer::invalidate_url($permalink);
            }
        }

        // Purge Homepage
        $home_url = get_home_url();
        self::queue_url($home_url);
        self::queue_url($home_url . '/');

        // Purge Blog Archive if set
        $page_for_posts = get_option('page_for_posts');
        if ($page_for_posts) {
            $blog_url = get_permalink($page_for_posts);
            if ($blog_url) {
                self::queue_url($blog_url);
            }
        }
    }

    public function on_deleted_post(int $post_id, \WP_Post $post): void {
        // Hard purge: the URL is gone — stale serving would 404 anyway.
        $permalink = get_permalink($post_id);
        if ($permalink) {
            self::queue_url($permalink, true);
        }
        self::queue_url(get_home_url());
    }

    /**
     * Unpublish purge: publish → draft/private/trash fires save_post with a
     * non-publish status (which on_save_post intentionally skips), so without
     * this the cached page stays live up to the full TTL.
     */
    public function on_transition_post_status(string $new_status, string $old_status, \WP_Post $post): void {
        if ($old_status !== 'publish' || $new_status === 'publish') {
            return;
        }
        $permalink = get_permalink($post);
        if ($permalink) {
            self::queue_url($permalink, true);
        }
        self::queue_url(get_home_url());
        $page_for_posts = get_option('page_for_posts');
        if ($page_for_posts) {
            $blog_url = get_permalink((int) $page_for_posts);
            if ($blog_url) {
                self::queue_url($blog_url);
            }
        }
    }

    public function on_edit_terms(): void {
        self::queue_all();
    }

    public function on_menu_update(): void {
        self::queue_all();
    }

    public function on_comment_post(int $comment_id, int|string $approved): void {
        if ($approved === 1 || $approved === '1') {
            $comment = get_comment($comment_id);
            if ($comment && $comment->comment_post_ID) {
                $url = get_permalink($comment->comment_post_ID);
                if ($url) {
                    self::queue_url($url);
                }
            }
        }
    }

    /** D3: record a URL purge (deduped; hard wins over soft). */
    public static function queue_url(string $url, bool $hard = false): void {
        $key = md5($url);
        $hard = $hard || (self::$queue[$key]['hard'] ?? false);
        self::$queue[$key] = ['url' => $url, 'hard' => $hard];
    }

    /** D3: a single all-scope purge beats any queued URL purges. */
    public static function queue_all(): void {
        self::$queued_all = true;
    }

    /** D3: flush at shutdown — after the response, deduped, never blocking. */
    public static function flush_queue(): void {
        if (self::$queued_all) {
            self::$queued_all = false;
            CacheManager::purge_all_static();
            CacheIntegration::purge_foreign_caches('all');
            // A full purge leaves every page cold — re-render the front
            // page in the background so the next visitor hits warm cache.
            if (class_exists(CacheWarmer::class)) {
                CacheWarmer::queue_homepage();
            }
            return;
        }

        if (self::$queue === []) {
            return;
        }

        $warmed = [];
        foreach (self::$queue as $entry) {
            CacheManager::purge_url($entry['url'], $entry['hard']);
            CacheIntegration::purge_foreign_caches('url', $entry['url']);
            // Hard-purged URLs have no stale twin to serve — warm them.
            // Soft-purged URLs keep serving .stale + self-revalidate, so
            // only the invalidated URL itself is re-rendered when cheap.
            $warmed[] = $entry['url'];
        }
        self::$queue = [];

        if ($warmed !== [] && class_exists(CacheWarmer::class)) {
            CacheWarmer::queue($warmed);
        }
    }

    private static function visible_post_fields(\WP_Post $post): array {
        $fields = $post->to_array();
        // Volatile columns that change without any visible difference.
        unset($fields['post_modified'], $fields['post_modified_gmt'], $fields['comment_count']);
        return $fields;
    }

    private static function terms_fingerprint(int $post_id): string {
        $post_type = get_post_type($post_id) ?: 'post';
        $taxonomies = get_object_taxonomies($post_type);
        if ($taxonomies === []) {
            return '';
        }
        $terms = wp_get_object_terms($post_id, $taxonomies);
        if (is_wp_error($terms)) {
            return 'error';
        }
        $ids = array_map(static fn($t) => (int) $t->term_id, is_array($terms) ? $terms : []);
        sort($ids);
        return implode(',', $ids);
    }

    private static function meta_fingerprint(int $post_id): string {
        $meta = get_post_meta($post_id);
        ksort($meta);
        return md5((string) wp_json_encode($meta));
    }
}
