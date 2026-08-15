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

    /**
     * Normalize a query string by removing ignored tracking params.
     * Handles trailing-* wildcard prefixes (e.g. "utm_*" matches utm_source).
     * MUST stay byte-compatible with the drop-in in advanced-cache.php,
     * which reimplements the same rules without WP functions.
     */
    public static function normalize_query(string $query, array $ignored): string {
        if ($query === '') {
            return '';
        }

        parse_str($query, $params);
        if (empty($params)) {
            return '';
        }

        foreach ($ignored as $ign) {
            $ign_key = rtrim((string) $ign, '*');
            if ($ign_key === '') {
                continue;
            }
            foreach (array_keys($params) as $param_key) {
                if (str_starts_with($param_key, $ign_key)) {
                    unset($params[$param_key]);
                }
            }
        }

        if (empty($params)) {
            return '';
        }

        ksort($params);
        return '?' . http_build_query($params);
    }

    /**
     * Shared mobile detection. Mirrors the drop-in UA sniff exactly so
     * cached files written by PHP are always found by advanced-cache.php.
     */
    public static function ua_is_mobile(string $user_agent): bool {
        $ua = strtolower($user_agent);
        return (bool) preg_match('/mobile|android|iphone|ipod|windows phone/i', $ua);
    }

    private function ignored_params(): array {
        return (array) $this->config->get('caching.strip_query_params', []);
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

        $clean_query = self::normalize_query($query, $this->ignored_params());

        $is_mobile = false;
        if ($this->config->get('caching.mobile_cache', true)) {
            $is_mobile = self::ua_is_mobile($_SERVER['HTTP_USER_AGENT'] ?? '');
        }

        $cache_dir = TURBOPRESS_PAGES_DIR . '/' . md5($host);
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
            if ($br_data !== false) {
                @file_put_contents($file_path . '.br', $br_data);
            }
        }

        return (bool) $result;
    }

    /**
     * Purge a single URL from the static page cache. Query params are
     * normalized with the exact same rules as write_cache() so a purge of
     * "/?utm_source=x" also removes the file cached under the clean key.
     */
    public static function purge_url(string $url): void {
        $parsed = parse_url($url);
        $host = strtolower($parsed['host'] ?? ($_SERVER['HTTP_HOST'] ?? 'localhost'));
        $path = $parsed['path'] ?? '/';
        $query = $parsed['query'] ?? '';

        $ignored = [];
        $stored = get_option(Config::OPTION_KEY, []);
        if (is_array($stored) && !empty($stored['caching']['strip_query_params'])) {
            $ignored = (array) $stored['caching']['strip_query_params'];
        }

        // Try both the normalized and raw query variants — whichever keys
        // exist on disk get removed.
        $query_variants = array_unique([
            self::normalize_query($query, $ignored),
            !empty($query) ? '?' . $query : '',
        ]);

        $cache_dir = TURBOPRESS_PAGES_DIR . '/' . md5($host);

        foreach (['_desktop', '_mobile'] as $suffix) {
            foreach ($query_variants as $q) {
                $url_hash = md5($path . $q . $suffix);
                $sub_dir = $cache_dir . '/' . substr($url_hash, 0, 2);
                $base_file = $sub_dir . '/' . $url_hash . '.html';

                foreach (['', '.gz', '.br'] as $ext) {
                    if (file_exists($base_file . $ext)) {
                        @unlink($base_file . $ext);
                    }
                }
            }
        }
    }

    /**
     * Purge every static page cache entry. Only the /pages subtree is
     * cleared — critical CSS, combined CSS and localized fonts survive.
     */
    public static function purge_all_static(): void {
        if (!file_exists(TURBOPRESS_PAGES_DIR)) {
            return;
        }

        self::delete_directory_contents(TURBOPRESS_PAGES_DIR);
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
