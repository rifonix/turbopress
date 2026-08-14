import React, { useState } from 'react';
import { X, Shield } from 'lucide-react';
import { SignIn, SignUp } from '@clerk/clerk-react';

interface AuthModalProps {
  isOpen: boolean;
  initialMode?: 'signin' | 'signup';
  onClose: () => void;
  onSuccess?: () => void;
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

export const AuthModal: React.FC<AuthModalProps> = ({
  isOpen,
  initialMode = 'signin',
  onClose,
}) => {
  const [mode, setMode] = useState<'signin' | 'signup'>(initialMode);

  if (!isOpen) return null;

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
          aria-label="Close"
          className="absolute top-4 right-4 w-7 h-7 rounded-full grid place-items-center text-[#71717a] hover:text-[#171717] hover:bg-[#f4f4f5] transition-colors z-10"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Header Mode Switcher */}
        <div className="flex items-center justify-between mb-4 pb-3 border-b border-[#f1f1f2] mr-8">
          <div className="flex items-center gap-2">
            <span className="w-7 h-7 rounded-lg bg-[#171717] text-white flex items-center justify-center text-xs font-bold shadow-sm">
              TP
            </span>
            <span className="font-semibold text-sm text-[#171717]">
              {mode === 'signin' ? 'Sign In' : 'Create Account'}
            </span>
          </div>

          <div className="flex gap-1 bg-[#f4f4f5] p-0.5 rounded-lg text-xs font-medium">
            <button
              onClick={() => setMode('signin')}
              className={`px-2.5 py-1 rounded-md transition-colors ${
                mode === 'signin'
                  ? 'bg-white text-[#171717] font-semibold shadow-sm'
                  : 'text-[#71717a] hover:text-[#171717]'
              }`}
            >
              Sign In
            </button>
            <button
              onClick={() => setMode('signup')}
              className={`px-2.5 py-1 rounded-md transition-colors ${
                mode === 'signup'
                  ? 'bg-white text-[#171717] font-semibold shadow-sm'
                  : 'text-[#71717a] hover:text-[#171717]'
              }`}
            >
              Register
            </button>
          </div>
        </div>

        {/* Clerk In-Place Form */}
        <div className="pt-1">
          {mode === 'signin' ? (
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

        {/* Footer Security Badge */}
        <div className="flex items-center justify-center gap-1.5 mt-4 pt-3 border-t border-[#f1f1f2] text-[11px] text-[#71717a]">
          <Shield className="w-3.5 h-3.5 text-[#16a34a]" />
          <span>Secured by Clerk & Cloudflare Edge</span>
        </div>
      </div>
    </div>
  );
};
