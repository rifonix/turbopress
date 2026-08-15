'use client';

import React, { Suspense, useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useAuth, useUser, UserButton, SignedIn, SignedOut } from '@clerk/nextjs';
import {
  Zap,
  ShieldCheck,
  Check,
  ArrowRight,
  RefreshCw,
  Copy,
  ExternalLink,
  Lock,
  Globe,
} from 'lucide-react';
import { api } from '@/services/api';
import { BillingStatusData, POLAR_PRODUCT_IDS } from '@/types';

function normalizeDomain(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .replace(/\/.*$/, '')
    .replace(/:\d+$/, '');
}

function ConnectContent() {
  const searchParams = useSearchParams();
  const { isLoaded, isSignedIn, getToken } = useAuth();
  const { user } = useUser();

  const rawDomain = searchParams?.get('domain') || '';
  const domain = normalizeDomain(rawDomain);
  const state = searchParams?.get('state') || '';
  const returnUrl = searchParams?.get('return_url') || '';
  const wpVersion = searchParams?.get('wp_version') || '6.7';
  const pluginVersion = searchParams?.get('plugin_version') || '1.0.0';

  // Plugin 1-Click handshake mode requires all params; otherwise manual connect mode
  const isHandshakeMode = Boolean(rawDomain && state && returnUrl);

  // Current URL (minus checkout params) for post-auth deep links
  const currentConnectUrl =
    typeof window !== 'undefined'
      ? (() => {
          const url = new URL(window.location.href);
          url.searchParams.delete('checkout_success');
          url.searchParams.delete('success');
          url.searchParams.delete('checkoutId');
          return `${url.pathname}${url.search}${url.hash}`;
        })()
      : '/connect';

  const [billingData, setBillingData] = useState<BillingStatusData | null>(null);
  const [isLoadingBilling, setIsLoadingBilling] = useState(true);
  const [isVerifyingPurchase, setIsVerifyingPurchase] = useState(false);
  const [isAuthorizing, setIsAuthorizing] = useState(false);
  const [pairedSuccess, setPairedSuccess] = useState(false);
  const [apiKey, setApiKey] = useState<string>('');
  const [callbackUrl, setCallbackUrl] = useState<string>('');
  const [countdown, setCountdown] = useState<number | null>(null);
  const [copiedKey, setCopiedKey] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Manual connect mode state
  const [manualDomain, setManualDomain] = useState('');
  const [manualApiKey, setManualApiKey] = useState<string | null>(null);
  const [isRegistering, setIsRegistering] = useState(false);

  const userEmail =
    user?.primaryEmailAddress?.emailAddress || user?.emailAddresses?.[0]?.emailAddress || '';

  const fetchBilling = async () => {
    const token = await getToken();
    return api.getBillingStatus(token);
  };

  // Fetch billing and user subscription status
  useEffect(() => {
    let cancelled = false;

    async function loadBilling() {
      if (!isSignedIn) {
        setIsLoadingBilling(false);
        return;
      }
      try {
        const data = await fetchBilling();
        if (!cancelled) setBillingData(data);
      } catch (err) {
        console.warn('[Connect Page Billing Error]', err);
      } finally {
        if (!cancelled) setIsLoadingBilling(false);
      }
    }

    if (isLoaded) loadBilling();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoaded, isSignedIn]);

  // Purchase verification: returning from Polar checkout, webhook may lag.
  // Poll billing status until the subscription flips active.
  const verifyStarted = useRef(false);
  useEffect(() => {
    if (!isLoaded || !isSignedIn || verifyStarted.current) return;
    if (typeof window === 'undefined') return;

    const params = new URLSearchParams(window.location.search);
    if (params.get('checkout_success') !== '1' && params.get('success') !== '1') return;

    verifyStarted.current = true;
    setIsVerifyingPurchase(true);
    let attempts = 0;

    const cleanParams = () => {
      const url = new URL(window.location.href);
      url.searchParams.delete('checkout_success');
      url.searchParams.delete('success');
      url.searchParams.delete('checkoutId');
      window.history.replaceState(null, '', url.toString());
    };

    const timer = setInterval(async () => {
      attempts += 1;
      try {
        const data = await fetchBilling();
        if (data?.hasActivePlan) {
          clearInterval(timer);
          setBillingData(data);
          setIsVerifyingPurchase(false);
          cleanParams();
          return;
        }
      } catch {
        // transient error — keep polling
      }
      if (attempts >= 20) {
        clearInterval(timer);
        setIsVerifyingPurchase(false);
        setErrorMessage(
          'Your payment is still being confirmed. This can take up to a minute — refresh this page shortly.'
        );
      }
    }, 3000);
  }, [isLoaded, isSignedIn]);

  // Handle countdown and auto-redirect (handshake mode)
  useEffect(() => {
    let timer: any;
    if (pairedSuccess && countdown !== null && countdown > 0) {
      timer = setInterval(() => {
        setCountdown((prev) => {
          if (prev === null || prev <= 1) {
            clearInterval(timer);
            if (callbackUrl) {
              window.location.href = callbackUrl;
            }
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => clearInterval(timer);
  }, [pairedSuccess, countdown, callbackUrl]);

  const hasActivePlan =
    billingData?.hasActivePlan ||
    billingData?.subscription?.status === 'active' ||
    billingData?.subscription?.status === 'trialing';

  // Handle plan purchase
  const handlePurchasePlan = async (interval: 'monthly' | 'annual' = 'monthly') => {
    try {
      const token = await getToken();
      const productId =
        interval === 'annual' ? POLAR_PRODUCT_IDS.starterYearly : POLAR_PRODUCT_IDS.starterMonthly;

      // Construct returnTo back to this exact connect URL
      const currentParams = new URLSearchParams();
      if (domain) currentParams.set('domain', domain);
      if (state) currentParams.set('state', state);
      if (returnUrl) currentParams.set('return_url', returnUrl);
      if (wpVersion) currentParams.set('wp_version', wpVersion);
      if (pluginVersion) currentParams.set('plugin_version', pluginVersion);
      const qs = currentParams.toString();
      const returnTo = qs ? `/connect?${qs}` : '/connect';

      const res = await api.createCheckout(token, productId, returnTo, userEmail);
      if (res?.checkoutUrl) {
        window.location.href = res.checkoutUrl;
      } else {
        setErrorMessage('Failed to start Polar checkout. Please try again.');
      }
    } catch (err: any) {
      setErrorMessage(err?.message || 'Failed to start Polar checkout');
    }
  };

  // Authorize handshake (plugin mode)
  const handleAuthorize = async () => {
    if (!domain || !state || !returnUrl) {
      setErrorMessage('Missing required connection parameters (domain, state nonce, or return URL).');
      return;
    }

    setIsAuthorizing(true);
    setErrorMessage(null);

    try {
      const token = await getToken();
      const res = await api.pairSite(token, {
        domain,
        state,
        return_url: decodeURIComponent(returnUrl),
        wp_version: wpVersion,
        plugin_version: pluginVersion,
      });

      setApiKey(res.apiKey);
      const redirectUrl = res.callback_url || decodeURIComponent(returnUrl);
      setCallbackUrl(redirectUrl);
      setPairedSuccess(true);
      setCountdown(3);
    } catch (err: any) {
      if (err.status === 402 || err.message?.includes('subscription')) {
        setErrorMessage('Active subscription required. Please choose a plan below.');
        try {
          const data = await fetchBilling();
          setBillingData(data);
        } catch {}
      } else {
        setErrorMessage(err.message || 'Failed to pair site. Please try again.');
      }
    } finally {
      setIsAuthorizing(false);
    }
  };

  // Manual site registration (no plugin params)
  const handleManualRegister = async () => {
    const normalized = normalizeDomain(manualDomain);
    if (!normalized || !normalized.includes('.') || normalized.includes(' ')) {
      setErrorMessage('Enter a valid domain like example.com');
      return;
    }
    setErrorMessage(null);
    setIsRegistering(true);
    try {
      const token = await getToken();
      const res = await api.createSite(token, normalized);
      setManualApiKey(res.apiKey || '');
    } catch (err: any) {
      if (err.status === 402 || err.message?.includes('subscription')) {
        setErrorMessage('Active subscription required. Please choose a plan below.');
        try {
          const data = await fetchBilling();
          setBillingData(data);
        } catch {}
      } else {
        setErrorMessage(err.message || `Failed to connect ${normalized}`);
      }
    } finally {
      setIsRegistering(false);
    }
  };

  const handleCopyKey = (key: string) => {
    if (!key) return;
    navigator.clipboard.writeText(key).catch(() => {});
    setCopiedKey(true);
    setTimeout(() => setCopiedKey(false), 2000);
  };

  /* ---------- SIGNED OUT: prompt to sign in / register ---------- */
  if (isLoaded && !isSignedIn) {
    return (
      <div className="min-h-screen bg-[#fbfbfa] text-[#171717] flex flex-col antialiased">
        <header className="border-b border-[#e4e4e7] bg-white/80 backdrop-blur-md sticky top-0 z-30 px-6 py-3.5">
          <div className="max-w-4xl mx-auto flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-[#171717] flex items-center justify-center text-white shadow-sm">
                <Zap className="w-4 h-4 fill-current text-[#f03e2f]" />
              </div>
              <span className="font-semibold text-sm tracking-tight text-[#171717]">TurboPress</span>
            </div>
            <span className="text-[10px] font-mono text-[#71717a] px-1.5 py-0.5 rounded bg-[#f4f4f5] border border-[#e4e4e7]">
              Edge Handshake
            </span>
          </div>
        </header>

        <main className="flex-1 flex items-center justify-center p-4 sm:p-6">
          <div className="w-full max-w-md bg-white border border-[#e4e4e7] rounded-3xl p-8 shadow-xl shadow-black/[0.03] text-center space-y-6 animate-fade-in">
            <div className="w-12 h-12 rounded-2xl bg-[#fff1ef] border border-red-100 text-[#f03e2f] flex items-center justify-center mx-auto">
              <Lock className="w-6 h-6" />
            </div>
            <div className="space-y-1.5">
              <h1 className="text-xl font-bold tracking-tight">
                {isHandshakeMode ? `Sign in to connect ${domain}` : 'Sign in to connect your site'}
              </h1>
              <p className="text-xs text-[#71717a] leading-relaxed">
                {isHandshakeMode
                  ? 'Authorizing the 1-Click Edge handshake requires a TurboPress account.'
                  : 'Create or sign in to an account to register your WordPress site and get an API key.'}
              </p>
            </div>

            <div className="space-y-2.5">
              <Link
                href={`/sign-in?redirect_url=${encodeURIComponent(currentConnectUrl)}`}
                className="w-full py-3 px-4 rounded-xl bg-[#171717] hover:bg-[#262626] text-white font-semibold text-xs shadow-md transition-all flex items-center justify-center gap-2"
              >
                Sign In to Continue <ArrowRight className="w-4 h-4" />
              </Link>
              <Link
                href={`/sign-up?redirect_url=${encodeURIComponent(currentConnectUrl)}`}
                className="w-full py-3 px-4 rounded-xl border border-[#e4e4e7] bg-white hover:bg-[#f8f8f7] text-[#171717] font-semibold text-xs transition-all flex items-center justify-center gap-2"
              >
                Create a Free Account
              </Link>
            </div>

            <p className="text-[11px] text-[#a1a1aa]">
              After signing in you&apos;ll return here automatically to finish connecting.
            </p>
          </div>
        </main>
      </div>
    );
  }

  if (!isLoaded || isLoadingBilling) {
    return (
      <div className="min-h-screen bg-[#fafafa] flex flex-col items-center justify-center p-4">
        <div className="w-8 h-8 border-2 border-[#171717] border-t-transparent rounded-full animate-spin mb-4" />
        <p className="text-xs font-mono text-[#71717a]">Checking authentication and subscription status…</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#fbfbfa] text-[#171717] flex flex-col antialiased">
      {/* Standalone Clean Top Navigation */}
      <header className="border-b border-[#e4e4e7] bg-white/80 backdrop-blur-md sticky top-0 z-30 px-6 py-3.5">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-[#171717] flex items-center justify-center text-white shadow-sm">
              <Zap className="w-4 h-4 fill-current text-[#f03e2f]" />
            </div>
            <div>
              <span className="font-semibold text-sm tracking-tight text-[#171717]">TurboPress</span>
              <span className="text-[10px] font-mono text-[#71717a] ml-2 px-1.5 py-0.5 rounded bg-[#f4f4f5] border border-[#e4e4e7]">
                {isHandshakeMode ? 'Edge Handshake' : 'Manual Connect'}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => (window.location.href = '/')}
              className="text-xs font-medium text-[#71717a] hover:text-[#171717] transition-colors"
            >
              Dashboard
            </button>
            <div className="w-[1px] h-4 bg-[#e4e4e7]" />
            <SignedIn>
              <UserButton afterSignOutUrl="/sign-in" />
            </SignedIn>
            <SignedOut>
              <Link
                href={`/sign-in?redirect_url=${encodeURIComponent(currentConnectUrl)}`}
                className="text-xs font-medium text-[#171717] hover:underline"
              >
                Sign in
              </Link>
            </SignedOut>
          </div>
        </div>
      </header>

      {/* Main Center Stage */}
      <main className="flex-1 flex items-center justify-center p-4 sm:p-6 my-auto">
        <div className="w-full max-w-lg animate-fade-in">
          {/* Card Container */}
          <div className="bg-white border border-[#e4e4e7] rounded-3xl p-6 sm:p-8 shadow-xl shadow-black/[0.03]">
            {/* Header Badge & Title */}
            <div className="text-center space-y-2 mb-6">
              <div className="w-12 h-12 rounded-2xl bg-[#fff1ef] border border-red-100 text-[#f03e2f] flex items-center justify-center mx-auto shadow-sm">
                <Zap className="w-6 h-6 fill-current" />
              </div>
              <h1 className="text-2xl font-bold tracking-tight text-[#171717]">
                {isHandshakeMode ? 'Connect WordPress Site' : 'Connect a Site Manually'}
              </h1>
              <p className="text-xs text-[#71717a] max-w-sm mx-auto">
                {isHandshakeMode
                  ? 'Authorize 1-Click Zero-DNS Edge Acceleration for your WordPress instance.'
                  : 'Register your domain, copy the API key, and paste it into the TurboPress plugin settings.'}
              </p>
            </div>

            {/* Verifying purchase state */}
            {isVerifyingPurchase && (
              <div className="p-5 mb-5 rounded-2xl border border-[#e4e4e7] bg-[#f8f8f7] flex flex-col items-center gap-3 animate-fade-in">
                <div className="w-8 h-8 rounded-full border-[3px] border-[#171717] border-t-transparent animate-spin" />
                <p className="text-xs font-mono text-[#71717a] text-center">
                  Payment received — activating your plan…
                  <br />
                  <span className="text-[#a1a1aa]">This unlocks automatically in a few seconds.</span>
                </p>
              </div>
            )}

            {/* Error Message Box */}
            {errorMessage && (
              <div className="p-3.5 mb-5 rounded-xl bg-[#fef2f2] border border-red-200 text-xs text-[#dc2626] flex items-start gap-2.5">
                <span className="font-bold">Error:</span>
                <span className="flex-1 leading-snug">{errorMessage}</span>
              </div>
            )}

            {/* Site Metadata Summary (handshake mode only) */}
            {isHandshakeMode && !pairedSuccess && (
              <div className="bg-[#f8f8f7] border border-[#e4e4e7] rounded-2xl p-4 mb-6 space-y-2.5 text-xs">
                <div className="flex justify-between items-center">
                  <span className="text-[#71717a] font-medium">WordPress Domain:</span>
                  <span className="font-mono font-semibold text-[#171717] bg-white px-2 py-0.5 rounded border border-[#e4e4e7]">
                    {domain}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-[#71717a] font-medium">Security Handshake:</span>
                  <span className="font-medium text-[#16a34a] flex items-center gap-1">
                    <ShieldCheck className="w-3.5 h-3.5" />
                    State Nonce Verified
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-[#71717a] font-medium">Plugin & Core:</span>
                  <span className="font-mono text-[#52525b]">
                    TurboPress v{pluginVersion} · WP {wpVersion}
                  </span>
                </div>
              </div>
            )}

            {/* STATE 0: MANUAL MODE, ALREADY REGISTERED */}
            {!isHandshakeMode && manualApiKey && (
              <div className="space-y-5 animate-fade-in">
                <div className="flex items-center gap-3 p-3.5 rounded-xl border border-[#dcfce7] bg-[#f0fdf4]">
                  <span className="w-7 h-7 rounded-full bg-[#16a34a] text-white grid place-items-center flex-none">
                    <Check className="w-4 h-4" />
                  </span>
                  <div>
                    <p className="text-xs font-semibold text-[#166534]">
                      {normalizeDomain(manualDomain)} connected to TurboPress Edge
                    </p>
                    <p className="text-[11px] text-[#15803d]">Edge zone provisioned · API key issued</p>
                  </div>
                </div>

                <div className="space-y-2">
                  <span className="text-[11px] text-[#71717a] font-medium block">
                    Your API License Key:
                  </span>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 px-3 py-2 bg-[#f8f8f7] border border-[#e4e4e7] rounded-lg text-[11px] font-mono text-[#171717] break-all">
                      {manualApiKey}
                    </code>
                    <button
                      onClick={() => handleCopyKey(manualApiKey)}
                      className="p-2 rounded-lg border border-[#e4e4e7] hover:bg-[#f8f8f7] text-[#171717] transition-colors flex-none"
                      title="Copy API Key"
                    >
                      {copiedKey ? <Check className="w-3.5 h-3.5 text-[#16a34a]" /> : <Copy className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>

                <div className="p-4 bg-[#f8f8f7] border border-[#e4e4e7] rounded-xl space-y-2 text-xs text-[#3f3f46] text-left">
                  <p className="font-semibold text-[#171717]">Finish pairing in WordPress:</p>
                  <ol className="list-decimal pl-4 space-y-1">
                    <li>Install the TurboPress optimizer plugin and open its settings.</li>
                    <li>Paste the API key above into the license key field.</li>
                    <li>Save — the plugin will validate and arm the edge cache automatically.</li>
                  </ol>
                </div>

                <div className="flex gap-2.5">
                  <button
                    onClick={() => (window.location.href = '/onboarding')}
                    className="flex-1 py-3 px-4 rounded-xl bg-[#171717] hover:bg-[#262626] text-white font-semibold text-xs shadow-md transition-all"
                  >
                    Run First Optimization →
                  </button>
                  <button
                    onClick={() => (window.location.href = '/sites')}
                    className="flex-1 py-3 px-4 rounded-xl border border-[#e4e4e7] hover:bg-[#f8f8f7] text-[#171717] font-semibold text-xs transition-all"
                  >
                    View in Dashboard
                  </button>
                </div>
              </div>
            )}

            {/* STATE 1: PLAN GATING (User does not have an active plan) */}
            {!hasActivePlan && !pairedSuccess && !( !isHandshakeMode && manualApiKey) && (
              <div className="space-y-5 animate-fade-in">
                <div className="p-4 rounded-2xl bg-[#fffbeb] border border-[#fed7aa] text-left space-y-2">
                  <div className="flex items-center gap-2 text-[#9a3412] font-semibold text-xs">
                    <Lock className="w-4 h-4 flex-none" />
                    <span>Active Plan Required for Edge Pairing</span>
                  </div>
                  <p className="text-xs text-[#78350f] leading-relaxed">
                    To pair and run Chromium Critical CSS & sub-15ms edge caching on{' '}
                    <strong>{isHandshakeMode ? domain : 'your site'}</strong>, an active TurboPress
                    subscription is required.
                  </p>
                </div>

                {/* Starter Plan Highlight Card */}
                <div className="border-2 border-[#171717] rounded-2xl p-5 bg-[#fafafa] relative text-left">
                  <span className="font-mono text-[10px] font-bold uppercase tracking-wider bg-[#171717] text-white px-2 py-0.5 rounded-full absolute -top-2.5 right-4">
                    Recommended
                  </span>
                  <div className="flex justify-between items-baseline mb-2">
                    <div>
                      <h3 className="font-semibold text-sm text-[#171717]">TurboPress Starter</h3>
                      <p className="text-[11px] text-[#71717a]">1 Production Site Slot · Full Edge Engine</p>
                    </div>
                    <div className="text-right">
                      <span className="font-mono text-xl font-bold text-[#171717]">$19</span>
                      <span className="text-[10px] text-[#71717a] font-mono">/mo</span>
                    </div>
                  </div>

                  <ul className="space-y-1.5 text-xs text-[#3f3f46] my-3 border-t border-[#e4e4e7] pt-3">
                    <li className="flex items-center gap-2">
                      <Check className="w-3.5 h-3.5 text-[#16a34a] flex-none" />
                      <span>Sub-15ms advanced-cache.php drop-in</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <Check className="w-3.5 h-3.5 text-[#16a34a] flex-none" />
                      <span>200 Cloudflare Chromium Puppeteer runs / mo</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <Check className="w-3.5 h-3.5 text-[#16a34a] flex-none" />
                      <span>Unlimited free local and staging development seats</span>
                    </li>
                  </ul>

                  <button
                    onClick={() => handlePurchasePlan('monthly')}
                    className="w-full mt-2 py-3 px-4 rounded-xl bg-[#f03e2f] hover:bg-[#d93426] text-white font-semibold text-xs shadow-md transition-all flex items-center justify-center gap-2"
                  >
                    <span>Activate Starter Plan ($19/mo)</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>

                <div className="flex items-center justify-between text-xs pt-2">
                  <button
                    onClick={() => handlePurchasePlan('annual')}
                    className="text-[#71717a] hover:text-[#171717] underline"
                  >
                    Switch to Annual ($15/mo · Save 20%)
                  </button>
                  <Link href="/pricing" className="text-[#f03e2f] hover:underline font-medium">
                    Compare all plans →
                  </Link>
                </div>
              </div>
            )}

            {/* STATE 2a: ACTIVE PLAN, HANDSHAKE MODE — READY TO PAIR */}
            {isHandshakeMode && hasActivePlan && !pairedSuccess && (
              <div className="space-y-5 animate-fade-in">
                <div className="p-3.5 rounded-xl bg-[#f0fdf4] border border-[#dcfce7] flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-[#16a34a]" />
                    <span className="text-[#166534] font-medium">
                      {billingData?.plan?.name || 'TurboPress Active'}
                    </span>
                  </div>
                  <span className="font-mono text-[11px] text-[#15803d]">
                    {billingData?.plan?.maxSites
                      ? `${billingData.plan.usedSites}/${billingData.plan.maxSites} Slots`
                      : 'Slot Available'}
                  </span>
                </div>

                <div className="space-y-2 text-left text-xs text-[#52525b] py-1">
                  <div className="flex items-center gap-2">
                    <Check className="w-3.5 h-3.5 text-[#16a34a] flex-none" />
                    <span>Automated Mobile & Desktop Critical CSS Extraction</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Check className="w-3.5 h-3.5 text-[#16a34a] flex-none" />
                    <span>Sub-15ms TTFB Caching & W3C Speculation Rules</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Check className="w-3.5 h-3.5 text-[#16a34a] flex-none" />
                    <span>3-Tier Interaction-delayed JS with jQuery Queue</span>
                  </div>
                </div>

                <button
                  onClick={handleAuthorize}
                  disabled={isAuthorizing}
                  className="w-full py-3.5 px-6 rounded-xl bg-[#171717] hover:bg-[#262626] text-white font-semibold text-xs shadow-lg transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {isAuthorizing ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>Authorizing Edge Engine…</span>
                    </>
                  ) : (
                    <>
                      <span>Authorize & Connect {domain}</span>
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>
              </div>
            )}

            {/* STATE 2b: ACTIVE PLAN, MANUAL MODE — DOMAIN INPUT */}
            {!isHandshakeMode && hasActivePlan && !manualApiKey && (
              <div className="space-y-5 animate-fade-in">
                <div className="p-3.5 rounded-xl bg-[#f0fdf4] border border-[#dcfce7] flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-[#16a34a]" />
                    <span className="text-[#166534] font-medium">
                      {billingData?.plan?.name || 'TurboPress Active'}
                    </span>
                  </div>
                  <span className="font-mono text-[11px] text-[#15803d]">
                    {billingData?.plan?.maxSites
                      ? `${billingData.plan.usedSites}/${billingData.plan.maxSites} Slots`
                      : 'Slot Available'}
                  </span>
                </div>

                <div>
                  <label className="block text-xs font-medium text-[#3f3f46] mb-1.5">
                    Your Website Domain
                  </label>
                  <div className="relative">
                    <Globe className="w-4 h-4 text-[#a1a1aa] absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={manualDomain}
                      onChange={(e) => setManualDomain(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleManualRegister()}
                      placeholder="example.com"
                      disabled={isRegistering}
                      className="w-full pl-9 pr-3.5 py-2.5 bg-white border border-[#e4e4e7] rounded-xl text-xs font-mono text-[#171717] focus:outline-none focus:border-[#f03e2f] disabled:opacity-60"
                    />
                  </div>
                  <p className="text-[11px] text-[#a1a1aa] mt-1.5">
                    Just the bare domain — no https:// or paths.
                  </p>
                </div>

                <button
                  onClick={handleManualRegister}
                  disabled={isRegistering || !manualDomain.trim()}
                  className="w-full py-3.5 px-6 rounded-xl bg-[#171717] hover:bg-[#262626] text-white font-semibold text-xs shadow-lg transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {isRegistering ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>Connecting to Edge…</span>
                    </>
                  ) : (
                    <>
                      <span>Connect Site & Generate API Key</span>
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>
              </div>
            )}

            {/* STATE 3: PAIRED & REDIRECTING */}
            {pairedSuccess && (
              <div className="space-y-6 text-center animate-fade-in">
                <div className="w-14 h-14 rounded-full bg-[#f0fdf4] border-2 border-[#16a34a] text-[#16a34a] flex items-center justify-center mx-auto shadow-sm">
                  <Check className="w-7 h-7 stroke-[2.5]" />
                </div>

                <div className="space-y-1">
                  <h2 className="text-xl font-bold text-[#171717]">Site Successfully Connected!</h2>
                  <p className="text-xs text-[#71717a]">
                    Redirecting to WordPress admin in{' '}
                    <strong className="text-[#171717] font-mono">{countdown}</strong> seconds…
                  </p>
                </div>

                {/* API Key Box */}
                <div className="p-3.5 bg-[#f8f8f7] border border-[#e4e4e7] rounded-xl text-left space-y-1.5">
                  <span className="text-[11px] text-[#71717a] font-medium block">
                    Assigned API License Key:
                  </span>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 font-mono text-xs text-[#171717] truncate bg-white px-2.5 py-1.5 rounded border border-[#e4e4e7]">
                      {apiKey}
                    </code>
                    <button
                      onClick={() => handleCopyKey(apiKey)}
                      className="p-2 rounded-lg border border-[#e4e4e7] hover:bg-white text-[#171717] transition-colors"
                      title="Copy API Key"
                    >
                      {copiedKey ? (
                        <Check className="w-3.5 h-3.5 text-[#16a34a]" />
                      ) : (
                        <Copy className="w-3.5 h-3.5" />
                      )}
                    </button>
                  </div>
                </div>

                <button
                  onClick={() => {
                    if (callbackUrl) {
                      window.location.href = callbackUrl;
                    }
                  }}
                  className="w-full py-3 px-4 rounded-xl bg-[#16a34a] hover:bg-[#15803d] text-white font-semibold text-xs shadow-md transition-all flex items-center justify-center gap-2"
                >
                  <span>Return to WordPress Now</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </div>

          {/* Footer note */}
          <div className="text-center mt-6">
            <p className="text-[11.5px] text-[#a1a1aa]">
              TurboPress Cryptographic OAuth Handshake · Zero-DNS Edge Engine
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}

export default function ConnectPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[#fafafa] flex items-center justify-center">
          <div className="w-8 h-8 border-2 border-[#171717] border-t-transparent rounded-full animate-spin" />
        </div>
      }
    >
      <ConnectContent />
    </Suspense>
  );
}
