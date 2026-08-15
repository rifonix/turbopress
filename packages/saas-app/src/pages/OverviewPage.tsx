import React from 'react';
import { useOutletContext, useNavigate } from 'react-router-dom';
import { DashboardContextType } from '../types';
import { OverviewTab } from '../components/OverviewTab';

export const OverviewPage: React.FC = () => {
  const navigate = useNavigate();
  const ctx = useOutletContext<DashboardContextType>();

  return (
    <OverviewTab
      sites={ctx.sites}
      totalRunsUsed={ctx.billingData?.plan?.usedRuns || 124}
      totalRunsMax={ctx.billingData?.plan?.maxRuns || 2000}
      onSelectSite={(site) => navigate(`/sites/${site.id}`)}
      onNavigateToJobs={() => navigate('/jobs')}
      onNavigateToConnect={() => navigate('/connect')}
      onPurgeSite={ctx.handlePurgeSite}
      onRunOptimization={ctx.handleRunOptimization}
      onToast={ctx.addToast}
    />
  );
};
