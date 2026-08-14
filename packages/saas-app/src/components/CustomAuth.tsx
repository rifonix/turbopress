import React, { useState } from 'react';
import { useSignIn, useSignUp, useClerk } from '@clerk/clerk-react';
import { isClerkAPIResponseError } from '@clerk/clerk-react/errors';
import { Mail, Lock, Eye, EyeOff, AlertCircle, ArrowLeft, CheckCircle2, Loader2, Sparkles } from 'lucide-react';

interface CustomAuthProps {
  initialMode?: 'signin' | 'signup';
  onSuccess?: () => void;
  onToast?: (msg: string, type?: 'success' | 'info' | 'error') => void;
}

export const CustomAuth: React.FC<CustomAuthProps> = ({
  initialMode = 'signin',
  onSuccess,
  onToast,
}) => {
  const { setActive } = useClerk();
  const { signIn, isLoaded: isSignInLoaded } = useSignIn();
  const { signUp, isLoaded: isSignUpLoaded } = useSignUp();

  const [mode, setMode] = useState<'signin' | 'signup'>(initialMode);
  const [step, setStep] = useState<'credentials' | 'verify-email' | 'reset-password' | 'verify-reset'>('credentials');

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [verificationCode, setVerificationCode] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [infoMessage, setInfoMessage] = useState('');

  const isLoaded = isSignInLoaded && isSignUpLoaded;

  // Handle Google OAuth SSO
  const handleGoogleSSO = async () => {
    if (!isLoaded) return;
    setIsLoading(true);
    setErrorMessage('');

    try {
      if (mode === 'signin' && signIn) {
        await signIn.authenticateWithRedirect({
          strategy: 'oauth_google',
          redirectUrl: window.location.origin,
          redirectUrlComplete: window.location.origin,
        });
      } else if (signUp) {
        await signUp.authenticateWithRedirect({
          strategy: 'oauth_google',
          redirectUrl: window.location.origin,
          redirectUrlComplete: window.location.origin,
        });
      }
    } catch (err: any) {
      setIsLoading(false);
      console.error('[Clerk Google SSO Error]', err);
      if (isClerkAPIResponseError(err)) {
        setErrorMessage(err.errors[0]?.longMessage || err.errors[0]?.message || 'Google sign-in failed');
      } else {
        setErrorMessage(err?.message || 'Google sign-in failed');
      }
    }
  };

  // Handle Sign In Submission
  const handleSignInSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isLoaded || !signIn) return;
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
        if (onToast) onToast('Signed in successfully', 'success');
        if (onSuccess) onSuccess();
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
      if (isClerkAPIResponseError(err)) {
        setErrorMessage(err.errors[0]?.longMessage || err.errors[0]?.message || 'Invalid email or password');
      } else {
        setErrorMessage(err?.message || 'Failed to sign in');
      }
    } finally {
      setIsLoading(false);
    }
  };

  // Handle Sign Up Submission
  const handleSignUpSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isLoaded || !signUp) return;
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
        if (onToast) onToast('Account created and signed in!', 'success');
        if (onSuccess) onSuccess();
      } else {
        // Attempt to prepare email verification code
        try {
          await signUp.prepareEmailAddressVerification({ strategy: 'email_code' });
        } catch (prepErr) {
          console.warn('[Clerk] Email verification preparation note:', prepErr);
        }
        setStep('verify-email');
        setInfoMessage(`We sent a 6-digit verification code to ${email}`);
      }
    } catch (err: any) {
      console.error('[Clerk SignUp Error]', err);
      if (isClerkAPIResponseError(err)) {
        setErrorMessage(err.errors[0]?.longMessage || err.errors[0]?.message || 'Registration failed');
      } else {
        setErrorMessage(err?.message || 'Failed to create account');
      }
    } finally {
      setIsLoading(false);
    }
  };

  // Handle Email Verification Code
  const handleVerifyEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isLoaded) return;
    setIsLoading(true);
    setErrorMessage('');

    try {
      if (mode === 'signup' && signUp) {
        const result = await signUp.attemptEmailAddressVerification({
          code: verificationCode.trim(),
        });

        if (result.status === 'complete') {
          if (result.createdSessionId) {
            await setActive({ session: result.createdSessionId });
          }
          if (onToast) onToast('Email verified successfully! Welcome to TurboPress.', 'success');
          if (onSuccess) onSuccess();
        } else {
          setErrorMessage('Verification incomplete. Please check your code and try again.');
        }
      } else if (mode === 'signin' && signIn) {
        const result = await signIn.attemptFirstFactor({
          strategy: 'email_code',
          code: verificationCode.trim(),
        });

        if (result.status === 'complete') {
          if (result.createdSessionId) {
            await setActive({ session: result.createdSessionId });
          }
          if (onToast) onToast('Signed in successfully', 'success');
          if (onSuccess) onSuccess();
        }
      }
    } catch (err: any) {
      console.error('[Clerk Verification Error]', err);
      if (isClerkAPIResponseError(err)) {
        setErrorMessage(err.errors[0]?.longMessage || err.errors[0]?.message || 'Invalid verification code');
      } else {
        setErrorMessage(err?.message || 'Verification failed');
      }
    } finally {
      setIsLoading(false);
    }
  };

  // Handle Resend Verification Code
  const handleResendCode = async () => {
    if (!isLoaded) return;
    setIsLoading(true);
    setErrorMessage('');

    try {
      if (mode === 'signup' && signUp) {
        await signUp.prepareEmailAddressVerification({ strategy: 'email_code' });
        setInfoMessage(`A fresh verification code was sent to ${email}`);
      } else if (mode === 'signin' && signIn) {
        const factor = (signIn.supportedFirstFactors as any[])?.find(
          (f) => f.strategy === 'email_code'
        );
        if (factor?.emailAddressId) {
          await signIn.prepareFirstFactor({
            strategy: 'email_code',
            emailAddressId: factor.emailAddressId,
          } as any);
          setInfoMessage(`A fresh verification code was sent to ${email}`);
        }
      }
    } catch (err: any) {
      if (isClerkAPIResponseError(err)) {
        setErrorMessage(err.errors[0]?.longMessage || err.errors[0]?.message || 'Failed to resend code');
      } else {
        setErrorMessage(err?.message || 'Failed to resend code');
      }
    } finally {
      setIsLoading(false);
    }
  };

  // Handle Password Reset Request
  const handleRequestPasswordReset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isLoaded || !signIn) return;
    if (!email) {
      setErrorMessage('Please enter your email address first');
      return;
    }
    setIsLoading(true);
    setErrorMessage('');

    try {
      const resetAttempt = await signIn.create({
        strategy: 'reset_password_email_code',
        identifier: email.trim(),
      });

      const resetFactor = (resetAttempt.supportedFirstFactors as any[])?.find(
        (f) => f.strategy === 'reset_password_email_code'
      );

      if (resetFactor?.emailAddressId) {
        await signIn.prepareFirstFactor({
          strategy: 'reset_password_email_code',
          emailAddressId: resetFactor.emailAddressId,
        } as any);
      }

      setStep('verify-reset');
      setInfoMessage(`We sent a password reset code to ${email}`);
    } catch (err: any) {
      console.error('[Clerk Reset Error]', err);
      if (isClerkAPIResponseError(err)) {
        setErrorMessage(err.errors[0]?.longMessage || err.errors[0]?.message || 'Failed to send reset code');
      } else {
        setErrorMessage(err?.message || 'Failed to send reset code');
      }
    } finally {
      setIsLoading(false);
    }
  };

  // Handle Password Reset Confirmation
  const handleConfirmPasswordReset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isLoaded || !signIn) return;
    setIsLoading(true);
    setErrorMessage('');

    try {
      const result = await signIn.attemptFirstFactor({
        strategy: 'reset_password_email_code',
        code: verificationCode.trim(),
      });

      if (result.status === 'needs_new_password') {
        const resetResult = await signIn.resetPassword({
          password: newPassword,
        });

        if (resetResult.status === 'complete') {
          if (resetResult.createdSessionId) {
            await setActive({ session: resetResult.createdSessionId });
          }
          if (onToast) onToast('Password reset successfully! Signed in.', 'success');
          if (onSuccess) onSuccess();
        }
      }
    } catch (err: any) {
      console.error('[Clerk Reset Confirm Error]', err);
      if (isClerkAPIResponseError(err)) {
        setErrorMessage(err.errors[0]?.longMessage || err.errors[0]?.message || 'Reset failed');
      } else {
        setErrorMessage(err?.message || 'Reset failed');
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="w-full text-left">
      {/* Turnstile Bot Detection Anchor for Clerk */}
      <div id="clerk-captcha" className="hidden" />

      {/* STEP: Verify Email OTP Code */}
      {step === 'verify-email' && (
        <div className="space-y-4 animate-fade-in">
          <div>
            <button
              onClick={() => {
                setStep('credentials');
                setErrorMessage('');
                setInfoMessage('');
              }}
              className="flex items-center gap-1 text-xs text-[#71717a] hover:text-[#171717] font-medium mb-3 transition-colors"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Back</span>
            </button>
            <h3 className="text-xl font-semibold tracking-tight text-[#171717]">
              Verify your email
            </h3>
            <p className="text-xs text-[#71717a] mt-1">
              Enter the 6-digit verification code sent to <strong className="text-[#171717]">{email}</strong>
            </p>
          </div>

          {infoMessage && (
            <div className="flex items-center gap-2 p-3 bg-[#f0fdf4] border border-[#dcfce7] rounded-xl text-xs text-[#15803d]">
              <CheckCircle2 className="w-4 h-4 flex-none" />
              <span>{infoMessage}</span>
            </div>
          )}

          {errorMessage && (
            <div className="flex items-start gap-2 p-3 bg-[#fef2f2] border border-[#fecaca] rounded-xl text-xs text-[#dc2626]">
              <AlertCircle className="w-4 h-4 flex-none mt-0.5" />
              <span>{errorMessage}</span>
            </div>
          )}

          <form onSubmit={handleVerifyEmail} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-[#3f3f46] mb-1.5">Verification Code</label>
              <input
                type="text"
                required
                autoFocus
                maxLength={6}
                value={verificationCode}
                onChange={(e) => setVerificationCode(e.target.value.replace(/\D/g, ''))}
                placeholder="123456"
                className="w-full px-4 py-3 bg-white border border-[#e4e4e7] rounded-xl text-center font-mono text-xl tracking-[0.3em] text-[#171717] focus:outline-none focus:border-[#f03e2f] focus:ring-2 focus:ring-red-100"
              />
            </div>

            <div className="flex items-center justify-between text-xs">
              <span className="text-[#71717a]">Didn't receive code?</span>
              <button
                type="button"
                onClick={handleResendCode}
                disabled={isLoading}
                className="text-[#f03e2f] hover:underline font-medium"
              >
                Resend code
              </button>
            </div>

            <button
              type="submit"
              disabled={isLoading || verificationCode.length < 6}
              className="w-full btn btn-primary py-2.5 text-xs font-semibold flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
              <span>Verify & Launch Dashboard</span>
            </button>
          </form>
        </div>
      )}

      {/* STEP: Request Password Reset */}
      {step === 'reset-password' && (
        <div className="space-y-4 animate-fade-in">
          <div>
            <button
              onClick={() => {
                setStep('credentials');
                setErrorMessage('');
              }}
              className="flex items-center gap-1 text-xs text-[#71717a] hover:text-[#171717] font-medium mb-3 transition-colors"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Back to sign in</span>
            </button>
            <h3 className="text-xl font-semibold tracking-tight text-[#171717]">
              Reset your password
            </h3>
            <p className="text-xs text-[#71717a] mt-1">
              Enter your email address to receive a secure recovery code.
            </p>
          </div>

          {errorMessage && (
            <div className="flex items-start gap-2 p-3 bg-[#fef2f2] border border-[#fecaca] rounded-xl text-xs text-[#dc2626]">
              <AlertCircle className="w-4 h-4 flex-none mt-0.5" />
              <span>{errorMessage}</span>
            </div>
          )}

          <form onSubmit={handleRequestPasswordReset} className="space-y-3.5">
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

            <button
              type="submit"
              disabled={isLoading}
              className="w-full btn btn-primary py-2.5 text-xs font-semibold flex items-center justify-center gap-2"
            >
              {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              <span>Send Recovery Code</span>
            </button>
          </form>
        </div>
      )}

      {/* STEP: Verify Reset Code & Set New Password */}
      {step === 'verify-reset' && (
        <div className="space-y-4 animate-fade-in">
          <div>
            <button
              onClick={() => {
                setStep('reset-password');
                setErrorMessage('');
              }}
              className="flex items-center gap-1 text-xs text-[#71717a] hover:text-[#171717] font-medium mb-3 transition-colors"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Change email</span>
            </button>
            <h3 className="text-xl font-semibold tracking-tight text-[#171717]">
              Enter recovery code
            </h3>
            <p className="text-xs text-[#71717a] mt-1">
              Check your inbox at <strong className="text-[#171717]">{email}</strong>
            </p>
          </div>

          {infoMessage && (
            <div className="flex items-center gap-2 p-3 bg-[#f0fdf4] border border-[#dcfce7] rounded-xl text-xs text-[#15803d]">
              <CheckCircle2 className="w-4 h-4 flex-none" />
              <span>{infoMessage}</span>
            </div>
          )}

          {errorMessage && (
            <div className="flex items-start gap-2 p-3 bg-[#fef2f2] border border-[#fecaca] rounded-xl text-xs text-[#dc2626]">
              <AlertCircle className="w-4 h-4 flex-none mt-0.5" />
              <span>{errorMessage}</span>
            </div>
          )}

          <form onSubmit={handleConfirmPasswordReset} className="space-y-3.5">
            <div>
              <label className="block text-xs font-medium text-[#3f3f46] mb-1">Recovery Code</label>
              <input
                type="text"
                required
                maxLength={6}
                value={verificationCode}
                onChange={(e) => setVerificationCode(e.target.value.replace(/\D/g, ''))}
                placeholder="123456"
                className="w-full px-3 py-2 bg-white border border-[#e4e4e7] rounded-lg font-mono text-center text-sm tracking-widest text-[#171717] focus:outline-none focus:border-[#f03e2f]"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-[#3f3f46] mb-1">New Password</label>
              <div className="relative">
                <Lock className="w-4 h-4 text-[#a1a1aa] absolute left-3 top-2.5" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  minLength={8}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Min 8 characters"
                  className="w-full pl-9 pr-9 py-2 bg-white border border-[#e4e4e7] rounded-lg text-xs text-[#171717] focus:outline-none focus:border-[#f03e2f]"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-2.5 text-[#a1a1aa] hover:text-[#171717]"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full btn btn-primary py-2.5 text-xs font-semibold flex items-center justify-center gap-2"
            >
              {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              <span>Save Password & Sign In</span>
            </button>
          </form>
        </div>
      )}

      {/* STEP: Credentials Form (Sign In / Sign Up) */}
      {step === 'credentials' && (
        <div className="space-y-4">
          {/* Top Mode Toggle Tabs */}
          <div className="grid grid-cols-2 p-1 bg-[#f4f4f5] rounded-xl text-xs font-medium">
            <button
              type="button"
              onClick={() => {
                setMode('signin');
                setErrorMessage('');
              }}
              className={`py-1.5 rounded-lg transition-all ${
                mode === 'signin'
                  ? 'bg-white text-[#171717] font-semibold shadow-sm'
                  : 'text-[#71717a] hover:text-[#171717]'
              }`}
            >
              Sign In
            </button>
            <button
              type="button"
              onClick={() => {
                setMode('signup');
                setErrorMessage('');
              }}
              className={`py-1.5 rounded-lg transition-all ${
                mode === 'signup'
                  ? 'bg-white text-[#171717] font-semibold shadow-sm'
                  : 'text-[#71717a] hover:text-[#171717]'
              }`}
            >
              Create Account
            </button>
          </div>

          {/* Social SSO Button */}
          <button
            type="button"
            onClick={handleGoogleSSO}
            disabled={isLoading}
            className="w-full btn btn-secondary text-xs py-2.5 flex items-center justify-center gap-2.5 hover:bg-[#f4f4f5] transition-colors"
          >
            <svg className="w-4 h-4 flex-none" viewBox="0 0 24 24">
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
            <span>Continue with Google</span>
          </button>

          {/* Divider */}
          <div className="relative my-3">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-[#f1f1f2]" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-white px-2.5 text-[#a1a1aa] font-mono text-[10px]">or with email</span>
            </div>
          </div>

          {/* Error Banner */}
          {errorMessage && (
            <div className="flex items-start gap-2 p-3 bg-[#fef2f2] border border-[#fecaca] rounded-xl text-xs text-[#dc2626]">
              <AlertCircle className="w-4 h-4 flex-none mt-0.5" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Form */}
          <form onSubmit={mode === 'signin' ? handleSignInSubmit : handleSignUpSubmit} className="space-y-3">
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
                  className="w-full pl-9 pr-3 py-2 bg-white border border-[#e4e4e7] rounded-lg text-xs text-[#171717] focus:outline-none focus:border-[#f03e2f] transition-colors"
                />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-xs font-medium text-[#3f3f46]">Password</label>
                {mode === 'signin' && (
                  <button
                    type="button"
                    onClick={() => {
                      setStep('reset-password');
                      setErrorMessage('');
                    }}
                    className="text-[11px] text-[#f03e2f] hover:underline"
                  >
                    Forgot password?
                  </button>
                )}
              </div>
              <div className="relative">
                <Lock className="w-4 h-4 text-[#a1a1aa] absolute left-3 top-2.5" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  minLength={8}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={mode === 'signup' ? 'Min 8 characters' : '••••••••'}
                  className="w-full pl-9 pr-9 py-2 bg-white border border-[#e4e4e7] rounded-lg text-xs text-[#171717] focus:outline-none focus:border-[#f03e2f] transition-colors"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-2.5 text-[#a1a1aa] hover:text-[#171717]"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full btn btn-primary py-2.5 text-xs font-semibold flex items-center justify-center gap-2 mt-2"
            >
              {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              <span>{mode === 'signin' ? 'Sign In to Dashboard' : 'Create Free Account'}</span>
            </button>
          </form>
        </div>
      )}
    </div>
  );
};
