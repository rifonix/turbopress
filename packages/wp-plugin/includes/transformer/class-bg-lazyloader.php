<?php
namespace Turbopress;

if (!defined('ABSPATH')) {
    exit;
}

/**
 * Lazy-loads CSS background images declared in inline style attributes
 * (Elementor section/column backgrounds below the fold).
 *
 * The image url() is swapped for a 1px placeholder and the real URL moved
 * to data-tp-bg; an IntersectionObserver (rootMargin 300px) swaps it back
 * in as the element approaches the viewport.
 *
 * LCP safety: the FIRST inline-background element in the document (the
 * hero on builder sites) and the edge-verified LCP image URL are always
 * left eager.
 */
class BgLazyLoader {
    private Config $config;

    private const PLACEHOLDER = 'data:image/gif;base64,R0lGODlhAQABAAAAACwAAAAAAQABAAA=';

    public function __construct(Config $config) {
        $this->config = $config;
    }

    public function transform(string $html): string {
        if (!(bool) $this->config->get('media.lazyload_backgrounds', true)) {
            return $html;
        }

        $verified_lcp = MediaOptimizer::get_lcp_image($this->current_url(), wp_is_mobile() ? 'mobile' : 'desktop');
        $skipped_first = false;
        $changed = 0;

        $html = preg_replace_callback(
            '/\sstyle=(["\'])([^"\']*background[^"\']*url\([^)]*\)[^"\']*)\1/i',
            function (array $m) use (&$skipped_first, &$changed, $verified_lcp): string {
                if (!preg_match('/url\((["\']?)(https?:\/\/[^"\')]+)\1\)/i', $m[2], $um)) {
                    return $m[0]; // only remote image urls qualify
                }
                $url = html_entity_decode($um[2], ENT_QUOTES);

                // Hero heuristic: first inline-bg element stays eager.
                if (!$skipped_first) {
                    $skipped_first = true;
                    return $m[0];
                }
                // Never lazy the verified LCP image.
                if ($verified_lcp !== null && stripos($url, $verified_lcp) !== false) {
                    return $m[0];
                }

                $new_style = str_replace($um[0], 'url("' . self::PLACEHOLDER . '")', $m[2]);
                $changed++;
                return ' style=' . $m[1] . $new_style . $m[1] . ' data-tp-bg="' . esc_attr($url) . '"';
            },
            $html
        ) ?? $html;

        if ($changed > 0) {
            $js = '<script tp-exclude>(function(){'
                . 'var io=new IntersectionObserver(function(es){es.forEach(function(en){'
                . 'if(!en.isIntersecting)return;var el=en.target,u=el.getAttribute("data-tp-bg");'
                . 'if(u){el.style.backgroundImage="url(\'"+u+"\')";el.removeAttribute("data-tp-bg")}io.unobserve(el)'
                . '})},{rootMargin:"300px 0px"});'
                . 'var boot=function(){document.querySelectorAll("[data-tp-bg]").forEach(function(el){io.observe(el)})};'
                . 'if(document.readyState!=="loading")boot();else document.addEventListener("DOMContentLoaded",boot);'
                . '})();</script>';
            $html = str_ireplace('</body>', $js . '</body>', $html);
        }

        return $html;
    }

    private function current_url(): string {
        $scheme = (isset($_SERVER['HTTPS']) && $_SERVER['HTTPS'] === 'on') ? 'https' : 'http';
        return $scheme . '://' . ($_SERVER['HTTP_HOST'] ?? 'localhost') . ($_SERVER['REQUEST_URI'] ?? '/');
    }
}
