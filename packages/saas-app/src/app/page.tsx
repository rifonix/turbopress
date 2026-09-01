import React from 'react';
import Link from 'next/link';
import {
  Zap, Gauge, Image as ImageIcon, Layers, ShieldCheck, ShoppingCart,
  ArrowRight, Check, Plug, Cloud, Timer,
} from 'lucide-react';

export const metadata = {
  title: 'WP Instant — Edge performance for WordPress',
  description:
    'Automatic critical CSS, image transcoding, and full-page caching on Cloudflare\'s edge. Install the plugin, connect, and your WordPress site loads instantly.',
};

const features = [
  {
    icon: Gauge,
    title: 'Critical CSS, extracted per page',
    body: 'A headless browser renders every template on mobile and desktop, extracts the exact above-the-fold CSS, and inlines it — render-blocking stylesheets become background refills.',
  },
  {
    icon: ImageIcon,
    title: 'Media CDN with on-the-fly transforms',
    body: 'Images are served from cdn.wpinstant.dev as WebP/AVIF at the right size for each viewport. Originals are fetched once, derivatives are cached at the edge.',
  },
  {
    icon: Layers,
    title: 'Full-page edge caching',
    body: 'Complete HTML pages cached on Cloudflare with Brotli/Gzip twins, cache-key normalization across 11 tracking parameters, and instant purge the moment content changes.',
  },
  {
    icon: Timer,
    title: 'Script delay & facades',
    body: 'Third-party scripts, embeds, and videos are deferred behind a 1-byte stub and hydrated on interaction — your LCP element loads without competition.',
  },
  {
    icon: ShoppingCart,
    title: 'WooCommerce-aware',
    body: 'Cart, checkout, and session cookies bypass the cache automatically. Nonces are refreshed client-side so carts stay alive on cached pages.',
  },
  {
    icon: ShieldCheck,
    title: 'Signed, tenant-isolated delivery',
    body: 'Every site pairs with HMAC-signed API keys. Assets are verified per-request; no shared buckets, no cross-tenant access.',
  },
];

const steps = [
  {
    icon: Plug,
    title: 'Install the plugin',
    body: 'Upload wp-instant.zip from the dashboard to any WordPress site. No server config, no .htaccess wrangling.',
  },
  {
    icon: Cloud,
    title: 'Pair with one click',
    body: 'The handshake issues a single-use key over a verified redirect. Your site appears in the dashboard with live health metrics.',
  },
  {
    icon: Zap,
    title: 'Edge does the rest',
    body: 'Optimization jobs run on Cloudflare Workers + Browser Rendering. Audits, critical CSS, and media derivatives land automatically.',
  },
];

const plans = [
  { name: 'Starter', monthly: 19, annual: 15, sites: '1 site', runs: '200 optimizations / mo', cta: true },
  { name: 'Pro', monthly: 49, annual: 39, sites: '5 sites', runs: '1,000 optimizations / mo', featured: true },
  { name: 'Agency', monthly: 79, annual: 63, sites: '10 sites', runs: '2,000 optimizations / mo' },
  { name: 'Enterprise', monthly: 299, annual: null, sites: '100 sites', runs: '10,000 optimizations / mo' },
];

const CheckItem = ({ children }: { children: React.ReactNode }) => (
  <li className="flex items-start gap-2.5 text-sm text-[#3f3f46]">
    <Check className="w-4 h-4 mt-0.5 shrink-0 text-[#f03e2f]" strokeWidth={3} />
    <span>{children}</span>
  </li>
);

