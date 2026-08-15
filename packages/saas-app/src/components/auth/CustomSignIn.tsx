'use client';

import React, { useState } from 'react';
import { useSignIn, useClerk } from '@clerk/nextjs';
import { Mail, Lock, Eye, EyeOff, AlertCircle, ArrowLeft, CheckCircle2, Loader2, Sparkles } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

interface CustomSignInProps {
  redirectUrl?: string;
  onSuccess?: () => void;
  onSwitchToSignUp?: () => void;
  showFooter?: boolean;
}

export const CustomSignIn: React.FC<CustomSignInProps> = ({
  redirectUrl = '/',
  onSuccess,
  onSwitchToSignUp,
  showFooter = true,
}) => {
  const { signIn, isLoaded } = useSignIn();
  const { setActive } = useClerk();
  const router = useRouter();

  const [step, setStep] = useState<'credentials' | 'verify-email' | 'reset-password' | 'verify-reset'>('credentials');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [verificationCode, setVerificationCode] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [infoMessage, setInfoMessage] = useState('');

  // Handle Google OAuth SSO
  const handleGoogleSSO = async () => {
    if (!isLoaded || !signIn) return;
    setIsLoading(true);
    setErrorMessage('');

    try {
      await signIn.authenticateWithRedirect({
        strategy: 'oauth_google',
        redirectUrl: '/sso-callback',
        redirectUrlComplete: redirectUrl,
      });
    } catch (err: any) {
      setIsLoading(false);
      console.error('[Clerk Google SSO Error]', err);
      const msg = err?.errors?.[0]?.longMessage || err?.errors?.[0]?.message || err?.message || 'Google sign-in failed';
      setErrorMessage(msg);
    }
  };

  // Handle Credentials Submit
  const handleSignInSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isLoaded || !signIn) {
      setErrorMessage('Authentication service is initializing. Please try again in a moment.');
      return;
    }

    setIsLoading(true);
    setErrorMessage('');

    try {
      const result = await signIn.create({
        identifier: email.trim(),
        password,
      });

      if (result.status === 'complete') {
        if (result.createdSessionId) {
          await setActive({ session: result.createdSessionId });
        }
        if (onSuccess) onSuccess();
        else router.push(redirectUrl);
      } else if (result.status === 'needs_first_factor') {
        const factor = (result.supportedFirstFactors as any[])?.find(
          (f) => f.strategy === 'email_code'
        );
        if (factor?.emailAddressId) {
          await signIn.prepareFirstFactor({
            strategy: 'email_code',
            emailAddressId: factor.emailAddressId,
          } as any);
        }
        setStep('verify-email');
        setInfoMessage(`Verification code sent to ${email}`);
      } else {
        setErrorMessage(`Additional authentication required (${result.status})`);
      }
    } catch (err: any) {
      console.error('[Clerk SignIn Error]', err);
      const msg = err?.errors?.[0]?.longMessage || err?.errors?.[0]?.message || err?.message || 'Invalid email or password';
      setErrorMessage(msg);
    } finally {
      setIsLoading(false);
    }
  };

  // Handle Email Verification Code Submit
  const handleVerifyCodeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isLoaded || !signIn) return;

    setIsLoading(true);
    setErrorMessage('');

    try {
      const result = await signIn.attemptFirstFactor({
        strategy: 'email_code',
        code: verificationCode.trim(),
      });

      if (result.status === 'complete') {
        if (result.createdSessionId) {
          await setActive({ session: result.createdSessionId });
        }
        if (onSuccess) onSuccess();
        else router.push(redirectUrl);
      } else {
        setErrorMessage(`Verification incomplete (${result.status})`);
      }
    } catch (err: any) {
      const msg = err?.errors?.[0]?.longMessage || err?.errors?.[0]?.message || err?.message || 'Invalid verification code';
      setErrorMessage(msg);
    } finally {
      setIsLoading(false);
    }
  };

  // Handle Password Reset Request
  const handleResetPasswordRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isLoaded || !signIn) return;

    if (!email.trim()) {
      setErrorMessage('Please enter your account email address first.');
      return;
    }

    setIsLoading(true);
    setErrorMessage('');

    try {
      await signIn.create({
        strategy: 'reset_password_email_code',
        identifier: email.trim(),
      });
      setStep('verify-reset');
      setInfoMessage(`Password reset code dispatched to ${email}`);
    } catch (err: any) {
      const msg = err?.errors?.[0]?.longMessage || err?.errors?.[0]?.message || err?.message || 'Failed to send reset code';
      setErrorMessage(msg);
    } finally {
      setIsLoading(false);
    }
  };

  // Handle Password Reset Confirmation
  const handleResetPasswordConfirm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isLoaded || !signIn) return;

    setIsLoading(true);
    setErrorMessage('');

    try {
      const result = await signIn.attemptFirstFactor({
        strategy: 'reset_password_email_code',
        code: verificationCode.trim(),
        password: newPassword,
      });

      if (result.status === 'complete') {
        if (result.createdSessionId) {
          await setActive({ session: result.createdSessionId });
        }
        if (onSuccess) onSuccess();
        else router.push(redirectUrl);
      } else {
        setErrorMessage(`Password reset could not be completed (${result.status})`);
      }
    } catch (err: any) {
      const msg = err?.errors?.[0]?.longMessage || err?.errors?.[0]?.message || err?.message || 'Failed to reset password';
      setErrorMessage(msg);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="w-full space-y-5">
      {/* Header Info */}
      <div className="space-y-1 text-left">
        <h2 className="text-xl font-semibold tracking-tight text-[#171717]">
          {step === 'credentials' && 'Sign in to TurboPress'}
          {step === 'verify-email' && 'Verify your identity'}
          {step === 'reset-password' && 'Reset your password'}
          {step === 'verify-reset' && 'Create new password'}
        </h2>
        <p className="text-xs text-[#71717a]">
          {step === 'credentials' && 'Access the high-performance WordPress Edge Control Plane.'}
          {step === 'verify-email' && 'Enter the 6-digit code sent to your email.'}
          {step === 'reset-password' && 'We will dispatch a secure recovery code to your inbox.'}
          {step === 'verify-reset' && 'Enter the verification code and your new password.'}
        </p>
      </div>

      {/* Status Alerts */}
      {errorMessage && (
        <div className="flex items-start gap-2.5 p-3 rounded-xl bg-[#fef2f2] border border-red-200 text-red-700 text-xs animate-fade-in">
          <AlertCircle className="w-4 h-4 flex-none mt-0.5" />
          <span className="leading-relaxed">{errorMessage}</span>
        </div>
      )}

      {infoMessage && (
        <div className="flex items-start gap-2.5 p-3 rounded-xl bg-[#f0fdf4] border border-emerald-200 text-emerald-800 text-xs animate-fade-in">
          <CheckCircle2 className="w-4 h-4 flex-none mt-0.5 text-[#16a34a]" />
          <span className="leading-relaxed">{infoMessage}</span>
        </div>
      )}

      {/* Step: Standard Credentials */}
      {step === 'credentials' && (
        <>
          {/* Google 1-Click SSO */}
          <button
            type="button"
            onClick={handleGoogleSSO}
            disabled={isLoading}
            className="w-full flex items-center justify-center gap-2.5 py-2.5 px-4 bg-white border border-[#e4e4e7] hover:border-[#d4d4d8] hover:bg-[#f8f8f7] rounded-xl text-xs font-semibold text-[#171717] shadow-sm transition-all active:scale-[0.99]"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24">
              <path
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                fill="#4285F4"
              />
              <path
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                fill="#34A853"
              />
              <path
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                fill="#FBBC05"
              />
              <path
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                fill="#EA4335"
              />
            </svg>
            <span>Continue with Google</span>
          </button>

          {/* Divider */}
          <div className="relative flex items-center justify-center my-4">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-[#f1f1f2]" />
            </div>
            <span className="relative px-3 bg-white text-[10px] font-mono uppercase tracking-wider text-[#a1a1aa]">
              or sign in with email
            </span>
          </div>

          {/* Form */}
          <form onSubmit={handleSignInSubmit} className="space-y-3.5">
            <div>
              <label className="block text-xs font-medium text-[#3f3f46] mb-1 text-left">
                Work Email
              </label>
              <div className="relative">
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@domain.com"
                  className="w-full pl-9 pr-3.5 py-2.5 bg-white border border-[#e4e4e7] rounded-xl text-xs text-[#171717] placeholder:text-[#a1a1aa] focus:outline-none focus:border-[#f03e2f] focus:ring-2 focus:ring-[#f03e2f]/10 transition-all"
                />
                <Mail className="w-4 h-4 text-[#a1a1aa] absolute left-3 top-3" />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-medium text-[#3f3f46]">Password</label>
                <button
                  type="button"
                  onClick={() => {
                    setStep('reset-password');
                    setErrorMessage('');
                    setInfoMessage('');
                  }}
                  className="text-[11px] font-medium text-[#f03e2f] hover:underline"
                >
                  Forgot password?
                </button>
              </div>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••••••"
                  className="w-full pl-9 pr-10 py-2.5 bg-white border border-[#e4e4e7] rounded-xl text-xs text-[#171717] placeholder:text-[#a1a1aa] focus:outline-none focus:border-[#f03e2f] focus:ring-2 focus:ring-[#f03e2f]/10 transition-all"
                />
                <Lock className="w-4 h-4 text-[#a1a1aa] absolute left-3 top-3" />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-3 text-[#a1a1aa] hover:text-[#171717] transition-colors"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full flex items-center justify-center gap-2 py-2.5 px-4 bg-[#171717] hover:bg-black text-white text-xs font-semibold rounded-xl shadow-sm transition-all active:scale-[0.99] disabled:opacity-60"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Authenticating…</span>
                </>
              ) : (
                <>
                  <span>Sign In</span>
                  <Sparkles className="w-3.5 h-3.5 text-[#f03e2f]" />
                </>
              )}
            </button>
          </form>
        </>
      )}

      {/* Step: OTP Verification */}
      {step === 'verify-email' && (
        <form onSubmit={handleVerifyCodeSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-[#3f3f46] mb-1.5 text-left">
              Verification Code
            </label>
            <input
              type="text"
              required
              autoFocus
              maxLength={6}
              value={verificationCode}
              onChange={(e) => setVerificationCode(e.target.value)}
              placeholder="123456"
              className="w-full py-3 text-center font-mono text-xl tracking-widest bg-white border border-[#e4e4e7] rounded-xl text-[#171717] focus:outline-none focus:border-[#f03e2f] focus:ring-2 focus:ring-[#f03e2f]/10 transition-all"
            />
          </div>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => {
                setStep('credentials');
                setErrorMessage('');
              }}
              className="flex-1 py-2.5 px-3 bg-white border border-[#e4e4e7] hover:bg-[#f8f8f7] text-xs font-medium text-[#3f3f46] rounded-xl transition-all"
            >
              Back
            </button>
            <button
              type="submit"
              disabled={isLoading || verificationCode.length < 6}
              className="flex-[2] flex items-center justify-center gap-2 py-2.5 px-4 bg-[#171717] hover:bg-black text-white text-xs font-semibold rounded-xl transition-all disabled:opacity-60"
            >
              {isLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <span>Verify & Continue</span>}
            </button>
          </div>
        </form>
      )}

      {/* Step: Password Reset Request */}
      {step === 'reset-password' && (
        <form onSubmit={handleResetPasswordRequest} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-[#3f3f46] mb-1 text-left">
              Account Email
            </label>
            <div className="relative">
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@domain.com"
                className="w-full pl-9 pr-3.5 py-2.5 bg-white border border-[#e4e4e7] rounded-xl text-xs text-[#171717] focus:outline-none focus:border-[#f03e2f] focus:ring-2 focus:ring-[#f03e2f]/10 transition-all"
              />
              <Mail className="w-4 h-4 text-[#a1a1aa] absolute left-3 top-3" />
            </div>
          </div>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => {
                setStep('credentials');
                setErrorMessage('');
              }}
              className="flex-1 py-2.5 px-3 bg-white border border-[#e4e4e7] hover:bg-[#f8f8f7] text-xs font-medium text-[#3f3f46] rounded-xl transition-all"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isLoading}
              className="flex-[2] flex items-center justify-center gap-2 py-2.5 px-4 bg-[#171717] hover:bg-black text-white text-xs font-semibold rounded-xl transition-all disabled:opacity-60"
            >
              {isLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <span>Send Reset Code</span>}
            </button>
          </div>
        </form>
      )}

      {/* Step: Password Reset Verification */}
      {step === 'verify-reset' && (
        <form onSubmit={handleResetPasswordConfirm} className="space-y-3.5">
          <div>
            <label className="block text-xs font-medium text-[#3f3f46] mb-1 text-left">
              Reset Code
            </label>
            <input
              type="text"
              required
              maxLength={6}
              value={verificationCode}
              onChange={(e) => setVerificationCode(e.target.value)}
              placeholder="123456"
              className="w-full py-2.5 text-center font-mono text-lg tracking-widest bg-white border border-[#e4e4e7] rounded-xl text-[#171717] focus:outline-none focus:border-[#f03e2f] focus:ring-2 focus:ring-[#f03e2f]/10 transition-all"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-[#3f3f46] mb-1 text-left">
              New Password
            </label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                required
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="••••••••••••"
                className="w-full pl-9 pr-10 py-2.5 bg-white border border-[#e4e4e7] rounded-xl text-xs text-[#171717] focus:outline-none focus:border-[#f03e2f] focus:ring-2 focus:ring-[#f03e2f]/10 transition-all"
              />
              <Lock className="w-4 h-4 text-[#a1a1aa] absolute left-3 top-3" />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-3 text-[#a1a1aa] hover:text-[#171717]"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={() => {
                setStep('credentials');
                setErrorMessage('');
              }}
              className="flex-1 py-2.5 px-3 bg-white border border-[#e4e4e7] hover:bg-[#f8f8f7] text-xs font-medium text-[#3f3f46] rounded-xl transition-all"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isLoading || !newPassword || verificationCode.length < 6}
              className="flex-[2] flex items-center justify-center gap-2 py-2.5 px-4 bg-[#171717] hover:bg-black text-white text-xs font-semibold rounded-xl transition-all disabled:opacity-60"
            >
              {isLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <span>Update Password</span>}
            </button>
          </div>
        </form>
      )}

      {/* Footer Switcher */}
      {showFooter && step === 'credentials' && (
        <div className="pt-3 border-t border-[#f1f1f2] text-center text-xs text-[#71717a]">
          <span>Don&apos;t have an account?</span>{' '}
          {onSwitchToSignUp ? (
            <button
              type="button"
              onClick={onSwitchToSignUp}
              className="text-[#f03e2f] font-semibold hover:underline"
            >
              Register here
            </button>
          ) : (
            <Link href="/sign-up" className="text-[#f03e2f] font-semibold hover:underline">
              Register here
            </Link>
          )}
        </div>
      )}
    </div>
  );
};
