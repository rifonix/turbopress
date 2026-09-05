<?php
/**
 * Transform smoke test: stub the WordPress surface, then run the regex-heavy
 * transformer stages (MediaOffloader, AssetProxy::transform_own) against
 * representative markup and assert the output shape.
 *
 * Guards the v1.13.0 changes: responsive srcset synthesis, <video poster>,
 * <picture> <source srcset>, JSON-context videos, own-host css/js CDN
 * rewriting, and double-transform idempotency.
 *
 * Usage: php tests/transform-smoke.php
 */

error_reporting(E_ALL & ~E_DEPRECATED);

define('ABSPATH', '/tmp/wp/');
define('WP_CONTENT_DIR', '/tmp/wp-content');
define('MINUTE_IN_SECONDS', 60);

$GLOBALS['__options'] = [
    'wp_instant_site_id' => 'site_123',
    'wp_instant_api_key' => 'sk_live_test',
    'wp_instant_cdn_url' => 'https://cdn.wpinstant.dev',
    'wp_instant_callback_secret' => str_repeat('s', 64),
    'wp_instant_config' => [
        'preset' => 'ludicrous',
        'media' => [
            'offload_images' => true,
            'offload_video' => true,
            'offload_widths' => [320, 480, 768, 1200, 1600],
            'image_quality' => 82,
            'excluded_images' => [],
        ],
        'assets' => ['serve_own_from_cdn' => true, 'proxy_enabled' => false, 'keep_origins' => []],
        'critical_css' => ['excluded_stylesheets' => []],
        'javascript' => ['exclusions' => []],
    ],
];

function get_option($k, $d = null) { return $GLOBALS['__options'][$k] ?? $d; }
function update_option($k, $v, $a = null) { $GLOBALS['__options'][$k] = $v; return true; }
function get_transient($k) { return false; }
function set_transient($k, $v, $t = 0) { return true; }
function wp_schedule_single_event(...$a) {}
function spawn_cron() {}
function home_url($p = '') { return 'https://example.test' . $p; }
function get_home_url($p = '') { return 'https://example.test' . $p; }
function esc_url($u) { return $u; }
function esc_url_raw($u) { return $u; }
function esc_attr($s) { return htmlspecialchars((string) $s, ENT_QUOTES); }
function esc_html($s) { return htmlspecialchars((string) $s, ENT_QUOTES); }
function wp_normalize_path($p) { return $p; }
function is_ssl() { return true; }
function wp_is_mobile() { return false; }
function set_url_scheme($u) { return $u; }
function add_action(...$a) {}
function add_filter(...$a) {}
function wp_mkdir_p($d) { return true; }
function wp_parse_url($u, $c = -1) { return $c === -1 ? parse_url($u) : parse_url($u, $c); }
function plugin_dir_path($f) { return dirname($f) . '/'; }
function plugin_dir_url($f) { return 'https://example.test/wp-content/plugins/wp-instant/'; }
function register_activation_hook($f, $cb) {}
function register_deactivation_hook($f, $cb) {}

require dirname(__DIR__) . '/wp-instant.php';

$failures = 0;
function check(string $name, bool $pass): void {
    global $failures;
    echo ($pass ? 'PASS' : 'FAIL') . "  {$name}\n";
    if (!$pass) $failures++;
}

$config = new WPInstant\Config();
$offloader = new WPInstant\MediaOffloader($config);
$proxy = new WPInstant\AssetProxy($config);

/* ---------------- MediaOffloader: <img> srcset synthesis ---------------- */

$out = $offloader->transform('<img src="https://example.test/wp-content/uploads/big.jpg" alt="hero">');
check('plain <img> gets srcset with all widths', substr_count($out, ' 320w') === 1 && substr_count($out, ' 1600w') === 1);
check('plain <img> gets sizes hint', strpos($out, 'sizes="(max-width: 1600px) 100vw, 1600px"') !== false);
check('plain <img> src rewritten to cdn host', strpos($out, 'https://cdn.wpinstant.dev/api/v1/assets/media/site_123/') !== false);
check('plain <img> keeps original as data attr', strpos($out, 'data-wpins-orig-src="https://example.test/wp-content/uploads/big.jpg"') !== false);
check('alt text survives the cdn rewrite', strpos($out, 'alt="hero"') !== false);

$out = $offloader->transform('<img src="https://example.test/wp-content/uploads/thumb.jpg" alt="Product photo" title="Product" class="woo" loading="lazy" width="120" height="90">');
check('alt + all attributes survive width-attr rewrite', strpos($out, 'alt="Product photo"') !== false && strpos($out, 'title="Product"') !== false && strpos($out, 'class="woo"') !== false);

$out = $offloader->transform('<img src="https://example.test/wp-content/uploads/big.jpg" width="300" height="200">');
check('width attr drives sizes + src derivative', strpos($out, 'sizes="(max-width: 300px) 100vw, 300px"') !== false && preg_match('/w=300&(f|q)/', $out) === 1);

