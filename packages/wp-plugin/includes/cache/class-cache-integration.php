<?php
namespace Turbopress;

if (!defined('ABSPATH')) {
    exit;
}

/**
 * Handles the advanced-cache.php drop-in battleground.
 *
 * WordPress supports exactly ONE advanced-cache.php drop-in. Shared hosts
 * (Hostinger LiteSpeed, etc.) and other caching plugins install their own,
 * and the file lives in wp-content even when the owning plugin is inactive.
 * Blindly overwriting/unlinking it breaks the foreign cache — and theirs
 * overwriting ours silently disables our page cache (the exact failure seen
 * on the live client site).
 */
class CacheIntegration {
    public const CONFLICT_OPTION = 'turbopress_dropin_conflict';

    /** Known page-cache solutions that may own advanced-cache.php. */
    private const FOREIGN_OWNERS = [
        'litespeed'    => ['markers' => ['LiteSpeed'],                 'label' => 'LiteSpeed Cache'],
        'wp-rocket'    => ['markers' => ['WP Rocket'],                 'label' => 'WP Rocket'],
        'w3tc'         => ['markers' => ['w3tc'],                      'label' => 'W3 Total Cache'],
        'wp-super'     => ['markers' => ['wp_super_cache'],            'label' => 'WP Super Cache'],
        'sg-optimizer' => ['markers' => ['sgo_', 'SiteGround'],        'label' => 'SiteGround Optimizer'],
        'wpfastest'    => ['markers' => ['WP Fastest Cache'],          'label' => 'WP Fastest Cache'],
        'flying-press' => ['markers' => ['FlyingPress'],               'label' => 'FlyingPress'],
        'breeze'       => ['markers' => ['Breeze'],                    'label' => 'Breeze'],
        'zen-cache'    => ['markers' => ['zencache', 'Comet Cache'],   'label' => 'ZenCache/Comet'],
        'cache-enabler'=> ['markers' => ['cache-enabler'],             'label' => 'Cache Enabler'],
    ];

    /**
     * Foreign cache plugins whose purge events should also purge our pages.
     * Best-effort action names (each plugin fires these when IT purges).
     */
    private const FOREIGN_PURGE_ACTIONS = [
        'litespeed_purge_all',          // LiteSpeed Cache
        'litespeed_purge_url',          // LiteSpeed Cache (single URL, takes URL arg)
        'rocket_after_clean_domain',    // WP Rocket full purge
        'rocket_after_clean_post',      // WP Rocket post purge
        'w3tc_flush_all',               // W3TC
        'w3tc_flush_post',              // W3TC post flush (takes post_id)
        'wp_cache_cleared',            // WP Super Cache era action
        'sgc_full_purge_cache',        // SiteGround Optimizer
        'cache_enabler_clear_complete_cache', // Cache Enabler
        'breeze_clear_all_cache',      // Breeze
    ];

    public function init(): void {
        // Self-heal: an outdated Turbopress drop-in (e.g. left by a plugin
        // update that couldn't rewrite it) is upgraded on admin requests.
        if (is_admin() && !self::is_our_dropin_installed() && self::dropin_is_turbopress()) {
            self::install_dropin();
        }

        // Mirror foreign plugin purges into our page cache.
        foreach (self::FOREIGN_PURGE_ACTIONS as $action) {
            add_action($action, [$this, 'mirror_foreign_purge']);
        }
        // LiteSpeed purges a single URL: flush our matching entries too.
        add_action('litespeed_purge_url', fn(string $url = '') => $this->mirror_foreign_purge_url($url));
        add_action('w3tc_flush_post', fn($post_id = 0) => $this->mirror_foreign_post_purge((int) $post_id));

        // Surface the conflict to admins (dismissable once per state change).
        add_action('admin_notices', [$this, 'render_conflict_notice']);
    }

    public static function dropin_path(): string {
        return WP_CONTENT_DIR . '/advanced-cache.php';
    }

    public static function source_path(): string {
        return TURBOPRESS_PATH . 'advanced-cache.php';
    }

    /**
     * Is the currently installed drop-in byte-identical to ours?
     */
    public static function is_our_dropin_installed(): bool {
        $dest = self::dropin_path();
        if (!file_exists($dest) || !file_exists(self::source_path())) {
            return false;
        }
        return md5_file($dest) === md5_file(self::source_path());
    }

    /**
     * Does the installed drop-in carry the Turbopress signature? Catches
     * LEGACY Turbopress drop-ins (older plugin versions) and files whose
     * bytes drifted (FTP line-ending rewrites) — these are ours to manage,
     * never a foreign conflict.
     */
    private static function dropin_is_turbopress(?string $content = null): bool {
        $content ??= ((string) @file_get_contents(self::dropin_path()));
        return $content !== '' && stripos($content, 'turbopress') !== false;
    }

