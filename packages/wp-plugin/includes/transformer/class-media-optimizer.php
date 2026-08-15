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
        $lcp_image = null;

        // Process <img> tags
        $html = preg_replace_callback(
            '/<img\s+([^>]+)>/i',
            function ($matches) use (&$lcp_image) {
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

                $is_lazy = (bool) preg_match('/loading\s*=\s*[\'"]lazy[\'"]/i', $attributes);
                $is_tiny = $this->is_tiny_image($attributes);

                // LCP candidate heuristic: first eager, non-tiny image in the document.
                // Lazy images are almost always below the fold — never preload those.
                if (
                    $lcp_image === null && !$is_lazy && !$is_tiny &&
                    $this->config->get('media.auto_fetchpriority_lcp', true)
                ) {
                    $lcp_image = $attributes;

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

        // Preload LCP Image in <head> (with responsive hints when available)
        if ($lcp_image !== null && $this->config->get('media.preload_lcp_image', true)) {
            $preload = $this->build_lcp_preload($lcp_image);
            if ($preload) {
                $html = preg_replace('/(<head[^>]*>)/i', "$1\n" . $preload, $html, 1);
            }
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

    private function is_tiny_image(string $attributes): bool {
        // Explicit small width/height => icons, spacers, avatars, tracking pixels.
        if (preg_match('/width=[\'"]?(\d+)[\'"]?/i', $attributes, $w)) {
            if ((int) $w[1] <= 100) {
                return true;
            }
        }
        if (preg_match('/height=[\'"]?(\d+)[\'"]?/i', $attributes, $h)) {
            if ((int) $h[1] <= 100) {
                return true;
            }
        }
        return false;
    }

    private function build_lcp_preload(string $attributes): ?string {
        if (!preg_match('/src=[\'"]([^\'"]+)[\'"]/i', $attributes, $src_match)) {
            return null;
        }
        $src = $src_match[1];

        $extra = '';
        // Responsive images: preload the exact candidate set the browser would pick.
        if (preg_match('/srcset=[\'"]([^\'"]+)[\'"]/i', $attributes, $ss)) {
            $extra .= ' imagesrcset="' . esc_attr($ss[1]) . '"';
            if (preg_match('/sizes=[\'"]([^\'"]+)[\'"]/i', $attributes, $sz)) {
                $extra .= ' imagesizes="' . esc_attr($sz[1]) . '"';
            }
        }

        return sprintf(
            '<link rel="preload" as="image" href="%s" fetchpriority="high"%s>',
            esc_url($src),
            $extra
        );
    }
}
