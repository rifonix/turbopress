'use client';

import React, { useState } from 'react';
import {
  ArrowLeft,
  RotateCcw,
  Play,
  ExternalLink,
  Zap,
  Sliders,
  Code,
  KeyRound,
  Check,
} from 'lucide-react';
import { ExtendedSite, SitePreset, OptimizationJobItem } from '../types';
import { SiteConfig } from '@turbopress/shared';

interface SiteDetailPageProps {
  site: ExtendedSite;
  jobs?: OptimizationJobItem[];
  onBack: () => void;
  onUpdatePreset: (siteId: string, preset: SitePreset) => Promise<void>;
  onUpdateConfig?: (siteId: string, config: SiteConfig) => Promise<void>;
  onPurgeCache: (domain: string) => Promise<void>;
  onRunOptimization: (domain: string) => Promise<void>;
  onToast: (msg: string) => void;
}

export const SiteDetailPage: React.FC<SiteDetailPageProps> = ({
  site,
  jobs = [],
  onBack,
  onUpdatePreset,
  onUpdateConfig,
  onPurgeCache,
  onRunOptimization,
  onToast,
}) => {
  const [activeTab, setActiveTab] = useState<'presets' | 'critical-css' | 'connection'>('presets');
  const [currentPreset, setCurrentPreset] = useState<SitePreset>(site.config?.preset || 'ludicrous');
  const [isPurging, setIsPurging] = useState(false);
  const [isRunning, setIsRunning] = useState(false);

  // Granular settings local state
  const [jsDelayTimeout, setJsDelayTimeout] = useState(site.config?.javascript?.delay_timeout_ms || 3500);
  const [enableCriticalCss, setEnableCriticalCss] = useState(site.config?.critical_css?.enabled ?? true);
  const [enableDynamicNonces, setEnableDynamicNonces] = useState(site.config?.dynamic?.nonce_ajax_refresh ?? true);
  const [enableSpeculation, setEnableSpeculation] = useState(site.config?.dynamic?.speculation_rules_prerender ?? true);

  // Real heartbeat derived from plugin pings
  const lastPing = site.last_ping_at ? new Date(site.last_ping_at * 1000) : null;
  const heartbeatFresh = lastPing != null && Date.now() - site.last_ping_at! * 1000 < 24 * 3600 * 1000;

  const handleApplyPreset = async (preset: SitePreset) => {
    setCurrentPreset(preset);
    try {
      await onUpdatePreset(site.id, preset);
      onToast(`Applied ${preset.toUpperCase()} preset to ${site.domain}`);
    } catch (err: any) {
      onToast(err.message || 'Failed to update preset');
    }
  };

  const handleSaveGranularSettings = async () => {
    if (!onUpdateConfig) return;
    const baseConfig: SiteConfig = site.config || {
      version: '1.0.0',
      preset: currentPreset,
      caching: {
        enabled: true,
        ttl: 604800,
        mobile_cache: true,
        purge_on_post_update: true,
        purge_on_comment: true,
        strip_query_params: [],
        excluded_urls: [],
        excluded_cookies: [],
      },
      critical_css: {
        enabled: enableCriticalCss,
        inline: true,
        async_load_full: true,
        font_display_swap: true,
        viewports: ['mobile', 'desktop'],
        excluded_stylesheets: [],
      },
      javascript: {
        execution_mode: 'defer',
        delay_timeout_ms: jsDelayTimeout,
        preserve_execution_order: true,
        exclusions: [],
        worker_offload: [],
      },
      media: {
        auto_fetchpriority_lcp: true,
        preload_lcp_image: true,
        inject_missing_dimensions: true,
        serve_nextgen_formats: true,
        lazyload_images: true,
        lazyload_iframes: true,
        lazyload_offset_px: 300,
        excluded_images: [],
      },
      dynamic: {
        speculation_rules_prerender: enableSpeculation,
        speculation_rules_eagerness: 'moderate',
        nonce_ajax_refresh: enableDynamicNonces,
        cart_micro_hydration: true,
        excluded_prerender_paths: [],
      },
    };

    const updated: SiteConfig = {
      ...baseConfig,
      preset: currentPreset,
      critical_css: { ...baseConfig.critical_css, enabled: enableCriticalCss },
      javascript: { ...baseConfig.javascript, delay_timeout_ms: jsDelayTimeout },
      dynamic: {
        ...baseConfig.dynamic,
        nonce_ajax_refresh: enableDynamicNonces,
        speculation_rules_prerender: enableSpeculation,
      },
    };

    try {
      await onUpdateConfig(site.id, updated);
      onToast('Granular edge performance settings saved and synced across PoPs');
    } catch (err: any) {
      onToast(err.message || 'Failed to save settings');
    }
  };

  const handlePurge = async () => {
    setIsPurging(true);
    try {
      await onPurgeCache(site.domain);
      onToast(`Edge cache purged for ${site.domain}`);
    } catch {
      onToast('Purge failed');
    } finally {
      setIsPurging(false);
    }
  };

  const handleRun = async () => {
    setIsRunning(true);
    try {
      await onRunOptimization(site.domain);
      onToast(`Critical CSS extraction dispatched for ${site.domain}`);
    } catch {
      onToast('Optimization dispatch failed');
    } finally {
      setIsRunning(false);
    }
  };

  const renderScoreGauge = (score: number | null, label: string) => {
    const r = 24;
    const c = 2 * Math.PI * r;
    const offset = score != null ? c * (1 - score / 100) : c;
    const color = score == null ? '#a1a1aa' : score >= 90 ? '#16a34a' : score >= 50 ? '#f59e0b' : '#dc2626';

    return (
      <div className="flex items-center gap-3 p-3.5 bg-white border border-[#e4e4e7] rounded-xl shadow-sm">
        <div className="relative w-14 h-14 flex-none">
          <svg width="56" height="56" viewBox="0 0 56 56" className="-rotate-90">
            <circle cx="28" cy="28" r={r} fill="none" stroke="#f1f1f2" strokeWidth="4" />
            <circle
              cx="28"
              cy="28"
              r={r}
              fill="none"
              stroke={color}
              strokeWidth="4"
              strokeDasharray={c}
              strokeDashoffset={offset}
              strokeLinecap="round"
              className="transition-all duration-700"
            />
          </svg>
          <span className="absolute inset-0 grid place-items-center font-mono font-bold text-sm text-[#171717]">
            {score ?? '—'}
          </span>
        </div>
        <div>
          <span className="font-mono text-xs text-[#71717a] uppercase tracking-wider block">{label}</span>
          <span className={`text-xs font-semibold ${score == null ? 'text-[#a1a1aa]' : score >= 90 ? 'text-[#16a34a]' : score >= 50 ? 'text-[#b45309]' : 'text-[#dc2626]'}`}>
            {score == null ? 'Run an optimization to measure' : score >= 90 ? 'Good' : score >= 50 ? 'Needs improvement' : 'Poor'}
          </span>
        </div>
      </div>
    );
  };

  // Latest completed CSS job per viewport (real data only)
  const latestCssJobs = (['mobile', 'desktop'] as const).map((viewport) => ({
    viewport,
    job: jobs.find((j) => j.siteDomain === site.domain && j.viewport === viewport && j.status === 'completed'),
  }));

  return (
    <div className="space-y-6 animate-fade-in pb-12">
      {/* Breadcrumb & Top Action Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <button
            onClick={onBack}
            className="flex items-center gap-1.5 text-xs text-[#71717a] hover:text-[#171717] font-medium mb-2 transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Back to all sites</span>
          </button>
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl sm:text-3xl font-semibold font-mono tracking-tight text-[#171717]">
              {site.domain}
            </h1>
            <span
              className={`chip ${
                site.status === 'optimized'
                  ? 'chip-success'
                  : site.status === 'optimizing'
                  ? 'chip-warn'
                  : site.status === 'attention'
                  ? 'chip-danger'
                  : 'chip-neutral'
              }`}
            >
              <span className="chip-dot" />
              {site.status === 'optimized' && site.score != null ? `Optimized · ${site.score}` : site.status}
            </span>
          </div>
          <p className="text-xs text-[#71717a] mt-1 font-mono">
            Site ID: <code>{site.id}</code> · Last job {site.lastJobTime || 'never'}
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={handlePurge}
            disabled={isPurging}
            className="btn btn-secondary text-xs"
          >
            <RotateCcw className="w-3.5 h-3.5 mr-1" />
            <span>{isPurging ? 'Purging…' : 'Purge Edge Cache'}</span>
          </button>

          <button
            onClick={handleRun}
            disabled={isRunning}
            className="btn btn-primary text-xs"
          >
            <Play className="w-3.5 h-3.5 fill-current mr-1" />
            <span>{isRunning ? 'Optimizing…' : 'Run Optimization'}</span>
          </button>

          <a
            href={`https://${site.domain}/wp-admin/admin.php?page=turbopress`}
            target="_blank"
            rel="noreferrer"
            className="btn btn-secondary text-xs"
          >
            <span>WP Admin</span>
            <ExternalLink className="w-3.5 h-3.5 ml-1" />
          </a>
        </div>
      </div>

      {/* CWV Performance Scorecard (measured values only) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {renderScoreGauge(site.mobileScore ?? site.score, 'Mobile Score')}
        {renderScoreGauge(site.desktopScore ?? null, 'Desktop Score')}

        <div className="p-4 bg-white border border-[#e4e4e7] rounded-xl shadow-sm flex flex-col justify-between">
          <span className="text-xs font-mono text-[#71717a] uppercase tracking-wider">Largest Contentful Paint</span>
          <div className="flex items-baseline justify-between mt-1">
            <span className="font-mono text-2xl font-bold text-[#171717]">
              {site.lcp != null ? `${site.lcp.toFixed(1)}s` : '—'}
            </span>
            {site.lcp != null && (
              <span className={`font-mono text-xs font-medium ${site.lcp <= 2.5 ? 'text-[#16a34a]' : 'text-[#b45309]'}`}>
                {site.lcp <= 2.5 ? '⚡ Good' : 'Needs work'}
              </span>
            )}
          </div>
          <p className="text-[11px] text-[#71717a] mt-1">Measured by the edge browser audit</p>
        </div>

        <div className="p-4 bg-white border border-[#e4e4e7] rounded-xl shadow-sm flex flex-col justify-between">
          <span className="text-xs font-mono text-[#71717a] uppercase tracking-wider">Cumulative Layout Shift</span>
          <div className="flex items-baseline justify-between mt-1">
            <span className="font-mono text-2xl font-bold text-[#171717]">
              {site.cls != null ? site.cls.toFixed(3) : '—'}
            </span>
            {site.cls != null && (
              <span className={`font-mono text-xs font-medium ${site.cls <= 0.1 ? 'text-[#16a34a]' : site.cls <= 0.25 ? 'text-[#b45309]' : 'text-[#dc2626]'}`}>
                {site.cls <= 0.1 ? 'Good' : site.cls <= 0.25 ? 'Needs improvement' : 'Poor'}
              </span>
            )}
          </div>
          <p className="text-[11px] text-[#71717a] mt-1">Measured by the edge browser audit</p>
        </div>
      </div>

      {/* Sub Tabs */}
      <div className="flex border-b border-[#e4e4e7] gap-2 pt-2">
        <button
          onClick={() => setActiveTab('presets')}
          className={`pb-2.5 px-3 text-xs sm:text-[13px] font-medium border-b-2 transition-colors flex items-center gap-1.5 ${
            activeTab === 'presets'
              ? 'border-[#f03e2f] text-[#171717] font-semibold'
              : 'border-transparent text-[#71717a] hover:text-[#171717]'
          }`}
        >
          <Sliders className="w-3.5 h-3.5" />
          <span>Optimization Engine</span>
        </button>

        <button
          onClick={() => setActiveTab('critical-css')}
          className={`pb-2.5 px-3 text-xs sm:text-[13px] font-medium border-b-2 transition-colors flex items-center gap-1.5 ${
            activeTab === 'critical-css'
              ? 'border-[#f03e2f] text-[#171717] font-semibold'
              : 'border-transparent text-[#71717a] hover:text-[#171717]'
          }`}
        >
          <Code className="w-3.5 h-3.5" />
          <span>Critical CSS & R2 Assets</span>
        </button>

        <button
          onClick={() => setActiveTab('connection')}
          className={`pb-2.5 px-3 text-xs sm:text-[13px] font-medium border-b-2 transition-colors flex items-center gap-1.5 ${
            activeTab === 'connection'
              ? 'border-[#f03e2f] text-[#171717] font-semibold'
              : 'border-transparent text-[#71717a] hover:text-[#171717]'
          }`}
        >
          <KeyRound className="w-3.5 h-3.5" />
          <span>Connection</span>
        </button>
      </div>

      {/* TAB 1: OPTIMIZATION PRESETS & GRANULAR SWITCHES */}
      {activeTab === 'presets' && (
        <div className="space-y-6">
          {/* Master Presets Cards */}
          <div className="bg-white border border-[#e4e4e7] rounded-2xl p-6 shadow-sm space-y-4">
            <h3 className="text-base font-semibold text-[#171717]">Master Presets</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {/* Safe */}
              <div
                onClick={() => handleApplyPreset('safe')}
                className={`p-4 rounded-xl border cursor-pointer transition-all ${
                  currentPreset === 'safe'
                    ? 'border-[#171717] bg-[#f8f8f7] ring-1 ring-[#171717]'
                    : 'border-[#e4e4e7] hover:border-[#a1a1aa]'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="font-semibold text-sm text-[#171717]">Safe Mode</span>
                  <span className="font-mono text-xs text-[#71717a]">100% compat</span>
                </div>
                <p className="text-xs text-[#71717a] leading-relaxed">
                  Drop-in page caching, no script transformation. Guaranteed theme compatibility.
                </p>
              </div>

              {/* Aggressive */}
              <div
                onClick={() => handleApplyPreset('aggressive')}
                className={`p-4 rounded-xl border cursor-pointer transition-all ${
                  currentPreset === 'aggressive'
                    ? 'border-[#171717] bg-[#f8f8f7] ring-1 ring-[#171717]'
                    : 'border-[#e4e4e7] hover:border-[#a1a1aa]'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="font-semibold text-sm text-[#171717]">Aggressive</span>
                  <span className="font-mono text-xs text-[#16a34a] font-medium">Balanced</span>
                </div>
                <p className="text-xs text-[#71717a] leading-relaxed">
                  Critical CSS inlining in head, deferred scripts, W3C Speculation Rules hover prerendering.
                </p>
              </div>

              {/* Ludicrous Speed */}
              <div
                onClick={() => handleApplyPreset('ludicrous')}
                className={`p-4 rounded-xl border cursor-pointer transition-all relative ${
                  currentPreset === 'ludicrous'
                    ? 'border-[#f03e2f] bg-[#fff1ef]/40 ring-1 ring-[#f03e2f]'
                    : 'border-[#e4e4e7] hover:border-[#a1a1aa]'
                }`}
              >
                <span className="font-mono text-[9px] font-bold uppercase tracking-wider bg-[#f03e2f] text-white px-2 py-0.5 rounded-full absolute top-3 right-3">
                  Recommended
                </span>
                <div className="flex items-center gap-1.5 mb-1">
                  <Zap className="w-3.5 h-3.5 text-[#f03e2f] fill-current" />
                  <span className="font-semibold text-sm text-[#171717]">Ludicrous Speed</span>
                </div>
                <p className="text-xs text-[#71717a] leading-relaxed pr-16">
                  Critical CSS, optional interaction-based script delay and dynamic nonces for maximum scores.
                </p>
              </div>
            </div>
          </div>

          {/* Granular Switches */}
          <div className="bg-white border border-[#e4e4e7] rounded-2xl p-6 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-semibold text-[#171717]">Granular Performance Switches</h3>
                <p className="text-xs text-[#71717a]">Customize edge pipeline parameters specifically for this WordPress origin</p>
              </div>
              <button
                onClick={handleSaveGranularSettings}
                className="btn btn-primary text-xs py-1.5 px-3"
              >
                <Check className="w-3.5 h-3.5 mr-1" />
                <span>Save Settings</span>
              </button>
            </div>

            <div className="space-y-3 pt-2">
              <div className="flex items-center justify-between p-3.5 border border-[#e4e4e7] rounded-xl">
                <div>
                  <h4 className="text-xs font-semibold text-[#171717]">Edge Critical CSS Inlining</h4>
                  <p className="text-[11.5px] text-[#71717a]">Injects above-the-fold CSS and defers full stylesheets.</p>
                </div>
                <input
                  type="checkbox"
                  checked={enableCriticalCss}
                  onChange={(e) => setEnableCriticalCss(e.target.checked)}
                  className="w-4 h-4 accent-[#f03e2f]"
                />
              </div>

              <div className="flex items-center justify-between p-3.5 border border-[#e4e4e7] rounded-xl">
                <div>
                  <h4 className="text-xs font-semibold text-[#171717]">Dynamic Nonces & Cart Micro-Hydrator</h4>
                  <p className="text-[11.5px] text-[#71717a]">Refreshes cached WordPress form tokens and WooCommerce carts after load.</p>
                </div>
                <input
                  type="checkbox"
                  checked={enableDynamicNonces}
                  onChange={(e) => setEnableDynamicNonces(e.target.checked)}
                  className="w-4 h-4 accent-[#f03e2f]"
                />
              </div>

              <div className="flex items-center justify-between p-3.5 border border-[#e4e4e7] rounded-xl">
                <div>
                  <h4 className="text-xs font-semibold text-[#171717]">W3C Speculation Rules Prerendering</h4>
                  <p className="text-[11.5px] text-[#71717a]">Prerenders links on hover for near-instant navigation.</p>
                </div>
                <input
                  type="checkbox"
                  checked={enableSpeculation}
                  onChange={(e) => setEnableSpeculation(e.target.checked)}
                  className="w-4 h-4 accent-[#f03e2f]"
                />
              </div>

              <div className="p-3.5 border border-[#e4e4e7] rounded-xl space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-semibold text-[#171717]">Script Delayer Safety Timeout</h4>
                  <span className="font-mono text-xs text-[#71717a]">{jsDelayTimeout}ms</span>
                </div>
                <input
                  type="range"
                  min="1500"
                  max="6000"
                  step="500"
                  value={jsDelayTimeout}
                  onChange={(e) => setJsDelayTimeout(Number(e.target.value))}
                  className="w-full accent-[#f03e2f]"
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: CRITICAL CSS & R2 ASSETS */}
      {activeTab === 'critical-css' && (
        <div className="bg-white border border-[#e4e4e7] rounded-2xl p-6 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-base font-semibold text-[#171717]">R2 Critical CSS Storage</h3>
              <p className="text-xs text-[#71717a]">Generated CSS is stored in Cloudflare R2 and streamed to your WordPress plugin</p>
            </div>
            <span className={`chip ${latestCssJobs.some(({ job }) => job) ? 'chip-success' : 'chip-neutral'}`}>
              <span className="chip-dot" />
              {latestCssJobs.some(({ job }) => job) ? 'Extracted & Synced' : 'Not extracted yet'}
            </span>
          </div>

          {latestCssJobs.map(({ viewport, job }) => (
            <div key={viewport} className="p-4 bg-[#f8f8f7] border border-[#e4e4e7] rounded-xl font-mono text-xs space-y-2">
              <div className="flex justify-between">
                <span className="text-[#71717a]">Viewport:</span>
                <span className="text-[#171717] capitalize">{viewport}</span>
              </div>
              {job ? (
                <>
                  <div className="flex justify-between">
                    <span className="text-[#71717a]">Source URL:</span>
                    <span className="text-[#171717] truncate max-w-[60%]" title={job.url}>{job.url}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[#71717a]">Critical CSS Size:</span>
                    <span className="text-[#171717]">{job.criticalCssSizeKb != null ? `${job.criticalCssSizeKb} KB` : '—'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[#71717a]">LCP Candidate Element:</span>
                    <span className="text-[#16a34a] truncate max-w-[60%]" title={job.lcpSelector || undefined}>
                      {job.lcpSelector || '—'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[#71717a]">Extracted:</span>
                    <span className="text-[#171717]">{job.createdAt}</span>
                  </div>
                </>
              ) : (
                <p className="text-[#71717a]">
                  No completed extraction for this viewport yet — run an optimization to generate critical CSS.
                </p>
              )}
            </div>
          ))}
        </div>
      )}

      {/* TAB 3: CONNECTION */}
      {activeTab === 'connection' && (
        <div className="bg-white border border-[#e4e4e7] rounded-2xl p-6 shadow-sm space-y-6">
          <div>
            <h3 className="text-base font-semibold text-[#171717]">Site Connection</h3>
            <p className="text-xs text-[#71717a] mt-0.5">
              Your API key was shown once when the site was connected. It is stored (hashed) on the edge and
              in your WordPress admin under <strong>TurboPress → Settings</strong>.
            </p>
          </div>

          <div className="p-4 border border-[#e4e4e7] rounded-xl space-y-2 text-xs">
            <div className="flex justify-between">
              <span className="text-[#71717a]">WordPress REST Route:</span>
              <code className="text-[#171717]">/wp-json/turbopress/v1/nonces</code>
            </div>
            <div className="flex justify-between">
              <span className="text-[#71717a]">Edge API Gateway:</span>
              <code className="text-[#171717]">https://turbopress.webaccessibility.workers.dev</code>
            </div>
            <div className="flex justify-between">
              <span className="text-[#71717a]">WordPress Version:</span>
              <span className="text-[#171717] font-mono">{site.wp_version || 'Not reported yet'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#71717a]">Plugin Version:</span>
              <span className="text-[#171717] font-mono">{site.plugin_version || 'Not reported yet'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#71717a]">Heartbeat Status:</span>
              <span className={heartbeatFresh ? 'text-[#16a34a] font-medium' : 'text-[#b45309] font-medium'}>
                {heartbeatFresh
                  ? `● Plugin verified ${lastPing!.toLocaleDateString()} ${lastPing!.toLocaleTimeString()}`
                  : lastPing
                    ? `● Last plugin ping ${lastPing.toLocaleDateString()} — reconnect the plugin`
                    : '● Awaiting first plugin sync'}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
