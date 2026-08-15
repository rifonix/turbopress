'use client';

import React, { useState } from 'react';
import { X, Zap } from 'lucide-react';
import { SignIn, SignUp } from '@clerk/nextjs';
import { turbopressClerkAppearance } from './ClerkTheme';

interface AuthModalProps {
  isOpen: boolean;
  initialMode?: 'signin' | 'signup';
  onClose: () => void;
  onSuccess?: () => void;
}

export const AuthModal: React.FC<AuthModalProps> = ({
  isOpen,
  initialMode = 'signin',
  onClose,
}) => {
  const [mode, setMode] = useState<'signin' | 'signup'>(initialMode);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        onClick={onClose}
        className="fixed inset-0 bg-black/50 backdrop-blur-sm transition-opacity"
      />

      {/* Modal Card */}
      <div className="relative w-full max-w-md bg-white border border-[#e4e4e7] rounded-2xl shadow-2xl p-6 sm:p-8 z-10 animate-fade-in text-[#171717] max-h-[90vh] overflow-y-auto">
        {/* Top Header */}
        <div className="flex items-center justify-between pb-4 mb-5 border-b border-[#f1f1f2]">
          <div className="flex items-center gap-2">
            <span className="w-7 h-7 rounded-lg bg-[#171717] text-white flex items-center justify-center text-xs font-bold shadow-sm">
              <Zap className="w-3.5 h-3.5 text-[#f03e2f] fill-current" />
            </span>
            <div>
              <h3 className="font-semibold text-sm text-[#171717]">TurboPress Engine</h3>
              <p className="text-[11px] text-[#71717a]">Zero-DNS WordPress Acceleration</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Mode Switch Tabs */}
            <div className="flex bg-[#f4f4f5] p-0.5 rounded-lg text-xs font-medium">
              <button
                type="button"
                onClick={() => setMode('signin')}
                className={`px-2.5 py-1 rounded-md transition-all ${
                  mode === 'signin'
                    ? 'bg-white text-[#171717] font-semibold shadow-sm'
                    : 'text-[#71717a] hover:text-[#171717]'
                }`}
              >
                Sign In
              </button>
              <button
                type="button"
                onClick={() => setMode('signup')}
                className={`px-2.5 py-1 rounded-md transition-all ${
                  mode === 'signup'
                    ? 'bg-white text-[#171717] font-semibold shadow-sm'
                    : 'text-[#71717a] hover:text-[#171717]'
                }`}
              >
                Register
              </button>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="w-7 h-7 grid place-items-center text-[#71717a] hover:text-[#171717] hover:bg-[#f4f4f5] rounded-lg transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Auth Body */}
        <div className="flex justify-center">
          {mode === 'signin' ? (
            <SignIn
              appearance={turbopressClerkAppearance}
              routing="hash"
              signUpUrl="/sign-up"
              fallbackRedirectUrl="/"
            />
          ) : (
            <SignUp
              appearance={turbopressClerkAppearance}
              routing="hash"
              signInUrl="/sign-in"
              fallbackRedirectUrl="/"
            />
          )}
        </div>
      </div>
    </div>
  );
};
