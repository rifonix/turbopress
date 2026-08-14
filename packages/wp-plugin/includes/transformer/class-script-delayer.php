<?php
namespace Turbopress;

if (!defined('ABSPATH')) {
    exit;
}

class ScriptDelayer {
    private Config $config;

    public function __construct(Config $config) {
        $this->config = $config;
    }

    public function transform(string $html): string {
        $mode = $this->config->get('javascript.execution_mode', 'interaction_delay');
        if ($mode === 'none') {
            return $html;
        }

        $exclusions = (array) $this->config->get('javascript.exclusions', []);
        $delay_timeout = (int) $this->config->get('javascript.delay_timeout_ms', 3500);
        $script_order = 0;

        // Transform <script> tags
        $html = preg_replace_callback(
            '/<script(\s+[^>]*)?>([\s\S]*?)<\/script>/i',
            function ($matches) use (&$script_order, $mode, $exclusions) {
                $full_tag = $matches[0];
                $attributes = $matches[1] ?? '';
                $content = $matches[2] ?? '';

                // Skip JSON-LD, Speculation Rules, Application JSON
                if (
                    strpos($attributes, 'type="application/ld+json"') !== false ||
                    strpos($attributes, 'type="application/json"') !== false ||
                    strpos($attributes, 'type="speculationrules"') !== false ||
                    strpos($attributes, 'turbopress-loader') !== false ||
                    strpos($attributes, 'turbopress-hydrator') !== false
                ) {
                    return $full_tag;
                }

                // Check exclusions safelist
                foreach ($exclusions as $exclusion) {
                    if (
                        (!empty($attributes) && stripos($attributes, $exclusion) !== false) ||
                        (!empty($content) && stripos($content, $exclusion) !== false)
                    ) {
                        return $full_tag;
                    }
                }

                $script_order++;

                if ($mode === 'defer') {
                    if (preg_match('/src=[\'"]([^\'"]+)[\'"]/i', $attributes) && strpos($attributes, 'defer') === false) {
                        return '<script' . $attributes . ' defer>' . $content . '</script>';
                    }
                    return $full_tag;
                }

                // Interaction Delay (Tier 2)
                if (preg_match('/src=[\'"]([^\'"]+)[\'"]/i', $attributes, $src_match)) {
                    $src = $src_match[1];
                    $clean_attrs = preg_replace('/src=[\'"][^\'"]+[\'"]/i', '', $attributes);
                    $clean_attrs = preg_replace('/type=[\'"][^\'"]+[\'"]/i', '', $clean_attrs);

                    return sprintf(
                        '<script type="text/turbopress" data-tp-src="%s" data-tp-order="%d" %s></script>',
                        esc_url($src),
                        $script_order,
                        trim($clean_attrs)
                    );
                } else {
                    // Inline Script
                    $clean_attrs = preg_replace('/type=[\'"][^\'"]+[\'"]/i', '', $attributes);
                    return sprintf(
                        '<script type="text/turbopress" data-tp-order="%d" %s>%s</script>',
                        $script_order,
                        trim($clean_attrs),
                        $content
                    );
                }
            },
            $html
        );

        // Inject Standalone jQuery Stub and Micro-Loader in <head>
        if ($mode === 'interaction_delay') {
            $loader_url = TURBOPRESS_URL . 'assets/js/turbopress-loader.min.js';
            $loader_tag = sprintf(
                '<script id="turbopress-loader-config">' .
                'window._tpLoaderConfig = { timeout: %d };' .
                'window._tpJQueue = window._tpJQueue || [];' .
                'if (typeof window.$ === "undefined") {' .
                '  window.$ = window.jQuery = function(selector) {' .
                '    if (typeof selector === "function") {' .
                '      window._tpJQueue.push(selector); return window.$; ' .
                '    }' .
                '    return { ready: function(fn) { window._tpJQueue.push(fn); } };' .
                '  };' .
                '}' .
                '</script>' .
                '<script src="%s" id="turbopress-loader-core"></script>',
                $delay_timeout,
                esc_url($loader_url)
            );

            $html = preg_replace('/(<head[^>]*>)/i', "$1\n" . $loader_tag, $html, 1);
        }

        return $html;
    }
}
