'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import {
  Activity,
  ArrowRight,
  BarChart3,
  Bell,
  ChevronDown,
  Database,
  Flame,
  Gauge,
  Globe,
  Image as ImageIcon,
  LifeBuoy,
  Menu,
  SlidersHorizontal,
  X,
  Zap,
} from 'lucide-react';
import { Logo } from './Logo';
import { marketingNav } from '@/lib/marketing';

type MegaItem = { icon: typeof Globe; title: string; desc: string; href: string };
type MegaGroup = { heading: string; items: MegaItem[] };

const megaGroups: MegaGroup[] = [
  {
    heading: 'Cache',
    items: [
      { icon: Database, title: 'Smart Page Cache', desc: 'Drop-in full-page cache with instant purge', href: '/features' },
      { icon: Flame, title: 'Cache Warmup', desc: 'Pages prebuilt before visitors arrive', href: '/features' },
      { icon: Globe, title: 'Edge CDN', desc: 'Global PoPs with surgical invalidation', href: '/features' },
    ],
  },
  {
    heading: 'Optimize',
    items: [
      { icon: Gauge, title: 'Critical CSS', desc: 'Real-browser extraction, inlined per page', href: '/features' },
      { icon: SlidersHorizontal, title: 'Script Controls', desc: 'Defer and interaction-delay with order safety', href: '/features' },
      { icon: ImageIcon, title: 'Media Pipeline', desc: 'AVIF/WebP, sized exactly per device', href: '/features' },
    ],
  },
  {
    heading: 'Monitor',
    items: [
      { icon: Activity, title: 'Real-user Vitals', desc: 'LCP, INP & CLS from actual visits', href: '/features' },
      { icon: Bell, title: 'Regression Alerts', desc: 'Know the moment a release slows you down', href: '/status' },
      { icon: BarChart3, title: 'Fleet Analytics', desc: 'Hit rates and savings over time', href: '/features' },
    ],
  },
  {
    heading: 'Support',
    items: [
      { icon: LifeBuoy, title: 'Engineers who answer', desc: 'Real WordPress performance help', href: '/support' },
      { icon: Zap, title: 'One-click Pairing', desc: 'Signed handshake, no DNS migration', href: '/docs' },
      { icon: BarChart3, title: 'API & Status', desc: 'Programmatic control and live uptime', href: '/docs/api' },
    ],
  },
];

