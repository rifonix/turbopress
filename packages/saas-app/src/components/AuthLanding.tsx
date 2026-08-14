import React, { useState } from 'react';
import { Zap, Activity, Globe, Sparkles, ShieldCheck } from 'lucide-react';
import { SignIn, SignUp } from '@clerk/clerk-react';

interface AuthLandingProps {
  onToast?: (msg: string, type?: 'success' | 'info' | 'error') => void;
}

const clerkAppearance = {
  layout: {
    socialButtonsVariant: 'blockButton' as const,
    socialButtonsPlacement: 'top' as const,
    showOptionalFields: false,
  },
  variables: {
    colorPrimary: '#f03e2f',
    colorText: '#171717',
    colorTextSecondary: '#71717a',
    colorBackground: '#ffffff',
    colorInputBackground: '#ffffff',
    colorInputText: '#171717',
    borderRadius: '0.75rem',
  },
  elements: {
    rootBox: 'w-full',
    card: 'shadow-none p-0 border-0 bg-transparent w-full',
    headerTitle: 'hidden',
    headerSubtitle: 'hidden',
    socialButtonsBlockButton: 'border border-[#e4e4e7] hover:bg-[#f8f8f7] text-[#171717] text-xs font-medium py-2.5 rounded-xl transition-all shadow-sm',
    socialButtonsBlockButtonText: 'text-xs font-semibold text-[#171717]',
    dividerRow: 'my-3',
    dividerText: 'text-[10px] font-mono uppercase text-[#a1a1aa] bg-white px-2',
    dividerLine: 'bg-[#f1f1f2]',
    formButtonPrimary: 'bg-[#171717] hover:bg-black text-white text-xs font-semibold py-2.5 rounded-xl transition-all shadow-sm',
    formFieldLabel: 'text-xs font-medium text-[#3f3f46] mb-1',
    formFieldInput: 'border border-[#e4e4e7] text-xs rounded-xl px-3 py-2 focus:border-[#f03e2f] focus:ring-1 focus:ring-[#f03e2f] transition-all',
    footerAction: 'text-xs text-[#71717a] mt-4 pt-3 border-t border-[#f1f1f2]',
    footerActionLink: 'text-[#f03e2f] hover:underline font-medium text-xs',
    identityPreviewText: 'text-xs font-mono text-[#171717]',
    identityPreviewEditButton: 'text-xs text-[#f03e2f]',
    otpCodeFieldInput: 'border border-[#e4e4e7] text-lg font-mono text-[#171717] rounded-xl focus:border-[#f03e2f]',
    formResendCodeLink: 'text-xs text-[#f03e2f] hover:underline font-medium',
    alert: 'border border-red-200 bg-red-50 text-red-700 text-xs rounded-xl p-3',
  },
};

