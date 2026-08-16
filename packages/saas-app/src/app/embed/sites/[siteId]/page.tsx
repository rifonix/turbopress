'use client';

import React, { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import {
  Zap, Globe, RefreshCw, Trash2, Play, Save, CheckCircle2, XCircle,
  Loader2, ShieldCheck, FlaskConical, Activity, ExternalLink, FileText,
  HardDriveDownload, Eye, AlertTriangle, Layers, ChevronDown,
} from 'lucide-react';
import { PRESETS_RECORD } from '@turbopress/shared';

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

interface EmbedJob {
  id: string;
  url: string;
  viewport: string;
  status: string;
  error_message: string | null;
  attempts: number;
  created_at: number;
  completed_at: number | null;
  critical_css_bytes: number | null;
  lcp_selector: string | null;
  lcp_image_url: string | null;
}

interface OffloadLogEntry {
  t: number;
  src: string;
  w: number;
  f: string;
  status: string;
}

interface SiteContext {
  post_types?: Array<{ name: string; label: string }>;
  plugins?: Record<string, string>;
}

interface EmbedData {
  site: {
    id: string;
    domain: string;
    pluginVersion: string | null;
    wpVersion: string | null;
    lastPingAt: number | null;
  };
  config: Record<string, any>;
  health: any;
  jobs: EmbedJob[];
  offloadLog?: OffloadLogEntry[];
}

interface OptimizedPage {
  url: string;
  path: string;
  lastCompleted: number | null;
  pending: boolean;
  failing: boolean;
  viewports: Record<string, { bytes: number | null; lcpSelector: string | null; at: number | null }>;
  lastError: string | null;
}

/* ------------------------------------------------------------------ */
/* Small UI helpers (match the SaaS design language)                   */
/* ------------------------------------------------------------------ */

function Toggle({
  checked, onChange, label, hint, disabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  hint?: string;
  disabled?: boolean;
}) {
  return (
    <label className={`flex items-start justify-between gap-3 py-2.5 ${disabled ? 'opacity-50' : 'cursor-pointer'}`}>
      <span className="min-w-0">
        <span className="block text-[13px] font-medium text-[#18181b]">{label}</span>
        {hint && <span className="block text-[11px] text-[#71717a] mt-0.5 leading-snug">{hint}</span>}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={`relative shrink-0 w-9 h-5 rounded-full transition-colors ${checked ? 'bg-[#f03e2f]' : 'bg-[#e4e4e7]'}`}
      >
        <span
          className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${checked ? 'translate-x-4' : ''}`}
        />
      </button>
    </label>
  );
}

/** One-exclusion-per-line textarea bound to a string[] config path. */
function ListField({
  value, onChange, label, hint, placeholder,
}: {
  value: string[];
  onChange: (v: string[]) => void;
  label: string;
  hint?: string;
  placeholder?: string;
}) {
  return (
    <div className="py-2.5">
      <span className="block text-[13px] font-medium text-[#18181b]">{label}</span>
      {hint && <span className="block text-[11px] text-[#71717a] mt-0.5 leading-snug">{hint}</span>}
      <textarea
        rows={3}
        spellCheck={false}
        placeholder={placeholder}
        value={(value || []).join('\n')}
        onChange={(e) => onChange(e.target.value.split('\n').map((s) => s.trim()).filter(Boolean))}
        className="mt-1.5 w-full rounded-lg border border-[#e4e4e7] px-2.5 py-2 text-[11px] font-mono text-[#3f3f46] focus:outline-none focus:border-[#f03e2f] resize-y"
      />
    </div>
  );
}

function Card({ title, icon, children }: { title: string; icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="bg-white border border-[#e4e4e7] rounded-2xl p-5 shadow-sm">
      <div className="flex items-center gap-2 mb-2">
        {icon && <span className="text-[#f03e2f]">{icon}</span>}
        <h3 className="text-sm font-semibold text-[#18181b]">{title}</h3>
      </div>
      <div className="divide-y divide-[#f4f4f5]">{children}</div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    completed: 'bg-[#ecfdf3] text-[#027a48]',
    queued: 'bg-[#fffaeb] text-[#b54708]',
    processing: 'bg-[#eff8ff] text-[#175cd3]',
    failed: 'bg-[#fef3f2] text-[#b42318]',
    needs_attention: 'bg-[#fffaeb] text-[#b54708]',
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold ${map[status] || 'bg-[#f4f4f5] text-[#52525b]'}`}>
      {status.replace('_', ' ')}
    </span>
  );
}

/**
 * Per-post-type plugin asset unloading: check which plugins' css/js should
 * be stripped from pages of each post type. '*' applies to every page.
 * Built from the plugin's health-report site context (post types + active
 * plugins with their slugs).
 */
