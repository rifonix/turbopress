<?php
namespace Turbopress;

if (!defined('ABSPATH')) {
    exit;
}

/**
 * CSS pipeline: combine + minify stylesheets, then either
 *
 * Tier 1 (default): INLINE-ALL — when the combined, minified site CSS is
 *   small enough (css.inline_all_threshold, 150KB default) the entire
 *   bundle is inlined as a single <style> in <head>. Zero render-blocking
 *   requests AND zero FOUC risk by construction: the full stylesheet is
 *   present before first paint. Ideal for the 40-sheet Elementor <head>.
 *
 * Tier 2 (large sites): async-load via preload→onload swap with a rescue
 *   script that restores the original sheets if the swap never applies.
 *
 * Both tiers share the combine engine: url() rebasing (esc_url_raw),
 * @import hoisting, safe minification, mtime-keyed immutable bundles,
 * font-display:swap injection into every @font-face, and .br/.gz twins
 * for pre-compressed serving via the .htaccess rules.
 */
class CssOptimizer {
    private const MAX_BYTES = 2097152; // 2MB combined budget
    private const DEFAULT_INLINE_THRESHOLD = 153600; // 150KB

    private Config $config;

    public function __construct(Config $config) {
        $this->config = $config;
    }

    /**
     * Tier 1: inline the entire combined stylesheet when it fits the
     * threshold. Returns the transformed HTML, or null when the site's
     * CSS is too large / bundle could not be built (caller falls back
     * to Tier 2 defer).
     */
    public function try_inline_all(string $html): ?string {
        if (!(bool) $this->config->get('css.inline_all', true)) {
            return null;
        }
        if (stripos($html, 'turbopress-full-css') !== false) {
            return null; // already inlined (idempotency)
        }

        $links = $this->classify_links($html);
        if ($links === null) {
            return null;
        }
        [$combinable, ] = $links;

        $main_keys = array_keys(array_filter($combinable, fn($c) => $c['media'] === 'all'));
        if (empty($main_keys)) {
            return null;
        }

        $info = $this->build_bundle(array_map(fn($k) => $combinable[$k]['href'], $main_keys));
        if ($info === null) {
            return null;
        }

        $threshold = (int) $this->config->get('css.inline_all_threshold', self::DEFAULT_INLINE_THRESHOLD);
        if ($threshold < 20480) {
            $threshold = 20480;
        }
        if ($info['bytes'] <= 0 || $info['bytes'] > $threshold) {
            return null;
        }

        $css = (string) @file_get_contents($info['file']);
        if ($css === '') {
            return null;
        }

        $i = -1;
        $placed = false;
        $out = preg_replace_callback(
            '/<link\s+([^>]*rel=[\'"]stylesheet[\'"][^>]*)>/i',
            function ($m) use (&$i, &$placed, $combinable, $main_keys, $css) {
                $i++;
                if (!isset($combinable[$i]) || !in_array($i, $main_keys, true)) {
                    return $m[0]; // excluded / print / conditional media: untouched
                }
                if ($placed) {
                    return ''; // consumed by the inline block
                }
                $placed = true;
                return '<style id="turbopress-full-css">' . $css . '</style>';
            },
            $html
        );
        if (!is_string($out) || !$placed) {
            return null;
        }

        // Preload the LCP-critical font (first woff2 in the bundle) so text
        // renders with the right face immediately.
        if ((bool) $this->config->get('fonts.preload_lcp_font', true)) {
            if (preg_match('/url\(([^)]+\.woff2)\)/i', $css, $fm)) {
                $font_url = html_entity_decode($fm[1], ENT_QUOTES);
                if ($this->should_preload_font($out, $font_url)) {
                    $preload = sprintf(
                        '<link rel="preload" as="font" type="font/woff2" href="%s" crossorigin>',
                        esc_url($font_url)
                    );
                    $out = preg_replace('/(<head[^>]*>)/i', "$1\n" . $preload, $out, 1) ?? $out;
                }
            }
        }

        return $out;
    }

