<?php
namespace WPInstant;

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
    private MediaOffloader $media_offloader;
    private AssetProxy $asset_proxy;
    private FontOptimizer $font_optimizer;
    private ResourceHints $resource_hints;
    private SpeculationRules $speculation_rules;
    private PluginAssets $plugin_assets;
    private BgLazyLoader $bg_lazy_loader;
    private VideoFacade $video_facade;
    private GravatarLocalizer $gravatar_localizer;
    private HtmlOptimizer $html_optimizer;

    /** Set by Plugin when the RUM beacon should ship (live mode or preview). */
    private bool $rum_enabled = false;
    private bool $rum_preview = false;

    public function __construct(Config $config, ApiClient $api_client) {
        $this->config = $config;
        $this->api_client = $api_client;
        $this->critical_css_transformer = new CriticalCssTransformer($config, $api_client);
        $this->script_delayer = new ScriptDelayer($config);
        $this->media_optimizer = new MediaOptimizer($config);
        $this->media_offloader = new MediaOffloader($config);
        $this->asset_proxy = new AssetProxy($config);
        $this->font_optimizer = new FontOptimizer($config);
        $this->resource_hints = new ResourceHints($config);
        $this->speculation_rules = new SpeculationRules($config);
        $this->plugin_assets = new PluginAssets($config);
        $this->bg_lazy_loader = new BgLazyLoader($config);
        $this->video_facade = new VideoFacade($config);
        $this->gravatar_localizer = new GravatarLocalizer($config);
        $this->html_optimizer = new HtmlOptimizer($config);
    }

    public function enable_rum(bool $preview = false): void {
        $this->rum_enabled = true;
        $this->rum_preview = $preview;
    }

    public function transform(string $html): string {
        // Safety guard: if HTML is invalid or partial, return as is
        if (empty($html) || stripos($html, '</head>') === false) {
            return $html;
        }

        // Untouched escape hatch: whatever happens below, the visitor always
        // receives a structurally complete document.
        $original = $html;

        // Some hosts lower PCRE limits to a point where bounded-looking
        // patterns fail on large documents (preg_replace then returns NULL).
        // Raise to sane defaults for the lifetime of this transform.
        if (function_exists('ini_set')) {
            @ini_set('pcre.backtrack_limit', '1000000');
        }

        // Idempotency guard: already transformed by THIS version (e.g. a
        // host cache feeding our own output back through the buffer) —
        // never transform twice.
        if ($this->transformed_version($html) === WP_INSTANT_VERSION) {
            return $html;
        }

        // Durable version fingerprint on <html>: comments (our old
        // signature) are stripped by LiteSpeed's HTML minifier, an
        // attribute is not.
        $html = $this->stamp_version($html);

        // The stamp must never damage the document. If it somehow did
        // (regex engine failure, corrupted buffer), bail to the original.
        if (
            strlen($html) < 256 ||
            stripos($html, '</head>') === false ||
            stripos($html, '</body>') === false ||
            strlen($html) < strlen($original) * 0.5
        ) {
            return $original;
        }

        try {
            // Each stage is validated; a stage that structurally damages
            // the document is reverted (Airlift-style fail-safe) instead of
            // ever shipping broken HTML to a visitor.

            // 0. Plugin asset unloading: strip ALL css/js belonging to
            //    plugins the user marked unused for this post type. Runs
            //    before everything so downstream stages never see (or
            //    re-inject hints for) the removed assets. Script parity is
            //    intentionally relaxed here — removal is the whole point.
            if ($this->plugin_assets->has_rules()) {
                $html = $this->stage($html, fn(string $h): string => $this->plugin_assets->transform($h), 'plugin_assets', -200);
            }

            // 1. Font optimization FIRST: localizing Google Fonts rewrites
            //    stylesheet hrefs before CSS combining ever sees them, and
            //    vendor CSS pinning removes unpkg/code.jquery.com links.
            $html = $this->stage($html, fn(string $h): string => $this->font_optimizer->transform($h), 'fonts');

            // 2. Media offload FIRST: rewriting img/video URLs to the R2
            //    worker must happen before the LCP preload / fetchpriority
            //    pass so preloads point at the worker URLs too.
            if ($this->config->get('media.offload_images', false) || $this->config->get('media.offload_video', false)) {
                $html = $this->stage($html, fn(string $h): string => $this->media_offloader->transform($h), 'offload');
            }

            // 3. Optimize Media (LCP Preload, fetchpriority="high", CLS dimensions)
            if ($this->config->get('media.auto_fetchpriority_lcp', true)) {
                $html = $this->stage($html, fn(string $h): string => $this->media_optimizer->transform($h), 'media');
            }

            // 3b. Lazy-load below-the-fold CSS background images (hero +
            //     verified LCP stay eager inside the loader).
            $html = $this->stage($html, fn(string $h): string => $this->bg_lazy_loader->transform($h), 'bg_lazyload');

            // 3c. Video facades (YouTube/Vimeo) + self-hosted video preload=none.
            $html = $this->stage($html, fn(string $h): string => $this->video_facade->transform($h), 'video');

            // 3d. Gravatar localizer: self-host Gravatar avatars to eliminate 3rd-party handshakes.
            if ($this->config->get('media.self_host_gravatars', true)) {
                $html = $this->stage($html, fn(string $h): string => $this->gravatar_localizer->transform($h), 'gravatars');
            }

            // 4. Critical CSS Inlining + Combined/Async Stylesheets
            if ($this->config->get('critical_css.enabled', true)) {
                $html = $this->stage($html, fn(string $h): string => $this->critical_css_transformer->transform($h), 'critical_css');
            }

            // 4a. Own-host asset CDN: rewrite same-origin css/js (including
            //     the combined bundle the critical-CSS stage just emitted)
            //     to signed CDN worker URLs. Runs after the CSS pipeline so
            //     bundle URLs exist, and before the script delayer so
            //     interaction-delay data-wpins-src values carry the CDN URL.
            if ($this->config->get('assets.serve_own_from_cdn', false)) {
                $html = $this->stage($html, fn(string $h): string => $this->asset_proxy->transform_own($h), 'assets_cdn');
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

            // 6b. Custom CSS from the dashboard (verbatim site-owner rules,
            //     injected last in <head> so they win the cascade).
            $custom_css = trim((string) $this->config->get('custom_css', ''));
            if ($custom_css !== '') {
                $html = $this->stage($html, fn(string $h): string => $this->inject_custom_css($h, $custom_css), 'custom_css');
            }

            // 7. Inject Dynamic Nonce Hydrator Script
            if ($this->config->get('dynamic.nonce_ajax_refresh', true)) {
                $html = $this->stage($html, fn(string $h): string => $this->inject_hydrator_scripts($h), 'hydrator');
            }

            // 8. RUM beacon (live traffic + preview): collects JS errors,
            //    LCP/CLS and reports through the phase-one kill switch
            //    pipeline (AutoDegrade + SaaS dashboard).
            if ($this->rum_enabled) {
                $html = $this->stage($html, fn(string $h): string => $this->inject_rum_beacon($h), 'rum');
            }

            // 9. Signature watermark (inside <body> so it never lands after </html>)
            $signature = "\n<!-- Optimized with WP Instant v" . WP_INSTANT_VERSION . " -->";
            if (stripos($html, '</body>') !== false) {
                $html = str_ireplace('</body>', $signature . '</body>', $html);
            }

            // 10. HTML minification LAST: every earlier injection (critical
            //     CSS, loaders, facades, RUM) is minified with the page.
            $html = $this->stage($html, fn(string $h): string => $this->html_optimizer->transform($h), 'html_minify');

            // Final integrity gate: the pipeline must never emit a document
            // that lost its skeleton or implausibly shrank vs the input.
            if (
                strlen($html) < 256 ||
                stripos($html, '</body>') === false ||
                stripos($html, '</head>') === false ||
                strlen($html) < strlen($original) * 0.5
            ) {
                return $original;
            }

            return $html;
        } catch (\Throwable $e) {
            // Fault-proof safety fallback: Never break customer front-end
            return $original . "\n<!-- WP Instant Transformation Fallback: " . esc_html($e->getMessage()) . " -->";
        }
    }

    /**
     * Run one transformation stage; revert to the input when the output is
     * structurally suspect (script tags vanished, document truncated,
     * implausible size delta). Worst case = the unoptimized page, never a
     * broken one.
     */
    private function stage(string $input, callable $fn, string $name, int $min_script_delta = -2): string {
        $output = (string) $fn($input);

        if ($output === '' || !$this->structurally_valid($input, $output, $min_script_delta)) {
            // Never annotate degenerate input: if $input is not a full
            // document the pipeline has already gone wrong somewhere
            // upstream and the transform() guards will restore $original.
            if (strlen($input) > 256 && stripos($input, '</body>') !== false) {
                $comment = '<!-- WP Instant stage reverted: ' . $name . ' -->';
                return (string) preg_replace('/<\/body>/i', $comment . '</body>', $input, 1);
            }
            return $input;
        }

        return $output;
    }

    private function structurally_valid(string $before, string $after, int $min_script_delta = -2): bool {
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
        // additions only up to our own injected-loader allowance. Stages
        // whose PURPOSE is removal (plugin unload) pass a relaxed floor.
        $delta = $this->script_count($after) - $this->script_count($before);
        return $delta >= $min_script_delta && $delta <= self::INJECTED_SCRIPT_ALLOWANCE;
    }

    private function script_count(string $html): int {
        return (int) preg_match_all('/<script[\s>]/i', $html);
    }

    private function transformed_version(string $html): ?string {
        // Match ONLY the opening <html …> tag (bounded), then look inside it.
        if (!preg_match('/<html\b[^>]*>/i', $html, $tag)) {
            return null;
        }
        if (preg_match('/data-wpins-version=["\']([0-9.]+)["\']/', $tag[0], $m)) {
            return $m[1];
        }
        return null;
    }

    private function stamp_version(string $html): string {
        // Never run replacement regexes over the whole document (a PCRE
        // failure on a large buffer returns NULL and would blank the page).
        // Isolate the tiny opening tag first and rebuild via substr.
        if (!preg_match('/<html\b[^>]*>/i', $html, $tag)) {
            return $html;
        }
        $tag_html = $tag[0];

        if (strpos($tag_html, 'data-wpins-version=') !== false) {
            $new_tag = preg_replace(
                '/\sdata-wpins-version=[\"\'][0-9.]+[\"\']/',
                ' data-wpins-version="' . WP_INSTANT_VERSION . '"',
                $tag_html,
                1
            );
        } else {
            $new_tag = substr($tag_html, 0, -1) . ' data-wpins-version="' . WP_INSTANT_VERSION . '">';
        }

        if (!is_string($new_tag) || $new_tag === '' || strpos($new_tag, 'data-wpins-version=') === false) {
            return $html;
        }

        $pos = strpos($html, $tag_html);
        if ($pos === false) {
            return $html;
        }

        $stamped = substr_replace($html, $new_tag, $pos, strlen($tag_html));

        // Stamping must be shape-preserving; anything else is a bug.
        if (strlen($stamped) < 256 || stripos($stamped, '</head>') === false || stripos($stamped, '</body>') === false) {
            return $html;
        }

        return $stamped;
    }

    /**
     * Inject the site owner's custom CSS last in <head> (wins the cascade).
     * The payload is sanitized minimally — it is CSS by design, but a stray
     * </style> could break the document, so it is neutralized.
     */
    private function inject_custom_css(string $html, string $css): string {
        $css = str_ireplace('</style', '<\/style', $css);
        if (trim($css) === '') {
            return $html;
        }
        $tag = '<style id="wp-instant-custom-css">' . $css . '</style>';
        $result = preg_replace_callback(
            '/(<\/head>)/i',
            static fn(array $m): string => $tag . "\n" . $m[1],
            $html,
            1
        );
        return is_string($result) ? $result : $html;
    }

    private function inject_hydrator_scripts(string $html): string {
        // Idempotency: a re-transformed document (host cache feeding our own
        // output back through the buffer) must never gain a second hydrator
        // — byte-identical duplicate hydrator/RUM blocks were observed in
        // production on exactly such a double pass.
        if (stripos($html, 'id="wp-instant-hydrator-js"') !== false || stripos($html, "id='wp-instant-hydrator-js'") !== false) {
            return $html;
        }

        // Pages without any form/nonce surface get nothing from the hydrator
        // (the script early-returns client-side, but still downloads). Skip
        // the request entirely; JS-injected forms fetch their nonces from
        // REST fresh anyway, so there is nothing to refresh.
        if (
            stripos($html, '<form') === false &&
            stripos($html, '_wpnonce') === false &&
            stripos($html, 'wp_nonce') === false
        ) {
            return $html;
        }

        $hydrator_url = WP_INSTANT_URL . 'assets/js/hydrator.min.js';
        $nonce_endpoint = esc_url_raw(rest_url('wp-instant/v1/nonces'));

        $script = sprintf(
            '<script id="wp-instant-hydrator-init" wpins-exclude>window._wpinsHydrateConfig = { endpoint: "%s" };</script>' .
            '<script src="%s" id="wp-instant-hydrator-js" wpins-exclude defer></script>',
            $nonce_endpoint,
            esc_url($hydrator_url)
        );

        return str_ireplace('</body>', $script . '</body>', $html);
    }

    /**
     * ~1KB RUM beacon: window.onerror + unhandledrejection (max 5), LCP via
     * PerformanceObserver, CLS layout-shift sum (recent-input filtered);
     * ships once on pagehide via sendBeacon. Tagged with the execution mode
     * that produced the page so error rates are attributable per mode.
     */
    private function inject_rum_beacon(string $html): string {
        // Idempotency (see inject_hydrator_scripts).
        if (stripos($html, 'id="wp-instant-rum"') !== false || stripos($html, "id='wp-instant-rum'") !== false) {
            return $html;
        }

        $mode = (string) $this->config->get('javascript.execution_mode', 'defer');
        $endpoint = esc_url_raw(rest_url('wp-instant/v1/telemetry'));
        $preview = $this->rum_preview ? 'true' : 'false';

        $js = '(function(){var m={mode:"' . esc_js($mode) . '",version:"' . esc_js(WP_INSTANT_VERSION) . '",preview:' . $preview . '},e=[],n=0,l=0,c=0;'
            . 'window.onerror=function(s,f){if(n<5){e.push({m:String(s).slice(0,120),f:String(f||"").slice(0,80)});n++}};'
            . 'window.addEventListener("unhandledrejection",function(v){if(n<5){var r=v.reason;e.push({m:String(r&&r.message||r||"promise").slice(0,120),f:""});n++}});'
            . 'try{new PerformanceObserver(function(b){var x=b.getEntries();l=x[x.length-1].startTime}).observe({type:"largest-contentful-paint",buffered:true});'
            . 'new PerformanceObserver(function(b){b.getEntries().forEach(function(x){if(!x.hadRecentInput)c+=x.value})}).observe({type:"layout-shift",buffered:true})}catch(_){}'
            . 'window.addEventListener("pagehide",function(){try{navigator.sendBeacon("' . esc_url_raw($endpoint) . '",JSON.stringify({m:m,e:e,l:Math.round(l),c:Math.round(c*1000)/1000,p:location.pathname}))}catch(_){}},{once:true});})();';

        $tag = '<script wpins-exclude id="wp-instant-rum">' . $js . '</script>';

        return str_ireplace('</body>', $tag . '</body>', $html);
    }

    /**
     * Computes a normalized structural MD5 hash of the DOM (tags, IDs, classes,
     * stylesheets, and scripts) stripped of dynamic numeric digits.
     * Pages sharing the same layout structure (e.g. WooCommerce product templates)
     * share the same hash, allowing edge Cloudflare KV to deduplicate Critical CSS.
     */
    public static function compute_structure_hash(string $html): string {
        $html = html_entity_decode($html);
        preg_match_all('/<\s*([a-zA-Z][\w:-]*)\b[^>]*>/i', $html, $tags);
        preg_match_all('/\bid\s*=\s*["\']([^"\']+)["\']/i', $html, $ids);
        preg_match_all('/\bclass\s*=\s*["\']([^"\']+)["\']/i', $html, $classes);
        preg_match_all('/<link[^>]*rel=["\']stylesheet["\'][^>]*href=["\']([^"\']+)["\']/i', $html, $stylesheets);
        preg_match_all('/<script[^>]*src=["\']([^"\']+)["\']/i', $html, $scripts);

        $clean_classes = [];
        foreach ($classes[1] ?? [] as $cls_str) {
            foreach (preg_split('/\s+/', trim($cls_str)) as $cls) {
                $cls = preg_replace('/\d.*$/', '', trim($cls));
                if ($cls !== '') {
                    $clean_classes[] = $cls;
                }
            }
        }

        $clean_ids = array_map(static fn(string $id): string => preg_replace('/\d.*$/', '', $id), $ids[1] ?? []);
        $clean_tags = array_map(static fn(string $t): string => '<' . strtolower($t) . '>', $tags[1] ?? []);

        $all = array_merge(
            $clean_ids,
            $clean_classes,
            $stylesheets[1] ?? [],
            $scripts[1] ?? [],
            $clean_tags
        );
        $all = array_unique(array_filter($all));
        sort($all);

        return md5(implode(' ', $all));
    }
}
