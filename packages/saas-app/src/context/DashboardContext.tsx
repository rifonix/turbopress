'use client';

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useAuth } from '@clerk/nextjs';
import { usePathname, useRouter } from 'next/navigation';
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

const DashboardContext = createContext<DashboardContextType | null>(null);

export const DashboardProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isLoaded, isSignedIn, getToken } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  const [sites, setSites] = useState<ExtendedSite[]>([]);
  const [jobs, setJobs] = useState<OptimizationJobItem[]>([]);
  const [billingData, setBillingData] = useState<BillingStatusData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

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
  }, [isSignedIn, getToken]);

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
    if (!hasActiveJobs && pathname !== '/jobs') return;

    const interval = setInterval(() => {
      refreshFleetData();
    }, 8000);

    return () => clearInterval(interval);
  }, [isSignedIn, jobs, pathname, refreshFleetData]);

  // Actions
  const handleSelectPlan = async (planId: string, interval: 'monthly' | 'annual', returnTo?: string) => {
    try {
      addToast(`Initializing Polar checkout for ${planId.toUpperCase()}…`, 'info');
      const token = await getToken();

      const targetProductId =
        planId === 'starter'
          ? interval === 'annual'
            ? POLAR_PRODUCT_IDS.starterYearly
            : POLAR_PRODUCT_IDS.starterMonthly
          : `prod_${planId}_${interval}`;

      const res = await api.createCheckout(token, targetProductId, returnTo);
      if (res?.checkoutUrl) {
        window.location.href = res.checkoutUrl;
      } else {
        addToast('Unable to initialize Polar checkout session', 'error');
      }
    } catch (err: any) {
      addToast(err?.message || 'Failed to initialize Polar checkout session', 'error');
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
    } catch (err: any) {
      addToast(err?.message || 'Failed to open customer portal', 'error');
    }
  };

  const handleAuthorizeConnect = async (
    domain: string,
    state: string,
    returnUrl: string
  ): Promise<string> => {
    const token = await getToken();
    const res = await api.pairSite(token, {
      domain,
      state,
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
      router.push('/sites');
      await refreshFleetData();
    } catch (err: any) {
      addToast(err?.message || `Failed to delete ${domain}`, 'error');
    }
  };

  const value: DashboardContextType = {
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
    <DashboardContext.Provider value={value}>
      {children}
    </DashboardContext.Provider>
  );
};

export const useDashboard = (): DashboardContextType => {
  const context = useContext(DashboardContext);
  if (!context) {
    throw new Error('useDashboard must be used within a DashboardProvider');
  }
  return context;
};
