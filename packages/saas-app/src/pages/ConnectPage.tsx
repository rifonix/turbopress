import React from 'react';
import { useOutletContext, useNavigate, useSearchParams } from 'react-router-dom';
import { DashboardContextType } from '../types';
import { ConnectFlow } from '../components/ConnectFlow';

export const ConnectPage: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const ctx = useOutletContext<DashboardContextType>();

  const domain = searchParams.get('domain') || undefined;
  const state = searchParams.get('state') || undefined;
  const returnUrl = searchParams.get('return_url') || undefined;

  return (
    <ConnectFlow
      initialDomain={domain}
      initialState={state}
      initialReturnUrl={returnUrl}
      sites={ctx.sites}
      onAuthorize={ctx.handleAuthorizeConnect}
      onNavigateToOverview={() => navigate('/')}
      onToast={ctx.addToast}
    />
  );
};
