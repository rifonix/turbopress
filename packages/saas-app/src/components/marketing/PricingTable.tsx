'use client';

import { Fragment, useState } from 'react';
import Link from 'next/link';
import { Check, Minus } from 'lucide-react';
import { pricingPlans } from '@/lib/marketing';

type Cell = string | boolean;

const SECTIONS: Array<{ title: string; rows: Array<{ label: string; values: [Cell, Cell, Cell, Cell] }> }> = [
  {
    title: 'Capacity',
    rows: [
      { label: 'Connected sites', values: ['1', '5', '25', 'Unlimited'] },
      { label: 'Optimization credits / month', values: ['250', '1,500', '6,000', 'Unlimited'] },
      { label: 'Pageviews / month', values: ['60,000', '250,000', '1.2M', 'Unlimited'] },
      { label: 'Edge transfer', values: ['25 GB', '100 GB', '400 GB', 'Unlimited'] },
    ],
  },
  {
    title: 'Optimization engine',
    rows: [
      { label: 'Full-page edge cache', values: [true, true, true, true] },
      { label: 'Real-browser Critical CSS', values: [true, true, true, true] },
      { label: 'LCP detection & preload', values: [true, true, true, true] },
      { label: 'WebP / AVIF media CDN', values: [true, true, true, true] },
      { label: 'Script defer & interaction delay', values: [true, true, true, true] },
      { label: 'WooCommerce-safe dynamic handling', values: [true, true, true, true] },
    ],
  },
  {
    title: 'Automation',
    rows: [
      { label: 'Automated crawl optimization', values: [false, true, true, true] },
      { label: 'Crawl limit per seed', values: [false, '250 pages', '1,500 pages', 'Custom'] },
      { label: 'Cache warm-up after purge', values: [true, true, true, true] },
      { label: 'Priority queue access', values: [false, true, true, true] },
    ],
  },
  {
    title: 'Telemetry & support',
    rows: [
      { label: 'Real-user health history', values: ['30 days', '90 days', '180 days', 'Custom'] },
      { label: 'Fleet-level jobs & health views', values: [false, false, true, true] },
      { label: 'Regression alerts', values: [true, true, true, true] },
      { label: 'Support', values: ['Email', 'Email', 'Priority', 'Dedicated + SLA'] },
    ],
  },
];

function CellValue({ value }: { value: Cell }) {
  if (value === true) return <Check className="mx-auto h-4 w-4 text-[#16a34a]" strokeWidth={3} aria-label="Included" />;
  if (value === false) return <Minus className="mx-auto h-4 w-4 text-[#d4d4d8]" aria-label="Not included" />;
  return <span className="text-[13px] font-medium text-[#3f3f46]">{value}</span>;
}

export function PricingTable() {
  const [annual, setAnnual] = useState(true);

  return (
    <div className="mt-16">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold tracking-[-0.02em]">Full breakdown</h2>
        <div role="group" aria-label="Billing period" className="inline-flex rounded-full bg-white p-1 shadow-[0_1px_3px_rgba(23,23,23,0.08)]">
          {(['Monthly', 'Annual'] as const).map((label) => {
            const active = annual === (label === 'Annual');
            return (
              <button
                key={label}
                type="button"
                aria-pressed={active}
                onClick={() => setAnnual(label === 'Annual')}
                className={`rounded-full px-4 py-1.5 text-xs font-semibold transition-all ${active ? 'bg-[#171717] text-white' : 'text-[#71717a] hover:text-[#171717]'}`}
              >
                {label}
                {label === 'Annual' && <span className={`ml-1 font-mono text-[10px] ${active ? 'text-[#fca5a5]' : 'text-[#16a34a]'}`}>−20%</span>}
              </button>
            );
          })}
        </div>
      </div>

      <div className="mt-6 overflow-x-auto rounded-2xl bg-white shadow-[0_1px_3px_rgba(23,23,23,0.06)]">
        <table className="w-full min-w-[860px] border-collapse text-left">
          <thead>
            {/* Sticky plan header — names, prices, CTAs stay visible while
                the breakdown scrolls. */}
            <tr className="sticky top-16 z-20 bg-white shadow-[0_1px_0_#f1f1f2]">
              <th className="sticky left-0 z-10 w-[240px] bg-white px-6 py-5 align-bottom text-[11px] font-mono uppercase tracking-[0.12em] text-[#a1a1aa]">
                Compare plans
              </th>
              {pricingPlans.map((plan) => (
                <th key={plan.id} className={`px-5 py-5 align-bottom ${plan.featured ? 'bg-[#fff8f7]' : 'bg-white'}`}>
                  <div className="text-sm font-semibold text-[#171717]">{plan.name}</div>
                  <div className="mt-1.5 flex items-baseline gap-1">
                    {plan.monthly === null ? (
                      <span className="text-2xl font-semibold tracking-[-0.03em]">Custom</span>
                    ) : (
                      <>
                        <span className="num text-2xl font-semibold tracking-[-0.03em]">${annual ? plan.annual : plan.monthly}</span>
                        <span className="text-xs text-[#71717a]">/month</span>
                      </>
                    )}
                  </div>
                  <div className="meta mt-0.5 text-[10px]">{plan.monthly !== null ? (annual ? 'billed annually' : 'billed monthly') : 'contracted'}</div>
                  <Link
                    href={plan.cta === 'Contact us' ? '/contact' : '/sign-up'}
                    className={`mt-3 inline-flex min-h-9 items-center justify-center rounded-lg px-4 text-xs font-semibold transition-colors ${
                      plan.featured ? 'bg-[#f03e2f] text-white hover:bg-[#dc2e20]' : 'bg-[#171717] text-white hover:bg-[#f03e2f]'
                    }`}
                  >
                    {plan.cta}
                  </Link>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {SECTIONS.map((section) => (
              <Fragment key={section.title}>
                <tr>
                  <td colSpan={5} className="sticky left-0 bg-white px-6 pb-1 pt-6 text-[11px] font-mono font-semibold uppercase tracking-[0.14em] text-[#f03e2f]">
                    {section.title}
                  </td>
                </tr>
                {section.rows.map((row) => (
                  <tr key={row.label} className="transition-colors hover:bg-[#fbfbfa]">
                    <td className="sticky left-0 bg-white px-6 py-3 text-[13px] text-[#3f3f46] shadow-[1px_0_0_#f1f1f2]">{row.label}</td>
                    {row.values.map((value, i) => (
                      <td key={i} className={`px-5 py-3 text-center ${pricingPlans[i].featured ? 'bg-[#fff8f7]' : ''}`}>
                        <CellValue value={value} />
                      </td>
                    ))}
                  </tr>
                ))}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
