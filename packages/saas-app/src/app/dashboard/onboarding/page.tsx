'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { useDashboard } from '@/context/DashboardContext';
import { OnboardingFlow } from '@/components/OnboardingFlow';

export default function OnboardingPage() {
  const router = useRouter();
  const ctx = useDashboard();

  const hasActivePlan =
    ctx.billingData?.hasActivePlan ||
    ctx.billingData?.subscription?.status === 'active' ||
    ctx.billingData?.subscription?.status === 'trialing';

  return (
    <OnboardingFlow
      hasActivePlan={hasActivePlan}
      isVerifyingPurchase={ctx.isVerifyingPurchase}
      planName={ctx.billingData?.plan?.name}
      jobs={ctx.jobs}
      onComplete={() => router.push('/')}
      onSelectPlan={ctx.handleSelectPlan}
      onCreateSite={ctx.handleCreateSite}
      onRunOptimization={ctx.handleRunOptimization}
      onToast={ctx.addToast}
    />
  );
}
