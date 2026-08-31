import { Fetcher, R2Bucket, KVNamespace, D1Database, Queue } from '@cloudflare/workers-types';
import { Site, SiteConfig, ViewportMode } from '@wpinstant/shared';

export interface OptimizationQueueMessage {
  jobId: string;
  siteId: string;
  url: string;
  viewport: ViewportMode;
  attempt: number;
  structureHash?: string;
}

export interface Env {
  DB: D1Database;
  KV: KVNamespace;
  ASSETS_BUCKET: R2Bucket;
  OPTIMIZATION_QUEUE: Queue<OptimizationQueueMessage>;
  BROWSER: Fetcher;
  ASSETS?: Fetcher;
  ENVIRONMENT: string;
  SAAS_APP_URL: string;
  POLAR_ACCESS_TOKEN?: string;
  POLAR_WEBHOOK_SECRET: string;
  POLAR_SERVER?: string;
  POLAR_ENVIRONMENT?: string;
  POLAR_SANDBOX_DISCOUNT_ID?: string;
  CLERK_SECRET_KEY?: string;
  CLERK_WEBHOOK_SIGNING_SECRET?: string;
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY?: string;
  CLERK_JWT_KEY?: string;
}

export interface AppVariables {
  site?: Site;
  siteConfig?: SiteConfig;
  userId?: string;
  userEmail?: string;
  embedSite?: Record<string, unknown>;
}
