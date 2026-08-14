<?php
namespace Turbopress;

if (!defined('ABSPATH')) {
    exit;
}

class MediaOptimizer {
    private Config $config;

    public function __construct(Config $config) {
        $this->config = $config;
    }

    public function transform(string $html): string {
        $is_first_image = true;
        $lcp_image_url = null;

        // Process <img> tags
        $html = preg_replace_callback(
            '/<img\s+([^>]+)>/i',
            function ($matches) use (&$is_first_image, &$lcp_image_url) {
                $full_tag = $matches[0];
                $attributes = $matches[1];

                // Extract src
                $src = '';
                if (preg_match('/src=[\'"]([^\'"]+)[\'"]/i', $attributes, $src_match)) {
                    $src = $src_match[1];
                }

                // Exclude tiny tracking pixels and data URIs
                if (str_starts_with($src, 'data:') || strpos($src, 'spacer.gif') !== false) {
                    return $full_tag;
                }

                if ($is_first_image && $this->config->get('media.auto_fetchpriority_lcp', true)) {
                    $is_first_image = false;
                    $lcp_image_url = $src;

                    // Remove lazyload and add fetchpriority="high"
                    $clean_attrs = preg_replace('/loading=[\'"]lazy[\'"]/i', '', $attributes);
                    $clean_attrs = preg_replace('/fetchpriority=[\'"][^\'"]*[\'"]/i', '', $clean_attrs);

                    return sprintf('<img %s fetchpriority="high" decoding="sync">', trim($clean_attrs));
                }

                // Below the fold images: ensure lazy loading and async decoding
                if ($this->config->get('media.lazyload_images', true)) {
                    if (strpos($attributes, 'loading=') === false) {
                        $attributes .= ' loading="lazy"';
                    }
                    if (strpos($attributes, 'decoding=') === false) {
                        $attributes .= ' decoding="async"';
                    }
                }

                return '<img ' . trim($attributes) . '>';
            },
            $html
        );

        // Preload LCP Image in <head>
        if (!empty($lcp_image_url) && $this->config->get('media.preload_lcp_image', true)) {
            $preload_tag = sprintf(
                '<link rel="preload" as="image" href="%s" fetchpriority="high">',
                esc_url($lcp_image_url)
            );
            $html = preg_replace('/(<head[^>]*>)/i', "$1\n" . $preload_tag, $html, 1);
        }

        // Lazyload Iframes (YouTube, Google Maps, etc.)
        if ($this->config->get('media.lazyload_iframes', true)) {
            $html = preg_replace_callback(
                '/<iframe\s+([^>]+)>/i',
                function ($matches) {
                    $attributes = $matches[1];
                    if (strpos($attributes, 'loading=') === false) {
                        return '<iframe ' . trim($attributes) . ' loading="lazy">';
                    }
                    return $matches[0];
                },
                $html
            );
        }

        return $html;
    }
}
