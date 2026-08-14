import React, { useState } from 'react';
import { X, Sparkles, Zap, Shield, Play, Save, CheckCircle2, RefreshCw } from 'lucide-react';
import { Site, SiteConfig, PRESETS_RECORD } from '@turbopress/shared';

interface SiteDetailModalProps {
  site: Site;
  onClose: () => void;
  onSaveConfig: (siteId: string, config: SiteConfig) => Promise<void>;
  onDispatchOptimize: (url: string) => Promise<void>;
}

export const SiteDetailModal: React.FC<SiteDetailModalProps> = ({
  site,
  onClose,
  onSaveConfig,
  onDispatchOptimize,
}) => {
  let initialConfig: SiteConfig;
  try {
    initialConfig = JSON.parse(site.config_json);
  } catch {
    initialConfig = PRESETS_RECORD.ludicrous;
  }

  const [config, setConfig] = useState<SiteConfig>(initialConfig);
  const [activeTab, setActiveTab] = useState<'preset' | 'granular' | 'jobs'>('preset');
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [testUrl, setTestUrl] = useState(`https://${site.domain}/`);

  const handlePresetSelect = (presetKey: string) => {
    const presetConfig = PRESETS_RECORD[presetKey];
    if (presetConfig) {
      setConfig({ ...presetConfig, preset: presetKey as any });
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    await onSaveConfig(site.id, config);
    setIsSaving(false);
    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 3000);
  };

  const handleRunOptimization = async () => {
    setIsOptimizing(true);
    await onDispatchOptimize(testUrl);
    setIsOptimizing(false);
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-3xl border border-slate-200 max-w-3xl w-full max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Modal Header */}
        <div className="p-6 border-b border-slate-200 flex justify-between items-center bg-slate-50/50">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
              <h2 className="text-xl font-extrabold text-slate-900">{site.domain}</h2>
            </div>
            <p className="text-xs text-slate-500">Site ID: {site.id}</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Sub Navigation */}
        <div className="flex border-b border-slate-200 px-6 bg-white gap-4">
          <button
            onClick={() => setActiveTab('preset')}
            className={`py-3 text-xs font-bold border-b-2 transition-colors ${
              activeTab === 'preset'
                ? 'border-sky-600 text-sky-600'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            Master Presets
          </button>
          <button
            onClick={() => setActiveTab('granular')}
            className={`py-3 text-xs font-bold border-b-2 transition-colors ${
              activeTab === 'granular'
                ? 'border-sky-600 text-sky-600'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            Granular Settings
          </button>
          <button
            onClick={() => setActiveTab('jobs')}
            className={`py-3 text-xs font-bold border-b-2 transition-colors ${
              activeTab === 'jobs'
                ? 'border-sky-600 text-sky-600'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            Cloudflare Browser Runner
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto flex-1 space-y-6">
          {activeTab === 'preset' && (
            <div className="space-y-4">
              <p className="text-xs text-slate-500">
                Select an optimization profile. Presets automatically configure caching, CSS inlining, script delaying, and media optimization.
              </p>

              {/* Preset Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div
                  onClick={() => handlePresetSelect('safe')}
                  className={`p-4 rounded-2xl border-2 cursor-pointer transition-all ${
                    config.preset === 'safe'
                      ? 'border-sky-600 bg-sky-50/50 shadow-md'
                      : 'border-slate-200 bg-white hover:border-slate-300'
                  }`}
                >
                  <Shield className="w-5 h-5 text-slate-700 mb-2" />
                  <h4 className="text-sm font-bold text-slate-900 mb-1">Safe Mode</h4>
                  <p className="text-[11px] text-slate-500 leading-relaxed">
                    Sub-15ms caching & script deferral. 100% theme compatibility guarantee.
                  </p>
                </div>

                <div
                  onClick={() => handlePresetSelect('aggressive')}
                  className={`p-4 rounded-2xl border-2 cursor-pointer transition-all ${
                    config.preset === 'aggressive'
                      ? 'border-sky-600 bg-sky-50/50 shadow-md'
                      : 'border-slate-200 bg-white hover:border-slate-300'
                  }`}
                >
                  <Zap className="w-5 h-5 text-sky-600 mb-2" />
                  <h4 className="text-sm font-bold text-slate-900 mb-1">Aggressive</h4>
                  <p className="text-[11px] text-slate-500 leading-relaxed">
                    Critical CSS inlining, LCP high priority preloading, and Next-Gen formats.
                  </p>
                </div>

                <div
                  onClick={() => handlePresetSelect('ludicrous')}
                  className={`p-4 rounded-2xl border-2 cursor-pointer transition-all ${
                    config.preset === 'ludicrous'
                      ? 'border-sky-600 bg-sky-50/50 shadow-md'
                      : 'border-slate-200 bg-white hover:border-slate-300'
                  }`}
                >
                  <Sparkles className="w-5 h-5 text-amber-500 mb-2" />
                  <h4 className="text-sm font-bold text-slate-900 mb-1">Ludicrous Speed</h4>
                  <p className="text-[11px] text-slate-500 leading-relaxed">
                    3-Tier JS Delay + jQuery stubbing queue, dynamic nonce micro-hydration.
                  </p>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'granular' && (
            <div className="space-y-6">
              {/* Caching */}
              <div className="border border-slate-200 rounded-2xl p-4 bg-slate-50/50">
                <h4 className="text-xs font-extrabold uppercase text-slate-400 tracking-wider mb-3">
                  Caching & Edge Delivery
                </h4>
                <div className="space-y-3">
                  <label className="flex items-center justify-between text-sm font-semibold text-slate-800">
                    <span>Enable advanced-cache.php Drop-In</span>
                    <input
                      type="checkbox"
                      checked={config.caching.enabled}
                      onChange={(e) =>
                        setConfig({
                          ...config,
                          caching: { ...config.caching, enabled: e.target.checked },
                        })
                      }
                      className="w-4 h-4 text-sky-600 rounded"
                    />
                  </label>

                  <label className="flex items-center justify-between text-sm font-semibold text-slate-800">
                    <span>Separate Mobile Viewport Cache</span>
                    <input
                      type="checkbox"
                      checked={config.caching.mobile_cache}
                      onChange={(e) =>
                        setConfig({
                          ...config,
                          caching: { ...config.caching, mobile_cache: e.target.checked },
                        })
                      }
                      className="w-4 h-4 text-sky-600 rounded"
                    />
                  </label>
                </div>
              </div>

              {/* JS Delay */}
              <div className="border border-slate-200 rounded-2xl p-4 bg-slate-50/50">
                <h4 className="text-xs font-extrabold uppercase text-slate-400 tracking-wider mb-3">
                  JavaScript Execution Engine
                </h4>
                <div className="space-y-3">
                  <div className="flex justify-between items-center text-sm font-semibold text-slate-800">
                    <span>Execution Mode</span>
                    <select
                      value={config.javascript.execution_mode}
                      onChange={(e) =>
                        setConfig({
                          ...config,
                          javascript: {
                            ...config.javascript,
                            execution_mode: e.target.value as any,
                          },
                        })
                      }
                      className="px-3 py-1.5 border border-slate-300 rounded-lg text-xs bg-white"
                    >
                      <option value="interaction_delay">Interaction Delay (Tier 2)</option>
                      <option value="defer">Defer Only (Tier 1)</option>
                      <option value="none">Disabled</option>
                    </select>
                  </div>

                  <div className="flex justify-between items-center text-sm font-semibold text-slate-800">
                    <span>Safety Timeout (ms)</span>
                    <input
                      type="number"
                      value={config.javascript.delay_timeout_ms}
                      onChange={(e) =>
                        setConfig({
                          ...config,
                          javascript: {
                            ...config.javascript,
                            delay_timeout_ms: parseInt(e.target.value, 10) || 3500,
                          },
                        })
                      }
                      className="w-24 px-3 py-1.5 border border-slate-300 rounded-lg text-xs bg-white text-right"
                    />
                  </div>
                </div>
              </div>

              {/* Dynamic Micro-Hydration */}
              <div className="border border-slate-200 rounded-2xl p-4 bg-slate-50/50">
                <h4 className="text-xs font-extrabold uppercase text-slate-400 tracking-wider mb-3">
                  Dynamic Micro-Hydration
                </h4>
                <div className="space-y-3">
                  <label className="flex items-center justify-between text-sm font-semibold text-slate-800">
                    <span>Dynamic Nonce Async Refresher</span>
                    <input
                      type="checkbox"
                      checked={config.dynamic.nonce_ajax_refresh}
                      onChange={(e) =>
                        setConfig({
                          ...config,
                          dynamic: {
                            ...config.dynamic,
                            nonce_ajax_refresh: e.target.checked,
                          },
                        })
                      }
                      className="w-4 h-4 text-sky-600 rounded"
                    />
                  </label>

                  <label className="flex items-center justify-between text-sm font-semibold text-slate-800">
                    <span>Speculation Rules Hover Prerender</span>
                    <input
                      type="checkbox"
                      checked={config.dynamic.speculation_rules_prerender}
                      onChange={(e) =>
                        setConfig({
                          ...config,
                          dynamic: {
                            ...config.dynamic,
                            speculation_rules_prerender: e.target.checked,
                          },
                        })
                      }
                      className="w-4 h-4 text-sky-600 rounded"
                    />
                  </label>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'jobs' && (
            <div className="space-y-6">
              <div className="p-4 bg-sky-50 border border-sky-100 rounded-2xl">
                <h4 className="text-sm font-bold text-sky-900 mb-1">
                  On-Demand Edge Puppeteer Runner
                </h4>
                <p className="text-xs text-sky-700 leading-relaxed">
                  Triggers headless Chromium at the Cloudflare Edge to inspect the DOM, extract AST-enriched Critical CSS, detect LCP candidates, and store assets in R2.
                </p>
              </div>

              <div className="flex gap-3">
                <input
                  type="url"
                  value={testUrl}
                  onChange={(e) => setTestUrl(e.target.value)}
                  placeholder="https://example.com/page-to-optimize"
                  className="flex-1 px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-sky-500"
                />
                <button
                  onClick={handleRunOptimization}
                  disabled={isOptimizing}
                  className="px-5 py-2.5 bg-sky-500 hover:bg-sky-400 text-slate-950 font-bold text-xs rounded-xl flex items-center gap-2 disabled:opacity-50 transition-all shadow-md"
                >
                  {isOptimizing ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>Extracting...</span>
                    </>
                  ) : (
                    <>
                      <Play className="w-3.5 h-3.5 fill-current" />
                      <span>Run Extraction</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-6 border-t border-slate-200 bg-slate-50/50 flex justify-between items-center">
          <span className="text-xs font-semibold text-emerald-600">
            {saveSuccess && (
              <span className="flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4" />
                Configuration synchronized across Cloudflare Edge!
              </span>
            )}
          </span>

          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 text-xs font-bold text-slate-600 hover:text-slate-900 rounded-xl"
            >
              Close
            </button>
            <button
              onClick={handleSave}
              disabled={isSaving}
              className="px-5 py-2.5 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs rounded-xl flex items-center gap-2 shadow-md transition-all disabled:opacity-50"
            >
              {isSaving ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>Saving...</span>
                </>
              ) : (
                <>
                  <Save className="w-3.5 h-3.5" />
                  <span>Save Configuration</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
