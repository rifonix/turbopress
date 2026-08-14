<?php
namespace Turbopress;

if (!defined('ABSPATH')) {
    exit;
}

class CriticalCssTransformer {
    private Config $config;
    private ApiClient $api_client;

    public function __construct(Config $config, ApiClient $api_client) {
        $this->config = $config;
        $this->api_client = $api_client;
    }

    public function transform(string $html): string {
        $current_url = $this->get_current_url();
        $is_mobile = wp_is_mobile();
        $viewport = $is_mobile ? 'mobile' : 'desktop';

        $critical_css = $this->get_critical_css($current_url, $viewport);

        if (!empty($critical_css)) {
            // Inject Critical CSS inline in <head>
            $style_tag = sprintf(
                '<style id="turbopress-critical-css">%s</style>',
                $critical_css
            );
            $html = preg_replace('/(<head[^>]*>)/i', "$1\n" . $style_tag, $html, 1);

            // Turn render-blocking CSS links into async deferred loaders if configured
            if ($this->config->get('critical_css.async_load_full', true)) {
                $html = $this->defer_full_stylesheets($html);
            }
        } else {
            // Asynchronously dispatch Critical CSS extraction job to Cloudflare Edge
            $this->maybe_dispatch_generation($current_url);
        }

        return $html;
    }

    private function get_critical_css(string $url, string $viewport): ?string {
        $host = isset($_SERVER['HTTP_HOST']) ? strtolower($_SERVER['HTTP_HOST']) : 'localhost';
        $parsed = parse_url($url);
        $path = $parsed['path'] ?? '/';
        $url_hash = md5($path . '_' . $viewport);

        $cache_file = TURBOPRESS_CACHE_DIR . '/' . md5($host) . '/css/' . $url_hash . '.css';

        if (file_exists($cache_file)) {
            return @file_get_contents($cache_file);
        }

        return null;
    }

    private function defer_full_stylesheets(string $html): string {
        $excluded = (array) $this->config->get('critical_css.excluded_stylesheets', []);

        return preg_replace_callback(
            '/<link\s+([^>]*rel=[\'"]stylesheet[\'"][^>]*)>/i',
            function ($matches) use ($excluded) {
                $full_tag = $matches[0];
                $attributes = $matches[1];

                // Check exclusions
                foreach ($excluded as $ex) {
                    if (strpos($attributes, $ex) !== false) {
                        return $full_tag;
                    }
                }

                // Extract href
                if (preg_match('/href=[\'"]([^\'"]+)[\'"]/i', $attributes, $href_match)) {
                    $href = $href_match[1];
                    $clean_attrs = preg_replace('/rel=[\'"]stylesheet[\'"]/i', '', $attributes);

                    return sprintf(
                        '<link rel="preload" href="%s" as="style" onload="this.onload=null;this.rel=\'stylesheet\'" %s>' .
                        '<noscript><link rel="stylesheet" href="%s"></noscript>',
                        esc_url($href),
                        trim($clean_attrs),
                        esc_url($href)
                    );
                }

                return $full_tag;
            },
            $html
        );
    }

    private function maybe_dispatch_generation(string $url): void {
        if (!$this->config->is_connected()) {
            return;
        }

        // Throttle dispatch using transients (once per 10 minutes per URL)
        $transient_key = 'tp_dispatch_' . md5($url);
        if (get_transient($transient_key)) {
            return;
        }

        set_transient($transient_key, 1, 600);

        // Non-blocking asynchronous dispatch
        wp_schedule_single_event(time(), 'turbopress_async_optimize', ['url' => $url]);
    }

    private function get_current_url(): string {
        $scheme = (isset($_SERVER['HTTPS']) && $_SERVER['HTTPS'] === 'on') ? 'https' : 'http';
        $host = $_SERVER['HTTP_HOST'] ?? 'localhost';
        $uri = $_SERVER['REQUEST_URI'] ?? '/';
        return $scheme . '://' . $host . $uri;
    }
}
