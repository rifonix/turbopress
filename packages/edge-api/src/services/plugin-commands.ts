import { hmacSha256Hex } from '@wpinstant/shared';
import { Env } from '../types/env.js';

export interface PluginCommandSite {
  site_url: string | null;
  callback_secret: string | null;
}

/**
 * Push a signed command to the plugin's optimize-callback REST endpoint so
 * dashboard changes apply instantly. Returns false when the site has no
 * callback channel configured or the request fails.
 */
export async function pushPluginCommand(
  env: Env,
  site: PluginCommandSite,
  payload: Record<string, unknown>
): Promise<boolean> {
  if (!site.site_url || !site.callback_secret) return false;
  const body = JSON.stringify(payload);
  const signature = await hmacSha256Hex(site.callback_secret, body);
  try {
    const res = await fetch(`${site.site_url.replace(/\/+$/, '')}/wp-json/wp-instant/v1/optimize-callback`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-WP-Instant-Signature': signature,
      },
      body,
      signal: AbortSignal.timeout(8000),
    });
    return res.ok;
  } catch {
    return false;
  }
}
