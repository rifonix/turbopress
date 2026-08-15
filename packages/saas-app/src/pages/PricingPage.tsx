import React from 'react';
import { useOutletContext } from 'react-router-dom';
import { DashboardContextType } from '../types';
import { PricingPage as PricingView } from '../components/PricingPage';

export const PricingPage: React.FC = () => {
  const ctx = useOutletContext<DashboardContextType>();

  return (
    <PricingView
      onSelectPlan={ctx.handleSelectPlan}
      onToast={ctx.addToast}
    />
  );
};
