import { useState, useEffect } from 'react';
import { Sidebar } from './components/Sidebar';
import { Topbar } from './components/Topbar';
import { OverviewTab } from './components/OverviewTab';
import { SitesTab } from './components/SitesTab';
import { JobsTab } from './components/JobsTab';
import { BillingTab } from './components/BillingTab';
import { PricingPage } from './components/PricingPage';
import { ConnectFlow } from './components/ConnectFlow';
import { CommandPalette } from './components/CommandPalette';
import { ToastContainer } from './components/ToastContainer';
import { SiteDetailModal } from './components/SiteDetailModal';
import { AuthModal } from './components/AuthModal';
import { AppView, ExtendedSite, OptimizationJobItem, ToastMessage, SitePreset } from './types';
import { useAuth } from '@clerk/clerk-react';

const API_BASE = (import.meta as any).env?.VITE_API_BASE_URL || 'https://turbopress.webaccessibility.workers.dev';

export function App() {
  const { getToken } = useAuth();

  const [currentView, setCurrentView] = useState<AppView>('overview');
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isCmdkOpen, setIsCmdkOpen] = useState(false);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [selectedSite, setSelectedSite] = useState<ExtendedSite | null>(null);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  // 1-Click Handshake query params from URL
  const queryParams = new URLSearchParams(window.location.search);
  const handshakeDomain = queryParams.get('domain') || undefined;
  const handshakeState = queryParams.get('state') || undefined;
  const handshakeReturnUrl = queryParams.get('return_url') || undefined;

  // Auto-switch to connect view if handshake query parameters are present
  useEffect(() => {
    if (handshakeDomain && handshakeState) {
      setCurrentView('connect');
    }
  }, [handshakeDomain, handshakeState]);

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
  const addToast = (text: string, type: 'success' | 'info' | 'error' = 'success') => {
    const id = Math.random().toString(36).substring(2, 9);
    setToasts((prev) => [...prev, { id, text, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 2800);
  };

  // Sites Fleet Dataset
  const [sites, setSites] = useState<ExtendedSite[]>([
    {
      id: 'site-1',
      user_id: 'user_mock_1',
      subscription_id: 'sub_1',
      domain: 'grandemarehotel.com',
      subTitle: 'Brand hotel · WP 6.7',
      is_active: 1,
      site_api_key_hash: 'hash_1',
      config_json: '{}',
      created_at: 1723650000,
      updated_at: 1723650000,
      score: 96,
      lcp: 1.4,
      cacheHitRate: 94,
      lastJobTime: '2h ago',
      status: 'optimized',
      config: {
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
      },
    },
    {
      id: 'site-2',
      user_id: 'user_mock_1',
      subscription_id: 'sub_1',
      domain: 'shop.grandemarehotel.com',
      subTitle: 'WooCommerce · own slot',
      is_active: 1,
      site_api_key_hash: 'hash_2',
      config_json: '{}',
      created_at: 1723650000,
      updated_at: 1723650000,
      score: 91,
      lcp: 1.8,
      cacheHitRate: 91,
      lastJobTime: '5h ago',
      status: 'optimized',
      config: {
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
      },
    },
    {
      id: 'site-3',
      user_id: 'user_mock_1',
      subscription_id: 'sub_1',
      domain: 'lindenstay.com',
      subTitle: 'Boutique hotel · WP 6.6',
      is_active: 1,
      site_api_key_hash: 'hash_3',
      config_json: '{}',
      created_at: 1723650000,
      updated_at: 1723650000,
      score: 74,
      lcp: 2.6,
      cacheHitRate: 88,
      lastJobTime: 'running',
      status: 'optimizing',
      config: {
        version: '1.0.0',
        preset: 'aggressive',
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
          viewports: ['mobile'],
          excluded_stylesheets: [],
        },
        javascript: {
          execution_mode: 'defer',
          delay_timeout_ms: 4000,
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
          nonce_ajax_refresh: false,
          cart_micro_hydration: false,
          excluded_prerender_paths: [],
        },
      },
    },
    {
      id: 'site-4',
      user_id: 'user_mock_1',
      subscription_id: 'sub_1',
      domain: 'harborandspruce.com',
      subTitle: 'Inn & restaurant',
      is_active: 1,
      site_api_key_hash: 'hash_4',
      config_json: '{}',
      created_at: 1723650000,
      updated_at: 1723650000,
      score: 58,
      lcp: 3.9,
      cacheHitRate: 76,
      lastJobTime: 'failed',
      status: 'attention',
      config: {
        version: '1.0.0',
        preset: 'safe',
        caching: {
          enabled: true,
          ttl: 604800,
          mobile_cache: false,
          purge_on_post_update: true,
          purge_on_comment: true,
          strip_query_params: [],
          excluded_urls: [],
          excluded_cookies: [],
        },
        critical_css: {
          enabled: false,
          inline: false,
          async_load_full: false,
          font_display_swap: false,
          viewports: ['mobile'],
          excluded_stylesheets: [],
        },
        javascript: {
          execution_mode: 'defer',
          delay_timeout_ms: 4500,
          preserve_execution_order: true,
          exclusions: [],
          worker_offload: [],
        },
        media: {
          auto_fetchpriority_lcp: false,
          preload_lcp_image: false,
          inject_missing_dimensions: true,
          serve_nextgen_formats: false,
          lazyload_images: true,
          lazyload_iframes: true,
          lazyload_offset_px: 300,
          excluded_images: [],
        },
        dynamic: {
          speculation_rules_prerender: false,
          speculation_rules_eagerness: 'conservative',
          nonce_ajax_refresh: false,
          cart_micro_hydration: false,
          excluded_prerender_paths: [],
        },
      },
    },
    {
      id: 'site-5',
      user_id: 'user_mock_1',
      subscription_id: 'sub_1',
      domain: 'maplecourtinn.com',
      subTitle: 'Independent inn',
      is_active: 1,
      site_api_key_hash: 'hash_5',
      config_json: '{}',
      created_at: 1723650000,
      updated_at: 1723650000,
      score: 88,
      lcp: 2.1,
      cacheHitRate: 90,
      lastJobTime: '1d ago',
      status: 'optimized',
    },
    {
      id: 'site-6',
      user_id: 'user_mock_1',
      subscription_id: 'sub_1',
      domain: 'staging.lindenstay.com',
      subTitle: 'Staging · free dev seat',
      is_active: 1,
      site_api_key_hash: 'hash_6',
      config_json: '{}',
      created_at: 1723650000,
      updated_at: 1723650000,
      score: 84,
      lcp: 2.3,
      cacheHitRate: 89,
      lastJobTime: '1d ago',
      status: 'optimized',
    },
    {
      id: 'site-7',
      user_id: 'user_mock_1',
      subscription_id: 'sub_1',
      domain: 'trailheadcoffee.co',
      subTitle: 'Local business',
      is_active: 0,
      site_api_key_hash: 'hash_7',
      config_json: '{}',
      created_at: 1723650000,
      updated_at: 1723650000,
      score: 41,
      lcp: 4.2,
      cacheHitRate: 0,
      lastJobTime: '6d ago',
      status: 'disconnected',
    },
    {
      id: 'site-8',
      user_id: 'user_mock_1',
      subscription_id: 'sub_1',
      domain: 'everline-dental.com',
      subTitle: 'Chain · 3 locations',
      is_active: 1,
      site_api_key_hash: 'hash_8',
      config_json: '{}',
      created_at: 1723650000,
      updated_at: 1723650000,
      score: 93,
      lcp: 1.6,
      cacheHitRate: 95,
      lastJobTime: '3h ago',
      status: 'optimized',
    },
  ]);

  // Optimization Jobs Pipeline Dataset
  const [jobs, setJobs] = useState<OptimizationJobItem[]>([
    {
      id: 'job_9x1aa',
      siteDomain: 'grandemarehotel.com',
      url: 'https://grandemarehotel.com',
      viewport: 'mobile',
      status: 'completed',
      criticalCssSizeKb: 14.2,
      lcpSelector: '.hero-cover img',
      durationMs: 1420,
      createdAt: '2h ago',
    },
    {
      id: 'job_8b3qq',
      siteDomain: 'shop.grandemarehotel.com',
      url: 'https://shop.grandemarehotel.com/products',
      viewport: 'mobile',
      status: 'completed',
      criticalCssSizeKb: 18.5,
      lcpSelector: '.woocommerce-product-gallery img',
      durationMs: 1840,
      createdAt: '5h ago',
    },
    {
      id: 'job_4k8zz',
      siteDomain: 'lindenstay.com',
      url: 'https://lindenstay.com',
      viewport: 'mobile',
      status: 'processing',
      criticalCssSizeKb: 0,
      lcpSelector: null,
      durationMs: 0,
      createdAt: 'just now',
    },
    {
      id: 'job_7d2mk',
      siteDomain: 'harborandspruce.com',
      url: 'https://harborandspruce.com/menu',
      viewport: 'mobile',
      status: 'failed',
      criticalCssSizeKb: 0,
      lcpSelector: null,
      durationMs: 30000,
      createdAt: '1d ago',
    },
  ]);

  // Polar Checkout Action
  const handleSelectPlan = async (planId: string, interval: 'monthly' | 'annual') => {
    try {
      addToast(`Connecting to Polar.sh Checkout (${planId.toUpperCase()})…`);
      const token = (await getToken()) || 'mock_demo_jwt';

      const res = await fetch(`${API_BASE}/api/v1/billing/checkout`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          productId: `prod_${planId}_${interval}`,
          successUrl: `${window.location.origin}/?billing_success=true`,
        }),
      });

      const data = await res.json();
      if (data.success && data.data?.checkoutUrl) {
        window.location.href = data.data.checkoutUrl;
      } else {
        addToast(`Redirecting to Polar Sandbox (${planId})`);
        window.open(`https://buy.polar.sh/turbopress-${planId}`, '_blank');
      }
    } catch {
      window.open(`https://buy.polar.sh/turbopress-${planId}`, '_blank');
    }
  };

  // Polar Customer Portal Action
  const handleOpenPortal = async () => {
    try {
      addToast('Generating Polar Customer Portal session…');
      const token = (await getToken()) || 'mock_demo_jwt';

      const res = await fetch(`${API_BASE}/api/v1/billing/portal`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
      });

      const data = await res.json();
      if (data.success && data.data?.portalUrl) {
        window.location.href = data.data.portalUrl;
      } else {
        addToast('Opening Polar customer dashboard');
        window.open('https://polar.sh/purchases', '_blank');
      }
    } catch {
      window.open('https://polar.sh/purchases', '_blank');
    }
  };

  // 1-Click OAuth Handshake Pair
  const handleAuthorizeConnect = async (
    domain: string,
    state: string,
    returnUrl: string
  ): Promise<string> => {
    const token = (await getToken()) || 'mock_demo_jwt';

    const res = await fetch(`${API_BASE}/api/v1/auth/pair`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        site_url: `https://${domain}`,
        state_nonce: state,
        return_url: returnUrl,
      }),
    });

    const data = await res.json();
    if (!data.success) {
      throw new Error(data.error || 'Failed to authorize site');
    }

    const newSite: ExtendedSite = {
      id: `site-${Date.now()}`,
      user_id: 'user_current',
      subscription_id: 'sub_1',
      domain: domain,
      subTitle: 'WordPress 6.7 · Just Connected',
      is_active: 1,
      site_api_key_hash: 'hash_new',
      config_json: '{}',
      created_at: Math.floor(Date.now() / 1000),
      updated_at: Math.floor(Date.now() / 1000),
      score: 95,
      lcp: 1.5,
      cacheHitRate: 100,
      lastJobTime: 'just now',
      status: 'optimized',
    };

    setSites((prev) => [newSite, ...prev.filter((s) => s.domain !== domain)]);
    return data.data?.callback_url || returnUrl;
  };

  // Purge Edge Cache
  const handlePurgeSite = async (domain: string) => {
    try {
      const token = (await getToken()) || 'mock_demo_jwt';
      const targetSite = sites.find((s) => s.domain === domain);
      if (targetSite) {
        await fetch(`${API_BASE}/api/v1/sites/${targetSite.id}/purge`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ purge_all: true }),
        });
      }
    } catch {
      // Handled
    }
  };

  // Run Optimization Trigger
  const handleRunOptimization = async (domain: string) => {
    try {
      const token = (await getToken()) || 'mock_demo_jwt';
      const newJob: OptimizationJobItem = {
        id: `job_${Math.random().toString(36).substring(2, 7)}`,
        siteDomain: domain,
        url: `https://${domain}`,
        viewport: 'mobile',
        status: 'processing',
        criticalCssSizeKb: 0,
        lcpSelector: null,
        durationMs: 0,
        createdAt: 'just now',
      };
      setJobs((prev) => [newJob, ...prev]);

      await fetch(`${API_BASE}/api/v1/optimize/dispatch`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          url: `https://${domain}`,
          viewports: ['mobile'],
          priority: 'high',
        }),
      });
    } catch {
      // Handled
    }
  };

  // Dispatch from Jobs view
  const handleDispatchNewJob = (url: string, viewport: 'mobile' | 'desktop') => {
    const domain = new URL(url).hostname;
    const newJob: OptimizationJobItem = {
      id: `job_${Math.random().toString(36).substring(2, 7)}`,
      siteDomain: domain,
      url,
      viewport,
      status: 'queued',
      criticalCssSizeKb: 0,
      lcpSelector: null,
      durationMs: 0,
      createdAt: 'just now',
    };
    setJobs((prev) => [newJob, ...prev]);
  };

  // Update site preset
  const handleUpdatePreset = async (siteId: string, preset: SitePreset) => {
    setSites((prev) =>
      prev.map((s) => {
        if (s.id === siteId) {
          const config = s.config || {
            version: '1.0.0',
            preset,
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
              viewports: ['mobile'],
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
          };
          return { ...s, config: { ...config, preset } };
        }
        return s;
      })
    );
  };

  return (
    <div className="flex min-h-screen bg-[#f8f8f7]">
      {/* Sidebar Navigation */}
      <Sidebar
        currentView={currentView}
        onNavigate={(view) => setCurrentView(view)}
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
          onConnectClick={() => setCurrentView('connect')}
          onNotificationClick={() => addToast('No unread fleet notifications')}
        />

        <main className="flex-1 p-4 sm:p-8 max-w-6xl w-full mx-auto pb-16">
          {currentView === 'overview' && (
            <OverviewTab
              sites={sites}
              onSelectSite={(site) => setSelectedSite(site)}
              onNavigateToJobs={() => setCurrentView('jobs')}
              onNavigateToConnect={() => setCurrentView('connect')}
              onPurgeSite={handlePurgeSite}
              onRunOptimization={handleRunOptimization}
              onToast={addToast}
            />
          )}

          {currentView === 'sites' && (
            <SitesTab
              sites={sites}
              onSelectSite={(site) => setSelectedSite(site)}
              onNavigateToConnect={() => setCurrentView('connect')}
              onPurgeSite={handlePurgeSite}
              onRunOptimization={handleRunOptimization}
              onToast={addToast}
            />
          )}

          {currentView === 'jobs' && (
            <JobsTab
              jobs={jobs}
              onDispatchNewJob={handleDispatchNewJob}
              onRerunJob={(id) => addToast(`Job ${id} re-queued`)}
              onToast={addToast}
            />
          )}

          {currentView === 'billing' && (
            <BillingTab
              sites={sites}
              onOpenPortal={handleOpenPortal}
              onNavigateToConnect={() => setCurrentView('connect')}
              onNavigateToPricing={() => setCurrentView('pricing')}
              onToast={addToast}
            />
          )}

          {currentView === 'pricing' && (
            <PricingPage
              onSelectPlan={handleSelectPlan}
              onToast={addToast}
            />
          )}

          {currentView === 'connect' && (
            <ConnectFlow
              initialDomain={handshakeDomain}
              initialState={handshakeState}
              initialReturnUrl={handshakeReturnUrl}
              sites={sites}
              onAuthorize={handleAuthorizeConnect}
              onNavigateToOverview={() => setCurrentView('overview')}
              onToast={addToast}
            />
          )}
        </main>
      </div>

      {/* Global Command Palette (⌘K) */}
      <CommandPalette
        isOpen={isCmdkOpen}
        onClose={() => setIsCmdkOpen(false)}
        sites={sites}
        onNavigate={(view) => setCurrentView(view)}
        onSelectSite={(site) => setSelectedSite(site)}
        onTriggerPurgeAll={() => addToast('Fleet-wide edge cache purge queued')}
        onDispatchJob={(domain) => handleRunOptimization(domain)}
      />

      {/* Site Detail & Optimization Configuration Modal */}
      {selectedSite && (
        <SiteDetailModal
          site={selectedSite}
          onClose={() => setSelectedSite(null)}
          onUpdatePreset={handleUpdatePreset}
          onPurgeCache={handlePurgeSite}
          onRunOptimization={handleRunOptimization}
          onToast={addToast}
        />
      )}

      {/* Auth Modal (Sign in / Sign up) */}
      <AuthModal
        isOpen={isAuthModalOpen}
        onClose={() => setIsAuthModalOpen(false)}
        onToast={addToast}
      />

      {/* Floating Notifications Container */}
      <ToastContainer
        toasts={toasts}
        onDismiss={(id) => setToasts((prev) => prev.filter((t) => t.id !== id))}
      />
    </div>
  );
}

export default App;
