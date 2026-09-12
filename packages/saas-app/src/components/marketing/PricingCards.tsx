'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Check } from 'lucide-react';
import { pricingPlans } from '@/lib/marketing';

export function PricingCards() {
  const [annual, setAnnual] = useState(true);

  return (
    <div>
      <div className="mt-14 flex justify-center">
        <div
          role="group"
          aria-label="Billing period"
          className="inline-flex rounded-full border border-[#e4e4e7] bg-white p-1 shadow-sm"
        >
          {(['Monthly', 'Annual'] as const).map((label) => {
            const active = annual === (label === 'Annual');
            return (
              <button
                key={label}
                type="button"
                aria-pressed={active}
                onClick={() => setAnnual(label === 'Annual')}
                className={`rounded-full px-5 py-2 text-sm font-semibold transition-all duration-200 ${
                  active ? 'bg-[#171717] text-white shadow-sm' : 'text-[#71717a] hover:text-[#171717]'
                }`}
              >
                {label}
                {label === 'Annual' && (
                  <span className={`ml-1.5 font-mono text-[10px] ${active ? 'text-[#fca5a5]' : 'text-[#16a34a]'}`}>
                    −20%
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      <div key={annual ? 'annual' : 'monthly'} className="animate-fade-in mt-8 grid gap-5 md:grid-cols-2 xl:grid-cols-4">
        {pricingPlans.map((plan) => {
          const price = annual ? plan.annual : plan.monthly;
          return (
            <article
              key={plan.id}
              className={`relative flex flex-col rounded-3xl border bg-white p-6 transition-all duration-300 hover:-translate-y-1 ${
                plan.featured
                  ? 'border-[#f03e2f] shadow-[0_18px_42px_rgba(240,62,47,0.10)] hover:shadow-[0_24px_56px_rgba(240,62,47,0.16)]'
                  : 'border-[#e4e4e7] shadow-sm hover:shadow-[0_18px_42px_rgba(23,23,23,0.08)]'
              }`}
            >
              {plan.featured && (
                <span className="absolute -top-3 left-6 rounded-full bg-[#f03e2f] px-3 py-1 font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-white">
                  Recommended
                </span>
              )}
              <h3 className="text-lg font-semibold tracking-[-0.02em]">{plan.name}</h3>
              <p className="mt-1.5 min-h-10 text-sm leading-snug text-[#71717a]">{plan.description}</p>

              <div className="mt-5 flex items-baseline gap-1">
                {price === null ? (
                  <span className="text-4xl font-semibold tracking-[-0.03em]">Custom</span>
                ) : (
                  <>
                    <span className="num text-4xl font-semibold tracking-[-0.03em] tabular-nums">${price}</span>
                    <span className="text-sm text-[#71717a]">/month</span>
                  </>
                )}
              </div>
              {price !== null && (
                <p className="meta mt-1">
                  {annual ? 'billed annually' : 'billed monthly — switch to annual and save 20%'}
                </p>
              )}

              <ul className="mt-6 flex-1 space-y-2.5">
                {plan.features.map((feature) => (
                  <li key={feature} className="flex items-start gap-2.5 text-sm text-[#3f3f46]">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-[#f03e2f]" strokeWidth={3} aria-hidden="true" />
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>

              <Link
                href={plan.cta === 'Contact us' ? '/contact' : '/sign-up'}
                className={`mt-7 inline-flex min-h-11 items-center justify-center rounded-xl px-4 text-sm font-semibold transition-all hover:-translate-y-px ${
                  plan.featured
                    ? 'bg-[#f03e2f] text-white hover:bg-[#dc2e20] hover:shadow-md'
                    : 'border border-[#d4d4d8] bg-white text-[#171717] hover:border-[#171717]'
                }`}
              >
                {plan.cta}
              </Link>
            </article>
          );
        })}
      </div>
    </div>
  );
}
