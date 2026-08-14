import React, { useState } from 'react';
import { Zap, X, Shield, Lock, Mail } from 'lucide-react';

interface AuthModalProps {
  isOpen: boolean;
  initialMode?: 'signin' | 'signup';
  onClose: () => void;
  onSuccess?: () => void;
  onToast: (msg: string) => void;
}

export const AuthModal: React.FC<AuthModalProps> = ({
  isOpen,
  initialMode = 'signin',
  onClose,
  onSuccess,
  onToast,
}) => {
  const [mode, setMode] = useState<'signin' | 'signup'>(initialMode);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  if (!isOpen) return null;

  const handleCustomSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;
    onToast(mode === 'signin' ? `Welcome back, ${email}` : `Account created for ${email}`);
    if (onSuccess) onSuccess();
    onClose();
  };

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md bg-white rounded-2xl border border-[#e4e4e7] shadow-2xl p-6 sm:p-8 relative overflow-hidden"
      >
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 w-7 h-7 rounded-full grid place-items-center text-[#71717a] hover:text-[#171717] hover:bg-[#f4f4f5] transition-colors"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Brand Header */}
        <div className="flex items-center gap-2.5 mb-6">
          <span className="w-8 h-8 rounded-lg bg-[#171717] text-white flex items-center justify-center">
            <Zap className="w-4 h-4 fill-current text-[#f03e2f]" />
          </span>
          <div>
            <h2 className="font-semibold text-lg tracking-tight text-[#171717]">
              SpeedForge Engine
            </h2>
            <p className="text-xs text-[#71717a]">Zero-DNS WordPress Optimization</p>
          </div>
        </div>

        {/* Mode Toggle Tabs */}
        <div className="grid grid-cols-2 p-1 bg-[#f4f4f5] rounded-xl mb-6 text-xs font-medium">
          <button
            onClick={() => setMode('signin')}
            className={`py-2 rounded-lg transition-colors ${
              mode === 'signin' ? 'bg-white text-[#171717] shadow-sm font-semibold' : 'text-[#71717a] hover:text-[#171717]'
            }`}
          >
            Sign in
          </button>
          <button
            onClick={() => setMode('signup')}
            className={`py-2 rounded-lg transition-colors ${
              mode === 'signup' ? 'bg-white text-[#171717] shadow-sm font-semibold' : 'text-[#71717a] hover:text-[#171717]'
            }`}
          >
            Create account
          </button>
        </div>

        {/* Form */}
        <div className="space-y-4">
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
              <div className="flex items-center justify-between mb-1">
                <label className="block text-xs font-medium text-[#3f3f46]">Password</label>
                {mode === 'signin' && (
                  <button
                    type="button"
                    onClick={() => onToast('Password reset link sent to your email')}
                    className="text-[11px] text-[#f03e2f] hover:underline"
                  >
                    Forgot?
                  </button>
                )}
              </div>
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

            <button type="submit" className="w-full btn btn-primary py-2 text-xs font-semibold mt-2">
              {mode === 'signin' ? 'Sign In to Control Plane' : 'Create Free Account'}
            </button>
          </form>

          <div className="relative my-4">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-[#f1f1f2]" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-white px-2 text-[#71717a] font-mono text-[10px]">Or continue with</span>
            </div>
          </div>

          {/* Social SSO Button */}
          <button
            onClick={() => {
              onToast('Signed in via Google SSO (demo)');
              onClose();
            }}
            className="w-full btn btn-secondary text-xs py-2 flex items-center justify-center gap-2"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24">
              <path
                fill="#4285F4"
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              />
              <path
                fill="#34A853"
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              />
              <path
                fill="#FBBC05"
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
              />
              <path
                fill="#EA4335"
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
              />
            </svg>
            <span>Google Account</span>
          </button>
        </div>

        {/* Footer Security Badge */}
        <div className="flex items-center justify-center gap-1.5 mt-6 pt-4 border-t border-[#f1f1f2] text-[11px] text-[#71717a]">
          <Shield className="w-3.5 h-3.5 text-[#16a34a]" />
          <span>Secured by Clerk JWT & Cloudflare Edge</span>
        </div>
      </div>
    </div>
  );
};
