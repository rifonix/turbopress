import React, { useState } from 'react';
import { Play, RotateCcw, ExternalLink, AlertTriangle, AlertOctagon } from 'lucide-react';
import { ExtendedSite, AttentionItem } from '../types';

interface OverviewTabProps {
  sites: ExtendedSite[];
  onSelectSite: (site: ExtendedSite) => void;
  onNavigateToJobs: () => void;
  onNavigateToConnect: () => void;
  onPurgeSite: (domain: string) => void;
  onRunOptimization: (domain: string) => void;
  onToast: (msg: string) => void;
}

export const OverviewTab: React.FC<OverviewTabProps> = ({
  sites,
  onSelectSite,
  onNavigateToJobs,
  onPurgeSite,
  onRunOptimization,
  onToast,
}) => {
  const [sortKey, setSortKey] = useState<'domain' | 'score' | 'lcp' | 'cacheHitRate'>('score');
  const [sortDir, setSortDir] = useState<1 | -1>(-1); // Default descending score

  const attentionItems: AttentionItem[] = [
    {
      id: 'att-1',
      type: 'danger',
      title: 'harborandspruce.com — optimization job failed',
      description: 'Job job_7d2mk timed out during "Render" after 30s. Score dropped 61 → 58 this week.',
      domain: 'harborandspruce.com',
      actionLabel: 'Retry now',
      jobId: 'job_7d2mk',
    },
    {
      id: 'att-2',
      type: 'warn',
      title: 'trailheadcoffee.co — plugin disconnected',
      description: 'No heartbeat in 6 days. Edge cache is stale; last successful sync Aug 9.',
      domain: 'trailheadcoffee.co',
      actionLabel: 'Copy reconnect link',
    },
  ];

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
    return ((valA as number) - (valB as number)) * sortDir;
  });

  const getScoreColor = (score: number) => {
    if (score >= 90) return '#16a34a';
    if (score >= 50) return '#f59e0b';
    return '#dc2626';
  };

  const renderScoreRing = (score: number) => {
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

  return (
    <div className="space-y-8 animate-fade-in">
      {/* Page Header with Worker Runs Meter */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-[26px] font-semibold tracking-tight text-[#171717]">
            Fleet Overview
          </h1>
          <p className="text-[13.5px] text-[#71717a] mt-0.5">
            Fleet health across {sites.length} connected WordPress sites · Cloudflare Edge Active
          </p>
        </div>

        <div className="flex items-center gap-3 text-[13px] text-[#71717a] bg-white border border-[#e4e4e7] px-3.5 py-2 rounded-lg shadow-sm">
          <span className="font-mono text-[12.5px]">
            <strong className="text-[#171717]">1,240</strong> / 2,000 runs
          </span>
          <div className="w-28 h-1.5 rounded-full bg-[#f1f1f2] overflow-hidden">
            <div className="h-full bg-[#171717] rounded-full transition-all duration-500" style={{ width: '62%' }} />
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
              <span className="text-3xl font-semibold text-[#171717] num">78</span>
              <span className="font-mono text-[11.5px] text-[#16a34a] font-medium flex items-center gap-1">
                ▲ 6.2
              </span>
            </div>
          </div>
          {/* Sparkline */}
          <div className="h-8 mt-3">
            <svg viewBox="0 0 200 40" preserveAspectRatio="none" className="w-full h-full">
              <path fill="rgba(22, 163, 74, 0.08)" d="M0,40 L0,28 L22,25 L44,30 L66,22 L88,18 L110,20 L132,15 L154,16 L176,12 L200,8 L200,40 Z" />
              <polyline fill="none" stroke="#16a34a" strokeWidth="2" points="0,28 22,25 44,30 66,22 88,18 110,20 132,15 154,16 176,12 200,8" />
            </svg>
          </div>
        </div>

        {/* KPI 2: Median LCP */}
        <div className="bg-white border border-[#e4e4e7] rounded-xl p-4 flex flex-col justify-between hover:border-[#a1a1aa] transition-colors shadow-sm">
          <div>
            <span className="text-[12px] text-[#71717a] font-medium uppercase tracking-wider block mb-1">
              Median LCP
            </span>
            <div className="flex items-baseline justify-between">
              <span className="text-3xl font-semibold text-[#171717] num">
                2.1<span className="text-base font-normal text-[#71717a] ml-1">s</span>
              </span>
              <span className="font-mono text-[11.5px] text-[#16a34a] font-medium flex items-center gap-1">
                ▼ 0.4s
              </span>
            </div>
          </div>
          {/* Sparkline */}
          <div className="h-8 mt-3">
            <svg viewBox="0 0 200 40" preserveAspectRatio="none" className="w-full h-full">
              <path fill="rgba(22, 163, 74, 0.08)" d="M0,40 L0,8 L22,10 L44,12 L66,15 L88,18 L110,20 L132,23 L154,26 L176,30 L200,32 L200,40 Z" />
              <polyline fill="none" stroke="#16a34a" strokeWidth="2" points="0,8 22,10 44,12 66,15 88,18 110,20 132,23 154,26 176,30 200,32" />
            </svg>
          </div>
        </div>

        {/* KPI 3: Edge Cache Hit Rate */}
        <div className="bg-white border border-[#e4e4e7] rounded-xl p-4 flex flex-col justify-between hover:border-[#a1a1aa] transition-colors shadow-sm">
          <div>
            <span className="text-[12px] text-[#71717a] font-medium uppercase tracking-wider block mb-1">
              Edge cache hit rate
            </span>
            <div className="flex items-baseline justify-between">
              <span className="text-3xl font-semibold text-[#171717] num">
                92<span className="text-base font-normal text-[#71717a] ml-1">%</span>
              </span>
              <span className="font-mono text-[11.5px] text-[#16a34a] font-medium flex items-center gap-1">
                ▲ 1.8%
              </span>
            </div>
          </div>
          {/* Sparkline */}
          <div className="h-8 mt-3">
            <svg viewBox="0 0 200 40" preserveAspectRatio="none" className="w-full h-full">
              <path fill="rgba(22, 163, 74, 0.08)" d="M0,40 L0,22 L22,20 L44,18 L66,20 L88,15 L110,14 L132,13 L154,11 L176,11 L200,8 L200,40 Z" />
              <polyline fill="none" stroke="#16a34a" strokeWidth="2" points="0,22 22,20 44,18 66,20 88,15 110,14 132,13 154,11 176,11 200,8" />
            </svg>
          </div>
        </div>

        {/* KPI 4: Jobs Completed */}
        <div className="bg-white border border-[#e4e4e7] rounded-xl p-4 flex flex-col justify-between hover:border-[#a1a1aa] transition-colors shadow-sm">
          <div>
            <span className="text-[12px] text-[#71717a] font-medium uppercase tracking-wider block mb-1">
              Jobs completed · 7d
            </span>
            <div className="flex items-baseline justify-between">
              <span className="text-3xl font-semibold text-[#171717] num">23</span>
              <span className="font-mono text-[11.5px] text-[#dc2626] font-medium flex items-center gap-1">
                ▼ 2 failed
              </span>
            </div>
          </div>
          {/* Sparkline */}
          <div className="h-8 mt-3">
            <svg viewBox="0 0 200 40" preserveAspectRatio="none" className="w-full h-full">
              <path fill="rgba(240, 62, 47, 0.08)" d="M0,40 L0,32 L22,20 L44,28 L66,16 L88,30 L110,24 L132,34 L154,28 L176,32 L200,38 L200,40 Z" />
              <polyline fill="none" stroke="#f03e2f" strokeWidth="2" points="0,32 22,20 44,28 66,16 88,30 110,24 132,34 154,28 176,32 200,38" />
            </svg>
          </div>
        </div>
      </section>

      {/* Attention Queue */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-[15px] font-semibold tracking-tight text-[#171717]">
            Needs attention
          </h2>
          <span className="meta">{attentionItems.length} alerts</span>
        </div>

        <div className="bg-white border border-[#e4e4e7] rounded-2xl divide-y divide-[#f1f1f2] shadow-sm overflow-hidden">
          {attentionItems.map((item) => (
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
                      View job
                    </button>
                    <button
                      onClick={() => {
                        onRunOptimization(item.domain);
                        onToast(`Job re-queued for ${item.domain}`);
                      }}
                      className="btn btn-primary text-xs py-1.5 px-3"
                    >
                      {item.actionLabel}
                    </button>
                  </>
                ) : (
                  <button
                    onClick={() => onToast('Reconnect link copied to clipboard')}
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

      {/* All Sites Table */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-[15px] font-semibold tracking-tight text-[#171717]">
            All sites
          </h2>
          <span className="meta">7 of 10 plan slots used · 1 free staging seat</span>
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
                            {site.subTitle || 'WordPress 6.7 · Optimized'}
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
                          : 'Disconnected'}
                      </span>
                    </td>

                    {/* Score Ring */}
                    <td>{renderScoreRing(site.score)}</td>

                    {/* LCP */}
                    <td className="text-right font-mono text-[13px]">{site.lcp.toFixed(1)}s</td>

                    {/* Cache Hit */}
                    <td className="text-right font-mono text-[13px]">
                      {site.cacheHitRate ? `${site.cacheHitRate}%` : '—'}
                    </td>

                    {/* Last Job */}
                    <td>
                      <span className="meta">{site.lastJobTime}</span>
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
