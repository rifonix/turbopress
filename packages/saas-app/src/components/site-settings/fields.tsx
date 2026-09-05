'use client';

import React from 'react';
import { Layers, ChevronDown } from 'lucide-react';

/* ------------------------------------------------------------------ */
/* Shared site-settings UI primitives                                  */
/*                                                                     */
/* Used by BOTH the embedded control panel (wp-admin iframe, plugin     */
/* versions ≤1.13) and the full dashboard site detail page — one source */
/* of truth for every optimization control.                            */
/* ------------------------------------------------------------------ */

export interface SiteContext {
  post_types?: Array<{ name: string; label: string }>;
  plugins?: Record<string, string>;
}

export function getPath(obj: any, path: string): any {
  return path.split('.').reduce((acc, k) => (acc == null ? acc : acc[k]), obj);
}

export function setPath(obj: any, path: string, value: any): any {
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

export function Toggle({
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

/**
 * One-exclusion-per-line textarea bound to a string[] config path.
 * When the site's plugin catalog is available, a picker lets the user
 * exclude every asset of an installed plugin in one click (appends the
 * `/plugins/{slug}/` substring token); free-form lines cover custom
 * keywords, URL fragments and paths.
 */
export function ListField({
  value, onChange, label, hint, placeholder, plugins,
}: {
  value: string[];
  onChange: (v: string[]) => void;
  label: string;
  hint?: string;
  placeholder?: string;
  plugins?: Record<string, string>;
}) {
  const entries = value || [];
  const pluginToken = (slug: string) => `/plugins/${slug}/`;
  const addedSlugs = new Set(
    entries
      .map((e) => /^\/plugins\/([^/]+)\/?$/.exec(e.trim())?.[1])
      .filter(Boolean) as string[]
  );
  const availablePlugins = Object.entries(plugins || {})
    .filter(([slug]) => !addedSlugs.has(slug))
    .sort((a, b) => a[1].localeCompare(b[1]));

  const addPlugin = (slug: string) => {
    if (!slug || addedSlugs.has(slug)) return;
    onChange([...entries, pluginToken(slug)]);
  };

  return (
    <div className="py-2.5">
      <span className="block text-[13px] font-medium text-[#18181b]">{label}</span>
      {hint && <span className="block text-[11px] text-[#71717a] mt-0.5 leading-snug">{hint}</span>}

      {availablePlugins.length > 0 && (
        <select
          value=""
          onChange={(e) => addPlugin(e.target.value)}
          className="mt-1.5 w-full rounded-lg border border-[#e4e4e7] bg-white px-2.5 py-1.5 text-[11px] text-[#3f3f46] focus:outline-none focus:border-[#f03e2f]"
        >
          <option value="">+ Exclude all assets of an installed plugin…</option>
          {availablePlugins.map(([slug, name]) => (
            <option key={slug} value={slug}>{name} ({slug})</option>
          ))}
        </select>
      )}

      {addedSlugs.size > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-1.5">
          {[...addedSlugs].map((slug) => (
            <span
              key={slug}
              className="inline-flex items-center gap-1 pl-2 pr-1 py-0.5 rounded-full bg-[#fff8f7] border border-[#fecaca] text-[10px] font-semibold text-[#b42318]"
            >
              {(plugins || {})[slug] || slug}
              <button
                type="button"
                onClick={() => onChange(entries.filter((e) => e.trim() !== pluginToken(slug)))}
                className="w-4 h-4 grid place-items-center rounded-full hover:bg-[#fecaca] text-[#71717a]"
                title="Remove"
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}

      <textarea
        rows={3}
        spellCheck={false}
        placeholder={placeholder}
        value={entries.join('\n')}
        onChange={(e) => onChange(e.target.value.split('\n').map((s) => s.trim()).filter(Boolean))}
        className="mt-1.5 w-full rounded-lg border border-[#e4e4e7] px-2.5 py-2 text-[11px] font-mono text-[#3f3f46] focus:outline-none focus:border-[#f03e2f] resize-y"
      />
      <span className="block text-[10px] text-[#a1a1aa] mt-1">
        Entries match by substring — file name, URL fragment or path segment.
      </span>
    </div>
  );
}

export function Card({ title, icon, children }: { title: string; icon?: React.ReactNode; children: React.ReactNode }) {
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

export function StatusBadge({ status }: { status: string }) {
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
export function PluginControlCard({
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
                        <span className="block text-[12px] text-[#18181b] truncate">
                          {name}
                          {slug.startsWith('theme:') && (
                            <span className="ml-1.5 px-1 py-px rounded bg-[#eff8ff] text-[#175cd3] text-[9px] font-bold align-middle">THEME</span>
                          )}
                        </span>
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
