<?php
namespace WPInstant;

if (!defined('ABSPATH')) {
    exit;
}

/**
 * Zero-DNS media CDN: rewrites <img>/<video> URLs to signed edge-worker URLs
 * backed by R2, then promotes proven public derivatives to the direct R2 CDN.
 *
 * Flow:
 *  1. transform(): rewrite src/srcset/video sources to
 *     {api}/api/v1/assets/media/{site_id}/{hash}?u=&w=&f=&s= — the worker
 *     serves the R2 derivative on HIT and 302s to the origin URL on MISS,
 *     so a rewrite can NEVER break an image (worst case = a redirect).
 *  2. Rewritten assets are queued; the hourly wp_instant_media_offload
 *     cron generates webp derivatives (GD) and PUTs them to the edge.
 *  3. Versioned image derivatives are copied to a separate public media
 *     bucket. The plugin records its returned URL in a local manifest and
 *     only future renders use the direct R2 hostname, so a first-ever
 *     derivative never gets a 404 before the cron upload completes.
 */
class MediaOffloader {
    private const QUEUE_OPTION = 'wp_instant_media_queue';
    private const MAX_QUEUE = 500;
    private const MAX_BATCH = 12;
    private const MAX_ATTEMPTS = 5;
    private const MAX_SOURCE_BYTES = 10485760; // 10MB

    private Config $config;

    /** Per-request cache of local image width lookups (srcset caps). */
    private array $width_cache = [];

    /** Local allowlist of public objects that the edge has actually stored. */
    private ?array $public_manifest = null;
    private bool $public_manifest_loaded = false;

    public function __construct(Config $config) {
        $this->config = $config;
    }

