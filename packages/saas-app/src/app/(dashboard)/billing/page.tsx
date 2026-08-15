'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { useDashboard } from '@/context/DashboardContext';
import { BillingTab } from '@/components/BillingTab';

export default function BillingPage() {
  const router = useRouter();
  const ctx = useDashboard();

  return (
    <BillingTab
      sites={ctx.sites}
      billingData={ctx.billingData}
      onOpenPortal={ctx.handleOpenPortal}
      onNavigateToConnect={() => router.push('/connect')}
      onNavigateToPricing={() => router.push('/pricing')}
      onToast={ctx.addToast}
    />
  );
}
