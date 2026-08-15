'use client';

import React, { useState } from 'react';
import { Check } from 'lucide-react';
import { POLAR_PRODUCT_IDS } from '../types';

interface PricingPageProps {
  onSelectPlan: (planId: string, interval: 'monthly' | 'annual') => void;
  onToast: (msg: string) => void;
}

export const PricingPage: React.FC<PricingPageProps> = ({ onSelectPlan, onToast }) => {
  const [interval, setInterval] = useState<'monthly' | 'annual'>('monthly');

  const plans = [
    {
      id: 'starter',
      productIdMonthly: POLAR_PRODUCT_IDS.starterMonthly,
      productIdYearly: POLAR_PRODUCT_IDS.starterYearly,
      name: 'TurboPress Starter',
      description: 'Perfect for single business sites and solo creators.',
      priceMonthly: 19,
      priceAnnual: 15,
      slots: '1 production site slot',
      runs: '200 optimization runs / mo',
      popular: true,
      features: [
        '1 WordPress site slot',
        'Free staging development seat',
        'Sub-15ms advanced-cache.php drop-in',
        'AST-enriched Critical CSS generator',
        '3-tier script delayer with jQuery stub',
        'Standard community support',
      ],
    },
    {
      id: 'pro',
      productIdMonthly: POLAR_PRODUCT_IDS.proMonthly,
      productIdYearly: POLAR_PRODUCT_IDS.proYearly,
      name: 'TurboPress Pro',
      description: 'For growing brands, WooCommerce stores, and power users.',
      priceMonthly: 49,
      priceAnnual: 39,
      slots: '5 production sites',
      runs: '1,000 optimization runs / mo',
      popular: false,
      features: [
        '5 WordPress site slots',
        'Unlimited free staging seats',
        'Dynamic nonces & cart micro-hydrator',
        'W3C Speculation Rules prerendering',
        'Automatic LCP fetchpriority preload',
        'WebP & AVIF negotiation pipeline',
        'Standard email support',
      ],
    },
    {
      id: 'agency',
      productIdMonthly: POLAR_PRODUCT_IDS.agencyMonthly,
      productIdYearly: POLAR_PRODUCT_IDS.agencyYearly,
      name: 'TurboPress Agency',
      description: 'For digital agencies and client fleet managers.',
      priceMonthly: 79,
      priceAnnual: 63,
      slots: '10 production sites',
      runs: '2,000 optimization runs / mo',
      popular: false,
      features: [
        '10 WordPress site slots ($7.90/site)',
        'Unlimited free staging seats',
        'Zero-egress R2 Critical CSS cache',
        'Cloudflare Browser Rendering pool',
        'Automated theme compatibility engine',
        'Multi-user team access',
        'Priority 24/7 email support',
      ],
    },
    {
      id: 'enterprise',
      productIdMonthly: 'prod_enterprise',
      productIdYearly: 'prod_enterprise',
      name: 'TurboPress Enterprise',
      description: 'For large publishing networks and high-traffic fleets.',
      priceMonthly: null,
      priceAnnual: null,
      slots: 'Unlimited sites',
      runs: 'Custom concurrency',
      popular: false,
      features: [
        'Unlimited WordPress site slots',
        'Dedicated Chromium browser cluster',
        'Custom 99.99% uptime SLA',
        'Custom domain CDN integration',
        'SAML SSO & Clerk Enterprise Auth',
        'Dedicated Slack/Teams channel',
      ],
    },
  ];

  return (
    <div className="space-y-12 animate-fade-in max-w-5xl mx-auto py-2">
      {/* Hero Header */}
      <div className="text-center space-y-3">
        <span className="font-mono text-xs font-semibold uppercase tracking-wider px-3 py-1 bg-[#fff1ef] text-[#f03e2f] rounded-full border border-red-200 inline-block">
          Predictable Edge Pricing
        </span>
        <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight text-[#171717]">
          High-performance WordPress optimization at scale
        </h1>
        <p className="text-[14.5px] text-[#71717a] max-w-xl mx-auto">
          No DNS changes, no proxy downtime, and no surprise overages. Choose the plan that fits your fleet.
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
        {plans.map((p) => {
          const price = interval === 'annual' ? p.priceAnnual : p.priceMonthly;
          const currentProductId = interval === 'annual' ? p.productIdYearly : p.productIdMonthly;

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
                <h3 className="text-lg font-semibold text-[#171717]">{p.name}</h3>
                <p className="text-xs text-[#71717a] mt-1 min-h-8 leading-snug">{p.description}</p>

                <div className="my-5 pb-5 border-b border-[#f1f1f2]">
                  {price !== null ? (
                    <div className="flex items-baseline gap-1">
                      <span className="font-mono text-3xl font-bold text-[#171717]">
                        ${price}
                      </span>
                      <span className="font-mono text-xs text-[#71717a]">/ month</span>
                    </div>
                  ) : (
                    <span className="font-mono text-2xl font-bold text-[#171717]">Custom</span>
                  )}
                  <p className="font-mono text-[11px] text-[#71717a] mt-1 truncate" title={currentProductId}>
                    {p.slots}
                  </p>
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
                    if (p.id === 'enterprise') {
                      onToast('Enterprise sales request submitted');
                    } else {
                      onSelectPlan(p.id, interval);
                    }
                  }}
                  className={`w-full btn text-xs ${
                    p.popular ? 'btn-primary' : 'btn-secondary'
                  }`}
                >
                  {p.id === 'enterprise' ? 'Contact Sales' : `Choose ${p.name}`}
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
              Do I need to change my nameservers or DNS?
            </h4>
            <p className="text-[#71717a] leading-relaxed">
              No. TurboPress runs as a lightweight WordPress drop-in client paired with Cloudflare Workers. Your DNS and web host remain 100% unchanged.
            </p>
          </div>
          <div>
            <h4 className="font-semibold text-[#171717] mb-1">
              Are staging or local domains charged?
            </h4>
            <p className="text-[#71717a] leading-relaxed">
              No. Staging environments (`staging.*`, `.test`, `.local`, `localhost`) connect to free development seats and never consume license slots.
            </p>
          </div>
          <div>
            <h4 className="font-semibold text-[#171717] mb-1">
              How does billing and subscription management work?
            </h4>
            <p className="text-[#71717a] leading-relaxed">
              Subscriptions are powered by Polar.sh. You can upgrade, downgrade, update cards, or download PDF VAT invoices at any time via the Polar customer portal.
            </p>
          </div>
          <div>
            <h4 className="font-semibold text-[#171717] mb-1">
              What happens if my site changes layouts or plugins?
            </h4>
            <p className="text-[#71717a] leading-relaxed">
              Whenever a post or template is updated in WordPress, our edge queue automatically re-extracts Critical CSS and warms the cache in the background.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
