<?php
namespace Turbopress;

if (!defined('ABSPATH')) {
    exit;
}

/**
 * Auto-degrade safety net (NitroPack has nothing like this; our "better"):
 * watches live RUM error rates for the active JS execution mode and steps
 * down interaction_delay -> defer -> none when visitors see errors at more
 * than max(2x baseline, 1%) over a 6h window (min 300 views). One step per
 * 6h max; every action is surfaced in wp-admin and persisted for the SaaS.
 */
class AutoDegrade {
    public const OPTION = 'turbopress_auto_degrade';

    private const MIN_VIEWS = 300;
    private const WINDOW_HOURS = 6;
    private const STEP_COOLDOWN = 6; // hours between steps
    private const STEP_MAP = [
        'interaction_delay' => 'defer',
        'defer' => 'none',
    ];

    public static function evaluate(Config $config): void {
        $deployment = $config->get('deployment', []);
        if (empty($deployment['auto_degrade'])) {
            return;
        }

        $mode = (string) $config->get('javascript.execution_mode', 'defer');
        if ($mode === 'none' || !isset(self::STEP_MAP[$mode])) {
            return; // nothing to step down from / to
        }

        // At most one automatic step per cooldown window.
        $state = get_option(self::OPTION, []);
        if (is_array($state) && isset($state['at']) && (time() - (int) $state['at']) < self::STEP_COOLDOWN * HOUR_IN_SECONDS) {
            return;
        }

        $rum = Telemetry::read();
        [$current_views, $current_errors, $baseline_rate] = self::window_stats($rum['hours'], $mode);
        if ($current_views < self::MIN_VIEWS) {
            return; // not enough live traffic to judge
        }

        $rate = $current_errors / max(1, $current_views);
        $threshold = max(2 * $baseline_rate, 0.01);

        if ($rate <= $threshold) {
            return;
        }

        $next = self::STEP_MAP[$mode];
        $config->set('javascript.execution_mode', $next);

        CacheManager::purge_all_static();
        CacheIntegration::purge_foreign_caches('all');

        update_option(self::OPTION, [
            'at' => time(),
            'from' => $mode,
            'to' => $next,
            'rate' => round($rate, 4),
            'views' => $current_views,
            'errors' => $current_errors,
            'baseline' => round($baseline_rate, 4),
        ]);
    }

    /**
     * Sum views/errors for $mode over the trailing window and compute the
     * best (lowest) error rate observed in OTHER modes as the baseline.
     */
    private static function window_stats(array $hours, string $mode): array {
        $cutoff = time() - self::WINDOW_HOURS * HOUR_IN_SECONDS;
        $views = 0;
        $errors = 0;
        $other_rates = [];

        foreach ($hours as $hour => $modes) {
            $ts = strtotime((string) $hour . ':00:00Z');
            if ($ts === false || $ts < $cutoff) {
                continue;
            }
            foreach ($modes as $m => $bucket) {
                $v = (int) ($bucket['v'] ?? 0);
                $e = (int) ($bucket['e'] ?? 0);
                if ($m === $mode) {
                    $views += $v;
                    $errors += $e;
                } elseif ($v >= 100 && $e > 0) {
                    $other_rates[] = $e / $v;
                }
            }
        }

        return [$views, $errors, $other_rates ? min($other_rates) : 0.0];
    }

    public static function admin_notice(): void {
        $state = get_option(self::OPTION, []);
        if (!is_array($state) || empty($state['at'])) {
            return;
        }

        // Show for 24h after the action, or until dismissed.
        if ((time() - (int) $state['at']) > DAY_IN_SECONDS) {
            return;
        }

        $dismissed = get_option(self::OPTION . '_dismissed', 0);
        if ($dismissed >= (int) $state['at']) {
            return;
        }

        $from = esc_html((string) ($state['from'] ?? ''));
        $to = esc_html((string) ($state['to'] ?? ''));
        $rate = (float) ($state['rate'] ?? 0) * 100;
        $views = (int) ($state['views'] ?? 0);
        printf(
            '<div class="notice notice-warning is-dismissible" data-tp-dismiss="auto_degrade"><p>' .
            '<strong>TurboPress Auto-Protect:</strong> visitor error rate reached %.1f%% across %d pageviews, ' .
            'so JavaScript execution was automatically stepped down from <code>%s</code> to <code>%s</code>. ' .
            'You can change this in <a href="%s">TurboPress settings</a>.</p></div>',
            $rate,
            $views,
            $from,
            $to,
            esc_url(admin_url('admin.php?page=turbopress'))
        );

        // Minimal inline dismiss handler (no separate asset needed).
        echo '<script>document.addEventListener("click",function(e){if(e.target.closest(\'[data-tp-dismiss="auto_degrade"]\')){var x=new XMLHttpRequest;x.open("POST",ajaxurl||"' . esc_url(admin_url('admin-ajax.php')) . '");x.setRequestHeader("Content-Type","application/x-www-form-urlencoded");x.send("action=turbopress_dismiss_degrade&nonce=' . esc_js(wp_create_nonce('turbopress_admin')) . '");}});</script>';
    }

    public static function register_ajax(): void {
        add_action('wp_ajax_turbopress_dismiss_degrade', static function (): void {
            check_ajax_referer('turbopress_admin', 'nonce');
            if (!current_user_can('manage_options')) {
                wp_send_json_error(null, 403);
            }
            update_option(self::OPTION . '_dismissed', time());
            wp_send_json_success();
        });
    }
}
