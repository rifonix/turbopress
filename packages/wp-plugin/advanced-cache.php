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

// 2. Bypass for Logged-In Users, Password-Protected Posts & WooCommerce sessions
if (!empty($_COOKIE)) {
    foreach ($_COOKIE as $key => $val) {
        if (
            strpos($key, 'wordpress_logged_in_') === 0 ||
            strpos($key, 'wp-postpass_') === 0 ||
            strpos($key, 'comment_author_') === 0 ||
            strpos($key, 'wp_woocommerce_session_') === 0 ||
            $key === 'woocommerce_items_in_cart' ||
            $key === 'woocommerce_cart_hash' ||
            $key === 'woocommerce_recently_viewed'
        ) {
            return;
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

// 4. Strip Tracking Query Parameters to maximize cache hits.
// Supports "utm_*" style wildcard prefixes exactly like the plugin side.
$parsed_url = parse_url($request_uri);
$path = isset($parsed_url['path']) ? $parsed_url['path'] : '/';
$query = isset($parsed_url['query']) ? $parsed_url['query'] : '';

$wp_instant_ignored_params = [
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

// Mobile / desktop cache separation (must match CacheManager::ua_is_mobile)
$is_mobile = false;
$user_agent = isset($_SERVER['HTTP_USER_AGENT']) ? strtolower($_SERVER['HTTP_USER_AGENT']) : '';
if (preg_match('/mobile|android|iphone|ipod|windows phone/i', $user_agent)) {
    $is_mobile = true;
}

// 5. Construct Cache File Path (pages subtree only — CSS/fonts survive purges)
$cache_dir = WP_CONTENT_DIR . '/cache/wp-instant/pages/' . md5($http_host);
$url_hash = md5($path . $clean_query . ($is_mobile ? '_mobile' : '_desktop'));
$cache_file = $cache_dir . '/' . substr($url_hash, 0, 2) . '/' . $url_hash . '.html';

// Mobile fallback: when caching.mobile_cache is disabled, CacheManager writes
// unified pages under '_desktop'. If '_mobile' does not exist, fallback to '_desktop'
// so mobile visitors hit the unified cache instead of suffering 100% cache misses.
if (!file_exists($cache_file) && !file_exists($cache_file . '.stale') && $is_mobile) {
    $desktop_hash = md5($path . $clean_query . '_desktop');
    $desktop_file = $cache_dir . '/' . substr($desktop_hash, 0, 2) . '/' . $desktop_hash . '.html';
    if (file_exists($desktop_file) || file_exists($desktop_file . '.stale')) {
        $url_hash = $desktop_hash;
        $cache_file = $desktop_file;
    }
}

// 6. Check if Cache File Exists and is Fresh (e.g. 7 days TTL)
if (file_exists($cache_file)) {
    $file_mtime = filemtime($cache_file);
    if ((time() - $file_mtime) < 604800) {
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