    /**
     * Identify foreign ownership of the installed drop-in.
     * Returns owner key or null when absent/ours (current OR legacy).
     */
    public static function detect_foreign_dropin(): ?array {
        $dest = self::dropin_path();
        if (!file_exists($dest) || self::is_our_dropin_installed()) {
            return null;
        }

        $content = (string) @file_get_contents($dest);

        // Turbopress-signed file (e.g. a 1.1.0 drop-in left after update):
        // outdated but OURS — upgradable, never a foreign conflict.
        if (self::dropin_is_turbopress($content)) {
            return null;
        }

        foreach (self::FOREIGN_OWNERS as $key => $meta) {
            foreach ($meta['markers'] as $marker) {
                if (stripos($content, $marker) !== false) {
                    return ['key' => $key, 'label' => $meta['label']];
                }
            }
        }

        // Unknown foreign drop-in.
        return ['key' => 'unknown', 'label' => 'another caching plugin'];
    }

    /**
     * Install our drop-in when the slot is free OR holds a Turbopress
     * (possibly legacy) file. Returns true when our current drop-in ends
     * up installed afterwards.
     */
    public static function install_dropin(): bool {
        $foreign = self::detect_foreign_dropin();
        if ($foreign !== null) {
            update_option(self::CONFLICT_OPTION, $foreign + ['detected_at' => time()]);
            return false;
        }

        // Up-to-date already: nothing to do.
        if (self::is_our_dropin_installed()) {
            delete_option(self::CONFLICT_OPTION);
            return true;
        }

        $copied = @copy(self::source_path(), self::dropin_path());
        $ok = $copied && self::is_our_dropin_installed();
        if ($ok) {
            delete_option(self::CONFLICT_OPTION);
            self::ensure_wp_cache_constant();
        }
        return $ok;
    }

    /**
     * Remove our drop-in — current, legacy Turbopress-signed versions, but
     * never a file owned by another plugin.
     */
    public static function remove_dropin(): bool {
        if (self::is_our_dropin_installed() || self::dropin_is_turbopress()) {
            return @unlink(self::dropin_path());
        }
        return false; // Foreign or missing: not ours to delete.
    }

    public static function ensure_wp_cache_constant(): void {
        $wp_config = ABSPATH . 'wp-config.php';
        if (!file_exists($wp_config) || !is_writable($wp_config)) {
            return;
        }

        $content = file_get_contents($wp_config);
        if ($content && strpos($content, "define('WP_CACHE'") === false && strpos($content, 'define("WP_CACHE"') === false) {
            $content = preg_replace("/(<\?php)/i", "$1\ndefine('WP_CACHE', true); // Turbopress Drop-in", $content, 1);
            @file_put_contents($wp_config, $content);
        }
    }

    /**
     * Compact status snapshot for the health check + admin UI.
     */
    public static function get_status(): array {
        $foreign = self::detect_foreign_dropin();
        $current = self::is_our_dropin_installed();
        return [
            'dropin_installed' => $current,
            'dropin_present' => file_exists(self::dropin_path()),
            'dropin_outdated' => !$current && $foreign === null && self::dropin_is_turbopress(),
            'foreign_owner' => $foreign['label'] ?? null,
            'wp_cache_constant' => defined('WP_CACHE') && WP_CACHE,
            'turbopress_serving' => $current && (defined('WP_CACHE') && WP_CACHE),
        ];
    }

    /** Full foreign purge → full pages purge. */
    public function mirror_foreign_purge(): void {
        CacheManager::purge_all_static();
    }

    /** Foreign single-URL purge → our URL purge. */
    private function mirror_foreign_purge_url(string $url): void {
        if (!empty($url)) {
            CacheManager::purge_url($url);
            return;
        }
        CacheManager::purge_all_static();
    }

    /** Foreign post purge → our permalink + home purge. */
    private function mirror_foreign_post_purge(int $post_id): void {
        if ($post_id > 0) {
            $permalink = get_permalink($post_id);
            if ($permalink) {
                CacheManager::purge_url($permalink);
            }
        }
        CacheManager::purge_url(get_home_url());
    }

    public function render_conflict_notice(): void {
        if (!current_user_can('manage_options')) {
            return;
        }

        $foreign = self::detect_foreign_dropin();
        if ($foreign === null) {
            return;
        }

        printf(
            '<div class="notice notice-warning"><p><strong>Turbopress:</strong> %s is currently using the <code>advanced-cache.php</code> drop-in, so Turbopress page caching is paused to avoid a conflict. All DOM optimizations (Critical CSS, script deferral, font &amp; media optimization) remain fully active. Disable the other page cache (or let it handle page caching) to enable Turbopress page caching.</p></div>',
            esc_html($foreign['label'])
        );
    }
}
