import { ExtendedSite, OptimizationJobItem, BillingStatusData, UserProfileData } from '../types';
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

async function request<T>(endpoint: string, options: RequestInit = {}, token?: string | null): Promise<T> {
  const headers = new Headers(options.headers || {});
  headers.set('Content-Type', 'application/json');

  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
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
    payload: { site_url: string; state_nonce: string; return_url: string }
  ): Promise<{ siteId: string; domain: string; apiKey: string; callback_url?: string }> {
    return request<{ siteId: string; domain: string; apiKey: string; callback_url?: string }>(
      '/api/v1/auth/pair',
      {
        method: 'POST',
        body: JSON.stringify(payload),
      },
      token
    );
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
   * Fetch live billing, subscription & usage stats
   */
  async getBillingStatus(token: string | null): Promise<BillingStatusData> {
    return request<BillingStatusData>('/api/v1/billing/status', { method: 'GET' }, token);
  },

  /**
   * Create Polar Checkout Session URL
   */
  async createCheckout(
    token: string | null,
    productId: string
  ): Promise<{ checkoutUrl: string; checkoutId: string }> {
    return request<{ checkoutUrl: string; checkoutId: string }>(
      '/api/v1/billing/checkout',
      {
        method: 'POST',
        body: JSON.stringify({ productId }),
      },
      token
    );
  },

  /**
   * Create Polar Customer Portal Session URL
   */
  async createCustomerPortal(token: string | null): Promise<{ portalUrl: string }> {
    return request<{ portalUrl: string }>(
      '/api/v1/billing/portal',
      { method: 'POST' },
      token
    );
  },
};
