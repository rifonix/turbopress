import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { MarketingShell } from '@/components/marketing/MarketingShell';
import { SectionHeading } from '@/components/marketing/SectionHeading';
import { PricingCards } from '@/components/marketing/PricingCards';
import { JsonLd } from '@/components/marketing/StructuredData';
import { pricingPlans, site } from '@/lib/marketing';

export const metadata: Metadata = {
  title: 'Pricing',
  description:
    'WP Instant pricing for WordPress optimization: Starter, Growth, Agency, and Scale plans with sites, optimization credits, crawls, pageviews, edge transfer, and real-user health history.',
  alternates: { canonical: '/pricing' },
  openGraph: { title: 'WP Instant pricing', description: 'Compare WordPress performance plans and optimization capacity.' },
};

export default function PricingPage() {
  return (
    <MarketingShell>
      <JsonLd
        data={{
          '@context': 'https://schema.org',
          '@type': 'FAQPage',
          mainEntity: pricingPlans.map((plan) => ({
            '@type': 'Question',
            name: `What is included in WP Instant ${plan.name}?`,
            acceptedAnswer: { '@type': 'Answer', text: `${plan.description} ${plan.features.join('. ')}.` },
          })),
        }}
      />
      <section className="mx-auto max-w-7xl px-6 py-20 md:py-28">
        <SectionHeading
          as="h1"
          eyebrow="Pricing"
          title="WordPress performance plans that scale with your fleet"
          description="Every plan includes the core WP Instant engine. Higher plans add connected sites, optimization credits, crawl automation, edge transfer, telemetry retention, and support."
        />
        <PricingCards />
        <div className="mt-10 grid gap-4 rounded-3xl border border-[#e4e4e7] bg-white p-6 md:grid-cols-3">
          {[
            ['Annual billing', 'Annual pricing is 20% below the equivalent monthly price.'],
            ['Credit model', 'A mobile and desktop dispatch consumes one optimization credit.'],
            ['Scale capacity', 'Scale is contracted for custom concurrency, crawls, and SLA options.'],
          ].map(([title, body]) => (
            <div key={title}>
              <h2 className="text-sm font-semibold">{title}</h2>
              <p className="mt-2 text-sm leading-relaxed text-[#71717a]">{body}</p>
            </div>
          ))}
        </div>
        <div className="mt-12 text-center">
          <Link href="/sign-up" className="btn btn-primary min-h-12 px-7 text-[15px]">
            Create account
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        </div>
      </section>
    </MarketingShell>
  );
}
