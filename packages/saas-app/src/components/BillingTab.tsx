'use client';

import React, { useState, useEffect } from 'react';
import { ExternalLink, Check, AlertTriangle, ShieldCheck, Zap } from 'lucide-react';
import { ExtendedSite, BillingStatusData } from '../types';
import { api } from '../services/api';
import { useAuth } from '@clerk/nextjs';

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
  const { getToken } = useAuth();
  const [isDowngradeModalOpen, setIsDowngradeModalOpen] = useState(false);

  const hasActivePlan = Boolean(billingData?.hasActivePlan);
  const plan = billingData?.plan;
  const planName = hasActivePlan ? plan?.name || 'Active Plan' : 'No Active Plan';
  const billingInterval = plan?.billingInterval || 'monthly';
  const priceMonthly = plan?.priceMonthly ?? 19;
  const maxSites = plan?.maxSites ?? 1;
  const usedSites = plan?.usedSites ?? sites.length;

  const monthlyCredits = plan?.monthlyCredits ?? plan?.maxRuns ?? 250;
  const creditsUsed = plan?.creditsUsed ?? plan?.usedRuns ?? 0;
  const creditsReserved = plan?.creditsReserved ?? 0;
  const creditsRemaining = plan?.creditsRemaining ?? Math.max(0, monthlyCredits - creditsUsed - creditsReserved);

  const monthlyPageviews = plan?.monthlyPageviews ?? 60_000;
  const pageviewsUsed = plan?.pageviewsUsed ?? 0;
  const monthlyBytes = plan?.monthlyBytes ?? 25 * 1024 * 1024 * 1024;
  const bytesUsed = plan?.bytesUsed ?? 0;

  const [overageEnabled, setOverageEnabled] = useState(Boolean(plan?.overageEnabled));
  const [overageLimit, setOverageLimit] = useState(plan?.overageLimitCredits ?? 500);
  const [isSavingOverage, setIsSavingOverage] = useState(false);

  useEffect(() => {
    if (plan?.overageEnabled !== undefined) {
      setOverageEnabled(Boolean(plan.overageEnabled));
    }
    if (plan?.overageLimitCredits !== undefined) {
      setOverageLimit(plan.overageLimitCredits);
    }
  }, [plan?.overageEnabled, plan?.overageLimitCredits]);

  const handleSaveOverage = async (newEnabled: boolean, newLimit: number) => {
    try {
      setIsSavingOverage(true);
      const token = await getToken();
      await api.updateOverage(token, newEnabled, newLimit);
      setOverageEnabled(newEnabled);
      setOverageLimit(newLimit);
      onToast(newEnabled ? `Opt-in overage enabled with ${newLimit.toLocaleString()} credit cap.` : 'Overage protection set to hard cap.');
    } catch (err: any) {
      onToast(err?.message || 'Failed to update overage settings');
    } finally {
      setIsSavingOverage(false);
    }
  };

  const customerEmail = billingData?.customer?.email || 'your account email';
  const subId = billingData?.subscription?.id || '—';

  const renewalDate = plan?.currentPeriodEnd
    ? new Date(plan.currentPeriodEnd * 1000).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      })
    : '—';

  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
  };

  return (
    <div className="space-y-8 animate-fade-in">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-[#171717]">
          Billing & usage
        </h1>
        <p className="text-[13.5px] text-[#71717a] mt-0.5">
          Managed via Polar.sh · Renews {renewalDate} ({billingInterval})
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
                <div className="flex items-baseline gap-2 mt-1">
                  <p className="font-mono text-base text-[#3f3f46]">
                    ${hasActivePlan ? priceMonthly : 0}
                    <span className="text-xs text-[#71717a]">/mo</span>
                  </p>
                  {billingInterval === 'annual' && hasActivePlan && (
                    <span className="font-mono text-[11px] text-[#16a34a] font-medium">
                      (Billed annually with 20% savings)
                    </span>
                  )}
                </div>
              </div>
              <span className={`chip ${hasActivePlan ? 'chip-success' : 'chip-neutral'}`}>
                {hasActivePlan && <span className="chip-dot" />}
                {hasActivePlan ? 'Active' : 'Inactive'}
              </span>
            </div>

            <p className="meta mt-3 mb-4">
              Subscription ID: <code>{hasActivePlan ? subId : 'None'}</code>
            </p>

            <ul className="space-y-2 text-[13.5px] text-[#3f3f46]">
              <li className="flex items-center gap-2.5">
                <Check className="w-4 h-4 text-[#16a34a] flex-none" />
                <span>{hasActivePlan ? maxSites : '—'} production site slots</span>
              </li>
              <li className="flex items-center gap-2.5">
                <Check className="w-4 h-4 text-[#16a34a] flex-none" />
                <span>{hasActivePlan ? monthlyCredits.toLocaleString() : '—'} optimization credits / month (1 URL + 1 viewport per credit)</span>
              </li>
              <li className="flex items-center gap-2.5">
                <Check className="w-4 h-4 text-[#16a34a] flex-none" />
                <span>{hasActivePlan ? (plan?.maxConcurrentJobs ?? 1) : '—'} concurrent headless extraction jobs</span>
              </li>
              <li className="flex items-center gap-2.5">
                <Check className="w-4 h-4 text-[#16a34a] flex-none" />
                <span>Sub-15ms advanced-cache.php drop-in + zero-egress R2 media</span>
              </li>
            </ul>
          </div>

          <div className="pt-6 mt-6 border-t border-[#f1f1f2] flex items-center gap-3">
            {billingData?.hasActivePlan ? (
              <>
                <button onClick={onOpenPortal} className="btn btn-secondary text-xs sm:text-[13px]">
                  <span>Manage on Polar</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </button>
                <button onClick={onNavigateToPricing} className="btn btn-ghost text-xs sm:text-[13px]">
                  Change plan
                </button>
              </>
            ) : (
              <button onClick={onNavigateToPricing} className="btn btn-primary text-xs sm:text-[13px]">
                Choose a Plan & Activate →
              </button>
            )}
          </div>
        </div>

        {/* Customer Details Card (1 col) */}
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
            <p className="font-mono text-xs text-[#71717a] mt-2">
              Billing Interval: <span className="capitalize">{billingInterval}</span>
            </p>
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

      {/* Row 2: Optimization Credits Meter */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-[15px] font-semibold tracking-tight text-[#171717]">
            Optimization credits · {creditsUsed.toLocaleString()} of {monthlyCredits.toLocaleString()} used
          </h2>
          <span className="meta">{creditsRemaining.toLocaleString()} credits remaining · Resets {renewalDate}</span>
        </div>

        <div className="bg-white border border-[#e4e4e7] rounded-2xl p-6 shadow-sm space-y-4">
          <div className="flex items-baseline justify-between">
            <p className="font-mono text-3xl font-semibold text-[#171717]">
              {creditsUsed.toLocaleString()}{' '}
              <span className="text-base font-normal text-[#71717a]">/ {monthlyCredits.toLocaleString()}</span>
            </p>
            <div className="flex items-center gap-2">
              {creditsReserved > 0 && (
                <span className="chip chip-warn">
                  <span className="chip-dot" />
                  {creditsReserved} in progress
                </span>
              )}
              <span className="meta">1 URL + 1 viewport = 1 credit</span>
            </div>
          </div>

          <div className="h-3 rounded-full bg-[#f1f1f2] overflow-hidden">
            <div
              className="h-full bg-[#171717] rounded-full transition-all duration-700"
              style={{ width: `${Math.min(100, Math.round(((creditsUsed + creditsReserved) / Math.max(1, monthlyCredits)) * 100))}%` }}
            />
          </div>

          {/* Opt-in Overage Protection Box */}
          <div className="pt-4 border-t border-[#f1f1f2] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-[#16a34a]" />
                <h3 className="text-sm font-semibold text-[#171717]">Opt-in Overage Protection</h3>
              </div>
              <p className="text-xs text-[#71717a] mt-0.5">
                {overageEnabled
                  ? `Allowed to run up to ${overageLimit.toLocaleString()} additional credits beyond monthly allowance.`
                  : 'Disabled. Optimization pauses when allowance is reached while existing cache continues serving.'}
              </p>
            </div>

            <div className="flex items-center gap-3 flex-none">
              {overageEnabled && (
                <div className="flex items-center gap-1.5">
                  <label className="text-xs font-mono text-[#71717a]">Cap:</label>
                  <input
                    type="number"
                    min="50"
                    step="50"
                    max="10000"
                    value={overageLimit}
                    onChange={(e) => setOverageLimit(Math.max(10, Number(e.target.value)))}
                    className="w-20 px-2 py-1 text-xs font-mono border border-[#e4e4e7] rounded-lg bg-white"
                  />
                </div>
              )}

              <button
                disabled={isSavingOverage}
                onClick={() => handleSaveOverage(!overageEnabled, overageLimit)}
                className={`btn text-xs py-1.5 px-3 ${
                  overageEnabled ? 'btn-secondary' : 'btn-primary'
                }`}
              >
                {overageEnabled ? 'Disable Overage' : 'Enable Overage'}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Row 3: Traffic Quotas & Activity */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-[15px] font-semibold tracking-tight text-[#171717]">
            Contractual traffic quotas
          </h2>
          <span className="chip chip-neutral text-[10px]">reported by drop-in & edge</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-white border border-[#e4e4e7] rounded-2xl p-5 shadow-sm space-y-2">
            <span className="text-xs font-medium text-[#71717a]">Monthly Pageviews</span>
            <p className="font-mono text-2xl font-semibold text-[#171717]">
              {pageviewsUsed.toLocaleString()}{' '}
              <span className="text-xs font-normal text-[#71717a]">/ {monthlyPageviews.toLocaleString()}</span>
            </p>
            <div className="h-2 rounded-full bg-[#f1f1f2] overflow-hidden">
              <div
                className="h-full bg-[#3b82f6] rounded-full transition-all duration-700"
                style={{ width: `${Math.min(100, Math.round((pageviewsUsed / Math.max(1, monthlyPageviews)) * 100))}%` }}
              />
            </div>
          </div>

          <div className="bg-white border border-[#e4e4e7] rounded-2xl p-5 shadow-sm space-y-2">
            <span className="text-xs font-medium text-[#71717a]">Monthly Edge Bandwidth</span>
            <p className="font-mono text-2xl font-semibold text-[#171717]">
              {formatBytes(bytesUsed)}{' '}
              <span className="text-xs font-normal text-[#71717a]">/ {formatBytes(monthlyBytes)}</span>
            </p>
            <div className="h-2 rounded-full bg-[#f1f1f2] overflow-hidden">
              <div
                className="h-full bg-[#10b981] rounded-full transition-all duration-700"
                style={{ width: `${Math.min(100, Math.round((bytesUsed / Math.max(1, monthlyBytes)) * 100))}%` }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Row 4: Site Slots Allocation */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-[15px] font-semibold tracking-tight text-[#171717]">
            Site slots · {usedSites} of {maxSites} used
          </h2>
          <span className="meta">{Math.max(0, maxSites - usedSites)} slots available</span>
        </div>

        <div className="bg-white border border-[#e4e4e7] rounded-2xl p-6 shadow-sm">
          <div
            className="grid gap-1.5 mb-6"
            style={{ gridTemplateColumns: `repeat(${Math.max(1, maxSites)}, minmax(0, 1fr))` }}
          >
            {Array.from({ length: Math.max(1, maxSites) }).map((_, i) => (
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

      {/* Row 5: Plan Comparison Table */}
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
                <th className="w-1/5">Features</th>
                <th className="w-1/5">Starter</th>
                <th className="w-1/5">Growth</th>
                <th className="w-1/5 bg-[#fff1ef] border-t-2 border-[#f03e2f]">
                  <span className="font-mono text-[10px] uppercase text-[#f03e2f] bg-white px-2 py-0.5 rounded-full border border-red-200">
                    Most Popular
                  </span>
                  <div className="mt-1">Agency</div>
                </th>
                <th className="w-1/5">Scale</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="font-medium text-[#171717]">Monthly Price</td>
                <td className="font-mono">$19/mo</td>
                <td className="font-mono">$49/mo</td>
                <td className="font-mono bg-[#fff1ef]/40 font-bold">$129/mo</td>
                <td className="font-mono">Custom from $299</td>
              </tr>
              <tr>
                <td className="font-medium text-[#171717]">Annual Equivalent</td>
                <td className="font-mono text-[#16a34a]">$15.20/mo ($182.40/yr)</td>
                <td className="font-mono text-[#16a34a]">$39.20/mo ($470.40/yr)</td>
                <td className="font-mono bg-[#fff1ef]/40 font-bold text-[#16a34a]">$103.20/mo ($1,238.40/yr)</td>
                <td className="font-mono">Contractual</td>
              </tr>
              <tr>
                <td className="font-medium text-[#171717]">Site slots</td>
                <td className="font-mono">1</td>
                <td className="font-mono">5</td>
                <td className="font-mono bg-[#fff1ef]/40 font-bold">25 ($5.16/site)</td>
                <td className="font-mono">100+</td>
              </tr>
              <tr>
                <td className="font-medium text-[#171717]">Optimization credits / mo</td>
                <td className="font-mono">250</td>
                <td className="font-mono">1,500</td>
                <td className="font-mono bg-[#fff1ef]/40 font-bold">6,000</td>
                <td className="font-mono">40,000+</td>
              </tr>
              <tr>
                <td className="font-medium text-[#171717]">Concurrent workers</td>
                <td className="font-mono">1</td>
                <td className="font-mono">3</td>
                <td className="font-mono bg-[#fff1ef]/40 font-bold">8</td>
                <td className="font-mono">20</td>
              </tr>
              <tr>
                <td className="font-medium text-[#171717]">Automated crawl</td>
                <td className="text-[#a1a1aa]">Manual URL</td>
                <td className="font-mono">250 pages</td>
                <td className="font-mono bg-[#fff1ef]/40 font-bold">1,500 pages</td>
                <td className="font-mono">5,000+ pages</td>
              </tr>
              <tr>
                <td className="font-medium text-[#171717]">Contractual traffic</td>
                <td className="font-mono">60k pv / 25 GB</td>
                <td className="font-mono">250k pv / 100 GB</td>
                <td className="font-mono bg-[#fff1ef]/40 font-bold">1.2M pv / 400 GB</td>
                <td className="font-mono">4M+ pv / 1.5 TB</td>
              </tr>
              <tr>
                <td className="font-medium text-[#171717]">Multi-seat team access</td>
                <td className="text-[#a1a1aa]">—</td>
                <td className="text-[#a1a1aa]">—</td>
                <td className="bg-[#fff1ef]/40"><Check className="w-4 h-4 text-[#16a34a]" /></td>
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
                <td>
                  <button
                    onClick={() => onNavigateToPricing()}
                    className="btn btn-ghost text-xs"
                  >
                    Select Growth
                  </button>
                </td>
                <td className="bg-[#fff1ef]/40">
                  <button onClick={() => onNavigateToPricing()} className="btn btn-primary text-xs">
                    Select Agency
                  </button>
                </td>
                <td>
                  <button
                    onClick={() => onToast("Scale sales request initiated")}
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
