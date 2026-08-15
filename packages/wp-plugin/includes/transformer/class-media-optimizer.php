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

    /**
     * Persist the edge-verified LCP image URL for a page/viewport so
     * transform() can preload CSS-background LCP candidates (the edge
     * extractor reports computed backgroundImage — invisible to <img> scans).
     */
    public static function store_lcp_image(string $url, string $viewport, string $image_url): void {
        $parsed = parse_url($url);
        $path = $parsed['path'] ?? '/';
        $key = md5($path . '_' . $viewport);

        $map = get_option('turbopress_lcp_images', []);
        if (!is_array($map)) {
            $map = [];
        }
        if (($map[$key] ?? null) !== $image_url) {
            $map[$key] = $image_url;
            if (count($map) > 400) {
                $map = array_slice($map, -400, null, true);
            }
            update_option('turbopress_lcp_images', $map);
        }
    }

    public static function get_lcp_image(string $url, string $viewport): ?string {
        $parsed = parse_url($url);
        $path = $parsed['path'] ?? '/';
        $key = md5($path . '_' . $viewport);
        $map = get_option('turbopress_lcp_images', []);
        return is_array($map) && !empty($map[$key]) ? (string) $map[$key] : null;
    }

    public function transform(string $html): string {
        $lcp_image = null;

        // Edge-verified LCP (covers CSS-background images the <img> scan
        // below can never see).
        $verified_lcp = self::get_lcp_image($this->get_current_url(), wp_is_mobile() ? 'mobile' : 'desktop');

        // Process <img> tags
        $html = preg_replace_callback(
            '/<img\s+([^>]+)>/i',
            function ($matches) use (&$lcp_image, $verified_lcp) {
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
                // Skipped when the edge already verified a (possibly background) LCP.
                if (
                    $lcp_image === null && $verified_lcp === null && !$is_lazy && !$is_tiny &&
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

        // Preload LCP Image in <head> (with responsive hints when available).
        // Edge-verified URL wins — it is the *measured* LCP element, which on
        // builder sites is usually a CSS background image.
        if ($this->config->get('media.preload_lcp_image', true)) {
            $preload = null;
            if ($verified_lcp !== null) {
                $preload = sprintf(
                    '<link rel="preload" as="image" href="%s" fetchpriority="high">',
                    esc_url($verified_lcp)
                );
            } elseif ($lcp_image !== null) {
                $preload = $this->build_lcp_preload($lcp_image);
            }
            // Avoid duplicate image preloads if the theme already has one.
            if ($preload && stripos($html, 'rel="preload" as="image"') === false && stripos($html, "rel='preload' as='image'") === false) {
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

    private function get_current_url(): string {
        $scheme = (isset($_SERVER['HTTPS']) && $_SERVER['HTTPS'] === 'on') ? 'https' : 'http';
        $host = $_SERVER['HTTP_HOST'] ?? 'localhost';
        $uri = $_SERVER['REQUEST_URI'] ?? '/';
        return $scheme . '://' . $host . $uri;
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