    public function transform(string $html): string {
        $offload_images = (bool) $this->config->get('media.offload_images', false);
        $offload_video = (bool) $this->config->get('media.offload_video', false);

        if (!$offload_images && !$offload_video) {
            return $html;
        }
        if ($this->config->get_site_id() === '' || $this->config->get_api_key() === '') {
            return $html;
        }

        $excluded = (array) $this->config->get('media.excluded_images', []);
        $widths = $this->usable_widths();
        $max_w = max($widths);
        $queued = [];

        if ($offload_images) {
            // <img> tags: rewrite src + srcset candidates, and synthesize a
            // responsive srcset for plain src-only images.
            $html = preg_replace_callback(
                '/<img\b[^>]*>/i',
                function ($m) use ($excluded, $widths, $max_w, &$queued) {
                    $tag = $m[0];
                    $has_srcset = (bool) preg_match('/\ssrcset=["\']/i', $tag);
                    $has_sizes = (bool) preg_match('/\ssizes=["\']/i', $tag);
                    $synth = '';
                    $synthesized = false;

                    // src
                    if (preg_match('/\ssrc=["\']([^"\']+)["\']/i', $tag, $sm)) {
                        $src = $sm[1];
                        $width_attr = preg_match('/\swidth=["\'](\d{2,5})["\']/i', $tag, $wm) ? (int) $wm[1] : 0;

                        // Responsive sizing: a plain src forces the browser
                        // to download exactly the derivative we pick — which
                        // used to be the max width (1600px) even for images
                        // rendering at 300px. Synthesize a full srcset (never
                        // wider than the intrinsic size, so derivatives never
                        // upscale) plus a sizes hint, and let the browser
                        // choose by layout width × DPR.
                        if (!$has_srcset) {
                            $intrinsic = $this->intrinsic_width($src);
                            $cap = min($intrinsic ?? $max_w, $max_w);
                            $candidates = array_filter($widths, fn(int $cw): bool => $cw <= $cap);
                            $set = [];
                            foreach ($candidates as $cw) {
                                $cand_url = $this->rewrite_source($src, $cw, 'webp', $excluded, $queued);
                                if ($cand_url !== null) {
                                    $set[] = $cand_url . ' ' . $cw . 'w';
                                }
                            }
                            if (count($set) > 1) {
                                $sizes_w = $width_attr > 0 ? $width_attr : $cap;
                                $synth = ' srcset="' . esc_attr(implode(', ', $set)) . '"';
                                if (!$has_sizes) {
                                    $synth .= ' sizes="(max-width: ' . $sizes_w . 'px) 100vw, ' . $sizes_w . 'px"';
                                }
                                $synthesized = true;
                            }
                        }

                        $w = $width_attr > 0 ? $width_attr : $max_w;
                        $new = $this->rewrite_source($src, $w, 'webp', $excluded, $queued);
                        if ($new !== null) {
                            $tag = str_replace(
                                $sm[0],
                                ' src="' . esc_url($new) . '"' . $synth . ' data-wpins-orig-src="' . esc_url($src) . '"',
                                $tag
                            );
                        }
                    }

                    // srcset candidates (each with its own width descriptor).
                    // Skipped when synthesized above — re-processing the
                    // just-escaped output would double-escape & to &amp;amp;
                    // and corrupt every candidate URL. Candidates are entity-
                    // decoded before rewriting (so already-escaped values from
                    // a prior pass or the theme normalize) and escaped once.
                    if (!$synthesized && preg_match('/\ssrcset=["\']([^"\']+)["\']/i', $tag, $sm)) {
                        $parts = array_filter(array_map('trim', explode(',', $sm[1])));
                        $out = [];
                        foreach ($parts as $part) {
                            if (preg_match('/^(\S+)(?:\s+(\d+)w)?$/i', $part, $pm)) {
                                $cand = html_entity_decode($pm[1], ENT_QUOTES);
                                $cw = isset($pm[2]) ? (int) $pm[2] : $max_w;
                                $new = $this->rewrite_source($cand, $cw, 'webp', $excluded, $queued);
                                $out[] = ($new !== null ? $new : $cand) . (isset($pm[2]) ? ' ' . $pm[2] . 'w' : '');
                            } else {
                                $out[] = $part;
                            }
                        }
                        $tag = str_replace($sm[0], ' srcset="' . esc_attr(implode(', ', $out)) . '"', $tag);
                    }

                    return $tag;
                },
                $html
            ) ?? $html;

            // <source srcset> inside <picture> (art direction): rewrite each
            // candidate — invisible to the <img> pass above.
            $html = preg_replace_callback(
                '/(<source\b[^>]*\ssrcset=)("|\')([^"\']+)\2/i',
                function ($m) use ($excluded, $max_w, &$queued) {
                    $parts = array_filter(array_map('trim', explode(',', $m[3])));
                    $out = [];
                    foreach ($parts as $part) {
                        if (preg_match('/^(\S+)(?:\s+(\d+)w)?$/i', $part, $pm)) {
                            $cand = html_entity_decode($pm[1], ENT_QUOTES);
                            $cw = isset($pm[2]) ? (int) $pm[2] : $max_w;
                            $new = $this->rewrite_source($cand, $cw, 'webp', $excluded, $queued);
                            $out[] = ($new !== null ? $new : $cand) . (isset($pm[2]) ? ' ' . $pm[2] . 'w' : '');
                        } else {
                            $out[] = $part;
                        }
                    }
                    return $m[1] . $m[2] . esc_attr(implode(', ', $out)) . $m[2];
                },
                $html
            ) ?? $html;

            // <video poster>: image derivative, sized by the video's width
            // attribute when present (posters render at the video size).
            $html = preg_replace_callback(
                '/<video\b[^>]*>/i',
                function ($m) use ($excluded, $max_w, &$queued) {
                    $tag = $m[0];
                    if (!preg_match('/\sposter=["\']([^"\']+)["\']/i', $tag, $pm)) {
                        return $tag;
                    }
                    $w = preg_match('/\swidth=["\'](\d{2,5})["\']/i', $tag, $wm) ? (int) $wm[1] : $max_w;
                    $new = $this->rewrite_source($pm[1], $w, 'webp', $excluded, $queued);
                    if ($new === null) {
                        return $tag;
                    }
                    return str_replace(
                        $pm[0],
                        ' poster="' . esc_url($new) . '" data-wpins-orig-poster="' . esc_url($pm[1]) . '"',
                        $tag
                    );
                },
                $html
            ) ?? $html;

            // CSS background images inside inline styles (Elementor classic backgrounds).
            // IMAGES ONLY: a bare url() match also hits @font-face sources —
            // rewriting a font to a worker URL breaks it twice (the MISS
            // redirect makes the font fetch cross-origin, which requires
            // CORS headers the origin never sends, and f=webp conversion
            // is meaningless for fonts).
            $html = preg_replace_callback(
                '/url\((["\']?)(https?:\/\/[^"\')\s]+)\1\)/i',
                function ($m) use ($excluded, $widths, $max_w, &$queued) {
                    if (!preg_match('~\.(?:png|jpe?g|webp|gif|svg|avif)(?:[?#]|$)~i', $m[2])) {
                        return $m[0]; // fonts, icons-as-font, video posters, etc.
                    }
                    $new = $this->rewrite_source($m[2], $max_w, 'webp', $excluded, $queued);
                    return $new !== null ? 'url(' . esc_url_raw($new) . ')' : $m[0];
                },
                $html
            ) ?? $html;

            // JSON contexts: Elementor data-settings attributes and
            // <script type="application/json"> blocks (Leaflet markers,
            // widget configs). These images are invisible to the <img>
            // pass — PSI flags them as "enormous" (653KB markers at 55px).
            // Full-URL substring swaps only; own-host images only.
            $html = $this->rewrite_json_context_urls($html, $excluded, $max_w, true, false, $queued);
        }

        if ($offload_video) {
            // <video src> and <source src type="video/…">
            $html = preg_replace_callback(
                '/<(video|source)\b[^>]*>/i',
                function ($m) use ($excluded, &$queued) {
                    $tag = $m[0];
                    if (stripos($tag, 'type=') !== false && stripos($tag, 'video/') === false) {
                        return $tag; // <source type="image/…"> inside <picture>
                    }
                    if (!preg_match('/\ssrc=["\']([^"\']+)["\']/i', $tag, $sm)) {
                        return $tag;
                    }
                    $new = $this->rewrite_source($sm[1], 0, 'raw', $excluded, $queued);
                    if ($new === null) {
                        return $tag;
                    }
                    return str_replace($sm[0], ' src="' . esc_url($new) . '" data-wpins-orig-src="' . esc_url($sm[1]) . '"', $tag);
                },
                $html
            ) ?? $html;

            // JSON contexts again, video edition: Elementor background-video
            // configs reference .mp4/.webm URLs that never appear as <video>
            // tags. Raw R2 passthrough, own-host only.
            $html = $this->rewrite_json_context_urls($html, $excluded, 0, false, true, $queued);
        }

        if (!empty($queued)) {
            $this->enqueue($queued);
        }

        return $html;
    }

