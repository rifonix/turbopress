import { ExtendedSite, OptimizationJobItem, BillingStatusData, UserProfileData, SitePagesData, AttentionFeedData } from '../types';
import { SiteConfig } from '@turbopress/shared';

const API_BASE =
  (typeof process !== 'undefined' && process.env?.NEXT_PUBLIC_API_BASE_URL) ||
  'https://turbopress.webaccessibility.workers.dev';

class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

async function request<T>(
  endpoint: string,
  options: RequestInit = {},
  token?: string | null,
  userEmail?: string | null
): Promise<T> {
  const headers = new Headers(options.headers || {});
  headers.set('Content-Type', 'application/json');

  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  if (userEmail) {
    headers.set('X-User-Email', userEmail);
  }

  const url = `${API_BASE}${endpoint}`;
  try {
    const res = await fetch(url, {
      ...options,
      headers,
    });

    const data = await res.json();
    if (!res.ok || data.success === false) {
      throw new ApiError(data.error || `Request failed with status ${res.status}`, res.status);
    }

    return data.data as T;
  } catch (err: any) {
    if (err instanceof ApiError) throw err;
    console.error(`[API Error ${endpoint}]`, err);
    throw new ApiError(err?.message || 'Network request failed', 500);
  }
}

export const api = {
  /**
   * Fetch current user profile & subscription overview
   */
  async getMe(token: string | null): Promise<UserProfileData> {
    return request<UserProfileData>('/api/v1/auth/me', { method: 'GET' }, token);
  },

  /**
   * Fetch all sites for the authenticated user
   */
  async getSites(token: string | null): Promise<ExtendedSite[]> {
    return request<ExtendedSite[]>('/api/v1/sites', { method: 'GET' }, token);
  },

  /**
   * Fetch site detail with its jobs and audits
   */
  async getSiteDetail(
    token: string | null,
    siteId: string
  ): Promise<{ site: ExtendedSite; config: SiteConfig; jobs: any[]; audits: any[] }> {
    return request<{ site: ExtendedSite; config: SiteConfig; jobs: any[]; audits: any[] }>(
      `/api/v1/sites/${siteId}`,
      { method: 'GET' },
      token
    );
  },

  /**
   * Register a new WordPress site manually
   */
  async createSite(
    token: string | null,
    domain: string
  ): Promise<{ siteId: string; domain: string; apiKey: string; config: SiteConfig }> {
    return request<{ siteId: string; domain: string; apiKey: string; config: SiteConfig }>(
      '/api/v1/sites',
      {
        method: 'POST',
        body: JSON.stringify({ domain }),
      },
      token
    );
  },

  /**
   * 1-Click Handshake Pairing
   */
  async pairSite(
    token: string | null,
    payload: { domain: string; state: string; return_url: string; wp_version?: string; plugin_version?: string }
  ): Promise<{ siteId: string; domain: string; apiKey: string; callback_url?: string; message?: string }> {
    return request<{ siteId: string; domain: string; apiKey: string; callback_url?: string; message?: string }>(
      '/api/v1/auth/pair',
      {
        method: 'POST',
        body: JSON.stringify(payload),
      },
      token
    );
  },

  /**
   * R2 offload log (per-site KV ring buffer)
   */
  async getSiteLogs(
    token: string | null,
    siteId: string
  ): Promise<Array<{ t: number; src: string; w: number; f: string; status: string }>> {
    const res = await request<{ logs: Array<{ t: number; src: string; w: number; f: string; status: string }> }>(
      `/api/v1/sites/${siteId}/logs`,
      { method: 'GET' },
      token
    );
    return res?.logs || [];
  },

  /**
   * Update Site Configuration
   */
  async updateSiteConfig(
    token: string | null,
    siteId: string,
    config: SiteConfig
  ): Promise<{ config: SiteConfig; message: string }> {
    return request<{ config: SiteConfig; message: string }>(
      `/api/v1/sites/${siteId}/config`,
      {
        method: 'PUT',
        body: JSON.stringify(config),
      },
      token
    );
  },

  /**
   * Purge Site Edge Cache
   */
  async purgeSiteCache(
    token: string | null,
    siteId: string,
    urls?: string[]
  ): Promise<{ message: string }> {
    return request<{ message: string }>(
      `/api/v1/sites/${siteId}/purge`,
      {
        method: 'POST',
        body: JSON.stringify({ purge_all: !urls || urls.length === 0, urls }),
      },
      token
    );
  },

  /**
   * Delete Site
   */
  async deleteSite(token: string | null, siteId: string): Promise<{ message: string }> {
    return request<{ message: string }>(
      `/api/v1/sites/${siteId}`,
      { method: 'DELETE' },
      token
    );
  },

  /**
   * Fetch all optimization jobs across user's fleet
   */
  async getJobs(token: string | null): Promise<OptimizationJobItem[]> {
    return request<OptimizationJobItem[]>('/api/v1/optimize/jobs', { method: 'GET' }, token);
  },

  /**
   * Dispatch an optimization job
   */
  async dispatchJob(
    token: string | null,
    payload: { url: string; viewports?: ('mobile' | 'desktop')[]; site_id?: string }
  ): Promise<{ jobs: any[]; url: string }> {
    return request<{ jobs: any[]; url: string }>(
      '/api/v1/optimize/dispatch',
      {
        method: 'POST',
        body: JSON.stringify({
          url: payload.url,
          viewports: payload.viewports || ['mobile'],
          priority: 'high',
          site_id: payload.site_id,
        }),
      },
      token
    );
  },

  /**
   * Re-run an optimization job
   */
  async rerunJob(token: string | null, jobId: string): Promise<{ jobId: string; status: string }> {
    return request<{ jobId: string; status: string }>(
      `/api/v1/optimize/jobs/${jobId}/rerun`,
      { method: 'POST' },
      token
    );
  },

  /**
   * Per-URL optimization status + RUM vitals (Pages tab)
   */
  async getSitePages(token: string | null, siteId: string): Promise<SitePagesData> {
    return request<SitePagesData>(
      `/api/v1/sites/${siteId}/pages`,
      { method: 'GET' },
      token
    );
  },

  /**
   * Attention queue: failed/needs_attention jobs + site health warnings
   */
  async getAttention(token: string | null): Promise<AttentionFeedData> {
    return request<AttentionFeedData>('/api/v1/optimize/attention', { method: 'GET' }, token);
  },

  /**
   * Fetch live billing, subscription & usage stats
   */
  async getBillingStatus(token: string | null): Promise<BillingStatusData> {
    return request<BillingStatusData>('/api/v1/billing/status', { method: 'GET' }, token);
  },

  /**
   * Create Polar Checkout Session URL
   * `server` reflects the Polar environment used: 'sandbox' = test checkout, 'production' = live
   */
  async createCheckout(
    token: string | null,
    productId: string,
    returnTo?: string,
    userEmail?: string | null,
    planId?: string,
    interval?: 'monthly' | 'annual'
  ): Promise<{ checkoutUrl: string; checkoutId: string; server?: 'sandbox' | 'production'; discountApplied?: boolean }> {
    return request<{
      checkoutUrl: string;
      checkoutId: string;
      server?: 'sandbox' | 'production';
      discountApplied?: boolean;
    }>(
      '/api/v1/billing/checkout',
      {
        method: 'POST',
        body: JSON.stringify({ productId, returnTo, customerEmail: userEmail, planId, interval }),
      },
      token,
      userEmail
    );
  },

  /**
   * Create Polar Customer Portal Session URL
   */
  async createCustomerPortal(
    token: string | null
  ): Promise<{ portalUrl: string; server?: 'sandbox' | 'production' }> {
    return request<{ portalUrl: string; server?: 'sandbox' | 'production' }>(
      '/api/v1/billing/portal',
      { method: 'POST' },
      token
    );
  },
};
