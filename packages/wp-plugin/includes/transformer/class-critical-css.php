<?php
namespace WPInstant;

if (!defined('ABSPATH')) {
    exit;
}

class CriticalCssTransformer {
    private Config $config;
    private ApiClient $api_client;

    /**
     * Per-page content fingerprints at last critical-CSS dispatch
     * (option wp_instant_css_fingerprints: md5(path) => fingerprint).
     * A page is dispatched for extraction at most ONCE per fingerprint —
     * repeat views of unchanged content never spend optimization credits
     * again. Content edits change the fingerprint (and the purger drops the
     * stored entry), so changed pages re-process exactly once.
     */
    private const FINGERPRINT_OPTION = 'wp_instant_css_fingerprints';
    private const FINGERPRINT_MAX = 500;

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
            // the dashboard audits even when their CSS output goes unused —
            // but at most ONCE per page version (this path used to dispatch
            // every 10 minutes on every high-traffic page, burning credits
            // for CSS that is never inlined).
            $this->maybe_dispatch_generation($current_url, $this->page_fingerprint($html));
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

            // Route critical-CSS background images through R2 (optimized
            // webp derivatives) — same offload as <img> and the combined
            // bundle; the LCP preload maps to the exact same worker URL.
            if ((bool) $this->config->get('media.offload_images', false)) {
                $offloader = new MediaOffloader($this->config);
                $critical_css = $offloader->rewrite_css_urls($critical_css);
                $font_faces = $offloader->rewrite_css_urls($font_faces);
            }

            $style_id = $used_local_fallback ? 'wp-instant-critical-css wpins-fallback' : 'wp-instant-critical-css';
            $style_tag = sprintf(
                '<style id="%s">%s</style>',
                $style_id,
                CssOptimizer::slim_font_faces(
                    $font_faces . $critical_css,
                    (bool) $this->config->get('critical_css.font_display_swap', true)
                )
            );
            $html = preg_replace_callback(
                '/(<head[^>]*>)/i',
                static fn(array $m): string => $m[1] . "\n" . $style_tag,
                $html,
                1
            ) ?? $html;

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
            $this->maybe_dispatch_generation($current_url, $this->page_fingerprint($html));
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

        $cache_file = WP_INSTANT_CACHE_DIR . '/' . md5($host) . '/css/' . $url_hash . '.css';

        if (file_exists($cache_file)) {
            // TTL: content/layout edits invalidate via invalidate_url(), but
            // theme/plugin updates and external stylesheet changes do not —
            // force regeneration after 30 days regardless.
            $mtime = @filemtime($cache_file);
            if ($mtime && (time() - $mtime) < 30 * DAY_IN_SECONDS) {
                return @file_get_contents($cache_file);
            }
            return null; // expired — caller re-dispatches extraction
        }

