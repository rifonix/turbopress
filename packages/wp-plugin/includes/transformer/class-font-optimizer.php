<?php
namespace WPInstant;

if (!defined('ABSPATH')) {
    exit;
}

/**
 * Font optimizer.
 *
 * 1. Google Fonts localization: fetches the css2 (or css) payload with a
 *    modern Chrome UA (woff2 + unicode-range), downloads the latin/latin-ext
 *    woff2 files to wp-content/cache/wp-instant/fonts/, rewrites the CSS to
 *    the same-origin URLs and adds font-display:swap. Kills 4 blocking DNS
 *    connections to fonts.googleapis.com/fonts.gstatic.com. The localized
 *    fonts.css is a normal same-origin sheet, so the CSS combiner can
 *    inline/merge it with the rest of the site CSS.
 * 2. Injects font-display:swap into inline @font-face rules.
 * 3. Preloads the first localized font file (LCP-critical typography).
 *
 * Third-party vendor CSS (leaflet, jquery-ui, …) is handled generically by
 * AssetProxy — no plugin-bundled copies of third-party assets.
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

        // Localize every Google Fonts stylesheet link. Cold requests never
        // block on network: if no localized package exists yet, keep the
        // original Google link and prepare the package on a cron event.
        $html = preg_replace_callback(
            '/<link\s+([^>]*href=[\'"](https?:\/\/fonts\.googleapis\.com\/css2?[^\'"]+)[\'"][^>]*)>/i',
            function ($m) use (&$preload_font) {
                $local = $this->cached_font_package($m[2]);
                if ($local === null) {
                    $this->schedule_localization($m[2]);
                    return $m[0]; // not ready yet: keep the original working link
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
        // NEVER drop stylesheet links: when localization is not ready (or
        // fails), the original Google stylesheet is the only thing keeping
        // the site's fonts working.
        $html = preg_replace_callback(
            '/<link\s+[^>]*(fonts\.googleapis\.com|fonts\.gstatic\.com)[^>]*>/i',
            static function ($m) {
                return preg_match('/rel=[\'"](?:preconnect|dns-prefetch)[\'"]/i', $m[0]) ? '' : $m[0];
            },
            $html
        );

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
            $html = preg_replace_callback(
                '/(<head[^>]*>)/i',
                static fn(array $m): string => $m[1] . "\n" . $preload,
                $html,
                1
            ) ?? $html;
        }

        return $html;
    }

    /**
     * Return the already-localized package for a Google Fonts href, or null
     * when it has not been prepared yet. No network access here — the render
     * path must stay fast and must never fail open into a removed link.
     */
    private function cached_font_package(string $href): ?array {
        try {
            $pkg = md5($href);
            $dir = WP_INSTANT_CACHE_DIR . '/fonts/' . $pkg;
            $css_file = $dir . '/fonts.css';
            $stamp_file = $dir . '/.stamp';

            // Serve existing localization; refresh weekly (Google may re-ship).
            if (file_exists($css_file) && file_exists($stamp_file)) {
                $css = (string) @file_get_contents($css_file);
                $fresh = $css !== '' && (time() - (int) @file_get_contents($stamp_file)) < WEEK_IN_SECONDS;
                if ($fresh) {
                    $preload = $this->first_font_url($css, $pkg);
                    // A package whose files were selectively deleted (host
                    // cache cleanup, partial FTP sync…) must not be served:
                    // a live <link> to a missing fonts.css 404s as text/html
                    // and the browser refuses to apply it. Verify the sheet
                    // AND the preload target still exist on disk.
                    $preload_ok = true;
                    if ($preload !== null) {
                        $file = basename((string) wp_parse_url((string) $preload, PHP_URL_PATH));
                        $preload_ok = (bool) preg_match('/^[\w.-]+\.woff2$/i', (string) $file)
                            && file_exists($dir . '/' . $file);
                    }
                    if ($preload_ok) {
                        return [
                            'css_url' => $this->fonts_public_url($pkg, 'fonts.css'),
                            'preload_url' => $preload,
                        ];
                    }
                }
            }
            return null;
        } catch (\Throwable $e) {
            return null;
        }
    }

    /**
     * Queue background localization (deduped). Deliberately does NOT call
     * spawn_cron(): this runs inside the output-buffer callback, where
     * ALTERNATE_WP_CRON would fatally nest ob_start() or inject a
     * ?doing_wp_cron redirect into the document.
     */
    private function schedule_localization(string $href): void {
        $flag = 'wpins_fontloc_' . md5($href);
        if (get_transient($flag)) {
            return;
        }
        set_transient($flag, 1, 5 * MINUTE_IN_SECONDS);
        wp_schedule_single_event(time(), 'wp_instant_localize_font', [$href]);
    }

    /**
     * Cron entry point: wp_instant_localize_font.
     */
    public static function localize_scheduled(string $href): void {
        $optimizer = new self(new Config());
        $optimizer->prepare_font_package($href);
    }

    /**
     * Download and localize a Google Fonts CSS payload (cron context only).
     * Returns ['css_url' => ..., 'preload_url' => ...] or null on failure.
     */
    private function prepare_font_package(string $href): ?array {
        try {
            $pkg = md5($href);
            $dir = WP_INSTANT_CACHE_DIR . '/fonts/' . $pkg;
            $css_file = $dir . '/fonts.css';
            $stamp_file = $dir . '/.stamp';

            // Skip when another worker already produced a fresh package.
            if (file_exists($css_file) && file_exists($stamp_file)
                && (time() - (int) @file_get_contents($stamp_file)) < WEEK_IN_SECONDS) {
                return null;
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
            // Bounded: past the cap, keep the remote URL (css stays valid).
            $count = 0;
            foreach ($kept as &$block) {
                $block = preg_replace_callback(
                    '/url\((https:\/\/fonts\.gstatic\.com\/[^)]+\.woff2)\)/i',
                    function ($fm) use ($dir, $pkg, &$count) {
                        if ($count >= 12) {
                            return $fm[0];
                        }
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
            // Pre-compressed twins for the .htaccess serving rules.
            if (function_exists('brotli_compress')) {
                $br = @brotli_compress($final_css, 11);
                if (is_string($br) && $br !== '') {
                    @file_put_contents($css_file . '.br', $br);
                }
            }
            $gz = @gzencode($final_css, 9);
            if (is_string($gz) && $gz !== '') {
                @file_put_contents($css_file . '.gz', $gz);
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
        return WP_CONTENT_URL . '/cache/wp-instant/fonts/' . $pkg . '/' . $file;
    }

    private function first_font_url(string $css, string $pkg): ?string {
        if (preg_match('/url\(([^)]+\.woff2)\)/i', $css, $m)) {
            return html_entity_decode($m[1], ENT_QUOTES);
        }
        return null;
    }
}
