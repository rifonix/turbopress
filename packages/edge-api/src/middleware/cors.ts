import { MiddlewareHandler } from 'hono';

export const corsMiddleware: MiddlewareHandler = async (c, next) => {
  if (c.req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Site-Domain, X-WP-Instant-Version, X-WP-Version, X-User-Email, X-Embed-Token',
        'Access-Control-Max-Age': '86400',
      },
    });
  }

  await next();

  try {
    c.res.headers.set('Access-Control-Allow-Origin', '*');
    c.res.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    c.res.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Site-Domain, X-WP-Instant-Version, X-WP-Version, X-User-Email, X-Embed-Token');
  } catch {
    // Ignore error if headers are immutable (e.g. static responses)
  }
};
