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

        $rules = [
            'prerender' => [
                [
                    'source' => 'document',
                    'where' => [
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
                    ],
                    'eagerness' => $eagerness
                ]
            ]
        ];

        $rules_json = json_encode($rules, JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT);
        $script_tag = sprintf(
            '<script type="speculationrules" id="turbopress-speculation-rules">%s</script>',
            $rules_json
        );

        return preg_replace('/(<\/head>)/i', $script_tag . "\n$1", $html, 1);
    }
}
