<?php
namespace Turbopress;

if (!defined('ABSPATH')) {
    exit;
}

/**
 * Font & vendor-CSS optimizer.
 *
 * 1. Google Fonts localization: fetches the css2 (or css) payload with a
 *    modern Chrome UA (woff2 + unicode-range), downloads the latin/latin-ext
 *    woff2 files to wp-content/cache/turbopress/fonts/, rewrites the CSS to
 *    the same-origin URLs and adds font-display:swap. Kills 4 blocking DNS
 *    connections to fonts.googleapis.com/fonts.gstatic.com.
 * 2. Vendor CSS pinning: rewrites CDN links (unpkg leaflet, code.jquery.com
 *    jquery-ui) to version-pinned files shipped inside the plugin.
 * 3. Injects font-display:swap into inline @font-face rules.
 * 4. Preloads the first localized font file (LCP-critical typography).
 */
class FontOptimizer {
    private Config $config;

    public function __construct(Config $config) {
        $this->config = $config;
    }

    public function transform(string $html): string {
        if (!(bool) $this->config->get('fonts.localize_google', true)) {
            return $html;
        }

        $preload_font = null;

        // Localize every Google Fonts stylesheet link.
        $html = preg_replace_callback(
            '/<link\s+([^>]*href=[\'"](https?:\/\/fonts\.googleapis\.com\/css2?[^\'"]+)[\'"][^>]*)>/i',
            function ($m) use (&$preload_font) {
                $local = $this->localize_google_fonts($m[2]);
                if ($local === null) {
                    return $m[0]; // network/format failure: keep the original
                }
                $preload_font = $local['preload_url'];

                // Swap href to the localized stylesheet; drop crossorigin/
                // preconnect hints pointing at Google.
                $attrs = preg_replace('/href=[\'"][^\'"]+[\'"]/i', 'href="' . esc_url($local['css_url']) . '"', $m[1]);
                $attrs = preg_replace('/\s(crossorigin|integrity|rel=[\'"]preconnect[\'"])(=[^\s>]+)?/i', '', $attrs);
                return '<link ' . trim((string) $attrs) . '>';
            },
            $html
        );

        // Drop now-redundant preconnect/dns-prefetch hints for Google Fonts.
        $html = preg_replace(
            '/<link\s+[^>]*(fonts\.googleapis\.com|fonts\.gstatic\.com)[^>]*>/i',
            '',
            $html
        );

        if ((bool) $this->config->get('fonts.bundle_vendor_css', true)) {
            $html = $this->rewrite_vendor_css($html);
        }

        // font-display:swap for inline @font-face rules.
        $html = preg_replace_callback(
            '/<style([^>]*)>([\s\S]*?)<\/style>/i',
            function ($m) {
                if (stripos($m[2], '@font-face') === false) {
                    return $m[0];
                }
                $css = preg_replace_callback(
                    '/@font-face\s*\{[^}]*\}/i',
                    function ($fm) {
                        if (stripos($fm[0], 'font-display') !== false) {
                            return $fm[0];
                        }
                        return rtrim($fm[0], '}') . 'font-display:swap;}';
                    },
                    $m[2]
                );
                return '<style' . $m[1] . '>' . $css . '</style>';
            },
            $html
        );

        // Preload the primary localized font (LCP text usually uses it).
        if ($preload_font && (bool) $this->config->get('fonts.preload_lcp_font', true)) {
            $preload = sprintf(
                '<link rel="preload" as="font" type="font/woff2" href="%s" crossorigin>',
                esc_url($preload_font)
            );
            $html = preg_replace('/(<head[^>]*>)/i', "$1\n" . $preload, $html, 1);
        }

        return $html;
    }

