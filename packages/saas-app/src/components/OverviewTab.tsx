'use client';

import React, { useState, useEffect } from 'react';
import { useAuth } from '@clerk/nextjs';
import { Play, RotateCcw, ExternalLink, AlertTriangle, AlertOctagon, Plus, Zap, ArrowRight } from 'lucide-react';
import { ExtendedSite, AttentionItem, AttentionFeedData } from '../types';
import { api } from '../services/api';

interface OverviewTabProps {
  sites: ExtendedSite[];
  totalRunsUsed?: number;
  totalRunsMax?: number;
  onSelectSite: (site: ExtendedSite) => void;
  onNavigateToJobs: () => void;
  onNavigateToConnect: () => void;
  onPurgeSite: (domain: string) => void;
  onRunOptimization: (domain: string) => void;
  onToast: (msg: string) => void;
}

export const OverviewTab: React.FC<OverviewTabProps> = ({
  sites,
  totalRunsUsed = 0,
  totalRunsMax = 200,
  onSelectSite,
  onNavigateToJobs,
  onNavigateToConnect,
  onPurgeSite,
  onRunOptimization,
  onToast,
}) => {
  const { getToken } = useAuth();
  const [sortKey, setSortKey] = useState<'domain' | 'score' | 'lcp' | 'cacheHitRate'>('score');
  const [sortDir, setSortDir] = useState<1 | -1>(-1); // Default descending score
  const [attentionFeed, setAttentionFeed] = useState<AttentionFeedData | null>(null);

  // Fetch the edge attention feed (failed jobs + health/auto-degrade warnings)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const token = await getToken();
        const data = await api.getAttention(token);
        if (!cancelled) setAttentionFeed(data);
      } catch {
        // attention feed is supplementary
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [getToken]);

  // Calculate live aggregate KPI metrics (only from sites with real measurements)
  const scoredSites = sites.filter((s) => s.score != null);
  const avgScore = scoredSites.length > 0
    ? Math.round(scoredSites.reduce((acc, s) => acc + (s.score || 0), 0) / scoredSites.length)
    : null;

  const lcpSites = sites.filter((s) => s.lcp != null);
  const medianLcp = lcpSites.length > 0
    ? (lcpSites.reduce((acc, s) => acc + (s.lcp || 0), 0) / lcpSites.length).toFixed(1)
    : null;

  const cacheSites = sites.filter((s) => s.cacheHitRate != null);
  const avgCacheHit = cacheSites.length > 0
    ? Math.round(cacheSites.reduce((acc, s) => acc + (s.cacheHitRate || 0), 0) / cacheSites.length)
    : null;

  // Build live attention queue from real sites
  const dynamicAttentionItems: AttentionItem[] = sites
    .filter((s) => s.status === 'attention' || s.status === 'disconnected' || (s.score != null && s.score < 75))
    .map((s) => {
      if (s.status === 'disconnected') {
        return {
          id: `att-${s.id}`,
          type: 'warn' as const,
          title: `${s.domain} — plugin disconnected or awaiting sync`,
          description: 'No active heartbeat detected from WordPress plugin. Edge cache may be bypassed.',
          domain: s.domain,
          actionLabel: 'Connect settings',
        };
      }
      return {
        id: `att-${s.id}`,
        type: 'danger' as const,
        title: `${s.domain} — needs optimization pass`,
        description: `Measured performance score is ${s.score ?? 'not yet measured'}. Run Critical CSS & LCP extractor to improve it.`,
        domain: s.domain,
        actionLabel: 'Optimize now',
        jobId: `job_${s.id.slice(-5)}`,
      };
    });

  // Merge the edge attention feed (real failed jobs + health warnings) — dedup by id
  if (attentionFeed) {
    for (const w of attentionFeed.warnings) {
      dynamicAttentionItems.push({
        id: `warn-${w.siteId}-${w.kind}-${w.at || 0}`,
        type: w.kind === 'auto_degrade' ? 'warn' : 'danger',
        title: `${w.domain} — ${w.kind === 'auto_degrade' ? 'auto-protect stepped in' : 'health check failing'}`,
        description: w.message,
        domain: w.domain,
        actionLabel: 'Open site',
      });
    }
    for (const j of attentionFeed.jobs) {
      dynamicAttentionItems.push({
        id: `job-${j.id}`,
        type: j.status === 'needs_attention' ? 'warn' : 'danger',
        title: `${j.siteDomain} — ${j.status === 'needs_attention' ? 'job needs attention' : 'job failed'}`,
        description: `${j.url} (${j.viewport}): ${j.errorMessage || 'unknown error'}`,
        domain: j.siteDomain,
        actionLabel: 'View jobs',
        jobId: j.id,
      });
    }
  }

  const handleSort = (key: 'domain' | 'score' | 'lcp' | 'cacheHitRate') => {
    if (sortKey === key) {
      setSortDir((prev) => (prev === 1 ? -1 : 1));
    } else {
      setSortKey(key);
      setSortDir(1);
    }
  };

  const sortedSites = [...sites].sort((a, b) => {
    const valA = a[sortKey];
    const valB = b[sortKey];
    if (typeof valA === 'string' && typeof valB === 'string') {
      return valA.localeCompare(valB) * sortDir;
    }
    return ((Number(valA) || 0) - (Number(valB) || 0)) * sortDir;
  });

  const getScoreColor = (score: number) => {
    if (score >= 90) return '#16a34a';
    if (score >= 50) return '#f59e0b';
    return '#dc2626';
  };

  const renderScoreRing = (score: number | null) => {
    if (score == null) {
      return <span className="font-mono text-[13px] text-[#a1a1aa]">—</span>;
    }
    const r = 15.5;
    const c = 2 * Math.PI * r;
    const offset = c * (1 - score / 100);
    const color = getScoreColor(score);

    return (
      <div className="ring" role="img" aria-label={`Score ${score}`}>
        <svg width="38" height="38" viewBox="0 0 38 38">
          <circle cx="19" cy="19" r={r} fill="none" stroke="#f1f1f2" strokeWidth="3" />
          <circle
            cx="19"
            cy="19"
            r={r}
            fill="none"
            stroke={color}
            strokeWidth="3"
            strokeDasharray={c}
            strokeDashoffset={offset}
            strokeLinecap="round"
            className="transition-all duration-700"
          />
        </svg>
        <span className="ring-num num">{score}</span>
      </div>
    );
  };

  if (sites.length === 0) {
    return (
      <div className="space-y-8 animate-fade-in">
        {/* Page Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-[26px] font-semibold tracking-tight text-[#171717]">
              Fleet Overview
            </h1>
            <p className="text-[13.5px] text-[#71717a] mt-0.5">
              Welcome to TurboPress · High-Performance Zero-DNS WordPress Optimization Engine
            </p>
          </div>

          <button onClick={onNavigateToConnect} className="btn btn-primary text-xs sm:text-[13px]">
            <Plus className="w-3.5 h-3.5" />
            <span>Connect First Site</span>
          </button>
        </div>

        {/* Empty State Card */}
        <div className="bg-white border border-[#e4e4e7] rounded-3xl p-8 sm:p-12 text-center max-w-2xl mx-auto shadow-sm space-y-6">
          <div className="w-14 h-14 rounded-2xl bg-[#fff1ef] text-[#f03e2f] grid place-items-center mx-auto shadow-sm">
            <Zap className="w-7 h-7 fill-current" />
          </div>

          <div className="space-y-2">
            <h2 className="text-xl sm:text-2xl font-semibold text-[#171717]">
              No WordPress sites connected yet
            </h2>
            <p className="text-sm text-[#71717a] max-w-md mx-auto leading-relaxed">
              Connect your first WordPress site in under 60 seconds with our 1-Click OAuth Handshake or install the TurboPress plugin.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-left pt-2">
            <div className="p-3.5 bg-[#f8f8f7] border border-[#e4e4e7] rounded-xl space-y-1">
              <span className="font-mono text-xs font-semibold text-[#171717] block">1. Install Plugin</span>
              <p className="text-[11.5px] text-[#71717a]">Upload the TurboPress plugin to your WP admin</p>
            </div>
            <div className="p-3.5 bg-[#f8f8f7] border border-[#e4e4e7] rounded-xl space-y-1">
              <span className="font-mono text-xs font-semibold text-[#171717] block">2. 1-Click Pair</span>
              <p className="text-[11.5px] text-[#71717a]">Zero-DNS cryptographic handshake syncs keys</p>
            </div>
            <div className="p-3.5 bg-[#f8f8f7] border border-[#e4e4e7] rounded-xl space-y-1">
              <span className="font-mono text-xs font-semibold text-[#171717] block">3. 95+ PageSpeed</span>
              <p className="text-[11.5px] text-[#71717a]">Automatic Critical CSS & sub-15ms edge cache</p>
            </div>
          </div>

          <div className="pt-4 flex flex-col sm:flex-row items-center justify-center gap-3">
            <button onClick={onNavigateToConnect} className="w-full sm:w-auto btn btn-primary px-6 py-2.5">
              <span>Launch Connect Flow</span>
              <ArrowRight className="w-4 h-4 ml-1.5" />
            </button>
            <button
              onClick={() => onToast('Plugin download package: turbopress.zip')}
              className="w-full sm:w-auto btn btn-secondary px-5 py-2.5"
            >
              Download WP Plugin (.zip)
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-fade-in">
      {/* Page Header with Worker Runs Meter */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-[26px] font-semibold tracking-tight text-[#171717]">
            Fleet Overview
          </h1>
          <p className="text-[13.5px] text-[#71717a] mt-0.5">
            Fleet health across {sites.length} connected WordPress site{sites.length === 1 ? '' : 's'} · Cloudflare Edge Active
          </p>
        </div>

        <div className="flex items-center gap-3 text-[13px] text-[#71717a] bg-white border border-[#e4e4e7] px-3.5 py-2 rounded-lg shadow-sm">
          <span className="font-mono text-[12.5px]">
            <strong className="text-[#171717]">{totalRunsUsed}</strong> / {totalRunsMax.toLocaleString()} runs
          </span>
          <div className="w-28 h-1.5 rounded-full bg-[#f1f1f2] overflow-hidden">
            <div
              className="h-full bg-[#171717] rounded-full transition-all duration-500"
              style={{ width: `${Math.min(100, Math.round((totalRunsUsed / totalRunsMax) * 100))}%` }}
            />
          </div>
        </div>
      </div>

      {/* KPI Strip */}
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* KPI 1: Avg mobile score */}
        <div className="bg-white border border-[#e4e4e7] rounded-xl p-4 flex flex-col justify-between hover:border-[#a1a1aa] transition-colors shadow-sm">
          <div>
            <span className="text-[12px] text-[#71717a] font-medium uppercase tracking-wider block mb-1">
              Avg mobile score
            </span>
            <div className="flex items-baseline justify-between">
              <span className="text-3xl font-semibold text-[#171717] num">{avgScore ?? '—'}</span>
              <span className="font-mono text-[11.5px] text-[#16a34a] font-medium flex items-center gap-1">
                {avgScore == null ? 'No audits yet' : avgScore >= 90 ? '90+ Target' : 'Needs boost'}
              </span>
            </div>
          </div>
          {avgScore != null && (
            <div className="h-1.5 mt-3 rounded-full bg-[#f1f1f2] overflow-hidden">
              <div
                className="h-full bg-[#16a34a] rounded-full transition-all duration-700"
                style={{ width: `${avgScore}%` }}
              />
            </div>
          )}
        </div>

        {/* KPI 2: Median LCP */}
        <div className="bg-white border border-[#e4e4e7] rounded-xl p-4 flex flex-col justify-between hover:border-[#a1a1aa] transition-colors shadow-sm">
          <div>
            <span className="text-[12px] text-[#71717a] font-medium uppercase tracking-wider block mb-1">
              Median LCP
            </span>
            <div className="flex items-baseline justify-between">
              <span className="text-3xl font-semibold text-[#171717] num">
                {medianLcp ?? '—'}{medianLcp != null && <span className="text-base font-normal text-[#71717a] ml-1">s</span>}
              </span>
              <span className="font-mono text-[11.5px] text-[#16a34a] font-medium flex items-center gap-1">
                {medianLcp == null ? 'No audits yet' : Number(medianLcp) <= 2.5 ? '⚡ Good' : 'Needs work'}
              </span>
            </div>
          </div>
          {medianLcp != null && (
            <div className="h-1.5 mt-3 rounded-full bg-[#f1f1f2] overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-700 ${Number(medianLcp) <= 2.5 ? 'bg-[#16a34a]' : 'bg-[#f59e0b]'}`}
                style={{ width: `${Math.min(100, Math.round((Number(medianLcp) / 4) * 100))}%` }}
              />
            </div>
          )}
        </div>

        {/* KPI 3: Edge Cache Hit Rate */}
        <div className="bg-white border border-[#e4e4e7] rounded-xl p-4 flex flex-col justify-between hover:border-[#a1a1aa] transition-colors shadow-sm">
          <div>
            <span className="text-[12px] text-[#71717a] font-medium uppercase tracking-wider block mb-1">
              Edge cache hit rate
            </span>
            <div className="flex items-baseline justify-between">
              <span className="text-3xl font-semibold text-[#171717] num">
                {avgCacheHit != null && <>{avgCacheHit}<span className="text-base font-normal text-[#71717a] ml-1">%</span></>}
                {avgCacheHit == null && '—'}
              </span>
              <span className="font-mono text-[11.5px] text-[#16a34a] font-medium flex items-center gap-1">
                {avgCacheHit == null ? 'Not reported' : '▲ Active'}
              </span>
            </div>
          </div>
          <p className="text-[11px] text-[#a1a1aa] mt-3 leading-snug">
            Reported by the TurboPress plugin once page cache telemetry is enabled.
          </p>
        </div>

        {/* KPI 4: Connected Sites */}
        <div className="bg-white border border-[#e4e4e7] rounded-xl p-4 flex flex-col justify-between hover:border-[#a1a1aa] transition-colors shadow-sm">
          <div>
            <span className="text-[12px] text-[#71717a] font-medium uppercase tracking-wider block mb-1">
              Active Sites
            </span>
            <div className="flex items-baseline justify-between">
              <span className="text-3xl font-semibold text-[#171717] num">{sites.length}</span>
              <span className="font-mono text-[11.5px] text-[#16a34a] font-medium flex items-center gap-1">
                ● Connected
              </span>
            </div>
          </div>
          <div className="h-1.5 mt-3 rounded-full bg-[#f1f1f2] overflow-hidden">
            <div className="h-full bg-[#171717] rounded-full" style={{ width: sites.length > 0 ? '100%' : '0%' }} />
          </div>
        </div>
      </section>

      {/* Attention Queue (if any alerts) */}
      {dynamicAttentionItems.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-[15px] font-semibold tracking-tight text-[#171717]">
              Needs attention
            </h2>
            <span className="meta">{dynamicAttentionItems.length} alerts</span>
          </div>

          <div className="bg-white border border-[#e4e4e7] rounded-2xl divide-y divide-[#f1f1f2] shadow-sm overflow-hidden">
            {dynamicAttentionItems.map((item) => (
              <div key={item.id} className="flex flex-col sm:flex-row sm:items-center gap-4 p-4 hover:bg-[#fafafa] transition-colors">
                <div
                  className={`w-7 h-7 rounded-lg flex items-center justify-center flex-none ${
                    item.type === 'danger' ? 'bg-[#fef2f2] text-[#dc2626]' : 'bg-[#fffbeb] text-[#b45309]'
                  }`}
                >
                  {item.type === 'danger' ? (
                    <AlertOctagon className="w-4 h-4" />
                  ) : (
                    <AlertTriangle className="w-4 h-4" />
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  <p className="text-[13.5px] font-semibold text-[#171717]">{item.title}</p>
                  <p className="text-[12.5px] text-[#71717a] mt-0.5">{item.description}</p>
                </div>

                <div className="flex items-center gap-2 sm:ml-auto">
                  {item.jobId ? (
                    <>
                      <button
                        onClick={onNavigateToJobs}
                        className="btn btn-secondary text-xs py-1.5 px-3"
                      >
                        View jobs
                      </button>
                      <button
                        onClick={() => {
                          onRunOptimization(item.domain);
                          onToast(`Job queued for ${item.domain}`);
                        }}
                        className="btn btn-primary text-xs py-1.5 px-3"
                      >
                        {item.actionLabel}
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={onNavigateToConnect}
                      className="btn btn-secondary text-xs py-1.5 px-3"
                    >
                      {item.actionLabel}
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* All Sites Table */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-[15px] font-semibold tracking-tight text-[#171717]">
            All sites
          </h2>
          <span className="meta">{sites.length} site{sites.length === 1 ? '' : 's'} managed</span>
        </div>

        <div className="bg-white border border-[#e4e4e7] rounded-2xl shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="ds-table">
              <thead>
                <tr>
                  <th
                    onClick={() => handleSort('domain')}
                    className="cursor-pointer hover:text-[#171717] select-none"
                  >
                    Site {sortKey === 'domain' && (sortDir === 1 ? '▲' : '▼')}
                  </th>
                  <th>Status</th>
                  <th
                    onClick={() => handleSort('score')}
                    className="cursor-pointer hover:text-[#171717] select-none"
                  >
                    Score {sortKey === 'score' && (sortDir === 1 ? '▲' : '▼')}
                  </th>
                  <th
                    onClick={() => handleSort('lcp')}
                    className="text-right cursor-pointer hover:text-[#171717] select-none"
                  >
                    LCP {sortKey === 'lcp' && (sortDir === 1 ? '▲' : '▼')}
                  </th>
                  <th
                    onClick={() => handleSort('cacheHitRate')}
                    className="text-right cursor-pointer hover:text-[#171717] select-none"
                  >
                    Cache Hit {sortKey === 'cacheHitRate' && (sortDir === 1 ? '▲' : '▼')}
                  </th>
                  <th>Last Job</th>
                  <th className="w-28 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {sortedSites.map((site) => (
                  <tr
                    key={site.id}
                    onClick={() => onSelectSite(site)}
                    className="cursor-pointer group"
                  >
                    {/* Site cell with favicon */}
                    <td>
                      <div className="flex items-center gap-3">
                        <span className="w-7 h-7 rounded-lg bg-[#171717] text-white flex items-center justify-center font-bold text-xs flex-none group-hover:bg-[#f03e2f] transition-colors">
                          {site.domain.charAt(0).toUpperCase()}
                        </span>
                        <div>
                          <span className="font-mono font-medium text-[13px] text-[#171717] block group-hover:text-[#f03e2f] transition-colors">
                            {site.domain}
                          </span>
                          <span className="text-[11.5px] text-[#71717a]">
                            {site.subTitle || (site.is_active ? 'Connected · TurboPress' : 'Not connected')}
                          </span>
                        </div>
                      </div>
                    </td>

                    {/* Status Chip */}
                    <td>
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
                        {site.status !== 'disconnected' && <span className="chip-dot" />}
                        {site.status === 'optimized'
                          ? 'Optimized'
                          : site.status === 'optimizing'
                          ? 'Optimizing'
                          : site.status === 'attention'
                          ? 'Needs attention'
                          : site.status === 'connected'
                          ? 'Connected'
                          : 'Disconnected'}
                      </span>
                    </td>

                    {/* Score Ring */}
                    <td>{renderScoreRing(site.score)}</td>

                    {/* LCP */}
                    <td className="text-right font-mono text-[13px]">{site.lcp != null ? `${site.lcp.toFixed(1)}s` : '—'}</td>

                    {/* Cache Hit */}
                    <td className="text-right font-mono text-[13px]">
                      {site.cacheHitRate != null ? `${site.cacheHitRate}%` : '—'}
                    </td>

                    {/* Last Job */}
                    <td>
                      <span className="meta">{site.lastJobTime || 'never run'}</span>
                    </td>

                    {/* Actions on hover */}
                    <td onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          title="Purge edge cache"
                          onClick={() => {
                            onPurgeSite(site.domain);
                            onToast(`Edge cache purged for ${site.domain}`);
                          }}
                          className="w-7 h-7 rounded grid place-items-center hover:bg-white text-[#71717a] hover:text-[#171717] hover:shadow-sm"
                        >
                          <RotateCcw className="w-3.5 h-3.5" />
                        </button>
                        <button
                          title="Run optimization"
                          onClick={() => {
                            onRunOptimization(site.domain);
                            onToast(`Optimization dispatched for ${site.domain}`);
                          }}
                          className="w-7 h-7 rounded grid place-items-center hover:bg-white text-[#71717a] hover:text-[#f03e2f] hover:shadow-sm"
                        >
                          <Play className="w-3.5 h-3.5 fill-current" />
                        </button>
                        <button
                          title="Open WordPress Admin"
                          onClick={() => {
                            window.open(`https://${site.domain}/wp-admin/admin.php?page=turbopress`, '_blank');
                          }}
                          className="w-7 h-7 rounded grid place-items-center hover:bg-white text-[#71717a] hover:text-[#171717] hover:shadow-sm"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};
