'use client';

import React, { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import {
  Zap, Globe, RefreshCw, Trash2, Play, Save, XCircle,
  Loader2, ShieldCheck, FlaskConical, ExternalLink, FileText,
  HardDriveDownload, Eye, AlertTriangle,
} from 'lucide-react';
import { PRESETS_RECORD } from '@wpinstant/shared';
import { SettingsPanel } from '@/components/site-settings/SettingsPanel';
import { StatusBadge, getPath, setPath, type SiteContext } from '@/components/site-settings/fields';

const API_BASE = (process.env.NEXT_PUBLIC_API_BASE_URL || 'https://api.wpinstant.dev').replace(/\/$/, '');

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
  // Mirror of dirty for the polling path (stale-closure safe).
  const dirtyRef = useRef(false);
  useEffect(() => { dirtyRef.current = dirty; }, [dirty]);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(''), 2600);
  }, []);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/v1/embed/site`, { headers: { 'X-Embed-Token': token } });
      const json = await res.json();
      if (!res.ok || !json.success) {
        setError(json.error || 'Failed to load site');
        return;
      }
      setData(json.data);
      // Never clobber unsaved edits: the 8s job poll refreshes jobs/health
      // only. Replacing config here reverted in-flight toggles every poll —
      // the exact "the save bar/save doesn't work" behavior.
      if (!dirtyRef.current) {
        setConfig(json.data.config);
      }
      setError('');
    } catch {
      setError('Network error — check your connection.');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { load(); }, [load]);

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
      const res = await fetch(`${API_BASE}/api/v1/embed/site/config`, {
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

  /**
   * One-click "Save & Deploy now": persists the pending config AND flips
   * deployment to live in the same signed PUT (the deploy command rides
   * the same channel, so the plugin purges + goes live immediately).
   */
  const saveAndDeploy = async () => {
    if (!config) return;
    const ok = window.confirm(
      'Save these changes and deploy the optimized website to ALL visitors now?\n\n' +
      'Make sure you have tested the optimized site with "Preview" — pages, styling, menus, forms and checkout — before deploying.'
    );
    if (!ok) return;
    const next = setPath(setPath(config, 'deployment.status', 'live'), 'deployment.source', 'dashboard');
    setConfig(next);
    setSaving(true);
    try {
      const res = await fetch(`${API_BASE}/api/v1/embed/site/config`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'X-Embed-Token': token },
        body: JSON.stringify(next),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        showToast(json.error || 'Deploy failed');
      } else {
        setDirty(false);
        showToast('Saved & deployed — visitors now get the optimized site');
      }
    } catch {
      showToast('Network error while deploying');
    } finally {
      setSaving(false);
    }
  };

  const purge = async () => {
    setBusy('purge');
    try {
      const res = await fetch(`${API_BASE}/api/v1/embed/site/purge`, {
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
      const res = await fetch(`${API_BASE}/api/v1/embed/site/dispatch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Embed-Token': token },
        body: JSON.stringify({ url }),
      });
      const json = await res.json();
      if (json.success) {
        showToast(`Optimization started (${json.data.jobs.length} jobs)`);
        setTimeout(load, 1500);
      } else {
        if (json.code === 'CREDITS_EXHAUSTED') {
          showToast('Optimization credits exhausted. Enable overage in your dashboard or upgrade your plan.');
        } else if (json.code === 'CONCURRENCY_LIMIT') {
          showToast('Concurrency limit reached. Other jobs are currently running.');
        } else if (json.code === 'SUBSCRIPTION_REQUIRED') {
          showToast('Active WP Instant subscription required to dispatch optimization.');
        } else {
          showToast(json.error || 'Dispatch failed');
        }
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
      const res = await fetch(`${API_BASE}/api/v1/embed/site/config`, {
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
          <p className="text-[11px] text-[#a1a1aa]">Go back to WP-admin and reload the WP Instant page to mint a fresh token.</p>
        </div>
      </div>
    );
  }

  const deploymentStatus: string = getPath(config, 'deployment.status') || 'live';
  const isTest = deploymentStatus === 'test';
  const previewUrl = `https://${data.site.domain}/?wpins_preview=1`;
  const offloadLog = data.offloadLog || [];

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
        {/* Preset templates + every settings card (shared with the full dashboard) */}
        <SettingsPanel
          config={config}
          upsert={upsert}
          applyPreset={applyPreset}
          siteContext={(data.health?.site_context as SiteContext) || {}}
        />

        {/* Pages & logs */}
        <div className="bg-white border border-[#e4e4e7] rounded-2xl shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3 border-b border-[#e4e4e7]">
            <div className="flex items-center gap-1">
              {([
                ['pages', 'Optimized Pages', <Eye key="e" className="w-3.5 h-3.5" />],
                ['jobs', 'Job Log', <FileText key="j" className="w-3.5 h-3.5" />],
                ['offload', 'CDN Offload Log', <HardDriveDownload key="o" className="w-3.5 h-3.5" />],
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
                  No CDN offload activity yet — enable “Offload images/videos to the CDN” and save.
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
          WP Instant embed · changes apply to your site instantly via the signed command channel ·{' '}
          <a href="/" target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 hover:text-[#71717a]">
            open full dashboard <ExternalLink className="w-3 h-3" />
          </a>
        </div>
      </main>

      {/* Save bar */}
      {dirty && (
        <div className="fixed bottom-0 inset-x-0 z-30 border-t border-[#e4e4e7] bg-white/95 backdrop-blur shadow-[0_-6px_24px_rgba(0,0,0,0.10)] animate-fade-in">
          <div className="max-w-5xl mx-auto px-5 py-3 flex items-center justify-between gap-3">
            <span className="text-xs font-medium text-[#b54708] flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-[#f03e2f] animate-pulse shrink-0" />
              Unsaved changes — saving pushes them to your site instantly.
            </span>
            <div className="flex items-center gap-2">
              <button onClick={() => { setConfig(data.config); setDirty(false); }} className="px-3 py-2 rounded-lg border border-[#e4e4e7] text-xs font-semibold hover:bg-[#fafafa]">
                Discard
              </button>
              <button
                onClick={save}
                disabled={saving}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg border border-[#f03e2f] text-[#f03e2f] hover:bg-[#fff8f7] text-xs font-semibold disabled:opacity-50"
              >
                {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                Save & Apply
              </button>
              {isTest && (
                <button
                  onClick={saveAndDeploy}
                  disabled={saving}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#027a48] hover:bg-[#026939] text-white text-xs font-semibold disabled:opacity-50"
                  title="Save these changes and deploy the optimized site to all visitors"
                >
                  {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ShieldCheck className="w-3.5 h-3.5" />}
                  Save & Deploy now
                </button>
              )}
              {!isTest && (
                <button
                  onClick={save}
                  disabled={saving}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#f03e2f] hover:bg-[#d93628] text-white text-xs font-semibold disabled:opacity-50"
                  title="Site is live — saved changes apply to visitors immediately"
                >
                  {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ShieldCheck className="w-3.5 h-3.5" />}
                  Save (live)
                </button>
              )}
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
