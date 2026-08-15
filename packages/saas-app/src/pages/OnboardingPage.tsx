import React from 'react';
import { useOutletContext, useNavigate } from 'react-router-dom';
import { DashboardContextType } from '../types';
import { OnboardingFlow } from '../components/OnboardingFlow';

export const OnboardingPage: React.FC = () => {
  const navigate = useNavigate();
  const ctx = useOutletContext<DashboardContextType>();

  return (
    <OnboardingFlow
      onComplete={() => navigate('/')}
      onSelectPlan={ctx.handleSelectPlan}
      onToast={ctx.addToast}
    />
  );
};