    /**
     * Tier 2: replace stylesheet links with async preload→onload swaps
     * (single combined bundle + per-sheet fallback for the rest).
     */
    public function defer_stylesheets(string $html): string {
        $excluded = (array) $this->config->get('critical_css.excluded_stylesheets', []);
        $combine_enabled = (bool) $this->config->get('css.combine', true);

        $links = $this->classify_links($html);
        if ($links === null) {
            return $html;
        }
        [$combinable, ] = $links;

        if (empty($combinable)) {
            return $html;
        }

        // Build the combined bundle for the main screen group.
        $combined_url = null;
        $combined_idx = null;
        $main_keys = [];
        if ($combine_enabled) {
            $main_keys = array_keys(array_filter($combinable, fn($c) => $c['media'] === 'all'));
            if (count($main_keys) >= 2) {
                $info = $this->build_bundle(array_map(fn($k) => $combinable[$k]['href'], $main_keys));
                if ($info !== null) {
                    $combined_url = $info['url'];
                    $combined_idx = $main_keys[0];
                }
            }
        }

        // Rewrite the HTML.
        $i = -1;
        $used_rescue = false;
        $html = preg_replace_callback(
            '/<link\s+([^>]*rel=[\'"]stylesheet[\'"][^>]*)>/i',
            function ($m) use (&$i, &$used_rescue, $combinable, $combined_url, $combined_idx, $main_keys) {
                $i++;
                if (!isset($combinable[$i])) {
                    return $m[0]; // excluded / print / skipped
                }
                $entry = $combinable[$i];
                $used_rescue = true;

                // First member of the combined group carries the bundle tag.
                // data-tp-css keeps the original hrefs so the rescue script
                // can restore real <link rel=stylesheet> tags when the
                // preload→stylesheet swap never applies (CSP blocking the
                // inline onload attribute, 404, dropped preload): styles can
                // never be permanently lost.
                if ($combined_url !== null && $i === $combined_idx) {
                    $orig_hrefs = array_map(fn($k) => $combinable[$k]['href'], $main_keys);
                    return sprintf(
                        '<link rel="preload" href="%s" as="style" data-tp-css="%s" ' .
                        'onload="this.onload=null;this.rel=\'stylesheet\'" onerror="if(window.__tpCssRescue)window.__tpCssRescue(this)">' .
                        '<noscript><link rel="stylesheet" href="%s"></noscript>',
                        esc_url($combined_url),
                        esc_attr((string) wp_json_encode($orig_hrefs)),
                        esc_url($combined_url)
                    );
                }
                if ($combined_url !== null && $entry['media'] === 'all') {
                    return ''; // consumed by the bundle
                }

                // Everything else: per-sheet async swap (preload + onload).
                if (preg_match('/href=[\'"]([^\'"]+)[\'"]/i', $m[1], $href_match)) {
                    $href = $href_match[1];
                    $clean_attrs = preg_replace('/href=[\'"][^\'"]*[\'"]/i', '', $m[1]);
                    $clean_attrs = preg_replace('/rel=[\'"]stylesheet[\'"]/i', '', $clean_attrs);

                    return sprintf(
                        '<link rel="preload" href="%s" as="style" data-tp-css="%s" %s ' .
                        'onload="this.onload=null;this.rel=\'stylesheet\'" onerror="if(window.__tpCssRescue)window.__tpCssRescue(this)">' .
                        '<noscript><link rel="stylesheet" href="%s"></noscript>',
                        esc_url($href),
                        esc_attr((string) wp_json_encode([$this->absolutize($href)])),
                        trim((string) $clean_attrs),
                        esc_url($href)
                    );
                }
                return $m[0];
            },
            $html
        );

        // Rescue script (once per page): restores the original stylesheets
        // when the preload→stylesheet swap has not applied shortly after
        // load, or immediately on preload error.
        if ($used_rescue && is_string($html) && stripos((string) $html, 'turbopress-css-rescue') === false) {
            $sel = 'link[rel=preload][as=style][data-tp-css]';
            $scan = 'var ls=document.querySelectorAll(\'' . $sel . '\');for(var i=0;i<ls.length;i++){if(!ls[i].sheet)window.__tpCssRescue(ls[i])}';
            $rescue = '<script tp-exclude id="turbopress-css-rescue">(function(){'
                . 'window.__tpCssRescue=function(l){try{'
                . 'var a=JSON.parse(l.getAttribute(\'data-tp-css\')||\'[]\');'
                . 'for(var i=0;i<a.length;i++){var s=document.createElement(\'link\');s.rel=\'stylesheet\';s.href=a[i];document.head.appendChild(s)}'
                . 'l.removeAttribute(\'onload\');l.removeAttribute(\'onerror\');l.parentNode&&l.parentNode.removeChild(l)'
                . '}catch(e){}};'
                . 'function chk(){setTimeout(function(){' . $scan . '},2500);setTimeout(function(){' . $scan . '},6000);}'
                . 'if(document.readyState!==\'loading\')chk();else document.addEventListener(\'DOMContentLoaded\',chk);'
                . '})();</script>';
            $html = preg_replace('/(<head[^>]*>)/i', "$1\n" . $rescue, (string) $html, 1) ?? (string) $html;
        }

        return is_string($html) ? $html : '';
    }

