export type PlanId = 'starter' | 'growth' | 'agency' | 'scale';

export type BillingInterval = 'monthly' | 'annual';

export type PlanPriority = 'standard' | 'priority' | 'dedicated';

export interface PlanContract {
  id: PlanId;
  name: string;
  description: string;
  isSelfServe: boolean;
  priceMonthlyCents: number | null;
  priceAnnualCents: number | null;
  maxSites: number;
  monthlyCredits: number;
  maxConcurrentJobs: number;
  crawlEnabled: boolean;
  maxCrawlPages: number;
  rumRetentionDays: number;
  monthlyPageviews: number;
  monthlyBytes: number;
  priority: PlanPriority;
  features: readonly string[];
}

/**
 * The commercial contract shared by checkout, entitlements, and the UI.
 * Annual prices are twelve monthly charges less exactly 20%.
 */
export const PLAN_CONTRACT: Record<PlanId, PlanContract> = {
  starter: {
    id: 'starter',
    name: 'Starter',
    description: 'For one WordPress site that needs a safer, faster baseline.',
    isSelfServe: true,
    priceMonthlyCents: 1900,
    priceAnnualCents: 18240,
    maxSites: 1,
    monthlyCredits: 250,
    maxConcurrentJobs: 1,
    crawlEnabled: false,
    maxCrawlPages: 0,
    rumRetentionDays: 30,
    monthlyPageviews: 60_000,
    monthlyBytes: 25 * 1024 * 1024 * 1024,
    priority: 'standard',
    features: [
      'Core cache and Critical CSS engine',
      'WooCommerce-safe dynamic handling',
      'Manual URL optimization',
      '30-day RUM health history',
    ],
  },
  growth: {
    id: 'growth',
    name: 'Growth',
    description: 'For growing brands, stores, and small site fleets.',
    isSelfServe: true,
    priceMonthlyCents: 4900,
    priceAnnualCents: 47040,
    maxSites: 5,
    monthlyCredits: 1500,
    maxConcurrentJobs: 3,
    crawlEnabled: true,
    maxCrawlPages: 250,
    rumRetentionDays: 90,
    monthlyPageviews: 250_000,
    monthlyBytes: 100 * 1024 * 1024 * 1024,
    priority: 'standard',
    features: [
      'Everything in Starter',
      'Manual and automated crawl optimization',
      '90-day RUM health history',
      'Priority queue access',
    ],
  },
  agency: {
    id: 'agency',
    name: 'Agency',
    description: 'For agencies managing a larger client fleet from one workspace.',
    isSelfServe: true,
    priceMonthlyCents: 12900,
    priceAnnualCents: 123840,
    maxSites: 25,
    monthlyCredits: 6000,
    maxConcurrentJobs: 8,
    crawlEnabled: true,
    maxCrawlPages: 1500,
    rumRetentionDays: 180,
    monthlyPageviews: 1_200_000,
    monthlyBytes: 400 * 1024 * 1024 * 1024,
    priority: 'priority',
    features: [
      'Everything in Growth',
      'Fleet-level jobs and health views',
      '1,500-page crawl limit per seed',
      '180-day RUM health history',
    ],
  },
  scale: {
    id: 'scale',
    name: 'Scale',
    description: 'Contracted capacity for large fleets and dedicated browser workloads.',
    isSelfServe: false,
    priceMonthlyCents: null,
    priceAnnualCents: null,
    maxSites: 100,
    monthlyCredits: 40_000,
    maxConcurrentJobs: 20,
    crawlEnabled: true,
    maxCrawlPages: 5000,
    rumRetentionDays: 90,
    monthlyPageviews: 4_000_000,
    monthlyBytes: 1.5 * 1024 * 1024 * 1024 * 1024,
    priority: 'dedicated',
    features: [
      'Contracted limits and dedicated capacity',
      'Custom concurrency and crawl allowance',
      'Dedicated support and SLA options',
    ],
  },
};

export const SELF_SERVE_PLAN_IDS: readonly PlanId[] = ['starter', 'growth', 'agency'];

export function normalizePlanId(value: unknown): PlanId | null {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'pro') return 'growth';
  if (normalized === 'enterprise') return 'scale';
  if (normalized === 'starter' || normalized === 'growth' || normalized === 'agency' || normalized === 'scale') {
    return normalized;
  }
  return null;
}

export function normalizeBillingInterval(value: unknown): BillingInterval {
  const normalized = String(value || '').trim().toLowerCase();
  return normalized === 'annual' || normalized === 'yearly' || normalized === 'year'
    ? 'annual'
    : 'monthly';
}

export function getPlanContract(value: unknown): PlanContract | null {
  const planId = normalizePlanId(value);
  return planId ? PLAN_CONTRACT[planId] : null;
}

export function getPlanPriceCents(planId: PlanId, interval: BillingInterval): number | null {
  return interval === 'annual'
    ? PLAN_CONTRACT[planId].priceAnnualCents
    : PLAN_CONTRACT[planId].priceMonthlyCents;
}
