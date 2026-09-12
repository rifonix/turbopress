<?php
namespace WPInstant;

if (!defined('ABSPATH')) {
    exit;
}

/**
 * WordPress Core Bloat Remover & Performance Cleaner:
 * Dequeues unused scripts and styles, shuts down brute-force attack surfaces (XML-RPC),
 * controls background admin polling (Heartbeat), and limits post revisions.
 */
class BloatRemover {
    private Config $config;

    public function __construct(Config $config) {
        $this->config = $config;
    }

    public function init(): void {
        $bloat = $this->config->get('bloat', []);
        if (empty($bloat)) {
            return;
        }

        if (!empty($bloat['disable_emojis'])) {
            $this->disable_emojis();
        }

        if (!empty($bloat['disable_dashicons_guest'])) {
            add_action('wp_enqueue_scripts', [$this, 'disable_dashicons'], 100);
        }

        if (!empty($bloat['disable_xmlrpc'])) {
            $this->disable_xmlrpc();
        }

        // Head cruft, block CSS bloat and comment-reply are ON unless
        // explicitly disabled: they are pure removals of tags WordPress
        // emits for legacy clients, with per-request guards for the cases
        // that still need them (block themes, block content, discussion).
        if (!isset($bloat['disable_head_cruft']) || !empty($bloat['disable_head_cruft'])) {
            $this->disable_head_cruft();
        }

        if (!isset($bloat['disable_block_bloat']) || !empty($bloat['disable_block_bloat'])) {
            add_action('wp_enqueue_scripts', [$this, 'disable_block_bloat'], 100);
        }

        if (!isset($bloat['disable_comment_reply']) || !empty($bloat['disable_comment_reply'])) {
            add_action('wp_enqueue_scripts', [$this, 'disable_comment_reply'], 100);
        }

        if (!empty($bloat['disable_oembeds'])) {
            $this->disable_oembeds();
        }

        if (!empty($bloat['heartbeat_control'])) {
            $this->control_heartbeat();
        }

        if (isset($bloat['post_revisions_limit']) && is_numeric($bloat['post_revisions_limit'])) {
            add_filter('wp_revisions_to_keep', [$this, 'control_post_revisions'], 10, 2);
        }
    }

    private function disable_emojis(): void {
        remove_action('wp_head', 'print_emoji_detection_script', 7);
        remove_action('admin_print_scripts', 'print_emoji_detection_script');
        remove_action('wp_print_styles', 'print_emoji_styles');
        remove_action('admin_print_styles', 'print_emoji_styles');
        remove_filter('the_content_feed', 'wp_staticize_emoji');
        remove_filter('comment_text_rss', 'wp_staticize_emoji');
        remove_filter('wp_mail', 'wp_staticize_emoji_for_email');
        add_filter('tiny_mce_plugins', static function (array $plugins): array {
            return array_diff($plugins, ['wpemoji']);
        });
        add_filter('wp_resource_hints', static function (array $urls, string $relation_type): array {
            if ($relation_type === 'dns-prefetch') {
                $urls = array_filter($urls, static fn($url) => !str_contains($url, 's.w.org/images/core/emoji'));
            }
            return $urls;
        }, 10, 2);
    }

    public function disable_dashicons(): void {
        if (!is_user_logged_in()) {
            wp_dequeue_style('dashicons');
            wp_deregister_style('dashicons');
        }
    }

    private function disable_xmlrpc(): void {
        add_filter('xmlrpc_enabled', '__return_false');
        add_filter('xmlrpc_methods', static fn() => []);
        remove_action('wp_head', 'rsd_link');
        remove_action('wp_head', 'wlwmanifest_link');
    }

    private function disable_oembeds(): void {
        remove_action('wp_head', 'wp_oembed_add_discovery_links');
        remove_action('wp_head', 'wp_oembed_add_host_js');
        // The host resizer script: with discovery gone nothing new can
        // depend on it; pages rendering legacy embeds keep their HTML.
        add_action('wp_enqueue_scripts', static function (): void {
            wp_deregister_script('wp-embed');
        }, 100);
    }

    /**
     * Legacy <head> tags for clients nobody runs anymore (RSD/Blog clients,
     * Windows Live Writer, adjacent-post prefetchers). The main posts feed
     * link is kept — readers subscribe to it; extra taxonomy/comment feeds,
     * the shortlink, the generator meta and the wp-json discovery link go.
     */
    private function disable_head_cruft(): void {
        remove_action('wp_head', 'rsd_link');
        remove_action('wp_head', 'wlwmanifest_link');
        remove_action('wp_head', 'wp_generator');
        remove_action('wp_head', 'wp_shortlink_wp_head', 10);
        remove_action('wp_head', 'adjacent_posts_rel_link_wp_head', 10);
        remove_action('wp_head', 'rest_output_link_wp_head', 10);
        remove_action('wp_head', 'feed_links_extra', 3);
    }

    /**
     * Gutenberg asset weight on non-block pages: block-library stylesheets
     * and the global-styles inline blob (duotone presets, layout variables).
     * Skipped for block themes and for singular content that actually uses
     * blocks — those pages need the CSS.
     */
    public function disable_block_bloat(): void {
        if (is_admin()) {
            return;
        }
        if (function_exists('wp_is_block_theme') && wp_is_block_theme()) {
            return;
        }
        if (is_singular()) {
            $id = get_queried_object_id();
            if ($id > 0 && function_exists('has_blocks') && has_blocks($id)) {
                return;
            }
        }
        foreach (['wp-block-library', 'wp-block-library-theme', 'classic-theme-styles'] as $handle) {
            wp_dequeue_style($handle);
            wp_deregister_style($handle);
        }
        remove_action('wp_enqueue_scripts', 'wp_enqueue_global_styles', 10);
        remove_action('wp_body_open', 'wp_global_styles_render_svg_filters', 10);
        remove_action('wp_footer', 'wp_global_styles_render_svg_filters', 10);
    }

    /**
     * comment-reply.js is only needed on singular views with open,
     * threaded comments. Everywhere else it is a wasted render-blocking
     * request.
     */
    public function disable_comment_reply(): void {
        if (is_admin()) {
            return;
        }
        if (is_singular() && comments_open() && (int) get_option('thread_comments') === 1) {
            return;
        }
        wp_dequeue_script('comment-reply');
        wp_deregister_script('comment-reply');
    }

    private function control_heartbeat(): void {
        add_filter('heartbeat_settings', static function (array $settings): array {
            $settings['interval'] = 60; // Throttled to 60 seconds
            return $settings;
        });

        // Disable heartbeat entirely on frontend
        add_action('init', static function (): void {
            if (!is_admin()) {
                wp_deregister_script('heartbeat');
            }
        }, 1);
    }

    public function control_post_revisions(int $num, \WP_Post $post): int {
        $bloat = $this->config->get('bloat', []);
        $limit = (int) ($bloat['post_revisions_limit'] ?? 3);
        return max(0, $limit);
    }
}