        return null;
    }

    /**
     * True when fresh (unexpired) critical CSS exists on disk for BOTH
     * viewports of a URL, under any host variant. Used to skip redundant
     * dispatches (e.g. reconnecting an already-optimized site must not
     * spend credits re-processing the homepage).
     */
    public static function has_fresh_cache_for_url(string $url): bool {
        if (!defined('WP_INSTANT_CACHE_DIR')) {
            return false;
        }
        $parsed = parse_url($url);
        $path = $parsed['path'] ?? '/';
        foreach (['mobile', 'desktop'] as $viewport) {
            $hash = md5($path . '_' . $viewport);
            $fresh = false;
            foreach (glob(WP_INSTANT_CACHE_DIR . '/*/css/' . $hash . '.css') ?: [] as $file) {
                $mtime = @filemtime($file);
                if ($mtime && (time() - $mtime) < 30 * DAY_IN_SECONDS) {
                    $fresh = true;
                    break;
                }
            }
            if (!$fresh) {
                return false;
            }
        }
        return true;
    }

    /**
     * Delete cached critical CSS for a URL (both viewports, all host
     * variants). Called on content changes so the next request re-extracts
     * instead of inlining stale rules indefinitely. The stored dispatch
     * fingerprint is dropped too, so the changed page is processed exactly
     * once more (dispatch-once would otherwise treat it as already done).
     */
    public static function invalidate_url(string $url): void {
        $parsed = parse_url($url);
        $path = $parsed['path'] ?? '/';

        $fingerprints = get_option(self::FINGERPRINT_OPTION, []);
        if (is_array($fingerprints) && isset($fingerprints[md5(strtolower($path))])) {
            unset($fingerprints[md5(strtolower($path))]);
            update_option(self::FINGERPRINT_OPTION, $fingerprints, false);
        }

        $hosts = [];
        $url_host = isset($parsed['host']) ? strtolower($parsed['host']) : '';
        if ($url_host) {
            $hosts[] = $url_host;
        }
        $home_host = parse_url(get_home_url(), PHP_URL_HOST);
        if ($home_host) {
            $hosts[] = strtolower($home_host);
        }
        foreach (array_unique(array_filter($hosts)) as $h) {
            $hosts[] = str_starts_with($h, 'www.') ? substr($h, 4) : 'www.' . $h;
        }
        $hosts = array_unique(array_filter($hosts));

        foreach (['mobile', 'desktop'] as $viewport) {
            $url_hash = md5($path . '_' . $viewport);
            foreach ($hosts as $host) {
                $file = WP_INSTANT_CACHE_DIR . '/' . md5($host) . '/css/' . $url_hash . '.css';
                if (file_exists($file)) {
                    @unlink($file);
                }
            }
        }
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
            $dir = WP_INSTANT_CACHE_DIR . '/' . md5($host) . '/css';
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
        $option_key = 'wp_instant_css_dispatched';
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

    /**
     * Cheap content fingerprint for the dispatch-once guarantee: DOM
     * structure of the current document + the singular post's modification
     * time (when resolvable) + theme/plugin versions. Unchanged pages keep
     * a stable fingerprint across requests; edits, theme updates and
     * plugin updates change it.
     */
    private function page_fingerprint(string $html): string {
        $parts = [DomEngine::compute_structure_hash($html)];

        $post_id = 0;
        if (function_exists('url_to_postid')) {
            $post_id = (int) url_to_postid($this->get_current_url());
        }
        if ($post_id <= 0) {
            $q = $GLOBALS['wp_query'] ?? null;
            if ($q instanceof \WP_Query && $q->is_singular()) {
                $post_id = (int) $q->get_queried_object_id();
            }
        }
        if ($post_id > 0) {
            $post = get_post($post_id);
            if ($post instanceof \WP_Post) {
                $parts[] = 'post:' . $post_id . ':' . $post->post_modified_gmt;
            }
        }

        $theme = function_exists('wp_get_theme') ? wp_get_theme() : null;
        if ($theme && method_exists($theme, 'exists') && $theme->exists()) {
            $parts[] = 'theme:' . get_stylesheet() . ':' . $theme->get('Version');
        }
        $parts[] = 'wpins:' . WP_INSTANT_VERSION;

        return md5(implode('|', $parts));
    }

    /**
     * Mirror of the edge scope gate (edge-api/src/services/scope.ts):
     * homepage always in scope; 'all' passes everything; 'main-pages'
     * passes the homepage plus the optimize_only_urls allowlist (same
     * wildcard semantics as CacheRules); 'templates-only' passes through
     * to edge-side template dedup (first of each template pays once).
     */
    public function is_url_in_scope(string $url): bool {
        $scope = (string) $this->config->get('caching.optimize_scope', 'main-pages');
        if ($scope === 'all' || $scope === '') {
            return true;
        }
        $path = strtolower((string) parse_url($url, PHP_URL_PATH));
        if ($path === '' || $path === '/') {
            return true;
        }
        if ($scope !== 'main-pages') {
            return true;
        }
        foreach ((array) $this->config->get('caching.optimize_only_urls', []) as $pattern) {
            $pattern = (string) $pattern;
            if ($pattern === '') {
                continue;
            }
            $regex = '#^' . str_replace('\\*', '.*', preg_quote($pattern, '#')) . '$#i';
            if (@preg_match($regex, $path) === 1) {
                return true;
            }
        }
        return false;
    }

    private function fingerprint_key(string $url): string {
        $parsed = parse_url($url);
        $path = strtolower($parsed['path'] ?? '/');
        return md5($path);
    }

    private function stored_fingerprint(string $url): ?string {
        $all = get_option(self::FINGERPRINT_OPTION, []);
        if (!is_array($all)) {
            return null;
        }
        $fp = $all[$this->fingerprint_key($url)] ?? null;
        return is_string($fp) && $fp !== '' ? $fp : null;
    }

    private function store_fingerprint(string $url, string $fingerprint): void {
        $all = get_option(self::FINGERPRINT_OPTION, []);
        if (!is_array($all)) {
            $all = [];
        }
        $all[$this->fingerprint_key($url)] = $fingerprint;
        if (count($all) > self::FINGERPRINT_MAX) {
            $all = array_slice($all, -self::FINGERPRINT_MAX, null, true);
        }
        update_option(self::FINGERPRINT_OPTION, $all, false);
    }

    private function maybe_dispatch_generation(string $url, ?string $fingerprint = null): void {
        if (!$this->config->is_connected()) {
            return;
        }

        // Optimization-scope pre-gate (defense in depth; the edge enforces
        // the same rule before any credit reservation): out-of-scope URLs
        // never schedule extraction, so bot-discovered pages cannot spend.
        if (!$this->is_url_in_scope($url)) {
            return;
        }

        // A dispatch + poll chain is already running for this URL: never
        // stack a second one (overlapping chains dispatched the same page
        // twice and doubled the credit cost).
        if (get_transient('wpins_jobs_' . md5($url))) {
            return;
        }

        // Dispatch-once per page version: this exact content was already
        // processed (its fingerprint was stored when the previous dispatch
        // was scheduled). Repeat views of an unchanged page must not spend
        // optimization credits again.
        //
        // A CHANGED fingerprint bypasses the 10-minute throttle below: the
        // throttle only paces repeats of identical content, it must never
        // delay processing of a page the visitor just edited.
        $content_changed = false;
        if ($fingerprint !== null && $fingerprint !== '') {
            $dispatched = get_option('wp_instant_css_dispatched', []);
            $url_key = md5($url);
            if (
                is_array($dispatched) && !empty($dispatched[$url_key])
                && $this->stored_fingerprint($url) === $fingerprint
            ) {
                return;
            }
            $content_changed = $this->stored_fingerprint($url) !== $fingerprint;
        }

        if (!$content_changed) {
            // Throttle dispatch using transients (once per 10 minutes per URL)
            $transient_key = 'wpins_dispatch_' . md5($url);
            if (get_transient($transient_key)) {
                return;
            }
        }

        set_transient('wpins_dispatch_' . md5($url), 1, 600);

        // Track dispatch time so the local fallback knows when the grace
        // window has elapsed (option, survives cache purges).
        $dispatched = get_option('wp_instant_css_dispatched', []);
        if (!is_array($dispatched)) {
            $dispatched = [];
        }
        $dispatched[md5($url)] = time();
        if (count($dispatched) > 200) {
            $dispatched = array_slice($dispatched, -200, null, true);
        }
        update_option('wp_instant_css_dispatched', $dispatched);

        if ($fingerprint !== null && $fingerprint !== '') {
            $this->store_fingerprint($url, $fingerprint);
        }

        // Non-blocking asynchronous dispatch (positional args: PHP 8 turns
        // associative cron args into named parameters and fatals)
        wp_schedule_single_event(time(), 'wp_instant_async_optimize', [$url]);
    }

    private function get_current_url(): string {
        $scheme = (isset($_SERVER['HTTPS']) && $_SERVER['HTTPS'] === 'on') ? 'https' : 'http';
        $host = $_SERVER['HTTP_HOST'] ?? 'localhost';
        $uri = $_SERVER['REQUEST_URI'] ?? '/';
        return $scheme . '://' . $host . $uri;
    }
}
