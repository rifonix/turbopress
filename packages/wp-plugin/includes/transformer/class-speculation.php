<?php
namespace Turbopress;

if (!defined('ABSPATH')) {
    exit;
}

class SpeculationRules {
    private Config $config;

    public function __construct(Config $config) {
        $this->config = $config;
    }

    public function transform(string $html): string {
        $eagerness = $this->config->get('dynamic.speculation_rules_eagerness', 'moderate');
        $excluded_paths = (array) $this->config->get('dynamic.excluded_prerender_paths', [
            '/wp-admin/**',
            '/wp-login.php',
            '/cart/**',
            '/checkout/**',
            '/my-account/**',
            '/logout/**',
            '/wp-json/**',
            '*.pdf',
            '*.zip'
        ]);

        $where = [
            'and' => [
                ['href_matches' => '/*'],
                [
                    'not' => [
                        'or' => array_map(function ($pattern) {
                            return ['href_matches' => $pattern];
                        }, $excluded_paths)
                    ]
                ]
            ]
        ];

        // Prefetch warms the HTTP cache while the real navigation still loads
        // (and runs JS) with normal priorities — safe with deferred scripts,
        // sliders, maps and layout-measuring widgets.
        // Prerendered documents initialize JS against a hidden, throttled
        // document and are activated on click — that silently breaks
        // Elementor/Leaflet/Swiper initialization. Prerender is only safe
        // when we are not transforming scripts at all.
        $js_mode = $this->config->get('javascript.execution_mode', 'defer');
        $rules = [
            'prefetch' => [
                [
                    'source' => 'document',
                    'where' => $where,
                    'eagerness' => $eagerness === 'immediate' ? 'moderate' : $eagerness
                ]
            ]
        ];

        if ($js_mode === 'none') {
            $rules['prerender'] = [
                [
                    'source' => 'document',
                    'where' => $where,
                    'eagerness' => 'conservative'
                ]
            ];
        }

        $rules_json = json_encode($rules, JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT);
        $script_tag = sprintf(
            '<script type="speculationrules" id="turbopress-speculation-rules">%s</script>',
            $rules_json
        );

        $updated = preg_replace('/(<\/head>)/i', $script_tag . "\n$1", $html, 1);
        return is_string($updated) ? $updated : $html;
    }
}
