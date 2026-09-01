import { Site, SiteConfig, PresetType, Subscription } from '@wpinstant/shared';

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
  score: number | null;
  mobileScore?: number | null;
  desktopScore?: number | null;
  lcp: number | null;
  cls?: number | null;
  ttfbMs?: number | null;
  cacheHitRate?: number | null;
  lastJobTime: string | null;
  status: 'connected' | 'optimized' | 'optimizing' | 'attention' | 'disconnected';
  config?: SiteConfig;
}

export type SitePreset = PresetType;

export interface OptimizationJobItem {
  id: string;
  siteDomain: string;
  url: string;
  viewport: 'mobile' | 'desktop';
  status: 'completed' | 'processing' | 'queued' | 'failed' | 'needs_attention';
  criticalCssSizeKb: number | null;
  lcpSelector: string | null;
  durationMs: number | null;
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

export interface SitePageItem {
  url: string;
  path: string;
  totalJobs: number;
  completedJobs: number;
  failedJobs: number;
  lastRunAt: number;
  lastRunRelative: string | null;
  cssAgeHours: number | null;
  criticalCssKb: number | null;
  lcpImageUrl: string | null;
}

export interface RumDay {
  day: string;
  views: number;
  errors: number;
  lcpP75: number | null;
  clsP75: number | null;
}

export interface SitePagesData {
  pages: SitePageItem[];
  rum: RumDay[];
}

export interface AttentionJobItem {
  id: string;
  siteId: string;
  siteDomain: string;
  url: string;
  viewport: 'mobile' | 'desktop';
  status: 'failed' | 'needs_attention';
  errorMessage: string | null;
  attempts: number;
  createdAt: string;
}

export interface AttentionWarningItem {
  siteId: string;
  domain: string;
  kind: 'auto_degrade' | 'health_error';
  message: string;
  at?: number;
}

export interface AttentionFeedData {
  jobs: AttentionJobItem[];
  warnings: AttentionWarningItem[];
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
  hasActivePlan: boolean;
  subscription: Subscription | null;
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
  hasActivePlan: boolean;
  subscription: Subscription | null;
  siteCount: number;
}

export interface DashboardContextType {
  sites: ExtendedSite[];
  jobs: OptimizationJobItem[];
  hasMoreJobs: boolean;
  loadMoreJobs: () => Promise<void>;
  billingData: BillingStatusData | null;
  isLoading: boolean;
  isVerifyingPurchase: boolean;
  toasts: ToastMessage[];
  refreshFleetData: () => Promise<void>;
  addToast: (text: string, type?: 'success' | 'info' | 'error') => void;
  dismissToast: (id: string) => void;
  handlePurgeSite: (domain: string) => Promise<void>;
  handleRunOptimization: (domain: string) => Promise<void>;
  handleCreateSite: (domain: string) => Promise<{ apiKey?: string; siteId?: string } | void>;
  handleDeleteSite: (siteId: string, domain: string) => Promise<void>;
  handleUpdatePreset: (siteId: string, preset: SitePreset) => Promise<void>;
  handleUpdateConfig: (siteId: string, config: SiteConfig) => Promise<void>;
  handleDispatchNewJob: (url: string, viewport: 'mobile' | 'desktop') => Promise<void>;
  handleRerunJob: (jobId: string) => Promise<void>;
  handleSelectPlan: (planId: string, interval: 'monthly' | 'annual', returnTo?: string) => Promise<void>;
  handleOpenPortal: () => Promise<void>;
  handleAuthorizeConnect: (domain: string, state: string, returnUrl: string) => Promise<string>;
}

// Client product IDs are advisory only — the API resolves the authoritative
// product server-side (env POLAR_PRODUCT_{PLAN}_{MONTHLY|ANNUAL} on the
// wpinstant-api worker, then catalog auto-resolution). Set these to keep the
// client's initial guess aligned; NEXT_PUBLIC_POLAR_PRODUCT_* are inlined at
// build time, so they must be present when the dashboard is built.
const envProduct = (key: string, fallback: string) => {
  const v = process.env[`NEXT_PUBLIC_POLAR_PRODUCT_${key}`];
  return v && v.length > 8 ? v : fallback;
};

export const POLAR_PRODUCT_IDS = {
  starterMonthly: envProduct('STARTER_MONTHLY', 'ca0c63de-5a98-4829-8b0f-8e81f579b58a'),
  starterYearly: envProduct('STARTER_ANNUAL', '3907e862-b1e1-4006-9289-040cabe18c2d'),
  proMonthly: envProduct('PRO_MONTHLY', 'prod_pro_monthly'),
  proYearly: envProduct('PRO_ANNUAL', 'prod_pro_yearly'),
  agencyMonthly: envProduct('AGENCY_MONTHLY', 'prod_agency_monthly'),
  agencyYearly: envProduct('AGENCY_ANNUAL', 'prod_agency_yearly'),
};
