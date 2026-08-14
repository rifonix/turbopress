import React, { useState } from 'react';
import { Search, Plus, Sliders, Play, RotateCcw } from 'lucide-react';
import { ExtendedSite } from '../types';

interface SitesTabProps {
  sites: ExtendedSite[];
  onSelectSite: (site: ExtendedSite) => void;
  onNavigateToConnect: () => void;
  onPurgeSite: (domain: string) => void;
  onRunOptimization: (domain: string) => void;
  onToast: (msg: string) => void;
}

export const SitesTab: React.FC<SitesTabProps> = ({
  sites,
  onSelectSite,
  onNavigateToConnect,
  onPurgeSite,
  onRunOptimization,
  onToast,
}) => {
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState<'all' | 'optimized' | 'attention'>('all');

  const filteredSites = sites.filter((s) => {
    const matchesSearch = s.domain.toLowerCase().includes(search.toLowerCase());
    if (!matchesSearch) return false;
    if (filterStatus === 'all') return true;
    if (filterStatus === 'optimized') return s.status === 'optimized';
    if (filterStatus === 'attention') return s.status === 'attention' || s.status === 'disconnected';
    return true;
  });

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-[#171717]">
            Connected Sites
          </h1>
          <p className="text-[13.5px] text-[#71717a] mt-0.5">
            {sites.length} of 10 slots active · 1 staging development seat
          </p>
        </div>

        <button onClick={onNavigateToConnect} className="btn btn-primary text-xs sm:text-[13px]">
          <Plus className="w-3.5 h-3.5" />
          <span>Connect New Site</span>
        </button>
      </div>

      {/* Search & Filter Bar */}
      <div className="flex flex-col sm:flex-row items-center gap-3 bg-white p-2.5 rounded-xl border border-[#e4e4e7] shadow-sm">
        <div className="flex items-center gap-2 flex-1 w-full px-2">
          <Search className="w-4 h-4 text-[#71717a] flex-none" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search domain name or path…"
            className="w-full bg-transparent border-0 outline-none text-xs sm:text-[13.5px] text-[#171717] placeholder-[#a1a1aa]"
          />
        </div>

        <div className="flex items-center gap-1.5 self-end sm:self-auto border-t sm:border-t-0 pt-2 sm:pt-0 w-full sm:w-auto">
          {(['all', 'optimized', 'attention'] as const).map((status) => (
            <button
              key={status}
              onClick={() => setFilterStatus(status)}
              className={`px-3 py-1 rounded-md text-xs font-medium capitalize transition-colors ${
                filterStatus === status
                  ? 'bg-[#171717] text-white'
                  : 'text-[#71717a] hover:text-[#171717] hover:bg-[#f4f4f5]'
              }`}
            >
              {status}
            </button>
          ))}
        </div>
      </div>

      {/* Sites Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredSites.map((site) => (
          <div
            key={site.id}
            onClick={() => onSelectSite(site)}
            className="bg-white border border-[#e4e4e7] rounded-2xl p-5 hover:border-[#a1a1aa] transition-all duration-200 shadow-sm cursor-pointer flex flex-col justify-between group"
          >
            <div>
              <div className="flex items-start justify-between gap-2 mb-3">
                <div className="flex items-center gap-2.5">
                  <span className="w-8 h-8 rounded-lg bg-[#171717] text-white flex items-center justify-center font-bold text-xs flex-none group-hover:bg-[#f03e2f] transition-colors">
                    {site.domain.charAt(0).toUpperCase()}
                  </span>
                  <div>
                    <h3 className="font-mono font-semibold text-[13.5px] text-[#171717] truncate group-hover:text-[#f03e2f] transition-colors">
                      {site.domain}
                    </h3>
                    <p className="text-[11.5px] text-[#71717a]">{site.subTitle || 'WordPress 6.7'}</p>
                  </div>
                </div>

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
                  {site.status === 'optimized' ? '90+ Score' : site.status}
                </span>
              </div>

              {/* Performance Metrics Mini Row */}
              <div className="grid grid-cols-3 gap-2 py-3 my-2 border-y border-[#f1f1f2] text-center font-mono">
                <div>
                  <span className="text-[10.5px] text-[#71717a] block">Score</span>
                  <span className="text-sm font-bold text-[#171717]">{site.score}</span>
                </div>
                <div>
                  <span className="text-[10.5px] text-[#71717a] block">LCP</span>
                  <span className="text-sm font-medium text-[#171717]">{site.lcp}s</span>
                </div>
                <div>
                  <span className="text-[10.5px] text-[#71717a] block">Cache</span>
                  <span className="text-sm font-medium text-[#171717]">{site.cacheHitRate || 0}%</span>
                </div>
              </div>
            </div>

            {/* Card Footer Actions */}
            <div className="pt-3 flex items-center justify-between">
              <span className="meta text-[11px]">Synced {site.lastJobTime}</span>

              <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                <button
                  title="Purge cache"
                  onClick={() => {
                    onPurgeSite(site.domain);
                    onToast(`Cache purged for ${site.domain}`);
                  }}
                  className="w-7 h-7 rounded grid place-items-center hover:bg-[#f4f4f5] text-[#71717a] hover:text-[#171717]"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                </button>
                <button
                  title="Run optimization"
                  onClick={() => {
                    onRunOptimization(site.domain);
                    onToast(`Optimization queued for ${site.domain}`);
                  }}
                  className="w-7 h-7 rounded grid place-items-center hover:bg-[#f4f4f5] text-[#71717a] hover:text-[#f03e2f]"
                >
                  <Play className="w-3.5 h-3.5 fill-current" />
                </button>
                <button
                  onClick={() => onSelectSite(site)}
                  className="btn btn-secondary text-xs py-1 px-2.5 ml-1"
                >
                  <Sliders className="w-3 h-3 mr-1" /> Configure
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
