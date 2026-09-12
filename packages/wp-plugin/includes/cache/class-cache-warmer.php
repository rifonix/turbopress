<?php
namespace WPInstant;

if (!defined('ABSPATH')) {
    exit;
}

/**
 * Post-purge cache warmer: re-renders purged URLs in the background so
 * visitors never pay the purge -> cold-PHP cost.
 *
 * Flow: CachePurger::flush_queue() (and dashboard purge/config pushes)
 * hand over the exact URLs they invalidated. The warmer persists them in a
 * bounded option queue and renders them via loopbacks carrying
 * X-WP-Instant-Revalidate (the same header the stale-revalidate beacon
 * uses), so the drop-in steps aside and WordPress writes fresh entries —
 * desktop and mobile variants when the mobile cache is on.
 *
 * Bounded by design: 40 queued URLs max, 6 renders per cron run, remainder
 * rescheduled. Failures are dropped, never retried — the next visitor or
 * the next purge re-queues.
 */
class CacheWarmer {
    public const HOOK = 'wp_instant_cache_warm';

    private const QUEUE_OPTION = 'wp_instant_warm_queue';
    private const MAX_QUEUED = 40;
    private const PER_RUN = 6;

    private const DESKTOP_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';
    private const MOBILE_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

    /** Queue arbitrary frontend URLs for warming (deduped, capped). */
    public static function queue(array $urls): void {
        $clean = [];
        foreach ($urls as $url) {
            $url = is_string($url) ? trim($url) : '';
            if ($url === '' || !preg_match('#^https?://#i', $url)) {
                continue;
            }
            // Same-site only: never let a purge queue turn into an SSRF-ish
            // crawler pointed at foreign hosts.
            $home_host = strtolower((string) parse_url(home_url(), PHP_URL_HOST));
            $host = strtolower((string) parse_url($url, PHP_URL_HOST));
            if ($home_host === '' || ($host !== $home_host && !str_ends_with($host, '.' . $home_host))) {
                continue;
            }
            // Strip fragments; drop wp-admin/login/rest targets defensively.
            $url = explode('#', $url)[0];
            $path = strtolower((string) parse_url($url, PHP_URL_PATH));
            if (
                str_contains($path, '/wp-admin/') || str_contains($path, 'wp-login.php')
                || str_contains($path, '/wp-json/') || str_contains($path, 'xmlrpc.php')
            ) {
                continue;
            }
            $clean[md5($url)] = $url;
        }
        if ($clean === []) {
            return;
        }

        $queue = get_option(self::QUEUE_OPTION, []);
        if (!is_array($queue)) {
            $queue = [];
        }
        foreach ($clean as $key => $url) {
            $queue[$key] = $url;
        }
        if (count($queue) > self::MAX_QUEUED) {
            $queue = array_slice($queue, -self::MAX_QUEUED, null, true);
        }
        update_option(self::QUEUE_OPTION, $queue, false);
        self::schedule();
    }

    /** Queue the front page (+ blog archive) — used after full purges. */
    public static function queue_homepage(): void {
        $urls = [home_url('/')];
        $page_for_posts = (int) get_option('page_for_posts', 0);
        if ($page_for_posts > 0) {
            $blog_url = get_permalink($page_for_posts);
            if (is_string($blog_url) && $blog_url !== '') {
                $urls[] = $blog_url;
            }
        }
        self::queue($urls);
    }

    private static function schedule(): void {
        if (function_exists('wp_next_scheduled') && !wp_next_scheduled(self::HOOK)) {
            wp_schedule_single_event(time() + 20, self::HOOK, []);
        }
        // Nudge WP-Cron so warming starts in seconds on traffic-driven
        // cron, not at the next unrelated visit.
        if (function_exists('spawn_cron')) {
            spawn_cron();
        }
    }

    /** Cron worker: render a bounded batch, reschedule on remainder. */
    public static function run(): void {
        $queue = get_option(self::QUEUE_OPTION, []);
        if (!is_array($queue) || $queue === []) {
            return;
        }

        $config = new Config();
        if (!(bool) $config->get('caching.enabled', true) || !(bool) $config->get('caching.warm_after_purge', true)) {
            update_option(self::QUEUE_OPTION, [], false);
            return;
        }
        $mobile_cache = (bool) $config->get('caching.mobile_cache', true);

        $batch = array_slice($queue, 0, self::PER_RUN, true);
        $rest = array_diff_key($queue, $batch);
        update_option(self::QUEUE_OPTION, array_values($rest), false);

        foreach ($batch as $url) {
            self::render($url, self::DESKTOP_UA);
            if ($mobile_cache) {
                self::render($url, self::MOBILE_UA);
            }
        }

        if ($rest !== [] && function_exists('wp_schedule_single_event')) {
            wp_schedule_single_event(time() + 30, self::HOOK, []);
            if (function_exists('spawn_cron')) {
                spawn_cron();
            }
        }
    }

    /**
     * Blocking loopback render in cron context (background process, so
     * waiting is safe). The revalidate header makes the drop-in step aside;
     * the output-buffer pipeline renders + writes the cache entry.
     */
    private static function render(string $url, string $user_agent): void {
        if (!function_exists('wp_remote_get')) {
            return;
        }
        try {
            wp_remote_get($url, [
                'timeout' => 25,
                'redirection' => 2,
                'user-agent' => $user_agent,
                'headers' => [
                    'X-WP-Instant-Revalidate' => '1',
                    'Cache-Control' => 'no-cache',
                ],
            ]);
        } catch (\Throwable) {
            // Best-effort: failures drop out of the queue.
        }
    }
}
