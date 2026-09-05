<?php
/**
 * WP Instant Advanced Cache Drop-In Engine
 * Provides sub-15ms static page delivery bypassing WordPress core execution.
 *
 * SELF-CONTAINED BY DESIGN: this file is copied to wp-content/advanced-cache.php
 * and executes before WordPress loads the plugin. It therefore must not
 * depend on any plugin class, WP function, or database access. The cache key
 * rules (host hashing, ignored query params, mobile UA sniff, page path)
 * MUST stay byte-compatible with WPInstant\CacheManager.
 */

if (!defined('ABSPATH')) {
    exit;
}

// 1. Only cache GET and HEAD requests
$request_method = isset($_SERVER['REQUEST_METHOD']) ? strtoupper($_SERVER['REQUEST_METHOD']) : 'GET';
if ($request_method !== 'GET' && $request_method !== 'HEAD') {
    return;
}

// 1b. Revalidation loopback: skip serving so WordPress re-renders the page
// and writes a fresh cache entry (the fresh write also removes .stale twins).
if (!empty($_SERVER['HTTP_X_WP_INSTANT_REVALIDATE'])) {
    return;
}

// 1c. Edge extractor bypass: the optimization pipeline must see the RAW
// origin page, never our own transformed/cached output (circular extraction
// drops JS-rendered elements and their ::before/::after rules, and skews
// LCP). The flag is appended by the edge extractor since v1.11.0.
if (isset($_GET['wp_instant_extract'])) {
    return;
}

// 1b2. Rules manifest: written by the plugin on every config save so this
// drop-in (which runs before WordPress, no DB access) honors the SAME cache
// keys, TTL, and cookie exclusions as the plugin write side. Defaults below
// are the factory config; drift is impossible once rules.json exists.
$wpins_rules = [];
$wpins_rules_file = WP_CONTENT_DIR . '/cache/wp-instant/rules.json';
if (file_exists($wpins_rules_file)) {
    $wpins_decoded = json_decode((string) @file_get_contents($wpins_rules_file), true);
    if (is_array($wpins_decoded)) {
        $wpins_rules = $wpins_decoded;
    }
}
$wpins_ttl = isset($wpins_rules['ttl']) ? (int) $wpins_rules['ttl'] : 604800;

// Master switches from the manifest. Absent keys in legacy manifests mean
// the feature predates them — treat as enabled/live for back-compat.
if (array_key_exists('enabled', $wpins_rules) && !$wpins_rules['enabled']) {
    return;
}
if (
    array_key_exists('deployment_status', $wpins_rules) &&
    $wpins_rules['deployment_status'] !== 'live'
) {
    return;
}

// 2. Bypass for Logged-In Users, Password-Protected Posts & WooCommerce sessions
$wpins_cookie_rules = array_key_exists('excluded_cookies', $wpins_rules)
    ? (array) $wpins_rules['excluded_cookies']
    : ['wordpress_logged_in_*', 'wp-postpass_*', 'comment_author_*', 'wp_woocommerce_session_*', 'woocommerce_items_in_cart', 'woocommerce_cart_hash', 'woocommerce_recently_viewed'];
if (!empty($_COOKIE)) {
    foreach ($_COOKIE as $key => $val) {
        foreach ($wpins_cookie_rules as $rule) {
            $rule = (string) $rule;
            $prefix = rtrim($rule, '*');
            if ($prefix === '') {
                continue;
            }
            $matches = (substr($rule, -1) === '*') ? strpos($key, $prefix) === 0 : $key === $rule;
            if ($matches) {
                return;
            }
        }
    }
}

// 3. Normalize Host and URI
$http_host = isset($_SERVER['HTTP_HOST']) ? strtolower($_SERVER['HTTP_HOST']) : '';
$request_uri = isset($_SERVER['REQUEST_URI']) ? $_SERVER['REQUEST_URI'] : '/';

// Bypass WP Admin and REST/AJAX
if (
    strpos($request_uri, '/wp-admin/') !== false ||
    strpos($request_uri, '/wp-login.php') !== false ||
    strpos($request_uri, '/wp-json/') !== false ||
    strpos($request_uri, 'xmlrpc.php') !== false
) {
    return;
}

// 3b. URL policies from the manifest (same wildcard semantics as CacheRules):
// an optimize-only allowlist, then hard exclusions. Absent keys in legacy
// manifests mean no restriction.
$wpins_rule_matches = static function (array $patterns, string $uri): bool {
    foreach ($patterns as $pattern) {
        $pattern = (string) $pattern;
        if ($pattern === '') {
            continue;
        }
        $regex = '#^' . str_replace('\\*', '.*', preg_quote($pattern, '#')) . '$#i';
        if (preg_match($regex, $uri)) {
            return true;
        }
    }
    return false;
};
$wpins_only_urls = array_key_exists('optimize_only_urls', $wpins_rules)
    ? (array) $wpins_rules['optimize_only_urls']
    : [];
if ($wpins_only_urls !== [] && !$wpins_rule_matches($wpins_only_urls, $request_uri)) {
    return;
}
if (
    array_key_exists('excluded_urls', $wpins_rules) &&
    $wpins_rule_matches((array) $wpins_rules['excluded_urls'], $request_uri)
) {
    return;
}

