<?php
namespace Turbopress;

if (!defined('ABSPATH')) {
    exit;
}

class CriticalCssTransformer {
    private Config $config;
    private ApiClient $api_client;

    public function __construct(Config $config, ApiClient $api_client) {
        $this->config = $config;
        $this->api_client = $api_client;
    }

    public function transform(string $html): string {
        $current_url = $this->get_current_url();
        $is_mobile = wp_is_mobile();
        $viewport = $is_mobile ? 'mobile' : 'desktop';

        $optimizer = new CssOptimizer($this->config);

        // Tier 1: INLINE-ALL — when the whole combined stylesheet fits the
        // threshold, inline it directly. No deferral, no critical-CSS
        // extraction needed, no FOUC and no missing backgrounds/overlays BY
        // CONSTRUCTION (the full CSS is present before first paint).
        $inlined = $optimizer->try_inline_all($html);
        if ($inlined !== null) {
            // Keep the edge pipeline flowing: jobs feed LCP-image data and
            // the dashboard audits even when their CSS output goes unused.
            $this->maybe_dispatch_generation($current_url);
            return $inlined;
        }

        $critical_css = $this->get_critical_css($current_url, $viewport);
        $used_local_fallback = false;

        if (!empty($critical_css)) {
            // Edge critical CSS available.
        } elseif (($fallback = $this->maybe_local_fallback($html, $current_url, $viewport)) !== null) {
            // Edge CSS pending beyond the grace window: serve a local
            // heuristic extraction so pages aren't FOUC-risky in the meantime.
            $critical_css = $fallback;
            $used_local_fallback = true;
        }

        if (!empty($critical_css)) {
            // Tier 2: inline @font-face rules extracted from the page's own
            // sheets next to the critical CSS, so custom fonts (e.g.
            // theme-uploaded woff2 inside Elementor post-*.css) render
            // immediately with swap instead of waiting for the async bundle.
            $font_faces = $optimizer->extract_font_faces($html);
            $style_id = $used_local_fallback ? 'turbopress-critical-css tp-fallback' : 'turbopress-critical-css';
            $style_tag = sprintf(
                '<style id="%s">%s%s</style>',
                $style_id,
                $font_faces,
                $critical_css
            );
            $html = preg_replace('/(<head[^>]*>)/i', "$1\n" . $style_tag, $html, 1);

            // Combine + async-load the remaining stylesheets — ONLY with
            // verified edge CSS. The local heuristic fallback is truncated
            // (~50KB) and incomplete; deferring full sheets on top of it is
            // exactly how backgrounds go permanently missing. Worst case
            // with fallback CSS = brief double-render, never broken styles.
            if (!$used_local_fallback && $this->config->get('critical_css.async_load_full', true)) {
                $html = $optimizer->defer_stylesheets($html);
            }
        } else {
            // Asynchronously dispatch Critical CSS extraction job to Cloudflare Edge
            $this->maybe_dispatch_generation($current_url);
            // Keep stylesheets blocking: no critical CSS yet, async-loading
            // the full sheets would flash unstyled content.
        }

        return is_string($html) ? $html : '';
    }

    private function get_critical_css(string $url, string $viewport): ?string {
        $host = isset($_SERVER['HTTP_HOST']) ? strtolower($_SERVER['HTTP_HOST']) : 'localhost';
        $parsed = parse_url($url);
        $path = $parsed['path'] ?? '/';
        $url_hash = md5($path . '_' . $viewport);

        $cache_file = TURBOPRESS_CACHE_DIR . '/' . md5($host) . '/css/' . $url_hash . '.css';

        if (file_exists($cache_file)) {
            return @file_get_contents($cache_file);
        }

        return null;
    }

    /**
     * Persist critical CSS for a URL/viewport under every host variant the
     * site may be requested with (request host + home_url host + www variants).
     */
    public static function write_cache_for_url(string $url, string $viewport, string $css): void {
        if (empty($css)) {
            return;
        }

        $parsed = parse_url($url);
        $path = $parsed['path'] ?? '/';
        $url_hash = md5($path . '_' . $viewport);

        $hosts = [];
        $url_host = isset($parsed['host']) ? strtolower($parsed['host']) : '';
        if ($url_host) {
            $hosts[] = $url_host;
        }
        $home_host = parse_url(get_home_url(), PHP_URL_HOST);
        if ($home_host) {
            $hosts[] = strtolower($home_host);
        }
        // Cover www <-> non-www mismatches between request host and siteurl.
        foreach (array_unique(array_filter($hosts)) as $h) {
            $hosts[] = str_starts_with($h, 'www.') ? substr($h, 4) : 'www.' . $h;
        }
        $hosts = array_unique(array_filter($hosts));

        foreach ($hosts as $host) {
            $dir = TURBOPRESS_CACHE_DIR . '/' . md5($host) . '/css';
            if (!file_exists($dir)) {
                wp_mkdir_p($dir);
            }
            @file_put_contents($dir . '/' . $url_hash . '.css', $css);
        }
    }

