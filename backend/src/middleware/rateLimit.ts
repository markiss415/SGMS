import type { NextFunction, Request, Response } from 'express';
import { ApiError } from '../utils/ApiError.js';

/** Small in-memory fixed-window rate limiter (per IP + route). Enough for a single server instance. */
export function rateLimit(opts: { windowMs: number; max: number; name: string; skipSuccessfulRequests?: boolean }) {
  const hits = new Map<string, { count: number; resetAt: number }>();
  setInterval(() => {
    const now = Date.now();
    for (const [k, v] of hits) if (v.resetAt <= now) hits.delete(k);
  }, opts.windowMs).unref();

  return (req: Request, res: Response, next: NextFunction) => {
    if (process.env.DISABLE_RATE_LIMIT === 'true') return next();
    const key = `${opts.name}:${req.ip}`;
    const now = Date.now();
    let entry = hits.get(key);
    if (!entry || entry.resetAt <= now) {
      entry = { count: 0, resetAt: now + opts.windowMs };
      hits.set(key, entry);
    }

    entry.count += 1;
    if (entry.count > opts.max) {
      res.setHeader('Retry-After', String(Math.max(1, Math.ceil((entry.resetAt - now) / 1000))));
      return next(ApiError.tooMany());
    }

    // A valid sign-in should not consume the user's failure allowance.
    if (opts.skipSuccessfulRequests) {
      const countedEntry = entry;
      res.once('finish', () => {
        if (res.statusCode >= 400 || hits.get(key) !== countedEntry) return;
        countedEntry.count = Math.max(0, countedEntry.count - 1);
        if (countedEntry.count === 0) hits.delete(key);
      });
    }

    next();
  };
}