    /**
     * Extract every @font-face rule from the page's stylesheets (rebased +
     * minified). Used in Tier 2 to guarantee fonts never wait for the
     * async bundle — they land next to the inline critical CSS.
     */
    public function extract_font_faces(string $html): string {
        $links = $this->classify_links($html);
        if ($links === null) {
            return '';
        }
        [$combinable, ] = $links;

        $faces = [];
        $seen = [];
        $bytes = 0;

        foreach ($combinable as $entry) {
            if ($bytes > 131072 || count($faces) > 60) {
                break;
            }
            $css = $this->fetch_sheet($entry['href']);
            if ($css === null || stripos($css, '@font-face') === false) {
                continue;
            }
            if (preg_match_all('/@font-face\s*\{[^}]*\}/i', $css, $fm)) {
                foreach ($fm[0] as $face) {
                    $face = $this->rebase_urls($face, $entry['href']);
                    $face = $this->inject_font_display($face);
                    $key = md5(preg_replace('/\s+/', '', $face));
                    if (isset($seen[$key])) {
                        continue;
                    }
                    $seen[$key] = true;
                    $faces[] = $face;
                    $bytes += strlen($face);
                }
            }
        }

        return $faces === [] ? '' : implode('', $faces);
    }

    /**
     * Add font-display:swap to @font-face blocks lacking it. Catches
     * theme-uploaded custom fonts (e.g. Sirivenne inside Elementor
     * post-*.css) that Google-Fonts localization never touches.
     */
    public function inject_font_display(string $css): string {
        return preg_replace_callback(
            '/@font-face\s*\{([^{}]*)\}/i',
            static function ($m) {
                if (stripos($m[0], 'font-display') !== false) {
                    return $m[0];
                }
                return '@font-face{' . rtrim($m[1], "; \t\r\n") . ';font-display:swap;}';
            },
            $css
        ) ?? $css;
    }

