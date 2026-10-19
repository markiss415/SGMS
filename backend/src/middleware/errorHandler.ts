import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import { ApiError } from '../utils/ApiError.js';

export function notFound(_req: Request, _res: Response, next: NextFunction) {
  next(ApiError.notFound('API endpoint not found.'));
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof ApiError) {
    return res.status(err.status).json({ error: err.message, details: err.details });
  }
  if (err instanceof ZodError) {
    return res.status(400).json({ error: err.issues[0]?.message ?? 'Invalid input.' });
  }
  const e = err as { type?: string; code?: string; status?: number; message?: string };
  if (e?.type === 'entity.too.large') {
    return res.status(413).json({ error: 'The upload is too large. Please attach an image of 2 MB or less.' });
  }
  if (e?.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'Malformed JSON request body.' });
  }
  if (e?.code === 'ER_DUP_ENTRY') {
    return res.status(409).json({ error: 'A record with the same details already exists.' });
  }
  console.error('[Unhandled error]', err);
  res.status(500).json({ error: 'Something went wrong on the server. Please try again.' });
}

/** Basic security headers (CSP is left to the static host / Vite in dev). */
export function securityHeaders(_req: Request, res: Response, next: NextFunction) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  next();
}

/** API responses contain personal data, so they must never be cached. */
export function noStore(_req: Request, res: Response, next: NextFunction) {
  res.setHeader('Cache-Control', 'no-store');
  next();
}
