<?php
namespace Turbopress;

if (!defined('ABSPATH')) {
    exit;
}

class DomEngine {
    /** Scripts DomEngine itself may inject (script-count parity allowance). */
    private const INJECTED_SCRIPT_ALLOWANCE = 4;

    private Config $config;
    private ApiClient $api_client;
    private CriticalCssTransformer $critical_css_transformer;
    private ScriptDelayer $script_delayer;
    private MediaOptimizer $media_optimizer;
    private FontOptimizer $font_optimizer;
    private ResourceHints $resource_hints;
    private SpeculationRules $speculation_rules;

    public function __construct(Config $config, ApiClient $api_client) {
        $this->config = $config;
        $this->api_client = $api_client;
        $this->critical_css_transformer = new CriticalCssTransformer($config, $api_client);
        $this->script_delayer = new ScriptDelayer($config);
        $this->media_optimizer = new MediaOptimizer($config);
        $this->font_optimizer = new FontOptimizer($config);
        $this->resource_hints = new ResourceHints($config);
        $this->speculation_rules = new SpeculationRules($config);
    }

    public function transform(string $html): string {
        // Safety guard: if HTML is invalid or partial, return as is
        if (empty($html) || stripos($html, '</head>') === false) {
            return $html;
        }

        // Idempotency guard: already transformed by THIS version (e.g. a
        // host cache feeding our own output back through the buffer) —
        // never transform twice.
        if ($this->transformed_version($html) === TURBOPRESS_VERSION) {
            return $html;
        }

        // Durable version fingerprint on <html>: comments (our old
        // signature) are stripped by LiteSpeed's HTML minifier, an
        // attribute is not.
        $html = $this->stamp_version($html);

        try {
            // Each stage is validated; a stage that structurally damages
            // the document is reverted (Airlift-style fail-safe) instead of
            // ever shipping broken HTML to a visitor.

            // 1. Font optimization FIRST: localizing Google Fonts rewrites
            //    stylesheet hrefs before CSS combining ever sees them, and
            //    vendor CSS pinning removes unpkg/code.jquery.com links.
            $html = $this->stage($html, fn(string $h): string => $this->font_optimizer->transform($h), 'fonts');

            // 2. Optimize Media (LCP Preload, fetchpriority="high", CLS dimensions)
            if ($this->config->get('media.auto_fetchpriority_lcp', true)) {
                $html = $this->stage($html, fn(string $h): string => $this->media_optimizer->transform($h), 'media');
            }

            // 3. Critical CSS Inlining + Combined/Async Stylesheets
            if ($this->config->get('critical_css.enabled', true)) {
                $html = $this->stage($html, fn(string $h): string => $this->critical_css_transformer->transform($h), 'critical_css');
            }

            // 4. JavaScript Deferral (all external scripts) / Interaction Delay
            if ($this->config->get('javascript.execution_mode', 'defer') !== 'none') {
                $html = $this->stage($html, fn(string $h): string => $this->script_delayer->transform($h), 'scripts');
            }

            // 5. Resource Hints AFTER rewrites: preconnect decisions must
            //    reflect the final HTML (localized fonts, bundled vendor CSS).
            $html = $this->stage($html, fn(string $h): string => $this->resource_hints->transform($h), 'hints');

            // 6. Inject W3C Speculation Rules Prerendering
            if ($this->config->get('dynamic.speculation_rules_prerender', true)) {
                $html = $this->stage($html, fn(string $h): string => $this->speculation_rules->transform($h), 'speculation');
            }

            // 7. Inject Dynamic Nonce Hydrator Script
            if ($this->config->get('dynamic.nonce_ajax_refresh', true)) {
                $html = $this->stage($html, fn(string $h): string => $this->inject_hydrator_scripts($h), 'hydrator');
            }

            // 8. Signature watermark (inside <body> so it never lands after </html>)
            $signature = "\n<!-- Optimized with TurboPress v" . TURBOPRESS_VERSION . " -->";
            if (stripos($html, '</body>') !== false) {
                $html = str_ireplace('</body>', $signature . '</body>', $html);
            }

            return $html;
        } catch (\Throwable $e) {
            // Fault-proof safety fallback: Never break customer front-end
            return $html . "\n<!-- Turbopress Transformation Fallback: " . esc_html($e->getMessage()) . " -->";
        }
    }

    /**
     * Run one transformation stage; revert to the input when the output is
     * structurally suspect (script tags vanished, document truncated,
     * implausible size delta). Worst case = the unoptimized page, never a
     * broken one.
     */
    private function stage(string $input, callable $fn, string $name): string {
        $output = (string) $fn($input);

        if ($output === '' || !$this->structurally_valid($input, $output)) {
            return $input . "\n<!-- Turbopress stage reverted: " . esc_html($name) . " -->";
        }

        return $output;
    }

    private function structurally_valid(string $before, string $after): bool {
        // Document skeleton must survive every stage.
        if (stripos($after, '<head') === false || stripos($after, '</body>') === false) {
            return false;
        }

        // Plausible size envelope: inlining critical CSS grows the page;
        // combining 40 stylesheets shrinks it. Beyond 0.33×–3× something
        // catastrophic happened (truncation, double-paste).
        $ratio = strlen($after) / max(1, strlen($before));
        if ($ratio < 0.33 || $ratio > 3.0) {
            return false;
        }

        // Script-tag parity: stages must not destroy script tags. Removals
        // are only tolerated up to remove_jquery_migrate (1-2 tags);
        // additions only up to our own injected-loader allowance.
        $delta = $this->script_count($after) - $this->script_count($before);
        return $delta >= -2 && $delta <= self::INJECTED_SCRIPT_ALLOWANCE;
    }

    private function script_count(string $html): int {
        return (int) preg_match_all('/<script[\s>]/i', $html);
    }

    private function transformed_version(string $html): ?string {
        if (preg_match('/<html\b[^>]*\sdata-tp-version=["\']([0-9.]+)["\']/i', $html, $m)) {
            return $m[1];
        }
        return null;
    }

    private function stamp_version(string $html): string {
        if ($this->transformed_version($html) !== null) {
            // Old-version stamp present: replace it with the current one so
            // the fingerprint always reflects the transforming release.
            return (string) preg_replace(
                '/(<html\b[^>]*\s)data-tp-version=["\'][0-9.]+["\']/i',
                '$1data-tp-version="' . TURBOPRESS_VERSION . '"',
                $html,
                1
            );
        }
        return (string) preg_replace(
            '/(<html\b[^>]*?)(\s*>)',
            '$1 data-tp-version="' . TURBOPRESS_VERSION . '"$2',
            $html,
            1
        );
    }

    private function inject_hydrator_scripts(string $html): string {
        $hydrator_url = TURBOPRESS_URL . 'assets/js/hydrator.min.js';
        $nonce_endpoint = esc_url_raw(rest_url('turbopress/v1/nonces'));

        $script = sprintf(
            '<script id="turbopress-hydrator-init" tp-exclude>window._tpHydrateConfig = { endpoint: "%s" };</script>' .
            '<script src="%s" id="turbopress-hydrator-js" tp-exclude defer></script>',
            $nonce_endpoint,
            esc_url($hydrator_url)
        );

        return str_ireplace('</body>', $script . '</body>', $html);
    }
}