    /**
     * Rewrite own-host image URLs embedded in JSON contexts:
     *  - data-settings="..." attributes (Elementor widget config)
     *  - <script type="application/json"> blocks (Leaflet marker config)
     *
     * Safety rules (Airlift protected-scan lesson):
     *  - FULL-URL substring swaps only — never partial paths.
     *  - Own-host URLs only; third-party origins (map tiles etc.) stay put.
     *  - Marker/icon-sized images (key context hints marker/icon/pin/logo)
     *    get a 96px derivative; everything else the max width.
     *  - Attribute context gets &amp;-escaped replacement URLs (b64url
     *    alphabet contains no JSON/HTML-special characters otherwise).
     */
    private function rewrite_json_context_urls(string $html, array $excluded, int $max_w, bool $images, bool $videos, array &$queued): string {
        $own_host = strtolower((string) parse_url(home_url(), PHP_URL_HOST));
        if ($own_host === '') {
            return $html;
        }

        $rewrite = function (string $subject, bool $attr_context) use ($own_host, $excluded, $max_w, $images, $videos, &$queued): string {
            if (stripos($subject, '<img') !== false || stripos($subject, '<script') !== false) {
                return $subject; // never descend into nested markup
            }

            if ($images) {
                // Pass 1: marker/icon/pin/logo contexts → small derivative.
                $subject = preg_replace_callback(
                    '#(?<=(?:marker|icon|pin|logo|thumb)[^"\x27]{0,160})(https?://[^\s"\x27\\\\<>?\[\]{}]+?\.(?:png|jpe?g|webp|gif|svg))#i',
                    function ($m) use ($own_host, $excluded, &$queued) {
                        return $this->rewrite_json_url($m[1], 96, 'webp', $own_host, $excluded, $queued) ?? $m[0];
                    },
                    $subject
                ) ?? $subject;

                // Pass 2: remaining own-host images → max-width derivative.
                // The pattern has no capture group: the whole match IS the
                // URL (using $m[1] here threw a TypeError and aborted the
                // whole transformation pipeline).
                $subject = preg_replace_callback(
                    '#https?://[^\s"\x27\\\\<>?\[\]{}]+?\.(?:png|jpe?g|webp|gif|svg)#i',
                    function ($m) use ($own_host, $excluded, $max_w, &$queued, $attr_context) {
                        $new = $this->rewrite_json_url($m[0], $max_w, 'webp', $own_host, $excluded, $queued);
                        if ($new === null) {
                            return $m[0];
                        }
                        return $attr_context ? str_replace('&', '&amp;', $new) : $new;
                    },
                    $subject
                ) ?? $subject;
            }

            if ($videos) {
                // Pass 3: own-host videos (Elementor background-video
                // configs) → raw R2 passthrough.
                $subject = preg_replace_callback(
                    '#https?://[^\s"\x27\\\\<>?\[\]{}]+?\.(?:mp4|webm|mov|m4v)#i',
                    function ($m) use ($own_host, $excluded, &$queued, $attr_context) {
                        $new = $this->rewrite_json_url($m[0], 0, 'raw', $own_host, $excluded, $queued);
                        if ($new === null) {
                            return $m[0];
                        }
                        return $attr_context ? str_replace('&', '&amp;', $new) : $new;
                    },
                    $subject
                ) ?? $subject;
            }

            return $subject;
        };

        // data-settings attributes (double + single quoted).
        $html = preg_replace_callback(
            '/(\bdata-settings=")([^"]*)(")/i',
            fn($m) => $m[1] . $rewrite($m[2], true) . $m[3],
            $html
        ) ?? $html;
        $html = preg_replace_callback(
            "/(\bdata-settings=')([^']*)(')/i",
            fn($m) => $m[1] . $rewrite($m[2], true) . $m[3],
            $html
        ) ?? $html;

        // <script type="application/json"> bodies.
        $html = preg_replace_callback(
            '/(<script\b[^>]*type=)["\']application\/json["\']([^>]*>)([\s\S]*?)(<\/script>)/i',
            fn($m) => $m[1] . '"application/json"' . $m[2] . $rewrite($m[3], false) . $m[4],
            $html
        ) ?? $html;

        return $html;
    }

