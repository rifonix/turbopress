'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { useDashboard } from '@/context/DashboardContext';
import { SitesTab } from '@/components/SitesTab';

export default function SitesPage() {
  const router = useRouter();
  const ctx = useDashboard();

  return (
    <SitesTab
      sites={ctx.sites}
      onSelectSite={(site) => router.push(`/sites/${site.id}`)}
      onNavigateToConnect={() => router.push('/connect')}
      onPurgeSite={ctx.handlePurgeSite}
      onRunOptimization={ctx.handleRunOptimization}
      onDeleteSite={ctx.handleDeleteSite}
      onCreateSite={ctx.handleCreateSite}
      onToast={ctx.addToast}
    />
  );
}