    /**
     * Local heuristic fallback when the edge pipeline is slow/unavailable.
     * Activated only after a dispatch has been pending for >10 minutes, so
     * normal edge turnaround (~1-2 min) always wins with better CSS.
     *
     * Heuristic: concat same-origin screen stylesheets (in DOM order, capped
     * at ~50KB), drop @media print blocks, keep :root/@font-face foundation
     * rules, light minification. Imperfect but FOUC-safe.
     */
    private function maybe_local_fallback(string $html, string $url, string $viewport): ?string {
        $option_key = 'turbopress_css_dispatched';
        $dispatched = get_option($option_key, []);
        $url_key = md5($url);
        if (empty($dispatched[$url_key]) || (time() - (int) $dispatched[$url_key]) < 600) {
            return null;
        }

        $host = parse_url($url, PHP_URL_HOST) ?: (parse_url(home_url(), PHP_URL_HOST) ?? '');
        if ($host === '') {
            return null;
        }
        $home_host = strtolower((string) parse_url(home_url(), PHP_URL_HOST));

        $css_parts = [];
        $bytes = 0;
        $limit = 51200; // ~50KB

        if (preg_match_all('/<link\s+[^>]*href=[\'"]([^\'"]+)[\'"][^>]*>/i', $html, $link_matches)) {
            foreach ($link_matches[1] as $href) {
                if ($bytes >= $limit || count($css_parts) >= 8) {
                    break;
                }
                if (!preg_match('/\.css(\?|$)/i', $href)) {
                    continue;
                }
                $abs = $this->absolutize($href);
                $parsed = parse_url($abs);
                if (empty($parsed['host']) || strtolower($parsed['host']) !== $home_host) {
                    continue; // same-origin only for the heuristic
                }
                $file = wp_normalize_path(ABSPATH . ltrim($parsed['path'] ?? '/', '/'));
                if (!str_starts_with($file, wp_normalize_path(ABSPATH)) || !is_file($file)) {
                    continue;
                }
                $css = @file_get_contents($file);
                if ($css === false || $css === '') {
                    continue;
                }
                $css_parts[] = $css;
                $bytes += strlen($css);
            }
        }

        if (empty($css_parts)) {
            return null;
        }

        $css = implode("\n", $css_parts);
        $css = $this->strip_media_print($css);
        $css = CssOptimizer::safe_minify($css);

        // Truncate at ~50KB on a rule boundary to bound inline size.
        if (strlen($css) > $limit) {
            $cut = strrpos(substr($css, 0, $limit), '}');
            $css = $cut !== false ? substr($css, 0, $cut + 1) : substr($css, 0, $limit);
        }

        return $css !== '' ? $css : null;
    }

    /** Remove @media print blocks with balanced braces. */
    private function strip_media_print(string $css): string {
        $out = '';
        $offset = 0;
        while (($start = stripos($css, '@media', $offset)) !== false) {
            $header_end = strpos($css, '{', $start);
            if ($header_end === false) {
                break;
            }
            $header = substr($css, $start, $header_end - $start);
            if (stripos($header, 'print') === false) {
                $out .= substr($css, $offset, $header_end - $offset + 1);
                $offset = $header_end + 1;
                continue;
            }
            // Balanced-brace scan to find the block end.
            $depth = 1;
            $pos = $header_end + 1;
            while ($depth > 0 && $pos < strlen($css)) {
                $ch = $css[$pos];
                if ($ch === '{') $depth++;
                elseif ($ch === '}') $depth--;
                $pos++;
            }
            $out .= substr($css, $offset, $start - $offset);
            $offset = $pos;
        }
        $out .= substr($css, $offset);
        return $out;
    }

    private function absolutize(string $href): string {
        if (preg_match('#^(https?:)?//#i', $href)) {
            if (str_starts_with($href, '//')) {
                return (is_ssl() ? 'https:' : 'http:') . $href;
            }
            return $href;
        }
        if (str_starts_with($href, '/')) {
            return set_url_scheme(home_url($href));
        }
        return home_url($href);
    }

    private function maybe_dispatch_generation(string $url): void {
        if (!$this->config->is_connected()) {
            return;
        }

        // Throttle dispatch using transients (once per 10 minutes per URL)
        $transient_key = 'tp_dispatch_' . md5($url);
        if (get_transient($transient_key)) {
            return;
        }

        set_transient($transient_key, 1, 600);

        // Track dispatch time so the local fallback knows when the grace
        // window has elapsed (option, survives cache purges).
        $dispatched = get_option('turbopress_css_dispatched', []);
        if (!is_array($dispatched)) {
            $dispatched = [];
        }
        $dispatched[md5($url)] = time();
        if (count($dispatched) > 200) {
            $dispatched = array_slice($dispatched, -200, null, true);
        }
        update_option('turbopress_css_dispatched', $dispatched);

        // Non-blocking asynchronous dispatch
        wp_schedule_single_event(time(), 'turbopress_async_optimize', ['url' => $url]);
    }

    private function get_current_url(): string {
        $scheme = (isset($_SERVER['HTTPS']) && $_SERVER['HTTPS'] === 'on') ? 'https' : 'http';
        $host = $_SERVER['HTTP_HOST'] ?? 'localhost';
        $uri = $_SERVER['REQUEST_URI'] ?? '/';
        return $scheme . '://' . $host . $uri;
    }
}
