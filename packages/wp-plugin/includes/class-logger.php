<?php
namespace WPInstant;

if (!defined('ABSPATH')) {
    exit;
}

/**
 * Lightweight pipeline logger: a 300-entry ring buffer of high-signal
 * events (gate decisions, transforms, cache writes, CDN onboarding,
 * callback pushes, CSS delivery, media queue batches). It exists so "the
 * page is not optimized" is answerable from WP Admin instead of blind
 * probing — every entry names WHAT happened and WHY.
 */
class Logger {
    public const OPTION = 'wp_instant_pipeline_log';
    public const PAUSED_OPTION = 'wp_instant_log_paused';
    private const MAX = 300;

    /** Append an event (silently dropped while paused). */
    public static function log(string $event, array $context = []): void {
        if (get_option(self::PAUSED_OPTION)) {
            return;
        }
        $log = get_option(self::OPTION, []);
        if (!is_array($log)) {
            $log = [];
        }
        $entry = ['t' => time(), 'e' => $event];
        if ($context !== []) {
            $entry['c'] = array_slice($context, 0, 8, true);
        }
        $log[] = $entry;
        if (count($log) > self::MAX) {
            $log = array_slice($log, -self::MAX);
        }
        update_option(self::OPTION, $log, false);
    }

    /** Newest first. */
    public static function all(): array {
        $log = get_option(self::OPTION, []);
        if (!is_array($log)) {
            return [];
        }
        return array_reverse($log);
    }

    public static function clear(): void {
        update_option(self::OPTION, [], false);
    }

    public static function is_paused(): bool {
        return (bool) get_option(self::PAUSED_OPTION);
    }

    public static function set_paused(bool $paused): void {
        update_option(self::PAUSED_OPTION, $paused ? 1 : 0, false);
    }

    /** Current request path, trimmed for log contexts. */
    public static function request_uri(): string {
        $uri = (string) ($_SERVER['REQUEST_URI'] ?? '/');
        return strlen($uri) > 180 ? substr($uri, 0, 180) : $uri;
    }
}
