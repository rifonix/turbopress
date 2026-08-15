'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { Check, Zap, ArrowLeft, Play, Copy, RefreshCw, ExternalLink } from 'lucide-react';
import type { OptimizationJobItem } from '../types';

interface OnboardingFlowProps {
  hasActivePlan?: boolean;
  isVerifyingPurchase?: boolean;
  planName?: string;
  jobs?: OptimizationJobItem[];
  onComplete: () => void;
  onSelectPlan: (planId: string, interval: 'monthly' | 'annual', returnTo?: string) => void;
  onCreateSite: (domain: string) => Promise<{ apiKey?: string; siteId?: string } | void>;
  onRunOptimization: (domain: string) => Promise<void>;
  onToast: (msg: string, type?: 'success' | 'info' | 'error') => void;
}

type Step = 1 | 2 | 3 | 4;

function normalizeDomain(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .replace(/\/.*$/, '')
    .replace(/:\d+$/, '');
}

export const OnboardingFlow: React.FC<OnboardingFlowProps> = ({
  hasActivePlan = false,
  isVerifyingPurchase = false,
  planName,
  jobs = [],
  onComplete,
  onSelectPlan,
  onCreateSite,
  onRunOptimization,
  onToast,
}) => {
  const [step, setStep] = useState<Step>(hasActivePlan ? 2 : 1);
  const [billingInterval, setBillingInterval] = useState<'monthly' | 'annual'>('monthly');
  const [siteDomain, setSiteDomain] = useState('');
  const [isRegistering, setIsRegistering] = useState(false);
  const [siteCredentials, setSiteCredentials] = useState<{ apiKey?: string; siteId?: string } | null>(null);
  const [isLaunching, setIsLaunching] = useState(false);
  const [jobDispatched, setJobDispatched] = useState(false);
  const [copied, setCopied] = useState(false);

  // Latest job for the connected domain (context refreshes jobs while any are active)
  const latestJob = useMemo(() => {
    if (!siteDomain) return null;
    const matches = jobs.filter(
      (j) => normalizeDomain(j.siteDomain || j.url || '') === normalizeDomain(siteDomain)
    );
    if (matches.length === 0) return null;
    return matches.reduce((latest, j) =>
      new Date(j.createdAt).getTime() > new Date(latest.createdAt).getTime() ? j : latest
    );
  }, [jobs, siteDomain]);

  // Advance to the success step once the first optimization run completes
  useEffect(() => {
    if (step === 3 && latestJob?.status === 'completed') {
      setJobDispatched(false);
      setIsLaunching(false);
      setStep(4);
    }
  }, [step, latestJob?.status]);

  const handleRegisterSite = async () => {
    const domain = normalizeDomain(siteDomain);
    if (!domain || !domain.includes('.') || domain.includes(' ')) {
      onToast('Enter a valid domain like example.com', 'error');
      return;
    }
    if (!hasActivePlan) {
      onToast('Activate a plan first to connect your site', 'error');
      setStep(1);
      return;
    }
    setIsRegistering(true);
    const result = await onCreateSite(domain);
    setIsRegistering(false);
    if (result) {
      setSiteCredentials(result);
      setSiteDomain(domain);
    }
  };

  const handleLaunchOptimization = async () => {
    setIsLaunching(true);
    setJobDispatched(true);
    await onRunOptimization(normalizeDomain(siteDomain));
    setIsLaunching(false);
  };

  const handleCopyKey = async () => {
    if (!siteCredentials?.apiKey) return;
    try {
      await navigator.clipboard.writeText(siteCredentials.apiKey);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      onToast('Copy failed — select the key manually', 'error');
    }
  };

  const stepLabels = ['Plan', 'Connect', 'Optimize', 'Done'];

  return (
    <div className="max-w-2xl mx-auto space-y-8 animate-fade-in py-4">
      {/* Progress header */}
      <div className="flex items-center justify-between border-b border-[#e4e4e7] pb-4">
        <div className="flex items-center gap-2 text-xs font-mono text-[#71717a]">
          <span className="w-2 h-2 rounded-full bg-[#f03e2f] animate-pulse" />
          <strong className="text-[#171717]">TurboPress Onboarding</strong>
          <span className="hidden sm:inline">· Step {step} of 4</span>
        </div>
        {hasActivePlan && (
          <button
            onClick={onComplete}
            className="text-[#71717a] hover:text-[#171717] underline text-xs"
          >
            Skip to Dashboard →
          </button>
        )}
      </div>

      {/* Step rail */}
      <div className="flex items-center gap-1.5">
        {stepLabels.map((label, i) => {
          const idx = i + 1;
          const isDone = step > idx;
          const isCurrent = step === idx;
          return (
            <React.Fragment key={label}>
              {i > 0 && (
                <div
                  className={`flex-1 h-0.5 rounded-full ${step > i ? 'bg-[#16a34a]' : 'bg-[#e4e4e7]'}`}
                />
              )}
              <div className="flex items-center gap-1.5">
                <span
                  className={`w-5 h-5 rounded-full grid place-items-center text-[9px] font-mono font-bold ${
                    isDone
                      ? 'bg-[#16a34a] text-white'
                      : isCurrent
                      ? 'bg-[#171717] text-white'
                      : 'bg-[#e4e4e7] text-[#71717a]'
                  }`}
                >
                  {isDone ? <Check className="w-3 h-3" /> : idx}
                </span>
                <span
                  className={`text-[11px] font-medium hidden sm:block ${
                    isCurrent ? 'text-[#171717]' : 'text-[#a1a1aa]'
                  }`}
                >
                  {label}
                </span>
              </div>
            </React.Fragment>
          );
        })}
      </div>

      {/* STEP 1: PLAN */}
      {step === 1 && (
        <div className="bg-white border border-[#e4e4e7] rounded-2xl p-6 sm:p-8 shadow-sm space-y-6">
          <div className="space-y-1.5 text-center sm:text-left">
            <span className="font-mono text-[10px] font-bold uppercase tracking-wider bg-[#fff1ef] text-[#f03e2f] px-2.5 py-0.5 rounded-full">
              Step 1
            </span>
            <h2 className="text-2xl font-semibold tracking-tight text-[#171717]">
              {isVerifyingPurchase
                ? 'Confirming your purchase…'
                : hasActivePlan
                ? 'Your TurboPress Plan is Active'
                : 'Choose your TurboPress Plan'}
            </h2>
            <p className="text-[13.5px] text-[#71717a]">
              {isVerifyingPurchase
                ? 'Hang tight — Polar is activating your subscription. This page unlocks automatically.'
                : hasActivePlan
                ? `${planName || 'Your plan'} is ready for 1-Click Zero-DNS edge optimization.`
                : 'An active plan is required to connect your WordPress site and unlock sub-15ms edge caching.'}
            </p>
          </div>

          {isVerifyingPurchase ? (
            <div className="p-8 rounded-2xl border border-[#e4e4e7] bg-[#f8f8f7] flex flex-col items-center gap-4">
              <div className="w-10 h-10 rounded-full border-[3px] border-[#171717] border-t-transparent animate-spin" />
              <p className="text-xs font-mono text-[#71717a]">
                Waiting for payment confirmation…
              </p>
            </div>
          ) : hasActivePlan ? (
            <div className="p-6 rounded-2xl border border-[#dcfce7] bg-[#f0fdf4] space-y-4">
              <div className="flex items-center gap-3">
                <span className="w-8 h-8 rounded-full bg-[#16a34a] text-white flex items-center justify-center">
                  <Check className="w-5 h-5" />
                </span>
                <div>
                  <h3 className="font-semibold text-sm text-[#166534]">Active Subscription Confirmed</h3>
                  <p className="text-xs text-[#15803d]">You are ready to connect your WordPress site.</p>
                </div>
              </div>
              <button
                onClick={() => setStep(2)}
                className="w-full btn btn-primary py-2.5 text-xs font-semibold"
              >
                Continue to Connect WordPress Site →
              </button>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-center sm:justify-start gap-3 pt-1">
                <span
                  className={`text-xs font-medium ${
                    billingInterval === 'monthly' ? 'text-[#171717]' : 'text-[#71717a]'
                  }`}
                >
                  Monthly
                </span>
                <button
                  onClick={() =>
                    setBillingInterval(billingInterval === 'monthly' ? 'annual' : 'monthly')
                  }
                  className={`w-11 h-6 rounded-full p-1 transition-colors border ${
                    billingInterval === 'annual'
                      ? 'bg-[#171717] border-[#171717]'
                      : 'bg-[#e4e4e7] border-[#d4d4d8]'
                  }`}
                >
                  <div
                    className={`w-4 h-4 rounded-full bg-white transition-transform ${
                      billingInterval === 'annual' ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
                <span
                  className={`text-xs font-medium ${
                    billingInterval === 'annual' ? 'text-[#171717]' : 'text-[#71717a]'
                  }`}
                >
                  Annual <span className="text-[#16a34a] font-bold">(Save 20%)</span>
                </span>
              </div>

              <div className="p-6 rounded-2xl border-2 border-[#f03e2f] bg-[#fff1ef]/30 space-y-4 relative">
                <span className="font-mono text-[10px] font-bold uppercase tracking-wider bg-[#f03e2f] text-white px-2.5 py-0.5 rounded-full absolute top-4 right-4">
                  Recommended
                </span>
                <div>
                  <h3 className="text-lg font-semibold text-[#171717]">TurboPress Starter</h3>
                  <div className="flex items-baseline gap-1 mt-3">
                    <span className="font-mono text-3xl font-bold text-[#171717]">
                      ${billingInterval === 'monthly' ? '19' : '15'}
                    </span>
                    <span className="font-mono text-xs text-[#71717a]">/ month</span>
                  </div>
                </div>

                <ul className="space-y-2 text-xs text-[#3f3f46]">
                  <li className="flex items-center gap-2">
                    <Check className="w-3.5 h-3.5 text-[#16a34a] flex-none" />
                    <span>1 Production WordPress site slot</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="w-3.5 h-3.5 text-[#16a34a] flex-none" />
                    <span>Unlimited free local and staging seats</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="w-3.5 h-3.5 text-[#16a34a] flex-none" />
                    <span>200 Cloudflare Chromium Puppeteer runs / month</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="w-3.5 h-3.5 text-[#16a34a] flex-none" />
                    <span>Sub-15ms advanced-cache.php drop-in caching</span>
                  </li>
                </ul>

                <button
                  onClick={() => onSelectPlan('starter', billingInterval, '/onboarding')}
                  className="w-full btn btn-primary py-2.5 text-xs font-semibold"
                >
                  Activate Starter Plan via Polar Checkout →
                </button>

                <p className="text-center text-xs text-[#71717a]">
                  Need more sites or runs?{' '}
                  <a href="/pricing" className="text-[#f03e2f] underline font-medium">
                    Compare all plans →
                  </a>
                </p>
              </div>
            </>
          )}
        </div>
      )}

      {/* STEP 2: CONNECT */}
      {step === 2 && (
        <div className="bg-white border border-[#e4e4e7] rounded-2xl p-6 sm:p-8 shadow-sm space-y-6">
          <div className="space-y-1.5">
            <span className="font-mono text-[10px] font-bold uppercase tracking-wider bg-[#f4f4f5] text-[#71717a] px-2.5 py-0.5 rounded-full">
              Step 2
            </span>
            <h2 className="text-2xl font-semibold tracking-tight text-[#171717]">
              Connect your WordPress Site
            </h2>
            <p className="text-[13.5px] text-[#71717a]">
              Register your domain to generate an API key, then pair the TurboPress plugin.
            </p>
          </div>

          {!siteCredentials ? (
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-[#3f3f46] mb-1">
                  Your Website Domain
                </label>
                <input
                  type="text"
                  value={siteDomain}
                  onChange={(e) => setSiteDomain(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleRegisterSite()}
                  placeholder="example.com"
                  disabled={isRegistering}
                  className="w-full px-3.5 py-2.5 bg-white border border-[#e4e4e7] rounded-lg text-xs font-mono text-[#171717] focus:outline-none focus:border-[#f03e2f] disabled:opacity-60"
                />
                <p className="text-[11px] text-[#a1a1aa] mt-1.5">
                  Just the bare domain — we handle the rest (no https:// or paths needed).
                </p>
              </div>

              <button
                onClick={handleRegisterSite}
                disabled={isRegistering || !siteDomain.trim()}
                className="btn btn-primary text-xs px-5 py-2.5 w-full sm:w-auto disabled:opacity-50"
              >
                {isRegistering ? (
                  <>
                    <div className="w-3.5 h-3.5 rounded-full border-2 border-white border-t-transparent animate-spin" />
                    Connecting to Edge…
                  </>
                ) : (
                  'Connect Site →'
                )}
              </button>
            </div>
          ) : (
            <div className="space-y-4 animate-fade-in">
              <div className="flex items-center gap-3 p-3.5 rounded-xl border border-[#dcfce7] bg-[#f0fdf4]">
                <span className="w-7 h-7 rounded-full bg-[#16a34a] text-white grid place-items-center flex-none">
                  <Check className="w-4 h-4" />
                </span>
                <div>
                  <p className="text-xs font-semibold text-[#166534]">
                    {siteDomain} connected to TurboPress Edge
                  </p>
                  <p className="text-[11px] text-[#15803d]">
                    Edge zone provisioned · drop-in cache armed
                  </p>
                </div>
              </div>

              <div className="space-y-2">
                <label className="block text-xs font-medium text-[#3f3f46]">
                  Your API License Key {siteCredentials.apiKey ? '' : '(visible in Site Settings)'}
                </label>
                {siteCredentials.apiKey ? (
                  <div className="flex gap-2">
                    <code className="flex-1 px-3.5 py-2.5 bg-[#f8f8f7] border border-[#e4e4e7] rounded-lg text-[11px] font-mono text-[#171717] break-all">
                      {siteCredentials.apiKey}
                    </code>
                    <button
                      onClick={handleCopyKey}
                      className="btn btn-secondary text-xs px-3 flex-none"
                      title="Copy API key"
                    >
                      {copied ? <Check className="w-3.5 h-3.5 text-[#16a34a]" /> : <Copy className="w-3.5 h-3.5" />}
                      {copied ? 'Copied' : 'Copy'}
                    </button>
                  </div>
                ) : (
                  <p className="text-xs text-[#71717a]">
                    Manage keys from the site detail page after onboarding.
                  </p>
                )}
              </div>

              <div className="p-4 bg-[#f8f8f7] border border-[#e4e4e7] rounded-xl space-y-2 text-xs text-[#3f3f46]">
                <p className="font-semibold text-[#171717]">Finish pairing in WordPress:</p>
                <ol className="list-decimal pl-4 space-y-1">
                  <li>
                    Download <code>turbopress-optimizer.zip</code> and upload it under WordPress →
                    Plugins → Add New.
                  </li>
                  <li>Activate the plugin, then open TurboPress settings.</li>
                  <li>
                    Paste the API key above — or just click{' '}
                    <strong>1-Click Connect to TurboPress</strong> inside the plugin.
                  </li>
                </ol>
              </div>
            </div>
          )}

          <div className="flex justify-between items-center pt-4 border-t border-[#f1f1f2]">
            <button onClick={() => setStep(1)} className="btn btn-ghost text-xs">
              <ArrowLeft className="w-3.5 h-3.5 mr-1" /> Back
            </button>
            <button
              onClick={() => setStep(3)}
              disabled={!siteCredentials}
              className="btn btn-primary text-xs px-5 disabled:opacity-50"
            >
              Continue to Optimization →
            </button>
          </div>
        </div>
      )}

      {/* STEP 3: FIRST OPTIMIZATION */}
      {step === 3 && (
        <div className="bg-white border border-[#e4e4e7] rounded-2xl p-6 sm:p-8 shadow-sm space-y-6 text-center">
          <div className="w-12 h-12 rounded-2xl bg-[#fff1ef] text-[#f03e2f] grid place-items-center mx-auto">
            <Zap className="w-6 h-6 fill-current" />
          </div>

          <div className="space-y-1.5">
            <span className="font-mono text-[10px] font-bold uppercase tracking-wider bg-[#f4f4f5] text-[#71717a] px-2.5 py-0.5 rounded-full">
              Step 3
            </span>
            <h2 className="text-2xl font-semibold tracking-tight text-[#171717]">
              Extract Critical CSS & Warm Edge Cache
            </h2>
            <p className="text-[13.5px] text-[#71717a] max-w-md mx-auto">
              Cloudflare Browser Rendering (Puppeteer) will inspect{' '}
              <code className="text-[#171717]">{siteDomain}</code> for the first time.
            </p>
          </div>

          {jobDispatched && latestJob ? (
            <div className="space-y-3 max-w-sm mx-auto py-2">
              {latestJob.status === 'completed' ? (
                <p className="text-xs font-mono text-[#16a34a]">Optimization complete — finishing up…</p>
              ) : latestJob.status === 'failed' ? (
                <div className="space-y-3">
                  <p className="text-xs font-mono text-[#f03e2f]">
                    Run failed: {latestJob.errorMessage || 'worker error'}
                  </p>
                  <button
                    onClick={handleLaunchOptimization}
                    className="btn btn-secondary text-xs"
                  >
                    <RefreshCw className="w-3.5 h-3.5 mr-1" /> Retry Optimization
                  </button>
                </div>
              ) : (
                <>
                  <div className="flex justify-between font-mono text-xs text-[#71717a]">
                    <span>
                      {latestJob.status === 'queued'
                        ? 'Queued on Cloudflare Workers…'
                        : 'Rendering pages & extracting critical CSS…'}
                    </span>
                    <span className="capitalize">{latestJob.status}</span>
                  </div>
                  <div className="h-2 rounded-full bg-[#f1f1f2] overflow-hidden relative">
                    <div className="h-full w-1/3 bg-[#f03e2f] rounded-full animate-[loadingbar_1.4s_ease-in-out_infinite]" />
                  </div>
                  <p className="text-[11px] text-[#a1a1aa]">
                    This typically takes 30–90 seconds. You can keep this tab open.
                  </p>
                </>
              )}
            </div>
          ) : jobDispatched && !latestJob ? (
            <div className="space-y-3 max-w-sm mx-auto py-2">
              <div className="w-8 h-8 rounded-full border-[3px] border-[#171717] border-t-transparent animate-spin mx-auto" />
              <p className="font-mono text-xs text-[#71717a]">Dispatching optimization run…</p>
            </div>
          ) : (
            <button
              onClick={handleLaunchOptimization}
              disabled={isLaunching}
              className="btn btn-primary text-xs py-2.5 px-6 shadow-md disabled:opacity-60"
            >
              {isLaunching ? (
                <>
                  <div className="w-3.5 h-3.5 rounded-full border-2 border-white border-t-transparent animate-spin" />
                  Dispatching…
                </>
              ) : (
                <>
                  <Play className="w-4 h-4 fill-current mr-1" />
                  Launch First Optimization Run
                </>
              )}
            </button>
          )}

          <div className="pt-4 border-t border-[#f1f1f2] text-left flex justify-between items-center">
            <button onClick={() => setStep(2)} className="btn btn-ghost text-xs">
              <ArrowLeft className="w-3.5 h-3.5 mr-1" /> Back
            </button>
            <button
              onClick={() => setStep(4)}
              className="text-[#71717a] hover:text-[#171717] underline text-xs flex items-center gap-1"
            >
              Skip for now <ExternalLink className="w-3 h-3" />
            </button>
          </div>
        </div>
      )}

      {/* STEP 4: COMPLETE */}
      {step === 4 && (
        <div className="bg-white border border-[#e4e4e7] rounded-2xl p-6 sm:p-8 shadow-sm space-y-6 text-center animate-fade-in">
          <div className="w-14 h-14 rounded-full bg-[#f0fdf4] border-2 border-[#16a34a] text-[#16a34a] grid place-items-center mx-auto">
            <Check className="w-7 h-7 stroke-[2.5]" />
          </div>

          <div className="space-y-1.5">
            <h2 className="text-2xl font-semibold tracking-tight text-[#171717]">
              You&apos;re all set!
            </h2>
            <p className="text-[13.5px] text-[#71717a] max-w-md mx-auto">
              {siteDomain ? (
                <>
                  <code>{siteDomain}</code> is connected
                  {latestJob?.status === 'completed'
                    ? ' and its first optimization run has warmed the edge cache.'
                    : '. Its first optimization run will finish in the Jobs queue.'}
                </>
              ) : (
                'Your TurboPress plan is active and the fleet dashboard is unlocked.'
              )}
            </p>
          </div>

          {latestJob?.status === 'completed' && (
            <div className="grid grid-cols-3 gap-3 p-4 bg-[#f8f8f7] border border-[#e4e4e7] rounded-xl max-w-md mx-auto font-mono text-center">
              <div>
                <span className="text-[10px] text-[#71717a] block uppercase">Critical CSS</span>
                <span className="text-xl font-bold text-[#16a34a]">
                  {latestJob.criticalCssSizeKb ? `${Math.round(latestJob.criticalCssSizeKb)}kb` : '—'}
                </span>
              </div>
              <div>
                <span className="text-[10px] text-[#71717a] block uppercase">Viewport</span>
                <span className="text-xl font-bold text-[#171717] capitalize">{latestJob.viewport}</span>
              </div>
              <div>
                <span className="text-[10px] text-[#71717a] block uppercase">Duration</span>
                <span className="text-xl font-bold text-[#171717]">
                  {latestJob.durationMs ? `${(latestJob.durationMs / 1000).toFixed(1)}s` : '—'}
                </span>
              </div>
            </div>
          )}

          <div className="pt-4">
            <button
              onClick={onComplete}
              className="btn btn-primary text-xs py-2.5 px-8 shadow-md"
            >
              Enter TurboPress Fleet Dashboard →
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
