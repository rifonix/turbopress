import Link from 'next/link';
import { Check } from 'lucide-react';
import { pricingPlans } from '@/lib/marketing';

export function PricingCards() {
  return (
    <div className="mt-14 grid gap-5 md:grid-cols-2 xl:grid-cols-4">
      {pricingPlans.map((plan) => (
        <article
          key={plan.id}
          className={`relative flex flex-col rounded-3xl border bg-white p-6 ${
            plan.featured
              ? 'border-[#f03e2f] shadow-[0_18px_42px_rgba(240,62,47,0.10)]'
              : 'border-[#e4e4e7] shadow-sm'
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
            {plan.monthly === null ? (
              <span className="text-4xl font-semibold tracking-[-0.03em]">Custom</span>
            ) : (
              <>
                <span className="num text-4xl font-semibold tracking-[-0.03em]">${plan.monthly}</span>
                <span className="text-sm text-[#71717a]">/month</span>
              </>
            )}
          </div>
          {plan.annual !== null && (
            <p className="meta mt-1">or ${plan.annual}/month billed annually</p>
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
            className={`mt-7 inline-flex min-h-11 items-center justify-center rounded-xl px-4 text-sm font-semibold transition-colors ${
              plan.featured
                ? 'bg-[#f03e2f] text-white hover:bg-[#dc2e20]'
                : 'border border-[#d4d4d8] bg-white text-[#171717] hover:border-[#171717]'
            }`}
          >
            {plan.cta}
          </Link>
        </article>
      ))}
    </div>
  );
}
