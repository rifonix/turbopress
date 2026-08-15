import React from 'react';
import { useOutletContext, useNavigate } from 'react-router-dom';
import { DashboardContextType } from '../types';
import { SitesTab } from '../components/SitesTab';

export const SitesPage: React.FC = () => {
  const navigate = useNavigate();
  const ctx = useOutletContext<DashboardContextType>();

  return (
    <SitesTab
      sites={ctx.sites}
      onSelectSite={(site) => navigate(`/sites/${site.id}`)}
      onNavigateToConnect={() => navigate('/connect')}
      onPurgeSite={ctx.handlePurgeSite}
      onRunOptimization={ctx.handleRunOptimization}
      onDeleteSite={ctx.handleDeleteSite}
      onCreateSite={ctx.handleCreateSite}
      onToast={ctx.addToast}
    />
  );
};
