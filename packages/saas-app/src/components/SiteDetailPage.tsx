'use client';

import React, { useState, useEffect } from 'react';
import { useAuth } from '@clerk/nextjs';
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
  LayoutTemplate,
  ShieldCheck,
} from 'lucide-react';
import { ExtendedSite, SitePreset, OptimizationJobItem, SitePagesData } from '../types';
import { SiteConfig } from '@turbopress/shared';
import { api } from '../services/api';

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
  const { getToken } = useAuth();
  const [activeTab, setActiveTab] = useState<'presets' | 'critical-css' | 'pages' | 'connection'>('presets');
  const [currentPreset, setCurrentPreset] = useState<SitePreset>(site.config?.preset || 'ludicrous');
  const [isPurging, setIsPurging] = useState(false);
  const [isRunning, setIsRunning] = useState(false);

  // Granular settings local state
  const [jsDelayTimeout, setJsDelayTimeout] = useState(site.config?.javascript?.delay_timeout_ms || 3500);
  const [enableCriticalCss, setEnableCriticalCss] = useState(site.config?.critical_css?.enabled ?? true);
  const [enableDynamicNonces, setEnableDynamicNonces] = useState(site.config?.dynamic?.nonce_ajax_refresh ?? true);
  const [enableSpeculation, setEnableSpeculation] = useState(site.config?.dynamic?.speculation_rules_prerender ?? true);

  // Deployment (Test Mode / Auto Mode) local state
  const [deployStatus, setDeployStatus] = useState<'test' | 'live'>(site.config?.deployment?.status ?? 'live');
  const [autoDegrade, setAutoDegrade] = useState(site.config?.deployment?.auto_degrade ?? true);
  const [isDeploying, setIsDeploying] = useState(false);

  // Pages tab data (lazy) + audits for the CWV trend
  const [pagesData, setPagesData] = useState<SitePagesData | null>(null);
  const [pagesLoading, setPagesLoading] = useState(false);
  const [rerunningPage, setRerunningPage] = useState<string | null>(null);
  const [audits, setAudits] = useState<any[]>([]);

  // Fetch audits once for the score trend sparkline
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const token = await getToken();
        const detail = await api.getSiteDetail(token, site.id);
        if (!cancelled && Array.isArray(detail.audits)) setAudits(detail.audits);
      } catch {
        // audits are optional decoration
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [site.id, getToken]);

  // Lazy-load per-page data when the Pages tab opens
  useEffect(() => {
    if (activeTab !== 'pages' || pagesData || pagesLoading) return;
    let cancelled = false;
    setPagesLoading(true);
    (async () => {
      try {
        const token = await getToken();
        const data = await api.getSitePages(token, site.id);
        if (!cancelled) setPagesData(data);
      } catch {
        // leave empty state
      } finally {
        if (!cancelled) setPagesLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, site.id]);

  // Real heartbeat derived from plugin pings
  const lastPing = site.last_ping_at ? new Date(site.last_ping_at * 1000) : null;
  const heartbeatFresh = lastPing != null && Date.now() - site.last_ping_at! * 1000 < 24 * 3600 * 1000;

  const handleSetDeployment = async (status: 'test' | 'live') => {
    if (!onUpdateConfig || isDeploying) return;
    setIsDeploying(true);
    try {
      const baseConfig: SiteConfig =
        site.config ||
        ({
          version: '1.4.0',
          preset: currentPreset,
          caching: {
            enabled: true,
            ttl: 604800,
            mobile_cache: true,
            purge_on_post_update: true,
            purge_on_comment: false,
            strip_query_params: [],
            excluded_urls: [],
            excluded_cookies: [],
          },
          critical_css: {
            enabled: true,
            inline: true,
            async_load_full: true,
            font_display_swap: true,
            viewports: ['mobile', 'desktop'],
            excluded_stylesheets: [],
          },
          javascript: {
            execution_mode: 'defer',
            delay_timeout_ms: 3500,
            preserve_execution_order: true,
            exclusions: [],
            remove_jquery_migrate: false,
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
            offload_images: false,
            offload_video: false,
            offload_widths: [320, 480, 768, 1200, 1600],
          },
          dynamic: {
            speculation_rules_prerender: true,
            speculation_rules_eagerness: 'moderate',
            nonce_ajax_refresh: true,
            cart_micro_hydration: true,
            excluded_prerender_paths: [],
          },
        } as SiteConfig);

      const updated: SiteConfig = {
        ...baseConfig,
        deployment: { status, auto_degrade: autoDegrade },
      };
      await onUpdateConfig(site.id, updated);
      setDeployStatus(status);
      await onPurgeCache(site.domain);
      onToast(
        status === 'live'
          ? 'Deployed — optimized HTML is now served to all visitors'
          : 'Entered Test Mode — visitors see unoptimized HTML until you deploy'
      );
    } catch (err: any) {
      onToast(err.message || 'Failed to change deployment status');
    } finally {
      setIsDeploying(false);
    }
  };

  const handleToggleAutoDegrade = async (enabled: boolean) => {
    if (!onUpdateConfig) return;
    setAutoDegrade(enabled);
    try {
      const baseConfig = site.config;
      if (!baseConfig) return;
      await onUpdateConfig(site.id, {
        ...baseConfig,
        deployment: { status: deployStatus, auto_degrade: enabled },
      });
      onToast(enabled ? 'Auto-protect enabled' : 'Auto-protect disabled');
    } catch (err: any) {
      setAutoDegrade(!enabled);
      onToast(err.message || 'Failed to save auto-protect setting');
    }
  };

  const handleRerunPage = async (url: string) => {
    setRerunningPage(url);
    try {
      const token = await getToken();
      await api.dispatchJob(token, { url, viewports: ['mobile', 'desktop'], site_id: site.id });
      onToast(`Re-optimization queued for ${url}`);
    } catch (err: any) {
      onToast(err.message || 'Failed to queue job');
    } finally {
      setRerunningPage(null);
    }
  };

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
      version: '1.2.0',
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
      css: {
        combine: true,
        minify: true,
        max_files: 40,
        inline_all: true,
        inline_all_threshold: 153600,
      },
      assets: {
        proxy_enabled: true,
        keep_origins: [],
      },
      htaccess: {
        enabled: true,
        brotli_filters: true,
      },
      javascript: {
        execution_mode: 'defer',
        delay_timeout_ms: jsDelayTimeout,
        preserve_execution_order: true,
        exclusions: [],
        remove_jquery_migrate: false,
        worker_offload: [],
      },
      fonts: {
        localize_google: true,
        preload_lcp_font: true,
      },
      hints: {
        resource_hints: true,
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
        offload_images: false,
        offload_video: false,
        offload_widths: [320, 480, 768, 1200, 1600],
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
      deployment: baseConfig.deployment ?? { status: deployStatus, auto_degrade: autoDegrade },
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

  // CWV trend sparkline: mobile performance score over the last 10 audits (oldest → newest)
  const renderSparkline = (values: number[], label: string) => {
    if (values.length < 2) {
      return (
        <div className="flex items-center justify-between p-3.5 bg-white border border-[#e4e4e7] rounded-xl shadow-sm">
          <span className="font-mono text-xs text-[#71717a] uppercase tracking-wider">{label}</span>
          <span className="text-xs text-[#a1a1aa]">Need 2+ audits for a trend</span>
        </div>
      );
    }
    const w = 200;
    const h = 40;
    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = max - min || 1;
    const points = values
      .map((v, i) => {
        const x = (i / (values.length - 1)) * w;
        const y = h - ((v - min) / range) * (h - 6) - 3;
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(' ');
    const last = values[values.length - 1];
    const color = last >= 90 ? '#16a34a' : last >= 50 ? '#f59e0b' : '#dc2626';

    return (
      <div className="flex items-center justify-between gap-4 p-3.5 bg-white border border-[#e4e4e7] rounded-xl shadow-sm">
        <div>
          <span className="font-mono text-xs text-[#71717a] uppercase tracking-wider block">{label}</span>
          <span className="font-mono text-lg font-bold text-[#171717]">{last}</span>
        </div>
        <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="flex-none">
          <polyline points={points} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          <circle
            cx={w}
            cy={h - ((last - min) / range) * (h - 6) - 3}
            r="3"
            fill={color}
          />
        </svg>
      </div>
    );
  };

  const mobileScoreTrend = audits
    .filter((a) => a?.device === 'mobile' && typeof a?.performance_score === 'number')
    .sort((a, b) => a.created_at - b.created_at)
    .slice(-10)
    .map((a) => a.performance_score);

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

      {/* CWV score trend (only when we have enough audits) */}
      {mobileScoreTrend.length >= 2 && renderSparkline(mobileScoreTrend, 'Mobile Score Trend (last 10 audits)')}

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
          onClick={() => setActiveTab('pages')}
          className={`pb-2.5 px-3 text-xs sm:text-[13px] font-medium border-b-2 transition-colors flex items-center gap-1.5 ${
            activeTab === 'pages'
              ? 'border-[#f03e2f] text-[#171717] font-semibold'
              : 'border-transparent text-[#71717a] hover:text-[#171717]'
          }`}
        >
          <LayoutTemplate className="w-3.5 h-3.5" />
          <span>Pages</span>
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

          {/* Deployment / Auto Mode */}
          <div className="bg-white border border-[#e4e4e7] rounded-2xl p-6 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-[#171717]" />
                <h3 className="text-base font-semibold text-[#171717]">Deployment</h3>
              </div>
              <span
                className={`chip ${deployStatus === 'live' ? 'chip-success' : 'chip-warn'}`}
                data-testid="deployment-status"
              >
                <span className="chip-dot" />
                {deployStatus === 'live' ? 'Live — all visitors optimized' : 'Test Mode — visitors unoptimized'}
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="p-4 bg-[#f8f8f7] border border-[#e4e4e7] rounded-xl space-y-2">
                <h4 className="text-xs font-semibold text-[#171717]">Staged Rollout</h4>
                <p className="text-[11.5px] text-[#71717a] leading-relaxed">
                  {deployStatus === 'test'
                    ? 'Only admins see optimized HTML (via the ?tp_preview=1 URL param in WP admin). Visitors get the original page.'
                    : 'Optimized HTML is served to every visitor.'}
                </p>
                <button
                  onClick={() => handleSetDeployment(deployStatus === 'live' ? 'test' : 'live')}
                  disabled={isDeploying || !onUpdateConfig}
                  className={`btn text-xs py-1.5 px-3 ${deployStatus === 'test' ? 'btn-primary' : 'btn-secondary'}`}
                >
                  {isDeploying ? 'Applying…' : deployStatus === 'test' ? 'Deploy to Visitors' : 'Enter Test Mode'}
                </button>
              </div>

              <div className="p-4 bg-[#f8f8f7] border border-[#e4e4e7] rounded-xl space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-semibold text-[#171717]">Auto-Protect</h4>
                  <input
                    type="checkbox"
                    checked={autoDegrade}
                    onChange={(e) => handleToggleAutoDegrade(e.target.checked)}
                    disabled={!onUpdateConfig || !site.config}
                    className="w-4 h-4 accent-[#f03e2f]"
                  />
                </div>
                <p className="text-[11.5px] text-[#71717a] leading-relaxed">
                  Monitors real-user JS errors. If the error rate spikes after a change, TurboPress automatically
                  steps JavaScript optimization down (delay → defer → none) and purges caches.
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

      {/* TAB 3: PAGES */}
      {activeTab === 'pages' && (
        <div className="space-y-6">
          {/* RUM vitals strip */}
          <div className="bg-white border border-[#e4e4e7] rounded-2xl p-6 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-semibold text-[#171717]">Real-User Vitals (last 7 days)</h3>
                <p className="text-xs text-[#71717a]">Collected by the Turbopress RUM beacon on every optimized pageview</p>
              </div>
            </div>
            {pagesLoading ? (
              <p className="text-xs text-[#71717a]">Loading…</p>
            ) : !pagesData || pagesData.rum.length === 0 ? (
              <p className="text-xs text-[#71717a]">No real-user data yet — deploy the plugin and let traffic flow in.</p>
            ) : (
              (() => {
                const rum = [...pagesData.rum].sort((a, b) => a.day.localeCompare(b.day));
                const views = rum.reduce((s, r) => s + r.views, 0);
                const errors = rum.reduce((s, r) => s + r.errors, 0);
                const latest = rum[rum.length - 1];
                const errorRate = views > 0 ? (errors / views) * 100 : 0;
                return (
                  <>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      <div className="p-3.5 bg-[#f8f8f7] border border-[#e4e4e7] rounded-xl">
                        <span className="font-mono text-[10px] text-[#71717a] uppercase tracking-wider block">Pageviews</span>
                        <span className="font-mono text-xl font-bold text-[#171717]">{views.toLocaleString()}</span>
                      </div>
                      <div className="p-3.5 bg-[#f8f8f7] border border-[#e4e4e7] rounded-xl">
                        <span className="font-mono text-[10px] text-[#71717a] uppercase tracking-wider block">JS Errors</span>
                        <span className={`font-mono text-xl font-bold ${errorRate > 1 ? 'text-[#dc2626]' : 'text-[#16a34a]'}`}>
                          {errors.toLocaleString()}
                        </span>
                        <span className="text-[11px] text-[#71717a] block">{errorRate.toFixed(2)}% rate</span>
                      </div>
                      <div className="p-3.5 bg-[#f8f8f7] border border-[#e4e4e7] rounded-xl">
                        <span className="font-mono text-[10px] text-[#71717a] uppercase tracking-wider block">LCP p75</span>
                        <span className={`font-mono text-xl font-bold ${latest.lcpP75 == null ? 'text-[#a1a1aa]' : latest.lcpP75 <= 2500 ? 'text-[#16a34a]' : 'text-[#b45309]'}`}>
                          {latest.lcpP75 != null ? `${(latest.lcpP75 / 1000).toFixed(2)}s` : '—'}
                        </span>
                      </div>
                      <div className="p-3.5 bg-[#f8f8f7] border border-[#e4e4e7] rounded-xl">
                        <span className="font-mono text-[10px] text-[#71717a] uppercase tracking-wider block">CLS p75</span>
                        <span className={`font-mono text-xl font-bold ${latest.clsP75 == null ? 'text-[#a1a1aa]' : latest.clsP75 <= 0.1 ? 'text-[#16a34a]' : 'text-[#b45309]'}`}>
                          {latest.clsP75 != null ? latest.clsP75.toFixed(3) : '—'}
                        </span>
                      </div>
                    </div>
                    {/* tiny per-day bar strip */}
                    <div className="flex items-end gap-1.5 h-12">
                      {rum.map((r) => {
                        const maxViews = Math.max(...rum.map((x) => x.views), 1);
                        return (
                          <div key={r.day} className="flex-1 flex flex-col items-center gap-1" title={`${r.day}: ${r.views} views, ${r.errors} errors`}>
                            <div
                              className={`w-full rounded-sm ${r.errors > 0 && r.views > 0 && r.errors / r.views > 0.01 ? 'bg-[#f03e2f]' : 'bg-[#171717]'}`}
                              style={{ height: `${Math.max(4, (r.views / maxViews) * 40)}px`, opacity: 0.8 }}
                            />
                            <span className="font-mono text-[8px] text-[#a1a1aa]">{r.day.slice(5)}</span>
                          </div>
                        );
                      })}
                    </div>
                  </>
                );
              })()
            )}
          </div>

          {/* Per-page optimization table */}
          <div className="bg-white border border-[#e4e4e7] rounded-2xl p-6 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-semibold text-[#171717]">Optimized Pages</h3>
                <p className="text-xs text-[#71717a]">Per-URL critical CSS coverage, job health, and re-run actions</p>
              </div>
            </div>
            {pagesLoading ? (
              <p className="text-xs text-[#71717a]">Loading…</p>
            ) : !pagesData || pagesData.pages.length === 0 ? (
              <p className="text-xs text-[#71717a]">No optimization jobs yet — run an optimization to build page coverage.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-left text-[#71717a] font-mono uppercase tracking-wider text-[10px] border-b border-[#e4e4e7]">
                      <th className="pb-2 pr-4">Page</th>
                      <th className="pb-2 pr-4">Critical CSS</th>
                      <th className="pb-2 pr-4">Jobs</th>
                      <th className="pb-2 pr-4">Last Run</th>
                      <th className="pb-2 pr-4"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {pagesData.pages.map((p) => (
                      <tr key={p.url} className="border-b border-[#f1f1f2]">
                        <td className="py-2.5 pr-4">
                          <span className="font-mono text-[#171717]" title={p.url}>{p.path}</span>
                        </td>
                        <td className="py-2.5 pr-4">
                          {p.criticalCssKb != null ? (
                            <span className="font-mono text-[#171717]">
                              {p.criticalCssKb} KB
                              <span className={`ml-1.5 text-[10px] ${p.cssAgeHours != null && p.cssAgeHours > 168 ? 'text-[#b45309]' : 'text-[#71717a]'}`}>
                                · {p.cssAgeHours != null ? (p.cssAgeHours < 24 ? `${p.cssAgeHours}h old` : `${Math.round(p.cssAgeHours / 24)}d old`) : ''}
                              </span>
                            </span>
                          ) : (
                            <span className="text-[#a1a1aa]">—</span>
                          )}
                        </td>
                        <td className="py-2.5 pr-4">
                          <span className="font-mono text-[#171717]">{p.completedJobs}/{p.totalJobs}</span>
                          {p.failedJobs > 0 && (
                            <span className="ml-1.5 chip chip-danger" style={{ padding: '1px 6px' }}>
                              <span className="chip-dot" />
                              {p.failedJobs} failed
                            </span>
                          )}
                        </td>
                        <td className="py-2.5 pr-4 text-[#71717a]">{p.lastRunRelative || '—'}</td>
                        <td className="py-2.5 pr-4">
                          <button
                            onClick={() => handleRerunPage(p.url)}
                            disabled={rerunningPage === p.url}
                            className="btn btn-secondary text-[11px] py-1 px-2.5"
                          >
                            <RotateCcw className="w-3 h-3 mr-1" />
                            {rerunningPage === p.url ? 'Queuing…' : 'Re-run'}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 4: CONNECTION */}
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
