'use client';

import React from 'react';
import { useDashboard } from '@/context/DashboardContext';
import { JobsTab } from '@/components/JobsTab';

export default function JobsPage() {
  const ctx = useDashboard();

  return (
    <JobsTab
      jobs={ctx.jobs}
      sites={ctx.sites.map((s) => ({ id: s.id, domain: s.domain }))}
      onDispatchNewJob={ctx.handleDispatchNewJob}
      onRerunJob={ctx.handleRerunJob}
      onToast={ctx.addToast}
    />
  );
}
