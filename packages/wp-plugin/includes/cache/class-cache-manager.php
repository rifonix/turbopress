<?php
namespace Turbopress;

if (!defined('ABSPATH')) {
    exit;
}

class CacheManager {
    private Config $config;

    public function __construct(Config $config) {
        $this->config = $config;
    }

    public function write_cache(string $html): bool {
        if (empty($html) || strlen($html) < 250) {
            return false;
        }

        $host = isset($_SERVER['HTTP_HOST']) ? strtolower($_SERVER['HTTP_HOST']) : 'localhost';
        $uri = isset($_SERVER['REQUEST_URI']) ? $_SERVER['REQUEST_URI'] : '/';

        $parsed = parse_url($uri);
        $path = $parsed['path'] ?? '/';
        $query = $parsed['query'] ?? '';

        $clean_query = '';
        if (!empty($query)) {
            parse_str($query, $params);
            $ignored = (array) $this->config->get('caching.strip_query_params', []);
            foreach ($ignored as $ign) {
                $ign_key = rtrim($ign, '*');
                foreach (array_keys($params) as $param_key) {
                    if (str_starts_with($param_key, $ign_key)) {
                        unset($params[$param_key]);
                    }
                }
            }
            if (!empty($params)) {
                ksort($params);
                $clean_query = '?' . http_build_query($params);
            }
        }

        $is_mobile = false;
        if ($this->config->get('caching.mobile_cache', true)) {
            $is_mobile = wp_is_mobile();
        }

        $cache_dir = TURBOPRESS_CACHE_DIR . '/' . md5($host);
        $url_hash = md5($path . $clean_query . ($is_mobile ? '_mobile' : '_desktop'));
        $sub_dir = $cache_dir . '/' . substr($url_hash, 0, 2);

        if (!file_exists($sub_dir)) {
            wp_mkdir_p($sub_dir);
        }

        $file_path = $sub_dir . '/' . $url_hash . '.html';

        // 1. Write raw HTML
        $result = @file_put_contents($file_path, $html);

        // 2. Pre-compress Gzip for sub-10ms delivery
        if ($result && function_exists('gzencode')) {
            $gz_data = gzencode($html, 9);
            if ($gz_data) {
                @file_put_contents($file_path . '.gz', $gz_data);
            }
        }

        // 3. Pre-compress Brotli if extension available
        if ($result && function_exists('brotli_compress')) {
            $br_data = brotli_compress($html, 11, BROTLI_GENERIC_MODE);
            if ($br_data) {
                @file_put_contents($file_path . '.br', $br_data);
            }
        }

        return (bool) $result;
    }

    public static function purge_url(string $url): void {
        $parsed = parse_url($url);
        $host = $parsed['host'] ?? $_SERVER['HTTP_HOST'] ?? 'localhost';
        $path = $parsed['path'] ?? '/';
        $query = $parsed['query'] ?? '';

        $clean_query = !empty($query) ? '?' . $query : '';
        $cache_dir = TURBOPRESS_CACHE_DIR . '/' . md5($host);

        // Check both desktop and mobile variants
        foreach (['_desktop', '_mobile'] as $suffix) {
            $url_hash = md5($path . $clean_query . $suffix);
            $sub_dir = $cache_dir . '/' . substr($url_hash, 0, 2);
            $base_file = $sub_dir . '/' . $url_hash . '.html';

            if (file_exists($base_file)) {
                @unlink($base_file);
            }
            if (file_exists($base_file . '.gz')) {
                @unlink($base_file . '.gz');
            }
            if (file_exists($base_file . '.br')) {
                @unlink($base_file . '.br');
            }
        }
    }

    public static function purge_all_static(): void {
        if (!file_exists(TURBOPRESS_CACHE_DIR)) {
            return;
        }

        self::delete_directory_contents(TURBOPRESS_CACHE_DIR);
    }

    private static function delete_directory_contents(string $dir): void {
        $items = @scandir($dir);
        if (!$items) {
            return;
        }

        foreach ($items as $item) {
            if ($item === '.' || $item === '..') {
                continue;
            }
            $path = $dir . '/' . $item;
            if (is_dir($path)) {
                self::delete_directory_contents($path);
                @rmdir($path);
            } else {
                @unlink($path);
            }
        }
    }
}
