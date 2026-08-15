import { Routes, Route, Navigate } from 'react-router-dom';
import { SignInPage } from './pages/SignInPage';
import { SignUpPage } from './pages/SignUpPage';
import { DashboardLayout } from './layouts/DashboardLayout';
import { OverviewPage } from './pages/OverviewPage';
import { SitesPage } from './pages/SitesPage';
import { SiteDetailPage } from './pages/SiteDetailPage';
import { JobsPage } from './pages/JobsPage';
import { BillingPage } from './pages/BillingPage';
import { PricingPage } from './pages/PricingPage';
import { ConnectPage } from './pages/ConnectPage';
import { OnboardingPage } from './pages/OnboardingPage';

export function App() {
  return (
    <Routes>
      {/* Public Authentication Pages */}
      <Route path="/sign-in/*" element={<SignInPage />} />
      <Route path="/sign-up/*" element={<SignUpPage />} />
      <Route path="/login" element={<Navigate to="/sign-in" replace />} />
      <Route path="/register" element={<Navigate to="/sign-up" replace />} />

      {/* Protected Dashboard Layout Routes */}
      <Route element={<DashboardLayout />}>
        <Route path="/" element={<OverviewPage />} />
        <Route path="/overview" element={<Navigate to="/" replace />} />
        <Route path="/sites" element={<SitesPage />} />
        <Route path="/sites/:siteId" element={<SiteDetailPage />} />
        <Route path="/jobs" element={<JobsPage />} />
        <Route path="/billing" element={<BillingPage />} />
        <Route path="/pricing" element={<PricingPage />} />
        <Route path="/connect" element={<ConnectPage />} />
        <Route path="/onboarding" element={<OnboardingPage />} />
      </Route>

      {/* Catch-All Fallback */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default App;