    /**
     * Build a signed worker URL for an own-host image/video found in a JSON
     * context, or null when it must stay untouched.
     */
    private function rewrite_json_url(string $url, int $w, string $f, string $own_host, array $excluded, array &$queued): ?string {
        $host = strtolower((string) parse_url($url, PHP_URL_HOST));
        if ($host === '' || ($host !== $own_host && !str_ends_with($host, '.' . $own_host))) {
            return null;
        }
        foreach ($excluded as $ex) {
            if ($ex !== '' && stripos($url, $ex) !== false) {
                return null;
            }
        }
        $new = $this->media_url($url, $w, $f);
        if ($new === null) {
            return null;
        }
        $queued[md5($url . '|' . $w . '|' . $f)] = ['src' => $url, 'w' => $w, 'f' => $f];
        return $new;
    }

    /**
     * Intrinsic pixel width of a same-origin image (from the local file),
     * or null when unresolvable. Caps synthesized srcset candidates so
     * derivatives never upscale beyond the uploaded original.
     */
    private function intrinsic_width(string $src): ?int {
        if (array_key_exists($src, $this->width_cache)) {
            return $this->width_cache[$src];
        }
        $result = null;
        $home = parse_url(home_url());
        $parsed = parse_url($src);
        if (
            !empty($home['host']) && !empty($parsed['host'])
            && strtolower((string) $home['host']) === strtolower((string) $parsed['host'])
        ) {
            $file = wp_normalize_path(ABSPATH . ltrim((string) ($parsed['path'] ?? '/'), '/'));
            if (str_starts_with($file, wp_normalize_path(ABSPATH)) && is_file($file)) {
                $info = @getimagesize($file);
                if (is_array($info) && !empty($info[0])) {
                    $result = (int) $info[0];
                }
            }
        }
        $this->width_cache[$src] = $result;
        return $result;
    }

    /**
     * Rewrite image url()s inside CSS text to signed worker URLs and queue
     * the derivatives. Used for combined stylesheets (Elementor post-*.css
     * section/hero backgrounds) and inlined edge critical CSS, so CSS
     * background images are optimized and served from R2 exactly like <img>
     * sources. Fonts, data URIs, fragment URLs and third-party URLs are
     * untouched; SVG routes through R2 as ORIGINAL bytes (no webp attempt).
     */
    public function rewrite_css_urls(string $css): string {
        if ($this->config->get_site_id() === '' || $this->config->get_api_key() === '') {
            return $css;
        }

        $excluded = (array) $this->config->get('media.excluded_images', []);
        $max_w = max($this->usable_widths());
        $queued = [];

        $out = preg_replace_callback(
            '/url\((["\']?)(https?:\/\/[^"\')\s]+)\1\)/i',
            function ($m) use ($excluded, $max_w, &$queued) {
                $url = html_entity_decode($m[2], ENT_QUOTES);
                if (preg_match('~\.svg(?:[?#]|$)~i', $url)) {
                    $new = $this->rewrite_source($url, 0, 'orig', $excluded, $queued);
                    return $new !== null ? 'url(' . esc_url_raw($new) . ')' : $m[0];
                }
                if (!preg_match('~\.(?:png|jpe?g|webp|gif|avif)(?:[?#]|$)~i', $url)) {
                    return $m[0]; // fonts, masks, etc.
                }
                $new = $this->rewrite_source($url, $max_w, 'webp', $excluded, $queued);
                return $new !== null ? 'url(' . esc_url_raw($new) . ')' : $m[0];
            },
            $css
        );

        if ($queued !== []) {
            $this->enqueue($queued);
        }

        return is_string($out) ? $out : $css;
    }

