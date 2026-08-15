'use client';

import React, { Suspense } from 'react';
import { Zap, Activity, Globe, Sparkles, ShieldCheck } from 'lucide-react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { CustomSignIn } from '@/components/auth/CustomSignIn';

function SignInContent() {
  const searchParams = useSearchParams();
  const redirectUrl = searchParams?.get('redirect_url') || '/';

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
            <span>Secure Edge Authentication</span>
          </span>
        </div>
      </header>

      {/* Main Grid */}
      <main className="flex-1 flex items-center justify-center p-4 sm:p-8">
        <div className="max-w-6xl w-full grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
          {/* Left Column: Value Props */}
          <div className="lg:col-span-6 space-y-6 text-left">
            <span className="font-mono text-xs font-semibold uppercase tracking-wider px-3 py-1 bg-[#fff1ef] text-[#f03e2f] rounded-full border border-red-200 inline-block">
              Zero-DNS WordPress Acceleration
            </span>

            <h1 className="text-3xl sm:text-5xl font-semibold tracking-tight text-[#171717] leading-tight">
              Instant 95+ PageSpeed scores across any theme.
            </h1>

            <p className="text-[15px] text-[#71717a] leading-relaxed max-w-lg">
              Automated Critical CSS inlining, sub-15ms edge caching, 3-tier JavaScript deferral, and dynamic nonce micro-hydration.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
              <div className="p-3.5 bg-white border border-[#e4e4e7] rounded-xl shadow-sm space-y-1">
                <span className="text-xs font-semibold text-[#171717] flex items-center gap-1.5">
                  <Zap className="w-3.5 h-3.5 text-[#f03e2f] fill-current" />
                  Sub-15ms Edge Cache
                </span>
                <p className="text-[11.5px] text-[#71717a]">
                  Drop-in <code>advanced-cache.php</code> with Brotli compression.
                </p>
              </div>

              <div className="p-3.5 bg-white border border-[#e4e4e7] rounded-xl shadow-sm space-y-1">
                <span className="text-xs font-semibold text-[#171717] flex items-center gap-1.5">
                  <Activity className="w-3.5 h-3.5 text-[#16a34a]" />
                  AST Critical CSS
                </span>
                <p className="text-[11.5px] text-[#71717a]">
                  Cloudflare Puppeteer pipeline saves to zero-egress R2 storage.
                </p>
              </div>

              <div className="p-3.5 bg-white border border-[#e4e4e7] rounded-xl shadow-sm space-y-1">
                <span className="text-xs font-semibold text-[#171717] flex items-center gap-1.5">
                  <Globe className="w-3.5 h-3.5 text-[#2563eb]" />
                  1-Click Handshake
                </span>
                <p className="text-[11.5px] text-[#71717a]">
                  Instant pair from WP admin with zero DNS migration.
                </p>
              </div>

              <div className="p-3.5 bg-white border border-[#e4e4e7] rounded-xl shadow-sm space-y-1">
                <span className="text-xs font-semibold text-[#171717] flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-[#9333ea]" />
                  Speculation Rules
                </span>
                <p className="text-[11.5px] text-[#71717a]">
                  Instantaneous &lt;50ms navigation on user link hover.
                </p>
              </div>
            </div>
          </div>

          {/* Right Column: Custom Sign In Form */}
          <div className="lg:col-span-6 flex flex-col items-center justify-center">
            <div className="w-full max-w-md bg-white border border-[#e4e4e7] rounded-2xl p-6 sm:p-8 shadow-xl">
              <div className="flex items-center justify-between mb-4 pb-3 border-b border-[#f1f1f2]">
                <div className="flex items-center gap-2">
                  <span className="w-7 h-7 rounded-lg bg-[#171717] text-white flex items-center justify-center text-xs font-bold shadow-sm">
                    TP
                  </span>
                  <div>
                    <h2 className="font-semibold text-sm text-[#171717]">Sign In to Dashboard</h2>
                    <p className="text-[11px] text-[#71717a]">TurboPress Edge Control Plane</p>
                  </div>
                </div>

                <div className="flex gap-1 bg-[#f4f4f5] p-0.5 rounded-lg text-xs font-medium">
                  <span className="px-2.5 py-1 rounded-md bg-white text-[#171717] font-semibold shadow-sm">
                    Sign In
                  </span>
                  <Link
                    href="/sign-up"
                    className="px-2.5 py-1 rounded-md text-[#71717a] hover:text-[#171717] transition-colors"
                  >
                    Register
                  </Link>
                </div>
              </div>

              <div className="pt-1">
                <CustomSignIn redirectUrl={redirectUrl} showFooter={true} />
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

export default function SignInPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[#f8f8f7] flex items-center justify-center">
          <div className="w-5 h-5 border-2 border-[#171717] border-t-transparent rounded-full animate-spin" />
        </div>
      }
    >
      <SignInContent />
    </Suspense>
  );
}
