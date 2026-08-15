import React from 'react';
import { useOutletContext, useNavigate } from 'react-router-dom';
import { DashboardContextType } from '../types';
import { BillingTab } from '../components/BillingTab';

export const BillingPage: React.FC = () => {
  const navigate = useNavigate();
  const ctx = useOutletContext<DashboardContextType>();

  return (
    <BillingTab
      sites={ctx.sites}
      billingData={ctx.billingData}
      onOpenPortal={ctx.handleOpenPortal}
      onNavigateToConnect={() => navigate('/connect')}
      onNavigateToPricing={() => navigate('/pricing')}
      onToast={ctx.addToast}
    />
  );
};
