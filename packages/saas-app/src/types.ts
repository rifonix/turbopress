import { Site, SiteConfig, PresetType } from '@turbopress/shared';

export type AppView = 'overview' | 'sites' | 'jobs' | 'billing' | 'pricing' | 'connect' | 'login' | 'signup';

export interface ExtendedSite extends Site {
  subTitle?: string;
  score: number;
  lcp: number;
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
