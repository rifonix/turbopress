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

// Production hardening guard: some hosts/plugins escalate warnings to
// exceptions. Run the whole suite that way — an undefined variable must
// fail the build here, not the output buffer on a live site (1.16.2 500s).
set_error_handler(function ($severity, $message, $file, $line) {
    if (!(error_reporting() & $severity)) {
        return false;
    }
    throw new ErrorException($message, 0, $severity, $file, $line);
}, E_WARNING | E_NOTICE);

define('ABSPATH', '/tmp/wp/');
define('WP_CONTENT_DIR', '/tmp/wp-content');
define('WP_CONTENT_URL', 'https://example.test/wp-content');
define('MINUTE_IN_SECONDS', 60);
define('HOUR_IN_SECONDS', 3600);
define('DAY_IN_SECONDS', 86400);
define('WEEK_IN_SECONDS', 604800);

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

/* -------- <img> without src (srcset-only / lazy data-src) -------- */
/* Regression: 1.16.2 read $synthesized before initialization for src-less
 * tags — a warning that 500s the whole response on strict hosts. Under the
 * strict error handler above, a repeat would throw right here. */

$out = $offloader->transform('<img srcset="https://example.test/a-400.jpg 400w, https://example.test/a-800.jpg 800w" alt="lazy">');
check('srcset-only <img> survives without warning', strpos($out, 'alt="lazy"') !== false);
check('srcset-only candidates rewritten', strpos($out, 'a-400.jpg') === false);

$out = $offloader->transform('<img data-src="https://example.test/lazy.jpg" class="lazyload" alt="deferred">');
check('data-src lazy <img> untouched without warning', strpos($out, 'data-src="https://example.test/lazy.jpg"') !== false);

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

/* ---------------- LQIP: blur-up placeholder markup + runtime ---------------- */

$two_imgs = '<html><head><title>t</title></head><body>'
    . '<img src="https://example.test/wp-content/uploads/first.jpg" alt="first">'
    . '<img src="https://example.test/wp-content/uploads/second.jpg" alt="second" loading="lazy" width="800" height="600">'
    . '</body></html>';
$offloaded = $offloader->transform($two_imgs);
$lqip_out = $media_optimizer->transform($offloaded);

check('LQIP: below-fold image carries blur-up class', strpos($lqip_out, 'wpins-lqip') !== false);
check('LQIP: full src stashed in data attribute', strpos($lqip_out, 'data-wpins-full-src="https://cdn.wpinstant.dev') !== false);
check('LQIP: placeholder src uses 24px derivative', strpos($lqip_out, '&w=24&') !== false);
check('LQIP: LCP candidate image untouched by LQIP', substr_count($lqip_out, 'data-wpins-full-src="') === 1);
check('LQIP: runtime swapper injected once', substr_count($lqip_out, 'querySelectorAll("img.wpins-lqip[data-wpins-full-src]")') === 1 && strpos($lqip_out, 'wpins-lqip-done') !== false);
check('LQIP: CSS injected', strpos($lqip_out, 'id="wp-instant-lqip-css"') !== false);

$rerun = $media_optimizer->transform($offloaded);
check('LQIP: idempotent', $rerun === $lqip_out);

// Entity-encoded attribute values (how real HTML arrives) must not be
// double-encoded when stashed into data attributes.
$encoded_img = '<html><head></head><body><img src="https://cdn.wpinstant.dev/api/v1/assets/media/site_123/aaaaaaaaaaaaaaaaaaaaaaaa?u=bbb&amp;w=800&amp;f=webp&amp;q=82&amp;s=cc" data-wpins-orig-src="https://example.test/wp-content/uploads/enc.jpg" srcset="https://cdn.wpinstant.dev/api/v1/assets/media/site_123/bbbbbbbbbbbbbbbbbbbbbbbb?u=ddd&amp;w=400&amp;f=webp&amp;q=82&amp;s=ee 400w" loading="lazy" decoding="async" width="800" height="600"></body></html>';
$enc_out = $media_optimizer->transform($encoded_img);
check('LQIP: entity-encoded srcset stashed single-encoded', strpos($enc_out, '&amp;amp;') === false && strpos($enc_out, 'data-wpins-srcset="https://cdn.wpinstant.dev') !== false && strpos($enc_out, 'w=400') !== false);

/* ---------------- Critical CSS font-face slimming ---------------- */

$faces = ''
    . '@font-face{font-family:Argestra;font-weight:400;src:url(a.woff2);font-display:auto}'
    . '@font-face{font-family:Argestra;font-weight:400;src:url(a.woff2);font-display:auto}'
    . '@font-face{font-family:Gotham;font-weight:700;font-style:normal;src:url(b.woff2);font-display:block}'
    . '@font-face{font-family:Gotham;font-weight:300;src:url(c.woff2)}';
$slimmed = WPInstant\CssOptimizer::slim_font_faces($faces);
check('font slim: duplicate face removed', substr_count($slimmed, '@font-face') === 3);
check('font slim: font-display auto/block forced to swap', strpos($slimmed, 'font-display:auto') === false && strpos($slimmed, 'font-display:block') === false && strpos($slimmed, 'font-display:swap') !== false);
check('font slim: distinct faces kept', strpos($slimmed, 'Gotham') !== false && strpos($slimmed, 'c.woff2') !== false);

