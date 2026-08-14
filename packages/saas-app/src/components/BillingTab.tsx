import React from 'react';
import { Check, Sparkles, Zap, Shield, ExternalLink } from 'lucide-react';

interface BillingTabProps {
  siteCount: number;
  maxSites: number;
}

export const BillingTab: React.FC<BillingTabProps> = ({ siteCount, maxSites }) => {
  return (
    <div className="space-y-8 max-w-5xl mx-auto">
      <div>
        <h1 className="text-2xl font-extrabold text-slate-900">Subscription & Metering</h1>
        <p className="text-xs sm:text-sm text-slate-500">
          Managed via Polar.sh. Upgrade for additional WordPress slots and dedicated Puppeteer concurrency.
        </p>
      </div>

      {/* Seat Utilization Bar */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
        <div className="flex justify-between items-center mb-3">
          <div>
            <h3 className="text-sm font-bold text-slate-900">Active Site Seats</h3>
            <p className="text-xs text-slate-500">
              You are using {siteCount} of {maxSites} allocated site licenses.
            </p>
          </div>
          <span className="text-sm font-extrabold text-slate-900">
            {Math.round((siteCount / maxSites) * 100)}%
          </span>
        </div>

        <div className="w-full h-3 bg-slate-100 rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-sky-500 to-cyan-500 rounded-full transition-all"
            style={{ width: `${Math.min((siteCount / maxSites) * 100, 100)}%` }}
          />
        </div>
      </div>

      {/* Plan Tiers Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Starter */}
        <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Shield className="w-4 h-4 text-slate-500" />
              <span className="text-xs font-bold uppercase text-slate-500">Starter</span>
            </div>
            <div className="flex items-baseline gap-1 mb-4">
              <span className="text-3xl font-extrabold text-slate-900">$19</span>
              <span className="text-xs text-slate-500">/month</span>
            </div>
            <ul className="space-y-2.5 text-xs text-slate-600 mb-6">
              <li className="flex items-center gap-2">
                <Check className="w-4 h-4 text-emerald-500" />
                <span>Up to 5 WordPress Sites</span>
              </li>
              <li className="flex items-center gap-2">
                <Check className="w-4 h-4 text-emerald-500" />
                <span>Sub-15ms Static Disk Cache</span>
              </li>
              <li className="flex items-center gap-2">
                <Check className="w-4 h-4 text-emerald-500" />
                <span>Cloudflare Critical CSS Extraction</span>
              </li>
            </ul>
          </div>
          <button className="w-full py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-xl text-xs font-bold transition-colors">
            Current Plan
          </button>
        </div>

        {/* Pro */}
        <div className="bg-white rounded-3xl border-2 border-sky-500 p-6 shadow-lg shadow-sky-500/10 flex flex-col justify-between relative">
          <span className="absolute -top-3 left-1/2 -translate-x-1/2 bg-sky-500 text-white text-[10px] font-extrabold uppercase px-3 py-0.5 rounded-full shadow-sm">
            Most Popular
          </span>
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Zap className="w-4 h-4 text-sky-500" />
              <span className="text-xs font-bold uppercase text-sky-600">Pro</span>
            </div>
            <div className="flex items-baseline gap-1 mb-4">
              <span className="text-3xl font-extrabold text-slate-900">$49</span>
              <span className="text-xs text-slate-500">/month</span>
            </div>
            <ul className="space-y-2.5 text-xs text-slate-600 mb-6">
              <li className="flex items-center gap-2">
                <Check className="w-4 h-4 text-emerald-500" />
                <span>Up to 25 WordPress Sites</span>
              </li>
              <li className="flex items-center gap-2">
                <Check className="w-4 h-4 text-emerald-500" />
                <span>3-Tier JS Delay + jQuery Stubbing</span>
              </li>
              <li className="flex items-center gap-2">
                <Check className="w-4 h-4 text-emerald-500" />
                <span>Dynamic Nonce & Cart Micro-Hydration</span>
              </li>
              <li className="flex items-center gap-2">
                <Check className="w-4 h-4 text-emerald-500" />
                <span>W3C Speculation Rules Prerendering</span>
              </li>
            </ul>
          </div>
          <button className="w-full py-2.5 bg-sky-500 hover:bg-sky-400 text-slate-950 rounded-xl text-xs font-bold shadow-md shadow-sky-500/25 transition-all">
            Upgrade to Pro
          </button>
        </div>

        {/* Agency */}
        <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Sparkles className="w-4 h-4 text-amber-500" />
              <span className="text-xs font-bold uppercase text-amber-600">Agency</span>
            </div>
            <div className="flex items-baseline gap-1 mb-4">
              <span className="text-3xl font-extrabold text-slate-900">$149</span>
              <span className="text-xs text-slate-500">/month</span>
            </div>
            <ul className="space-y-2.5 text-xs text-slate-600 mb-6">
              <li className="flex items-center gap-2">
                <Check className="w-4 h-4 text-emerald-500" />
                <span>100 WordPress Sites</span>
              </li>
              <li className="flex items-center gap-2">
                <Check className="w-4 h-4 text-emerald-500" />
                <span>Dedicated Chromium Browser Concurrency</span>
              </li>
              <li className="flex items-center gap-2">
                <Check className="w-4 h-4 text-emerald-500" />
                <span>White-label WordPress Plugin Branding</span>
              </li>
            </ul>
          </div>
          <button className="w-full py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition-colors">
            Contact Sales
          </button>
        </div>
      </div>

      {/* Polar Customer Portal Link */}
      <div className="p-6 bg-slate-50 rounded-2xl border border-slate-200 flex justify-between items-center">
        <div>
          <h4 className="text-sm font-bold text-slate-900">Manage Payment Methods & Invoices</h4>
          <p className="text-xs text-slate-500">Update credit cards, download tax receipts, or cancel anytime.</p>
        </div>
        <a
          href="https://polar.sh"
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-1.5 text-xs font-bold text-sky-600 hover:text-sky-700 bg-white border border-slate-200 px-4 py-2 rounded-xl shadow-sm"
        >
          <span>Polar Portal</span>
          <ExternalLink className="w-3.5 h-3.5" />
        </a>
      </div>
    </div>
  );
};
