import { Env } from '../types/env.js';

/**
 * Approximate fixed-window rate limiting on KV (read-modify-write — races
 * make it slightly permissive under burst, which is acceptable for abuse
 * prevention; it is NOT a precise quota system).
 *
 * Returns true when the request is allowed, false when the limit is hit.
 */
export async function checkRateLimit(
  env: Env,
  scope: string,
  identifier: string,
  max: number,
  windowSec: number
): Promise<boolean> {
  try {
    const key = `rl:${scope}:${identifier}`;
    const current = await env.KV.get(key);
    const count = current ? parseInt(current, 10) : 0;
    if (count >= max) {
      return false;
    }
    await env.KV.put(key, String(count + 1), { expirationTtl: windowSec });
    return true;
  } catch (err) {
    // KV failure must never take the API down — fail open, log loudly.
    console.warn('[RateLimit] KV error, failing open:', err);
    return true;
  }
}
