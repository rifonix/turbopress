<?php
namespace Turbopress;

if (!defined('ABSPATH')) {
    exit;
}

/**
 * .htaccess optimization manager (marker-scoped, self-healing).
 *
 * Installs a "# BEGIN TurboPress … # END TurboPress" block:
 *  1. Pre-compressed .br / .gz twins served when the browser accepts them
 *     (Brotli preferred, gzip fallback) for css/js/svg.
 *  2. Cache-Control: 1y immutable for content-hashed assets under
 *     wp-content/cache/turbopress/ and for ?ver=-versioned css/js.
 *  3. 30d Cache-Control for all other first-party static assets
 *     (images, fonts, media) — replaces Hostinger's 7d default.
 *  4. Optional Brotli/deflate output filters (skipped when LiteSpeed Cache
 *     owns compression).
 *
 * Safety: the previous .htaccess is backed up before the first write; after
 * writing, a loopback healthcheck must return a full HTML page within 8s or
 * the backup is restored automatically. Coexists with other plugins'
 * marker blocks (WordPress core, LiteSpeed, WP Rocket…).
 */
class Htaccess_Manager {
    public const MARKER_BEGIN = '# BEGIN TurboPress';
    public const MARKER_END = '# END TurboPress';
    private const OPTION = 'turbopress_htaccess';
    private const BACKUP_SUFFIX = '.turbopress-bak';

    /**
     * Install or refresh the marker block. Returns true on success.
     */
    public static function install(): bool {
        if (!(bool) self::config_get('htaccess.enabled', true)) {
            return false;
        }
        if (!function_exists('get_home_path')) {
            require_once ABSPATH . 'wp-admin/includes/file.php';
        }
        $path = trailingslashit(get_home_path()) . '.htaccess';

        if (!file_exists($path)) {
            // No .htaccess yet (nginx?): create one only on Apache-ish stacks.
            if (!self::looks_like_apache()) {
                self::store(['active' => false, 'reason' => 'no_htaccess', 'at' => time()]);
                return false;
            }
            @file_put_contents($path, '');
        }
        if (!is_writable($path)) {
            self::store(['active' => false, 'reason' => 'not_writable', 'at' => time()]);
            return false;
        }

        $current = (string) @file_get_contents($path);
        $rules = self::build_rules();
        if ($rules === '') {
            return false;
        }

        // First install: keep a pristine backup for auto-restore.
        $backup = $path . self::BACKUP_SUFFIX;
        if (strpos($current, self::MARKER_BEGIN) === false && !file_exists($backup)) {
            @copy($path, $backup);
        }

        $new = self::replace_block($current, $rules);
        if ($new === $current) {
            self::store(['active' => true, 'reason' => '', 'at' => time(), 'version' => TURBOPRESS_VERSION]);
            return true; // already exactly current
        }

        // Strip our backup-file twins from being re-served weirdly; not needed.
        if (@file_put_contents($path, $new) === false) {
            self::store(['active' => false, 'reason' => 'write_failed', 'at' => time()]);
            return false;
        }

        // Loopback healthcheck: a broken .htaccess 500s the whole site.
        if (!self::loopback_ok()) {
            if (file_exists($backup)) {
                @copy($backup, $path);
            } else {
                @file_put_contents($path, self::replace_block((string) @file_get_contents($path), ''));
            }
            self::store(['active' => false, 'reason' => 'loopback_failed_restored', 'at' => time()]);
            return false;
        }

        self::store(['active' => true, 'reason' => '', 'at' => time(), 'version' => TURBOPRESS_VERSION]);
        return true;
    }

    /**
     * Remove the marker block (deactivation). Leaves other plugins' rules
     * and the WP core block untouched.
     */
    public static function remove(): bool {
        if (!function_exists('get_home_path')) {
            require_once ABSPATH . 'wp-admin/includes/file.php';
        }
        $path = trailingslashit(get_home_path()) . '.htaccess';
        if (!file_exists($path) || !is_writable($path)) {
            self::store(['active' => false, 'reason' => '', 'at' => time()]);
            return true;
        }
        $current = (string) @file_get_contents($path);
        $new = self::replace_block($current, '');
        if ($new !== $current) {
            @file_put_contents($path, $new);
        }
        $backup = $path . self::BACKUP_SUFFIX;
        if (file_exists($backup)) {
            @unlink($backup);
        }
        self::store(['active' => false, 'reason' => '', 'at' => time()]);
        return true;
    }

    public static function is_active(): bool {
        $state = get_option(self::OPTION, []);
        return is_array($state) && !empty($state['active']);
    }

    public static function get_state(): array {
        $state = get_option(self::OPTION, []);
        return is_array($state) ? $state : [];
    }

    private static function store(array $state): void {
        update_option(self::OPTION, $state, false);
    }

