import React, { useState } from 'react';
import { Globe, Plus, Trash2, Sliders, RefreshCw, CheckCircle2 } from 'lucide-react';
import { Site } from '@turbopress/shared';

interface SitesTabProps {
  sites: Site[];
  onSelectSite: (site: Site) => void;
  onOpenConnectWizard: () => void;
  onPurgeSiteCache: (siteId: string, domain: string) => Promise<void>;
  onDeleteSite: (siteId: string) => Promise<void>;
}

export const SitesTab: React.FC<SitesTabProps> = ({
  sites,
  onSelectSite,
  onOpenConnectWizard,
  onPurgeSiteCache,
  onDeleteSite,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [purgingId, setPurgingId] = useState<string | null>(null);
  const [purgedSuccessId, setPurgedSuccessId] = useState<string | null>(null);

  const filteredSites = sites.filter((s) =>
    s.domain.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handlePurge = async (e: React.MouseEvent, site: Site) => {
    e.stopPropagation();
    setPurgingId(site.id);
    await onPurgeSiteCache(site.id, site.domain);
    setPurgingId(null);
    setPurgedSuccessId(site.id);
    setTimeout(() => setPurgedSuccessId(null), 3000);
  };

  const handleDelete = async (e: React.MouseEvent, siteId: string) => {
    e.stopPropagation();
    if (confirm('Are you sure you want to remove this site from Turbopress?')) {
      await onDeleteSite(siteId);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header & Actions */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900">Connected Sites</h1>
          <p className="text-xs sm:text-sm text-slate-500">
            Manage optimization presets, edge caches, and Critical CSS pipelines.
          </p>
        </div>

        <button
          onClick={onOpenConnectWizard}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-sm font-bold shadow-md transition-all"
        >
          <Plus className="w-4 h-4" />
          <span>Connect New Site</span>
        </button>
      </div>

      {/* Search Bar */}
      <div className="flex gap-4">
        <input
          type="text"
          placeholder="Search domain (e.g. myshop.com)..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="flex-1 px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-sky-500 shadow-sm"
        />
      </div>

      {/* Sites Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredSites.length === 0 ? (
          <div className="col-span-full bg-white rounded-2xl border border-slate-200 p-12 text-center text-slate-500">
            <Globe className="w-12 h-12 text-slate-300 mx-auto mb-3" />
            <h3 className="text-base font-bold text-slate-800">No Sites Found</h3>
            <p className="text-xs text-slate-500 mt-1 mb-4">
              Get started by pairing your first WordPress installation in 1-Click.
            </p>
            <button
              onClick={onOpenConnectWizard}
              className="px-4 py-2 bg-sky-500 hover:bg-sky-600 text-white rounded-lg text-xs font-bold"
            >
              Connect Site
            </button>
          </div>
        ) : (
          filteredSites.map((site) => (
            <div
              key={site.id}
              onClick={() => onSelectSite(site)}
              className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm hover:shadow-md transition-all cursor-pointer flex flex-col justify-between group"
            >
              <div>
                <div className="flex justify-between items-start mb-4">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
                    <span className="text-xs font-bold uppercase tracking-wider text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full">
                      Active
                    </span>
                  </div>
                  <button
                    onClick={(e) => handleDelete(e, site.id)}
                    title="Delete site"
                    className="text-slate-400 hover:text-rose-600 p-1 rounded-lg hover:bg-rose-50 transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>

                <h3 className="text-lg font-extrabold text-slate-900 group-hover:text-sky-600 transition-colors mb-1 truncate">
                  {site.domain}
                </h3>
                <p className="text-xs text-slate-500 mb-4">
                  WordPress {site.wp_version || '6.7'} • Plugin {site.plugin_version || '1.0.0'}
                </p>

                {/* Score Pills */}
                <div className="grid grid-cols-2 gap-2 mb-6">
                  <div className="bg-slate-50 border border-slate-100 rounded-xl p-3 text-center">
                    <span className="text-[10px] font-bold text-slate-400 uppercase block">Mobile Score</span>
                    <span className="text-xl font-extrabold text-emerald-600">98</span>
                  </div>
                  <div className="bg-slate-50 border border-slate-100 rounded-xl p-3 text-center">
                    <span className="text-[10px] font-bold text-slate-400 uppercase block">Edge TTFB</span>
                    <span className="text-xl font-extrabold text-sky-600">14ms</span>
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center gap-2 pt-4 border-t border-slate-100">
                <button
                  onClick={() => onSelectSite(site)}
                  className="flex-1 flex items-center justify-center gap-1.5 py-2 px-3 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition-colors"
                >
                  <Sliders className="w-3.5 h-3.5" />
                  <span>Configure</span>
                </button>

                <button
                  onClick={(e) => handlePurge(e, site)}
                  disabled={purgingId === site.id}
                  title="Purge Static Edge Cache"
                  className="flex items-center justify-center p-2 border border-slate-200 hover:bg-slate-50 rounded-xl text-slate-700 text-xs font-semibold transition-colors disabled:opacity-50"
                >
                  {purgedSuccessId === site.id ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  ) : (
                    <RefreshCw className={`w-4 h-4 ${purgingId === site.id ? 'animate-spin text-sky-600' : ''}`} />
                  )}
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