    /**
     * Build the worker URL (or known direct public URL) for a media source,
     * or null when the source must not be rewritten.
     */
    private function rewrite_source(string $src, int $w, string $f, array $excluded, array &$queued): ?string {
        if (!preg_match('#^https?://#i', $src)) {
            return null; // data:, blob:, relative, protocol-relative
        }
        $api_base = rtrim($this->config->get_api_url(), '/');
        $cdn_base = rtrim($this->config->get_cdn_url(), '/');
        $object_base = rtrim($this->config->get_object_url(), '/');
        if (
            ($api_base !== '' && stripos($src, $api_base) === 0)
            || ($cdn_base !== '' && stripos($src, $cdn_base) === 0)
            || ($object_base !== '' && stripos($src, $object_base) === 0)
        ) {
            return null; // already a worker/CDN URL
        }
        // Own host (and its subdomains) only: proxied media consumes this
        // site's traffic quota and the edge fetches from the origin URL —
        // routing a third party's images/videos through the customer's
        // signed route burns quota for assets that aren't theirs (and
        // hotlink-protected hosts would 403 the fill). Matches the
        // JSON-context rule, which was already own-host-only.
        $own = strtolower((string) parse_url(home_url(), PHP_URL_HOST));
        $host = strtolower((string) parse_url($src, PHP_URL_HOST));
        if ($own === '' || ($host !== $own && ($host === '' || !str_ends_with($host, '.' . $own)))) {
            return null;
        }
        foreach ($excluded as $ex) {
            if ($ex !== '' && stripos($src, $ex) !== false) {
                return null;
            }
        }

        // SVG is vector: a webp derivative is meaningless and GD cannot
        // rasterize it — route original bytes through R2 instead.
        if ($f === 'webp' && preg_match('~\.svg(?:[?#]|$)~i', $src)) {
            $f = 'orig';
            $w = 0;
        }

        $url = $this->media_url($src, $w, $f);
        if ($url === null) {
            return null;
        }

        $queued[md5($src . '|' . $w . '|' . $f)] = ['src' => $src, 'w' => $w, 'f' => $f];
        return $url;
    }

    public function media_url(string $src, int $w, string $f): ?string {
        $direct = $this->known_public_media_url($src, $w, $f);
        if ($direct !== null) {
            return $direct;
        }
        return $this->worker_media_url($src, $w, $f);
    }

    /**
     * Legacy signed Worker URL. It remains the safe cold-fill path and keeps
     * old cached HTML working independently of the direct public bucket.
     */
    public function worker_media_url(string $src, int $w, string $f): ?string {
        // Visitor-facing URL: goes through the CDN hostname (R2-backed),
        // not the control-plane API host.
        $api_base = rtrim($this->config->get_cdn_url(), '/');
        $site_id = $this->config->get_site_id();
        if ($api_base === '' || $site_id === '') {
            return null;
        }

        $u = rtrim(strtr(base64_encode($src), '+/', '-_'), '=');
        $sig = substr(hash_hmac('sha256', $u . '|' . $w . '|' . $f . '|' . $site_id, Config::get_callback_secret_static()), 0, 32);
        $hash = substr(hash('sha256', $src), 0, 24);
        $q = max(40, min(100, (int) $this->config->get('media.image_quality', 82)));

        return sprintf(
            '%s/api/v1/assets/media/%s/%s?u=%s&w=%d&f=%s&q=%d&s=%s',
            $api_base,
            rawurlencode($site_id),
            $hash,
            $u,
            $w,
            rawurlencode($f),
            $q,
            $sig
        );
    }

    /**
     * Stable source version. Only local upload-library files are eligible for
     * immutable public objects: mtime + size makes replacing a file at the
     * same URL produce a new content address. Remote files have no cheap,
     * trustworthy version and therefore remain on the Worker route.
     */
    private function source_version(string $src): ?string {
        $file = $this->local_media_path($src);
        if ($file === null) {
            return null;
        }
        $mtime = @filemtime($file);
        $size = @filesize($file);
        if ($mtime === false || $size === false) {
            return null;
        }
        return $mtime . ':' . $size;
    }

    private function public_media_identity(string $src, int $w, string $f): ?array {
        // Raw assets are proxied by the Worker so CSS url() rewrites retain
        // their origin fallback and pipeline behavior. Only bounded image
        // derivatives enter the public bucket.
        if ($f !== 'webp' && $f !== 'orig') {
            return null;
        }
        $site_id = $this->config->get_site_id();
        $version = $this->source_version($src);
        if ($site_id === '' || $version === null) {
            return null;
        }

        $quality = max(40, min(100, (int) $this->config->get('media.image_quality', 82)));
        $width = max(0, min(4000, $w));
        $source_hash = substr(hash('sha256', $src . '|' . $version), 0, 32);
        $extension = $f === 'webp' ? 'webp' : $this->original_media_extension($src);
        if ($extension === null) {
            return null;
        }
        $signature = substr(hash_hmac(
            'sha256',
            'v1|' . $site_id . '|' . $source_hash . '|' . $width . '|' . $quality . '|' . $f,
            Config::get_callback_secret_static()
        ), 0, 32);

        return [
            'site_id' => $site_id,
            'source_hash' => $source_hash,
            'signature' => $signature,
            'width' => $width,
            'quality' => $quality,
            'format' => $f,
            'extension' => $extension,
            'key' => 'v1/' . $signature . '/' . rawurlencode($site_id) . '/' . $source_hash
                . '/' . $width . '/' . $quality . '.' . $extension,
        ];
    }

