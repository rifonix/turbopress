import Link from 'next/link';
import { Logo } from './Logo';
import { footerNav, site } from '@/lib/marketing';

export function MarketingFooter() {
  return (
    <footer className="relative overflow-hidden bg-white">
      <div className="mx-auto max-w-7xl px-6">
        <div className="grid gap-10 py-16 md:grid-cols-2 lg:grid-cols-[1.3fr_repeat(3,1fr)]">
          <div>
            <Logo className="group" />
            <p className="mt-4 max-w-[20rem] text-sm leading-relaxed text-[#71717a]">
              A zero-DNS performance platform for WordPress: automatic caching, Critical CSS, LCP controls, modern media delivery, and real-user Core Web Vitals.
            </p>
            <p className="meta mt-5">{site.domain}</p>
          </div>

          {footerNav.map((section) => (
            <nav key={section.title} aria-label={section.title}>
              <h2 className="font-mono text-[11px] font-medium uppercase tracking-[0.12em] text-[#71717a]">
                {section.title}
              </h2>
              <ul className="mt-4">
                {section.links.map((link) => (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      className="inline-block py-1.5 text-sm text-[#3f3f46] transition-colors hover:text-[#f03e2f]"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-4 py-5">
          <p className="meta">© {new Date().getFullYear()} WP Instant. All rights reserved.</p>
          <p className="meta">Built for WordPress · Delivered from the edge</p>
        </div>
      </div>
      <div aria-hidden="true" className="pointer-events-none select-none text-center font-mono text-[min(22vw,220px)] font-semibold leading-none tracking-[-0.07em] text-[#f8f8f7]">
        WP Instant
      </div>
    </footer>
  );
}
