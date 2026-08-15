'use client';

import React from 'react';
import { useDashboard } from '@/context/DashboardContext';
import { JobsTab } from '@/components/JobsTab';

export default function JobsPage() {
  const ctx = useDashboard();

  return (
    <JobsTab
      jobs={ctx.jobs}
      onDispatchNewJob={ctx.handleDispatchNewJob}
      onRerunJob={ctx.handleRerunJob}
      onToast={ctx.addToast}
    />
  );
}
