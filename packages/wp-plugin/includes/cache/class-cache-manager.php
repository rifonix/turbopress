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

        // D5: skip writes while an atomic full-purge swap is in flight.
        if (self::is_purge_locked()) {
            return false;
        }

        $file_path = $sub_dir . '/' . $url_hash . '.html';

        // 1. Write raw HTML
        $result = @file_put_contents($file_path, $html);

        // A fresh entry supersedes any stale twin left by a soft purge.
        if ($result) {
            foreach (['', '.gz', '.br'] as $ext) {
                $stale = $file_path . $ext . '.stale';
                if (file_exists($stale)) {
                    @unlink($stale);
                }
            }
        }

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
     * Purge (invalidate) a single URL from the static page cache.
     * Query params are normalized with the exact same rules as write_cache()
     * so a purge of "/?utm_source=x" also removes the file cached under the
     * clean key.
     *
     * Soft purge (default): the entry is renamed to `.stale` and keeps
     * serving for up to 24h while a fresh render regenerates it — never a
     * purge -> miss -> slow page window. Hard purge: the files are deleted
     * outright (used when a URL truly disappears, e.g. post deleted).
     */
    public static function purge_url(string $url, bool $hard = false): void {
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
                    $current = $base_file . $ext;
                    if ($hard) {
                        @unlink($current);
                        @unlink($current . '.stale');
                        continue;
                    }
                    if (file_exists($current)) {
                        @rename($current, $current . '.stale');
                    }
                }
            }
        }
    }

    /**
     * Purge every static page cache entry. Only the /pages subtree is
     * cleared — critical CSS, combined CSS and localized fonts survive.
     *
     * D5: the purge is atomic — the pages dir is renamed away and an empty
     * one takes its place immediately (no window where partial state is
     * served). A flock-guarded lock prevents concurrent double purges and
     * pauses cache writes mid-swap.
     */
    public static function purge_all_static(): void {
        if (!file_exists(TURBOPRESS_PAGES_DIR)) {
            return;
        }

        $lock_fp = @fopen(TURBOPRESS_CACHE_DIR . '/.purge_lock', 'c');
        if (!$lock_fp) {
            self::delete_directory_contents(TURBOPRESS_PAGES_DIR);
            return;
        }

        if (!flock($lock_fp, LOCK_EX | LOCK_NB)) {
            // Another purge is already in flight — it covers this request.
            @fclose($lock_fp);
            return;
        }

        try {
            $trash = TURBOPRESS_PAGES_DIR . '.old.' . substr(md5(uniqid('', true)), 0, 8);
            if (@rename(TURBOPRESS_PAGES_DIR, $trash)) {
                wp_mkdir_p(TURBOPRESS_PAGES_DIR);
                self::delete_directory($trash);
            } else {
                self::delete_directory_contents(TURBOPRESS_PAGES_DIR);
            }
        } finally {
            @flock($lock_fp, LOCK_UN);
            @fclose($lock_fp);
        }
    }

    private static function is_purge_locked(): bool {
        $lock_fp = @fopen(TURBOPRESS_CACHE_DIR . '/.purge_lock', 'c');
        if (!$lock_fp) {
            return false;
        }
        $acquired = flock($lock_fp, LOCK_EX | LOCK_NB);
        if ($acquired) {
            @flock($lock_fp, LOCK_UN);
        }
        @fclose($lock_fp);
        return !$acquired;
    }

    private static function delete_directory(string $dir): void {
        if (!is_dir($dir)) {
            return;
        }
        self::delete_directory_contents($dir);
        @rmdir($dir);
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
