'use client';

import * as React from 'react';
import { Activity, Globe, MessageCircle } from 'lucide-react';
import DottedMap from 'dotted-map';
import { Area, AreaChart, CartesianGrid } from 'recharts';
import { type ChartConfig, ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart';

export function FeaturesShowcase() {
  return (
    <section className="mx-auto max-w-7xl px-6 py-24 md:py-32" aria-labelledby="showcase-title">
      <div className="mx-auto grid max-w-5xl overflow-hidden rounded-2xl border border-[#e4e4e7] bg-white md:grid-cols-2">
        <div>
          <div className="p-6 sm:p-12">
            <span className="flex items-center gap-2 text-sm text-[#71717a]">
              <Globe className="h-4 w-4" aria-hidden="true" />
              Global edge delivery
            </span>
            <p id="showcase-title" className="mt-8 text-2xl font-semibold tracking-[-0.02em]">
              One purge fans out to every PoP in milliseconds.
            </p>
          </div>

          <div aria-hidden="true" className="relative">
            <div className="absolute inset-0 z-10 m-auto h-fit w-fit">
              <div className="relative z-[1] flex w-fit items-center gap-2 rounded-xl border border-[#e4e4e7] bg-white px-3 py-1 text-xs font-medium shadow-md">
                <span className="text-lg leading-none">⚡</span> Purge live on 32 PoPs
              </div>
              <div className="absolute inset-x-2 -bottom-2 top-2 rounded-xl border border-[#e4e4e7] bg-zinc-50 px-3 py-4 text-xs font-medium shadow-md" />
            </div>

            <div className="relative overflow-hidden text-[#d4d4d8]">
              <div className="absolute inset-0 z-[1] bg-[radial-gradient(var(--tw-gradient-stops))] from-transparent to-75% to-white" />
              <EdgeMap />
            </div>
          </div>
        </div>

        <div className="overflow-hidden border-t border-[#e4e4e7] bg-zinc-50 p-6 sm:p-12 md:border-0 md:border-l">
          <div className="relative z-10">
            <span className="flex items-center gap-2 text-sm text-[#71717a]">
              <MessageCircle className="h-4 w-4" aria-hidden="true" />
              Engineers who answer
            </span>
            <p className="my-8 text-2xl font-semibold tracking-[-0.02em]">
              Real WordPress performance help, not bots.
            </p>
          </div>
          <div aria-hidden="true" className="flex flex-col gap-8">
            <div>
              <div className="flex items-center gap-2">
                <span className="flex h-5 w-5 items-center justify-center rounded-full border border-[#d4d4d8]">
                  <span className="h-3 w-3 rounded-full bg-[#f03e2f]" />
                </span>
                <span className="text-xs text-[#71717a]">Store owner · Tue</span>
              </div>
              <div className="mt-1.5 w-3/5 rounded-xl border border-[#e4e4e7] bg-white p-3 text-xs leading-relaxed">
                Checkout slowed down after I added a new upsell plugin. Can you take a look?
              </div>
            </div>

            <div>
              <div className="mb-1 ml-auto w-3/5 rounded-xl bg-[#171717] p-3 text-xs leading-relaxed text-white">
                Found it — its scripts were render-blocking. We deferred them and your LCP is back under 2s.
              </div>
              <span className="block text-right text-xs text-[#71717a]">Now</span>
            </div>
          </div>
        </div>

        <div className="col-span-full border-y border-[#e4e4e7] bg-white p-12">
          <p className="text-center text-4xl font-semibold tracking-[-0.03em] lg:text-7xl">99.99% Uptime</p>
        </div>

        <div className="relative col-span-full bg-white">
          <div className="absolute z-10 max-w-lg px-6 pr-12 pt-6 md:px-12 md:pt-12">
            <span className="flex items-center gap-2 text-sm text-[#71717a]">
              <Activity className="h-4 w-4" aria-hidden="true" />
              Fleet activity
            </span>
            <p className="my-8 text-2xl font-semibold tracking-[-0.02em]">
              Extractions, purges and cache fills across your sites. <span className="text-[#71717a]">Spot regressions before Google does.</span>
            </p>
          </div>
          <MonitoringChart />
        </div>
      </div>
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
    label: 'Desktop score',
    color: '#171717',
  },
  mobile: {
    label: 'Mobile score',
    color: '#f03e2f',
  },
} satisfies ChartConfig;

const chartData = [
  { week: 'W1', desktop: 88, mobile: 74 },
  { week: 'W2', desktop: 91, mobile: 79 },
  { week: 'W3', desktop: 90, mobile: 84 },
  { week: 'W4', desktop: 94, mobile: 88 },
  { week: 'W5', desktop: 95, mobile: 91 },
  { week: 'W6', desktop: 97, mobile: 94 },
];

function MonitoringChart() {
  return (
    <ChartContainer className="aspect-auto h-80 md:h-96" config={chartConfig}>
      <AreaChart accessibilityLayer data={chartData} margin={{ left: 0, right: 0 }}>
        <defs>
          <linearGradient id="fillDesktop" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--color-desktop)" stopOpacity={0.8} />
            <stop offset="55%" stopColor="var(--color-desktop)" stopOpacity={0.1} />
          </linearGradient>
          <linearGradient id="fillMobile" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--color-mobile)" stopOpacity={0.8} />
            <stop offset="55%" stopColor="var(--color-mobile)" stopOpacity={0.1} />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} stroke="#f1f1f2" />
        <ChartTooltip active cursor={false} content={<ChartTooltipContent />} />
        <Area
          strokeWidth={2}
          dataKey="mobile"
          type="stepBefore"
          fill="url(#fillMobile)"
          fillOpacity={0.1}
          stroke="var(--color-mobile)"
          stackId="a"
        />
        <Area
          strokeWidth={2}
          dataKey="desktop"
          type="stepBefore"
          fill="url(#fillDesktop)"
          fillOpacity={0.1}
          stroke="var(--color-desktop)"
          stackId="a"
        />
      </AreaChart>
    </ChartContainer>
  );
}
