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
    const now = Date.now();
    const raw = await env.KV.get(key);

    let count = 0;
    let resetAt = 0;
    if (raw) {
      try {
        const parsed = JSON.parse(raw) as { count?: number; resetAt?: number };
        count = parsed.count || 0;
        resetAt = parsed.resetAt || 0;
      } catch {
        // Legacy plain-integer value: honor the count, reset the window.
        count = parseInt(raw, 10) || 0;
      }
    }
    if (resetAt <= now) {
      count = 0;
      resetAt = now + windowSec * 1000;
    }
    if (count >= max) {
      return false;
    }
    // TTL tracks the remaining window so accepted requests can never extend
    // it — continuous sub-limit traffic cannot accumulate indefinitely.
    const ttlSec = Math.max(1, Math.ceil((resetAt - now) / 1000));
    await env.KV.put(key, JSON.stringify({ count: count + 1, resetAt }), { expirationTtl: ttlSec });
    return true;
  } catch (err) {
    // KV failure must never take the API down — fail open, log loudly.
    console.warn('[RateLimit] KV error, failing open:', err);
    return true;
  }
}
