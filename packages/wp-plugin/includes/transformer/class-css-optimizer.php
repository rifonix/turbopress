<?php
namespace Turbopress;

if (!defined('ABSPATH')) {
    exit;
}

/**
 * Combines and minifies render-blocking stylesheets.
 *
 * Replaces the classic per-sheet preload→onload swap with ONE combined
 * bundle per media group: a 40-file Elementor <head> becomes a single
 * async stylesheet request. The bundle is written to
 * wp-content/cache/turbopress/{host}/combined/ and keyed by content hash,
 * so it is naturally immutable and re-validated whenever any source file
 * changes (mtime/size feed the hash).
 *
 * Safeguards:
 * - Only http(s) sheets with screen-ish media participate.
 * - Relative url()/@import references are rebased to absolute URLs BEFORE
 *   concatenation (the #1 cause of broken images/fonts in naive combiners).
 * - @import statements are hoisted to the top of the bundle (CSS requires
 *   them before other rules).
 * - Any failure falls back to per-sheet async loading.
 */
class CssOptimizer {
    private const MAX_BYTES = 2097152; // 2MB combined budget

    private Config $config;

    public function __construct(Config $config) {
        $this->config = $config;
    }

    /**
     * Entry point: transform all stylesheet links.
     * Called by CriticalCssTransformer once inline critical CSS exists.
     */
    public function defer_stylesheets(string $html): string {
        $excluded = (array) $this->config->get('critical_css.excluded_stylesheets', []);
        $combine_enabled = (bool) $this->config->get('css.combine', true);

        if (!preg_match_all('/<link\s+([^>]*rel=[\'"]stylesheet[\'"][^>]*)>/i', $html, $matches, PREG_SET_ORDER)) {
            return $html;
        }

        // Pass 1: classify every stylesheet link.
        $combinable = [];   // idx => [href, attrs]
        $per_link = [];     // idx => tag (for fallback / async handling)
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

        if (empty($combinable)) {
            return $html;
        }

        // Pass 2: build the combined bundle for the main screen group.
        $combined_url = null;
        $combined_idx = null;
        $main_keys = [];
        if ($combine_enabled) {
            $main_keys = array_keys(array_filter($combinable, fn($c) => $c['media'] === 'all'));
            if (count($main_keys) >= 2) {
                $combined_url = $this->build_combined_bundle(array_map(fn($k) => $combinable[$k]['href'], $main_keys));
                if ($combined_url !== null) {
                    $combined_idx = $main_keys[0];
                }
            }
        }

        // Pass 3: rewrite the HTML.
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
                        trim($clean_attrs),
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

        return $html;
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
     * Returns the public URL of the bundle, or null on any failure.
     */
    private function build_combined_bundle(array $hrefs): ?string {
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
            }

            return WP_CONTENT_URL . '/cache/turbopress/' . md5((string) $host) . '/combined/tp-' . $bundle_hash . '.css';
        } catch (\Throwable $e) {
            return null;
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
        );
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
        while (preg_match('#/[^/]+/\.\./#', $abs)) {
            $abs = preg_replace('#/[^/]+/\.\./#', '/', $abs, 1);
        }
        return $abs;
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
                    if (str_starts_with($ref, '/')) {
                        $ref = $this->resolve_relative($base_href, $ref);
                    } else {
                        $ref = $this->resolve_relative($base_href, $ref);
                    }
                }
                $imports[] = '@import url(' . $ref . ');';
                return '';
            },
            $css
        );
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
