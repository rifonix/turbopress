'use client';

import React, { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { useDashboard } from '@/context/DashboardContext';
import { PricingPage as PricingView } from '@/components/PricingPage';

function PricingContent() {
  const ctx = useDashboard();
  const searchParams = useSearchParams();
  const showRequiredBanner = searchParams?.get('required') === '1';

  const hasActivePlan =
    ctx.billingData?.hasActivePlan ||
    ctx.billingData?.subscription?.status === 'active' ||
    ctx.billingData?.subscription?.status === 'trialing';

  return (
    <PricingView
      onSelectPlan={ctx.handleSelectPlan}
      onToast={ctx.addToast}
      hasActivePlan={hasActivePlan}
      showRequiredBanner={showRequiredBanner}
    />
  );
}

export default function PricingPage() {
  return (
    <Suspense
      fallback={
        <div className="space-y-8 animate-fade-in max-w-5xl mx-auto py-2">
          <div className="h-10 bg-black/5 rounded-lg w-64 mx-auto animate-pulse" />
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-96 bg-white border border-[#e4e4e7] rounded-2xl animate-pulse" />
            ))}
          </div>
        </div>
      }
    >
      <PricingContent />
    </Suspense>
  );
}
