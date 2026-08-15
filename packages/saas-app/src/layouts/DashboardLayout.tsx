import React, { useState, useEffect, useCallback } from 'react';
import { Outlet, useNavigate, useLocation, Navigate } from 'react-router-dom';
import { useAuth } from '@clerk/clerk-react';
import { Sidebar } from '../components/Sidebar';
import { Topbar } from '../components/Topbar';
import { CommandPalette } from '../components/CommandPalette';
import { ToastContainer } from '../components/ToastContainer';
import {
  ExtendedSite,
  OptimizationJobItem,
  ToastMessage,
  SitePreset,
  BillingStatusData,
  DashboardContextType,
  POLAR_PRODUCT_IDS,
} from '../types';
import { api } from '../services/api';
import { SiteConfig } from '@turbopress/shared';

export const DashboardLayout: React.FC = () => {
  const { isLoaded, isSignedIn, getToken } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isCmdkOpen, setIsCmdkOpen] = useState(false);
  const [selectedSite, setSelectedSite] = useState<ExtendedSite | null>(null);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  // Live Datasets
  const [sites, setSites] = useState<ExtendedSite[]>([]);
  const [jobs, setJobs] = useState<OptimizationJobItem[]>([]);
  const [billingData, setBillingData] = useState<BillingStatusData | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Global Keyboard Listener for ⌘K / Ctrl+K
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setIsCmdkOpen((prev) => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Toast Helper
  const addToast = useCallback((text: string, type: 'success' | 'info' | 'error' = 'success') => {
    const id = Math.random().toString(36).substring(2, 9);
    setToasts((prev) => [...prev, { id, text, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3200);
  }, []);

  // Fetch Live Fleet Data
  const refreshFleetData = useCallback(async () => {
    if (!isSignedIn) return;

    try {
      const token = await getToken();

      const [sitesRes, jobsRes, billingRes] = await Promise.allSettled([
        api.getSites(token),
        api.getJobs(token),
        api.getBillingStatus(token),
      ]);

      if (sitesRes.status === 'fulfilled') {
        setSites(sitesRes.value);
        if (selectedSite) {
          const updated = sitesRes.value.find((s) => s.id === selectedSite.id || s.domain === selectedSite.domain);
          if (updated) setSelectedSite(updated);
        }
      }

      if (jobsRes.status === 'fulfilled') {
        setJobs(jobsRes.value);
      }

      if (billingRes.status === 'fulfilled') {
        setBillingData(billingRes.value);
      }
    } catch (err: any) {
      console.warn('[Data Refresh Warning]', err);
    } finally {
      setIsLoading(false);
    }
  }, [isSignedIn, getToken, selectedSite]);

  // Initial Load
  useEffect(() => {
    if (isLoaded && isSignedIn) {
      refreshFleetData();
    } else if (isLoaded && !isSignedIn) {
      setIsLoading(false);
    }
  }, [isLoaded, isSignedIn, refreshFleetData]);

  // Polling for active jobs
  useEffect(() => {
    if (!isSignedIn) return;
    const hasActiveJobs = jobs.some((j) => j.status === 'processing' || j.status === 'queued');
    if (!hasActiveJobs && location.pathname !== '/jobs') return;

    const interval = setInterval(() => {
      refreshFleetData();
    }, 8000);

    return () => clearInterval(interval);
  }, [isSignedIn, jobs, location.pathname, refreshFleetData]);

  // Action handlers
  const handleSelectPlan = async (planId: string, interval: 'monthly' | 'annual') => {
    try {
      addToast(`Initializing Polar checkout for ${planId.toUpperCase()}…`, 'info');
      const token = await getToken();

      const targetProductId =
        planId === 'starter'
          ? interval === 'annual'
            ? POLAR_PRODUCT_IDS.starterYearly
            : POLAR_PRODUCT_IDS.starterMonthly
          : `prod_${planId}_${interval}`;

      const res = await api.createCheckout(token, targetProductId);
      if (res?.checkoutUrl) {
        window.location.href = res.checkoutUrl;
      } else {
        window.open(`https://buy.polar.sh/turbopress-${planId}`, '_blank');
      }
    } catch {
      window.open(`https://buy.polar.sh/turbopress-${planId}`, '_blank');
    }
  };

  const handleOpenPortal = async () => {
    try {
      addToast('Opening Polar customer portal session…', 'info');
      const token = await getToken();
      const res = await api.createCustomerPortal(token);
      if (res?.portalUrl) {
        window.location.href = res.portalUrl;
      } else {
        window.open('https://polar.sh/purchases', '_blank');
      }
    } catch {
      window.open('https://polar.sh/purchases', '_blank');
    }
  };

  const handleAuthorizeConnect = async (
    domain: string,
    state: string,
    returnUrl: string
  ): Promise<string> => {
    const token = await getToken();
    const res = await api.pairSite(token, {
      site_url: domain.startsWith('http') ? domain : `https://${domain}`,
      state_nonce: state,
      return_url: returnUrl,
    });

    addToast(`Successfully connected and paired ${domain}`, 'success');
    await refreshFleetData();
    return res.callback_url || returnUrl;
  };

  const handleCreateSite = async (domain: string) => {
    const token = await getToken();
    await api.createSite(token, domain);
    addToast(`Site ${domain} created on TurboPress Edge`, 'success');
    await refreshFleetData();
  };

  const handlePurgeSite = async (domain: string) => {
    try {
      const token = await getToken();
      const targetSite = sites.find((s) => s.domain === domain);
      if (targetSite) {
        await api.purgeSiteCache(token, targetSite.id);
        addToast(`Edge cache purged for ${domain}`, 'success');
      }
    } catch (err: any) {
      addToast(err?.message || `Cache purge failed for ${domain}`, 'error');
    }
  };

  const handleRunOptimization = async (domain: string) => {
    try {
      const token = await getToken();
      const targetUrl = domain.startsWith('http') ? domain : `https://${domain}`;
      const targetSite = sites.find((s) => s.domain === domain);

      await api.dispatchJob(token, {
        url: targetUrl,
        viewports: ['mobile', 'desktop'],
        site_id: targetSite?.id,
      });

      addToast(`Optimization job queued for ${domain}`, 'success');
      await refreshFleetData();
    } catch (err: any) {
      addToast(err?.message || `Optimization dispatch failed for ${domain}`, 'error');
    }
  };

  const handleDispatchNewJob = async (url: string, viewport: 'mobile' | 'desktop') => {
    try {
      const token = await getToken();
      await api.dispatchJob(token, {
        url,
        viewports: [viewport],
      });
      addToast(`Optimization job queued for ${url} (${viewport})`, 'success');
      await refreshFleetData();
    } catch (err: any) {
      addToast(err?.message || 'Failed to dispatch job', 'error');
    }
  };

  const handleRerunJob = async (jobId: string) => {
    try {
      const token = await getToken();
      await api.rerunJob(token, jobId);
      addToast(`Job ${jobId} re-dispatched to queue`, 'success');
      await refreshFleetData();
    } catch (err: any) {
      addToast(err?.message || 'Failed to re-run job', 'error');
    }
  };

  const handleUpdatePreset = async (siteId: string, preset: SitePreset) => {
    const targetSite = sites.find((s) => s.id === siteId);
    if (!targetSite) return;

    const token = await getToken();
    const updatedConfig: SiteConfig = {
      ...(targetSite.config || {
        version: '1.0.0',
        preset: 'ludicrous',
        caching: {
          enabled: true,
          ttl: 604800,
          mobile_cache: true,
          purge_on_post_update: true,
          purge_on_comment: true,
          strip_query_params: [],
          excluded_urls: [],
          excluded_cookies: [],
        },
        critical_css: {
          enabled: true,
          inline: true,
          async_load_full: true,
          font_display_swap: true,
          viewports: ['mobile', 'desktop'],
          excluded_stylesheets: [],
        },
        javascript: {
          execution_mode: 'interaction_delay',
          delay_timeout_ms: 3500,
          preserve_execution_order: true,
          exclusions: [],
          worker_offload: [],
        },
        media: {
          auto_fetchpriority_lcp: true,
          preload_lcp_image: true,
          inject_missing_dimensions: true,
          serve_nextgen_formats: true,
          lazyload_images: true,
          lazyload_iframes: true,
          lazyload_offset_px: 300,
          excluded_images: [],
        },
        dynamic: {
          speculation_rules_prerender: true,
          speculation_rules_eagerness: 'moderate',
          nonce_ajax_refresh: true,
          cart_micro_hydration: true,
          excluded_prerender_paths: [],
        },
      }),
      preset,
    };

    await api.updateSiteConfig(token, siteId, updatedConfig);
    await refreshFleetData();
  };

  const handleUpdateConfig = async (siteId: string, config: SiteConfig) => {
    const token = await getToken();
    await api.updateSiteConfig(token, siteId, config);
    await refreshFleetData();
  };

  const handleDeleteSite = async (siteId: string, domain: string) => {
    if (!confirm(`Are you sure you want to delete ${domain}? This will deactivate edge optimization and remove cached assets.`)) {
      return;
    }

    try {
      const token = await getToken();
      await api.deleteSite(token, siteId);
      addToast(`Site ${domain} removed from fleet`, 'info');
      navigate('/sites');
      await refreshFleetData();
    } catch (err: any) {
      addToast(err?.message || `Failed to delete ${domain}`, 'error');
    }
  };

  // Auth Guard
  if (!isLoaded) {
    return (
      <div className="min-h-screen bg-[#f8f8f7] flex items-center justify-center">
        <div className="flex items-center gap-3 bg-white px-5 py-3 rounded-2xl border border-[#e4e4e7] shadow-sm">
          <div className="w-4 h-4 rounded-full border-2 border-[#171717] border-t-transparent animate-spin" />
          <span className="text-xs font-mono text-[#71717a]">Loading TurboPress Engine…</span>
        </div>
      </div>
    );
  }

  if (!isSignedIn) {
    return <Navigate to="/sign-in" replace />;
  }

  const contextValue: DashboardContextType = {
    sites,
    jobs,
    billingData,
    isLoading,
    refreshFleetData,
    addToast,
    handlePurgeSite,
    handleRunOptimization,
    handleCreateSite,
    handleDeleteSite,
    handleUpdatePreset,
    handleUpdateConfig,
    handleDispatchNewJob,
    handleRerunJob,
    handleSelectPlan,
    handleOpenPortal,
    handleAuthorizeConnect,
  };

  return (
    <div className="flex min-h-screen bg-[#f8f8f7]">
      {/* Sticky Sidebar Navigation */}
      <Sidebar
        selectedSite={selectedSite}
        siteCount={sites.length}
        jobCount={jobs.length}
        isOpen={isMobileMenuOpen}
        onClose={() => setIsMobileMenuOpen(false)}
      />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0">
        <Topbar
          onOpenCmdk={() => setIsCmdkOpen(true)}
          onOpenMobileMenu={() => setIsMobileMenuOpen(true)}
          onConnectClick={() => navigate('/connect')}
          onNotificationClick={() => addToast('No unread fleet notifications', 'info')}
        />

        <main className="flex-1 p-4 sm:p-8 max-w-6xl w-full mx-auto pb-16">
          {isLoading ? (
            <div className="space-y-4 py-8">
              <div className="h-8 bg-black/5 rounded-lg w-48 animate-pulse" />
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="h-28 bg-white border border-[#e4e4e7] rounded-xl animate-pulse" />
                ))}
              </div>
              <div className="h-64 bg-white border border-[#e4e4e7] rounded-2xl animate-pulse" />
            </div>
          ) : (
            <Outlet context={contextValue} />
          )}
        </main>
      </div>

      {/* Global Command Palette (⌘K) */}
      <CommandPalette
        isOpen={isCmdkOpen}
        onClose={() => setIsCmdkOpen(false)}
        sites={sites}
        onNavigate={(view) => {
          if (view === 'overview') navigate('/');
          else if (view === 'sites') navigate('/sites');
          else if (view === 'jobs') navigate('/jobs');
          else if (view === 'billing') navigate('/billing');
          else if (view === 'pricing') navigate('/pricing');
          else if (view === 'connect') navigate('/connect');
          else if (view === 'onboarding') navigate('/onboarding');
        }}
        onSelectSite={(site) => {
          setSelectedSite(site);
          navigate(`/sites/${site.id}`);
        }}
        onTriggerPurgeAll={() => {
          addToast('Fleet-wide edge cache purge broadcasted', 'success');
        }}
        onDispatchJob={(domain) => handleRunOptimization(domain)}
      />

      {/* Floating Notifications Container */}
      <ToastContainer
        toasts={toasts}
        onDismiss={(id) => setToasts((prev) => prev.filter((t) => t.id !== id))}
      />
    </div>
  );
};
