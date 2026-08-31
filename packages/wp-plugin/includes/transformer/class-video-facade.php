<?php
namespace WPInstant;

if (!defined('ABSPATH')) {
    exit;
}

/**
 * YouTube and Vimeo Video Facade Engine:
 * Replaces render-blocking video iframes (~500KB-1MB of third-party JS)
 * with responsive static thumbnail facades and SVG play buttons.
 * The real iframe is dynamically instantiated only when the user clicks play.
 */
class VideoFacade {
    private Config $config;
    private bool $facade_injected = false;

    public function __construct(Config $config) {
        $this->config = $config;
    }

    public function transform(string $html): string {
        $media = $this->config->get('media', []);
        $enabled = !empty($media['video_facades']);
        if (!$enabled) {
            return $html;
        }

        $youtube_enabled = !isset($media['youtube_facades']) || !empty($media['youtube_facades']);
        $vimeo_enabled = !isset($media['vimeo_facades']) || !empty($media['vimeo_facades']);

        $this->facade_injected = false;

        // Match all iframe tags
        $pattern = '/<iframe\b[^>]*\bsrc=["\']([^"\']+)["\'][^>]*>(?:<\/iframe>)?/i';
        $html = preg_replace_callback($pattern, function (array $matches) use ($youtube_enabled, $vimeo_enabled): string {
            $full_tag = $matches[0];
            $src = $matches[1];

            // Check for exclusions or skip markers
            if (stripos($full_tag, 'data-no-facade') !== false || stripos($full_tag, 'skip-facade') !== false) {
                return $full_tag;
            }

            // 1. YouTube Handler
            if ($youtube_enabled && preg_match('/(?:youtube(?:-nocookie)?\.com\/(?:embed\/|watch\?v=)|youtu\.be\/)([a-zA-Z0-9_-]{11})/i', $src, $yt_matches)) {
                $video_id = $yt_matches[1];
                $this->facade_injected = true;
                return $this->build_youtube_facade($full_tag, $src, $video_id);
            }

            // 2. Vimeo Handler
            if ($vimeo_enabled && preg_match('/player\.vimeo\.com\/video\/([0-9]+)/i', $src, $vim_matches)) {
                $video_id = $vim_matches[1];
                $this->facade_injected = true;
                return $this->build_vimeo_facade($full_tag, $src, $video_id);
            }

            return $full_tag;
        }, $html) ?? $html;

        if ($this->facade_injected) {
            $html = $this->inject_facade_assets($html);
        }

        return $html;
    }

    private function build_youtube_facade(string $original_tag, string $src, string $video_id): string {
        $title = 'Play YouTube Video';
        if (preg_match('/title=["\']([^"\']+)["\']/i', $original_tag, $title_match)) {
            $title = esc_attr($title_match[1]);
        }

        // Add autoplay parameter to ensure playback begins on click
        $play_src = $src . (str_contains($src, '?') ? '&' : '?') . 'autoplay=1&playsinline=1';
        $thumb_url = "https://i.ytimg.com/vi_webp/{$video_id}/hqdefault.webp";
        $fallback_thumb = "https://i.ytimg.com/vi/{$video_id}/hqdefault.jpg";

        return sprintf(
            '<div class="wpins-video-facade wpins-youtube-facade" data-src="%s" onclick="load_wp_instant_video(this)" role="button" tabindex="0" aria-label="%s" style="background-image:url(\'%s\'),url(\'%s\')"><svg class="wpins-play-btn" viewBox="0 0 68 48" width="68" height="48"><path class="wpins-play-bg" d="M66.52,7.74c-0.78-2.93-2.49-5.41-5.42-6.19C55.79,.13,34,0,34,0S12.21,.13,6.9,1.55 C3.97,2.33,2.27,4.81,1.48,7.74C0.06,13.05,0,24,0,24s0.06,10.95,1.48,16.26c0.78,2.93,2.49,5.41,5.42,6.19 C12.21,47.87,34,48,34,48s21.79-0.13,27.1-1.55c2.93-0.78,4.64-3.26,5.42-6.19C67.94,34.95,68,24,68,24S67.94,13.05,66.52,7.74z" fill="#f00"></path><path d="M 45,24 27,14 27,34" fill="#fff"></path></svg></div>',
            esc_url($play_src),
            $title,
            esc_url($thumb_url),
            esc_url($fallback_thumb)
        );
    }

    private function build_vimeo_facade(string $original_tag, string $src, string $video_id): string {
        $title = 'Play Vimeo Video';
        if (preg_match('/title=["\']([^"\']+)["\']/i', $original_tag, $title_match)) {
            $title = esc_attr($title_match[1]);
        }

        $play_src = $src . (str_contains($src, '?') ? '&' : '?') . 'autoplay=1&playsinline=1';

        return sprintf(
            '<div class="wpins-video-facade wpins-vimeo-facade" data-src="%s" onclick="load_wp_instant_video(this)" role="button" tabindex="0" aria-label="%s"><svg class="wpins-play-btn" viewBox="0 0 68 48" width="68" height="48"><rect width="68" height="48" rx="12" fill="#00adef"></rect><path d="M 45,24 27,14 27,34" fill="#fff"></path></svg></div>',
            esc_url($play_src),
            $title
        );
    }

    private function inject_facade_assets(string $html): string {
        $css = '<style id="wpins-video-facade-css">.wpins-video-facade{position:relative;display:block;width:100%;aspect-ratio:16/9;background-size:cover;background-position:center;cursor:pointer;overflow:hidden;background-color:#000}.wpins-video-facade:hover .wpins-play-btn{transform:scale(1.1)}.wpins-video-facade iframe{width:100%!important;height:100%!important;position:absolute;top:0;left:0;border:0}.wpins-play-btn{position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);transition:transform .2s ease;filter:drop-shadow(0 4px 8px rgba(0,0,0,.4))}</style>';
        $js = '<script id="wpins-video-facade-js">function load_wp_instant_video(el){if(el.getAttribute("data-loaded"))return;el.setAttribute("data-loaded","1");var ifr=document.createElement("iframe");ifr.src=el.getAttribute("data-src");ifr.setAttribute("frameborder","0");ifr.setAttribute("allow","accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share");ifr.setAttribute("allowfullscreen","1");el.innerHTML="";el.appendChild(ifr);}</script>';

        if (str_contains($html, '</head>')) {
            $html = str_replace('</head>', $css . '</head>', $html);
        } else {
            $html = $css . $html;
        }

        if (str_contains($html, '</body>')) {
            $html = str_replace('</body>', $js . '</body>', $html);
        } else {
            $html .= $js;
        }

        return $html;
    }
}
