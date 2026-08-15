'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { useDashboard } from '@/context/DashboardContext';
import { OnboardingFlow } from '@/components/OnboardingFlow';

export default function OnboardingPage() {
  const router = useRouter();
  const ctx = useDashboard();

  return (
    <OnboardingFlow
      onComplete={() => router.push('/')}
      onSelectPlan={ctx.handleSelectPlan}
      onToast={ctx.addToast}
    />
  );
}