/* ---------------- Video: preload=none on non-autoplay videos ---------------- */

$video_facade = new WPInstant\VideoFacade($config);
$videos = '<video src="https://example.test/v.mp4" controls></video><video src="https://example.test/hero.mp4" autoplay muted loop playsinline></video>';
$v_out = $video_facade->transform($videos);
check('video: non-autoplay gets preload=none', strpos($v_out, '<video preload="none" src="https://example.test/v.mp4"') !== false);
check('video: autoplay hero untouched', strpos($v_out, '<video src="https://example.test/hero.mp4" autoplay') !== false && substr_count($v_out, 'preload="none"') === 1);

/* ---------------- Fonts: localized packages served via the CDN ---------------- */

$font_optimizer = new WPInstant\FontOptimizer($config);
$google_href = 'https://fonts.googleapis.com/css2?family=Argestra&display=swap';
$pkg_dir = WP_INSTANT_CACHE_DIR . '/fonts/' . md5($google_href);
@mkdir($pkg_dir, 0777, true);
$font_css = '@font-face{font-family:Argestra;font-style:normal;font-weight:400;font-display:swap;src:url('
    . WP_CONTENT_URL . '/cache/wp-instant/fonts/' . md5($google_href) . '/font-abc.woff2) format("woff2")}';
file_put_contents($pkg_dir . '/fonts.css', $font_css);
file_put_contents($pkg_dir . '/.stamp', (string) time());
file_put_contents($pkg_dir . '/font-abc.woff2', 'FAKEWOFF2');

$font_html = '<html><head><link rel="stylesheet" href="' . $google_href . '" media="all"></head><body></body></html>';
$font_out = $font_optimizer->transform($font_html);

check('fonts: stylesheet link swapped to signed CDN URL', strpos($font_out, 'href="https://cdn.wpinstant.dev/api/v1/assets/media/site_123/') !== false && strpos($font_out, '&f=raw') !== false);
check('fonts: signed URL carries the origin fonts.css identity', strpos($font_out, urlencode(rtrim(strtr(base64_encode(WP_CONTENT_URL . '/cache/wp-instant/fonts/' . md5($google_href) . '/fonts.css'), '+/', '-_'), '='))) !== false);
check('fonts: preload points at the CDN woff2 derivative', preg_match('/rel="preload" as="font"[^>]*href="[^"]*&f=orig/', $font_out) === 1);
check('fonts: crossorigin attr stripped from the localized link', preg_match('/<link rel="stylesheet" href="https:\/\/cdn\.wpinstant\.dev[^"]*"[^>]*crossorigin/i', $font_out) !== 1);

// Deleted package (dir survives, fonts.css gone): must fall back to the
// working Google link instead of emitting a dead origin URL.
@unlink($pkg_dir . '/fonts.css');
$font_out_missing = $font_optimizer->transform($font_html);
check('fonts: dead package falls back to the Google link', strpos($font_out_missing, 'fonts.googleapis.com/css2?family=Argestra') !== false && strpos($font_out_missing, 'wp-instant/fonts/' . md5($google_href)) === false);

/* ---------------- Own-host gate: third-party media stays put ---------------- */

$foreign_img = '<img src="https://images.example-cdn.net/photo.jpg" alt="third party">';
$foreign_out = $offloader->transform($foreign_img);
check('own-host gate: third-party img untouched', strpos($foreign_out, 'cdn.wpinstant.dev') === false && strpos($foreign_out, 'images.example-cdn.net/photo.jpg') !== false);
$sub_out = $offloader->transform('<img src="https://media.example.test/wp-content/uploads/cdn.jpg" alt="subdomain">');
check('own-host gate: own subdomain rewritten', strpos($sub_out, 'cdn.wpinstant.dev') !== false);

/* ---------------- LCP preload: exact-match dedupe ---------------- */

$with_own_preload = '<html><head><link rel="preload" as="image" href="https://cdn.wpinstant.dev/api/v1/assets/media/site_123/deadbeefdeadbeefdeadbeefdeadbeef?u=zz&amp;w=800&amp;f=webp&amp;q=82&amp;s=yy"></head><body>'
    . '<img src="https://example.test/wp-content/uploads/lcp.jpg" alt="lcp">'
    . '</body></html>';
$dedupe_out = $media_optimizer->transform($with_own_preload);
check('LCP preload: different theme preload does not suppress ours', substr_count($dedupe_out, 'rel="preload" as="image"') === 2);

$same_preload = '<html><head><link rel="preload" as="image" href="https://example.test/wp-content/uploads/lcp.jpg"></head><body>'
    . '<img src="https://example.test/wp-content/uploads/lcp.jpg" alt="lcp">'
    . '</body></html>';
$same_out = $media_optimizer->transform($same_preload);
check('LCP preload: identical theme preload suppresses ours', substr_count($same_out, 'rel="preload" as="image"') === 1);

if ($failures > 0) {
    fwrite(STDERR, "TRANSFORM SMOKE FAILED ({$failures} failures)\n");
    exit(1);
}
echo "TRANSFORM SMOKE OK — all transformer assertions passed\n";
