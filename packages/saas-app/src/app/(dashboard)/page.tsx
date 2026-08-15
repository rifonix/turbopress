'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { useDashboard } from '@/context/DashboardContext';
import { OverviewTab } from '@/components/OverviewTab';

export default function OverviewPage() {
  const router = useRouter();
  const ctx = useDashboard();

  return (
    <OverviewTab
      sites={ctx.sites}
      totalRunsUsed={ctx.billingData?.plan?.usedRuns ?? 0}
      totalRunsMax={ctx.billingData?.plan?.maxRuns ?? 200}
      onSelectSite={(site) => router.push(`/sites/${site.id}`)}
      onNavigateToJobs={() => router.push('/jobs')}
      onNavigateToConnect={() => router.push('/connect')}
      onPurgeSite={ctx.handlePurgeSite}
      onRunOptimization={ctx.handleRunOptimization}
      onToast={ctx.addToast}
    />
  );
}
