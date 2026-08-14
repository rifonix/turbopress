<?php
namespace Turbopress;

if (!defined('ABSPATH')) {
    exit;
}

class CacheRules {
    public static function should_cache_request(Config $config): bool {
        // 1. Only cache GET and HEAD
        $method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
        if ($method !== 'GET' && $method !== 'HEAD') {
            return false;
        }

        // 2. Bypass if user is logged in
        if (is_user_logged_in()) {
            return false;
        }

        // 3. Bypass if search query or 404
        if (is_search() || is_404()) {
            return false;
        }

        // 4. Bypass if post requires password
        if (post_password_required()) {
            return false;
        }

        // 5. Check URL exclusions
        $uri = $_SERVER['REQUEST_URI'] ?? '/';
        $excluded_urls = (array) $config->get('caching.excluded_urls', []);
        foreach ($excluded_urls as $pattern) {
            $pattern_regex = '#^' . str_replace('\*', '.*', preg_quote($pattern, '#')) . '$#i';
            if (preg_match($pattern_regex, $uri)) {
                return false;
            }
        }

        // 6. Check Cookie exclusions (e.g. WooCommerce cart)
        if (!empty($_COOKIE)) {
            $excluded_cookies = (array) $config->get('caching.excluded_cookies', []);
            foreach ($_COOKIE as $cookie_name => $val) {
                foreach ($excluded_cookies as $pattern) {
                    $pattern_regex = '#^' . str_replace('\*', '.*', preg_quote($pattern, '#')) . '$#i';
                    if (preg_match($pattern_regex, $cookie_name)) {
                        return false;
                    }
                }
            }
        }

        return true;
    }
}
