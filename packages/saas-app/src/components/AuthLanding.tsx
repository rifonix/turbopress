import React, { useState } from 'react';
import { Zap, Lock, Mail, Activity } from 'lucide-react';

interface AuthLandingProps {
  onBypassDemo: () => void;
  onToast: (msg: string) => void;
}

export const AuthLanding: React.FC<AuthLandingProps> = ({ onBypassDemo, onToast }) => {
  const [authMode, setAuthMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const handleCustomSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;
    onToast(authMode === 'signin' ? `Signed in as ${email}` : `Account created for ${email}`);
    onBypassDemo();
  };

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
          <button
            onClick={onBypassDemo}
            className="btn btn-secondary text-xs"
          >
            Explore Live Demo →
          </button>
        </div>
      </header>

      {/* Main Grid */}
      <main className="flex-1 flex items-center justify-center p-4 sm:p-8">
        <div className="max-w-5xl w-full grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
          {/* Left Column: Product Value Props */}
          <div className="lg:col-span-7 space-y-6 text-left">
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
            </div>
          </div>

          {/* Right Column: Auth Card */}
          <div className="lg:col-span-5 bg-white border border-[#e4e4e7] rounded-2xl p-6 sm:p-8 shadow-xl space-y-5">
            <div>
              <h2 className="text-xl font-semibold text-[#171717]">
                {authMode === 'signin' ? 'Sign in to TurboPress' : 'Create your account'}
              </h2>
              <p className="text-xs text-[#71717a] mt-1">
                Access your fleet control plane and optimization pipeline.
              </p>
            </div>

            {/* Mode Switcher */}
            <div className="grid grid-cols-2 p-1 bg-[#f4f4f5] rounded-xl text-xs font-medium">
              <button
                onClick={() => setAuthMode('signin')}
                className={`py-1.5 rounded-lg transition-colors ${
                  authMode === 'signin' ? 'bg-white text-[#171717] font-semibold shadow-sm' : 'text-[#71717a]'
                }`}
              >
                Sign in
              </button>
              <button
                onClick={() => setAuthMode('signup')}
                className={`py-1.5 rounded-lg transition-colors ${
                  authMode === 'signup' ? 'bg-white text-[#171717] font-semibold shadow-sm' : 'text-[#71717a]'
                }`}
              >
                Create account
              </button>
            </div>

            <form onSubmit={handleCustomSubmit} className="space-y-3.5">
              <div>
                <label className="block text-xs font-medium text-[#3f3f46] mb-1">Email address</label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-[#a1a1aa] absolute left-3 top-2.5" />
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="name@company.com"
                    className="w-full pl-9 pr-3 py-2 bg-white border border-[#e4e4e7] rounded-lg text-xs text-[#171717] focus:outline-none focus:border-[#f03e2f]"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-[#3f3f46] mb-1">Password</label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-[#a1a1aa] absolute left-3 top-2.5" />
                  <input
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full pl-9 pr-3 py-2 bg-white border border-[#e4e4e7] rounded-lg text-xs text-[#171717] focus:outline-none focus:border-[#f03e2f]"
                  />
                </div>
              </div>

              <button type="submit" className="w-full btn btn-primary py-2 text-xs font-semibold mt-1">
                {authMode === 'signin' ? 'Sign In to Dashboard' : 'Create Free Account'}
              </button>
            </form>

            <div className="relative my-3">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-[#f1f1f2]" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-white px-2 text-[#71717a] font-mono text-[10px]">Or continue with</span>
              </div>
            </div>

            <button
              onClick={() => {
                onToast('Signed in via Google SSO (demo)');
                onBypassDemo();
              }}
              className="w-full btn btn-secondary text-xs py-2 flex items-center justify-center gap-2"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
              </svg>
              <span>Google Account</span>
            </button>

            <div className="text-center pt-2">
              <button
                onClick={onBypassDemo}
                className="text-xs text-[#71717a] hover:text-[#171717] underline"
              >
                Skip authentication (Preview demo fleet) →
              </button>
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="px-6 py-4 border-t border-[#e4e4e7] bg-white text-center text-xs text-[#71717a] font-mono">
        TurboPress · High-Performance Zero-DNS WordPress Optimization SaaS
      </footer>
    </div>
  );
};
