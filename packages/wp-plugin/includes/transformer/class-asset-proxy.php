<?php
namespace WPInstant;

if (!defined('ABSPATH')) {
    exit;
}

/**
 * Own-host asset CDN.
 *
 * transform_own(): rewrites SAME-ORIGIN css/js URLs (theme bundles, the
 * combined stylesheet, localized font CSS, wp-includes scripts) to the
 * signed edge-worker media route (f=raw, R2-backed, immutable, Range
 * support). On a cache MISS the worker 302s to the original URL, so a
 * rewrite can never break an asset — worst case is one redirect.
 *
 * Third-party origins are NEVER rewritten: foreign css/js stays on its
 * original CDN (integrity, CORS and SDK semantics all bind to the origin,
 * and routing third-party traffic through the customer's signed route would burn
 * their quota for assets that aren't theirs). The former generic
 * third-party proxy (assets.proxy_enabled / assets.keep_origins) has been
 * removed from the config, the UI and the edge signing paths.
 */
class AssetProxy {
    private Config $config;

    public function __construct(Config $config) {
        $this->config = $config;
    }

    /**
     * Own-host asset CDN: rewrites same-origin css/js URLs (theme bundles,
     * the combined stylesheet + its preload→onload swaps, localized font
     * CSS, wp-includes scripts) to signed edge-worker URLs (f=raw,
     * R2-backed, immutable, 302-to-origin on miss — a rewrite can never
     * 404).
     *
     * Runs AFTER the critical-CSS stage (so the combined bundle URL exists
     * to be rewritten) and BEFORE script delaying (so interaction-delay
     * data-wpins-src values carry the CDN URL).
     *
     * Never rewritten: font files and font preloads (CORS-mode fetches that
     * the 302 miss path cannot satisfy — see MediaOffloader's url() rules),
     * wpins-exclude-marked runtime, user exclusions, and anything already
     * on the api/cdn hosts.
     */
    public function transform_own(string $html): string {
        if (!(bool) $this->config->get('assets.serve_own_from_cdn', false)) {
            return $html;
        }
        if ($this->config->get_site_id() === '' || $this->config->get_api_key() === '') {
            return $html;
        }
        $own_host = strtolower((string) parse_url(home_url(), PHP_URL_HOST));
        if ($own_host === '' || $own_host === 'localhost') {
            return $html;
        }

        $excluded_css = (array) $this->config->get('critical_css.excluded_stylesheets', []);
        $excluded_js = (array) $this->config->get('javascript.exclusions', []);

        // Stylesheets (blocking leftovers + noscript fallbacks) and the
        // preloaded style bundles emitted by the CSS pipeline.
        $html = preg_replace_callback(
            '/<link\s+([^>]*rel=[\'"](?:stylesheet|preload)[\'"][^>]*)>/i',
            function ($m) use ($own_host, $excluded_css) {
                $attrs = $m[1];
                $is_sheet = (bool) preg_match('/rel=[\'"]stylesheet/i', $attrs);
                $is_style_preload = (bool) preg_match('/rel=[\'"]preload/i', $attrs)
                    && (bool) preg_match('/\bas=[\'"]style/i', $attrs);
                if (!$is_sheet && !$is_style_preload) {
                    return $m[0]; // icon/preload-font/alternate links stay put
                }
                // Font preloads are crossorigin fetches: the 302 miss path
                // lacks the CORS headers fonts require, so fonts stay on
                // the origin.
                if (preg_match('/\bas=[\'"]font/i', $attrs)) {
                    return $m[0];
                }
                if (stripos($attrs, 'wpins-exclude') !== false) {
                    return $m[0];
                }
                if (!preg_match('/href=[\'"]([^\'"]+)[\'"]/i', $attrs, $hm)) {
                    return $m[0];
                }
                $new = $this->own_cdn_url($hm[1], '.css', $own_host, $excluded_css);
                if ($new === null) {
                    return $m[0];
                }
                $attrs = preg_replace('/href=[\'"][^\'"]*[\'"]/i', 'href="' . esc_url($new) . '"', $attrs);
                $attrs = preg_replace('/\s(integrity|crossorigin)(=[^\s>]+)?/i', '', (string) $attrs);
                return '<link ' . trim((string) $attrs) . '>';
            },
            $html
        ) ?? $html;

        // Scripts with a plain own-host src (the delayer transforms after
        // this stage; async/module scripts benefit equally).
        $html = preg_replace_callback(
            '/<script\s+([^>]*src=[\'"]([^\'"]+)[\'"][^>]*)>/i',
            function ($m) use ($own_host, $excluded_js) {
                if (stripos($m[1], 'wpins-exclude') !== false) {
                    return $m[0];
                }
                $new = $this->own_cdn_url($m[2], '.js', $own_host, $excluded_js);
                if ($new === null) {
                    return $m[0];
                }
                $attrs = preg_replace('/src=[\'"][^\'"]*[\'"]/i', 'src="' . esc_url($new) . '"', $m[1]);
                $attrs = preg_replace('/\s(integrity|crossorigin)(=[^\s>]+)?/i', '', (string) $attrs);
                return '<script ' . trim((string) $attrs) . '>';
            },
            $html
        ) ?? $html;

        return $html;
    }

    /**
     * Signed CDN URL for an own-host css/js asset, or null when it must
     * stay on the origin.
     */
    private function own_cdn_url(string $href, string $ext, string $own_host, array $excluded): ?string {
        $abs = $this->own_absolutize($href);
        if ($abs === null) {
            return null;
        }
        $host = strtolower((string) parse_url($abs, PHP_URL_HOST));
        if ($host === '' || ($host !== $own_host && !str_ends_with($host, '.' . $own_host))) {
            return null; // foreign origins are never rewritten
        }
        $path = parse_url($abs, PHP_URL_PATH) ?: '';
        if (!str_ends_with(strtolower($path), $ext)) {
            return null; // font files, dynamic endpoints, etc.
        }
        foreach ($excluded as $ex) {
            if (is_string($ex) && $ex !== '' && stripos($abs, $ex) !== false) {
                return null;
            }
        }
        $api_base = rtrim($this->config->get_api_url(), '/');
        $cdn_base = rtrim($this->config->get_cdn_url(), '/');
        $object_base = rtrim($this->config->get_object_url(), '/');
        if (
            ($api_base !== '' && stripos($abs, $api_base) === 0)
            || ($cdn_base !== '' && stripos($abs, $cdn_base) === 0)
            || ($object_base !== '' && stripos($abs, $object_base) === 0)
        ) {
            return null; // already a worker/CDN URL
        }
        return (new MediaOffloader($this->config))->media_url($abs, 0, 'raw');
    }

    /** Absolutize an own-host href; null for document-relative values. */
    private function own_absolutize(string $href): ?string {
        $href = trim($href);
        if (preg_match('#^https?://#i', $href)) {
            return $href;
        }
        if (str_starts_with($href, '//')) {
            return (is_ssl() ? 'https:' : 'http:') . $href;
        }
        if (str_starts_with($href, '/')) {
            return set_url_scheme(home_url($href));
        }
        return null;
    }
}
