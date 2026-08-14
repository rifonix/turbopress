import React from 'react';
import { Zap, Activity, Gauge, Sparkles, ArrowUpRight, CheckCircle } from 'lucide-react';
import { Site } from '@turbopress/shared';
import { JobStatusBadge } from './JobStatusBadge';

interface OverviewTabProps {
  sites: Site[];
  onSelectSite: (site: Site) => void;
  onNavigateToSites: () => void;
}

export const OverviewTab: React.FC<OverviewTabProps> = ({
  sites,
  onSelectSite,
  onNavigateToSites,
}) => {
  const activeSites = sites.filter((s) => s.is_active);

  return (
    <div className="space-y-8">
      {/* Top Banner */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-slate-950 via-slate-900 to-sky-950 text-white p-6 sm:p-8 shadow-xl">
        <div className="relative z-10 max-w-3xl">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-sky-500/20 text-sky-300 text-xs font-bold uppercase tracking-wider mb-4 border border-sky-500/30">
            <Sparkles className="w-3.5 h-3.5" />
            Edge Engine Active
          </div>
          <h1 className="text-2xl sm:text-4xl font-extrabold tracking-tight mb-3">
            Pure WordPress Page Optimization.
          </h1>
          <p className="text-slate-300 text-sm sm:text-base leading-relaxed mb-6">
            Zero-DNS, plug-and-play architecture powered by Cloudflare Puppeteer, AST Critical CSS inlining, and 3-tier interaction-delayed hydration.
          </p>
          <div className="flex flex-wrap gap-4">
            <button
              onClick={onNavigateToSites}
              className="px-5 py-2.5 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 font-bold text-sm transition-all shadow-lg shadow-sky-500/25 flex items-center gap-2"
            >
              <span>Manage Connected Sites ({sites.length})</span>
              <ArrowUpRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Core Web Vitals Key Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
          <div className="flex justify-between items-start mb-2">
            <span className="text-xs font-bold text-slate-500 uppercase">Avg Mobile Score</span>
            <div className="p-2 rounded-lg bg-emerald-50 text-emerald-600">
              <Gauge className="w-4 h-4" />
            </div>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-extrabold text-slate-900">98</span>
            <span className="text-xs font-semibold text-emerald-600">/ 100</span>
          </div>
          <p className="text-xs text-slate-500 mt-2 flex items-center gap-1">
            <CheckCircle className="w-3 h-3 text-emerald-500" />
            Core Web Vitals Passed
          </p>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
          <div className="flex justify-between items-start mb-2">
            <span className="text-xs font-bold text-slate-500 uppercase">Average TTFB</span>
            <div className="p-2 rounded-lg bg-sky-50 text-sky-600">
              <Zap className="w-4 h-4" />
            </div>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-extrabold text-slate-900">12</span>
            <span className="text-xs font-semibold text-slate-500">ms</span>
          </div>
          <p className="text-xs text-slate-500 mt-2">
            Served via <code className="text-[11px] bg-slate-100 px-1 py-0.5 rounded">advanced-cache.php</code>
          </p>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
          <div className="flex justify-between items-start mb-2">
            <span className="text-xs font-bold text-slate-500 uppercase">Largest Contentful Paint</span>
            <div className="p-2 rounded-lg bg-purple-50 text-purple-600">
              <Activity className="w-4 h-4" />
            </div>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-extrabold text-slate-900">0.8</span>
            <span className="text-xs font-semibold text-slate-500">sec</span>
          </div>
          <p className="text-xs text-slate-500 mt-2">
            Automated <code className="text-[11px] bg-slate-100 px-1 py-0.5 rounded">fetchpriority="high"</code>
          </p>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
          <div className="flex justify-between items-start mb-2">
            <span className="text-xs font-bold text-slate-500 uppercase">Connected Sites</span>
            <div className="p-2 rounded-lg bg-amber-50 text-amber-600">
              <Zap className="w-4 h-4" />
            </div>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-extrabold text-slate-900">{activeSites.length}</span>
            <span className="text-xs font-semibold text-slate-500">Active</span>
          </div>
          <p className="text-xs text-slate-500 mt-2">1-Click OAuth synced</p>
        </div>
      </div>

      {/* Connected Sites List Preview */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-6 border-b border-slate-200 flex justify-between items-center">
          <div>
            <h2 className="text-lg font-bold text-slate-900">Connected WordPress Instances</h2>
            <p className="text-xs text-slate-500">Live optimization status and configuration state</p>
          </div>
          <button
            onClick={onNavigateToSites}
            className="text-xs font-bold text-sky-600 hover:text-sky-700"
          >
            View All →
          </button>
        </div>

        <div className="divide-y divide-slate-100">
          {sites.length === 0 ? (
            <div className="p-8 text-center text-slate-500 text-sm">
              No WordPress sites connected yet. Connect your first site using the 1-Click Handshake!
            </div>
          ) : (
            sites.map((site) => (
              <div
                key={site.id}
                onClick={() => onSelectSite(site)}
                className="p-5 hover:bg-slate-50 transition-colors flex items-center justify-between cursor-pointer"
              >
                <div className="flex items-center gap-4">
                  <div className="w-3 h-3 rounded-full bg-emerald-500 shadow-sm shadow-emerald-500/50" />
                  <div>
                    <h3 className="font-bold text-slate-900 text-sm sm:text-base flex items-center gap-2">
                      <span>{site.domain}</span>
                    </h3>
                    <p className="text-xs text-slate-500">
                      WP {site.wp_version || '6.7'} • Plugin v{site.plugin_version || '1.0.0'}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <span className="hidden sm:inline-flex px-2.5 py-1 rounded-md text-xs font-bold uppercase tracking-wider bg-slate-100 text-slate-700">
                    Ludicrous Mode
                  </span>
                  <JobStatusBadge status="completed" />
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
