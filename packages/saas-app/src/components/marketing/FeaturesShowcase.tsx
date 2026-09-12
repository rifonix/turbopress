'use client';

import * as React from 'react';
import { Activity, Globe, MessageCircle } from 'lucide-react';
import DottedMap from 'dotted-map';
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from 'recharts';
import { type ChartConfig, ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart';
import { SectionHeading } from '@/components/marketing/SectionHeading';
import { CountUp } from '@/components/marketing/CountUp';

const fleetStats = [
  { value: '18ms', label: 'median edge cache HIT' },
  { value: '68%', label: 'lighter images via AVIF/WebP' },
  { value: '1.8s', label: 'median mobile LCP' },
];

export function FeaturesShowcase() {
  return (
    <section className="mx-auto max-w-7xl px-6 py-24 md:py-32" aria-labelledby="showcase-title">
      <SectionHeading
        eyebrow="Live proof"
        title="Optimization you can watch working"
        description="Every layer reports back: cache hits from the edge, bytes saved on images, and real-user LCP per template — not lab guesses."
      />

      <div className="mt-14 grid gap-5 lg:grid-cols-2">
        <article className="group overflow-hidden rounded-2xl border border-[#e4e4e7] bg-white transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_18px_42px_rgba(23,23,23,0.08)]">
          <div className="p-7 pb-0">
            <span className="flex items-center gap-2 text-sm text-[#71717a]">
              <Globe className="h-4 w-4 text-[#f03e2f]" aria-hidden="true" />
              Edge delivery
            </span>
            <h3 id="showcase-title" className="mt-4 text-xl font-semibold tracking-[-0.02em]">
              Served from the PoP next door
            </h3>
            <p className="mt-2 text-sm leading-relaxed text-[#71717a]">
              Full pages, images and critical CSS ship from 32 points of presence. Purges fan out in milliseconds.
            </p>
          </div>
          <div aria-hidden="true" className="relative mt-6">
            <div className="absolute inset-x-0 top-4 z-10 mx-auto w-fit">
              <div className="flex items-center gap-2 rounded-full border border-[#e4e4e7] bg-white px-3.5 py-1.5 text-xs font-semibold shadow-md">
                <span className="h-1.5 w-1.5 rounded-full bg-[#16a34a]" />
                HIT · 18ms · Frankfurt
              </div>
            </div>
            <div className="px-7 pb-7 pt-10 text-[#d4d4d8]">
              <EdgeMap />
            </div>
          </div>
        </article>

        <article className="group flex flex-col rounded-2xl border border-[#e4e4e7] bg-white p-7 transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_18px_42px_rgba(23,23,23,0.08)]">
          <span className="flex items-center gap-2 text-sm text-[#71717a]">
            <MessageCircle className="h-4 w-4 text-[#f03e2f]" aria-hidden="true" />
            Safe automation
          </span>
          <h3 className="mt-4 text-xl font-semibold tracking-[-0.02em]">Every fix is reviewable first</h3>
          <p className="mt-2 text-sm leading-relaxed text-[#71717a]">
            The engine proposes, you approve. Cart, checkout and nonce behavior stay protected automatically.
          </p>
          <div aria-hidden="true" className="mt-6 flex flex-col gap-4 rounded-2xl bg-[#fbfbfa] p-5">
            <div>
              <p className="text-[11px] font-medium text-[#a1a1aa]">Store owner · Tue</p>
              <div className="mt-1.5 w-4/5 rounded-2xl rounded-tl-md border border-[#e4e4e7] bg-white p-3 text-xs leading-relaxed">
                Will delaying my upsell scripts break checkout?
              </div>
            </div>
            <div>
              <div className="mb-1 ml-auto w-4/5 rounded-2xl rounded-tr-md bg-[#171717] p-3 text-xs leading-relaxed text-white">
                No — cart and checkout scripts stay synchronous. 31 others deferred, LCP back under 2s.
              </div>
              <p className="text-right text-[11px] text-[#a1a1aa]">Engine · now</p>
            </div>
          </div>
        </article>
      </div>

      <dl className="mt-5 grid grid-cols-1 gap-px overflow-hidden rounded-2xl border border-[#e4e4e7] bg-[#e4e4e7] sm:grid-cols-3">
        {fleetStats.map((stat) => (
          <div key={stat.label} className="bg-white px-6 py-8 text-center">
            <dd className="text-3xl font-semibold tracking-[-0.03em]">
              <CountUp value={stat.value} />
            </dd>
            <dt className="mt-1 font-mono text-[11px] uppercase tracking-[0.12em] text-[#71717a]">{stat.label}</dt>
          </div>
        ))}
      </dl>

      <article className="group mt-5 overflow-hidden rounded-2xl border border-[#e4e4e7] bg-white transition-all duration-300 hover:shadow-[0_18px_42px_rgba(23,23,23,0.08)]">
        <div className="flex flex-col justify-between gap-4 p-7 pb-0 sm:flex-row sm:items-end">
          <div>
            <span className="flex items-center gap-2 text-sm text-[#71717a]">
              <Activity className="h-4 w-4 text-[#f03e2f]" aria-hidden="true" />
              Fleet median LCP · last 6 weeks
            </span>
            <h3 className="mt-4 text-xl font-semibold tracking-[-0.02em]">
              Real-user LCP keeps trending down
            </h3>
          </div>
          <div className="flex items-center gap-4 text-xs text-[#71717a]">
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-[#171717]" aria-hidden="true" /> Desktop
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-[#f03e2f]" aria-hidden="true" /> Mobile
            </span>
          </div>
        </div>
        <div className="px-4 pb-4 pt-2">
          <MonitoringChart />
        </div>
      </article>
    </section>
  );
}

const map = new DottedMap({ height: 55, grid: 'diagonal' });
const points = map.getPoints();

function EdgeMap() {
  const viewBox = '0 0 120 60';
  return (
    <svg viewBox={viewBox} className="h-auto w-full" role="img" aria-label="World map of edge points of presence">
      {points.map((point, index) => (
        <circle key={index} cx={point.x} cy={point.y} r={0.15} fill="currentColor" />
      ))}
    </svg>
  );
}

const chartConfig = {
  desktop: {
    label: 'Desktop LCP (s)',
    color: '#171717',
  },
  mobile: {
    label: 'Mobile LCP (s)',
    color: '#f03e2f',
  },
} satisfies ChartConfig;

const chartData = [
  { week: 'W1', desktop: 2.4, mobile: 4.1 },
  { week: 'W2', desktop: 2.2, mobile: 3.6 },
  { week: 'W3', desktop: 2.0, mobile: 3.1 },
  { week: 'W4', desktop: 1.8, mobile: 2.6 },
  { week: 'W5', desktop: 1.7, mobile: 2.2 },
  { week: 'W6', desktop: 1.6, mobile: 1.8 },
];

function MonitoringChart() {
  return (
    <ChartContainer className="aspect-auto h-72 md:h-80" config={chartConfig}>
      <AreaChart accessibilityLayer data={chartData} margin={{ left: -18, right: 12, top: 12 }}>
        <defs>
          <linearGradient id="showcaseDesktop" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--color-desktop)" stopOpacity={0.16} />
            <stop offset="100%" stopColor="var(--color-desktop)" stopOpacity={0.02} />
          </linearGradient>
          <linearGradient id="showcaseMobile" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--color-mobile)" stopOpacity={0.22} />
            <stop offset="100%" stopColor="var(--color-mobile)" stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} stroke="#f1f1f2" />
        <XAxis dataKey="week" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: '#a1a1aa' }} />
        <YAxis
          tickLine={false}
          axisLine={false}
          tick={{ fontSize: 11, fill: '#a1a1aa' }}
          domain={[0, 5]}
          ticks={[0, 1, 2, 3, 4, 5]}
          tickFormatter={(v: number) => `${v}s`}
        />
        <ChartTooltip active cursor={false} content={<ChartTooltipContent />} />
        <Area
          strokeWidth={2}
          dataKey="mobile"
          type="monotone"
          fill="url(#showcaseMobile)"
          stroke="var(--color-mobile)"
        />
        <Area
          strokeWidth={2}
          dataKey="desktop"
          type="monotone"
          fill="url(#showcaseDesktop)"
          stroke="var(--color-desktop)"
        />
      </AreaChart>
    </ChartContainer>
  );
}
