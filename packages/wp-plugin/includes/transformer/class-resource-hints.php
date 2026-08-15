<?php
namespace Turbopress;

if (!defined('ABSPATH')) {
    exit;
}

/**
 * Auto-injects preconnect/dns-prefetch hints for 3rd-party origins actually
 * referenced by the page (scripts, stylesheets, fonts, images, frames).
 * Up to 6 preconnects (font origins get crossorigin) + 4 dns-prefetches.
 */
class ResourceHints {
    private const MAX_PRECONNECT = 6;
    private const MAX_DNS_PREFETCH = 4;

    private Config $config;

    public function __construct(Config $config) {
        $this->config = $config;
    }

    public function transform(string $html): string {
        if (!(bool) $this->config->get('hints.resource_hints', true)) {
            return $html;
        }
        if (stripos($html, '<head') === false) {
            return $html;
        }

        $own_host = strtolower((string) parse_url(home_url(), PHP_URL_HOST));
        $candidates = []; // host => weight (higher = more important)

        $collect = function (string $html, string $tag_regex, string $attr, int $weight) use (&$candidates, $own_host): void {
            if (!preg_match_all($tag_regex, $html, $matches)) {
                return;
            }
            foreach ($matches[1] as $attrs) {
                if (!preg_match('/' . $attr . '=[\'"]([^\'"]+)[\'"]/i', $attrs, $m)) {
                    continue;
                }
                $url = trim($m[1]);
                if ($url === '' || str_starts_with($url, 'data:') || str_starts_with($url, 'blob:') || str_starts_with($url, '#')) {
                    continue;
                }
                $host = strtolower((string) parse_url($url, PHP_URL_HOST));
                if ($host === '' || $host === $own_host || str_ends_with($host, '.' . $own_host) || $own_host === 'localhost') {
                    continue;
                }
                $weight_bonus = 0;
                if (strpos($host, 'fonts.') === 0 || strpos($url, '/font') !== false || strpos($host, 'font') !== false) {
                    $weight_bonus = 10; // fonts first
                }
                $candidates[$host] = max($candidates[$host] ?? 0, $weight + $weight_bonus);
            }
        };

        // Stylesheets & preloads: high priority origins.
        $collect($html, '/<link\s+([^>]+)>/i', 'href', 5);
        // Scripts.
        $collect($html, '/<script\s+([^>]+)>/i', 'src', 4);
        // Fonts referenced by inline critical CSS (url(...) to woff2).
        if (preg_match('/<style[^>]*id=[\'"]turbopress-critical-css[\'"][^>]*>([\s\S]*?)<\/style>/i', $html, $cssm)) {
            if (preg_match_all('/url\(\s*[\'"]?(https?:\/\/[^\'")\s]+)[\'"]?\s*\)/i', $cssm[1], $um)) {
                foreach ($um[1] as $u) {
                    $host = strtolower((string) parse_url($u, PHP_URL_HOST));
                    if ($host !== '' && $host !== $own_host) {
                        $candidates[$host] = max($candidates[$host] ?? 0, 9); // font hosts
                    }
                }
            }
        }
        // Images + iframes: lowest priority.
        $collect($html, '/<img\s+([^>]+)>/i', 'src', 2);
        $collect($html, '/<iframe\s+([^>]+)>/i', 'src', 1);

        if (empty($candidates)) {
            return $html;
        }

        // Already-hinted origins (theme hardcodes some).
        $already = [];
        if (preg_match_all('/<link\s+[^>]*rel=[\'"](?:preconnect|dns-prefetch)[\'"][^>]*href=[\'"]([^\'"]+)[\'"][^>]*>/i', $html, $pm)) {
            foreach ($pm[1] as $u) {
                $h = strtolower((string) parse_url($u, PHP_URL_HOST));
                if ($h !== '') {
                    $already[$h] = true;
                }
            }
        }
        $candidates = array_diff_key($candidates, $already);
        if (empty($candidates)) {
            return $html;
        }

        arsort($candidates);
        $hosts = array_keys($candidates);

        $preconnect = array_slice($hosts, 0, self::MAX_PRECONNECT);
        $prefetch = array_slice($hosts, self::MAX_PRECONNECT, self::MAX_DNS_PREFETCH);

        $font_hosts = ['fonts.googleapis.com', 'fonts.gstatic.com', 'use.typekit.net', 'use.typekit.com', 'cdn.fonts.net'];
        $tags = '';
        foreach ($preconnect as $host) {
            $crossorigin = in_array($host, $font_hosts, true) ? ' crossorigin' : '';
            $tags .= '<link rel="preconnect" href="https://' . esc_attr($host) . '"' . $crossorigin . '>';
        }
        foreach ($prefetch as $host) {
            $tags .= '<link rel="dns-prefetch" href="https://' . esc_attr($host) . '">';
        }

        if ($tags === '') {
            return $html;
        }

        return preg_replace('/(<head[^>]*>)/i', "$1\n" . $tags, $html, 1) ?? $html;
    }
}
