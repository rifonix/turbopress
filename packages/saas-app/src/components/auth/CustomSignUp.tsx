'use client';

import React, { useState } from 'react';
import { useSignUp, useClerk } from '@clerk/nextjs';
import { Mail, Lock, Eye, EyeOff, AlertCircle, CheckCircle2, Loader2, Sparkles, ShieldCheck } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

interface CustomSignUpProps {
  redirectUrl?: string;
  onSuccess?: () => void;
  onSwitchToSignIn?: () => void;
  showFooter?: boolean;
}

export const CustomSignUp: React.FC<CustomSignUpProps> = ({
  redirectUrl = '/',
  onSuccess,
  onSwitchToSignIn,
  showFooter = true,
}) => {
  const { signUp, isLoaded } = useSignUp();
  const { setActive } = useClerk();
  const router = useRouter();

  const [step, setStep] = useState<'credentials' | 'verify-email'>('credentials');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [verificationCode, setVerificationCode] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [infoMessage, setInfoMessage] = useState('');

  // Google OAuth SSO
  const handleGoogleSSO = async () => {
    if (!isLoaded || !signUp) return;
    setIsLoading(true);
    setErrorMessage('');

    try {
      await signUp.authenticateWithRedirect({
        strategy: 'oauth_google',
        redirectUrl: '/sso-callback',
        redirectUrlComplete: redirectUrl,
      });
    } catch (err: any) {
      setIsLoading(false);
      console.error('[Clerk Google Sign-Up Error]', err);
      const msg = err?.errors?.[0]?.longMessage || err?.errors?.[0]?.message || err?.message || 'Google registration failed';
      setErrorMessage(msg);
    }
  };

  // Credentials Submit
  const handleSignUpSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isLoaded || !signUp) {
      setErrorMessage('Registration service is initializing. Please try again in a moment.');
      return;
    }

    if (password.length < 8) {
      setErrorMessage('Password must contain at least 8 characters.');
      return;
    }

    setIsLoading(true);
    setErrorMessage('');

    try {
      const result = await signUp.create({
        emailAddress: email.trim(),
        password,
      });

      if (result.status === 'complete') {
        if (result.createdSessionId) {
          await setActive({ session: result.createdSessionId });
        }
        if (onSuccess) onSuccess();
        else router.push(redirectUrl);
      } else {
        // Send email verification code
        await signUp.prepareEmailAddressVerification({ strategy: 'email_code' });
        setStep('verify-email');
        setInfoMessage(`We sent a 6-digit verification code to ${email}`);
      }
    } catch (err: any) {
      console.error('[Clerk SignUp Error]', err);
      const msg = err?.errors?.[0]?.longMessage || err?.errors?.[0]?.message || err?.message || 'Registration failed';
      setErrorMessage(msg);
    } finally {
      setIsLoading(false);
    }
  };

  // Verification Code Submit
  const handleVerifyCodeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isLoaded || !signUp) return;

    setIsLoading(true);
    setErrorMessage('');

    try {
      const result = await signUp.attemptEmailAddressVerification({
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
      console.error('[Clerk Verify Error]', err);
      const msg = err?.errors?.[0]?.longMessage || err?.errors?.[0]?.message || err?.message || 'Invalid verification code';
      setErrorMessage(msg);
    } finally {
      setIsLoading(false);
    }
  };

  // Resend Code
  const handleResendCode = async () => {
    if (!isLoaded || !signUp) return;
    try {
      await signUp.prepareEmailAddressVerification({ strategy: 'email_code' });
      setInfoMessage(`New verification code sent to ${email}`);
    } catch (err: any) {
      setErrorMessage('Failed to resend code. Please wait a moment.');
    }
  };

  return (
    <div className="w-full space-y-5">
      {/* Header */}
      <div className="space-y-1 text-left">
        <h2 className="text-xl font-semibold tracking-tight text-[#171717]">
          {step === 'credentials' ? 'Create your TurboPress account' : 'Verify your email address'}
        </h2>
        <p className="text-xs text-[#71717a]">
          {step === 'credentials'
            ? 'Supercharge your WordPress sites with sub-15ms edge caching.'
            : `Enter the code dispatched to ${email}`}
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

      {/* Step: Credentials */}
      {step === 'credentials' && (
        <>
          {/* Google SSO */}
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
            <span>Sign up with Google</span>
          </button>

          {/* Divider */}
          <div className="relative flex items-center justify-center my-4">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-[#f1f1f2]" />
            </div>
            <span className="relative px-3 bg-white text-[10px] font-mono uppercase tracking-wider text-[#a1a1aa]">
              or register with email
            </span>
          </div>

          <form onSubmit={handleSignUpSubmit} className="space-y-3.5">
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
              <label className="block text-xs font-medium text-[#3f3f46] mb-1 text-left">
                Password
              </label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  minLength={8}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="At least 8 characters"
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
              <p className="text-[11px] text-[#a1a1aa] mt-1 text-left">
                Must include 8+ characters for enterprise grade encryption.
              </p>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full flex items-center justify-center gap-2 py-2.5 px-4 bg-[#171717] hover:bg-black text-white text-xs font-semibold rounded-xl shadow-sm transition-all active:scale-[0.99] disabled:opacity-60"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Creating Account…</span>
                </>
              ) : (
                <>
                  <span>Create Account</span>
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
              6-Digit Code
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

          <div className="flex items-center justify-between text-xs">
            <button
              type="button"
              onClick={handleResendCode}
              className="text-[#f03e2f] hover:underline font-medium"
            >
              Resend verification code
            </button>
            <span className="text-[#a1a1aa]">Check spam folder if delayed</span>
          </div>

          <div className="flex gap-2 pt-2">
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
              {isLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <span>Complete Registration</span>}
            </button>
          </div>
        </form>
      )}

      {/* Footer Switcher */}
      {showFooter && step === 'credentials' && (
        <div className="pt-3 border-t border-[#f1f1f2] text-center text-xs text-[#71717a]">
          <span>Already have an account?</span>{' '}
          {onSwitchToSignIn ? (
            <button
              type="button"
              onClick={onSwitchToSignIn}
              className="text-[#f03e2f] font-semibold hover:underline"
            >
              Sign in
            </button>
          ) : (
            <Link href="/sign-in" className="text-[#f03e2f] font-semibold hover:underline">
              Sign in
            </Link>
          )}
        </div>
      )}
    </div>
  );
};
