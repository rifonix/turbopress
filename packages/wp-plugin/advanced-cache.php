<?php
/**
 * Turbopress Advanced Cache Drop-In Engine
 * Provides sub-15ms static page delivery bypassing WordPress core execution.
 *
 * SELF-CONTAINED BY DESIGN: this file is copied to wp-content/advanced-cache.php
 * and executes before WordPress loads the plugin. It therefore must not
 * depend on any plugin class, WP function, or database access. The cache key
 * rules (host hashing, ignored query params, mobile UA sniff, page path)
 * MUST stay byte-compatible with Turbopress\CacheManager.
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
if (!empty($_SERVER['HTTP_X_TURBOPRESS_REVALIDATE'])) {
    return;
}

// 2. Bypass for Logged-In Users & Password-Protected Posts
if (!empty($_COOKIE)) {
    foreach ($_COOKIE as $key => $val) {
        if (
            strpos($key, 'wordpress_logged_in_') === 0 ||
            strpos($key, 'wp-postpass_') === 0 ||
            strpos($key, 'comment_author_') === 0
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

$turbopress_ignored_params = [
    'utm_*', 'fbclid', 'gclid', '_ga', '_gl', 'mc_cid', 'mc_eid',
    'msclkid', 'adgroupid', 'campaignid', 'vgo_ee',
];

$clean_query = '';
if (!empty($query)) {
    parse_str($query, $params);
    foreach ($turbopress_ignored_params as $ignored) {
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
$cache_dir = WP_CONTENT_DIR . '/cache/turbopress/pages/' . md5($http_host);
$url_hash = md5($path . $clean_query . ($is_mobile ? '_mobile' : '_desktop'));
$cache_file = $cache_dir . '/' . substr($url_hash, 0, 2) . '/' . $url_hash . '.html';

// 6. Check if Cache File Exists and is Fresh (e.g. 7 days TTL)
if (file_exists($cache_file)) {
    $file_mtime = filemtime($cache_file);
    if ((time() - $file_mtime) < 604800) {
        $accept_encoding = isset($_SERVER['HTTP_ACCEPT_ENCODING']) ? $_SERVER['HTTP_ACCEPT_ENCODING'] : '';

        header('Content-Type: text/html; charset=UTF-8');
        header('X-Turbopress-Cache: HIT');
        header('X-Turbopress-Device: ' . ($is_mobile ? 'mobile' : 'desktop'));
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
        header('X-Turbopress-Cache: STALE');
        header('X-Turbopress-Device: ' . ($is_mobile ? 'mobile' : 'desktop'));
        // no-cache: host-level proxies (LiteSpeed etc.) must not pin the
        // stale copy; the fresh entry lands within a minute.
        header('Cache-Control: no-cache, must-revalidate');

        // Fire-and-forget beacon: the REST endpoint throttles per path and
        // performs a non-blocking loopback render.
        $tp_beacon = '<script tp-exclude>(function(){try{navigator.sendBeacon('
            . 'location.origin + "/wp-json/turbopress/v1/revalidate",'
            . 'JSON.stringify({p: location.pathname + location.search})'
            . ');}catch(e){}})();</script>';
        if (stripos($stale_html, '</body>') !== false) {
            $stale_html = str_ireplace('</body>', $tp_beacon . '</body>', $stale_html);
        }
        echo $stale_html;
        exit;
    }
    @unlink($stale_file); // corrupt/oversized stale entry — drop it
}

// Cache Miss: Let WordPress continue bootstrap and hit the Turbopress output buffer
