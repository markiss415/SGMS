/** Barangay settings. Readable by anyone (no secrets are stored here); only the Admin can change them. */
import { Router } from 'express';
import { z } from 'zod';
import { execute, query, withTransaction } from '../../db/pool.js';
import { currentUser, requireAuth, requireRole } from '../../middleware/auth.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { logActivity } from '../../utils/audit.js';
import { newId } from '../../utils/ids.js';
import { body, proofSchema } from '../../utils/validate.js';

export const settingsRouter = Router();

const text = (max: number) => z.string().trim().min(1, 'cannot be empty').max(max);

/** The only keys that exist; unknown keys are rejected. */
const settingsSchema = z
  .object({
    weekly_contribution_fee: z
      .union([z.string(), z.number()])
      .transform((v) => Number(v))
      .refine((n) => Number.isFinite(n) && n > 0 && n <= 1000, 'must be an amount between 0.01 and 1000')
      .transform((n) => n.toFixed(2)),
    barangay_name: text(120),
    municipality_name: text(120),
    province_name: text(120),
    barangay_captain: text(150),
    contact_hotline: text(150),
    gcash_treasury_number: text(150),
    maya_number: z.string().trim().max(150),
    // Official QR images (PNG/JPG/WEBP data URL, ≤ 2 MB) or '' to remove.
    gcash_qr_image: proofSchema,
    maya_qr_image: proofSchema,
    map_center_lat: z.coerce.number().min(-90).max(90).transform(String),
    map_center_lng: z.coerce.number().min(-180).max(180).transform(String),
  })
  .partial()
  .strict();

/** QR images are large, so the general settings call only says whether they exist (see GET /payments/channels). */
export async function getSettingsObject(): Promise<Record<string, string>> {
  const rows = await query<{ setting_key: string; setting_value: string }>('SELECT setting_key, setting_value FROM system_settings');
  const out: Record<string, string> = {};
  for (const r of rows) {
    if (r.setting_key.endsWith('_qr_image')) out[`has_${r.setting_key}`] = r.setting_value ? 'true' : 'false';
    else out[r.setting_key] = r.setting_value;
  }
  return out;
}

settingsRouter.get(
  '/',
  asyncHandler(async (_req, res) => {
    res.json(await getSettingsObject());
  }),
);

settingsRouter.put(
  '/',
  requireAuth,
  requireRole('admin'),
  asyncHandler(async (req, res) => {
    const user = currentUser(req);
    const updates = body(req, settingsSchema);
    const entries = Object.entries(updates).filter(([, v]) => v !== undefined) as [string, string][];
    await withTransaction(async (conn) => {
      for (const [key, value] of entries) {
        await execute(
          `INSERT INTO system_settings (id, setting_key, setting_value) VALUES (?, ?, ?)
           ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)`,
          [newId('set'), key, value],
          conn,
        );
      }
      if (entries.length) {
        await logActivity(conn, user.id, 'UPDATE_SETTINGS', 'Settings', `Updated: ${entries.map(([k, v]) => (k.endsWith('_qr_image') ? `${k}=${v ? '(new image)' : '(removed)'}` : `${k}=${v}`)).join(', ')}`, req);
      }
    });
    res.json({ success: true, settings: await getSettingsObject() });
  }),
);