    /**
     * Classify stylesheet links on the page.
     * Returns [combinable(idx => [href, media, attrs]), excluded] or null
     * when no stylesheet links exist at all.
     */
    private function classify_links(string $html): ?array {
        if (!preg_match_all('/<link\s+([^>]*rel=[\'"]stylesheet[\'"][^>]*)>/i', $html, $matches, PREG_SET_ORDER)) {
            return null;
        }

        $excluded = (array) $this->config->get('critical_css.excluded_stylesheets', []);
        $combinable = [];
        foreach ($matches as $idx => $m) {
            $attributes = $m[1];
            if (!preg_match('/href=[\'"]([^\'"]+)[\'"]/i', $attributes, $href_match)) {
                continue;
            }
            $href = $href_match[1];

            if ($this->is_excluded($href, $excluded)) {
                continue;
            }
            if (!preg_match('#^https?://#i', $href) && !str_starts_with($href, '/')) {
                continue; // weird protocol / data URI
            }

            $media = $this->link_media($attributes);
            if ($media === 'print') {
                continue; // print sheets never block screen rendering
            }

            $combinable[$idx] = ['href' => $this->absolutize($href), 'media' => $media, 'attrs' => $attributes];
        }

        return [$combinable, $excluded];
    }

    private function should_preload_font(string $html, string $font_url): bool {
        if (!preg_match('#^https?://#i', $font_url)) {
            return false;
        }
        // Skip when a preload for this exact font already exists.
        if (preg_match_all('/<link\s+([^>]*rel=[\'"]preload[\'"][^>]*)>/i', $html, $pm)) {
            foreach ($pm[1] as $attrs) {
                if (stripos($attrs, 'as=') !== false && stripos($attrs, 'font') !== false
                    && preg_match('/href=[\'"]([^\'"]+)[\'"]/i', $attrs, $hm)
                    && html_entity_decode($hm[1], ENT_QUOTES) === $font_url) {
                    return false;
                }
            }
        }
        return true;
    }

    private function is_excluded(string $href, array $excluded): bool {
        foreach ($excluded as $ex) {
            if ($ex !== '' && stripos($href, $ex) !== false) {
                return true;
            }
        }
        return false;
    }

    private function link_media(string $attributes): string {
        if (preg_match('/media=[\'"]([^\'"]+)[\'"]/i', $attributes, $media_match)) {
            return strtolower(trim($media_match[1]));
        }
        return 'all';
    }

    private function absolutize(string $href): string {
        if (preg_match('#^(https?:)?//#i', $href)) {
            if (str_starts_with($href, '//')) {
                $scheme = is_ssl() ? 'https:' : 'http:';
                return $scheme . $href;
            }
            return $href;
        }
        if (str_starts_with($href, '/')) {
            return set_url_scheme(home_url($href));
        }
        return $href;
    }

    /**
     * Fetch, rebase, minify and concatenate the given absolute sheet URLs.
     * Returns ['url' => public URL, 'file' => path, 'bytes' => size] or
     * null on any failure. The bundle is content-addressed (hrefs + local
     * mtimes) so it is immutable and naturally versioned.
     */
    private function build_bundle(array $hrefs): ?array {
        try {
            $hrefs = array_values(array_unique($hrefs));
            if (count($hrefs) > (int) $this->config->get('css.max_files', 40)) {
                return null;
            }

            $host = isset($_SERVER['HTTP_HOST']) ? strtolower($_SERVER['HTTP_HOST']) : parse_url(home_url(), PHP_URL_HOST);
            $dir = TURBOPRESS_CACHE_DIR . '/' . md5((string) $host) . '/combined';
            if (!file_exists($dir) && !wp_mkdir_p($dir)) {
                return null;
            }

            // Cache key from hrefs + local mtimes so edits invalidate bundles.
            $key_parts = [TURBOPRESS_VERSION];
            foreach ($hrefs as $href) {
                $key_parts[] = $href . '@' . $this->sheet_version($href);
            }
            $bundle_hash = md5(implode('|', $key_parts));
            $bundle_file = $dir . '/tp-' . $bundle_hash . '.css';

            if (!file_exists($bundle_file)) {
                $imports = [];
                $chunks = [];
                $total = 0;

                foreach ($hrefs as $href) {
                    $css = $this->fetch_sheet($href);
                    if ($css === null) {
                        return null; // any missing sheet aborts combining
                    }
                    $css = $this->hoist_imports($css, $href, $imports);
                    $css = $this->rebase_urls($css, $href);
                    $css = preg_replace('/@charset[^;]+;/i', '', $css);
                    $css = $this->inject_font_display($css);

                    if ((bool) $this->config->get('css.minify', true)) {
                        $css = self::safe_minify($css);
                    }

                    $total += strlen($css);
                    if ($total > self::MAX_BYTES) {
                        return null;
                    }
                    $chunks[] = "/* turbopress: {$href} */\n" . $css;
                }

                $bundle = '';
                if (!empty($imports)) {
                    $bundle .= implode("\n", array_unique($imports)) . "\n";
                }
                $bundle .= implode("\n", $chunks);

                // Atomic write; combined dir is public so protect with deny-header files.
                @file_put_contents($dir . '/index.php', "<?php // silence\n");
                if (@file_put_contents($bundle_file, $bundle) === false) {
                    return null;
                }
                $this->write_compressed_twins($bundle_file, $bundle);
            }

            $bytes = (int) @filesize($bundle_file);
            if ($bytes <= 0) {
                return null;
            }

            return [
                'url' => WP_CONTENT_URL . '/cache/turbopress/' . md5((string) $host) . '/combined/tp-' . $bundle_hash . '.css',
                'file' => $bundle_file,
                'bytes' => $bytes,
            ];
        } catch (\Throwable $e) {
            return null;
        }
    }

