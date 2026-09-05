<?php
namespace WPInstant\Admin;

if (!defined('ABSPATH')) {
    exit;
}

/**
 * WP Instant → JavaScript. Execution strategy, delay timeout and the
 * scripts that must stay exempt from delaying.
 */
class Page_Javascript extends Settings_Page {
    protected string $slug = 'wp-instant-js';
    protected string $title = 'JavaScript';
    protected string $description = 'How and when scripts run — from fully synchronous to delayed until first interaction.';

    public static function field_definitions(): array {
        return [
            'javascript.execution_mode' => ['type' => 'select', 'options' => ['none', 'defer', 'interaction_delay']],
            'javascript.delay_timeout_ms' => ['type' => 'int', 'min' => 1500, 'max' => 6000],
            'javascript.remove_jquery_migrate' => ['type' => 'bool'],
            'javascript.exclusions' => ['type' => 'str_list'],
        ];
    }

    public function render(): void {
        ?>
        <div class="wpins-grid-2">
            <?php $this->card_open('Execution Strategy', 'dashicons-media-code', 'Defer keeps execution order while removing render-blocking. Delay holds scripts until a visitor interacts (or the safety timer fires) — the biggest score win, with the most risk.'); ?>
                <?php
                $this->segmented('javascript', 'execution_mode', 'Mode', [
                    'none' => 'Off (synchronous)',
                    'defer' => 'Defer (recommended)',
                    'interaction_delay' => 'Delay until interaction',
                ]);
                $this->range_field('javascript', 'delay_timeout_ms', 'Delay safety timeout', 1500, 6000, 250, 'ms');
                $this->toggle('javascript', 'remove_jquery_migrate', 'Remove jQuery Migrate', 'Skips the compatibility shim (defer mode only)');
                ?>
            <?php $this->card_close(); ?>

            <?php $this->card_open('Script Exemptions', 'dashicons-shield', 'Scripts that must run before first interaction — consent banners, payment SDKs, captchas. Only applies in Delay mode.'); ?>
                <?php
                $this->list_field('javascript', 'exclusions', 'Always-load scripts', 'One per line', "cookiebot\nstripe.js");
                ?>
            <?php $this->card_close(); ?>
        </div>
        <?php
    }
}
