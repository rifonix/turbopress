import { MiddlewareHandler } from 'hono';
import { Env, AppVariables } from '../types/env.js';
import { sha256, normalizeDomain, Site, SiteConfig } from '@wpinstant/shared';

export interface CachedSiteData {
  id: string;
  user_id: string;
  domain: string;
  site_api_key_hash: string;
  config_json: string;
  is_active: number;
}

export const siteAuthMiddleware: MiddlewareHandler<{ Bindings: Env; Variables: AppVariables }> = async (c, next) => {
  const authHeader = c.req.header('Authorization');
  const rawDomain = c.req.header('X-Site-Domain');

  if (!authHeader || !authHeader.startsWith('Bearer ') || !rawDomain) {
    return c.json({ success: false, error: 'Unauthorized: Missing Authorization or X-Site-Domain header' }, 401);
  }

  const apiKey = authHeader.replace('Bearer ', '').trim();
  const domain = normalizeDomain(rawDomain);
  const keyHash = await sha256(apiKey);

  const kvKey = `site:${domain}`;
  const cached = await c.env.KV.get<CachedSiteData>(kvKey, 'json');

  let siteData: CachedSiteData | null = cached;

  if (!siteData) {
    // Fallback query to D1 SQL
    const row = await c.env.DB.prepare(
      'SELECT id, user_id, domain, site_api_key_hash, config_json, is_active FROM sites WHERE domain = ? LIMIT 1'
    )
      .bind(domain)
      .first<CachedSiteData>();

    if (!row) {
      return c.json({ success: false, error: 'Site not registered' }, 401);
    }

    siteData = row;
    // Cache in KV for 1 hour
    await c.env.KV.put(kvKey, JSON.stringify(siteData), { expirationTtl: 3600 });
  }

  if (siteData.site_api_key_hash !== keyHash) {
    return c.json({ success: false, error: 'Invalid API Key' }, 403);
  }

  if (!siteData.is_active) {
    return c.json({ success: false, error: 'Site license is inactive or subscription expired' }, 403);
  }

  let parsedConfig: SiteConfig;
  try {
    parsedConfig = JSON.parse(siteData.config_json);
  } catch {
    parsedConfig = {} as SiteConfig;
  }

  c.set('site', siteData as unknown as Site);
  c.set('siteConfig', parsedConfig);

  await next();
};

interface JWKKey {
  kty: string;
  n: string;
  e: string;
  alg?: string;
  kid?: string;
  use?: string;
}

interface JWKS {
  keys: JWKKey[];
}

