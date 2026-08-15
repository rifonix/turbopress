'use client';

import React, { useState } from 'react';
import { Check, Zap, ArrowLeft, Play } from 'lucide-react';
import { POLAR_PRODUCT_IDS } from '../types';

interface OnboardingFlowProps {
  onComplete: () => void;
  onSelectPlan: (planId: string, interval: 'monthly' | 'annual') => void;
  onToast: (msg: string) => void;
}

export const OnboardingFlow: React.FC<OnboardingFlowProps> = ({
  onComplete,
  onSelectPlan,
  onToast,
}) => {
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [billingInterval, setBillingInterval] = useState<'monthly' | 'annual'>('monthly');
  const [siteDomain, setSiteDomain] = useState('my-wordpress-site.com');
  const [isWarming, setIsWarming] = useState(false);
  const [warmProgress, setWarmProgress] = useState(0);

  const handleStartWarmup = () => {
    setIsWarming(true);
    setWarmProgress(20);
    setTimeout(() => setWarmProgress(55), 800);
    setTimeout(() => setWarmProgress(85), 1600);
    setTimeout(() => {
      setWarmProgress(100);
      setIsWarming(false);
      onToast('Edge cache warmed! 98 Mobile PageSpeed achieved');
      setStep(4);
    }, 2400);
  };

  return (
    <div className="max-w-2xl mx-auto space-y-8 animate-fade-in py-4">
      {/* Onboarding Progress Bar */}
      <div className="flex items-center justify-between text-xs font-mono text-[#71717a] border-b border-[#e4e4e7] pb-3">
        <span className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-[#f03e2f] animate-pulse" />
          <strong className="text-[#171717]">TurboPress Onboarding</strong> · Step {step} of 4
        </span>
        <button
          onClick={onComplete}
          className="text-[#71717a] hover:text-[#171717] underline text-xs"
        >
          Skip to Dashboard →
        </button>
      </div>

      {/* STEP 1: CHOOSE PLAN & PURCHASE */}
      {step === 1 && (
        <div className="bg-white border border-[#e4e4e7] rounded-2xl p-6 sm:p-8 shadow-sm space-y-6">
          <div className="space-y-1.5 text-center sm:text-left">
            <span className="font-mono text-[10px] font-bold uppercase tracking-wider bg-[#fff1ef] text-[#f03e2f] px-2.5 py-0.5 rounded-full">
              Step 1
            </span>
            <h2 className="text-2xl font-semibold tracking-tight text-[#171717]">
              Choose your TurboPress Plan
            </h2>
            <p className="text-[13.5px] text-[#71717a]">
              Instant access to sub-15ms edge caching and Chromium Critical CSS pipeline.
            </p>
          </div>

          {/* Monthly / Annual Toggle */}
          <div className="flex items-center justify-center sm:justify-start gap-3 pt-1">
            <span className={`text-xs font-medium ${billingInterval === 'monthly' ? 'text-[#171717]' : 'text-[#71717a]'}`}>
              Monthly
            </span>
            <button
              onClick={() => setBillingInterval(billingInterval === 'monthly' ? 'annual' : 'monthly')}
              className={`w-11 h-6 rounded-full p-1 transition-colors border ${
                billingInterval === 'annual' ? 'bg-[#171717] border-[#171717]' : 'bg-[#e4e4e7] border-[#d4d4d8]'
              }`}
            >
              <div
                className={`w-4 h-4 rounded-full bg-white transition-transform ${
                  billingInterval === 'annual' ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
            <span className={`text-xs font-medium ${billingInterval === 'annual' ? 'text-[#171717]' : 'text-[#71717a]'}`}>
              Annual <span className="text-[#16a34a] font-bold">(Save 20%)</span>
            </span>
          </div>

          {/* Starter Plan Featured Card */}
          <div className="p-6 rounded-2xl border-2 border-[#f03e2f] bg-[#fff1ef]/30 space-y-4 relative">
            <span className="font-mono text-[10px] font-bold uppercase tracking-wider bg-[#f03e2f] text-white px-2.5 py-0.5 rounded-full absolute top-4 right-4">
              Recommended
            </span>
            <div>
              <h3 className="text-lg font-semibold text-[#171717]">TurboPress Starter</h3>
              <p className="text-xs text-[#71717a] mt-0.5">
                Product ID: <code>{billingInterval === 'monthly' ? POLAR_PRODUCT_IDS.starterMonthly : POLAR_PRODUCT_IDS.starterYearly}</code>
              </p>
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
              onClick={() => {
                onSelectPlan('starter', billingInterval);
                setStep(2);
              }}
              className="w-full btn btn-primary py-2 text-xs font-semibold"
            >
              Activate Starter via Polar Checkout →
            </button>
          </div>

          <div className="text-center pt-2">
            <button
              onClick={() => setStep(2)}
              className="text-xs text-[#71717a] hover:text-[#171717] underline"
            >
              I already purchased / Continue to site setup →
            </button>
          </div>
        </div>
      )}

      {/* STEP 2: CONNECT WORDPRESS SITE */}
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
              Install the TurboPress client plugin and pair via 1-Click Handshake.
            </p>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-[#3f3f46] mb-1">Your Website Domain</label>
              <input
                type="text"
                value={siteDomain}
                onChange={(e) => setSiteDomain(e.target.value)}
                placeholder="example.com"
                className="w-full px-3.5 py-2.5 bg-white border border-[#e4e4e7] rounded-lg text-xs font-mono text-[#171717] focus:outline-none focus:border-[#f03e2f]"
              />
            </div>

            <div className="p-4 bg-[#f8f8f7] border border-[#e4e4e7] rounded-xl space-y-2 text-xs text-[#3f3f46]">
              <p className="font-semibold text-[#171717]">Quick Installation Instructions:</p>
              <ol className="list-decimal pl-4 space-y-1">
                <li>Download <code>turbopress-optimizer.zip</code> and upload to WordPress → Plugins.</li>
                <li>Activate plugin and click <strong>1-Click Connect to TurboPress</strong>.</li>
                <li>Your API license key is synced automatically.</li>
              </ol>
            </div>
          </div>

          <div className="flex justify-between items-center pt-4 border-t border-[#f1f1f2]">
            <button onClick={() => setStep(1)} className="btn btn-ghost text-xs">
              <ArrowLeft className="w-3.5 h-3.5 mr-1" /> Back
            </button>
            <button
              onClick={() => setStep(3)}
              className="btn btn-primary text-xs px-5"
            >
              Continue to Optimization →
            </button>
          </div>
        </div>
      )}

      {/* STEP 3: FIRST WARMUP & RUN */}
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
              Cloudflare Browser Rendering (Puppeteer) is ready to inspect <code>{siteDomain}</code>.
            </p>
          </div>

          {isWarming ? (
            <div className="space-y-3 max-w-sm mx-auto py-4">
              <div className="flex justify-between font-mono text-xs text-[#71717a]">
                <span>Extracting AST Rules…</span>
                <span>{warmProgress}%</span>
              </div>
              <div className="h-2 rounded-full bg-[#f1f1f2] overflow-hidden">
                <div
                  className="h-full bg-[#f03e2f] rounded-full transition-all duration-500"
                  style={{ width: `${warmProgress}%` }}
                />
              </div>
            </div>
          ) : (
            <button
              onClick={handleStartWarmup}
              className="btn btn-primary text-xs py-2.5 px-6 shadow-md"
            >
              <Play className="w-4 h-4 fill-current mr-1" />
              <span>Launch First Optimization Run</span>
            </button>
          )}

          <div className="pt-4 border-t border-[#f1f1f2] text-left">
            <button onClick={() => setStep(2)} className="btn btn-ghost text-xs">
              <ArrowLeft className="w-3.5 h-3.5 mr-1" /> Back
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
              Site Optimized & Ready!
            </h2>
            <p className="text-[13.5px] text-[#71717a] max-w-md mx-auto">
              <code>{siteDomain}</code> is now accelerated with sub-15ms drop-in edge caching and interaction-delayed scripts.
            </p>
          </div>

          <div className="grid grid-cols-3 gap-3 p-4 bg-[#f8f8f7] border border-[#e4e4e7] rounded-xl max-w-md mx-auto font-mono text-center">
            <div>
              <span className="text-[10px] text-[#71717a] block uppercase">PageSpeed</span>
              <span className="text-xl font-bold text-[#16a34a]">98/100</span>
            </div>
            <div>
              <span className="text-[10px] text-[#71717a] block uppercase">LCP Time</span>
              <span className="text-xl font-bold text-[#171717]">1.2s</span>
            </div>
            <div>
              <span className="text-[10px] text-[#71717a] block uppercase">Edge TTFB</span>
              <span className="text-xl font-bold text-[#171717]">11ms</span>
            </div>
          </div>

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