    /**
     * R2/Cloudflare cache eligibility depends on the object filename, so
     * original derivatives keep their real extension rather than a generic
     * `.orig` suffix that public caches may treat as dynamic.
     */
    private function original_media_extension(string $src): ?string {
        $path = (string) parse_url($src, PHP_URL_PATH);
        if (!preg_match('~\.([a-z0-9]{3,5})$~i', $path, $m)) {
            return null;
        }
        $extension = strtolower($m[1]);
        return in_array($extension, ['gif', 'jpg', 'jpeg', 'png', 'webp', 'avif', 'svg', 'mp4', 'm4v', 'webm', 'mov', 'woff', 'woff2', 'ttf', 'otf'], true)
            ? $extension
            : null;
    }

    private function known_public_media_url(string $src, int $w, string $f): ?string {
        $identity = $this->public_media_identity($src, $w, $f);
        if ($identity === null) {
            return null;
        }
        $manifest = $this->public_manifest();
        $url = (string) ($manifest[$identity['key']] ?? '');
        if ($url === '') {
            return null;
        }
        $base = rtrim($this->config->get_object_url(), '/');
        return str_starts_with($url, $base . '/') ? $url : null;
    }

    private function public_manifest(): array {
        if ($this->public_manifest_loaded) {
            return $this->public_manifest ?? [];
        }
        $stored = get_option(Config::PUBLIC_MEDIA_MANIFEST_OPTION, []);
        $this->public_manifest = is_array($stored) ? $stored : [];
        $this->public_manifest_loaded = true;
        return $this->public_manifest;
    }

    private function remember_public_media(array $identity, string $url): void {
        $base = rtrim($this->config->get_object_url(), '/');
        if ($base === '' || !str_starts_with($url, $base . '/')) {
            return;
        }
        $manifest = $this->public_manifest();
        $manifest[$identity['key']] = $url;
        if (count($manifest) > 500) {
            $manifest = array_slice($manifest, -500, null, true);
        }
        $this->public_manifest = $manifest;
        $this->public_manifest_loaded = true;
        update_option(Config::PUBLIC_MEDIA_MANIFEST_OPTION, $manifest, false);
    }

    /** Configured derivative widths (validated, sorted, defaults applied). */
    public function usable_widths(): array {
        $widths = (array) $this->config->get('media.offload_widths', []);
        $widths = array_values(array_unique(array_filter(array_map('intval', $widths), fn($w) => $w >= 16 && $w <= 4000)));
        if (empty($widths)) {
            $widths = [320, 480, 768, 1200, 1600];
        }
        sort($widths);
        return $widths;
    }

    /** Intrinsic pixel width of an LQIP placeholder derivative. */
    public const LQIP_WIDTH = 24;

    /**
     * Signed CDN URL for the tiny blur-up placeholder of an origin image,
     * or null when the source can't be offloaded. Same signed-URL contract
     * and R2 keys as every other derivative — the placeholder is just the
     * narrowest member of the srcset family.
     */
    public function lqip_url(string $origin_src): ?string {
        return $this->media_url($origin_src, self::LQIP_WIDTH, 'webp');
    }

    /**
     * Public queueing for derivatives generated outside transform() (the
     * LQIP pass runs in MediaOptimizer, after this class's own rewrite).
     * Deduped by the same queue-key scheme; a no-op when disconnected.
     */
    public function queue_derivative(string $src, int $w, string $f): void {
        if ($this->config->get_site_id() === '' || $this->config->get_api_key() === '') {
            return;
        }
        $this->enqueue([md5($src . '|' . $w . '|' . $f) => ['src' => $src, 'w' => $w, 'f' => $f]]);
    }

