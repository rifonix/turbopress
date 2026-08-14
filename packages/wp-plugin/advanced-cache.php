<?php
/**
 * Turbopress Advanced Cache Drop-In Engine
 * Provides sub-15ms static page delivery bypassing WordPress core execution.
 */

if (!defined('ABSPATH')) {
    exit;
}

// 1. Only cache GET and HEAD requests
$request_method = isset($_SERVER['REQUEST_METHOD']) ? strtoupper($_SERVER['REQUEST_METHOD']) : 'GET';
if ($request_method !== 'GET' && $request_method !== 'HEAD') {
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

// 4. Strip Tracking Query Parameters to maximize cache hits
$parsed_url = parse_url($request_uri);
$path = isset($parsed_url['path']) ? $parsed_url['path'] : '/';
$query = isset($parsed_url['query']) ? $parsed_url['query'] : '';

$clean_query = '';
if (!empty($query)) {
    parse_str($query, $params);
    $ignored_params = [
        'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content',
        'fbclid', 'gclid', '_ga', '_gl', 'mc_cid', 'mc_eid', 'msclkid', 'adgroupid', 'campaignid'
    ];
    foreach ($ignored_params as $ignored) {
        unset($params[$ignored]);
    }
    if (!empty($params)) {
        ksort($params);
        $clean_query = '?' . http_build_query($params);
    }
}

// Check Mobile Viewport Cache separation if enabled
$is_mobile = false;
$user_agent = isset($_SERVER['HTTP_USER_AGENT']) ? strtolower($_SERVER['HTTP_USER_AGENT']) : '';
if (
    strpos($user_agent, 'mobile') !== false ||
    strpos($user_agent, 'android') !== false ||
    strpos($user_agent, 'iphone') !== false ||
    strpos($user_agent, 'ipod') !== false
) {
    $is_mobile = true;
}

// 5. Construct Cache File Path
$cache_dir = WP_CONTENT_DIR . '/cache/turbopress/' . md5($http_host);
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

// Cache Miss: Let WordPress continue bootstrap and hit the Turbopress output buffer
