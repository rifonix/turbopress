<?php
namespace WPInstant;

if (!defined('ABSPATH')) {
    exit;
}

/**
 * Generic third-party asset proxy (zero-DNS) + own-host asset CDN.
 *
 * transform(): rewrites <link rel=stylesheet> and <script src> URLs
 * pointing at foreign registrar domains (unpkg.com, code.jquery.com,
 * cdn.jsdelivr.net, …) to the signed edge-worker media route (f=raw,
 * R2-backed, immutable, Range support). On a cache MISS the worker 302s to
 * the original URL, so a rewrite can never break an asset — worst case is
 * one redirect.
 *
 * transform_own(): the same signed route for SAME-ORIGIN css/js (theme
 * bundles, the combined stylesheet, localized font CSS, wp-includes
 * scripts) so the visitor's static assets come from the CDN edge cache
 * instead of the origin. Runs after the CSS pipeline stage.
 *
 * No plugin-bundled copies of third-party files: every site's asset mix is
 * handled case-by-case from its own HTML.
 *
 * Never proxied (compliance / functional origins):
 * - consent & cookie platforms (Cookiebot, OneTrust, Complianz, …)
 * - payment SDKs (Stripe, PayPal, Razorpay) and captchas (reCaptcha, hCaptcha, Turnstile)
 * - analytics/tag managers whose SDK semantics bind to the origin
 * - anything matching user exclusions or critical_css.excluded_stylesheets
 */
class AssetProxy {
    /**
     * Marker => true. Substring match against the asset URL (lowercased).
     * Anything containing one of these stays on its original origin.
     */
    private const KEEP_ORIGINS = [
        // Consent / cookie platforms (legal requirements bind to origin).
        'cookiebot.com', 'consentcdn.cookiebot.com', 'onetrust.com', 'cookielaw.org',
        'complianz.io', 'iubenda.com', 'usercentrics.eu', 'quantcast.mgr.consensu.org',
        // Payments & checkout (SDK integrity + regional endpoints).
        'js.stripe.com', 'checkout.razorpay.com', 'paypal.com', 'paypalobjects.com',
        'checkout.com', 'worldpay.com', 'adyen.com',
        // Captchas.
        'recaptcha', 'hcaptcha.com', 'challenges.cloudflare.com',
        // Analytics / tag managers (SDK behavior + beacon endpoints).
        'googletagmanager.com', 'google-analytics.com', 'analytics.google.com',
        'clarity.ms', 'hotjar.com', 'fullstory.com', 'mouseflow.com',
        'matomo.cloud', 'plausible.io',
        // Ad / social pixels.
        'connect.facebook.net', 'ads.linkedin.com', 'ads-twitter.com', 'bat.bing.com',
        'doubleclick.net', 'googlesyndication.com', 'amazon-adsystem.com',
    ];

    /**
     * File types worth proxying (route serves them with immutable caching;
     * anything else (html endpoints, API calls) stays put).
     */
    private const PROXYABLE_CSS = '.css';
    private const PROXYABLE_JS = '.js';

    private Config $config;

    public function __construct(Config $config) {
        $this->config = $config;
    }

