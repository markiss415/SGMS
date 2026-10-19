/**
 * Public (no sign-in) endpoints for the landing page. They expose only non-personal data:
 * upcoming schedule dates per purok, active announcements, and certificate verification.
 */
import { Router } from 'express';
import { z } from 'zod';
import { query } from '../../db/pool.js';
import { ApiError } from '../../utils/ApiError.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { addDays, manilaToday } from '../../utils/dates.js';
import { parse } from '../../utils/validate.js';
import { ANNOUNCEMENT_SELECT, shapeAnnouncement } from '../announcements/announcements.routes.js';
import { verifyCertificate } from '../endorsements/endorsements.routes.js';

export const publicRouter = Router();

publicRouter.get(
  '/schedules',
  asyncHandler(async (_req, res) => {
    const today = manilaToday();
    const rows = await query(
      `SELECT s.id, s.purok_id, p.name AS purok_name, s.scheduled_date, s.time_slot, s.waste_type, s.status,
              c.full_name AS collector_name
         FROM collection_schedules s JOIN puroks p ON p.id = s.purok_id JOIN users c ON c.id = s.collector_id
        WHERE s.status <> 'Cancelled' AND s.scheduled_date BETWEEN ? AND ?
        ORDER BY s.scheduled_date, s.time_slot LIMIT 100`,
      [addDays(today, -1), addDays(today, 14)],
    );
    res.json(rows);
  }),
);

publicRouter.get(
  '/announcements',
  asyncHandler(async (_req, res) => {
    const rows = await query<Record<string, unknown>>(
      `${ANNOUNCEMENT_SELECT} WHERE a.is_active = 1 ORDER BY FIELD(a.priority, 'Urgent', 'Important', 'Normal'), a.created_at DESC LIMIT 20`,
    );
    res.json(rows.map((r) => {
      const { created_by: _c, author_name: _a, ...rest } = shapeAnnouncement(r) as Record<string, unknown>;
      return rest;
    }));
  }),
);

publicRouter.get(
  '/verify-certificate/:code',
  asyncHandler(async (req, res) => {
    const code = parse(z.string().trim().toUpperCase().regex(/^BB-END-\d{4}-\d{5}$/, 'Invalid certificate code format.'), req.params.code);
    const cert = await verifyCertificate(code);
    if (!cert) throw ApiError.notFound('No approved endorsement was found with that certificate code.');
    res.json({ valid: true, ...cert });
  }),
);