export default function HomePage() {
  return (
    <div className="min-h-screen bg-white text-[#18181b] antialiased">
      {/* Nav */}
      <header className="sticky top-0 z-50 border-b border-[#e4e4e7] bg-white/85 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
          <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight">
            <span className="flex h-7 w-7 items-center justify-center rounded-md bg-[#18181b] text-white">
              <Zap className="h-4 w-4" fill="currentColor" strokeWidth={0} />
            </span>
            WP&nbsp;Instant
          </Link>
          <nav className="hidden items-center gap-7 text-sm text-[#52525b] md:flex">
            <a href="#features" className="hover:text-[#18181b]">Features</a>
            <a href="#how" className="hover:text-[#18181b]">How it works</a>
            <a href="#pricing" className="hover:text-[#18181b]">Pricing</a>
          </nav>
          <div className="flex items-center gap-3 text-sm">
            <Link href="/sign-in" className="text-[#52525b] hover:text-[#18181b]">Sign in</Link>
            <Link
              href="/sign-up"
              className="rounded-md bg-[#18181b] px-4 py-2 font-medium text-white transition hover:bg-black"
            >
              Get started
            </Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden border-b border-[#e4e4e7]">
        <div
          className="pointer-events-none absolute inset-0 -z-10"
          style={{
            background:
              'radial-gradient(80rem 30rem at 50% -10rem, rgba(240,62,47,0.08), transparent 60%)',
          }}
        />
        <div className="mx-auto max-w-6xl px-6 pb-24 pt-24 text-center md:pb-32 md:pt-32">
          <div className="mx-auto mb-6 inline-flex items-center gap-2 rounded-full border border-[#e4e4e7] bg-white px-3.5 py-1.5 text-xs font-medium text-[#52525b]">
            <span className="h-1.5 w-1.5 rounded-full bg-[#f03e2f]" />
            Runs on Cloudflare&apos;s global edge network
          </div>
          <h1 className="mx-auto max-w-3xl text-5xl font-semibold leading-[1.05] tracking-tight md:text-7xl">
            WordPress,<br />
            <span className="text-[#f03e2f]">instantly</span> fast.
          </h1>
          <p className="mx-auto mt-6 max-w-xl text-lg leading-relaxed text-[#52525b]">
            Automatic critical CSS, image transcoding, script delay, and full-page
            caching — applied by the edge, measured in Core Web Vitals.
          </p>
          <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link
              href="/sign-up"
              className="group inline-flex items-center gap-2 rounded-md bg-[#18181b] px-6 py-3.5 font-medium text-white transition hover:bg-black"
            >
              Start free
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </Link>
            <a
              href="#how"
              className="inline-flex items-center gap-2 rounded-md border border-[#d4d4d8] px-6 py-3.5 font-medium text-[#18181b] transition hover:border-[#a1a1aa]"
            >
              See how it works
            </a>
          </div>
          <p className="mt-5 text-xs text-[#a1a1aa]">
            No credit card to connect your first site · Works on any host
          </p>
        </div>
      </section>

      {/* Stats strip */}
      <section className="border-b border-[#e4e4e7] bg-[#fafafa]">
        <div className="mx-auto grid max-w-6xl grid-cols-2 divide-x divide-[#e4e4e7] px-6 md:grid-cols-4">
          {[
            ['330+', 'edge locations'],
            ['2 viewports', 'audited per page'],
            ['WebP / AVIF', 'automatic media'],
            ['0 ms', 'origin work on cache hit'],
          ].map(([big, small]) => (
            <div key={small} className="py-10 text-center">
              <div className="text-xl font-semibold tracking-tight md:text-2xl">{big}</div>
              <div className="mt-1 text-xs uppercase tracking-widest text-[#a1a1aa]">{small}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Features */}
      <section id="features" className="mx-auto max-w-6xl px-6 py-24">
        <div className="max-w-2xl">
          <h2 className="text-3xl font-semibold tracking-tight md:text-4xl">
            The whole performance stack, automated
          </h2>
          <p className="mt-4 text-[#52525b]">
            WP Instant pairs a WordPress plugin that transforms every rendered page
            with an edge engine that learns, extracts, and serves the optimal
            payload for each URL.
          </p>
        </div>
        <div className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((f) => (
            <div
              key={f.title}
              className="rounded-xl border border-[#e4e4e7] bg-white p-6 transition hover:border-[#a1a1aa]"
            >
              <f.icon className="h-5 w-5 text-[#f03e2f]" strokeWidth={2.25} />
              <h3 className="mt-4 font-medium">{f.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-[#52525b]">{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section id="how" className="border-y border-[#e4e4e7] bg-[#fafafa]">
        <div className="mx-auto max-w-6xl px-6 py-24">
          <h2 className="text-3xl font-semibold tracking-tight md:text-4xl">
            Live in three steps
          </h2>
          <div className="mt-14 grid gap-5 md:grid-cols-3">
            {steps.map((s, i) => (
              <div key={s.title} className="rounded-xl border border-[#e4e4e7] bg-white p-7">
                <div className="flex items-center justify-between">
                  <s.icon className="h-5 w-5 text-[#f03e2f]" strokeWidth={2.25} />
                  <span className="text-4xl font-semibold text-[#e4e4e7]">{i + 1}</span>
                </div>
                <h3 className="mt-4 font-medium">{s.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-[#52525b]">{s.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="mx-auto max-w-6xl px-6 py-24">
        <div className="max-w-2xl">
          <h2 className="text-3xl font-semibold tracking-tight md:text-4xl">Pricing</h2>
          <p className="mt-4 text-[#52525b]">
            Per-site plans billed through Polar. Monthly or annual — annual saves
            roughly two months.
          </p>
        </div>
        <div className="mt-14 grid gap-5 md:grid-cols-2 lg:grid-cols-4">
          {plans.map((p) => (
            <div
              key={p.name}
              className={`flex flex-col rounded-xl border p-7 ${
                p.featured
                  ? 'border-[#18181b] shadow-[0_1px_2px_rgba(0,0,0,0.04),0_8px_24px_rgba(0,0,0,0.06)]'
                  : 'border-[#e4e4e7]'
              }`}
            >
              {p.featured && (
                <span className="mb-4 w-fit rounded-full bg-[#18181b] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-widest text-white">
                  Most popular
                </span>
              )}
              <h3 className="font-medium">{p.name}</h3>
              <div className="mt-3 flex items-baseline gap-1.5">
                <span className="text-4xl font-semibold tracking-tight">
                  ${p.monthly}
                </span>
                <span className="text-sm text-[#a1a1aa]">/mo</span>
              </div>
              {p.annual !== null && (
                <p className="mt-1 text-xs text-[#a1a1aa]">or ${p.annual}/mo billed annually</p>
              )}
              <ul className="mt-6 flex-1 space-y-2.5">
                <CheckItem>{p.sites}</CheckItem>
                <CheckItem>{p.runs}</CheckItem>
                <CheckItem>All optimization features</CheckItem>
                <CheckItem>Edge cache + media CDN</CheckItem>
              </ul>
              <Link
                href="/sign-up"
                className={`mt-7 inline-flex items-center justify-center rounded-md px-4 py-2.5 text-sm font-medium transition ${
                  p.featured
                    ? 'bg-[#18181b] text-white hover:bg-black'
                    : 'border border-[#d4d4d8] text-[#18181b] hover:border-[#a1a1aa]'
                }`}
              >
                {p.name === 'Enterprise' ? 'Contact us' : `Get ${p.name}`}
              </Link>
            </div>
          ))}
        </div>
      </section>

      {/* CTA band */}
      <section className="border-t border-[#e4e4e7] bg-[#18181b] text-white">
        <div className="mx-auto flex max-w-6xl flex-col items-center gap-6 px-6 py-20 text-center">
          <h2 className="max-w-2xl text-3xl font-semibold tracking-tight md:text-4xl">
            Your next visitor could get a fully cached, fully optimized page.
          </h2>
          <Link
            href="/sign-up"
            className="inline-flex items-center gap-2 rounded-md bg-white px-6 py-3.5 font-medium text-[#18181b] transition hover:bg-[#f4f4f5]"
          >
            Create your account
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-[#e4e4e7] bg-white">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-6 py-10 text-sm text-[#71717a] md:flex-row">
          <div className="flex items-center gap-2">
            <span className="flex h-5 w-5 items-center justify-center rounded bg-[#18181b]">
              <Zap className="h-3 w-3 text-white" fill="currentColor" strokeWidth={0} />
            </span>
            © {new Date().getFullYear()} WP Instant
          </div>
          <div className="flex items-center gap-6">
            <a href="#features" className="hover:text-[#18181b]">Features</a>
            <a href="#pricing" className="hover:text-[#18181b]">Pricing</a>
            <Link href="/sign-in" className="hover:text-[#18181b]">Sign in</Link>
            <Link href="/dashboard" className="hover:text-[#18181b]">Dashboard</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
