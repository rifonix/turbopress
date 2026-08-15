<?php
namespace Turbopress;

if (!defined('ABSPATH')) {
    exit;
}

/**
 * RUM telemetry: receives the ~1KB beacon injected by DomEngine on every
 * optimized pageview, keeps 24h rolling hour buckets in rum.json, aggregates
 * to daily per-mode summaries and pushes them to the SaaS edge so the
 * dashboard (and AutoDegrade) can act on real visitor error rates.
 */
class Telemetry {
    private const ROUTE_NAMESPACE = 'turbopress/v1';
    private const MAX_ERRORS_PER_BEACON = 5;
    private const MAX_SAMPLES = 50;
    private const HOUR_RETENTION = 25;

    public static function register_routes(): void {
        add_action('rest_api_init', static function (): void {
            register_rest_route(self::ROUTE_NAMESPACE, '/telemetry', [
                'methods' => 'POST',
                'permission_callback' => '__return_true',
                'callback' => [self::class, 'handle_beacon'],
            ]);
        });
    }

    /**
     * Beacon shape: {m:{mode,version,preview}, e:[{m,f}], l:<lcp ms>, c:<cls>, p:<path>}
     */
    public static function handle_beacon(\WP_REST_Request $request) {
        $payload = json_decode($request->get_body(), true);
        if (!is_array($payload) || !is_array($payload['m'] ?? null)) {
            return new \WP_REST_Response(['success' => false], 400);
        }

        $modes = ['none', 'defer', 'interaction_delay'];
        $mode = (string) ($payload['m']['mode'] ?? '');
        if (!in_array($mode, $modes, true)) {
            return new \WP_REST_Response(['success' => false], 400);
        }

        $path = self::clamp_string((string) ($payload['p'] ?? '/'), 120, '/');
        $lcp = self::clamp_int((int) ($payload['l'] ?? 0), 0, 60000);
        $cls = self::clamp_float((float) ($payload['c'] ?? 0), 0, 1);

        $errors = [];
        if (is_array($payload['e'] ?? null)) {
            foreach (array_slice($payload['e'], 0, self::MAX_ERRORS_PER_BEACON) as $err) {
                if (!is_array($err)) {
                    continue;
                }
                $errors[] = [
                    'm' => self::clamp_string((string) ($err['m'] ?? ''), 140, ''),
                    'f' => self::clamp_string((string) ($err['f'] ?? ''), 80, ''),
                ];
            }
        }

        self::record($mode, $path, $lcp, $cls, $errors);

        return new \WP_REST_Response(['success' => true]);
    }

    private static function rum_path(): string {
        $host = strtolower((string) (parse_url(home_url(), PHP_URL_HOST) ?: 'localhost'));
        $dir = TURBOPRESS_CACHE_DIR . '/' . md5($host);
        if (!is_dir($dir)) {
            wp_mkdir_p($dir);
        }
        return $dir . '/rum.json';
    }

    /**
     * rum.json structure:
     * {hours: {'Y-m-d\TH': {<mode>: {v, e, lcp[], cls[], pages: {path: n}}}}}
     */
    private static function record(string $mode, string $path, int $lcp, float $cls, array $errors): void {
        $path_file = self::rum_path();
        $fp = @fopen($path_file, 'c+');
        if (!$fp) {
            return;
        }

        try {
            flock($fp, LOCK_EX);
            $raw = stream_get_contents($fp) ?: '';
            $data = json_decode($raw, true);
            if (!is_array($data) || !isset($data['hours']) || !is_array($data['hours'])) {
                $data = ['hours' => []];
            }

            $hour_key = gmdate('Y-m-d\TH');

            // Prune hours older than 25h.
            foreach (array_keys($data['hours']) as $h) {
                $ts = strtotime((string) $h . ':00:00Z');
                if ($ts === false || $ts < time() - self::HOUR_RETENTION * HOUR_IN_SECONDS) {
                    unset($data['hours'][$h]);
                }
            }

            if (!isset($data['hours'][$hour_key][$mode])) {
                $data['hours'][$hour_key][$mode] = ['v' => 0, 'e' => 0, 'lcp' => [], 'cls' => [], 'pages' => []];
            }
            $bucket = &$data['hours'][$hour_key][$mode];

            $bucket['v']++;
            $bucket['e'] += count($errors);
            unset($bucket);

            // Error-page attribution (first error wins; path already recorded above).
            if ($errors !== []) {
                $data['hours'][$hour_key][$mode]['pages'][$path] =
                    ($data['hours'][$hour_key][$mode]['pages'][$path] ?? 0) + 1;
            }

            if ($lcp > 0) {
                $arr = &$data['hours'][$hour_key][$mode]['lcp'];
                $arr[] = $lcp;
                if (count($arr) > self::MAX_SAMPLES) {
                    $data['hours'][$hour_key][$mode]['lcp'] = array_slice($arr, -self::MAX_SAMPLES);
                }
                unset($arr);
            }

            if ($cls > 0) {
                $arr = &$data['hours'][$hour_key][$mode]['cls'];
                $arr[] = round($cls, 4);
                if (count($arr) > self::MAX_SAMPLES) {
                    $data['hours'][$hour_key][$mode]['cls'] = array_slice($arr, -self::MAX_SAMPLES);
                }
                unset($arr);
            }

            ftruncate($fp, 0);
            rewind($fp);
            fwrite($fp, wp_json_encode($data));
        } finally {
            @flock($fp, LOCK_UN);
            @fclose($fp);
        }
    }