function base64UrlToBytes(base64Url: string): Uint8Array {
  const pad = '='.repeat((4 - (base64Url.length % 4)) % 4);
  const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/') + pad;
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function base64UrlDecodeJson<T = any>(base64Url: string): T {
  const pad = '='.repeat((4 - (base64Url.length % 4)) % 4);
  const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/') + pad;
  return JSON.parse(atob(base64));
}

function getClerkFrontendDomain(env: Env): string | null {
  const pubKey = env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY || '';
  if (pubKey.startsWith('pk_test_') || pubKey.startsWith('pk_live_')) {
    try {
      const raw = pubKey.replace(/^pk_(test|live)_/, '');
      const decoded = atob(raw.replace(/-/g, '+').replace(/_/g, '/'));
      return decoded.replace(/\$$/, '');
    } catch {
      //
    }
  }
  return null;
}

async function getClerkJWKS(env: Env): Promise<JWKS | null> {
  const kvKey = 'clerk:jwks';
  const staleKey = 'clerk:jwks:stale';
  try {
    const cached = await env.KV.get<JWKS>(kvKey, 'json');
    if (cached && Array.isArray(cached.keys)) {
      return cached;
    }
  } catch {
    // KV unavailable or error
  }

  const domain = getClerkFrontendDomain(env);
  const jwksUrl = domain ? `https://${domain}/.well-known/jwks.json` : 'https://api.clerk.com/v1/jwks';

  try {
    const headers: Record<string, string> = {};
    if (env.CLERK_SECRET_KEY && !domain) {
      headers['Authorization'] = `Bearer ${env.CLERK_SECRET_KEY}`;
    }
    const res = await fetch(jwksUrl, { headers, signal: AbortSignal.timeout(5000) });
    if (res.ok) {
      const data = (await res.json()) as JWKS;
      if (Array.isArray(data?.keys)) {
        try {
          await env.KV.put(kvKey, JSON.stringify(data), { expirationTtl: 3600 });
          // Long-lived fallback copy for stale-if-error below.
          await env.KV.put(staleKey, JSON.stringify(data), { expirationTtl: 7 * 86400 });
        } catch {
          //
        }
        return data;
      }
    }
  } catch (err) {
    console.warn('[Clerk JWKS Fetch Error]', err);
  }

  // Stale-if-error: a Clerk JWKS outage must not 401 the whole dashboard.
  // Re-arm the short cache for 5 min so we re-check Clerk on a fast cadence
  // without hammering it per request.
  try {
    const stale = await env.KV.get<JWKS>(staleKey, 'json');
    if (stale && Array.isArray(stale.keys)) {
      console.warn('[Clerk JWKS] serving stale copy (fetch failed)');
      await env.KV.put(kvKey, JSON.stringify(stale), { expirationTtl: 300 });
      return stale;
    }
  } catch {
    //
  }

  return null;
}

const cryptoKeyCache = new Map<string, CryptoKey>();

export async function verifyClerkJwt(token: string, env: Env): Promise<{ sub: string; email?: string } | null> {
  const parts = token.split('.');
  if (parts.length !== 3) return null;

  const [headerB64, payloadB64, signatureB64] = parts;
  let header: { alg?: string; kid?: string };
  let payload: { sub?: string; exp?: number; nbf?: number; email?: string; primary_email_address?: string; email_address?: string; [k: string]: any };

  try {
    header = base64UrlDecodeJson(headerB64);
    payload = base64UrlDecodeJson(payloadB64);
  } catch {
    return null;
  }

  if (!payload?.sub) return null;

  // Verify expiration
  const now = Math.floor(Date.now() / 1000);
  if (typeof payload.exp === 'number' && payload.exp < now - 60) {
    return null; // Token expired
  }
  if (typeof payload.nbf === 'number' && payload.nbf > now + 60) {
    return null; // Token not yet active
  }

  // Cryptographic signature check via JWKS
  const jwks = await getClerkJWKS(env);
  if (!jwks || !Array.isArray(jwks.keys)) {
    // In dev / test environments only, allow fallback if JWKS fetch is impossible
    if (env.ENVIRONMENT !== 'production') {
      return { sub: payload.sub, email: payload.email || payload.primary_email_address || payload.email_address };
    }
    return null;
  }

  const jwk = header.kid ? jwks.keys.find((k) => k.kid === header.kid) : jwks.keys[0];
  if (!jwk) {
    return null;
  }

  try {
    const cacheKey = jwk.kid || `${jwk.n}_${jwk.e}`;
    let cryptoKey = cryptoKeyCache.get(cacheKey);
    if (!cryptoKey) {
      cryptoKey = await crypto.subtle.importKey(
        'jwk',
        {
          kty: jwk.kty,
          n: jwk.n,
          e: jwk.e,
          alg: 'RS256',
          ext: true,
        },
        { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
        false,
        ['verify']
      );
      cryptoKeyCache.set(cacheKey, cryptoKey);
    }

    const data = new TextEncoder().encode(`${headerB64}.${payloadB64}`);
    const sigBytes = base64UrlToBytes(signatureB64);
    const isValid = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', cryptoKey, sigBytes as any, data);

    if (!isValid) {
      return null;
    }

    return {
      sub: payload.sub,
      email: payload.email || payload.primary_email_address || payload.email_address,
    };
  } catch (err) {
    console.warn('[Clerk JWT Crypto Verify Error]', err);
    return null;
  }
}

export const saasUserAuthMiddleware: MiddlewareHandler<{ Bindings: Env; Variables: AppVariables }> = async (c, next) => {
  const authHeader = c.req.header('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return c.json({ success: false, error: 'Unauthorized: Missing user auth token' }, 401);
  }

  const token = authHeader.replace('Bearer ', '').trim();
  if (!token) {
    return c.json({ success: false, error: 'Unauthorized: Empty token' }, 401);
  }

  let verified = await verifyClerkJwt(token, c.env);

  // Dev bypass for automated local testing or token starts with user_ when explicitly in test/dev
  if (!verified && c.env.ENVIRONMENT !== 'production') {
    if (token.startsWith('user_')) {
      verified = { sub: token };
    }
  }

  if (!verified || !verified.sub) {
    return c.json({ success: false, error: 'Unauthorized: Invalid or expired token' }, 401);
  }

  const userId = verified.sub;
  let userEmail = verified.email || '';

  const headerEmail = c.req.header('X-User-Email');
  if (!userEmail && headerEmail && headerEmail.includes('@')) {
    userEmail = headerEmail.trim().toLowerCase();
  }

  c.set('userId', userId);
  c.set('userEmail', userEmail);

  // Auto-provision user in D1 if not present
  try {
    const dbEmail = userEmail || `${userId}@user.local`;
    await c.env.DB.prepare(`
      INSERT INTO users (id, email, created_at, updated_at)
      VALUES (?, ?, unixepoch(), unixepoch())
      ON CONFLICT(id) DO UPDATE SET
        email = CASE WHEN excluded.email NOT LIKE '%@user.local' THEN excluded.email ELSE users.email END,
        updated_at = unixepoch()
    `)
      .bind(userId, dbEmail)
      .run();
  } catch (err) {
    console.error('[saasUserAuthMiddleware] Error auto-provisioning user:', err);
  }

  await next();
};
