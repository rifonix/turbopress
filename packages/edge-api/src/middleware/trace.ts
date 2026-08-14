import { MiddlewareHandler } from 'hono';
import { Env, AppVariables } from '../types/env.js';

export const traceMiddleware: MiddlewareHandler<{ Bindings: Env; Variables: AppVariables }> = async (c, next) => {
  const start = Date.now();
  const traceId = c.req.header('cf-ray') || crypto.randomUUID();
  const method = c.req.method;
  const path = c.req.path;
  const clientIp = c.req.header('cf-connecting-ip') || c.req.header('x-forwarded-for') || 'unknown';
  const userAgent = c.req.header('user-agent') || 'unknown';

  c.header('X-Trace-Id', traceId);

  console.log(`[TRACE START] ${method} ${path} [id=${traceId}] [ip=${clientIp}]`);

  try {
    await next();
    const duration = Date.now() - start;
    const status = c.res.status;
    console.log(`[TRACE END] ${method} ${path} -> ${status} (${duration}ms) [id=${traceId}]`);
  } catch (err: any) {
    const duration = Date.now() - start;
    console.error(`[TRACE ERROR] ${method} ${path} -> FAILED (${duration}ms) [id=${traceId}]:`, err);
    throw err;
  }
};