// 4. Strip Tracking Query Parameters to maximize cache hits.
// Supports "utm_*" style wildcard prefixes exactly like the plugin side.
$parsed_url = parse_url($request_uri);
$path = isset($parsed_url['path']) ? $parsed_url['path'] : '/';
$query = isset($parsed_url['query']) ? $parsed_url['query'] : '';

$wp_instant_ignored_params = array_key_exists('strip_query_params', $wpins_rules)
    ? (array) $wpins_rules['strip_query_params']
    : [
        'utm_*', 'fbclid', 'gclid', '_ga', '_gl', 'mc_cid', 'mc_eid',
        'msclkid', 'adgroupid', 'campaignid', 'vgo_ee',
    ];

$clean_query = '';
if (!empty($query)) {
    parse_str($query, $params);
    foreach ($wp_instant_ignored_params as $ignored) {
        $ignored = rtrim($ignored, '*');
        if ($ignored === '') {
            continue;
        }
        foreach (array_keys($params) as $param_key) {
            if (strpos($param_key, $ignored) === 0) {
                unset($params[$param_key]);
            }
        }
    }
    if (!empty($params)) {
        ksort($params);
        $clean_query = '?' . http_build_query($params);
    }
}

// Mobile / desktop cache separation (must match CacheManager::ua_is_mobile).
// Separate mobile entries only exist while the writer has mobile_cache on;
// with it off, CacheManager writes unified '_desktop' keys for everyone and
// this drop-in must compute the SAME key. An absent manifest key means the
// factory default: on.
$wpins_mobile_cache = !array_key_exists('mobile_cache', $wpins_rules) || (bool) $wpins_rules['mobile_cache'];
$is_mobile = false;
$user_agent = isset($_SERVER['HTTP_USER_AGENT']) ? strtolower($_SERVER['HTTP_USER_AGENT']) : '';
if ($wpins_mobile_cache && preg_match('/mobile|android|iphone|ipod|windows phone/i', $user_agent)) {
    $is_mobile = true;
}

// 5. Construct Cache File Path (pages subtree only — CSS/fonts survive purges)
$cache_dir = WP_CONTENT_DIR . '/cache/wp-instant/pages/' . md5($http_host);
$url_hash = md5($path . $clean_query . ($is_mobile ? '_mobile' : '_desktop'));
$cache_file = $cache_dir . '/' . substr($url_hash, 0, 2) . '/' . $url_hash . '.html';

// 6. Check if Cache File Exists and is Fresh (TTL from rules.json, default 7d)
if (file_exists($cache_file)) {
    $file_mtime = filemtime($cache_file);
    if ((time() - $file_mtime) < $wpins_ttl) {
        $accept_encoding = isset($_SERVER['HTTP_ACCEPT_ENCODING']) ? $_SERVER['HTTP_ACCEPT_ENCODING'] : '';

        header('Content-Type: text/html; charset=UTF-8');
        header('X-WP-Instant-Cache: HIT');
        header('X-WP-Instant-Device: ' . ($is_mobile ? 'mobile' : 'desktop'));
        header('Cache-Control: public, max-age=3600, stale-while-revalidate=86400');

        // Check for pre-compressed Brotli or Gzip
        if (strpos($accept_encoding, 'br') !== false && file_exists($cache_file . '.br')) {
            header('Content-Encoding: br');
            header('Vary: Accept-Encoding');
            readfile($cache_file . '.br');
            exit;
        } elseif (strpos($accept_encoding, 'gzip') !== false && file_exists($cache_file . '.gz')) {
            header('Content-Encoding: gzip');
            header('Vary: Accept-Encoding');
            readfile($cache_file . '.gz');
            exit;
        }

        readfile($cache_file);
        exit;
    }
}

// 7. Stale-while-revalidate: a soft purge renames entries to `.stale`.
// Serve the stale copy (capped at 24h) and ask the browser to trigger an
// async revalidation — visitors never pay the purge -> miss -> slow-render
// cost.
$stale_file = $cache_file . '.stale';
if (file_exists($stale_file) && (time() - filemtime($stale_file)) < 86400) {
    $stale_html = @file_get_contents($stale_file);
    if ($stale_html !== false && strlen($stale_html) > 255) {
        header('Content-Type: text/html; charset=UTF-8');
        header('X-WP-Instant-Cache: STALE');
        header('X-WP-Instant-Device: ' . ($is_mobile ? 'mobile' : 'desktop'));
        // no-cache: host-level proxies (LiteSpeed etc.) must not pin the
        // stale copy; the fresh entry lands within a minute.
        header('Cache-Control: no-cache, must-revalidate');

        // Fire-and-forget beacon: the REST endpoint throttles per path and
        // performs a non-blocking loopback render.
        $wpins_beacon = '<script wpins-exclude>(function(){try{navigator.sendBeacon('
            . 'location.origin + "/wp-json/wp-instant/v1/revalidate",'
            . 'JSON.stringify({p: location.pathname + location.search})'
            . ');}catch(e){}})();</script>';
        if (stripos($stale_html, '</body>') !== false) {
            $stale_html = str_ireplace('</body>', $wpins_beacon . '</body>', $stale_html);
        }
        echo $stale_html;
        exit;
    }
    @unlink($stale_file); // corrupt/oversized stale entry — drop it
}

// Cache Miss: Let WordPress continue bootstrap and hit the WP Instant output buffer
