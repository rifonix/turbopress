<?php
namespace Turbopress;

if (!defined('ABSPATH')) {
    exit;
}

/**
 * Zero-DNS media CDN: rewrites <img>/<video> URLs to signed edge-worker
 * URLs backed by R2.
 *
 * Flow:
 *  1. transform(): rewrite src/srcset/video sources to
 *     {api}/api/v1/assets/media/{site_id}/{hash}?u=&w=&f=&s= — the worker
 *     serves the R2 derivative on HIT and 302s to the origin URL on MISS,
 *     so a rewrite can NEVER break an image (worst case = a redirect).
 *  2. Rewritten assets are queued; the hourly turbopress_media_offload
 *     cron generates webp derivatives (GD) and PUTs them to the edge,
 *     which stores them in R2 (immutable).
 */
class MediaOffloader {
    private const QUEUE_OPTION = 'turbopress_media_queue';
    private const MAX_QUEUE = 500;
    private const MAX_BATCH = 12;
    private const MAX_ATTEMPTS = 5;
    private const MAX_SOURCE_BYTES = 10485760; // 10MB

    private Config $config;

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
            // <img> tags: rewrite src + srcset candidates.
            $html = preg_replace_callback(
                '/<img\b[^>]*>/i',
                function ($m) use ($excluded, $widths, $max_w, &$queued) {
                    $tag = $m[0];

                    // src
                    if (preg_match('/\ssrc=["\']([^"\']+)["\']/i', $tag, $sm)) {
                        $src = $sm[1];
                        $w = preg_match('/\swidth=["\'](\d{3,4})["\']/i', $tag, $wm) ? (int) $wm[1] : $max_w;
                        $new = $this->rewrite_source($src, $w, 'webp', $excluded, $queued);
                        if ($new !== null) {
                            $tag = str_replace($sm[0], ' src="' . esc_url($new) . '" data-tp-orig-src="' . esc_url($src) . '"', $tag);
                        }
                    }

                    // srcset candidates (each with its own width descriptor)
                    if (preg_match('/\ssrcset=["\']([^"\']+)["\']/i', $tag, $sm)) {
                        $parts = array_filter(array_map('trim', explode(',', $sm[1])));
                        $out = [];
                        foreach ($parts as $part) {
                            if (preg_match('/^(\S+)(?:\s+(\d+)w)?$/i', $part, $pm)) {
                                $cand = $pm[1];
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

            // CSS background images inside inline styles (Elementor classic backgrounds).
            $html = preg_replace_callback(
                '/url\((["\']?)(https?:\/\/[^"\')\s]+)\1\)/i',
                function ($m) use ($excluded, $widths, $max_w, &$queued) {
                    $new = $this->rewrite_source($m[2], $max_w, 'webp', $excluded, $queued);
                    return $new !== null ? 'url(' . esc_url_raw($new) . ')' : $m[0];
                },
                $html
            ) ?? $html;
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
                    return str_replace($sm[0], ' src="' . esc_url($new) . '" data-tp-orig-src="' . esc_url($sm[1]) . '"', $tag);
                },
                $html
            ) ?? $html;
        }

        if (!empty($queued)) {
            $this->enqueue($queued);
        }

        return $html;
    }

    /**
     * Build the signed worker URL for a media source, or null when the
     * source must not be rewritten.
     */
    private function rewrite_source(string $src, int $w, string $f, array $excluded, array &$queued): ?string {
        if (!preg_match('#^https?://#i', $src)) {
            return null; // data:, blob:, relative, protocol-relative
        }
        $api_base = rtrim($this->config->get_api_url(), '/');
        if ($api_base !== '' && stripos($src, $api_base) === 0) {
            return null; // already a worker URL
        }
        foreach ($excluded as $ex) {
            if ($ex !== '' && stripos($src, $ex) !== false) {
                return null;
            }
        }

        $url = $this->media_url($src, $w, $f);
        if ($url === null) {
            return null;
        }

        $queued[md5($src . '|' . $w . '|' . $f)] = ['src' => $src, 'w' => $w, 'f' => $f];
        return $url;
    }

    public function media_url(string $src, int $w, string $f): ?string {
        $api_base = rtrim($this->config->get_api_url(), '/');
        $site_id = $this->config->get_site_id();
        if ($api_base === '' || $site_id === '') {
            return null;
        }

        $u = rtrim(strtr(base64_encode($src), '+/', '-_'), '=');
        $sig = substr(hash_hmac('sha256', $u . '|' . $w . '|' . $f . '|' . $site_id, Config::get_callback_secret_static()), 0, 32);
        $hash = substr(hash('sha256', $src), 0, 24);

        return sprintf(
            '%s/api/v1/assets/media/%s/%s?u=%s&w=%d&f=%s&s=%s',
            $api_base,
            rawurlencode($site_id),
            $hash,
            $u,
            $w,
            rawurlencode($f),
            $sig
        );
    }

    private function usable_widths(): array {
        $widths = (array) $this->config->get('media.offload_widths', []);
        $widths = array_values(array_unique(array_filter(array_map('intval', $widths), fn($w) => $w >= 16 && $w <= 4000)));
        if (empty($widths)) {
            $widths = [480, 768, 1200, 1600];
        }
        sort($widths);
        return $widths;
    }

    private function enqueue(array $items): void {
        $queue = get_option(self::QUEUE_OPTION, []);
        if (!is_array($queue)) {
            $queue = [];
        }
        foreach ($items as $key => $item) {
            if (isset($queue[$key])) {
                continue;
            }
            $item['attempts'] = 0;
            $queue[$key] = $item;
        }
        if (count($queue) > self::MAX_QUEUE) {
            $queue = array_slice($queue, -self::MAX_QUEUE, null, true);
        }
        update_option(self::QUEUE_OPTION, $queue, false);
    }

    /**
     * Cron worker: generate + upload derivatives (bounded per run).
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
        }

        update_option(self::QUEUE_OPTION, $queue, false);
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
            return $this->upload($src, $w, 'raw', $bytes, 'application/octet-stream');
        }

        $bytes = $this->fetch_bytes($src);
        if ($bytes === null || strlen($bytes) < 128) {
            return false;
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

        ob_start();
        $ok = imagewebp($img, null, 82);
        imagedestroy($img);
        $webp = (string) ob_get_clean();
        if (!$ok || $webp === '') {
            return false;
        }

        return $this->upload($src, $w, 'webp', $webp, 'image/webp');
    }

    private function fetch_bytes(string $src): ?string {
        // Local fast path: same-origin file under ABSPATH.
        $home = parse_url(home_url());
        $parsed = parse_url($src);
        if (
            !empty($home['host']) && !empty($parsed['host'])
            && strtolower($home['host']) === strtolower($parsed['host'])
        ) {
            $file = wp_normalize_path(ABSPATH . ltrim($parsed['path'] ?? '/', '/'));
            if (str_starts_with($file, wp_normalize_path(ABSPATH)) && is_file($file) && filesize($file) <= self::MAX_SOURCE_BYTES) {
                $bytes = @file_get_contents($file);
                if ($bytes !== false) {
                    return $bytes;
                }
            }
        }

        $response = wp_remote_get($src, ['timeout' => 10]);
        if (is_wp_error($response) || wp_remote_retrieve_response_code($response) !== 200) {
            return null;
        }
        $body = (string) wp_remote_retrieve_body($response);
        return strlen($body) > 0 && strlen($body) <= self::MAX_SOURCE_BYTES ? $body : null;
    }

    private function upload(string $src, int $w, string $f, string $bytes, string $content_type): bool {
        if (strlen($bytes) > 3145728) {
            return false; // edge body cap: 3MB
        }
        $url = $this->media_url($src, $w, $f);
        if ($url === null) {
            return false;
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

        return !is_wp_error($response) && in_array(wp_remote_retrieve_response_code($response), [200, 201], true);
    }
}