function PluginControlCard({
  siteContext, unloadRules, onChange,
}: {
  siteContext: SiteContext;
  unloadRules: Record<string, string[]>;
  onChange: (rules: Record<string, string[]>) => void;
}) {
  const postTypes: Array<{ name: string; label: string }> = [
    { name: '*', label: 'All pages' },
    ...(siteContext.post_types || []),
  ];
  const plugins = Object.entries(siteContext.plugins || {}).sort((a, b) => a[1].localeCompare(b[1]));
  const [openType, setOpenType] = React.useState<string | null>(null);

  if (plugins.length === 0) {
    return (
      <div className="bg-white border border-[#e4e4e7] rounded-2xl p-5 shadow-sm text-xs text-[#71717a]">
        Plugin asset control unlocks once the plugin sends its first health report (a few minutes after connecting).
      </div>
    );
  }

  const toggleRule = (pt: string, slug: string) => {
    const current = new Set(unloadRules[pt] || []);
    if (current.has(slug)) current.delete(slug);
    else current.add(slug);
    const next = { ...unloadRules };
    if (current.size === 0) delete next[pt];
    else next[pt] = [...current];
    onChange(next);
  };

  const countFor = (pt: string) => (unloadRules[pt] || []).length;

  return (
    <div className="bg-white border border-[#e4e4e7] rounded-2xl shadow-sm overflow-hidden">
      <div className="px-5 py-3 border-b border-[#e4e4e7] flex items-center gap-2">
        <span className="text-[#f03e2f]"><Layers className="w-4 h-4" /></span>
        <h3 className="text-sm font-semibold text-[#18181b]">Plugin Asset Control</h3>
        <span className="text-[11px] text-[#71717a]">
          Strip the css &amp; js of plugins a page doesn&apos;t use — big wins when many plugins are active.
        </span>
      </div>
      <div className="divide-y divide-[#f4f4f5]">
        {postTypes.map((pt) => {
          const open = openType === pt.name;
          const rules = new Set(unloadRules[pt.name] || []);
          return (
            <div key={pt.name}>
              <button
                onClick={() => setOpenType(open ? null : pt.name)}
                className="w-full px-5 py-3 flex items-center gap-3 hover:bg-[#fafafa] text-left"
              >
                <span className="text-[13px] font-medium flex-1">{pt.label}</span>
                {countFor(pt.name) > 0 && (
                  <span className="px-2 py-0.5 rounded-full bg-[#fff8f7] text-[#f03e2f] text-[10px] font-bold">
                    {countFor(pt.name)} unloaded
                  </span>
                )}
                <ChevronDown className={`w-4 h-4 text-[#71717a] transition-transform ${open ? 'rotate-180' : ''}`} />
              </button>
              {open && (
                <div className="px-5 pb-4 grid grid-cols-1 sm:grid-cols-2 gap-1">
                  {plugins.map(([slug, name]) => (
                    <label key={slug} className="flex items-center gap-2 py-1.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={rules.has(slug)}
                        onChange={() => toggleRule(pt.name, slug)}
                        className="accent-[#f03e2f] w-3.5 h-3.5"
                      />
                      <span className="min-w-0">
                        <span className="block text-[12px] text-[#18181b] truncate">{name}</span>
                        <span className="block text-[10px] text-[#a1a1aa] font-mono truncate">{slug}</span>
                      </span>
                    </label>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Config path helpers                                                 */
/* ------------------------------------------------------------------ */

function getPath(obj: any, path: string): any {
  return path.split('.').reduce((acc, k) => (acc == null ? acc : acc[k]), obj);
}

function setPath(obj: any, path: string, value: any): any {
  const keys = path.split('.');
  const clone = Array.isArray(obj) ? [...obj] : { ...obj };
  let curr = clone;
  for (let i = 0; i < keys.length - 1; i++) {
    const k = keys[i];
    curr[k] = curr[k] != null && typeof curr[k] === 'object' ? (Array.isArray(curr[k]) ? [...curr[k]] : { ...curr[k] }) : {};
    curr = curr[k];
  }
  curr[keys[keys.length - 1]] = value;
  return clone;
}

function timeAgo(ts: number | null | undefined): string {
  if (!ts) return '—';
  const s = Math.max(1, Math.floor(Date.now() / 1000 - ts));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

/* ------------------------------------------------------------------ */
/* Main embed panel                                                    */
/* ------------------------------------------------------------------ */

function EmbedPanel() {
  const params = useParams<{ siteId: string }>();
  const search = useSearchParams();
  const token = search.get('t') || '';

  const [data, setData] = useState<EmbedData | null>(null);
  const [config, setConfig] = useState<Record<string, any> | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState('');
  const [toast, setToast] = useState('');
  const [dirty, setDirty] = useState(false);
  const [logTab, setLogTab] = useState<'pages' | 'jobs' | 'offload'>('pages');
  const [pageBusy, setPageBusy] = useState('');
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(''), 2600);
  }, []);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/v1/embed/site', { headers: { 'X-Embed-Token': token } });
      const json = await res.json();
      if (!res.ok || !json.success) {
        setError(json.error || 'Failed to load site');
        return;
      }
      setData(json.data);
      setConfig(json.data.config);
      setError('');
    } catch {
      setError('Network error — check your connection.');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { load(); }, [load]);

  // Auto-size the WP dashboard iframe: report content height to the
  // parent page whenever the layout grows or shrinks.
  useEffect(() => {
    const post = () => {
      try {
        const h = Math.ceil(document.documentElement.scrollHeight);
        window.parent.postMessage({ type: 'tp-embed-height', h }, '*');
      } catch { /* cross-origin guard */ }
    };
    post();
    const ro = new ResizeObserver(post);
    ro.observe(document.body);
    window.addEventListener('resize', post);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', post);
    };
  }, []);

  // Poll jobs while any are in flight.
  const activeJobs = useMemo(
    () => (data?.jobs || []).some((j) => j.status === 'queued' || j.status === 'processing'),
    [data]
  );
  useEffect(() => {
    if (!activeJobs) return;
    const t = setInterval(load, 8000);
    return () => clearInterval(t);
  }, [activeJobs, load]);

  /* Group jobs by URL for the Optimized Pages view. Hooks must all run
   * before any early return, so this lives here — not below the guards. */
  const pages: OptimizedPage[] = useMemo(() => {
    const byUrl = new Map<string, OptimizedPage>();
    for (const job of data?.jobs || []) {
      let entry = byUrl.get(job.url);
      if (!entry) {
        let path = job.url;
        try { path = new URL(job.url).pathname || '/'; } catch { /* keep raw */ }
        entry = {
          url: job.url,
          path,
          lastCompleted: null,
          pending: false,
          failing: false,
          viewports: {},
          lastError: null,
        };
        byUrl.set(job.url, entry);
      }
      if (job.status === 'queued' || job.status === 'processing') entry.pending = true;
      if (job.status === 'failed' || job.status === 'needs_attention') {
        entry.failing = true;
        if (job.error_message) entry.lastError = job.error_message;
      }
      if (job.status === 'completed') {
        const at = job.completed_at || job.created_at;
        if (!entry.viewports[job.viewport] || (entry.viewports[job.viewport].at ?? 0) < at) {
          entry.viewports[job.viewport] = {
            bytes: job.critical_css_bytes,
            lcpSelector: job.lcp_selector,
            at,
          };
        }
        if (!entry.lastCompleted || entry.lastCompleted < at) entry.lastCompleted = at;
      }
    }
    return [...byUrl.values()].sort((a, b) => (b.lastCompleted ?? 0) - (a.lastCompleted ?? 0));
  }, [data?.jobs]);

  const upsert = (path: string, value: any) => {
    setConfig((c) => (c ? setPath(c, path, value) : c));
    setDirty(true);
  };

  /**
   * Presets are more than a label: selecting one loads its full tuned
   * configuration into the form so every toggle below updates. The
   * deployment status stays as-is (deploy is a separate decision).
   */
  const applyPreset = (id: string) => {
    if (!config) return;
    const preset = PRESETS_RECORD[id];
    if (!preset) return;
    let next: Record<string, any> = { ...preset, preset: id };
    // Keep deployment decisions from the current config — deploy is a
    // separate, explicit action.
    if (config.deployment) next.deployment = { ...config.deployment };
    setConfig(next);
    setDirty(true);
    showToast(`${id[0].toUpperCase()}${id.slice(1)} preset applied — review the toggles and save`);
  };

  const save = async () => {
    if (!config) return;
    setSaving(true);
    try {
      const res = await fetch('/api/v1/embed/site/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'X-Embed-Token': token },
        body: JSON.stringify(config),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        showToast(json.error || 'Save failed');
      } else {
        setDirty(false);
        showToast(json.data?.pushedToPlugin ? 'Saved & applied to your site instantly' : 'Saved — plugin will sync on next heartbeat');
      }
    } catch {
      showToast('Network error while saving');
    } finally {
      setSaving(false);
    }
  };

  const purge = async () => {
    setBusy('purge');
    try {
      const res = await fetch('/api/v1/embed/site/purge', {
        method: 'POST',
        headers: { 'X-Embed-Token': token },
      });
      const json = await res.json();
      showToast(json.data?.pushedToPlugin ? 'Cache purged on your site' : 'Purge queued — plugin will pick it up');
    } catch {
      showToast('Network error');
    } finally {
      setBusy('');
    }
  };

  const dispatchUrl = async (url: string) => {
    setBusy('dispatch');
    setPageBusy(url);
    try {
      const res = await fetch('/api/v1/embed/site/dispatch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Embed-Token': token },
        body: JSON.stringify({ url }),
      });
      const json = await res.json();
      if (json.success) {
        showToast(`Optimization started (${json.data.jobs.length} jobs)`);
        setTimeout(load, 1500);
      } else {
        showToast(json.error || 'Dispatch failed');
      }
    } catch {
      showToast('Network error');
    } finally {
      setBusy('');
      setPageBusy('');
    }
  };

  const dispatch = () => dispatchUrl(`https://${data?.site.domain}/`);

  const setDeployment = async (status: 'test' | 'live') => {
    if (!config) return;
    if (status === 'live') {
      const ok = window.confirm(
        'Deploy the optimized website to ALL visitors now?\n\n' +
        'Make sure you have tested the optimized site with "Preview Cached Website" — pages, styling, menus, forms and checkout — before deploying.'
      );
      if (!ok) return;
    }
    const next = setPath(setPath(config, 'deployment.status', status), 'deployment.source', 'dashboard');
    setConfig(next);
    setDirty(true);
    // Save immediately + explicit deploy command rides the same PUT.
    setSaving(true);
    try {
      const res = await fetch('/api/v1/embed/site/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'X-Embed-Token': token },
        body: JSON.stringify(next),
      });
      const json = await res.json();
      if (json.success) {
        setDirty(false);
        showToast(status === 'live' ? 'Deployed — visitors now get the optimized site' : 'Test mode enabled — visitors see the unoptimized site');
      } else {
        showToast(json.error || 'Deployment update failed');
      }
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#fafafa] grid place-items-center">
        <div className="flex items-center gap-2 text-[#71717a] text-sm">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading site controls…
        </div>
      </div>
    );
  }

  if (error || !data || !config) {
    return (
      <div className="min-h-screen bg-[#fafafa] grid place-items-center p-8">
        <div className="bg-white border border-[#e4e4e7] rounded-2xl p-8 text-center max-w-sm shadow-sm space-y-3">
          <div className="w-12 h-12 rounded-xl bg-[#fff1ef] text-[#f03e2f] grid place-items-center mx-auto">
            <XCircle className="w-6 h-6" />
          </div>
          <h2 className="text-base font-semibold text-[#18181b]">Can&apos;t load the dashboard</h2>
          <p className="text-xs text-[#71717a]">{error || 'Unknown error'}</p>
          <p className="text-[11px] text-[#a1a1aa]">Go back to WP-admin and reload the Turbopress page to mint a fresh token.</p>
        </div>
      </div>
    );
  }

  const deploymentStatus: string = getPath(config, 'deployment.status') || 'live';
  const isTest = deploymentStatus === 'test';
  const previewUrl = `https://${data.site.domain}/?tp_preview=1`;
  const preset: string = config.preset || 'ludicrous';
  const offloadLog = data.offloadLog || [];

  const presets: Array<{ id: string; name: string; desc: string }> = [
    { id: 'safe', name: 'Safe', desc: 'Caching + minify only. No JS deferral.' },
    { id: 'aggressive', name: 'Aggressive', desc: 'Defer all JS, combine CSS, proxy assets.' },
    { id: 'ludicrous', name: 'Ludicrous', desc: 'Everything + delay-until-interaction JS.' },
  ];

  return (
    <div className="min-h-screen bg-[#fafafa] text-[#18181b]">
      {/* Header */}
      <header className="bg-white border-b border-[#e4e4e7] sticky top-0 z-20">
        <div className="max-w-5xl mx-auto px-5 py-3.5 flex items-center gap-3 flex-wrap">
          <div className="w-8 h-8 rounded-lg bg-[#f03e2f] text-white grid place-items-center shrink-0">
            <Zap className="w-4.5 h-4.5" fill="currentColor" />
          </div>
          <div className="min-w-0 mr-auto">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold truncate flex items-center gap-1.5">
                <Globe className="w-3.5 h-3.5 text-[#71717a]" />{data.site.domain}
              </span>
              <span
                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${
                  isTest
                    ? 'bg-[#fffaeb] text-[#b54708]'
                    : 'bg-[#ecfdf3] text-[#027a48]'
                }`}
              >
                {isTest ? <FlaskConical className="w-3 h-3" /> : <ShieldCheck className="w-3 h-3" />}
                {deploymentStatus.toUpperCase()}
              </span>
            </div>
            <div className="text-[11px] text-[#71717a]">
              plugin v{data.site.pluginVersion || '?'} · WP {data.site.wpVersion || '?'}
              {data.site.lastPingAt ? ` · pinged ${new Date(data.site.lastPingAt * 1000).toLocaleTimeString()}` : ''}
            </div>
          </div>

          {isTest ? (
            <button
              onClick={() => setDeployment('live')}
              disabled={saving}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-[#f03e2f] hover:bg-[#d93628] text-white text-xs font-semibold disabled:opacity-50"
            >
              <ShieldCheck className="w-3.5 h-3.5" /> Deploy to Visitors
            </button>
          ) : (
            <button
              onClick={() => setDeployment('test')}
              disabled={saving}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-[#e4e4e7] hover:bg-[#fafafa] text-xs font-semibold disabled:opacity-50"
              title="Visitors will see the unoptimized site while you test"
            >
              <FlaskConical className="w-3.5 h-3.5" /> Revert to Test
            </button>
          )}
          <a
            href={previewUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-[#e4e4e7] hover:bg-[#fafafa] text-xs font-semibold"
          >
            <Eye className="w-3.5 h-3.5" /> Preview
          </a>
          <button
            onClick={dispatch}
            disabled={busy === 'dispatch'}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-[#e4e4e7] hover:bg-[#fafafa] text-xs font-semibold disabled:opacity-50"
          >
            {busy === 'dispatch' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
            Run Optimization
          </button>
          <button
            onClick={purge}
            disabled={busy === 'purge'}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-[#e4e4e7] hover:bg-[#fafafa] text-xs font-semibold disabled:opacity-50"
          >
            {busy === 'purge' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
            Purge Cache
          </button>
        </div>
      </header>

      {/* Test-mode explainer */}
      {isTest && (
        <div className="bg-[#fffaeb] border-b border-[#fedf89]">
          <div className="max-w-5xl mx-auto px-5 py-3 flex items-start gap-2.5 text-[12px] text-[#7a2e0e] leading-relaxed">
            <AlertTriangle className="w-4 h-4 text-[#d97706] shrink-0 mt-0.5" />
            <span>
              <strong>Not deployed to real visitors.</strong> Visitors currently see the unoptimized website.{' '}
              <a href={previewUrl} target="_blank" rel="noreferrer" className="underline font-semibold">
                Test the optimized version
              </a>{' '}
              first, then click <strong>Deploy to Visitors</strong> when everything looks right.
            </span>
          </div>
        </div>
      )}

      <main className="max-w-5xl mx-auto px-5 py-6 space-y-6">
        {/* Presets */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {presets.map((p) => (
            <button
              key={p.id}
              onClick={() => applyPreset(p.id)}
              className={`text-left p-4 rounded-2xl border transition-all ${
                preset === p.id
                  ? 'border-[#f03e2f] bg-[#fff8f7] shadow-sm'
                  : 'border-[#e4e4e7] bg-white hover:border-[#d4d4d8]'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold">{p.name}</span>
                {preset === p.id && <CheckCircle2 className="w-4 h-4 text-[#f03e2f]" />}
              </div>
              <p className="text-[11px] text-[#71717a] mt-1 leading-snug">{p.desc}</p>
            </button>
          ))}
        </div>

        {/* Settings grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card title="Critical CSS" icon={<Zap className="w-4 h-4" />}>
            <Toggle label="Edge Critical CSS" hint="Puppeteer-extracted critical CSS per page" checked={!!getPath(config, 'critical_css.enabled')} onChange={(v) => upsert('critical_css.enabled', v)} />
            <Toggle label="Inline critical CSS" checked={!!getPath(config, 'critical_css.inline')} onChange={(v) => upsert('critical_css.inline', v)} />
            <Toggle label="Async load full CSS" hint="Load remaining CSS after first paint (Tier 2 sites)" checked={!!getPath(config, 'critical_css.async_load_full')} onChange={(v) => upsert('critical_css.async_load_full', v)} />
            <Toggle label="Font display swap" checked={!!getPath(config, 'critical_css.font_display_swap')} onChange={(v) => upsert('critical_css.font_display_swap', v)} />
            <ListField
              label="Excluded stylesheets"
              hint="Never combine/defer sheets whose URL contains any of these (one per line)"
              placeholder={'elementor/post-123\nwp-includes/block-library'}
              value={getPath(config, 'critical_css.excluded_stylesheets') || []}
              onChange={(v) => upsert('critical_css.excluded_stylesheets', v)}
            />
          </Card>

          <Card title="CSS Delivery" icon={<Activity className="w-4 h-4" />}>
            <Toggle label="Combine stylesheets" hint="Merge render-blocking sheets into one bundle" checked={!!getPath(config, 'css.combine')} onChange={(v) => upsert('css.combine', v)} />
            <Toggle label="Minify CSS" checked={!!getPath(config, 'css.minify')} onChange={(v) => upsert('css.minify', v)} />
            <Toggle label="Inline-all CSS (Tier 1)" hint="Inline the full stylesheet in HTML when under 512KB — no FOUC by construction" checked={!!getPath(config, 'css.inline_all')} onChange={(v) => upsert('css.inline_all', v)} />
          </Card>

          <Card title="JavaScript Engine" icon={<Zap className="w-4 h-4" />}>
            <div className="py-2.5">
              <span className="block text-[13px] font-medium mb-1.5">Execution mode</span>
              <div className="grid grid-cols-3 gap-1.5">
                {(['none', 'defer', 'interaction_delay'] as const).map((m) => (
                  <button
                    key={m}
                    onClick={() => upsert('javascript.execution_mode', m)}
                    className={`px-2 py-1.5 rounded-lg text-[11px] font-semibold border ${
                      getPath(config, 'javascript.execution_mode') === m
                        ? 'border-[#f03e2f] bg-[#fff8f7] text-[#f03e2f]'
                        : 'border-[#e4e4e7] bg-white hover:bg-[#fafafa]'
                    }`}
                  >
                    {m === 'none' ? 'Off' : m === 'defer' ? 'Defer' : 'Delay'}
                  </button>
                ))}
              </div>
            </div>
            <div className="py-2.5">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[13px] font-medium">Delay timeout</span>
                <span className="text-[11px] text-[#71717a] font-mono">{getPath(config, 'javascript.delay_timeout_ms') ?? 3500}ms</span>
              </div>
              <input
                type="range" min={1500} max={6000} step={250}
                value={getPath(config, 'javascript.delay_timeout_ms') ?? 3500}
                onChange={(e) => upsert('javascript.delay_timeout_ms', parseInt(e.target.value, 10))}
                className="w-full accent-[#f03e2f]"
              />
            </div>
            <Toggle label="Remove jQuery Migrate" checked={!!getPath(config, 'javascript.remove_jquery_migrate')} onChange={(v) => upsert('javascript.remove_jquery_migrate', v)} />
            <ListField
              label="Script exclusions"
              hint="Scripts that must run before first interaction — only applies in Delay mode (one per line)"
              placeholder={'cookiebot\nstripe.js'}
              value={getPath(config, 'javascript.exclusions') || []}
              onChange={(v) => upsert('javascript.exclusions', v)}
            />
          </Card>

          <Card title="Media & R2 Offload" icon={<Globe className="w-4 h-4" />}>
            <Toggle label="Offload images to R2" hint="Rewrite + optimize (webp, resized) via the edge CDN" checked={!!getPath(config, 'media.offload_images')} onChange={(v) => upsert('media.offload_images', v)} />
            <Toggle label="Offload videos to R2" checked={!!getPath(config, 'media.offload_video')} onChange={(v) => upsert('media.offload_video', v)} />
            <Toggle label="Lazy-load images" checked={!!getPath(config, 'media.lazyload_images')} onChange={(v) => upsert('media.lazyload_images', v)} />
            <Toggle label="Lazy-load iframes" checked={!!getPath(config, 'media.lazyload_iframes')} onChange={(v) => upsert('media.lazyload_iframes', v)} />
            <Toggle label="Preload LCP image" checked={!!getPath(config, 'media.preload_lcp_image')} onChange={(v) => upsert('media.preload_lcp_image', v)} />
            <Toggle label="fetchpriority on LCP" checked={!!getPath(config, 'media.auto_fetchpriority_lcp')} onChange={(v) => upsert('media.auto_fetchpriority_lcp', v)} />
            <ListField
              label="Excluded images"
              hint="Image URLs never offload/lazy-load (one per line)"
              placeholder={'wp-content/uploads/logo.png'}
              value={getPath(config, 'media.excluded_images') || []}
              onChange={(v) => upsert('media.excluded_images', v)}
            />
          </Card>

          <Card title="Fonts & Hints" icon={<Activity className="w-4 h-4" />}>
            <Toggle label="Localize Google Fonts" hint="Self-host woff2 with display:swap" checked={!!getPath(config, 'fonts.localize_google')} onChange={(v) => upsert('fonts.localize_google', v)} />
            <Toggle label="Preload LCP font" checked={!!getPath(config, 'fonts.preload_lcp_font')} onChange={(v) => upsert('fonts.preload_lcp_font', v)} />
            <Toggle label="Resource hints" hint="Auto preconnect for 3rd-party origins" checked={!!getPath(config, 'hints.resource_hints')} onChange={(v) => upsert('hints.resource_hints', v)} />
          </Card>

          <Card title="Asset Proxy & Delivery" icon={<Globe className="w-4 h-4" />}>
            <Toggle label="Proxy 3rd-party css/js" hint="Serve foreign assets through the signed R2 route" checked={!!getPath(config, 'assets.proxy_enabled')} onChange={(v) => upsert('assets.proxy_enabled', v)} />
            <Toggle label="Manage .htaccess" hint="Brotli precompressed twins + immutable cache TTLs" checked={!!getPath(config, 'htaccess.enabled')} onChange={(v) => upsert('htaccess.enabled', v)} />
          </Card>

          <Card title="Page Cache" icon={<ShieldCheck className="w-4 h-4" />}>
            <Toggle label="Page caching" checked={!!getPath(config, 'caching.enabled')} onChange={(v) => upsert('caching.enabled', v)} />
            <Toggle label="Separate mobile cache" checked={!!getPath(config, 'caching.mobile_cache')} onChange={(v) => upsert('caching.mobile_cache', v)} />
            <Toggle label="Purge on post update" checked={!!getPath(config, 'caching.purge_on_post_update')} onChange={(v) => upsert('caching.purge_on_post_update', v)} />
            <Toggle label="Purge on new comment" checked={!!getPath(config, 'caching.purge_on_comment')} onChange={(v) => upsert('caching.purge_on_comment', v)} />
          </Card>

          <Card title="Dynamic & Safety" icon={<FlaskConical className="w-4 h-4" />}>
            <Toggle label="Speculation rules (prefetch)" checked={!!getPath(config, 'dynamic.speculation_rules_prerender')} onChange={(v) => upsert('dynamic.speculation_rules_prerender', v)} />
            <Toggle label="Nonce refresh hydration" checked={!!getPath(config, 'dynamic.nonce_ajax_refresh')} onChange={(v) => upsert('dynamic.nonce_ajax_refresh', v)} />
            <Toggle label="Cart micro-hydration" checked={!!getPath(config, 'dynamic.cart_micro_hydration')} onChange={(v) => upsert('dynamic.cart_micro_hydration', v)} />
            <Toggle label="Auto-degrade safety net" hint="Step down JS aggressiveness automatically on rising error rates" checked={!!getPath(config, 'deployment.auto_degrade')} onChange={(v) => upsert('deployment.auto_degrade', v)} />
          </Card>
        </div>

        {/* Plugin Asset Control — strip css/js of unused plugins per post type */}
        <PluginControlCard
          siteContext={(data.health?.site_context as SiteContext) || {}}
          unloadRules={getPath(config, 'plugins.unload_rules') || {}}
          onChange={(rules) => upsert('plugins.unload_rules', rules)}
        />

        {/* Pages & logs */}
        <div className="bg-white border border-[#e4e4e7] rounded-2xl shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3 border-b border-[#e4e4e7]">
            <div className="flex items-center gap-1">
              {([
                ['pages', 'Optimized Pages', <Eye key="e" className="w-3.5 h-3.5" />],
                ['jobs', 'Job Log', <FileText key="j" className="w-3.5 h-3.5" />],
                ['offload', 'R2 Offload Log', <HardDriveDownload key="o" className="w-3.5 h-3.5" />],
              ] as const).map(([id, label, icon]) => (
                <button
                  key={id}
                  onClick={() => setLogTab(id as 'pages' | 'jobs' | 'offload')}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold ${
                    logTab === id ? 'bg-[#fff8f7] text-[#f03e2f]' : 'text-[#71717a] hover:bg-[#fafafa]'
                  }`}
                >
                  {icon}{label}
                </button>
              ))}
            </div>
            <button onClick={load} className="text-[#71717a] hover:text-[#18181b]" title="Refresh">
              <RefreshCw className={`w-4 h-4 ${activeJobs ? 'animate-spin' : ''}`} />
            </button>
          </div>

          {logTab === 'pages' && (
            <div className="max-h-96 overflow-y-auto divide-y divide-[#f4f4f5]">
              {pages.length === 0 && (
                <div className="px-5 py-8 text-center text-xs text-[#71717a]">
                  No pages optimized yet — hit “Run Optimization” to generate critical CSS + measure LCP.
                </div>
              )}
              {pages.map((page) => (
                <div key={page.url} className="px-5 py-3 flex items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="text-[12px] font-medium truncate">{page.path}</div>
                    <div className="text-[10px] text-[#71717a] flex items-center gap-1.5 flex-wrap">
                      <span>optimized {timeAgo(page.lastCompleted)}</span>
                      {Object.entries(page.viewports).map(([vp, info]) => (
                        <span key={vp} className="inline-flex items-center gap-0.5 px-1.5 py-px rounded bg-[#f4f4f5]">
                          {vp}
                          {info.bytes ? ` · ${(info.bytes / 1024).toFixed(1)}KB` : ''}
                        </span>
                      ))}
                    </div>
                    {page.lastError && (
                      <div className="text-[10px] text-[#b42318] truncate" title={page.lastError}>{page.lastError}</div>
                    )}
                  </div>
                  {page.pending && <Loader2 className="w-3.5 h-3.5 animate-spin text-[#175cd3] shrink-0" />}
                  {page.failing && !page.pending && <XCircle className="w-3.5 h-3.5 text-[#b42318] shrink-0" />}
                  <button
                    onClick={() => dispatchUrl(page.url)}
                    disabled={pageBusy === page.url || page.pending}
                    className="shrink-0 inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-[#e4e4e7] text-[11px] font-semibold hover:bg-[#fafafa] disabled:opacity-50"
                    title="Re-optimize this page"
                  >
                    {pageBusy === page.url ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
                    Re-run
                  </button>
                </div>
              ))}
            </div>
          )}

          {logTab === 'jobs' && (
            <div className="max-h-96 overflow-y-auto divide-y divide-[#f4f4f5]">
              {(data.jobs || []).length === 0 && (
                <div className="px-5 py-8 text-center text-xs text-[#71717a]">No jobs recorded yet.</div>
              )}
              {(data.jobs || []).map((job) => (
                <div key={job.id} className="px-5 py-2.5 flex items-center gap-3">
                  <StatusBadge status={job.status} />
                  <div className="min-w-0 flex-1">
                    <div className="text-[12px] font-medium truncate">{job.url}</div>
                    <div className="text-[10px] text-[#71717a]">
                      {job.viewport}
                      {job.critical_css_bytes ? ` · ${(job.critical_css_bytes / 1024).toFixed(1)}KB CSS` : ''}
                      {job.created_at ? ` · ${new Date(job.created_at * 1000).toLocaleString()}` : ''}
                      {job.attempts > 1 ? ` · ${job.attempts} attempts` : ''}
                    </div>
                    {job.error_message && (
                      <div className="text-[10px] text-[#b42318] truncate" title={job.error_message}>{job.error_message}</div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {logTab === 'offload' && (
            <div className="max-h-96 overflow-y-auto divide-y divide-[#f4f4f5]">
              {offloadLog.length === 0 && (
                <div className="px-5 py-8 text-center text-xs text-[#71717a]">
                  No R2 offload activity yet — enable “Offload images/videos to R2” and save.
                </div>
              )}
              {offloadLog.map((entry, i) => (
                <div key={`${entry.t}-${i}`} className="px-5 py-2.5 flex items-center gap-3">
                  <span
                    className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold shrink-0 ${
                      entry.status === 'ok' ? 'bg-[#ecfdf3] text-[#027a48]' : 'bg-[#fffaeb] text-[#b54708]'
                    }`}
                  >
                    {entry.status === 'ok' ? 'stored' : entry.status}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="text-[11px] font-mono truncate" title={entry.src}>{entry.src}</div>
                    <div className="text-[10px] text-[#71717a]">
                      {entry.f}{entry.w > 0 ? ` · ${entry.w}px` : ''} · {new Date(entry.t * 1000).toLocaleString()}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="text-center text-[11px] text-[#a1a1aa] pb-4">
          Turbopress embed · changes apply to your site instantly via the signed command channel ·{' '}
          <a href="/" target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 hover:text-[#71717a]">
            open full dashboard <ExternalLink className="w-3 h-3" />
          </a>
        </div>
      </main>

      {/* Save bar */}
      {dirty && (
        <div className="fixed bottom-0 inset-x-0 z-30 border-t border-[#e4e4e7] bg-white/95 backdrop-blur">
          <div className="max-w-5xl mx-auto px-5 py-3 flex items-center justify-between gap-3">
            <span className="text-xs text-[#71717a]">Unsaved changes — saving pushes them to your site instantly.</span>
            <div className="flex items-center gap-2">
              <button onClick={() => { setConfig(data.config); setDirty(false); }} className="px-3 py-2 rounded-lg border border-[#e4e4e7] text-xs font-semibold hover:bg-[#fafafa]">
                Discard
              </button>
              <button
                onClick={save}
                disabled={saving}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#f03e2f] hover:bg-[#d93628] text-white text-xs font-semibold disabled:opacity-50"
              >
                {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                Save & Apply
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-16 left-1/2 -translate-x-1/2 z-40 bg-[#18181b] text-white text-xs font-medium px-4 py-2.5 rounded-xl shadow-lg animate-fade-in">
          {toast}
        </div>
      )}
    </div>
  );
}

export default function EmbedSitePage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[#fafafa] grid place-items-center">
          <Loader2 className="w-5 h-5 animate-spin text-[#71717a]" />
        </div>
      }
    >
      <EmbedPanel />
    </Suspense>
  );
}
