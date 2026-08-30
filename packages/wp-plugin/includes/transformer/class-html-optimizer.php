<?php
namespace Turbopress;

if (!defined('ABSPATH')) {
    exit;
}

/**
 * Final-pass HTML optimizer (the "Minify Resources" family):
 *
 *  - Safe HTML minification: collapses redundant whitespace OUTSIDE
 *    protected regions (<pre>, <textarea>, <script>, <style> are stashed
 *    verbatim first). Inline-element spacing is preserved: only whitespace
 *    adjacent to block-level tags is removed, so inline flows never fuse.
 *  - Optional comment stripping (IE conditional comments always kept;
 *    "Keep HTML comments" is the default).
 *  - JSON-LD minification via a real JSON round-trip (Yoast/RankMath/
 *    Elementor ship pretty-printed ld+json blocks).
 *  - Normalization: blank-line removal, tag-adjacent whitespace tidy.
 *
 * Runs as the LAST DomEngine stage so every earlier injection is minified
 * too. Never touches attribute values or protected text nodes.
 */
class HtmlOptimizer {
    private Config $config;
    private array $stash = [];

    /** Block-level tags whose adjacent whitespace is never rendered. */
    private const BLOCK = 'html|head|body|div|p|ul|ol|li|dl|dt|dd|table|thead|tbody|tfoot|tr|td|th|section|article|aside|header|footer|nav|main|figure|figcaption|form|fieldset|h[1-6]|hr|meta|link|title|option|select';

    public function __construct(Config $config) {
        $this->config = $config;
    }

    public function transform(string $html): string {
        if (!(bool) $this->config->get('html.minify', false)) {
            return $html;
        }
        $this->stash = [];

        // 1. JSON-LD minify first (scripts get stashed after this).
        if ((bool) $this->config->get('html.minify_jsonld', true)) {
            $html = $this->minify_jsonld($html);
        }

        // 2. Stash protected regions verbatim.
        $html = $this->protect($html);

        // 3. Optional comment removal (IE conditionals + our signature kept).
        if ((bool) $this->config->get('html.remove_html_comments', false)) {
            $html = preg_replace('/<!--(?!\[if|<!|>| Optimized with TurboPress)[\s\S]*?-->/i', '', $html) ?? $html;
        }

        if ((bool) $this->config->get('html.normalize', true)) {
            // Newline-including whitespace runs collapse to ONE space —
            // single-space text flow is preserved exactly.
            $html = preg_replace('/\s*\n\s*/', ' ', $html) ?? $html;
            // Indent runs (2+ spaces/tabs) collapse to one.
            $html = preg_replace('/[ \t]{2,}/', ' ', $html) ?? $html;
            // Whitespace adjacent to block-level tags is never rendered —
            // safe to delete. Inline elements are untouched on purpose.
            $html = preg_replace('/(<\/(?:' . self::BLOCK . ')>)[ \t]+/i', '$1', $html) ?? $html;
            $html = preg_replace('/[ \t]+(<(?:' . self::BLOCK . ')(?:\s[^>]*)?>)/i', '$1', $html) ?? $html;
        }

        return $this->restore($html);
    }

    private function minify_jsonld(string $html): string {
        return preg_replace_callback(
            '#(<script\b[^>]*type=["\']application/ld\+json["\'][^>]*>)([\s\S]*?)(</script\s*>)#i',
            static function (array $m): string {
                $data = json_decode(trim($m[2]));
                if ($data === null) {
                    return $m[0]; // invalid JSON: leave as-is
                }
                return $m[1] . wp_json_encode($data) . $m[3];
            },
            $html
        ) ?? $html;
    }

    private function protect(string $html): string {
        return preg_replace_callback(
            '#<(pre|textarea|script|style)\b[^>]*>[\s\S]*?</\1\s*>#i',
            function (array $m): string {
                $this->stash[] = $m[0];
                return "\x02TPSTASH" . (count($this->stash) - 1) . "\x03";
            },
            $html
        ) ?? $html;
    }

    private function restore(string $html): string {
        return preg_replace_callback(
            '/\x02TPSTASH(\d+)\x03/',
            fn(array $m): string => $this->stash[(int) $m[1]] ?? '',
            $html
        ) ?? $html;
    }
}
