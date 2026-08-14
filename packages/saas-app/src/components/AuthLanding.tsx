import React, { useState } from 'react';
import { Zap, Activity, Globe, Sparkles } from 'lucide-react';
import { SignIn, SignUp } from '@clerk/clerk-react';

interface AuthLandingProps {
  onBypassDemo: () => void;
  onToast: (msg: string) => void;
}

export const AuthLanding: React.FC<AuthLandingProps> = ({ onBypassDemo }) => {
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

        <div className="flex items-center gap-3">
          <button
            onClick={onBypassDemo}
            className="btn btn-secondary text-xs"
          >
            Explore Demo Fleet Preview →
          </button>
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

          {/* Right Column: Clerk Auth Card */}
          <div className="lg:col-span-6 flex flex-col items-center justify-center">
            <div className="w-full max-w-md bg-white border border-[#e4e4e7] rounded-2xl p-6 sm:p-8 shadow-xl">
              <div className="flex items-center justify-between mb-4 pb-3 border-b border-[#f1f1f2]">
                <div className="flex items-center gap-2">
                  <span className="w-6 h-6 rounded bg-[#171717] text-white flex items-center justify-center text-xs font-bold">
                    TP
                  </span>
                  <span className="font-semibold text-sm text-[#171717]">
                    {authMode === 'signin' ? 'Sign In' : 'Create Account'}
                  </span>
                </div>

                <div className="flex gap-1 bg-[#f4f4f5] p-0.5 rounded-lg text-xs font-medium">
                  <button
                    onClick={() => setAuthMode('signin')}
                    className={`px-2.5 py-1 rounded-md transition-colors ${
                      authMode === 'signin' ? 'bg-white text-[#171717] font-semibold shadow-sm' : 'text-[#71717a]'
                    }`}
                  >
                    Sign In
                  </button>
                  <button
                    onClick={() => setAuthMode('signup')}
                    className={`px-2.5 py-1 rounded-md transition-colors ${
                      authMode === 'signup' ? 'bg-white text-[#171717] font-semibold shadow-sm' : 'text-[#71717a]'
                    }`}
                  >
                    Register
                  </button>
                </div>
              </div>

              {authMode === 'signin' ? (
                <SignIn
                  routing="hash"
                  appearance={{
                    elements: {
                      rootBox: 'w-full',
                      card: 'shadow-none p-0 border-0 bg-transparent w-full',
                      headerTitle: 'hidden',
                      headerSubtitle: 'hidden',
                      socialButtonsBlockButton: 'border-[#e4e4e7] hover:bg-[#f8f8f7] text-[#171717] text-xs font-medium',
                      formButtonPrimary: 'bg-[#171717] hover:bg-black text-white text-xs font-semibold py-2.5',
                      footerAction: 'text-xs text-[#71717a]',
                      formFieldInput: 'border-[#e4e4e7] text-xs focus:border-[#f03e2f]',
                      formFieldLabel: 'text-xs font-medium text-[#3f3f46]',
                    },
                  }}
                />
              ) : (
                <SignUp
                  routing="hash"
                  appearance={{
                    elements: {
                      rootBox: 'w-full',
                      card: 'shadow-none p-0 border-0 bg-transparent w-full',
                      headerTitle: 'hidden',
                      headerSubtitle: 'hidden',
                      socialButtonsBlockButton: 'border-[#e4e4e7] hover:bg-[#f8f8f7] text-[#171717] text-xs font-medium',
                      formButtonPrimary: 'bg-[#171717] hover:bg-black text-white text-xs font-semibold py-2.5',
                      footerAction: 'text-xs text-[#71717a]',
                      formFieldInput: 'border-[#e4e4e7] text-xs focus:border-[#f03e2f]',
                      formFieldLabel: 'text-xs font-medium text-[#3f3f46]',
                    },
                  }}
                />
              )}

              <div className="pt-4 mt-4 border-t border-[#f1f1f2] text-center">
                <button
                  onClick={onBypassDemo}
                  className="text-xs text-[#71717a] hover:text-[#171717] underline font-mono"
                >
                  Skip login & explore Sandbox Demo Fleet →
                </button>
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
