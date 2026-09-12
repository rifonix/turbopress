'use client';

import React, { Suspense } from 'react';
import { Activity, Globe, ShieldCheck, Zap } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { SignUp } from '@clerk/nextjs';
import { useSearchParams } from 'next/navigation';
import { wpInstantClerkAppearance } from '@/components/auth/ClerkTheme';

const highlights = [
  {
    icon: Zap,
    tint: 'bg-[#fff1ef] text-[#f03e2f]',
    title: 'No risk',
    body: 'Original site remains untouched; edge fallback guaranteed.',
  },
  {
    icon: Activity,
    tint: 'bg-[#f0fdf4] text-[#16a34a]',
    title: '95+ mobile CWV',
    body: 'Pass Google Core Web Vitals on mobile and desktop.',
  },
  {
    icon: Globe,
    tint: 'bg-[#eff6ff] text-[#2563eb]',
    title: 'Unlimited pageviews',
    body: 'Global edge caching on a tier-1 network.',
  },
];

function SignUpContent() {
  const searchParams = useSearchParams();
  // New accounts land in onboarding (plan purchase -> site connect) unless a
  // deep-link destination was provided (e.g. the /connect handshake).
  const redirectUrl = searchParams?.get('redirect_url') || '/dashboard/onboarding';
  const safeRedirect = redirectUrl.startsWith('/') ? redirectUrl : '/dashboard/onboarding';

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
            Instant provisioning
          </span>
        </div>
      </header>

      <main className="mx-auto grid w-full max-w-6xl grid-cols-1 items-center gap-10 px-6 py-12 lg:grid-cols-2 lg:py-16">
        <div className="max-w-lg">
          <span className="inline-block rounded-full bg-[#fff1ef] px-3 py-1 font-mono text-xs font-semibold uppercase tracking-wider text-[#f03e2f]">
            Free 14-day production trial
          </span>
          <h1 className="mt-5 text-3xl font-semibold tracking-tight leading-tight sm:text-5xl">
            Scale your WordPress sites to lightning speed.
          </h1>
          <p className="mt-4 text-[15px] leading-relaxed text-[#71717a]">
            No DNS changes required. Zero risk. Drop in the plugin, authorize the pairing handshake, and watch your
            Core Web Vitals go green.
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
          <SignUp
            appearance={wpInstantClerkAppearance}
            routing="path"
            path="/sign-up"
            signInUrl={
              redirectUrl && redirectUrl !== '/dashboard/onboarding'
                ? `/sign-in?redirect_url=${encodeURIComponent(redirectUrl)}`
                : '/sign-in'
            }
            forceRedirectUrl={safeRedirect}
          />
        </div>
      </main>

      <footer className="bg-white px-6 py-4 text-center font-mono text-xs text-[#71717a]">
        WP Instant · High-performance zero-DNS WordPress optimization
      </footer>
    </div>
  );
}

export default function SignUpPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[#f8f8f7] flex items-center justify-center">
          <div className="w-5 h-5 border-2 border-[#171717] border-t-transparent rounded-full animate-spin" />
        </div>
      }
    >
      <SignUpContent />
    </Suspense>
  );
}
