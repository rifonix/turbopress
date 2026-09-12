import type { Metadata } from 'next';
import Link from 'next/link';
import {
  Gauge,
  Image as ImageIcon,
  Layers,
  Timer,
  ShoppingCart,
  ShieldCheck,
  Radar,
  Plug,
  Cloud,
  Zap,
  ArrowRight,
  RefreshCw,
  CircleCheck,
} from 'lucide-react';
import { MarketingShell } from '@/components/marketing/MarketingShell';
import { SectionHeading } from '@/components/marketing/SectionHeading';
import { FeatureCard } from '@/components/marketing/FeatureCard';
import { HeroDashboard } from '@/components/marketing/HeroDashboard';
import { OptimizationPipeline } from '@/components/marketing/OptimizationPipeline';
import { PricingCards } from '@/components/marketing/PricingCards';
import { FaqAccordion } from '@/components/marketing/FaqAccordion';
import { JsonLd } from '@/components/marketing/StructuredData';
import { homepageFaqs, site } from '@/lib/marketing';

export const metadata: Metadata = {
  title: 'WP Instant — WordPress Speed Optimization & Core Web Vitals Platform',
  description:
    'WP Instant is a zero-DNS WordPress performance platform with full-page edge caching, automatic Critical CSS, WebP/AVIF delivery, script controls, WooCommerce-safe caching, and real-user Core Web Vitals monitoring.',
  keywords: [...site.keywords],
  alternates: { canonical: '/' },
  openGraph: {
    type: 'website',
    url: '/',
    siteName: site.name,
    title: 'WP Instant — WordPress Speed Optimization & Core Web Vitals Platform',
    description:
      'Automatic Critical CSS, full-page edge caching, WebP/AVIF delivery, script controls, and real-user Core Web Vitals for WordPress.',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'WP Instant — WordPress Speed Optimization & Core Web Vitals Platform',
    description:
      'A zero-DNS WordPress performance platform for faster pages, safer WooCommerce caching, and measurable Core Web Vitals.',
  },
};

const heroFacts = [
  { value: 'Sub-15ms', label: 'drop-in cache target' },
  { value: '2 viewports', label: 'audited per URL' },
  { value: 'WebP / AVIF', label: 'modern image delivery' },
  { value: '95+', label: 'targeted mobile score' },
];

const features = [
  {
    icon: Layers,
    index: '01',
    title: 'Full-page caching',
    description:
      'A WordPress drop-in cache serves complete pages locally, while an edge CDN handles pre-compressed delivery, cache-key normalization, and instant purge when content changes.',
  },
  {
    icon: Gauge,
    index: '02',
    title: 'Critical CSS & LCP control',
    description:
      'A real-browser engine extracts the CSS each page needs, inlines it, defers full stylesheets with a fallback, and can add priority preload for the LCP candidate.',
  },
  {
    icon: ImageIcon,
    index: '03',
    title: 'Modern media delivery',
    description:
      'Images are converted and served as WebP or AVIF at responsive sizes through an edge CDN. Originals are fetched once and derivatives are reused for later visitors.',
  },
  {
    icon: Timer,
    index: '04',
    title: 'Three-tier script delay',
    description:
      'Essential scripts load immediately, compatible scripts defer, and selected interactions can wait until the user scrolls, clicks, types, or until a safety timer runs.',
  },
  {
    icon: ShoppingCart,
    index: '05',
    title: 'WooCommerce-safe dynamic handling',
    description:
      'Cart, checkout, and account routes stay cache-sensitive. Dynamic nonce refresh and cart micro-hydration are designed to keep session behavior correct on cached pages.',
  },
  {
    icon: Radar,
    index: '06',
    title: 'Real-user health monitoring',
    description:
      'A lightweight beacon records Core Web Vitals and page health from actual visits, giving you per-site and per-URL history instead of relying on a single lab result.',
  },
];

const automationFeatures = [
  {
    icon: Plug,
    title: 'One-click pairing',
    body: 'Install the plugin, approve a signed handshake, and connect your WordPress site without changing DNS or migrating hosts.',
  },
  {
    icon: RefreshCw,
    title: 'Content-aware purges',
    body: 'Publishing or updating content triggers targeted cache invalidation so visitors see fresh pages without wiping all optimization artifacts.',
  },
  {
    icon: ShieldCheck,
    title: 'Tenant-isolated delivery',
    body: 'Each site pairs through signed keys. Assets are verified for the requesting tenant, so customer sites do not share delivery credentials.',
  },
];

