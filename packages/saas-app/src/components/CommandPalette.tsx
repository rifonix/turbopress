import React, { useState, useEffect, useRef } from 'react';
import { Search, ArrowRight } from 'lucide-react';
import { AppView, ExtendedSite } from '../types';

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  sites: ExtendedSite[];
  onNavigate: (view: AppView) => void;
  onSelectSite: (site: ExtendedSite) => void;
  onTriggerPurgeAll: () => void;
  onDispatchJob: (domain: string) => void;
}

interface CommandItem {
  id: string;
  group: 'Actions' | 'Sites' | 'Navigation';
  label: string;
  hint?: string;
  action: () => void;
}

export const CommandPalette: React.FC<CommandPaletteProps> = ({
  isOpen,
  onClose,
  sites,
  onNavigate,
  onSelectSite,
  onTriggerPurgeAll,
  onDispatchJob,
}) => {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  // Build command list dynamically
  const commands: CommandItem[] = [
    {
      id: 'act-purge-all',
      group: 'Actions',
      label: 'Purge edge cache — all sites',
      hint: 'purge',
      action: () => {
        onTriggerPurgeAll();
      },
    },
    {
      id: 'act-connect-site',
      group: 'Actions',
      label: 'Connect a new WordPress site',
      hint: 'new',
      action: () => onNavigate('connect'),
    },
    {
      id: 'act-dispatch-job',
      group: 'Actions',
      label: 'Dispatch optimization run',
      hint: '⌘J',
      action: () => onNavigate('jobs'),
    },
    // Site-specific jump commands
    ...sites.map((site) => ({
      id: `site-${site.id}`,
      group: 'Sites' as const,
      label: site.domain,
      hint: `${site.score}/100`,
      action: () => onSelectSite(site),
    })),
    // View navigation
    {
      id: 'nav-overview',
      group: 'Navigation',
      label: 'Go to Overview dashboard',
      action: () => onNavigate('overview'),
    },
    {
      id: 'nav-sites',
      group: 'Navigation',
      label: 'Go to Sites manager',
      action: () => onNavigate('sites'),
    },
    {
      id: 'nav-jobs',
      group: 'Navigation',
      label: 'Go to Optimization Jobs',
      action: () => onNavigate('jobs'),
    },
    {
      id: 'nav-billing',
      group: 'Navigation',
      label: 'Go to Billing & Usage',
      action: () => onNavigate('billing'),
    },
    {
      id: 'nav-pricing',
      group: 'Navigation',
      label: 'Go to Plans & Pricing',
      action: () => onNavigate('pricing'),
    },
    {
      id: 'act-quick-job',
      group: 'Actions',
      label: 'Run optimization — first active site',
      action: () => {
        if (sites[0]) onDispatchJob(sites[0].domain);
      },
    },
  ];

  const filtered = commands.filter((c) =>
    c.label.toLowerCase().includes(query.toLowerCase()) ||
    (c.hint && c.hint.toLowerCase().includes(query.toLowerCase()))
  );

  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev + 1 < filtered.length ? prev + 1 : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev - 1 >= 0 ? prev - 1 : filtered.length - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (filtered[selectedIndex]) {
        filtered[selectedIndex].action();
        onClose();
      }
    } else if (e.key === 'Escape') {
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-start justify-center pt-[14vh] px-4 animate-fade-in"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-xl bg-white rounded-2xl border border-[#e4e4e7] shadow-2xl overflow-hidden"
      >
        {/* Search Input Row */}
        <div className="flex items-center gap-3 px-4 py-3.5 border-b border-[#e4e4e7]">
          <Search className="w-4 h-4 text-[#71717a] flex-none" />
          <input
            ref={inputRef}
            type="text"
            placeholder="Type a command or search sites…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            className="flex-1 bg-transparent border-0 outline-none text-[#171717] text-[14.5px] placeholder-[#a1a1aa] font-sans"
          />
          <kbd className="font-mono text-[10px] text-[#71717a] border border-[#e4e4e7] rounded px-1.5 py-0.5 bg-[#f8f8f7]">
            ESC
          </kbd>
        </div>

        {/* Command List */}
        <div className="max-h-80 overflow-y-auto p-2">
          {filtered.length === 0 ? (
            <p className="py-6 text-center text-xs text-[#71717a] font-mono">No matching results found</p>
          ) : (
            filtered.map((item, idx) => {
              const isSelected = idx === selectedIndex;
              return (
                <button
                  key={item.id}
                  onClick={() => {
                    item.action();
                    onClose();
                  }}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left text-[13.5px] transition-colors ${
                    isSelected ? 'bg-[#f4f4f5] text-[#171717]' : 'text-[#3f3f46] hover:bg-[#f8f8f7]'
                  }`}
                >
                  <ArrowRight className={`w-3.5 h-3.5 flex-none ${isSelected ? 'text-[#f03e2f]' : 'text-[#a1a1aa]'}`} />
                  <span className="font-medium flex-1 truncate">{item.label}</span>
                  {item.hint && (
                    <span className="font-mono text-[11px] text-[#71717a] ml-auto">{item.hint}</span>
                  )}
                </button>
              );
            })
          )}
        </div>

        {/* Footer shortcuts */}
        <div className="flex items-center gap-4 px-4 py-2.5 bg-[#fafafa] border-t border-[#e4e4e7] text-[11.5px] text-[#71717a]">
          <span className="flex items-center gap-1">
            <kbd className="font-mono bg-white border border-[#e4e4e7] px-1 rounded">↑↓</kbd> navigate
          </span>
          <span className="flex items-center gap-1">
            <kbd className="font-mono bg-white border border-[#e4e4e7] px-1 rounded">↵</kbd> select
          </span>
          <span className="flex items-center gap-1 ml-auto">
            <kbd className="font-mono bg-white border border-[#e4e4e7] px-1 rounded">esc</kbd> close
          </span>
        </div>
      </div>
    </div>
  );
};