    /**
     * Compose the rules block. Empty string when nothing should be written.
     */
    private static function build_rules(): string {
        $lines = [];
        $lines[] = self::MARKER_BEGIN;
        $lines[] = '# Managed by the TurboPress plugin. Do not edit between the markers.';
        $lines[] = '<IfModule mod_rewrite.c>';
        $lines[] = 'RewriteEngine On';

        // 1) Pre-compressed .br / .gz twins (Brotli preferred, gzip fallback).
        foreach (['css' => 'text/css', 'js' => 'application/javascript', 'svg' => 'image/svg+xml'] as $ext => $mime) {
            $lines[] = "RewriteCond %{HTTP:Accept-Encoding} br";
            $lines[] = "RewriteCond %{REQUEST_FILENAME}.br -f";
            $lines[] = "RewriteRule \\.{$ext}$ %{REQUEST_URI}.br [L,T={$mime}]";
            $lines[] = "RewriteCond %{HTTP:Accept-Encoding} gzip";
            $lines[] = "RewriteCond %{REQUEST_FILENAME}.gz -f";
            $lines[] = "RewriteRule \\.{$ext}$ %{REQUEST_URI}.gz [L,T={$mime}]";
        }

        // 2) Immutable buckets: content-hashed cache dir + ?ver= assets.
        $lines[] = 'RewriteRule ^wp-content/cache/turbopress/ - [E=TP_IMMUTABLE:1]';
        $lines[] = 'RewriteCond %{QUERY_STRING} (^|&)(ver|v|rev)=[a-z0-9._-]+ [NC]';
        $lines[] = 'RewriteRule \.(css|js|woff2?)$ - [E=TP_IMMUTABLE:1]';

        // 3) Long-but-not-immutable TTL for all other first-party statics.
        $lines[] = 'RewriteRule \.(css|js|woff2?|ttf|eot|otf|svg|png|jpe?g|webp|avif|gif|ico|mp4|webm|mov)$ - [E=TP_STATIC:1]';
        $lines[] = '</IfModule>';

        $lines[] = '<IfModule mod_headers.c>';
        $lines[] = 'Header set Cache-Control "public, max-age=2592000" env=TP_STATIC';
        $lines[] = 'Header set Cache-Control "public, max-age=31536000, immutable" env=TP_IMMUTABLE';
        $lines[] = '</IfModule>';

        // 4) Output compression — only when LiteSpeed Cache doesn't own it.
        $litespeed = defined('LSCWP_V') || class_exists('\LiteSpeed_Cache');
        if (!$litespeed && (bool) self::config_get('htaccess.brotli_filters', true)) {
            $types = 'text/html text/css text/javascript application/javascript application/json application/manifest+json image/svg+xml text/xml application/xml application/rss+xml';
            $lines[] = '<IfModule mod_brotli.c>';
            $lines[] = 'AddOutputFilterByType BROTLI_COMPRESS ' . $types;
            $lines[] = '</IfModule>';
            $lines[] = '<IfModule mod_deflate.c>';
            $lines[] = 'AddOutputFilterByType DEFLATE ' . $types;
            $lines[] = '</IfModule>';
        }

        $lines[] = self::MARKER_END;
        return implode("\n", $lines) . "\n";
    }

    /**
     * Replace (or add/remove) the marker block inside htaccess content.
     */
    private static function replace_block(string $content, string $rules): string {
        $pattern = '/' . preg_quote(self::MARKER_BEGIN, '/') . '.*?' . preg_quote(self::MARKER_END, '/') . '\n?/s';
        if (preg_match($pattern, $content)) {
            $content = preg_replace($pattern, trim($rules) !== '' ? rtrim($rules) . "\n" : '', $content);
        } elseif (trim($rules) !== '') {
            $content = rtrim($content) . "\n\n" . rtrim($rules) . "\n";
        }
        // Never leave double blank-line runs at EOF.
        return preg_replace("/\n{3,}/", "\n\n", $content) ?? $content;
    }

    private static function loopback_ok(): bool {
        $url = add_query_arg('turbopress_htaccess_check', wp_rand(), home_url('/'));
        $response = wp_remote_get($url, [
            'timeout' => 8,
            'sslverify' => false,
            'headers' => ['Cache-Control' => 'no-cache'],
        ]);
        if (is_wp_error($response) || wp_remote_retrieve_response_code($response) !== 200) {
            return false;
        }
        $body = (string) wp_remote_retrieve_body($response);
        return strlen($body) > 255 && stripos($body, '</html') !== false;
    }

    private static function looks_like_apache(): bool {
        $server = strtolower($_SERVER['SERVER_SOFTWARE'] ?? '');
        return $server !== '' && (str_contains($server, 'apache') || str_contains($server, 'litespeed'));
    }

    private static function config_get(string $key, mixed $default = null): mixed {
        // Late-safe: Config loads itself; avoid circular construction issues
        // during activation by reading the stored option directly.
        $config = new Config();
        return $config->get($key, $default);
    }
}
