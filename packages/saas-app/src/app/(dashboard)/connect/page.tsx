'use client';

import React, { Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useDashboard } from '@/context/DashboardContext';
import { ConnectFlow } from '@/components/ConnectFlow';

function ConnectContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const ctx = useDashboard();

  const domain = searchParams?.get('domain') || undefined;
  const state = searchParams?.get('state') || undefined;
  const returnUrl = searchParams?.get('return_url') || undefined;

  return (
    <ConnectFlow
      initialDomain={domain}
      initialState={state}
      initialReturnUrl={returnUrl}
      sites={ctx.sites}
      onAuthorize={ctx.handleAuthorizeConnect}
      onNavigateToOverview={() => router.push('/')}
      onToast={ctx.addToast}
    />
  );
}

export default function ConnectPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-[400px] flex items-center justify-center">
          <div className="w-5 h-5 border-2 border-[#171717] border-t-transparent rounded-full animate-spin" />
        </div>
      }
    >
      <ConnectContent />
    </Suspense>
  );
}
