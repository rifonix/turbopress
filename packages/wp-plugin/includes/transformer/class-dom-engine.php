<?php
namespace Turbopress;

if (!defined('ABSPATH')) {
    exit;
}

class DomEngine {
    private Config $config;
    private ApiClient $api_client;
    private CriticalCssTransformer $critical_css_transformer;
    private ScriptDelayer $script_delayer;
    private MediaOptimizer $media_optimizer;
    private SpeculationRules $speculation_rules;

    public function __construct(Config $config, ApiClient $api_client) {
        $this->config = $config;
        $this->api_client = $api_client;
        $this->critical_css_transformer = new CriticalCssTransformer($config, $api_client);
        $this->script_delayer = new ScriptDelayer($config);
        $this->media_optimizer = new MediaOptimizer($config);
        $this->speculation_rules = new SpeculationRules($config);
    }

    public function transform(string $html): string {
        // Safety guard: if HTML is invalid or partial, return as is
        if (empty($html) || stripos($html, '</head>') === false) {
            return $html;
        }

        try {
            // 1. Optimize Media (LCP Preload, fetchpriority="high", CLS dimensions)
            if ($this->config->get('media.auto_fetchpriority_lcp', true)) {
                $html = $this->media_optimizer->transform($html);
            }

            // 2. Critical CSS Inlining & Asynchronous Stylesheets
            if ($this->config->get('critical_css.enabled', true)) {
                $html = $this->critical_css_transformer->transform($html);
            }

            // 3. 3-Tier Interaction-based JavaScript Delaying
            if ($this->config->get('javascript.execution_mode', 'defer') !== 'none') {
                $html = $this->script_delayer->transform($html);
            }

            // 4. Inject W3C Speculation Rules Prerendering
            if ($this->config->get('dynamic.speculation_rules_prerender', true)) {
                $html = $this->speculation_rules->transform($html);
            }

            // 5. Inject Dynamic Nonce Hydrator Script
            if ($this->config->get('dynamic.nonce_ajax_refresh', true)) {
                $html = $this->inject_hydrator_scripts($html);
            }

            // 6. Signature watermark (inside <body> so it never lands after </html>)
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

    private function inject_hydrator_scripts(string $html): string {
        $hydrator_url = TURBOPRESS_URL . 'assets/js/hydrator.min.js';
        $nonce_endpoint = esc_url_raw(rest_url('turbopress/v1/nonces'));

        $script = sprintf(
            '<script id="turbopress-hydrator-init">window._tpHydrateConfig = { endpoint: "%s" };</script>' .
            '<script src="%s" id="turbopress-hydrator-js" defer></script>',
            $nonce_endpoint,
            esc_url($hydrator_url)
        );

        return str_ireplace('</body>', $script . '</body>', $html);
    }
}
