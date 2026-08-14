import React, { useState } from 'react';
import { X, Play, RotateCcw, Zap, ExternalLink } from 'lucide-react';
import { ExtendedSite, SitePreset } from '../types';

interface SiteDetailModalProps {
  site: ExtendedSite | null;
  onClose: () => void;
  onUpdatePreset: (siteId: string, preset: SitePreset) => Promise<void>;
  onPurgeCache: (domain: string) => Promise<void>;
  onRunOptimization: (domain: string) => Promise<void>;
  onToast: (msg: string) => void;
}

export const SiteDetailModal: React.FC<SiteDetailModalProps> = ({
  site,
  onClose,
  onUpdatePreset,
  onPurgeCache,
  onRunOptimization,
  onToast,
}) => {
  const [activeTab, setActiveTab] = useState<'presets' | 'granular' | 'runner'>('presets');
  const [currentPreset, setCurrentPreset] = useState<SitePreset>(site?.config?.preset || 'ludicrous');
  const [isPurging, setIsPurging] = useState(false);
  const [isRunning, setIsRunning] = useState(false);

  // Granular settings local state
  const [jsDelayTimeout, setJsDelayTimeout] = useState(site?.config?.javascript.delay_timeout_ms || 3500);
  const [enableCriticalCss, setEnableCriticalCss] = useState(site?.config?.critical_css.enabled ?? true);
  const [enableDynamicNonces, setEnableDynamicNonces] = useState(site?.config?.dynamic.nonce_ajax_refresh ?? true);
  const [enableSpeculation, setEnableSpeculation] = useState(site?.config?.dynamic.speculation_rules_prerender ?? true);

  if (!site) return null;

  const handleApplyPreset = async (preset: SitePreset) => {
    setCurrentPreset(preset);
    try {
      await onUpdatePreset(site.id, preset);
      onToast(`Applied ${preset.toUpperCase()} optimization profile to ${site.domain}`);
    } catch (err: any) {
      onToast(err.message || 'Failed to update preset');
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
      onToast(`Puppeteer AST Critical CSS run dispatched for ${site.domain}`);
    } catch {
      onToast('Optimization dispatch failed');
    } finally {
      setIsRunning(false);
    }
  };

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-white rounded-2xl border border-[#e4e4e7] max-w-2xl w-full shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
      >
        {/* Modal Header */}
        <div className="p-6 border-b border-[#e4e4e7] flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="w-8 h-8 rounded-lg bg-[#171717] text-white flex items-center justify-center font-bold text-xs">
              {site.domain.charAt(0).toUpperCase()}
            </span>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-semibold font-mono text-[#171717]">
                  {site.domain}
                </h2>
                <span className="chip chip-success text-[10px] py-0.5 px-2">
                  <span className="chip-dot" /> 90+ Mobile CWV
                </span>
              </div>
              <p className="text-xs text-[#71717a]">{site.subTitle || 'WordPress 6.7 · Cloudflare Edge'}</p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg grid place-items-center text-[#71717a] hover:bg-[#f4f4f5] hover:text-[#171717] transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Tabs */}
        <div className="flex border-b border-[#e4e4e7] px-6 bg-[#fafafa]">
          <button
            onClick={() => setActiveTab('presets')}
            className={`py-2.5 px-3 text-xs font-medium border-b-2 transition-colors ${
              activeTab === 'presets'
                ? 'border-[#f03e2f] text-[#171717] font-semibold'
                : 'border-transparent text-[#71717a] hover:text-[#171717]'
            }`}
          >
            Master Presets
          </button>
          <button
            onClick={() => setActiveTab('granular')}
            className={`py-2.5 px-3 text-xs font-medium border-b-2 transition-colors ${
              activeTab === 'granular'
                ? 'border-[#f03e2f] text-[#171717] font-semibold'
                : 'border-transparent text-[#71717a] hover:text-[#171717]'
            }`}
          >
            Granular Switches
          </button>
          <button
            onClick={() => setActiveTab('runner')}
            className={`py-2.5 px-3 text-xs font-medium border-b-2 transition-colors ${
              activeTab === 'runner'
                ? 'border-[#f03e2f] text-[#171717] font-semibold'
                : 'border-transparent text-[#71717a] hover:text-[#171717]'
            }`}
          >
            Edge Browser Runner
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1">
          {/* TAB 1: MASTER PRESETS */}
          {activeTab === 'presets' && (
            <div className="space-y-4">
              <p className="text-xs text-[#71717a]">
                Select an automated performance profile. Profiles tune drop-in caching, Critical CSS, and script deferral deterministically.
              </p>

              <div className="space-y-3">
                {/* Safe Mode */}
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
                    <span className="font-mono text-xs text-[#71717a]">80–88 PageSpeed</span>
                  </div>
                  <p className="text-xs text-[#71717a]">
                    Drop-in page caching (`advanced-cache.php`), standard script deferral. 100% theme/plugin compatibility without delay.
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
                    <span className="font-mono text-xs text-[#16a34a] font-medium">90–94 PageSpeed</span>
                  </div>
                  <p className="text-xs text-[#71717a]">
                    Critical CSS inlining in {'<head>'}, W3C Speculation Rules hover pre-rendering, WebP/AVIF auto-negotiation.
                  </p>
                </div>

                {/* Ludicrous Speed (Recommended) */}
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
                  <div className="flex items-center gap-2 mb-1">
                    <Zap className="w-4 h-4 text-[#f03e2f] fill-current" />
                    <span className="font-semibold text-sm text-[#171717]">Ludicrous Speed</span>
                    <span className="font-mono text-xs text-[#16a34a] font-bold">96–100 PageSpeed</span>
                  </div>
                  <p className="text-xs text-[#71717a] pr-20">
                    AST-Enriched Critical CSS, 3-tier user interaction script delay with jQuery queue stubbing, and dynamic nonce micro-hydration.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: GRANULAR SWITCHES */}
          {activeTab === 'granular' && (
            <div className="space-y-4">
              <div className="space-y-3">
                <div className="flex items-center justify-between p-3.5 border border-[#e4e4e7] rounded-xl">
                  <div>
                    <h4 className="text-xs font-semibold text-[#171717]">Edge Critical CSS Inlining</h4>
                    <p className="text-[11.5px] text-[#71717a]">Injects above-the-fold CSS AST and defers full stylesheets.</p>
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
                    <p className="text-[11.5px] text-[#71717a]">Refreshes cached WordPress form tokens and WooCommerce carts in &lt;30ms.</p>
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
                    <p className="text-[11.5px] text-[#71717a]">Instantaneous &lt;50ms link navigation on user link hover.</p>
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
                  <p className="text-[11px] text-[#71717a]">Maximum delay before non-critical scripts execute if no user interaction occurs.</p>
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: EDGE BROWSER RUNNER */}
          {activeTab === 'runner' && (
            <div className="space-y-4">
              <div className="p-4 bg-[#f8f8f7] border border-[#e4e4e7] rounded-xl space-y-3 font-mono text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-[#71717a]">Site ID:</span>
                  <span className="text-[#171717]">{site.id}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[#71717a]">API Key:</span>
                  <span className="text-[#171717]">sk_live_••••••••c41a</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[#71717a]">Queue Consumer:</span>
                  <span className="text-[#16a34a]">turbopress-optimization-queue</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[#71717a]">Storage:</span>
                  <span className="text-[#171717]">turbopress-assets (R2 Zero-Egress)</span>
                </div>
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  onClick={handleRun}
                  disabled={isRunning}
                  className="btn btn-primary text-xs flex-1"
                >
                  <Play className="w-3.5 h-3.5 fill-current" />
                  <span>{isRunning ? 'Extracting via Chromium…' : 'Trigger Puppeteer Extraction'}</span>
                </button>
                <button
                  onClick={handlePurge}
                  disabled={isPurging}
                  className="btn btn-secondary text-xs"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>{isPurging ? 'Purging…' : 'Purge Edge Cache'}</span>
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-4 bg-[#fafafa] border-t border-[#e4e4e7] flex items-center justify-between">
          <a
            href={`https://${site.domain}/wp-admin/admin.php?page=turbopress`}
            target="_blank"
            rel="noreferrer"
            className="text-xs text-[#71717a] hover:text-[#171717] flex items-center gap-1"
          >
            <span>Open WordPress Plugin</span>
            <ExternalLink className="w-3 h-3" />
          </a>

          <button onClick={onClose} className="btn btn-secondary text-xs px-4">
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