export const AuthLanding: React.FC<AuthLandingProps> = () => {
  const [authMode, setAuthMode] = useState<'signin' | 'signup'>('signin');

  return (
    <div className="min-h-screen bg-[#f8f8f7] flex flex-col justify-between animate-fade-in text-[#171717]">
      {/* Top Navbar */}
      <header className="px-6 py-4 border-b border-[#e4e4e7] bg-white flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <span className="w-8 h-8 rounded-lg bg-[#171717] text-white flex items-center justify-center font-bold">
            <Zap className="w-4 h-4 text-[#f03e2f] fill-current" />
          </span>
          <span className="font-semibold text-lg tracking-tight">
            TurboPress <em className="italic font-normal text-[#71717a] not-italic">Engine</em>
          </span>
        </div>

        <div className="flex items-center gap-2">
          <span className="font-mono text-xs text-[#71717a] bg-[#f4f4f5] px-2.5 py-1 rounded-md flex items-center gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5 text-[#16a34a]" />
            <span>Edge Authenticated</span>
          </span>
        </div>
      </header>

      {/* Main Grid */}
      <main className="flex-1 flex items-center justify-center p-4 sm:p-8">
        <div className="max-w-6xl w-full grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
          {/* Left Column: Product Value Props */}
          <div className="lg:col-span-6 space-y-6 text-left">
            <span className="font-mono text-xs font-semibold uppercase tracking-wider px-3 py-1 bg-[#fff1ef] text-[#f03e2f] rounded-full border border-red-200 inline-block">
              Zero-DNS WordPress Acceleration
            </span>

            <h1 className="text-3xl sm:text-5xl font-semibold tracking-tight text-[#171717] leading-tight">
              Instant 95+ PageSpeed scores across any theme.
            </h1>

            <p className="text-[15px] text-[#71717a] leading-relaxed max-w-lg">
              Automated Critical CSS inlining, sub-15ms edge caching, 3-tier JavaScript deferral, and dynamic nonce micro-hydration. Zero nameserver migration required.
            </p>

            {/* Feature Pills */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
              <div className="p-3.5 bg-white border border-[#e4e4e7] rounded-xl shadow-sm space-y-1">
                <span className="text-xs font-semibold text-[#171717] flex items-center gap-1.5">
                  <Zap className="w-3.5 h-3.5 text-[#f03e2f] fill-current" />
                  Sub-15ms Edge Cache
                </span>
                <p className="text-[11.5px] text-[#71717a]">
                  Native <code>advanced-cache.php</code> drop-in with Brotli pre-compression.
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
                  Instantaneous &lt;50ms link navigation on user link hover.
                </p>
              </div>
            </div>
          </div>

          {/* Right Column: Custom-Styled Clerk Auth Gateway */}
          <div className="lg:col-span-6 flex flex-col items-center justify-center">
            <div className="w-full max-w-md bg-white border border-[#e4e4e7] rounded-2xl p-6 sm:p-8 shadow-xl">
              {/* Header Mode Switcher */}
              <div className="flex items-center justify-between mb-4 pb-3 border-b border-[#f1f1f2]">
                <div className="flex items-center gap-2">
                  <span className="w-7 h-7 rounded-lg bg-[#171717] text-white flex items-center justify-center text-xs font-bold shadow-sm">
                    TP
                  </span>
                  <div>
                    <h2 className="font-semibold text-sm text-[#171717]">
                      {authMode === 'signin' ? 'Sign In to Dashboard' : 'Create Free Account'}
                    </h2>
                    <p className="text-[11px] text-[#71717a]">TurboPress Edge Control Plane</p>
                  </div>
                </div>

                <div className="flex gap-1 bg-[#f4f4f5] p-0.5 rounded-lg text-xs font-medium">
                  <button
                    onClick={() => setAuthMode('signin')}
                    className={`px-2.5 py-1 rounded-md transition-colors ${
                      authMode === 'signin'
                        ? 'bg-white text-[#171717] font-semibold shadow-sm'
                        : 'text-[#71717a] hover:text-[#171717]'
                    }`}
                  >
                    Sign In
                  </button>
                  <button
                    onClick={() => setAuthMode('signup')}
                    className={`px-2.5 py-1 rounded-md transition-colors ${
                      authMode === 'signup'
                        ? 'bg-white text-[#171717] font-semibold shadow-sm'
                        : 'text-[#71717a] hover:text-[#171717]'
                    }`}
                  >
                    Register
                  </button>
                </div>
              </div>

              {/* Clerk Live Form */}
              <div className="pt-1">
                {authMode === 'signin' ? (
                  <SignIn
                    routing="hash"
                    forceRedirectUrl="/"
                    fallbackRedirectUrl="/"
                    signUpForceRedirectUrl="/"
                    signUpFallbackRedirectUrl="/"
                    appearance={clerkAppearance}
                  />
                ) : (
                  <SignUp
                    routing="hash"
                    forceRedirectUrl="/"
                    fallbackRedirectUrl="/"
                    signInForceRedirectUrl="/"
                    signInFallbackRedirectUrl="/"
                    appearance={clerkAppearance}
                  />
                )}
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
};