export function MarketingHeader() {
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [megaOpen, setMegaOpen] = useState(false);
  const [mobileFeaturesOpen, setMobileFeaturesOpen] = useState(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    if (!menuOpen && !megaOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setMenuOpen(false);
        setMegaOpen(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [menuOpen, megaOpen]);

  useEffect(() => {
    const targets = Array.from(document.querySelectorAll<HTMLElement>('.reveal'));
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('in');
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.08, rootMargin: '0px 0px -8% 0px' },
    );

    targets.forEach((target) => observer.observe(target));
    return () => observer.disconnect();
  }, []);

  const openMega = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    setMegaOpen(true);
  };

  const scheduleCloseMega = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = setTimeout(() => setMegaOpen(false), 140);
  };

  return (
    <header
      className={`sticky top-0 z-50 border-b bg-white transition-all duration-300 ${
        scrolled
          ? 'border-[#e4e4e7] shadow-[0_1px_8px_rgba(23,23,23,0.06)]'
          : 'border-[#e4e4e7]'
      }`}
    >
      <div className="relative mx-auto flex h-16 max-w-7xl items-center justify-between gap-6 px-6">
        <div className="flex items-center gap-5">
          <Logo className="group" />
          <nav aria-label="Main" className="hidden items-center gap-1 lg:flex">
            <div className="relative" onMouseEnter={openMega} onMouseLeave={scheduleCloseMega}>
              <button
                type="button"
                aria-expanded={megaOpen}
                aria-haspopup="true"
                onClick={() => setMegaOpen((open) => !open)}
                className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors hover:bg-[#efefee] hover:text-[#171717] ${
                  megaOpen ? 'bg-[#efefee] text-[#171717]' : 'text-[#3f3f46]'
                }`}
              >
                Features
                <ChevronDown
                  className={`h-3.5 w-3.5 transition-transform duration-200 ${megaOpen ? 'rotate-180' : ''}`}
                  aria-hidden="true"
                />
              </button>

              <div
                className={`fixed left-1/2 top-[4.25rem] z-50 w-[56rem] max-w-[calc(100vw-2rem)] -translate-x-1/2 pt-3 transition-all duration-200 ${
                  megaOpen
                    ? 'visible translate-y-0 opacity-100'
                    : 'invisible translate-y-2 opacity-0 pointer-events-none'
                }`}
              >
                <div className="overflow-hidden rounded-2xl border border-[#e4e4e7] bg-white shadow-[0_16px_48px_rgba(23,23,23,0.10)]">
                  <div className="grid grid-cols-4 gap-x-2 p-4">
                    {megaGroups.map((group) => (
                      <div key={group.heading} className="rounded-xl p-2">
                        <p className="px-2 pb-1 font-mono text-[11px] font-semibold uppercase tracking-[0.1em] text-[#a1a1aa]">
                          {group.heading}
                        </p>
                        {group.items.map((item) => (
                          <Link
                            key={item.title}
                            href={item.href}
                            onClick={() => setMegaOpen(false)}
                            className="group/item flex items-start gap-3 rounded-xl px-2 py-2.5 transition-colors hover:bg-[#f8f8f7]"
                          >
                            <span className="grid h-9 w-9 flex-none place-items-center rounded-lg border border-[#e4e4e7] bg-white text-[#52525b] transition-colors group-hover/item:border-[#f03e2f] group-hover/item:text-[#f03e2f]">
                              <item.icon className="h-4 w-4" aria-hidden="true" />
                            </span>
                            <span>
                              <span className="block text-sm font-semibold text-[#171717]">{item.title}</span>
                              <span className="block text-xs leading-relaxed text-[#71717a]">{item.desc}</span>
                            </span>
                          </Link>
                        ))}
                      </div>
                    ))}
                  </div>
                  <div className="flex items-center justify-between border-t border-[#f1f1f2] bg-[#fbfbfa] px-6 py-3">
                    <p className="text-xs text-[#71717a]">Caching, optimization, vitals and support in one pipeline.</p>
                    <Link
                      href="/features"
                      onClick={() => setMegaOpen(false)}
                      className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#f03e2f] hover:text-[#dc2e20]"
                    >
                      See the full platform
                      <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                    </Link>
                  </div>
                </div>
              </div>
            </div>

            {marketingNav
              .filter((item) => item.label !== 'Features')
              .map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="rounded-lg px-3 py-2 text-sm font-medium text-[#3f3f46] transition-colors hover:bg-[#efefee] hover:text-[#171717]"
                >
                  {item.label}
                </Link>
              ))}
          </nav>
        </div>

        <div className="hidden items-center gap-3 md:flex">
          <Link href="/sign-in" className="px-3 py-2 text-sm font-medium text-[#52525b] transition-colors hover:text-[#171717]">
            Sign in
          </Link>
          <Link
            href="/sign-up"
            className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-[#f03e2f] px-5 text-sm font-semibold text-white shadow-sm transition-all hover:-translate-y-px hover:bg-[#dc2e20] hover:shadow-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#f03e2f]"
          >
            Get started
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        </div>

        <button
          type="button"
          className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-[#e4e4e7] bg-white text-[#171717] md:hidden"
          onClick={() => setMenuOpen((open) => !open)}
          aria-expanded={menuOpen}
          aria-controls="mobile-navigation"
          aria-label={menuOpen ? 'Close navigation' : 'Open navigation'}
        >
          {menuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      {menuOpen && (
        <div id="mobile-navigation" className="border-t border-[#e4e4e7] bg-white px-6 py-6 md:hidden">
          <nav aria-label="Mobile" className="grid gap-1">
            <button
              type="button"
              onClick={() => setMobileFeaturesOpen((open) => !open)}
              aria-expanded={mobileFeaturesOpen}
              className="flex items-center justify-between rounded-lg px-3 py-3 text-base font-medium text-[#3f3f46] transition-colors hover:bg-[#f4f4f5]"
            >
              Features
              <ChevronDown
                className={`h-4 w-4 transition-transform duration-200 ${mobileFeaturesOpen ? 'rotate-180' : ''}`}
                aria-hidden="true"
              />
            </button>
            <div
              className={`grid transition-all duration-300 ${mobileFeaturesOpen ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'}`}
            >
              <div className="overflow-hidden">
                <div className="space-y-4 py-2 pl-1">
                  {megaGroups.map((group) => (
                    <div key={group.heading}>
                      <p className="px-2 pb-1 font-mono text-[11px] font-semibold uppercase tracking-[0.1em] text-[#a1a1aa]">
                        {group.heading}
                      </p>
                      {group.items.map((item) => (
                        <Link
                          key={item.title}
                          href={item.href}
                          onClick={() => setMenuOpen(false)}
                          className="flex items-center gap-3 rounded-lg px-2 py-2.5 transition-colors hover:bg-[#f4f4f5]"
                        >
                          <span className="grid h-8 w-8 flex-none place-items-center rounded-lg border border-[#e4e4e7] text-[#52525b]">
                            <item.icon className="h-4 w-4" aria-hidden="true" />
                          </span>
                          <span>
                            <span className="block text-sm font-semibold text-[#171717]">{item.title}</span>
                            <span className="block text-xs text-[#71717a]">{item.desc}</span>
                          </span>
                        </Link>
                      ))}
                    </div>
                  ))}
                </div>
              </div>
            </div>
            {marketingNav
              .filter((item) => item.label !== 'Features')
              .map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="rounded-lg px-3 py-3 text-base font-medium text-[#3f3f46] transition-colors hover:bg-[#f4f4f5] hover:text-[#171717]"
                  onClick={() => setMenuOpen(false)}
                >
                  {item.label}
                </Link>
              ))}
          </nav>
          <div className="mt-5 flex flex-col gap-3 border-t border-[#f1f1f2] pt-5">
            <Link href="/sign-in" className="btn btn-secondary min-h-11" onClick={() => setMenuOpen(false)}>
              Sign in
            </Link>
            <Link href="/sign-up" className="btn btn-primary min-h-11" onClick={() => setMenuOpen(false)}>
              Create account
            </Link>
          </div>
        </div>
      )}
    </header>
  );
}
