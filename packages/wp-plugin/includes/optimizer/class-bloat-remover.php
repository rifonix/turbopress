<?php
namespace Turbopress;

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
