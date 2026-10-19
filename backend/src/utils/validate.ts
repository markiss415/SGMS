import type { Request } from 'express';
import { z } from 'zod';
import { ApiError } from './ApiError.js';
import { isValidDate } from './dates.js';

/** Parses `data` with the schema or throws a 400 with the first readable message. */
export function parse<T extends z.ZodType>(schema: T, data: unknown): z.infer<T> {
  const result = schema.safeParse(data);
  if (!result.success) {
    const first = result.error.issues[0];
    const field = first?.path?.join('.');
    throw ApiError.badRequest(first ? (field ? `${field}: ${first.message}` : first.message) : 'Invalid input.');
  }
  return result.data;
}

export const body = <T extends z.ZodType>(req: Request, schema: T) => parse(schema, req.body ?? {});
export const queryParams = <T extends z.ZodType>(req: Request, schema: T) => parse(schema, req.query ?? {});

export const trimmed = (max: number) => z.string().trim().max(max);
export const requiredText = (max: number, label = 'This field') =>
  z.string({ error: `${label} is required.` }).trim().min(1, `${label} is required.`).max(max);
export const optionalText = (max: number) =>
  z.string().trim().max(max).optional().transform((v) => v ?? '');
export const idSchema = z.string().trim().min(1).max(64);
export const dateSchema = z.string().trim().refine(isValidDate, 'must be a valid date (YYYY-MM-DD)');
export const phoneSchema = z
  .string()
  .trim()
  .max(30)
  .refine((v) => v === '' || /^[0-9+()\-\s/]{7,30}$/.test(v), 'must be a valid phone number')
  .optional()
  .transform((v) => v ?? '');
export const emailSchema = z.string().trim().toLowerCase().max(120).pipe(z.email('must be a valid email address'));
export const usernameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(3, 'must be at least 3 characters')
  .max(60)
  .regex(/^[a-z0-9._-]+$/, 'may only contain letters, numbers, dots, dashes and underscores');
export const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters.')
  .max(128, 'Password is too long.')
  .refine((v) => /[A-Za-z]/.test(v) && /[0-9]/.test(v), 'Password must contain letters and numbers.');

/**
 * Proof attachments: an uploaded image (data URL, ≤ 2 MB) or an https link.
 * Only PNG/JPEG/WEBP images are accepted; the bytes are checked, not just the label.
 */
export const proofSchema = z
  .string()
  .trim()
  .max(2_900_000, 'Proof image must be 2 MB or smaller.')
  .optional()
  .transform((v) => v ?? '')
  .refine((v) => v === '' || isAllowedProof(v), 'Proof must be a PNG, JPG or WEBP image (max 2 MB) or an https:// link.');

function isAllowedProof(v: string): boolean {
  if (/^https:\/\/[^\s<>"']+$/i.test(v)) return v.length <= 2000;
  const m = /^data:image\/(png|jpeg|jpg|webp);base64,([A-Za-z0-9+/=]+)$/.exec(v);
  if (!m) return false;
  const bytes = Buffer.from(m[2].slice(0, 64), 'base64');
  const isPng = bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;
  const isJpg = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  const isWebp = bytes.subarray(0, 4).toString('ascii') === 'RIFF' && bytes.subarray(8, 12).toString('ascii') === 'WEBP';
  return isPng || isJpg || isWebp;
}
