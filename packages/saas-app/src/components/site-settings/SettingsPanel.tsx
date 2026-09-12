'use client';

import React from 'react';
import { Zap, Globe, Activity, FlaskConical, CheckCircle2 } from 'lucide-react';
import { Toggle, ListField, Card, PluginControlCard, getPath, type SiteContext } from './fields';

/* ------------------------------------------------------------------ */
/* Full site settings panel                                             */
/*                                                                     */
/* Every optimization control for one site: preset templates, critical  */
/* CSS, CSS delivery, JavaScript engine, media & CDN offload, fonts,    */
/* asset proxy, HTML output, page cache, dynamic/safety, and plugin     */
/* asset control. Stateless — the host owns `config` and persists it.   */
/* ------------------------------------------------------------------ */

export interface SettingsPanelProps {
  config: Record<string, any>;
  upsert: (path: string, value: any) => void;
  applyPreset: (id: string) => void;
  siteContext: SiteContext;
  /** Extra class for the wrapping grid (e.g. single-column on embed). */
  className?: string;
}

const PRESETS: Array<{ id: string; name: string; desc: string }> = [
  { id: 'safe', name: 'Safe', desc: 'Caching + minify only. No JS deferral.' },
  { id: 'aggressive', name: 'Aggressive', desc: 'Defer all JS, combine CSS, proxy assets.' },
  { id: 'ludicrous', name: 'Ludicrous', desc: 'Everything + delay-until-interaction JS.' },
];

