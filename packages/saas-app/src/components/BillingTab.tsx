import React, { useState } from 'react';
import { ExternalLink, Check, AlertTriangle } from 'lucide-react';
import { ExtendedSite, BillingStatusData } from '../types';

interface BillingTabProps {
  sites: ExtendedSite[];
  billingData?: BillingStatusData | null;
  onOpenPortal: () => void;
  onNavigateToConnect: () => void;
  onNavigateToPricing: () => void;
  onToast: (msg: string) => void;
}

export const BillingTab: React.FC<BillingTabProps> = ({
  sites,
  billingData,
  onOpenPortal,
  onNavigateToConnect,
  onNavigateToPricing,
  onToast,
}) => {
  const [isDowngradeModalOpen, setIsDowngradeModalOpen] = useState(false);

  const planName = billingData?.plan?.name || 'Starter Plan';
  const priceMonthly = billingData?.plan?.priceMonthly || 19;
  const maxSites = billingData?.plan?.maxSites || 5;
  const usedSites = sites.length;
  const usedRuns = billingData?.plan?.usedRuns || 124;
  const maxRuns = billingData?.plan?.maxRuns || 2000;
  const customerEmail = billingData?.customer?.email || 'customer@turbopress.io';
  const subId = billingData?.subscription?.id || 'sub_active_prod';

  const renewalDate = billingData?.plan?.currentPeriodEnd
    ? new Date(billingData.plan.currentPeriodEnd * 1000).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      })
    : 'Sep 1, 2026';

  const months = [
    { m: 'Mar', v: 420 },
    { m: 'Apr', v: 610 },
    { m: 'May', v: 840 },
    { m: 'Jun', v: 1050 },
    { m: 'Jul', v: 1180 },
    { m: 'Aug', v: usedRuns },
  ];

  return (
    <div className="space-y-8 animate-fade-in">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-[#171717]">
          Billing & usage
        </h1>
        <p className="text-[13.5px] text-[#71717a] mt-0.5">
          Managed via Polar.sh · Renews {renewalDate}
        </p>
      </div>

      {/* Row 1: Current Plan & Payment Method Grid */}
      <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Current Plan Card (2 cols) */}
        <div className="md:col-span-2 bg-white border border-[#e4e4e7] rounded-2xl p-6 flex flex-col justify-between shadow-sm">
          <div>
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-2xl font-semibold tracking-tight text-[#171717]">
                  {planName}
                </h2>
                <p className="font-mono text-base text-[#3f3f46] mt-1">
                  ${priceMonthly}<span className="text-xs text-[#71717a]">/mo</span>
                </p>
              </div>
              <span className="chip chip-success">
                <span className="chip-dot" /> Active
              </span>
            </div>

            <p className="meta mt-3 mb-4">
              Subscription ID: <code>{subId}</code>
            </p>

            <ul className="space-y-2 text-[13.5px] text-[#3f3f46]">
              <li className="flex items-center gap-2.5">
                <Check className="w-4 h-4 text-[#16a34a] flex-none" />
                <span>{maxSites} production site slots</span>
              </li>
              <li className="flex items-center gap-2.5">
                <Check className="w-4 h-4 text-[#16a34a] flex-none" />
                <span>{maxRuns.toLocaleString()} edge worker runs / month</span>
              </li>
              <li className="flex items-center gap-2.5">
                <Check className="w-4 h-4 text-[#16a34a] flex-none" />
                <span>AVIF + Critical CSS Edge AST pipeline</span>
              </li>
              <li className="flex items-center gap-2.5">
                <Check className="w-4 h-4 text-[#16a34a] flex-none" />
                <span>Dedicated priority email support</span>
              </li>
            </ul>
          </div>

          <div className="pt-6 mt-6 border-t border-[#f1f1f2] flex items-center gap-3">
            <button onClick={onOpenPortal} className="btn btn-secondary text-xs sm:text-[13px]">
              <span>Manage on Polar</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </button>
            <button onClick={onNavigateToPricing} className="btn btn-ghost text-xs sm:text-[13px]">
              Change plan
            </button>
          </div>
        </div>

        {/* Payment Method Card (1 col) */}
        <div className="bg-white border border-[#e4e4e7] rounded-2xl p-6 flex flex-col justify-between shadow-sm">
          <div>
            <span className="text-[12.5px] text-[#71717a] font-medium block mb-3">
              Customer Details
            </span>
            <div className="flex items-center gap-3">
              <span className="w-10 h-7 rounded border border-[#e4e4e7] bg-[#f8f8f7] font-mono text-[10px] font-bold grid place-items-center text-[#171717]">
                POLAR
              </span>
              <span className="font-mono text-[14.5px] font-medium text-[#171717]">
                Secured
              </span>
            </div>
            <p className="font-mono text-xs text-[#71717a] mt-2">Prorated Billing</p>
            <p className="meta mt-4 text-[11.5px] truncate">
              Invoices sent to <code>{customerEmail}</code>
            </p>
          </div>

          <div className="pt-4 border-t border-[#f1f1f2]">
            <button onClick={onOpenPortal} className="btn btn-ghost text-xs w-full justify-start px-0">
              Open customer portal →
            </button>
          </div>
        </div>
      </section>

      {/* Row 2: Site Slots Allocation */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-[15px] font-semibold tracking-tight text-[#171717]">
            Site slots · {usedSites} of {maxSites} used
          </h2>
          <span className="meta">{Math.max(0, maxSites - usedSites)} slots available</span>
        </div>

        <div className="bg-white border border-[#e4e4e7] rounded-2xl p-6 shadow-sm">
          {/* Segmented Meter */}
          <div
            className="grid gap-1.5 mb-6"
            style={{ gridTemplateColumns: `repeat(${Math.max(5, maxSites)}, minmax(0, 1fr))` }}
          >
            {Array.from({ length: Math.max(5, maxSites) }).map((_, i) => (
              <span
                key={i}
                className={`h-4 rounded-sm border transition-all duration-300 ${
                  i < usedSites
                    ? 'bg-[#171717] border-[#171717]'
                    : 'bg-white border-[#e4e4e7]'
                }`}
              />
            ))}
          </div>

          {/* Allocation List */}
          <div className="divide-y divide-[#f1f1f2]">
            {sites.map((site, index) => (
              <div key={site.id} className="flex items-center gap-4 py-3 text-[13.5px]">
                <span className="font-mono text-xs text-[#71717a] w-20 flex-none">
                  slot {String(index + 1).padStart(2, '0')}
                </span>
                <span className="font-mono text-[13px] font-medium text-[#171717]">
                  {site.domain}
                </span>
                <div className="ml-auto flex items-center gap-3">
                  <span
                    className={`chip ${
                      site.status === 'optimized'
                        ? 'chip-success'
                        : site.status === 'optimizing'
                        ? 'chip-warn'
                        : site.status === 'attention'
                        ? 'chip-danger'
                        : 'chip-neutral'
                    }`}
                  >
                    {site.status !== 'disconnected' && <span className="chip-dot" />}
                    {site.status === 'optimized' ? 'Optimized' : site.status}
                  </span>
                  <button
                    onClick={() => onToast(`Slot configuration for ${site.domain}`)}
                    className="btn btn-ghost text-xs py-1 px-2 text-[#71717a] hover:text-[#dc2626]"
                  >
                    Active
                  </button>
                </div>
              </div>
            ))}

            {usedSites < maxSites && (
              <div className="flex items-center gap-4 py-3 text-[13.5px] text-[#71717a]">
                <span className="font-mono text-xs w-20 flex-none">
                  {String(usedSites + 1).padStart(2, '0')}–{String(maxSites).padStart(2, '0')}
                </span>
                <span>
                  {maxSites - usedSites} slot{maxSites - usedSites === 1 ? '' : 's'} available —{' '}
                  <button
                    onClick={onNavigateToConnect}
                    className="text-[#171717] font-medium underline hover:text-[#f03e2f]"
                  >
                    Connect site →
                  </button>
                </span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Row 3: Worker Runs Metering */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-[15px] font-semibold tracking-tight text-[#171717]">
            Worker runs
          </h2>
          <span className="meta">Overage: $0.04 per run beyond {maxRuns.toLocaleString()}</span>
        </div>

        <div className="bg-white border border-[#e4e4e7] rounded-2xl p-6 shadow-sm">
          <div className="flex items-baseline justify-between mb-3">
            <p className="font-mono text-3xl font-semibold text-[#171717]">
              {usedRuns}{' '}
              <span className="text-base font-normal text-[#71717a]">/ {maxRuns.toLocaleString()}</span>
            </p>
            <p className="meta">runs used · resets {renewalDate}</p>
          </div>

          <div className="h-3 rounded-full bg-[#f1f1f2] overflow-hidden my-4">
            <div
              className="h-full bg-[#171717] rounded-full transition-all duration-700"
              style={{ width: `${Math.min(100, Math.round((usedRuns / maxRuns) * 100))}%` }}
            />
          </div>

          {/* 6-Month Chart */}
          <div className="pt-6 border-t border-[#f1f1f2]">
            <svg viewBox="0 0 480 140" className="w-full h-32" role="img" aria-label="Worker runs chart">
              {months.map((d, i) => {
                const bw = 40;
                const step = 78;
                const x0 = 20;
                const max = maxRuns || 2000;
                const h = Math.max(8, (d.v / max) * 80);
                const x = x0 + i * step;
                const y = 100 - h;
                const isLatest = i === months.length - 1;

                return (
                  <g key={d.m}>
                    <rect
                      x={x}
                      y={y}
                      width={bw}
                      height={h}
                      rx="4"
                      fill={isLatest ? '#171717' : '#e4e4e7'}
                    />
                    <text
                      x={x + bw / 2}
                      y={y - 6}
                      textAnchor="middle"
                      fontFamily="monospace"
                      fontSize="10"
                      fill="#71717a"
                    >
                      {d.v}
                    </text>
                    <text
                      x={x + bw / 2}
                      y={120}
                      textAnchor="middle"
                      fontFamily="monospace"
                      fontSize="11"
                      fill="#71717a"
                    >
                      {d.m}
                    </text>
                  </g>
                );
              })}
            </svg>
          </div>
        </div>
      </div>

      {/* Row 4: Plan Comparison Table */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-[15px] font-semibold tracking-tight text-[#171717]">
            Compare plans
          </h2>
          <span className="meta">Switch anytime · Prorated via Polar</span>
        </div>

        <div className="bg-white border border-[#e4e4e7] rounded-2xl overflow-hidden shadow-sm">
          <table className="ds-table">
            <thead>
              <tr className="bg-[#fafafa]">
                <th className="w-1/4">Features</th>
                <th className="w-1/4">Starter</th>
                <th className="w-1/4 bg-[#fff1ef] border-t-2 border-[#f03e2f]">
                  <span className="font-mono text-[10px] uppercase text-[#f03e2f] bg-white px-2 py-0.5 rounded-full border border-red-200">
                    Popular
                  </span>
                  <div className="mt-1">Agency</div>
                </th>
                <th className="w-1/4">Enterprise</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="font-medium text-[#171717]">Price</td>
                <td className="font-mono">$19/mo</td>
                <td className="font-mono bg-[#fff1ef]/40 font-bold">$79/mo</td>
                <td className="font-mono">Custom</td>
              </tr>
              <tr>
                <td className="font-medium text-[#171717]">Site slots</td>
                <td className="font-mono">5</td>
                <td className="font-mono bg-[#fff1ef]/40 font-bold">25</td>
                <td className="font-mono">Unlimited</td>
              </tr>
              <tr>
                <td className="font-medium text-[#171717]">Worker runs/mo</td>
                <td className="font-mono">500</td>
                <td className="font-mono bg-[#fff1ef]/40 font-bold">2,000</td>
                <td className="font-mono">Custom</td>
              </tr>
              <tr>
                <td className="font-medium text-[#171717]">AVIF & Critical CSS</td>
                <td><Check className="w-4 h-4 text-[#16a34a]" /></td>
                <td className="bg-[#fff1ef]/40"><Check className="w-4 h-4 text-[#16a34a]" /></td>
                <td><Check className="w-4 h-4 text-[#16a34a]" /></td>
              </tr>
              <tr>
                <td className="font-medium text-[#171717]">Priority support</td>
                <td className="text-[#a1a1aa]">—</td>
                <td className="bg-[#fff1ef]/40"><Check className="w-4 h-4 text-[#16a34a]" /></td>
                <td><Check className="w-4 h-4 text-[#16a34a]" /></td>
              </tr>
              <tr>
                <td className="font-medium text-[#171717]">SSO & Custom SLA</td>
                <td className="text-[#a1a1aa]">—</td>
                <td className="bg-[#fff1ef]/40 text-[#a1a1aa]">—</td>
                <td><Check className="w-4 h-4 text-[#16a34a]" /></td>
              </tr>
            </tbody>
            <tfoot>
              <tr className="bg-[#fafafa]">
                <td />
                <td>
                  <button
                    onClick={() => onNavigateToPricing()}
                    className="btn btn-ghost text-xs"
                  >
                    Select Starter
                  </button>
                </td>
                <td className="bg-[#fff1ef]/40">
                  <button onClick={() => onNavigateToPricing()} className="btn btn-primary text-xs">
                    Upgrade to Agency
                  </button>
                </td>
                <td>
                  <button
                    onClick={() => onToast("We'll reach out within 24 hours")}
                    className="btn btn-secondary text-xs"
                  >
                    Contact sales
                  </button>
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* Downgrade Confirmation Dialog */}
      {isDowngradeModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-white rounded-2xl border border-[#e4e4e7] p-6 max-w-md w-full shadow-2xl space-y-4">
            <div className="flex items-center gap-3">
              <span className="w-9 h-9 rounded-xl bg-[#fef2f2] text-[#dc2626] grid place-items-center">
                <AlertTriangle className="w-5 h-5" />
              </span>
              <h3 className="text-base font-semibold text-[#171717]">Downgrade Plan?</h3>
            </div>
            <p className="text-[13px] text-[#71717a] leading-relaxed">
              Managing changes to your subscription plan can be performed securely directly inside the Polar Customer Portal.
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setIsDowngradeModalOpen(false)}
                className="btn btn-ghost text-xs"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  setIsDowngradeModalOpen(false);
                  onOpenPortal();
                }}
                className="btn btn-primary text-xs"
              >
                Open Polar Portal
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
