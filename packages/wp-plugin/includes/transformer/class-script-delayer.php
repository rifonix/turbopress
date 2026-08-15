<?php
namespace Turbopress;

if (!defined('ABSPATH')) {
    exit;
}

class ScriptDelayer {
    /** Inline scripts larger than this stay synchronous (base64 inflation cap). */
    private const MAX_INLINE_DEFER_BYTES = 12288;

    private Config $config;

    public function __construct(Config $config) {
        $this->config = $config;
    }

    public function transform(string $html): string {
        $mode = $this->config->get('javascript.execution_mode', 'defer');
        if ($mode === 'none') {
            return $html;
        }

        $exclusions = (array) $this->config->get('javascript.exclusions', []);
        $delay_timeout = (int) $this->config->get('javascript.delay_timeout_ms', 3500);
        $remove_migrate = (bool) $this->config->get('javascript.remove_jquery_migrate', false)
            && $mode === 'defer';
        $script_order = 0;
        $external_deferred = false;

        // CSP sniff: data:-URI scripts are unusable under a restrictive
        // script-src, so keep inline scripts synchronous in that case.
        $inline_defer_allowed = $this->inline_data_uri_allowed();

        // Transform <script> tags.
        //
        // v1.2.0 semantics: exclusions apply ONLY to interaction_delay mode.
        // In defer mode every external script gets `defer` — `defer` is
        // order-preserving by spec, so jQuery → jQuery-dependent → builder
        // bundles keep executing in DOM order without being render-blocking.
        //
        // v1.3.0 defer-complete: inline scripts that appear AFTER the first
        // deferred external are converted to <script defer src="data:…"> so
        // they execute in document order between their dependencies (the
        // Airlift trick — defer applies to data: srcs). Without this, WP's
        // `*-js-extra` config blocks ran at parse time against not-yet-loaded
        // globals.
        $result = preg_replace_callback(
            '/<script(\s+[^>]*)?>([\s\S]*?)<\/script>/i',
            function ($matches) use (&$script_order, &$external_deferred, $mode, $exclusions, $remove_migrate, $inline_defer_allowed) {
                $full_tag = $matches[0];
                $attributes = $matches[1] ?? '';
                $content = $matches[2] ?? '';

                // Skip JSON-LD, Speculation Rules, Application JSON (any quoting style)
                if (
                    stripos($attributes, 'ld+json') !== false ||
                    stripos($attributes, 'application/json') !== false ||
                    stripos($attributes, 'speculationrules') !== false ||
                    stripos($attributes, 'turbopress-loader') !== false ||
                    stripos($attributes, 'turbopress-hydrator') !== false
                ) {
                    return $full_tag;
                }

                // tp-exclude contract: anything we (or a theme) explicitly
                // marks is never transformed.
                if (stripos($attributes, 'tp-exclude') !== false) {
                    return $full_tag;
                }

                // ES modules handle their own loading; converting them to
                // inline type swaps breaks import semantics.
                if (preg_match('/type\s*=\s*[\'"]module[\'"]/i', $attributes)) {
                    return $full_tag;
                }

                // async scripts self-manage ordering; leave untouched.
                if (preg_match('/[\s\'"]async(?:[\s\'"]|$)/i', $attributes)) {
                    return $full_tag;
                }

                // Already-deferred externals are correct in defer mode. In
                // interaction_delay mode they MUST join the delayed chain:
                // left as-is they execute at parse time against globals
                // (e.g. jQuery) that are still withheld placeholders — the
                // #1 cause of "interactivity doesn't work" reports.
                if (preg_match('/[\s\'"]defer(?:[\s\'"]|$)/i', $attributes) && $mode !== 'interaction_delay') {
                    return $full_tag;
                }

                // Optional: drop jquery-migrate entirely (defer mode only).
                if ($remove_migrate && stripos($attributes, 'jquery-migrate') !== false) {
                    return '';
                }

                $has_src = preg_match('/src=[\'"]([^\'"]+)[\'"]/i', $attributes, $src_match) === 1;
                if (!$has_src) {
                    if ($mode === 'interaction_delay') {
                        foreach ($exclusions as $exclusion) {
                            if (!empty($content) && stripos($content, $exclusion) !== false) {
                                return $full_tag;
                            }
                        }
                    } elseif (!$external_deferred || !$inline_defer_allowed) {
                        // Nothing deferred before this point: the original
                        // sync position is already correct. Leave untouched.
                        return $full_tag;
                    } elseif (strlen($content) > self::MAX_INLINE_DEFER_BYTES) {
                        // Too large to inline as base64; keep sync (rare —
                        // oversized inline blobs are usually self-contained
                        // analytics loaders).
                        return $full_tag;
                    } else {
                        $script_order++;
                        $clean_attrs = trim((string) preg_replace('/type=[\'"][^\'"]+[\'"]/i', '', $attributes));
                        return sprintf(
                            '<script defer src="data:text/javascript;base64,%s"%s></script>',
                            base64_encode($content),
                            $clean_attrs !== '' ? ' ' . $clean_attrs : ''
                        );
                    }
                } else {
                    // interaction_delay exclusions: scripts that must run
                    // immediately even before first interaction.
                    if ($mode === 'interaction_delay') {
                        foreach ($exclusions as $exclusion) {
                            if (
                                (!empty($attributes) && stripos($attributes, $exclusion) !== false) ||
                                (!empty($content) && stripos($content, $exclusion) !== false)
                            ) {
                                return $full_tag;
                            }
                        }
                    }
                }

                $script_order++;

                if ($mode === 'defer') {
                    // External scripts only; inline tags stay synchronous.
                    if ($has_src) {
                        $external_deferred = true;
                        return '<script' . $attributes . ' defer>' . $content . '</script>';
                    }
                    return $full_tag;
                }

                // Interaction Delay (opt-in "ludicrous" behaviour)
                if ($has_src) {
                    $src = $src_match[1];
                    $clean_attrs = preg_replace('/src=[\'"][^\'"]+[\'"]/i', '', $attributes);
                    $clean_attrs = preg_replace('/type=[\'"][^\'"]+[\'"]/i', '', (string) $clean_attrs);

                    return sprintf(
                        '<script type="text/turbopress" data-tp-src="%s" data-tp-order="%d" %s></script>',
                        esc_url($src),
                        $script_order,
                        trim((string) $clean_attrs)
                    );
                }

                // Inline Script
                $clean_attrs = preg_replace('/type=[\'"][^\'"]+[\'"]/i', '', $attributes);
                return sprintf(
                    '<script type="text/turbopress" data-tp-order="%d" %s>%s</script>',
                    $script_order,
                    trim((string) $clean_attrs),
                    $content
                );
            },
            $html
        );

        // Airlift rule: a failed regex must never emit null/empty output.
        if (!is_string($result) || preg_last_error() !== PREG_NO_ERROR) {
            return $html;
        }
        $html = $result;

        // Inject Micro-Loader in <head> (deferred: never render-blocking)
        if ($mode === 'interaction_delay') {
            $loader_url = TURBOPRESS_URL . 'assets/js/turbopress-loader.min.js';
            $loader_tag = sprintf(
                '<script id="turbopress-loader-config" tp-exclude>' .
                'window._tpLoaderConfig = { timeout: %d };' .
                'window._tpJQueue = window._tpJQueue || [];' .
                'if (typeof window.jQuery === "undefined") {' .
                '  window._tpJStub = function(selector) {' .
                '    if (typeof selector === "function") { window._tpJQueue.push(selector); return window._tpJStub; }' .
                '    return { ready: function(fn) { window._tpJQueue.push(fn); return window._tpJStub; } };' .
                '  };' .
                '  window.$ = window.jQuery = window._tpJStub;' .
                '}' .
                '</script>' .
                '<script src="%s" id="turbopress-loader-core" tp-exclude defer></script>',
                $delay_timeout,
                esc_url($loader_url)
            );

            $html = preg_replace('/(<head[^>]*>)/i', "$1\n" . $loader_tag, $html, 1) ?? $html;
        }

        return $html;
    }

    /**
     * Heuristic CSP check: a script-src that doesn't list data: (or an
     * equivalent wildcard) blocks data:-URI scripts, so inline-defer
     * conversion is disabled for this response.
     */
    private function inline_data_uri_allowed(): bool {
        foreach (headers_list() as $header) {
            if (stripos($header, 'content-security-policy') !== false
                && stripos($header, 'script-src') !== false) {
                return (bool) preg_match('/script-src[^;]*\bdata:/i', $header)
                    || (bool) preg_match('/script-src[^;]*\*/i', $header)
                    || stripos($header, 'unsafe-inline') !== false;
            }
        }
        return true;
    }
}
