'use client';

import React, { Suspense } from 'react';
import { Zap, Activity, Globe, Sparkles, ShieldCheck } from 'lucide-react';
import Link from 'next/link';
import { SignUp } from '@clerk/nextjs';
import { useSearchParams } from 'next/navigation';
import { turbopressClerkAppearance } from '@/components/auth/ClerkTheme';

function SignUpContent() {
  const searchParams = useSearchParams();
  // New accounts land in onboarding (plan purchase -> site connect) unless a
  // deep-link destination was provided (e.g. the /connect handshake).
  const redirectUrl = searchParams?.get('redirect_url') || '/onboarding';
  const safeRedirect = redirectUrl.startsWith('/') ? redirectUrl : '/onboarding';

  return (
    <div className="min-h-screen bg-[#f8f8f7] flex flex-col justify-between animate-fade-in text-[#171717]">
      {/* Top Navbar */}
      <header className="px-6 py-4 border-b border-[#e4e4e7] bg-white flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2.5">
          <span className="w-8 h-8 rounded-lg bg-[#171717] text-white flex items-center justify-center font-bold">
            <Zap className="w-4 h-4 text-[#f03e2f] fill-current" />
          </span>
          <span className="font-semibold text-lg tracking-tight">
            TurboPress <em className="italic font-normal text-[#71717a] not-italic">Engine</em>
          </span>
        </Link>

        <div className="flex items-center gap-2">
          <span className="font-mono text-xs text-[#71717a] bg-[#f4f4f5] px-2.5 py-1 rounded-md flex items-center gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5 text-[#16a34a]" />
            <span>Instant Provisioning</span>
          </span>
        </div>
      </header>

      {/* Main Grid */}
      <main className="flex-1 flex items-center justify-center p-4 sm:p-8">
        <div className="max-w-6xl w-full grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
          {/* Left Column: Value Props */}
          <div className="lg:col-span-6 space-y-6 text-left">
            <span className="font-mono text-xs font-semibold uppercase tracking-wider px-3 py-1 bg-[#fff1ef] text-[#f03e2f] rounded-full border border-red-200 inline-block">
              Free 14-Day Production Trial
            </span>

            <h1 className="text-3xl sm:text-5xl font-semibold tracking-tight text-[#171717] leading-tight">
              Scale your WordPress sites to lightning speed.
            </h1>

            <p className="text-[15px] text-[#71717a] leading-relaxed max-w-lg">
              No DNS changes required. Zero risk. Drop in the plugin, authorize the pairing handshake, and watch your Core Web Vitals go green.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
              <div className="p-3.5 bg-white border border-[#e4e4e7] rounded-xl shadow-sm space-y-1">
                <span className="text-xs font-semibold text-[#171717] flex items-center gap-1.5">
                  <Zap className="w-3.5 h-3.5 text-[#f03e2f] fill-current" />
                  No Risk
                </span>
                <p className="text-[11.5px] text-[#71717a]">
                  Original site remains untouched; edge fallback guaranteed.
                </p>
              </div>

              <div className="p-3.5 bg-white border border-[#e4e4e7] rounded-xl shadow-sm space-y-1">
                <span className="text-xs font-semibold text-[#171717] flex items-center gap-1.5">
                  <Activity className="w-3.5 h-3.5 text-[#16a34a]" />
                  95+ Mobile CWV
                </span>
                <p className="text-[11.5px] text-[#71717a]">
                  Pass Google Core Web Vitals on mobile and desktop.
                </p>
              </div>

              <div className="p-3.5 bg-white border border-[#e4e4e7] rounded-xl shadow-sm space-y-1">
                <span className="text-xs font-semibold text-[#171717] flex items-center gap-1.5">
                  <Globe className="w-3.5 h-3.5 text-[#2563eb]" />
                  Unlimited Pageviews
                </span>
                <p className="text-[11.5px] text-[#71717a]">
                  Global edge caching on Cloudflare&apos;s tier-1 network.
                </p>
              </div>

              <div className="p-3.5 bg-white border border-[#e4e4e7] rounded-xl shadow-sm space-y-1">
                <span className="text-xs font-semibold text-[#171717] flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-[#9333ea]" />
                  WooCommerce Ready
                </span>
                <p className="text-[11.5px] text-[#71717a]">
                  Micro-hydration for live carts & nonces without cache misses.
                </p>
              </div>
            </div>
          </div>

          {/* Right Column: Clerk Sign Up Form */}
          <div className="lg:col-span-6 flex flex-col items-center justify-center">
            <div className="w-full max-w-md bg-white border border-[#e4e4e7] rounded-2xl p-6 sm:p-8 shadow-xl">
              <div className="flex items-center justify-between mb-4 pb-3 border-b border-[#f1f1f2]">
                <div className="flex items-center gap-2">
                  <span className="w-7 h-7 rounded-lg bg-[#171717] text-white flex items-center justify-center text-xs font-bold shadow-sm">
                    TP
                  </span>
                  <div>
                    <h2 className="font-semibold text-sm text-[#171717]">Create Account</h2>
                    <p className="text-[11px] text-[#71717a]">Get Started in 30 Seconds</p>
                  </div>
                </div>

                <div className="flex gap-1 bg-[#f4f4f5] p-0.5 rounded-lg text-xs font-medium">
                  <Link
                    href={
                      redirectUrl && redirectUrl !== '/onboarding'
                        ? `/sign-in?redirect_url=${encodeURIComponent(redirectUrl)}`
                        : '/sign-in'
                    }
                    className="px-2.5 py-1 rounded-md text-[#71717a] hover:text-[#171717] transition-colors"
                  >
                    Sign In
                  </Link>
                  <span className="px-2.5 py-1 rounded-md bg-white text-[#171717] font-semibold shadow-sm">
                    Register
                  </span>
                </div>
              </div>

              <div className="pt-1 flex justify-center">
                <SignUp
                  appearance={turbopressClerkAppearance}
                  routing="path"
                  path="/sign-up"
                  signInUrl="/sign-in"
                  forceRedirectUrl={safeRedirect}
                />
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="px-6 py-4 border-t border-[#e4e4e7] bg-white text-center text-xs text-[#71717a] font-mono">
        TurboPress · High-Performance Zero-DNS WordPress Optimization Engine · Production Ready
      </footer>
    </div>
  );
}

export default function SignUpPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[#f8f8f7] flex items-center justify-center">
          <div className="w-5 h-5 border-2 border-[#171717] border-t-transparent rounded-full animate-spin" />
        </div>
      }
    >
      <SignUpContent />
    </Suspense>
  );
}