export function SettingsPanel({ config, upsert, applyPreset, siteContext, className }: SettingsPanelProps) {
  const preset: string = config.preset || 'ludicrous';
  const sitePlugins: Record<string, string> = siteContext.plugins || {};

  return (
    <div className={className}>
      {/* Preset templates */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {PRESETS.map((p) => (
          <button
            key={p.id}
            onClick={() => applyPreset(p.id)}
            className={`text-left p-4 rounded-2xl border transition-all ${
              preset === p.id
                ? 'border-[#f03e2f] bg-[#fff8f7] shadow-sm'
                : 'border-[#e4e4e7] bg-white hover:border-[#d4d4d8]'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold">{p.name}</span>
              {preset === p.id && <CheckCircle2 className="w-4 h-4 text-[#f03e2f]" />}
            </div>
            <p className="text-[11px] text-[#71717a] mt-1 leading-snug">{p.desc}</p>
          </button>
        ))}
      </div>

      {/* Settings grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
        <Card title="Critical CSS" icon={<Zap className="w-4 h-4" />}>
          <Toggle label="Edge Critical CSS" hint="Real-browser extracted critical CSS per page" checked={!!getPath(config, 'critical_css.enabled')} onChange={(v) => upsert('critical_css.enabled', v)} />
          <Toggle label="Inline critical CSS" checked={!!getPath(config, 'critical_css.inline')} onChange={(v) => upsert('critical_css.inline', v)} />
          <Toggle label="Async load full CSS" hint="Load remaining CSS after first paint (large sites)" checked={!!getPath(config, 'critical_css.async_load_full')} onChange={(v) => upsert('critical_css.async_load_full', v)} />
          <Toggle label="Font display swap" checked={!!getPath(config, 'critical_css.font_display_swap')} onChange={(v) => upsert('critical_css.font_display_swap', v)} />
          <ListField
            label="Excluded stylesheets"
            hint="Never combine/defer sheets whose URL contains any of these (one per line)"
            placeholder={'elementor/post-123\nwp-includes/block-library'}
            plugins={sitePlugins}
            value={getPath(config, 'critical_css.excluded_stylesheets') || []}
            onChange={(v) => upsert('critical_css.excluded_stylesheets', v)}
          />
        </Card>

        <Card title="CSS Delivery" icon={<Activity className="w-4 h-4" />}>
          <Toggle label="Combine stylesheets" hint="Merge render-blocking sheets into one bundle" checked={!!getPath(config, 'css.combine')} onChange={(v) => upsert('css.combine', v)} />
          <Toggle label="Minify CSS" checked={!!getPath(config, 'css.minify')} onChange={(v) => upsert('css.minify', v)} />
          <Toggle label="Inline-all CSS" hint="Inline the full stylesheet in HTML when it fits — no flash of unstyled content by construction" checked={!!getPath(config, 'css.inline_all')} onChange={(v) => upsert('css.inline_all', v)} />
        </Card>

        <Card title="JavaScript Engine" icon={<Zap className="w-4 h-4" />}>
          <div className="py-2.5">
            <span className="block text-[13px] font-medium mb-1.5">Execution mode</span>
            <div className="grid grid-cols-3 gap-1.5">
              {(['none', 'defer', 'interaction_delay'] as const).map((m) => (
                <button
                  key={m}
                  onClick={() => upsert('javascript.execution_mode', m)}
                  className={`px-2 py-1.5 rounded-lg text-[11px] font-semibold border ${
                    getPath(config, 'javascript.execution_mode') === m
                      ? 'border-[#f03e2f] bg-[#fff8f7] text-[#f03e2f]'
                      : 'border-[#e4e4e7] bg-white hover:bg-[#fafafa]'
                  }`}
                >
                  {m === 'none' ? 'Off' : m === 'defer' ? 'Defer' : 'Delay'}
                </button>
              ))}
            </div>
          </div>
          <div className="py-2.5">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[13px] font-medium">Delay timeout</span>
              <span className="text-[11px] text-[#71717a] font-mono">{getPath(config, 'javascript.delay_timeout_ms') ?? 3500}ms</span>
            </div>
            <input
              type="range" min={1500} max={6000} step={250}
              value={getPath(config, 'javascript.delay_timeout_ms') ?? 3500}
              onChange={(e) => upsert('javascript.delay_timeout_ms', parseInt(e.target.value, 10))}
              className="w-full accent-[#f03e2f]"
            />
          </div>
          <Toggle label="Remove jQuery Migrate" checked={!!getPath(config, 'javascript.remove_jquery_migrate')} onChange={(v) => upsert('javascript.remove_jquery_migrate', v)} />
          <ListField
            label="Script exclusions"
            hint="Scripts that must run before first interaction — only applies in Delay mode (one per line)"
            placeholder={'cookiebot\nstripe.js'}
            plugins={sitePlugins}
            value={getPath(config, 'javascript.exclusions') || []}
            onChange={(v) => upsert('javascript.exclusions', v)}
          />
        </Card>

        <Card title="Media & CDN Offload" icon={<Globe className="w-4 h-4" />}>
          <Toggle label="Offload images to the CDN" hint="Rewrite + optimize (webp, resized) via the edge CDN" checked={!!getPath(config, 'media.offload_images')} onChange={(v) => upsert('media.offload_images', v)} />
          <Toggle label="Offload videos to the CDN" checked={!!getPath(config, 'media.offload_video')} onChange={(v) => upsert('media.offload_video', v)} />
          <Toggle label="Lazy-load images" checked={!!getPath(config, 'media.lazyload_images')} onChange={(v) => upsert('media.lazyload_images', v)} />
          <Toggle label="Lazy-load iframes" checked={!!getPath(config, 'media.lazyload_iframes')} onChange={(v) => upsert('media.lazyload_iframes', v)} />
          <Toggle label="Lazy-load CSS backgrounds" hint="Below-the-fold inline background images load on scroll" checked={!!getPath(config, 'media.lazyload_backgrounds')} onChange={(v) => upsert('media.lazyload_backgrounds', v)} />
          <Toggle label="Video facades" hint="YouTube embeds load the player only after a click" checked={!!getPath(config, 'media.video_facades')} onChange={(v) => upsert('media.video_facades', v)} />
          <Toggle label="Self-hosted video lazy" hint="preload=none on non-autoplay videos" checked={!!getPath(config, 'media.video_lazyload_selfhosted')} onChange={(v) => upsert('media.video_lazyload_selfhosted', v)} />
          <Toggle label="Preload LCP image" checked={!!getPath(config, 'media.preload_lcp_image')} onChange={(v) => upsert('media.preload_lcp_image', v)} />
          <Toggle label="fetchpriority on LCP" checked={!!getPath(config, 'media.auto_fetchpriority_lcp')} onChange={(v) => upsert('media.auto_fetchpriority_lcp', v)} />
          <div className="py-2.5">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[13px] font-medium">Image quality</span>
              <span className="text-[11px] text-[#71717a] font-mono">{getPath(config, 'media.image_quality') ?? 82}</span>
            </div>
            <input
              type="range" min={60} max={100} step={1}
              value={getPath(config, 'media.image_quality') ?? 82}
              onChange={(e) => upsert('media.image_quality', parseInt(e.target.value, 10))}
              className="w-full accent-[#f03e2f]"
            />
            <p className="text-[10px] text-[#a1a1aa] mt-0.5">~82 lossy · 100 ≈ lossless (applies to CDN image derivatives)</p>
          </div>
          <ListField
            label="Excluded images"
            hint="Image URLs never offloaded/lazy-loaded (one per line)"
            placeholder={'wp-content/uploads/logo.png'}
            plugins={sitePlugins}
            value={getPath(config, 'media.excluded_images') || []}
            onChange={(v) => upsert('media.excluded_images', v)}
          />
        </Card>

        <Card title="Fonts & Hints" icon={<Activity className="w-4 h-4" />}>
          <Toggle label="Localize Google Fonts" hint="Self-host woff2 with display:swap" checked={!!getPath(config, 'fonts.localize_google')} onChange={(v) => upsert('fonts.localize_google', v)} />
          <Toggle label="Preload LCP font" checked={!!getPath(config, 'fonts.preload_lcp_font')} onChange={(v) => upsert('fonts.preload_lcp_font', v)} />
          <Toggle label="Resource hints" hint="Auto preconnect for 3rd-party origins" checked={!!getPath(config, 'hints.resource_hints')} onChange={(v) => upsert('hints.resource_hints', v)} />
        </Card>

        <Card title="Asset Delivery" icon={<Globe className="w-4 h-4" />}>
          <Toggle label="Serve own css/js from CDN" hint="Theme bundles, combined CSS and scripts via the edge CDN (third-party files always stay on their origin)" checked={!!getPath(config, 'assets.serve_own_from_cdn')} onChange={(v) => upsert('assets.serve_own_from_cdn', v)} />
          <Toggle label="Manage .htaccess" hint="Precompressed assets + immutable cache TTLs" checked={!!getPath(config, 'htaccess.enabled')} onChange={(v) => upsert('htaccess.enabled', v)} />
        </Card>

        <Card title="HTML & Output" icon={<Activity className="w-4 h-4" />}>
          <Toggle label="Minify HTML" hint="Collapse redundant whitespace (scripts/styles/pre untouched)" checked={!!getPath(config, 'html.minify')} onChange={(v) => upsert('html.minify', v)} />
          <Toggle label="Minify JSON-LD" hint="Compact structured-data blocks" checked={!!getPath(config, 'html.minify_jsonld')} onChange={(v) => upsert('html.minify_jsonld', v)} />
          <Toggle label="Remove HTML comments" hint="IE conditional comments are always kept" checked={!!getPath(config, 'html.remove_html_comments')} onChange={(v) => upsert('html.remove_html_comments', v)} />
          <div className="py-2.5">
            <label className="block text-[13px] font-medium mb-1.5">Custom CSS</label>
            <textarea
              rows={4}
              spellCheck={false}
              placeholder={'.hero-title { text-wrap: balance; }'}
              value={getPath(config, 'custom_css') || ''}
              onChange={(e) => upsert('custom_css', e.target.value)}
              className="w-full rounded-lg border border-[#e4e4e7] px-2.5 py-2 text-[11px] font-mono focus:outline-none focus:border-[#f03e2f]"
            />
            <p className="text-[10px] text-[#a1a1aa] mt-0.5">Injected last in &lt;head&gt; — wins the cascade.</p>
          </div>
        </Card>

        <Card title="Page Cache" icon={<FlaskConical className="w-4 h-4" />}>
          <Toggle label="Page caching" checked={!!getPath(config, 'caching.enabled')} onChange={(v) => upsert('caching.enabled', v)} />
          <Toggle label="Separate mobile cache" checked={!!getPath(config, 'caching.mobile_cache')} onChange={(v) => upsert('caching.mobile_cache', v)} />
          <Toggle label="Purge on post update" checked={!!getPath(config, 'caching.purge_on_post_update')} onChange={(v) => upsert('caching.purge_on_post_update', v)} />
          <Toggle label="Purge on new comment" checked={!!getPath(config, 'caching.purge_on_comment')} onChange={(v) => upsert('caching.purge_on_comment', v)} />
          <Toggle label="Warm cache after purge" hint="Re-render purged pages in the background" checked={!!getPath(config, 'caching.warm_after_purge')} onChange={(v) => upsert('caching.warm_after_purge', v)} />
          <div className="py-2.5">
            <span className="block text-[13px] font-medium text-[#18181b]">Optimization scope</span>
            <span className="block text-[11px] text-[#71717a] mb-1.5">Which pages may spend extraction credits. Homepage is always included.</span>
            <select
              className="w-full rounded-lg border border-[#e4e4e7] bg-white px-2.5 py-2 text-[13px] text-[#18181b]"
              value={getPath(config, 'caching.optimize_scope') || 'main-pages'}
              onChange={(e) => upsert('caching.optimize_scope', e.target.value)}
            >
              <option value="main-pages">Main pages — homepage + list below (1–2 credits each)</option>
              <option value="templates-only">Templates only — first of each template pays, repeats free</option>
              <option value="all">All pages — every URL pays (can burn quotas fast)</option>
            </select>
          </div>
          <Toggle label="Auto-crawl discovered pages" hint="After a homepage run, optimize linked pages too (2 credits each, off by default)" checked={!!getPath(config, 'caching.crawl_enabled')} onChange={(v) => upsert('caching.crawl_enabled', v)} />
          <ListField
            label="Optimize-only URLs"
            hint="Main-pages list (wildcards ok, one per line). Leave empty for homepage only."
            placeholder={'/landing/*\n/pricing/'}
            plugins={sitePlugins}
            value={getPath(config, 'caching.optimize_only_urls') || []}
            onChange={(v) => upsert('caching.optimize_only_urls', v)}
          />
        </Card>

        <Card title="Dynamic & Safety" icon={<FlaskConical className="w-4 h-4" />}>
          <Toggle label="Speculation rules (prefetch)" checked={!!getPath(config, 'dynamic.speculation_rules_prerender')} onChange={(v) => upsert('dynamic.speculation_rules_prerender', v)} />
          <Toggle label="Nonce refresh hydration" checked={!!getPath(config, 'dynamic.nonce_ajax_refresh')} onChange={(v) => upsert('dynamic.nonce_ajax_refresh', v)} />
          <Toggle label="Cart micro-hydration" checked={!!getPath(config, 'dynamic.cart_micro_hydration')} onChange={(v) => upsert('dynamic.cart_micro_hydration', v)} />
          <Toggle label="Auto-degrade safety net" hint="Step down JS aggressiveness automatically on rising error rates" checked={!!getPath(config, 'deployment.auto_degrade')} onChange={(v) => upsert('deployment.auto_degrade', v)} />
        </Card>
      </div>

      {/* Plugin Asset Control — strip css/js of unused plugins per post type */}
      <div className="mt-4">
        <PluginControlCard
          siteContext={siteContext}
          unloadRules={getPath(config, 'plugins.unload_rules') || {}}
          onChange={(rules) => upsert('plugins.unload_rules', rules)}
        />
      </div>
    </div>
  );
}
