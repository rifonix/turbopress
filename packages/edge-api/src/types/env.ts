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
  ENVIRONMENT: string;
  SAAS_APP_URL: string;
  POLAR_ACCESS_TOKEN?: string;
  POLAR_WEBHOOK_SECRET: string;
  POLAR_SERVER?: string;
  POLAR_ENVIRONMENT?: string;
  POLAR_SANDBOX_DISCOUNT_ID?: string;
  // Production catalog product IDs (worker vars). Resolution order at
  // checkout: these vars → catalog auto-resolve by name. Self-serve plans
  // only; `scale` is custom/non-self-serve and has no checkout product.
  POLAR_PRODUCT_STARTER_MONTHLY?: string;
  POLAR_PRODUCT_STARTER_ANNUAL?: string;
  POLAR_PRODUCT_GROWTH_MONTHLY?: string;
  POLAR_PRODUCT_GROWTH_ANNUAL?: string;
  POLAR_PRODUCT_AGENCY_MONTHLY?: string;
  POLAR_PRODUCT_AGENCY_ANNUAL?: string;
  // Legacy names kept so existing deployments keep resolving until rotated.
  POLAR_PRODUCT_PRO_MONTHLY?: string;
  POLAR_PRODUCT_PRO_ANNUAL?: string;
  POLAR_PRODUCT_ENTERPRISE_MONTHLY?: string;
  POLAR_PRODUCT_ENTERPRISE_ANNUAL?: string;
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
  organizationId?: string;
  organizationRole?: string;
  embedSite?: Record<string, unknown>;
}
