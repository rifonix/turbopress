<?php
namespace WPInstant;

if (!defined('ABSPATH')) {
    exit;
}

class MediaOptimizer {
    private Config $config;

    /** Per-request cache of local image dimension lookups. */
    private array $dimension_cache = [];

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

        $map = get_option('wp_instant_lcp_images', []);
        if (!is_array($map)) {
            $map = [];
        }
        if (($map[$key] ?? null) !== $image_url) {
            $map[$key] = $image_url;
            if (count($map) > 400) {
                $map = array_slice($map, -400, null, true);
            }
            update_option('wp_instant_lcp_images', $map);
        }
    }

    public static function get_lcp_image(string $url, string $viewport): ?string {
        $parsed = parse_url($url);
        $path = $parsed['path'] ?? '/';
        $key = md5($path . '_' . $viewport);
        $map = get_option('wp_instant_lcp_images', []);
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

                // Extract src (and the pre-offload original when present —
                // the media offload stage runs before this one, so src may
                // already be a signed worker URL).
                $src = '';
                if (preg_match('/src=[\'"]([^\'"]+)[\'"]/i', $attributes, $src_match)) {
                    $src = $src_match[1];
                }
                $orig_src = '';
                if (preg_match('/data-wpins-orig-src=[\'"]([^\'"]+)[\'"]/i', $attributes, $om)) {
                    $orig_src = $om[1];
                }

                // Exclude tiny tracking pixels and data URIs
                if (str_starts_with($src, 'data:') || strpos($src, 'spacer.gif') !== false) {
                    return $full_tag;
                }

                $is_lazy = (bool) preg_match('/loading\s*=\s*[\'"]lazy[\'"]/i', $attributes);
                $is_tiny = $this->is_tiny_image($attributes);

                // CLS: inject missing width/height from the local file so the
                // browser reserves layout space before the image loads.
                if ($this->config->get('media.inject_missing_dimensions', true)) {
                    $attributes = $this->maybe_inject_dimensions($attributes, $orig_src !== '' ? $orig_src : $src);
                }

                // The edge-verified LCP <img>: never lazy-load it — force
                // eager, high-priority fetch. Matching works against both the
                // (rewritten) src and the original origin URL.
                if ($verified_lcp !== null && $this->img_matches_lcp($src, $orig_src, $verified_lcp)) {
                    $clean = preg_replace('/loading=[\'"][^\'"]*[\'"]/i', '', $attributes);
                    $clean = preg_replace('/fetchpriority=[\'"][^\'"]*[\'"]/i', '', (string) $clean);
                    $clean = preg_replace('/decoding=[\'"][^\'"]*[\'"]/i', '', (string) $clean);
                    return '<img ' . trim((string) $clean) . ' fetchpriority="high" decoding="sync">';
                }

                // LCP candidate heuristic: first eager, non-tiny image in the document.
                // Skipped when the edge already verified a (possibly background) LCP.
                if (
                    $lcp_image === null && $verified_lcp === null && !$is_lazy && !$is_tiny &&
                    $this->config->get('media.auto_fetchpriority_lcp', true)
                ) {
                    $lcp_image = $attributes;

                    // Remove lazyload + any prior priority/decoding hints,
                    // then force the LCP fetch profile.
                    $clean_attrs = preg_replace('/loading=[\'"]lazy[\'"]/i', '', $attributes);
                    $clean_attrs = preg_replace('/fetchpriority=[\'"][^\'"]*[\'"]/i', '', (string) $clean_attrs);
                    $clean_attrs = preg_replace('/decoding=[\'"][^\'"]*[\'"]/i', '', (string) $clean_attrs);

                    return sprintf('<img %s fetchpriority="high" decoding="sync">', trim((string) $clean_attrs));
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
                    esc_url($this->lcp_fetch_url($verified_lcp))
                );
            } elseif ($lcp_image !== null) {
                $preload = $this->build_lcp_preload($lcp_image);
            }
            // Avoid duplicate image preloads if the theme already has one.
            if ($preload && stripos($html, 'rel="preload" as="image"') === false && stripos($html, "rel='preload' as='image'") === false) {
                $html = preg_replace_callback(
                    '/(<head[^>]*>)/i',
                    static fn(array $m): string => $m[1] . "\n" . $preload,
                    $html,
                    1
                ) ?? $html;
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

    /**
     * The URL the browser will actually fetch for the verified LCP image.
     * When R2 offload is active the MediaOffloader already rewrote the
     * matching <img>/url() to a signed worker URL — the preload must point
     * at the SAME URL or it is a wasted (double) fetch. For CSS-background
     * LCPs the offloader uses the max configured width + webp, so mirror
     * exactly that.
     */
    private function lcp_fetch_url(string $verified_lcp): string {
        if (!(bool) $this->config->get('media.offload_images', false)) {
            return $verified_lcp;
        }
        $own = strtolower((string) parse_url(home_url(), PHP_URL_HOST));
        $host = strtolower((string) parse_url($verified_lcp, PHP_URL_HOST));
        if ($own === '' || ($host !== $own && !str_ends_with($host, '.' . $own))) {
            return $verified_lcp; // third-party LCP: nothing was rewritten
        }
        foreach ((array) $this->config->get('media.excluded_images', []) as $ex) {
            if ($ex !== '' && stripos($verified_lcp, $ex) !== false) {
                return $verified_lcp; // excluded from offload: original stayed
            }
        }
        $offloader = new MediaOffloader($this->config);
        $widths = $offloader->usable_widths();
        $worker = $offloader->media_url($verified_lcp, max($widths), 'webp');
        return $worker !== null ? $worker : $verified_lcp;
    }

    /** Match an <img> against the edge-verified LCP URL (host+path compare). */
    private function img_matches_lcp(string $src, string $orig_src, string $verified_lcp): bool {
        foreach ([$src, $orig_src] as $candidate) {
            if ($candidate !== '' && $this->same_image($candidate, $verified_lcp)) {
                return true;
            }
        }
        return false;
    }

    private function same_image(string $a, string $b): bool {
        $pa = parse_url($a);
        $pb = parse_url($b);
        if (empty($pa['path']) || empty($pb['path'])) {
            return false;
        }
        $ha = strtolower((string) ($pa['host'] ?? ''));
        $hb = strtolower((string) ($pb['host'] ?? ''));
        // Host may legitimately differ (worker URL vs origin URL) — path is
        // the stable identity for own-host images.
        if ($pa['path'] !== $pb['path']) {
            return false;
        }
        if ($ha !== '' && $hb !== '' && $ha !== $hb) {
            $own = strtolower((string) parse_url(home_url(), PHP_URL_HOST));
            $api = strtolower((string) parse_url($this->config->get_api_url(), PHP_URL_HOST));
            $allowed = array_filter([$own, $api]);
            if (!in_array($ha, $allowed, true) || !in_array($hb, $allowed, true)) {
                return false;
            }
        }
        return true;
    }

    /**
     * Inject width/height attributes on <img> tags missing them, resolved
     * from the local file (same-origin only). Prevents CLS on images whose
     * dimensions the theme/plugin never declared.
     */
    private function maybe_inject_dimensions(string $attributes, string $resolve_src): string {
        $has_w = (bool) preg_match('/\swidth\s*=\s*[\'"]?\d+/i', $attributes);
        $has_h = (bool) preg_match('/\sheight\s*=\s*[\'"]?\d+/i', $attributes);
        if ($has_w && $has_h) {
            return $attributes;
        }
        if ($resolve_src === '' || str_starts_with($resolve_src, 'data:')) {
            return $attributes;
        }
        if (preg_match('~\.svg(?:[?#]|$)~i', $resolve_src)) {
            return $attributes; // vector: intrinsic size is scale-independent
        }

        $dims = $this->local_dimensions($resolve_src);
        if ($dims === null) {
            return $attributes;
        }

        // Inject only the missing dimension(s) — the existing one constrains
        // the aspect ratio the browser computes.
        if (!$has_w) {
            $attributes .= ' width="' . $dims[0] . '"';
        }
        if (!$has_h) {
            $attributes .= ' height="' . $dims[1] . '"';
        }
        return $attributes;
    }

    /** @return array{0:int,1:int}|null */
    private function local_dimensions(string $src): ?array {
        if (isset($this->dimension_cache[$src])) {
            return $this->dimension_cache[$src];
        }
        $result = null;
        $home = parse_url(home_url());
        $parsed = parse_url($src);
        if (
            !empty($home['host']) && !empty($parsed['host'])
            && strtolower((string) $home['host']) === strtolower((string) $parsed['host'])
        ) {
            $file = wp_normalize_path(ABSPATH . ltrim((string) ($parsed['path'] ?? '/'), '/'));
            if (str_starts_with($file, wp_normalize_path(ABSPATH)) && is_file($file)) {
                $size = @getimagesize($file);
                if (is_array($size) && !empty($size[0]) && !empty($size[1])) {
                    $result = [(int) $size[0], (int) $size[1]];
                }
            }
        }
        $this->dimension_cache[$src] = $result;
        return $result;
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