    /**
     * Write .br (level 11) and .gz (level 9) twins next to the bundle for
     * the .htaccess pre-compressed-serving rules. Best-effort: serving
     * still works without them (origin compression fallback).
     */
    private function write_compressed_twins(string $file, string $content): void {
        if (function_exists('brotli_compress')) {
            $br = @brotli_compress($content, 11);
            if (is_string($br) && $br !== '') {
                @file_put_contents($file . '.br', $br);
            }
        }
        $gz = @gzencode($content, 9);
        if (is_string($gz) && $gz !== '') {
            @file_put_contents($file . '.gz', $gz);
        }
    }

    private function sheet_version(string $href): string {
        $local = $this->local_path($href);
        if ($local !== null && ($mtime = @filemtime($local)) !== false) {
            return (string) $mtime;
        }
        return substr(md5($href), 0, 8);
    }

    /**
     * Resolve an absolute same-origin URL to a local file path, or null.
     */
    private function local_path(string $href): ?string {
        $home = parse_url(home_url());
        $parsed = parse_url($href);
        if (empty($home['host']) || empty($parsed['host']) || strtolower($home['host']) !== strtolower($parsed['host'])) {
            return null;
        }
        $path = $parsed['path'] ?? '/';
        $file = wp_normalize_path(ABSPATH . ltrim($path, '/'));
        $root = wp_normalize_path(ABSPATH);
        if (!str_starts_with($file, $root)) {
            return null;
        }
        return is_file($file) ? $file : null;
    }

    private function fetch_sheet(string $href): ?string {
        $local = $this->local_path($href);
        if ($local !== null) {
            $css = @file_get_contents($local);
            return $css !== false ? $css : null;
        }

        // Remote sheet: short transient cache to keep TTFB stable.
        $key = 'tp_css_' . md5($href);
        $cached = get_transient($key);
        if ($cached !== false) {
            return is_string($cached) ? $cached : null;
        }

        $response = wp_remote_get($href, ['timeout' => 5]);
        if (is_wp_error($response) || wp_remote_retrieve_response_code($response) !== 200) {
            set_transient($key, '', 10 * MINUTE_IN_SECONDS); // negative cache
            return null;
        }
        $body = (string) wp_remote_retrieve_body($response);
        set_transient($key, $body, HOUR_IN_SECONDS);
        return $body;
    }

