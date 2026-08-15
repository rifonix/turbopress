import React from 'react';
import { useOutletContext } from 'react-router-dom';
import { DashboardContextType } from '../types';
import { JobsTab } from '../components/JobsTab';

export const JobsPage: React.FC = () => {
  const ctx = useOutletContext<DashboardContextType>();

  return (
    <JobsTab
      jobs={ctx.jobs}
      onDispatchNewJob={ctx.handleDispatchNewJob}
      onRerunJob={ctx.handleRerunJob}
      onToast={ctx.addToast}
    />
  );
};
