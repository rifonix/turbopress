import { Site, SiteConfig, PresetType, Subscription } from '@turbopress/shared';

export type AppView =
  | 'overview'
  | 'sites'
  | 'site-detail'
  | 'jobs'
  | 'billing'
  | 'pricing'
  | 'connect'
  | 'onboarding'
  | 'login';

export interface ExtendedSite extends Partial<Site> {
  id: string;
  user_id: string;
  subscription_id: string;
  domain: string;
  site_api_key_hash?: string;
  config_json?: string;
  is_active: number;
  wp_version?: string | null;
  plugin_version?: string | null;
  last_ping_at?: number | null;
  created_at: number;
  updated_at: number;
  subTitle?: string;
  score: number;
  mobileScore?: number;
  desktopScore?: number;
  lcp: number;
  cls?: number;
  ttfbMs?: number;
  cacheHitRate: number;
  lastJobTime: string;
  status: 'optimized' | 'optimizing' | 'attention' | 'disconnected';
  config?: SiteConfig;
}

export type SitePreset = PresetType;

export interface OptimizationJobItem {
  id: string;
  siteDomain: string;
  url: string;
  viewport: 'mobile' | 'desktop';
  status: 'completed' | 'processing' | 'queued' | 'failed';
  criticalCssSizeKb: number;
  lcpSelector: string | null;
  durationMs: number;
  createdAt: string;
  errorMessage?: string | null;
}

export interface AttentionItem {
  id: string;
  type: 'danger' | 'warn';
  title: string;
  description: string;
  domain: string;
  actionLabel: string;
  jobId?: string;
}

export interface ToastMessage {
  id: string;
  text: string;
  type?: 'success' | 'info' | 'error';
}

export interface PlanDetails {
  id: string;
  name: string;
  priceMonthly: number;
  status: string;
  maxSites: number;
  usedSites: number;
  maxRuns: number;
  usedRuns: number;
  currentPeriodEnd: number;
}

export interface BillingStatusData {
  subscription: Subscription;
  plan: PlanDetails;
  customer: {
    userId: string;
    email: string;
  };
}

export interface UserProfileData {
  user: {
    id: string;
    email: string;
  };
  subscription: Subscription;
  siteCount: number;
}

export interface DashboardContextType {
  sites: ExtendedSite[];
  jobs: OptimizationJobItem[];
  billingData: BillingStatusData | null;
  isLoading: boolean;
  refreshFleetData: () => Promise<void>;
  addToast: (text: string, type?: 'success' | 'info' | 'error') => void;
  handlePurgeSite: (domain: string) => Promise<void>;
  handleRunOptimization: (domain: string) => Promise<void>;
  handleCreateSite: (domain: string) => Promise<void>;
  handleDeleteSite: (siteId: string, domain: string) => Promise<void>;
  handleUpdatePreset: (siteId: string, preset: SitePreset) => Promise<void>;
  handleUpdateConfig: (siteId: string, config: SiteConfig) => Promise<void>;
  handleDispatchNewJob: (url: string, viewport: 'mobile' | 'desktop') => Promise<void>;
  handleRerunJob: (jobId: string) => Promise<void>;
  handleSelectPlan: (planId: string, interval: 'monthly' | 'annual') => Promise<void>;
  handleOpenPortal: () => Promise<void>;
  handleAuthorizeConnect: (domain: string, state: string, returnUrl: string) => Promise<string>;
}

export const POLAR_PRODUCT_IDS = {
  starterMonthly: 'ca0c63de-5a98-4829-8b0f-8e81f579b58a',
  starterYearly: '3907e862-b1e1-4006-9289-040cabe18c2d',
  proMonthly: 'prod_pro_monthly',
  proYearly: 'prod_pro_yearly',
  agencyMonthly: 'prod_agency_monthly',
  agencyYearly: 'prod_agency_yearly',
};