    private function enqueue(array $items): void {
        $queue = get_option(self::QUEUE_OPTION, []);
        if (!is_array($queue)) {
            $queue = [];
        }
        $added = 0;
        foreach ($items as $key => $item) {
            if (isset($queue[$key])) {
                continue;
            }
            $item['attempts'] = 0;
            $queue[$key] = $item;
            $added++;
        }
        if (count($queue) > self::MAX_QUEUE) {
            $queue = array_slice($queue, -self::MAX_QUEUE, null, true);
        }
        update_option(self::QUEUE_OPTION, $queue, false);

        // Schedule a due-now worker, but do not call spawn_cron() from inside
        // an output-buffer callback. On hosts using ALTERNATE_WP_CRON that
        // can start a nested output buffer and emit a document redirect while
        // the current response is still being transformed.
        if ($added > 0 && !get_transient('wpins_media_kick')) {
            set_transient('wpins_media_kick', 1, 2 * MINUTE_IN_SECONDS);
            wp_schedule_single_event(time(), 'wp_instant_media_offload', []);
        }
    }

    /**
     * Cron worker: generate + upload derivatives (bounded per run).
     * Every processed item is logged and pushed to the edge so the
     * dashboard Logs view shows R2 offload activity.
     */
    public static function process_queue(): void {
        $config = new Config();
        if ($config->get_site_id() === '' || $config->get_api_key() === '') {
            return;
        }
        $offloader = new self($config);

        $queue = get_option(self::QUEUE_OPTION, []);
        if (!is_array($queue) || empty($queue)) {
            return;
        }

        $log = [];
        $batch = 0;
        foreach ($queue as $key => $item) {
            if ($batch >= self::MAX_BATCH) {
                break;
            }
            if (($item['attempts'] ?? 0) >= self::MAX_ATTEMPTS) {
                unset($queue[$key]);
                continue;
            }
            $queue[$key]['attempts'] = ($item['attempts'] ?? 0) + 1;
            $batch++;

            try {
                $ok = $offloader->generate_and_upload((string) $item['src'], (int) $item['w'], (string) $item['f']);
            } catch (\Throwable $e) {
                $ok = false;
            }
            if ($ok) {
                unset($queue[$key]);
            }

            $log[] = [
                't' => time(),
                'src' => substr((string) $item['src'], 0, 300),
                'w' => (int) $item['w'],
                'f' => (string) $item['f'],
                'status' => $ok ? 'ok' : 'retry',
            ];
        }

        update_option(self::QUEUE_OPTION, $queue, false);

        if ($log !== []) {
            try {
                (new ApiClient($config))->push_offload_logs($log);
            } catch (\Throwable $e) {
                // Logging is best-effort; never break the worker.
            }
        }

        // More work left? Keep the worker hot without waiting an hour.
        if ($queue !== [] && $batch >= self::MAX_BATCH) {
            wp_schedule_single_event(time() + 20, 'wp_instant_media_offload', []);
            spawn_cron();
        }
    }

    private function generate_and_upload(string $src, int $w, string $f): bool {
        if ($f === 'raw') {
            // Video: stream the original bytes to R2 via the edge (≤100MB
            // handled by the worker itself; here cap at 10MB to be polite
            // to PHP memory limits — larger videos stay on the 302 path).
            $bytes = $this->fetch_bytes($src);
            if ($bytes === null) {
                return false;
            }
            return $this->upload($src, $w, 'raw', $bytes, self::raw_mime($src));
        }

        $bytes = $this->fetch_bytes($src);
        if ($bytes === null || strlen($bytes) < 128) {
            return false;
        }

        // SVG / explicit orig: upload the original bytes untouched (vector
        // formats are already optimal; webp conversion would be a loss).
        if ($f === 'orig' || preg_match('~\.svg(?:[?#]|$)~i', $src)) {
            $mime = 'application/octet-stream';
            if (preg_match('~\.svg(?:[?#]|$)~i', $src)) {
                $mime = 'image/svg+xml';
            } elseif (($info = @getimagesizefromstring($bytes)) !== false && !empty($info['mime'])) {
                $mime = $info['mime'];
            }
            return $this->upload($src, $w, 'orig', $bytes, $mime);
        }

        $info = @getimagesizefromstring($bytes);
        if ($info === false || empty($info[2])) {
            return false; // not a raster image — leave on the 302 path
        }

        $type = (int) $info[2];
        // Animated gifs and unsupported formats: offload the original bytes.
        if (
            $type === IMAGETYPE_GIF ||
            !function_exists('imagecreatefromstring') ||
            !function_exists('imagewebp')
        ) {
            return $this->upload($src, $w, 'orig', $bytes, $info['mime'] ?? 'application/octet-stream');
        }

        $img = @imagecreatefromstring($bytes);
        if (!$img) {
            return false;
        }

        $orig_w = (int) $info[0];
        if ($w > 0 && $orig_w > $w) {
            $scaled = imagescale($img, $w);
            if ($scaled !== false) {
                imagedestroy($img);
                $img = $scaled;
            }
        }

        $quality = max(40, min(100, (int) $this->config->get('media.image_quality', 82)));
        ob_start();
        $ok = imagewebp($img, null, $quality);
        imagedestroy($img);
        $webp = (string) ob_get_clean();
        if (!$ok || $webp === '') {
            return false;
        }

        return $this->upload($src, $w, 'webp', $webp, 'image/webp');
    }