    /**
     * Aggregate the rolling window into the daily shape the edge expects:
     * {days: [{day: 'Y-m-d', modes: {<mode>: {views, errors, lcpP75, clsP75, pages}}}}]}
     */
    public static function aggregate(): array {
        $data = self::read();
        $days = [];

        foreach ($data['hours'] as $hour => $modes) {
            $day = substr((string) $hour, 0, 10);
            foreach ($modes as $mode => $bucket) {
                $d = &$days[$day][$mode];
                if (!isset($d)) {
                    $d = ['views' => 0, 'errors' => 0, 'lcp' => [], 'cls' => [], 'pages' => []];
                }
                $d['views'] += (int) ($bucket['v'] ?? 0);
                $d['errors'] += (int) ($bucket['e'] ?? 0);
                foreach ((array) ($bucket['lcp'] ?? []) as $v) {
                    $d['lcp'][] = (int) $v;
                }
                foreach ((array) ($bucket['cls'] ?? []) as $v) {
                    $d['cls'][] = (float) $v;
                }
                foreach ((array) ($bucket['pages'] ?? []) as $p => $n) {
                    $d['pages'][(string) $p] = ($d['pages'][(string) $p] ?? 0) + (int) $n;
                }
                unset($d);
            }
        }

        $out = [];
        foreach ($days as $day => $modes) {
            $mode_out = [];
            foreach ($modes as $mode => $agg) {
                $mode_out[$mode] = [
                    'views' => $agg['views'],
                    'errors' => $agg['errors'],
                    'lcpP75' => self::percentile($agg['lcp'], 0.75),
                    'clsP75' => self::percentile($agg['cls'], 0.75),
                    'pages' => $agg['pages'],
                ];
            }
            $out[] = ['day' => $day, 'modes' => $mode_out];
        }

        return ['days' => $out];
    }

    /**
     * Push the daily aggregate to the edge (hourly cron + daily heartbeat).
     */
    public static function push_to_edge(ApiClient $api_client): array {
        $payload = self::aggregate();
        if ($payload['days'] === []) {
            return ['success' => true, 'skipped' => true];
        }
        return $api_client->send_rum($payload);
    }

    public static function read(): array {
        $raw = @file_get_contents(self::rum_path());
        $data = is_string($raw) ? json_decode($raw, true) : null;
        if (!is_array($data) || !is_array($data['hours'] ?? null)) {
            return ['hours' => []];
        }
        return $data;
    }

    private static function percentile(array $values, float $p) {
        if ($values === []) {
            return null;
        }
        sort($values);
        $idx = max(0, (int) ceil($p * count($values)) - 1);
        return $values[$idx];
    }

    private static function clamp_string(string $value, int $max_len, string $default): string {
        $value = trim($value);
        if ($value === '') {
            return $default;
        }
        return mb_substr($value, 0, $max_len);
    }

    private static function clamp_int(int $value, int $min, int $max): int {
        return max($min, min($max, $value));
    }

    private static function clamp_float(float $value, float $min, float $max): float {
        return max($min, min($max, $value));
    }
}
