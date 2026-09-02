'use client';

import React, { useState } from 'react';
import { Check, Info } from 'lucide-react';
import { PLAN_CONTRACT, PlanId } from '@wpinstant/shared';

interface PricingPageProps {
  onSelectPlan: (planId: string, interval: 'monthly' | 'annual', returnTo?: string) => void;
  onToast: (msg: string) => void;
  hasActivePlan?: boolean;
  showRequiredBanner?: boolean;
}

export const PricingPage: React.FC<PricingPageProps> = ({
  onSelectPlan,
  onToast,
  hasActivePlan = false,
  showRequiredBanner = false,
}) => {
  const [interval, setInterval] = useState<'monthly' | 'annual'>('monthly');

  const handleSelect = (planId: string) => {
    onSelectPlan(planId, interval, hasActivePlan ? '/dashboard/billing' : '/dashboard/onboarding');
  };

  const planCards = [
    {
      id: 'starter' as PlanId,
      contract: PLAN_CONTRACT.starter,
      popular: true,
      headlinePriceMonthly: 19,
      headlinePriceAnnualMonthlyEquiv: '15.20',
      billedYearlyTotal: '182.40',
      creditsLabel: '250 optimization credits / mo',
      creditsSub: '1 URL + 1 viewport per credit',
      trafficLabel: '60k pageviews • 25 GB bandwidth',
      slotsLabel: '1 production site slot',
      features: [
        '1 WordPress site slot',
        '250 optimization credits / month',
        '1 concurrent headless browser job',
        '60k pageviews & 25 GB bandwidth allowance',
        '30-day Real User Monitoring (RUM)',
        'Sub-15ms advanced-cache.php drop-in',
        'Edge Critical CSS & 3-tier script delayer',
        'Opt-in overage protection',
      ],
    },
    {
      id: 'growth' as PlanId,
      contract: PLAN_CONTRACT.growth,
      popular: false,
      headlinePriceMonthly: 49,
      headlinePriceAnnualMonthlyEquiv: '39.20',
      billedYearlyTotal: '470.40',
      creditsLabel: '1,500 optimization credits / mo',
      creditsSub: '1 URL + 1 viewport per credit',
      trafficLabel: '250k pageviews • 100 GB bandwidth',
      slotsLabel: '5 production site slots',
      features: [
        '5 WordPress site slots',
        '1,500 optimization credits / month',
        '3 concurrent headless browser jobs',
        'Automated background crawl (up to 250 pages)',
        '250k pageviews & 100 GB bandwidth allowance',
        '90-day Real User Monitoring (RUM)',
        'Dynamic nonces & WooCommerce cart hydration',
        'W3C Speculation Rules prerendering',
      ],
    },
    {
      id: 'agency' as PlanId,
      contract: PLAN_CONTRACT.agency,
      popular: false,
      headlinePriceMonthly: 129,
      headlinePriceAnnualMonthlyEquiv: '103.20',
      billedYearlyTotal: '1,238.40',
      creditsLabel: '6,000 optimization credits / mo',
      creditsSub: '1 URL + 1 viewport per credit',
      trafficLabel: '1.2M pageviews • 400 GB bandwidth',
      slotsLabel: '25 production site slots ($5.16/site)',
      features: [
        '25 WordPress site slots',
        '6,000 optimization credits / month',
        '8 concurrent headless browser jobs',
        'Deep automated crawl (up to 1,500 pages)',
        '1.2M pageviews & 400 GB bandwidth allowance',
        '180-day Real User Monitoring (RUM)',
        'Clerk Organization team seats',
        'High-priority queue processing',
      ],
    },
    {
      id: 'scale' as PlanId,
      contract: PLAN_CONTRACT.scale,
      popular: false,
      headlinePriceMonthly: null,
      headlinePriceAnnualMonthlyEquiv: null,
      billedYearlyTotal: null,
      creditsLabel: '40,000+ credits / mo',
      creditsSub: 'Contractual dedicated quota',
      trafficLabel: '4M+ pageviews • 1.5 TB bandwidth',
      slotsLabel: '100+ production site slots',
      features: [
        '100+ WordPress site slots',
        '40,000+ optimization credits / month',
        '20 concurrent headless browser workers',
        'Deep site-wide crawl (5,000+ pages)',
        '4M+ pageviews & 1.5 TB bandwidth allowance',
        'Dedicated browser worker pool & 99.99% SLA',
        'Enterprise SAML SSO & custom domains',
        'Direct Slack / Teams escalation',
      ],
    },
  ];

  return (
    <div className="space-y-12 animate-fade-in max-w-5xl mx-auto py-2">
      {/* Gating banner */}
      {showRequiredBanner && !hasActivePlan && (
        <div className="flex items-start gap-3 p-4 rounded-2xl bg-[#fffbeb] border border-[#fed7aa]">
          <Info className="w-4 h-4 text-[#9a3412] flex-none mt-0.5" />
          <p className="text-xs text-[#78350f] leading-relaxed">
            <strong className="font-semibold">A plan is required to use the WP Instant dashboard.</strong>{' '}
            Pick any plan below to unlock edge caching, Critical CSS extraction, and site pairing.
            After checkout you&apos;ll continue straight into onboarding.
          </p>
        </div>
      )}

      {/* Hero Header */}
      <div className="text-center space-y-3">
        <span className="font-mono text-xs font-semibold uppercase tracking-wider px-3 py-1 bg-[#fff1ef] text-[#f03e2f] rounded-full border border-red-200 inline-block">
          Predictable Edge Pricing
        </span>
        <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight text-[#171717]">
          High-performance WordPress optimization at scale
        </h1>
        <p className="text-[14.5px] text-[#71717a] max-w-xl mx-auto">
          No DNS changes, no proxy downtime, and transparent opt-in overage. 1 credit equals 1 URL + 1 viewport extraction.
        </p>

        {/* Interval Selector */}
        <div className="flex items-center justify-center gap-3 pt-3">
          <span className={`text-xs font-medium ${interval === 'monthly' ? 'text-[#171717]' : 'text-[#71717a]'}`}>
            Monthly
          </span>
          <button
            onClick={() => setInterval(interval === 'monthly' ? 'annual' : 'monthly')}
            className={`w-12 h-6 rounded-full p-1 transition-colors border ${
              interval === 'annual' ? 'bg-[#171717] border-[#171717]' : 'bg-[#e4e4e7] border-[#d4d4d8]'
            }`}
          >
            <div
              className={`w-4 h-4 rounded-full bg-white transition-transform ${
                interval === 'annual' ? 'translate-x-6' : 'translate-x-0'
              }`}
            />
          </button>
          <span className={`text-xs font-medium ${interval === 'annual' ? 'text-[#171717]' : 'text-[#71717a]'}`}>
            Annual <span className="text-[#16a34a] font-bold">(Save 20%)</span>
          </span>
        </div>
      </div>

      {/* Pricing Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {planCards.map((p) => {
          const isScale = p.id === 'scale';
          const priceDisplay =
            interval === 'annual'
              ? p.headlinePriceAnnualMonthlyEquiv
              : p.headlinePriceMonthly;

          return (
            <div
              key={p.id}
              className={`bg-white rounded-2xl p-6 flex flex-col justify-between transition-all duration-200 border relative ${
                p.popular
                  ? 'border-[#f03e2f] shadow-lg ring-1 ring-[#f03e2f]'
                  : 'border-[#e4e4e7] shadow-sm hover:border-[#a1a1aa]'
              }`}
            >
              {p.popular && (
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 font-mono text-[10px] font-bold uppercase tracking-wider bg-[#f03e2f] text-white px-2.5 py-0.5 rounded-full shadow-sm">
                  Most Popular
                </span>
              )}

              <div>
                <h3 className="text-lg font-semibold text-[#171717]">{p.contract.name}</h3>
                <p className="text-xs text-[#71717a] mt-1 min-h-8 leading-snug">{p.contract.description}</p>

                <div className="my-5 pb-5 border-b border-[#f1f1f2]">
                  {!isScale && priceDisplay !== null ? (
                    <div>
                      <div className="flex items-baseline gap-1">
                        <span className="font-mono text-3xl font-bold text-[#171717]">
                          ${priceDisplay}
                        </span>
                        <span className="font-mono text-xs text-[#71717a]">/ month</span>
                      </div>
                      {interval === 'annual' && p.billedYearlyTotal && (
                        <p className="text-[11px] text-[#16a34a] font-medium mt-0.5">
                          Billed annually (${p.billedYearlyTotal}/year)
                        </p>
                      )}
                    </div>
                  ) : (
                    <div className="flex items-baseline gap-1">
                      <span className="font-mono text-2xl font-bold text-[#171717]">Custom</span>
                      <span className="text-xs text-[#71717a]">from $299/mo</span>
                    </div>
                  )}

                  <div className="mt-2 space-y-0.5 font-mono text-[11px] text-[#52525b]">
                    <p className="font-semibold text-[#171717]">{p.slotsLabel}</p>
                    <p>{p.creditsLabel}</p>
                    <p className="text-[10px] text-[#71717a]">{p.trafficLabel}</p>
                  </div>
                </div>

                <ul className="space-y-2.5 text-xs text-[#3f3f46]">
                  {p.features.map((feat, idx) => (
                    <li key={idx} className="flex items-start gap-2">
                      <Check className="w-3.5 h-3.5 text-[#16a34a] flex-none mt-0.5" />
                      <span>{feat}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="pt-6 mt-6 border-t border-[#f1f1f2]">
                <button
                  onClick={() => {
                    if (isScale) {
                      onToast('Scale sales inquiry initiated — we will be in touch shortly');
                    } else {
                      handleSelect(p.id);
                    }
                  }}
                  className={`w-full btn text-xs ${
                    p.popular ? 'btn-primary' : 'btn-secondary'
                  }`}
                >
                  {isScale ? 'Contact Sales' : `Choose ${p.contract.name}`}
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* FAQ Section */}
      <div className="bg-white border border-[#e4e4e7] rounded-2xl p-8 shadow-sm">
        <h2 className="text-xl font-semibold text-[#171717] mb-6">
          Frequently asked questions
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-[13px] text-[#3f3f46]">
          <div>
            <h4 className="font-semibold text-[#171717] mb-1">
              What is an optimization credit?
            </h4>
            <p className="text-[#71717a] leading-relaxed">
              1 credit equals extracting Edge Critical CSS and LCP data for 1 URL on 1 viewport (e.g. mobile or desktop). Retries do not double-charge, and failed infrastructure attempts are not billed.
            </p>
          </div>
          <div>
            <h4 className="font-semibold text-[#171717] mb-1">
              How does overage protection work?
            </h4>
            <p className="text-[#71717a] leading-relaxed">
              Overage is 100% opt-in. If credits run out, new background extraction pauses while your already-generated cache and media continue serving. You can set an optional overage cap in your billing settings.
            </p>
          </div>
          <div>
            <h4 className="font-semibold text-[#171717] mb-1">
              Do I need to change my nameservers or DNS?
            </h4>
            <p className="text-[#71717a] leading-relaxed">
              No. WP Instant runs as a lightweight WordPress drop-in client paired with Cloudflare Workers. Your DNS and web host remain 100% unchanged.
            </p>
          </div>
          <div>
            <h4 className="font-semibold text-[#171717] mb-1">
              How does billing and subscription management work?
            </h4>
            <p className="text-[#71717a] leading-relaxed">
              Subscriptions are powered by Polar.sh. You can upgrade, downgrade, switch intervals, update cards, or download PDF VAT invoices at any time via the Polar customer portal.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
