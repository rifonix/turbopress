<?php
namespace Turbopress;

if (!defined('ABSPATH')) {
    exit;
}

/**
 * Self-Hosted Gravatar Caching Engine:
 * Intercepts external Gravatar avatar requests, saves images in local
 * disk cache, and rewrites URLs to eliminate third-party DNS and SSL overhead.
 */
class GravatarLocalizer {
    private Config $config;

    public function __construct(Config $config) {
        $this->config = $config;
    }

    public function transform(string $html): string {
        $media = $this->config->get('media', []);
        if (empty($media['self_host_gravatars'])) {
            return $html;
        }

        if (!str_contains($html, 'gravatar.com/avatar/')) {
            return $html;
        }

        $cache_dir = WP_CONTENT_DIR . '/cache/turbopress/avatars';
        if (!is_dir($cache_dir)) {
            wp_mkdir_p($cache_dir);
        }

        $pattern = '/<img\b[^>]*\bsrc=["\']([^"\']*gravatar\.com\/avatar\/[^"\']+)["\'][^>]*>/i';
        return preg_replace_callback($pattern, function (array $matches) use ($cache_dir): string {
            $img_tag = $matches[0];
            $gravatar_url = html_entity_decode($matches[1]);

            $local_url = $this->get_local_avatar_url($gravatar_url, $cache_dir);
            if (!$local_url) {
                return $img_tag;
            }

            // Replace src
            $new_tag = str_replace($matches[1], $local_url, $img_tag);

            // Replace within srcset if present
            if (preg_match('/srcset=["\']([^"\']+)["\']/i', $new_tag, $srcset_match)) {
                $original_srcset = $srcset_match[1];
                $new_srcset = preg_replace_callback('/(https?:\/\/[^\s,]*gravatar\.com\/avatar\/[^\s,]+)/i', function (array $m) use ($cache_dir): string {
                    $u = html_entity_decode($m[1]);
                    return $this->get_local_avatar_url($u, $cache_dir) ?: $m[1];
                }, $original_srcset) ?? $original_srcset;

                $new_tag = str_replace($original_srcset, $new_srcset, $new_tag);
            }

            return $new_tag;
        }, $html) ?? $html;
    }

    private function get_local_avatar_url(string $url, string $cache_dir): ?string {
        $hash = md5($url);
        $file_name = 'avatar-' . substr($hash, 0, 16) . '.png';
        $file_path = $cache_dir . '/' . $file_name;

        // Check if cached file is valid (7 days TTL)
        if (!file_exists($file_path) || (time() - filemtime($file_path)) > 604800) {
            $res = wp_remote_get($url, [
                'timeout' => 3,
                'sslverify' => false,
            ]);

            if (is_wp_error($res) || wp_remote_retrieve_response_code($res) !== 200) {
                return null;
            }

            $body = wp_remote_retrieve_body($res);
            if (empty($body)) {
                return null;
            }

            @file_put_contents($file_path, $body);
        }

        return content_url('/cache/turbopress/avatars/' . $file_name);
    }
}
