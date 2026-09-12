import Link from 'next/link';
import { ArrowLeft, Construction } from 'lucide-react';
import { MarketingShell } from './MarketingShell';
import { SectionHeading } from './SectionHeading';

type PlaceholderPageProps = {
  title: string;
  description: string;
  children?: React.ReactNode;
};

export function PlaceholderPage({ title, description, children }: PlaceholderPageProps) {
  return (
    <MarketingShell>
      <section className="relative overflow-hidden">
        <div
          className="pointer-events-none absolute inset-0 -z-10"
          style={{ background: 'radial-gradient(60rem 24rem at 50% -8rem, rgba(240,62,47,0.09), transparent 65%)' }}
        />
        <div className="mx-auto max-w-4xl px-6 py-24 md:py-32">
          <div className="mb-8 inline-flex items-center gap-2 rounded-full border border-[#e4e4e7] bg-white px-4 py-2">
            <Construction className="h-4 w-4 text-[#f03e2f]" aria-hidden="true" />
            <span className="text-sm font-medium text-[#3f3f46]">Placeholder · in progress</span>
          </div>
          <SectionHeading as="h1" title={title} description={description} />
          {children}
          <div className="mt-12 flex flex-wrap gap-3">
            <Link href="/" className="btn btn-secondary">
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              Back to homepage
            </Link>
            <Link href="/contact" className="btn btn-primary">
              Contact us
            </Link>
          </div>
        </div>
      </section>
    </MarketingShell>
  );
}
