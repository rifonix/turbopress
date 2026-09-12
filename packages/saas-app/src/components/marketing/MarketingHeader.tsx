'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Menu, X, ArrowRight } from 'lucide-react';
import { Logo } from './Logo';
import { marketingNav } from '@/lib/marketing';

export function MarketingHeader() {
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    if (!menuOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenuOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [menuOpen]);

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

  return (
    <header
      className={`sticky top-0 z-50 border-b transition-all duration-300 ${
        scrolled
          ? 'border-[#e4e4e7] bg-white/92 shadow-[0_1px_8px_rgba(23,23,23,0.04)] backdrop-blur-md'
          : 'border-transparent bg-[#f8f8f7]/86 backdrop-blur-md'
      }`}
    >
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-6 px-6">
        <div className="flex items-center gap-5">
          <Logo className="group" />
          <nav aria-label="Main" className="hidden items-center gap-1 lg:flex">
            {marketingNav.map((item) => (
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
            className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-[#f03e2f] px-5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[#dc2e20] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#f03e2f]"
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
            {marketingNav.map((item) => (
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
