'use client';

import React, { Suspense } from 'react';
import { Activity, Globe, ShieldCheck, Zap } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { SignIn } from '@clerk/nextjs';
import { useSearchParams } from 'next/navigation';
import { wpInstantClerkAppearance } from '@/components/auth/ClerkTheme';

const highlights = [
  {
    icon: Zap,
    tint: 'bg-[#fff1ef] text-[#f03e2f]',
    title: 'Sub-15ms edge cache',
    body: 'Drop-in advanced-cache.php with Brotli compression.',
  },
  {
    icon: Activity,
    tint: 'bg-[#f0fdf4] text-[#16a34a]',
    title: 'AST critical CSS',
    body: 'A real-browser pipeline saves to zero-egress edge storage.',
  },
  {
    icon: Globe,
    tint: 'bg-[#eff6ff] text-[#2563eb]',
    title: '1-click handshake',
    body: 'Instant pair from WP admin with zero DNS migration.',
  },
];

function SignInContent() {
  const searchParams = useSearchParams();
  // Deep-link support: send users back where they came from (e.g. /connect handshake)
  const redirectUrl = searchParams?.get('redirect_url') || '/dashboard';
  const safeRedirect = redirectUrl.startsWith('/') ? redirectUrl : '/dashboard';

  return (
    <div className="min-h-screen bg-[#f8f8f7] text-[#171717]">
      <header className="bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <Link href="/" className="flex items-center gap-2.5" aria-label="WP Instant homepage">
            <Image
              src="/wp-instant-logo.svg"
              alt=""
              width={32}
              height={32}
              className="h-8 w-8 rounded-[8px]"
              priority
            />
            <span className="font-semibold text-lg tracking-tight">WP Instant</span>
          </Link>
          <span className="hidden items-center gap-1.5 rounded-md bg-[#f4f4f5] px-2.5 py-1 font-mono text-xs text-[#71717a] sm:flex">
            <ShieldCheck className="w-3.5 h-3.5 text-[#16a34a]" aria-hidden="true" />
            Secure edge authentication
          </span>
        </div>
      </header>

      <main className="mx-auto grid w-full max-w-6xl grid-cols-1 items-center gap-10 px-6 py-12 lg:grid-cols-2 lg:py-16">
        <div className="max-w-lg">
          <span className="inline-block rounded-full bg-[#fff1ef] px-3 py-1 font-mono text-xs font-semibold uppercase tracking-wider text-[#f03e2f]">
            Zero-DNS WordPress acceleration
          </span>
          <h1 className="mt-5 text-3xl font-semibold tracking-tight leading-tight sm:text-5xl">
            Instant 95+ PageSpeed scores across any theme.
          </h1>
          <p className="mt-4 text-[15px] leading-relaxed text-[#71717a]">
            Automated critical CSS inlining, sub-15ms edge caching, 3-tier JavaScript deferral, and dynamic nonce
            micro-hydration.
          </p>
          <ul className="mt-8 space-y-3">
            {highlights.map((item) => (
              <li
                key={item.title}
                className="flex items-start gap-3 rounded-2xl bg-white p-4 shadow-[0_1px_3px_rgba(23,23,23,0.06)]"
              >
                <span className={`grid h-9 w-9 flex-none place-items-center rounded-xl ${item.tint}`}>
                  <item.icon className="h-4 w-4" aria-hidden="true" />
                </span>
                <span>
                  <span className="block text-sm font-semibold">{item.title}</span>
                  <span className="mt-0.5 block text-xs leading-relaxed text-[#71717a]">{item.body}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>

        <div className="flex justify-center lg:justify-end">
          <SignIn
            appearance={wpInstantClerkAppearance}
            routing="path"
            path="/sign-in"
            signUpUrl={
              redirectUrl && redirectUrl !== '/dashboard'
                ? `/sign-up?redirect_url=${encodeURIComponent(redirectUrl)}`
                : '/sign-up'
            }
            fallbackRedirectUrl={safeRedirect}
          />
        </div>
      </main>

      <footer className="bg-white px-6 py-4 text-center font-mono text-xs text-[#71717a]">
        WP Instant · High-performance zero-DNS WordPress optimization
      </footer>
    </div>
  );
}

export default function SignInPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[#f8f8f7] flex items-center justify-center">
          <div className="w-5 h-5 border-2 border-[#171717] border-t-transparent rounded-full animate-spin" />
        </div>
      }
    >
      <SignInContent />
    </Suspense>
  );
}
