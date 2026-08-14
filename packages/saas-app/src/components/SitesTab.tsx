import React, { useState } from 'react';
import { Search, Plus, Sliders, Play, RotateCcw, Trash2, Globe } from 'lucide-react';
import { ExtendedSite } from '../types';

interface SitesTabProps {
  sites: ExtendedSite[];
  onSelectSite: (site: ExtendedSite) => void;
  onNavigateToConnect: () => void;
  onPurgeSite: (domain: string) => void;
  onRunOptimization: (domain: string) => void;
  onDeleteSite?: (siteId: string, domain: string) => void;
  onCreateSite?: (domain: string) => Promise<void>;
  onToast: (msg: string) => void;
}

export const SitesTab: React.FC<SitesTabProps> = ({
  sites,
  onSelectSite,
  onNavigateToConnect,
  onPurgeSite,
  onRunOptimization,
  onDeleteSite,
  onCreateSite,
  onToast,
}) => {
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState<'all' | 'optimized' | 'attention'>('all');
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [newDomain, setNewDomain] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const filteredSites = sites.filter((s) => {
    const matchesSearch = s.domain.toLowerCase().includes(search.toLowerCase());
    if (!matchesSearch) return false;
    if (filterStatus === 'all') return true;
    if (filterStatus === 'optimized') return s.status === 'optimized';
    if (filterStatus === 'attention') return s.status === 'attention' || s.status === 'disconnected';
    return true;
  });

  const handleAddSiteSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newDomain.trim()) return;

    if (onCreateSite) {
      setIsSubmitting(true);
      try {
        await onCreateSite(newDomain.trim());
        setIsAddModalOpen(false);
        setNewDomain('');
      } catch (err: any) {
        onToast(err.message || 'Failed to add site');
      } finally {
        setIsSubmitting(false);
      }
    } else {
      onNavigateToConnect();
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-[#171717]">
            Connected Sites
          </h1>
          <p className="text-[13.5px] text-[#71717a] mt-0.5">
            {sites.length} WordPress site{sites.length === 1 ? '' : 's'} managed on TurboPress Edge
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsAddModalOpen(true)}
            className="btn btn-secondary text-xs sm:text-[13px]"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Manual Add</span>
          </button>
          <button onClick={onNavigateToConnect} className="btn btn-primary text-xs sm:text-[13px]">
            <Globe className="w-3.5 h-3.5" />
            <span>1-Click Connect</span>
          </button>
        </div>
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
      {filteredSites.length === 0 ? (
        <div className="bg-white border border-[#e4e4e7] rounded-2xl p-12 text-center shadow-sm space-y-4">
          <p className="text-sm font-medium text-[#171717]">
            {search ? 'No sites match your filter query' : 'No sites connected yet'}
          </p>
          <button onClick={onNavigateToConnect} className="btn btn-primary text-xs">
            Connect your first WordPress site →
          </button>
        </div>
      ) : (
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
                    <div className="min-w-0">
                      <h3 className="font-mono font-semibold text-[13.5px] text-[#171717] truncate group-hover:text-[#f03e2f] transition-colors">
                        {site.domain}
                      </h3>
                      <p className="text-[11.5px] text-[#71717a] truncate">{site.subTitle || 'WordPress 6.7 · SpeedForge'}</p>
                    </div>
                  </div>

                  <span
                    className={`chip flex-none ${
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
                    {site.status === 'optimized' ? `${site.score} Score` : site.status}
                  </span>
                </div>

                {/* Performance Metrics Mini Row */}
                <div className="grid grid-cols-3 gap-2 py-3 my-2 border-y border-[#f1f1f2] text-center font-mono">
                  <div>
                    <span className="text-[10.5px] text-[#71717a] block">Score</span>
                    <span className="text-sm font-bold text-[#171717]">{site.score || 95}</span>
                  </div>
                  <div>
                    <span className="text-[10.5px] text-[#71717a] block">LCP</span>
                    <span className="text-sm font-medium text-[#171717]">{(site.lcp || 1.4).toFixed(1)}s</span>
                  </div>
                  <div>
                    <span className="text-[10.5px] text-[#71717a] block">Cache</span>
                    <span className="text-sm font-medium text-[#171717]">{site.cacheHitRate || 94}%</span>
                  </div>
                </div>
              </div>

              {/* Card Footer Actions */}
              <div className="pt-3 flex items-center justify-between">
                <span className="meta text-[11px] truncate">{site.lastJobTime || 'synced'}</span>

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
                  {onDeleteSite && (
                    <button
                      title="Delete site"
                      onClick={() => onDeleteSite(site.id, site.domain)}
                      className="w-7 h-7 rounded grid place-items-center hover:bg-[#fef2f2] text-[#71717a] hover:text-[#dc2626]"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
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
      )}

      {/* Manual Add Site Modal */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in">
          <form
            onSubmit={handleAddSiteSubmit}
            className="bg-white rounded-2xl border border-[#e4e4e7] p-6 max-w-md w-full shadow-2xl space-y-4"
          >
            <div className="flex items-center gap-3">
              <span className="w-8 h-8 rounded-lg bg-[#171717] text-white grid place-items-center">
                <Globe className="w-4 h-4" />
              </span>
              <div>
                <h3 className="text-base font-semibold text-[#171717]">Register WordPress Site</h3>
                <p className="text-xs text-[#71717a]">Creates edge configuration and license key</p>
              </div>
            </div>

            <div className="space-y-2 pt-2">
              <label className="block text-xs font-medium text-[#3f3f46]">Domain Name</label>
              <input
                type="text"
                required
                value={newDomain}
                onChange={(e) => setNewDomain(e.target.value)}
                placeholder="example.com"
                className="w-full px-3 py-2 bg-white border border-[#e4e4e7] rounded-lg text-xs font-mono text-[#171717] focus:outline-none focus:border-[#f03e2f]"
              />
              <p className="text-[11px] text-[#71717a]">
                Enter domain without <code>https://</code> (e.g. <code>mybrandhotel.com</code>).
              </p>
            </div>

            <div className="flex justify-end gap-2 pt-4 border-t border-[#f1f1f2]">
              <button
                type="button"
                onClick={() => setIsAddModalOpen(false)}
                className="btn btn-ghost text-xs"
              >
                Cancel
              </button>
              <button type="submit" disabled={isSubmitting} className="btn btn-primary text-xs">
                {isSubmitting ? 'Registering…' : 'Register Site'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
