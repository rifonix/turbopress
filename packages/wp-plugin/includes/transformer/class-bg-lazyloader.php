<?php
namespace WPInstant;

if (!defined('ABSPATH')) {
    exit;
}

/**
 * Lazy-loads CSS background images declared in inline style attributes
 * (Elementor section/column backgrounds below the fold).
 *
 * Each background url() is swapped for a tiny (24px) CDN derivative that
 * upscales into a naturally soft placeholder, and the real URLs move to
 * data-wpins-bg; an IntersectionObserver swaps them back in as the element
 * approaches the viewport — with a preload+decode gate so the background
 * fades in complete instead of painting progressively. Without CDN offload
 * (or for third-party URLs) the classic 1px transparent gif is used.
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
        $hero_preload = null;
        $changed = 0;
        $lqip_available = (bool) $this->config->get('media.offload_images', false)
            && (bool) $this->config->get('media.lazyload_lqip', true)
            && $this->config->get_site_id() !== ''
            && $this->config->get_api_key() !== '';
        $offloader = null;

        $html = preg_replace_callback(
            '/\sstyle=(["\'])([^"\']*background[^"\']*url\([^)]*\)[^"\']*)\1/i',
            function (array $m) use (&$skipped_first, &$hero_preload, &$changed, &$offloader, $verified_lcp, $lqip_available): string {
                if (!preg_match_all('/url\((["\']?)(https?:\/\/[^"\')]+)\1\)/i', $m[2], $ums, PREG_SET_ORDER)) {
                    return $m[0]; // only remote image urls qualify
                }

                // Hero heuristic: first inline-bg element stays eager. On the
                // cold path (no edge-verified LCP, which MediaOptimizer would
                // already have preloaded) the hero background is the likely
                // LCP — remember it for a high-priority preload below.
                if (!$skipped_first) {
                    $skipped_first = true;
                    if ($verified_lcp === null && $hero_preload === null) {
                        $hero_preload = html_entity_decode($ums[0][2], ENT_QUOTES);
                    }
                    return $m[0];
                }

                $new_style = $m[2];
                $urls = [];
                $placeholders = 0;
                foreach ($ums as $um) {
                    $url = html_entity_decode($um[2], ENT_QUOTES);
                    // Never lazy the verified LCP image.
                    if ($verified_lcp !== null && stripos($url, $verified_lcp) !== false) {
                        continue;
                    }
                    $urls[] = $url;

                    $placeholder = self::PLACEHOLDER;
                    if ($lqip_available) {
                        $origin = $this->origin_url_for($url);
                        if ($origin !== null) {
                            if ($offloader === null) {
                                $offloader = new MediaOffloader($this->config);
                            }
                            $tiny = $offloader->lqip_url($origin);
                            if ($tiny !== null) {
                                $placeholder = $tiny;
                                $offloader->queue_derivative($origin, MediaOffloader::LQIP_WIDTH, 'webp');
                            }
                        }
                    }
                    if ($placeholder !== self::PLACEHOLDER) {
                        $placeholders++;
                    }
                    $new_style = str_replace($um[0], 'url("' . $placeholder . '")', $new_style);
                }

                if (empty($urls)) {
                    return $m[0];
                }

                $changed++;
                return ' style=' . $m[1] . $new_style . $m[1]
                    . ' data-wpins-bg="' . esc_attr((string) wp_json_encode(array_values($urls))) . '"'
                    . ($placeholders > 0 ? ' data-wpins-bg-lqip="1"' : '');
            },
            $html
        ) ?? $html;

        if ($changed > 0) {
            $offset = max(0, min(2000, (int) $this->config->get('media.lazyload_offset_px', 300)));            $js = '<script wpins-exclude>(function(){'
                . 'var io=new IntersectionObserver(function(es){es.forEach(function(en){'
                . 'if(!en.isIntersecting)return;var el=en.target;io.unobserve(el);'
                . 'var raw=el.getAttribute("data-wpins-bg");if(!raw)return;'
                . 'el.removeAttribute("data-wpins-bg");'
                . 'var urls;try{urls=JSON.parse(raw)}catch(e){urls=[raw]}'
                . 'if(!urls.length)return;'
                . 'var apply=function(){var parts=[];for(var i=0;i<urls.length;i++){parts.push("url(\\""+urls[i]+"\\")")}el.style.backgroundImage=parts.join(",")};'
                . 'var im=new Image();im.onload=function(){if(im.decode){im.decode().then(apply,function(){apply()})}else{apply()}};im.onerror=apply;im.src=urls[0];'
                . 'if(im.complete)apply();'
                . '})},{rootMargin:"' . (int) $offset . 'px 0px"});'
                . 'var boot=function(){document.querySelectorAll("[data-wpins-bg]").forEach(function(el){io.observe(el)})};'
                . 'if(document.readyState!=="loading")boot();else document.addEventListener("DOMContentLoaded",boot);'
                . '})();</script>';
            $html = str_ireplace('</body>', $js . '</body>', $html);
        }

        // Hero preload: the eager first background is the likely LCP on the
        // cold path. Skip when a preload for the URL already exists (theme
        // or media stage) so the browser never double-fetches. The URL also
        // occurs verbatim in the inline style itself, so only <link
        // rel=preload> tags count (entity-encoded hrefs included).
        if ($hero_preload !== null && (bool) $this->config->get('media.preload_lcp_image', true)) {
            $already = false;
            if (preg_match_all('/<link\s+[^>]*rel=[\'"]preload[\'"][^>]*>/i', $html, $pm)) {
                $variants = [$hero_preload, esc_attr($hero_preload)];
                foreach ($pm[0] as $tag) {
                    foreach ($variants as $v) {
                        if ($v !== '' && stripos($tag, $v) !== false) {
                            $already = true;
                            break 2;
                        }
                    }
                }
            }
            if (!$already && stripos($html, '<head') !== false) {
                $tag = '<link rel="preload" as="image" href="' . esc_url($hero_preload) . '" fetchpriority="high">';
                $html = preg_replace_callback(
                    '/(<head[^>]*>)/i',
                    static fn(array $m): string => $m[1] . "\n" . $tag,
                    $html,
                    1
                ) ?? $html;
            }
        }

        return $html;
    }

    /**
     * Recover the ORIGIN image URL behind a rewritten CDN url(). The offload
     * stage runs before this one, so inline background styles already carry
     * signed worker URLs — the original URL rides along in the signed `u`
     * parameter, which is all the LQIP derivative needs.
     */
    private function origin_url_for(string $url): ?string {
        if (stripos($url, 'wpinstant') === false || strpos($url, '/api/v1/assets/media/') === false) {
            return null; // not ours — nothing to sign
        }
        $query = (string) wp_parse_url($url, PHP_URL_QUERY);
        foreach (explode('&', $query) as $pair) {
            if (str_starts_with($pair, 'u=')) {
                $b64 = substr($pair, 2);
                $decoded = base64_decode(strtr($b64, '-_', '+/'));
                if (is_string($decoded) && preg_match('#^https?://#i', $decoded)) {
                    return $decoded;
                }
                return null;
            }
        }
        return null;
    }

    private function current_url(): string {
        $scheme = (isset($_SERVER['HTTPS']) && $_SERVER['HTTPS'] === 'on') ? 'https' : 'http';
        return $scheme . '://' . ($_SERVER['HTTP_HOST'] ?? 'localhost') . ($_SERVER['REQUEST_URI'] ?? '/');
    }
}
