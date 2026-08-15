'use client';

import React from 'react';
import { useDashboard } from '@/context/DashboardContext';
import { PricingPage as PricingView } from '@/components/PricingPage';

export default function PricingPage() {
  const ctx = useDashboard();

  return (
    <PricingView
      onSelectPlan={ctx.handleSelectPlan}
      onToast={ctx.addToast}
    />
  );
}