    /**
     * Download and localize a Google Fonts CSS payload.
     * Returns ['css_url' => ..., 'preload_url' => ...] or null on failure.
     */
    private function localize_google_fonts(string $href): ?array {
        try {
            $pkg = md5($href);
            $dir = TURBOPRESS_CACHE_DIR . '/fonts/' . $pkg;
            $css_file = $dir . '/fonts.css';
            $stamp_file = $dir . '/.stamp';

            // Serve existing localization; refresh weekly (Google may re-ship).
            if (file_exists($css_file) && file_exists($stamp_file)) {
                $css = (string) @file_get_contents($css_file);
                if ($css !== '' && (time() - (int) @file_get_contents($stamp_file)) < WEEK_IN_SECONDS) {
                    return [
                        'css_url' => $this->fonts_public_url($pkg, 'fonts.css'),
                        'preload_url' => $this->first_font_url($css, $pkg),
                    ];
                }
            }

            $response = wp_remote_get($href, [
                'timeout' => 8,
                'user-agent' => 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
                'accept' => 'text/css,*/*;q=0.1',
            ]);
            if (is_wp_error($response) || wp_remote_retrieve_response_code($response) !== 200) {
                return null;
            }

            $css = (string) wp_remote_retrieve_body($response);
            if ($css === '' || stripos($css, '@font-face') === false) {
                return null;
            }

            if (!file_exists($dir) && !wp_mkdir_p($dir)) {
                return null;
            }

            // Keep only latin + latin-ext subsets (parse the /* subset */ comments
            // Google emits before each @font-face).
            $blocks = preg_split('/(?=@font-face)/i', $css);
            $kept = [];
            foreach ($blocks as $i => $block) {
                if (!str_starts_with(trim($block), '@font-face')) {
                    continue; // header junk (spinners etc.)
                }
                // Subset marker lives in the preceding comment of the original
                // order — reconstruct via the previous block's trailing comment.
                $prev = $i > 0 ? $blocks[$i - 1] : '';
                if (preg_match('#/\*\s*([a-z0-9-]+)\s*\*/\s*$#i', $prev, $cm)) {
                    $subset = strtolower($cm[1]);
                } else {
                    $subset = 'latin'; // no marker: assume base latin
                }
                if (!in_array($subset, ['latin', 'latin-ext'], true)) {
                    continue;
                }
                if (stripos($block, 'font-display') === false) {
                    $block = rtrim($block, " \t\r\n;}") . ';font-display:swap;}';
                }
                $kept[] = $block;
            }
            if (empty($kept)) {
                return null;
            }

            // Download every woff2 referenced and rewrite to local URLs.
            $count = 0;
            foreach ($kept as &$block) {
                $block = preg_replace_callback(
                    '/url\((https:\/\/fonts\.gstatic\.com\/[^)]+\.woff2)\)/i',
                    function ($fm) use ($dir, $pkg, &$count) {
                        $url = $fm[1];
                        $name = 'font-' . md5($url) . '.woff2';
                        $target = $dir . '/' . $name;
                        if (!file_exists($target)) {
                            $font_resp = wp_remote_get($url, ['timeout' => 10]);
                            if (is_wp_error($font_resp) || wp_remote_retrieve_response_code($font_resp) !== 200) {
                                return $fm[0]; // keep remote URL on failure
                            }
                            if (@file_put_contents($target, wp_remote_retrieve_body($font_resp)) === false) {
                                return $fm[0];
                            }
                            $count++;
                        }
                        return 'url(' . $this->fonts_public_url($pkg, $name) . ')';
                    },
                    $block
                );
            }
            unset($block);

            $final_css = CssOptimizer::safe_minify(implode("\n", $kept));
            if (@file_put_contents($css_file, $final_css) === false) {
                return null;
            }
            @file_put_contents($stamp_file, (string) time());
            @file_put_contents($dir . '/index.php', "<?php // silence\n");

            return [
                'css_url' => $this->fonts_public_url($pkg, 'fonts.css'),
                'preload_url' => $this->first_font_url($final_css, $pkg),
            ];
        } catch (\Throwable $e) {
            return null;
        }
    }

    private function fonts_public_url(string $pkg, string $file): string {
        return WP_CONTENT_URL . '/cache/turbopress/fonts/' . $pkg . '/' . $file;
    }

    private function first_font_url(string $css, string $pkg): ?string {
        if (preg_match('/url\(([^)]+\.woff2)\)/i', $css, $m)) {
            return html_entity_decode($m[1], ENT_QUOTES);
        }
        return null;
    }

    /**
     * Pin known CDN CSS to versioned bundles shipped inside the plugin.
     * integrity/crossorigin attributes must be dropped (they bind to the
     * original file hash and would block the swapped resource).
     */
    private function rewrite_vendor_css(string $html): string {
        $map = [
            // unpkg leaflet (any 1.9.x) → bundled 1.9.4
            '#^https?://unpkg\.com/leaflet@(\d+\.\d+\.\d+)/dist/leaflet\.css#i' => ['leaflet@1.9.4/leaflet.css'],
            // code.jquery.com jquery-ui theme css → bundled 1.13.3
            '#^https?://code\.jquery\.com/ui/(\d+\.\d+(\.\d+)?)/themes/[^/]+/jquery-ui(\.min)?\.css#i' => ['jquery-ui@1.13.3/jquery-ui.min.css'],
        ];

        return preg_replace_callback(
            '/<link\s+([^>]*href=[\'"](https?:\/\/(?:unpkg\.com|code\.jquery\.com)[^\'"]+)[\'"][^>]*)>/i',
            function ($m) use ($map) {
                foreach ($map as $pattern => $target) {
                    if (!preg_match($pattern, $m[2])) {
                        continue;
                    }
                    $vendor_url = TURBOPRESS_URL . 'assets/vendor/' . $target[0];
                    $attrs = preg_replace('/href=[\'"][^\'"]+[\'"]/i', 'href="' . esc_url($vendor_url) . '"', $m[1]);
                    $attrs = preg_replace('/\s(integrity|crossorigin|referrerpolicy)(=[^\s>]+)?/i', '', $attrs);
                    return '<link ' . trim((string) $attrs) . '>';
                }
                return $m[0];
            },
            $html
        );
    }
}
