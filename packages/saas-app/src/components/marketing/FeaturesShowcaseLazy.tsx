'use client';

import dynamic from 'next/dynamic';

// recharts + dotted-map are the heaviest client JS on the marketing site.
// This section sits far below the fold, so it loads only in the browser
// after hydration — the hero never waits on it.
export const FeaturesShowcase = dynamic(
  () => import('@/components/marketing/FeaturesShowcase').then((mod) => mod.FeaturesShowcase),
  {
    ssr: false,
    loading: () => (
      <div className="mx-auto max-w-7xl px-6 py-24 md:py-32" aria-hidden="true">
        <div className="h-64 animate-pulse rounded-2xl bg-[#efefee]" />
      </div>
    ),
  },
);
