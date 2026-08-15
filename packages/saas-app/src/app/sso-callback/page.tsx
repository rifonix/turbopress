'use client';

import { AuthenticateWithRedirectCallback } from '@clerk/nextjs';

export default function SSOCallbackPage() {
  return (
    <div className="min-h-screen bg-[#f8f8f7] flex items-center justify-center">
      <div className="flex items-center gap-3 bg-white px-5 py-3 rounded-2xl border border-[#e4e4e7] shadow-sm">
        <div className="w-4 h-4 rounded-full border-2 border-[#171717] border-t-transparent animate-spin" />
        <span className="text-xs font-mono text-[#71717a]">Finalizing authentication…</span>
      </div>
      <AuthenticateWithRedirectCallback
        signInFallbackRedirectUrl="/"
        signUpFallbackRedirectUrl="/"
      />
    </div>
  );
}
