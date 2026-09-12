'use client';

import Image from 'next/image';
import { AuthenticateWithRedirectCallback } from '@clerk/nextjs';

export default function SSOCallbackPage() {
  return (
    <div className="min-h-screen bg-[#f8f8f7] flex flex-col items-center justify-center gap-5 p-6">
      <Image
        src="/wp-instant-logo.svg"
        alt="WP Instant"
        width={44}
        height={44}
        className="h-11 w-11 rounded-[11px]"
        priority
      />
      <div className="flex items-center gap-3 bg-white px-5 py-3 rounded-2xl shadow-[0_1px_3px_rgba(23,23,23,0.06)]">
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