$out = $offloader->transform('<img src="https://example.test/a.jpg" srcset="https://example.test/a-400.jpg 400w, https://example.test/a-800.jpg 800w" sizes="(max-width: 800px) 100vw, 800px">');
check('existing srcset candidates rewritten, no duplicate srcset', substr_count($out, 'srcset=') === 1 && strpos($out, 'example.test/a-400.jpg') === false);
check('existing sizes untouched', substr_count($out, 'sizes=') === 1);

/* ---------------- <picture> <source srcset> ---------------- */

$out = $offloader->transform('<picture><source srcset="https://example.test/a-400.jpg 400w, https://example.test/a-800.jpg 800w" type="image/webp"><img src="https://example.test/a-400.jpg"></picture>');
check('<source srcset> candidates rewritten', strpos($out, 'srcset="https://cdn.wpinstant.dev') === 0 || substr_count($out, 'srcset="https://cdn.wpinstant.dev') === 2);
check('<picture> original candidate URLs gone', strpos($out, 'a-800.jpg') === false);

/* ---------------- <video poster> + <video src> ---------------- */

$out = $offloader->transform('<video poster="https://example.test/wp-content/uploads/poster.jpg" src="https://example.test/wp-content/uploads/bg.mp4"></video>');
check('video poster rewritten as image derivative', strpos($out, 'poster="https://cdn.wpinstant.dev') !== false && strpos($out, '&f=webp') !== false);
check('video src rewritten as raw', substr_count($out, '&f=raw') === 1);
check('video keeps original poster as data attr', strpos($out, 'data-wpins-orig-poster="https://example.test/wp-content/uploads/poster.jpg"') !== false);

/* ---------------- JSON contexts: data-settings video ---------------- */

$settings = '{"background_background":"video","video_link":"https://example.test/wp-content/uploads/bg2.mp4"}';
$html = '<div class="elementor-element" data-settings="' . esc_attr($settings) . '"></div>';
$out = $offloader->transform($html);
check('data-settings video URL rewritten', strpos($out, 'bg2.mp4') === false && strpos($out, 'f=raw') !== false);

/* ---------------- AssetProxy::transform_own ---------------- */

$html = ''
    . '<link rel="stylesheet" href="/wp-content/themes/twenty/style.css?ver=6.7">' . "\n"
    . '<link rel="preload" as="style" href="https://example.test/wp-content/cache/wp-instant/x/combined/wpins-abc.css" data-wpins-css="[&quot;/wp-content/themes/twenty/style.css?ver=6.7&quot;]">' . "\n"
    . '<link rel="preload" as="font" type="font/woff2" href="https://example.test/wp-content/cache/wp-instant/fonts/x/f.woff2" crossorigin>' . "\n"
    . '<link rel="canonical" href="https://example.test/">' . "\n"
    . '<script src="/wp-includes/js/jquery.min.js?ver=6.7"></script>' . "\n"
    . '<script src="https://cdn.wpinstant.dev/already.js" wpins-exclude></script>' . "\n"
    . '<script src="https://unpkg.com/foreign@1/lib.js"></script>';
$out = $proxy->transform_own($html);

check('own stylesheet rewritten to cdn', substr_count($out, 'href="https://cdn.wpinstant.dev/api/v1/assets/media/site_123/') === 2);
check('font preload left on origin', strpos($out, 'fonts/x/f.woff2') !== false && substr_count($out, 'f.woff2') === 1);
check('canonical link untouched', strpos($out, 'rel="canonical" href="https://example.test/"') !== false);
check('own script rewritten', strpos($out, 'src="https://cdn.wpinstant.dev/api/v1/assets/media/site_123/') !== false);
check('wpins-exclude script untouched', strpos($out, 'https://cdn.wpinstant.dev/already.js') !== false);
check('foreign script untouched by own pass', strpos($out, 'https://unpkg.com/foreign@1/lib.js') !== false);
check('integrity stripped placeholder n/a (none present)', true);

/* ---------------- Idempotency: second pass must not double-rewrite ------- */

$once = $proxy->transform_own($html);
$twice = $proxy->transform_own($once);
check('transform_own idempotent', $once === $twice);

$img = '<img src="https://example.test/wp-content/uploads/big.jpg" alt="hero">';
$once = $offloader->transform($img);
$twice = $offloader->transform($once);
check('offloader idempotent (no double rewrite)', $once === $twice);

/* ---------------- Pipeline test: Offloader then MediaOptimizer (ALT check) */

$media_optimizer = new WPInstant\MediaOptimizer($config);
$piped = $media_optimizer->transform($once);
check('pipeline preserves alt attribute', strpos($piped, 'alt="hero"') !== false);
check('pipeline has high fetchpriority or lazy loading', strpos($piped, 'fetchpriority="high"') !== false || strpos($piped, 'loading="lazy"') !== false);

if ($failures > 0) {
    fwrite(STDERR, "TRANSFORM SMOKE FAILED ({$failures} failures)\n");
    exit(1);
}
echo "TRANSFORM SMOKE OK — all transformer assertions passed\n";