    /**
     * Rebase relative url(...) references against the sheet's own URL.
     * Absolute, protocol-relative, data: and fragment URLs are untouched.
     */
    private function rebase_urls(string $css, string $base_href): string {
        return preg_replace_callback(
            '/url\(\s*(\'|"|)([^\'")]+)\1\s*\)/i',
            function ($m) use ($base_href) {
                $ref = trim($m[2]);
                if ($ref === '' || str_starts_with($ref, 'data:') || str_starts_with($ref, '#') || str_starts_with($ref, 'blob:')) {
                    return $m[0];
                }
                if (preg_match('#^(https?:)?//#i', $ref)) {
                    return $m[0]; // already absolute(-ish)
                }
                // esc_url_raw: this value lives INSIDE CSS text, where HTML
                // entity escaping (& -> &#038;) corrupts the URL. esc_url()
                // here broke any sheet URL containing a query string.
                return 'url(' . esc_url_raw($this->resolve_relative($base_href, $ref)) . ')';
            },
            $css
        ) ?? $css;
    }

    private function resolve_relative(string $base, string $rel): string {
        if (str_starts_with($rel, '/')) {
            $p = parse_url($base);
            $scheme = $p['scheme'] ?? 'https';
            $host = $p['host'] ?? '';
            $port = isset($p['port']) ? ':' . $p['port'] : '';
            return $scheme . '://' . $host . $port . $rel;
        }
        // Dot-segment resolution relative to the sheet directory.
        $dir = preg_replace('#/[^/]*$#', '/', $base);
        $abs = $dir . $rel;
        $abs = preg_replace('#/(\./|\.\./)+#', '/', $abs);
        // Collapse ../ segments
        while (preg_match('#/[^/]+/\.\./#', (string) $abs)) {
            $abs = preg_replace('#/[^/]+/\.\./#', '/', (string) $abs, 1);
        }
        return (string) $abs;
    }

    /**
     * Extract @import statements, resolve them absolute, and return the css
     * without them. Imports are hoisted to the bundle top by the caller.
     */
    private function hoist_imports(string $css, string $base_href, array &$imports): string {
        return preg_replace_callback(
            '/@import\s+(?:url\(\s*)?[\'"]?([^\'")\s;]+)[\'"]?\s*\)?[^;]*;/i',
            function ($m) use ($base_href, &$imports) {
                $ref = trim($m[1]);
                if (!preg_match('#^(https?:)?//#i', $ref)) {
                    $ref = $this->resolve_relative($base_href, $ref);
                }
                $imports[] = '@import url(' . $ref . ');';
                return '';
            },
            $css
        ) ?? $css;
    }

    /**
     * PHP port of the edge's safeMinifyCss: protects url() tokens and quoted
     * strings before stripping comments/whitespace so data-URI icons and
     * font URLs never break.
     */
    public static function safe_minify(string $css): string {
        $saved = [];
        $stash = static function (string $s) use (&$saved): string {
            $saved[] = $s;
            return "\u{1}" . (count($saved) - 1) . "\u{1}";
        };

        $out = preg_replace_callback(
            '/url\(\s*(?:\'[^\']*\'|"[^"]*"|[^)]*?)\s*\)/i',
            fn($m) => $stash($m[0]),
            $css
        );
        $out = preg_replace_callback(
            '/\'(?:[^\'\\\\]|\\\\.)*\'|"(?:[^"\\\\]|\\\\.)*"/',
            fn($m) => $stash($m[0]),
            (string) $out
        );

        $out = preg_replace('#/\*[\s\S]*?\*/#', '', (string) $out);
        $out = preg_replace('/\s+/', ' ', (string) $out);
        $out = preg_replace('/\s*([{}:;,>~+])\s*/', '$1', (string) $out);
        $out = str_replace(';}', '}', (string) $out);
        $out = trim((string) $out);

        return preg_replace_callback(
            '/\x01(\d+)\x01/',
            fn($m) => $saved[(int) $m[1]] ?? '',
            $out
        ) ?? $out;
    }
}