    public function transform(string $html): string {
        if (!(bool) $this->config->get('assets.proxy_enabled', true)) {
            return $html;
        }
        if ($this->config->get_site_id() === '' || $this->config->get_api_key() === '') {
            return $html;
        }
        $own_host = strtolower((string) parse_url(home_url(), PHP_URL_HOST));
        if ($own_host === '' || $own_host === 'localhost') {
            return $html;
        }

        $keep = self::KEEP_ORIGINS;
        foreach ((array) $this->config->get('assets.keep_origins', []) as $custom) {
            if (is_string($custom) && $custom !== '') {
                $keep[] = strtolower($custom);
            }
        }
        $excluded_css = (array) $this->config->get('critical_css.excluded_stylesheets', []);
        $excluded_js = (array) $this->config->get('javascript.exclusions', []);

        // Stylesheets from foreign origins.
        $html = preg_replace_callback(
            '/<link\s+([^>]*rel=[\'"]stylesheet[\'"][^>]*)>/i',
            function ($m) use ($keep, $excluded_css, $own_host) {
                if (!preg_match('/href=[\'"]([^\'"]+)[\'"]/i', $m[1], $hm)) {
                    return $m[0];
                }
                $url = $hm[1];
                if (!$this->is_proxyable($url, self::PROXYABLE_CSS, $keep, $excluded_css, $own_host)) {
                    return $m[0];
                }
                $signed = (new MediaOffloader($this->config))->media_url($this->absolutize($url), 0, 'raw');
                if ($signed === null) {
                    return $m[0];
                }
                $attrs = preg_replace('/href=[\'"][^\'"]*[\'"]/i', 'href="' . esc_url($signed) . '"', $m[1]);
                $attrs = preg_replace('/\s(integrity|crossorigin|referrerpolicy)(=[^\s>]+)?/i', '', (string) $attrs);
                return '<link ' . trim((string) $attrs) . '>';
            },
            $html
        );

        // Scripts from foreign origins.
        $html = preg_replace_callback(
            '/<script\s+([^>]*src=[\'"]([^\'"]+)[\'"][^>]*)>/i',
            function ($m) use ($keep, $excluded_js, $own_host) {
                $url = $m[2];
                if (!$this->is_proxyable($url, self::PROXYABLE_JS, $keep, $excluded_js, $own_host)) {
                    return $m[0];
                }
                $signed = (new MediaOffloader($this->config))->media_url($this->absolutize($url), 0, 'raw');
                if ($signed === null) {
                    return $m[0];
                }
                $attrs = preg_replace('/src=[\'"][^\'"]*[\'"]/i', 'src="' . esc_url($signed) . '"', $m[1]);
                $attrs = preg_replace('/\s(integrity|crossorigin|referrerpolicy)(=[^\s>]+)?/i', '', (string) $attrs);
                return '<script ' . trim((string) $attrs) . '>';
            },
            $html
        );

        return $html;
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
            return null; // foreign origin: transform() covers those
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

    private function is_proxyable(string $url, string $ext, array $keep, array $excluded, string $own_host): bool {
        $url = trim($url);
        if (!preg_match('#^https?://#i', $url)) {
            return false; // relative handled by combine; data:/blob: never
        }
        $host = strtolower((string) parse_url($url, PHP_URL_HOST));
        if ($host === '' || $host === $own_host || str_ends_with($host, '.' . $own_host)) {
            return false;
        }
        // Only plain asset files (ignore query string when matching ext).
        $path = parse_url($url, PHP_URL_PATH) ?: '';
        if (!str_ends_with(strtolower($path), $ext)) {
            return false;
        }
        $lower = strtolower($url);
        foreach ($keep as $marker) {
            if (str_contains($lower, $marker)) {
                return false;
            }
        }
        foreach ($excluded as $ex) {
            if (is_string($ex) && $ex !== '' && stripos($url, $ex) !== false) {
                return false;
            }
        }
        // Never re-proxy our own worker/CDN URLs.
        $api_base = rtrim($this->config->get_api_url(), '/');
        $cdn_base = rtrim($this->config->get_cdn_url(), '/');
        $object_base = rtrim($this->config->get_object_url(), '/');
        if (
            ($api_base !== '' && stripos($url, $api_base) === 0)
            || ($cdn_base !== '' && stripos($url, $cdn_base) === 0)
            || ($object_base !== '' && stripos($url, $object_base) === 0)
        ) {
            return false;
        }
        return true;
    }

    private function absolutize(string $href): string {
        if (str_starts_with($href, '//')) {
            return (is_ssl() ? 'https:' : 'http:') . $href;
        }
        return $href;
    }
}