    /** Serving content type for raw offloads, resolved from the file extension. */
    private static function raw_mime(string $src): string {
        if (preg_match('~\.(mp4|m4v)(?:[?#]|$)~i', $src)) {
            return 'video/mp4';
        }
        if (preg_match('~\.webm(?:[?#]|$)~i', $src)) {
            return 'video/webm';
        }
        if (preg_match('~\.mov(?:[?#]|$)~i', $src)) {
            return 'video/quicktime';
        }
        return 'application/octet-stream';
    }

    private function fetch_bytes(string $src): ?string {
        if (!$this->is_allowed_media_source($src)) {
            return null;
        }

        // Only resolve a real file inside the WordPress uploads directory.
        // Mapping any same-host URL directly into ABSPATH can expose PHP or
        // configuration files and does not protect against symlink escapes.
        $home = parse_url(home_url());
        $parsed = parse_url($src);
        if (
            !empty($home['host']) && !empty($parsed['host'])
            && strtolower($home['host']) === strtolower($parsed['host'])
        ) {
            $file = $this->local_media_path($src);
            if ($file !== null && filesize($file) <= self::MAX_SOURCE_BYTES) {
                $bytes = @file_get_contents($file);
                if ($bytes !== false) {
                    return $bytes;
                }
            }
        }

        $fetch = function_exists('wp_safe_remote_get') ? 'wp_safe_remote_get' : 'wp_remote_get';
        $response = $fetch($src, [
            'timeout' => 10,
            'redirection' => 3,
            'limit_response_size' => self::MAX_SOURCE_BYTES,
        ]);
        if (is_wp_error($response) || wp_remote_retrieve_response_code($response) !== 200) {
            return null;
        }
        $body = (string) wp_remote_retrieve_body($response);
        return strlen($body) > 0 && strlen($body) <= self::MAX_SOURCE_BYTES ? $body : null;
    }

    private function is_allowed_media_source(string $src): bool {
        $path = (string) parse_url($src, PHP_URL_PATH);
        return (bool) preg_match('~\.(?:jpe?g|png|gif|webp|avif|svg|mp4|m4v|webm|mov)(?:$|/)~i', $path);
    }

    private function local_media_path(string $src): ?string {
        $parsed = parse_url($src);
        $path = (string) ($parsed['path'] ?? '');
        if ($path === '' || !function_exists('wp_upload_dir')) {
            return null;
        }

        $uploads = wp_upload_dir();
        $root = is_array($uploads) ? realpath((string) ($uploads['basedir'] ?? '')) : false;
        if ($root === false) {
            return null;
        }

        $candidate = realpath(ABSPATH . ltrim($path, '/'));
        if ($candidate === false || !is_file($candidate)) {
            return null;
        }

        $root = rtrim(wp_normalize_path($root), '/');
        $candidate = wp_normalize_path($candidate);
        if ($candidate !== $root && !str_starts_with($candidate, $root . '/')) {
            return null;
        }
        return $candidate;
    }

    private function upload(string $src, int $w, string $f, string $bytes, string $content_type): bool {
        if (strlen($bytes) > 3145728) {
            return false; // edge body cap: 3MB
        }
        $url = $this->worker_media_url($src, $w, $f);
        if ($url === null) {
            return false;
        }
        $identity = $this->public_media_identity($src, $w, $f);
        if ($identity !== null) {
            $object_base = rtrim($this->config->get_api_url(), '/');
            $url = $object_base . '/api/v1/assets/public-media/' . rawurlencode($identity['site_id'])
                . '/' . $identity['signature'] . '/' . $identity['source_hash']
                . '/' . $identity['width'] . '/' . $identity['quality'] . '/' . rawurlencode($identity['extension']);
        }

        $host = strtolower((string) parse_url(home_url(), PHP_URL_HOST));
        $response = wp_remote_request($url, [
            'method' => 'PUT',
            'timeout' => 20,
            'headers' => [
                'Authorization' => 'Bearer ' . $this->config->get_api_key(),
                'X-Site-Domain' => $host,
                'Content-Type' => $content_type,
            ],
            'body' => $bytes,
        ]);

        if (is_wp_error($response) || !in_array(wp_remote_retrieve_response_code($response), [200, 201], true)) {
            return false;
        }
        if ($identity !== null) {
            $body = json_decode((string) wp_remote_retrieve_body($response), true);
            $public_url = is_array($body) ? (string) ($body['data']['publicUrl'] ?? '') : '';
            if ($public_url !== '') {
                $this->remember_public_media($identity, $public_url);
            }
        }
        return true;
    }
}