const presets = [
  {
    name: 'Safe Mode',
    range: '80–88 expected mobile score',
    body: 'Drop-in caching, compression, and native prerendering foundations for sites that need conservative behavior.',
  },
  {
    name: 'Aggressive',
    range: '90–94 expected mobile score',
    body: 'Adds edge Critical CSS inlining and automatic LCP priority preload while retaining defer-only JavaScript handling.',
  },
  {
    name: 'Ludicrous',
    range: '96–100 expected mobile score',
    body: 'Adds three-tier interaction-delayed JavaScript plus dynamic nonce and cart hydration for advanced stores and sites.',
  },
];

export default function HomePage() {
  return (
    <MarketingShell>
      <JsonLd
        data={[
          {
            '@context': 'https://schema.org',
            '@type': 'SoftwareApplication',
            name: 'WP Instant',
            applicationCategory: 'BusinessApplication',
            operatingSystem: 'WordPress',
            url: site.url,
            description: site.description,
            offers: [
              { '@type': 'Offer', name: 'Starter', price: '19', priceCurrency: 'USD' },
              { '@type': 'Offer', name: 'Growth', price: '49', priceCurrency: 'USD' },
              { '@type': 'Offer', name: 'Agency', price: '129', priceCurrency: 'USD' },
            ],
            featureList: [
              'Full-page edge caching',
              'Critical CSS extraction',
              'WebP and AVIF image delivery',
              'Three-tier script delay',
              'WooCommerce-safe caching',
              'Real-user Core Web Vitals monitoring',
            ],
          },
          {
            '@context': 'https://schema.org',
            '@type': 'WebSite',
            name: site.name,
            url: site.url,
          },
          {
            '@context': 'https://schema.org',
            '@type': 'FAQPage',
            mainEntity: homepageFaqs.map((faq) => ({
              '@type': 'Question',
              name: faq.question,
              acceptedAnswer: { '@type': 'Answer', text: faq.answer },
            })),
          },
        ]}
      />

      {/* Hero */}
      <section className="relative overflow-hidden pt-16 md:pt-20" aria-labelledby="homepage-hero-title">
        <div
          className="pointer-events-none absolute inset-0 -z-10"
          style={{ background: 'radial-gradient(70rem 30rem at 50% -12rem, rgba(240,62,47,0.10), transparent 65%)' }}
        />
        <div className="mx-auto max-w-7xl px-6 text-center">
          <div className="reveal mx-auto inline-flex items-center gap-2 rounded-full border border-[#e4e4e7] bg-white px-4 py-2 text-sm text-[#3f3f46]">
            <span className="h-1.5 w-1.5 rounded-full bg-[#f03e2f]" aria-hidden="true" />
            Zero-DNS connection · works with your existing host
          </div>
          <h1
            id="homepage-hero-title"
            className="reveal mx-auto mt-7 max-w-4xl text-balance text-[clamp(2.5rem,6vw,4.5rem)] font-semibold leading-[1.04] tracking-[-0.04em]"
          >
            WordPress speed that <span className="text-[#f03e2f]">optimizes itself</span>
          </h1>
          <p className="reveal mx-auto mt-6 max-w-2xl text-pretty text-lg leading-relaxed text-[#71717a]">
            WP Instant caches pages, extracts Critical CSS, converts images, manages scripts, and monitors real-user
            Core Web Vitals automatically. Connect once and let the edge optimization engine do the repetitive work.
          </p>
          <div className="reveal mt-9 flex flex-wrap items-center justify-center gap-3">
            <Link href="/sign-up" className="btn btn-primary min-h-12 px-6 text-[15px]">
              Create account
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
            <a href="#features" className="btn btn-ghost min-h-12 border border-[#e4e4e7] bg-white px-6 text-[15px] hover:border-[#171717]">
              See how it works
            </a>
          </div>
        </div>

        <div className="reveal mx-auto mt-16 max-w-6xl px-6">
          <HeroDashboard />
        </div>

        <div className="mx-auto mt-16 max-w-7xl px-6">
          <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-[#e4e4e7] bg-[#e4e4e7] lg:grid-cols-4">
            {heroFacts.map((fact) => (
              <div key={fact.label} className="bg-white px-6 py-8 text-center">
                <dt className="order-2 mt-1 font-mono text-[11px] uppercase tracking-[0.12em] text-[#71717a]">{fact.label}</dt>
                <dd className="order-1 text-2xl font-semibold tracking-[-0.03em]">{fact.value}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="mx-auto max-w-7xl px-6 py-24 md:py-32" aria-labelledby="features-title">
        <div className="flex flex-col justify-between gap-8 lg:flex-row lg:items-end">
          <SectionHeading
            eyebrow="Performance engine"
            title="The complete stack, applied automatically"
            description="WP Instant works at the WordPress render layer and the edge delivery layer together, so optimization follows the page instead of living in a pile of disconnected settings."
          />
          <Link href="/features" className="btn btn-secondary w-fit">
            Explore features
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        </div>
        <div className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((feature) => (
            <FeatureCard key={feature.title} {...feature} />
          ))}
        </div>
      </section>

      {/* Pipeline */}
      <section className="mx-auto max-w-7xl px-6 pb-24 md:pb-32" aria-labelledby="pipeline-title">
        <SectionHeading
          align="center"
          eyebrow="How it works"
          title="Built for WordPress, tuned for Core Web Vitals"
          description="The optimization process is deterministic: audit the real page, generate the smallest useful payload, then deliver it as close to the visitor as possible."
        />
        <OptimizationPipeline />
      </section>

      {/* Automation + trust */}
      <section className="border-y border-[#e4e4e7] bg-white" aria-labelledby="automation-title">
        <div className="mx-auto max-w-7xl px-6 py-24 md:py-32">
          <SectionHeading
            eyebrow="Safe automation"
            title="Automatic where it helps. Accountable where it matters."
            description="Automation should not mean losing control. Pairing, cache invalidation, tenant isolation, and per-site telemetry are built into the platform contract."
          />
          <div className="mt-14 grid gap-5 lg:grid-cols-3">
            {automationFeatures.map((feature) => (
              <article key={feature.title} className="rounded-2xl border border-[#e4e4e7] bg-[#fbfbfa] p-7">
                <span className="grid h-11 w-11 place-items-center rounded-xl bg-white text-[#f03e2f] shadow-sm">
                  <feature.icon className="h-5 w-5" aria-hidden="true" />
                </span>
                <h3 className="mt-6 text-lg font-semibold tracking-[-0.02em]">{feature.title}</h3>
                <p className="mt-3 text-sm leading-relaxed text-[#71717a]">{feature.body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* Adoption */}
      <section className="mx-auto max-w-7xl px-6 py-24 md:py-32" aria-labelledby="adoption-title">
        <SectionHeading
          align="center"
          eyebrow="Getting started"
          title="From install to optimization in minutes"
          description="The WordPress client and edge engine are already connected by design. There is no DNS switch, separate CDN account, or separate build pipeline to manage."
        />
        <div className="mt-14 grid gap-5 md:grid-cols-3">
          {[
            {
              icon: Plug,
              step: 'Install plugin',
              body: 'Upload and activate the WP Instant plugin in WordPress admin.',
            },
            {
              icon: Cloud,
              step: 'Pair one click',
              body: 'Approve a cryptographic handshake. Keys sync to the site and it appears in your dashboard.',
            },
            {
              icon: Zap,
              step: 'Run the engine',
              body: 'Queue URL audits or crawls. Critical CSS, LCP rules, and media derivatives are generated automatically.',
            },
          ].map((step, index) => (
            <article key={step.step} className="relative overflow-hidden rounded-2xl border border-[#e4e4e7] bg-white p-7">
              <div className="flex items-center justify-between">
                <span className="grid h-11 w-11 place-items-center rounded-xl bg-[#fff1ef] text-[#f03e2f]">
                  <step.icon className="h-5 w-5" aria-hidden="true" />
                </span>
                <span className="num text-4xl font-semibold text-[#f1f1f2]">{index + 1}</span>
              </div>
              <h3 className="mt-6 text-lg font-semibold tracking-[-0.02em]">{step.step}</h3>
              <p className="mt-3 text-sm leading-relaxed text-[#71717a]">{step.body}</p>
            </article>
          ))}
        </div>
      </section>

      {/* Presets */}
      <section className="border-y border-[#e4e4e7] bg-[#fbfbfa]" aria-labelledby="presets-title">
        <div className="mx-auto max-w-7xl px-6 py-24 md:py-32">
          <SectionHeading
            eyebrow="Performance presets"
            title="Choose the risk level, not every switch"
            description="Each preset is a named contract. Start safely, then move up when your theme, plugins, and transaction flows are ready."
          />
          <div className="mt-14 grid gap-5 lg:grid-cols-3">
            {presets.map((preset) => (
              <article key={preset.name} className="flex min-h-[16rem] flex-col rounded-2xl border border-[#e4e4e7] bg-white p-7">
                <h3 className="text-xl font-semibold tracking-[-0.02em]">{preset.name}</h3>
                <p className="meta mt-2 text-[#dc2e20]">{preset.range}</p>
                <p className="mt-4 text-sm leading-relaxed text-[#71717a]">{preset.body}</p>
              </article>
            ))}
          </div>
          <p className="mx-auto mt-6 max-w-3xl text-center text-xs leading-relaxed text-[#a1a1aa]">
            Score ranges describe expected Lighthouse outcomes with the Ludicrous preset under suitable site conditions.
            Actual results depend on host, theme, plugins, third-party scripts, and content.
          </p>
        </div>
      </section>

      {/* More value */}
      <section className="mx-auto max-w-7xl px-6 py-24 md:py-32" aria-labelledby="more-title">
        <div className="overflow-hidden rounded-[2rem] bg-[#f03e2f] px-6 py-16 text-white md:px-14 md:py-20">
          <div className="max-w-3xl">
            <p className="font-mono text-xs font-semibold uppercase tracking-[0.16em] text-white/80">More reasons teams choose WP Instant</p>
            <h2 id="more-title" className="mt-4 text-balance text-[clamp(1.75rem,4vw,2.5rem)] font-semibold leading-[1.1] tracking-[-0.03em]">
              Built for stores, publishers, and site fleets
            </h2>
          </div>
          <div className="mt-10 grid gap-4 md:grid-cols-2">
            {[
              { title: 'WooCommerce-aware', body: 'Dynamic handling protects cart, checkout, and nonce behavior while static assets stay optimized.' },
              { title: 'Agency and multisite ready', body: 'Manage up to 25 sites on Agency, or contract Scale capacity for up to 100 sites.' },
              { title: 'Regression visibility', body: 'Real-user health history helps identify slowdowns after content, plugin, or release changes.' },
              { title: 'Crawl optimization', body: 'Growth and higher plans can optimize URL collections instead of submitting every page manually.' },
            ].map((item) => (
              <article key={item.title} className="rounded-2xl border border-white/20 bg-white/10 p-6 transition-colors hover:bg-white/16">
                <h3 className="text-base font-semibold">{item.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-white/85">{item.body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="mx-auto max-w-7xl px-6 pb-24 md:pb-32" aria-labelledby="pricing-title">
        <SectionHeading
          eyebrow="Pricing"
          title="Plans matched to fleet size and throughput"
          description="Every plan shares the core optimization engine. Higher tiers add sites, crawl automation, credits, capacity, telemetry retention, and support."
        />
        <PricingCards />
        <p className="meta mt-6 max-w-3xl">
          Prices are shown in USD. Annual billing is 20% below monthly billing. Scale is contracted because dedicated
          browser workloads require capacity planning.
        </p>
      </section>

      {/* FAQ */}
      <section id="faq" className="border-t border-[#e4e4e7] bg-white px-6 py-24 md:py-32" aria-labelledby="faq-title">
        <SectionHeading align="center" eyebrow="FAQ" title="Frequently asked questions" />
        <div className="mt-14">
          <FaqAccordion items={homepageFaqs} />
        </div>
      </section>

      {/* CTA */}
      <section className="border-t border-[#e4e4e7] bg-[#fbfbfa] px-6 py-24 md:py-32" aria-labelledby="homepage-cta-title">
        <div className="mx-auto max-w-4xl text-center">
          <h2 id="homepage-cta-title" className="text-balance text-[clamp(2rem,5vw,3.25rem)] font-semibold leading-[1.05] tracking-[-0.04em]">
            Your next pageview can load the optimized way.
          </h2>
          <p className="mx-auto mt-5 max-w-2xl text-lg leading-relaxed text-[#71717a]">
            Create a workspace, install the WordPress plugin, and complete the one-click connection. Then run your first
            mobile and desktop optimization dispatch.
          </p>
          <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
            <Link href="/sign-up" className="btn btn-primary min-h-12 px-7 text-[15px]">
              Create account
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
            <Link href="/pricing" className="btn btn-secondary min-h-12 px-7 text-[15px]">
              Compare plans
            </Link>
          </div>
          <ul className="mx-auto mt-8 flex max-w-xl flex-wrap items-center justify-center gap-x-6 gap-y-3 text-sm text-[#71717a]">
            {['Works with your existing host', 'No DNS migration required', 'WooCommerce-safe controls'].map((point) => (
              <li key={point} className="flex items-center gap-2">
                <CircleCheck className="h-4 w-4 text-[#16a34a]" aria-hidden="true" />
                {point}
              </li>
            ))}
          </ul>
        </div>
      </section>
    </MarketingShell>
  );
}
