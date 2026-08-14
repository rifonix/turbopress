import { Site, SiteConfig, PresetType } from '@turbopress/shared';

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

export interface ExtendedSite extends Site {
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

export const POLAR_PRODUCT_IDS = {
  starterMonthly: 'ca0c63de-5a98-4829-8b0f-8e81f579b58a',
  starterYearly: '3907e862-b1e1-4006-9289-040cabe18c2d',
  proMonthly: 'prod_pro_monthly',
  proYearly: 'prod_pro_yearly',
  agencyMonthly: 'prod_agency_monthly',
  agencyYearly: 'prod_agency_yearly',
};
