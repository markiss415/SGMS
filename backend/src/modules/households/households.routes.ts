/**
 * Households. Admin sees and manages all; a Purok Leader only their own purok;
 * a resident only their own household. Collectors have no access.
 */
import { Router } from 'express';
import { z } from 'zod';
import { execute, query, queryOne, withTransaction } from '../../db/pool.js';
import { currentUser, requireAuth, requireRole } from '../../middleware/auth.js';
import { ApiError } from '../../utils/ApiError.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { logActivity } from '../../utils/audit.js';
import { householdQrPayload, newId, randomToken } from '../../utils/ids.js';
import { body, idSchema, optionalText, phoneSchema, queryParams, requiredText } from '../../utils/validate.js';
import { leaderPurok, nextHouseholdNumber } from '../shared.js';

export const householdsRouter = Router();
householdsRouter.use(requireAuth);

const SELECT = `SELECT h.id, h.household_number, h.purok_id, h.head_name, h.contact_number, h.address_details,
       h.family_member_count, (h.waste_segregation_compliant = 1) AS waste_segregation_compliant, h.created_at,
       h.latitude, h.longitude, h.qr_token,
       p.name AS purok_name,
       (SELECT COUNT(*) FROM users u WHERE u.household_id = h.id AND u.status = 'active') AS registered_residents_count
  FROM households h JOIN puroks p ON p.id = h.purok_id`;

function shape(row: Record<string, unknown>) {
  const { qr_token, ...rest } = row;
  return {
    ...rest,
    latitude: row.latitude == null ? null : Number(row.latitude),
    longitude: row.longitude == null ? null : Number(row.longitude),
    // The QR payload (not the raw token) is what gets printed on the household card.
    qr_payload: qr_token ? householdQrPayload(String(qr_token)) : null,
    waste_segregation_compliant: Boolean(row.waste_segregation_compliant),
    registered_residents_count: Number(row.registered_residents_count ?? 0),
  };
}

householdsRouter.get(
  '/',
  requireRole('admin', 'leader', 'resident'),
  asyncHandler(async (req, res) => {
    const user = currentUser(req);
    const q = queryParams(req, z.object({ purok_id: z.string().max(64).optional(), search: z.string().trim().max(100).optional() }));
    const where: string[] = [];
    const params: unknown[] = [];
    if (user.role === 'leader') {
      where.push('h.purok_id = ?');
      params.push(leaderPurok(user));
    } else if (user.role === 'resident') {
      where.push('h.id = ?');
      params.push(user.household_id ?? '');
    } else if (q.purok_id) {
      where.push('h.purok_id = ?');
      params.push(q.purok_id);
    }
    if (q.search) {
      where.push('(h.head_name LIKE ? OR h.household_number LIKE ? OR h.address_details LIKE ?)');
      const like = `%${q.search.replace(/[%_\\]/g, '\\$&')}%`;
      params.push(like, like, like);
    }
    const rows = await query<Record<string, unknown>>(
      `${SELECT} ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY p.name, h.household_number`,
      params,
    );
    res.json(rows.map(shape));
  }),
);

const householdInput = z.object({
  head_name: requiredText(150, 'Head of household'),
  purok_id: z.string().max(64).optional(),
  contact_number: phoneSchema,
  address_details: optionalText(255),
  family_member_count: z.coerce.number().int().min(1, 'Family members must be at least 1.').max(50).optional().default(1),
  waste_segregation_compliant: z.boolean().optional(),
  latitude: z.coerce.number().min(-90).max(90).nullable().optional(),
  longitude: z.coerce.number().min(-180).max(180).nullable().optional(),
});

export const locationSchema = z.object({
  latitude: z.coerce.number({ error: 'Latitude must be a number.' }).min(-90).max(90),
  longitude: z.coerce.number({ error: 'Longitude must be a number.' }).min(-180).max(180),
});

householdsRouter.post(
  '/',
  requireRole('admin', 'leader'),
  asyncHandler(async (req, res) => {
    const user = currentUser(req);
    const input = body(req, householdInput);
    const purokId = user.role === 'leader' ? leaderPurok(user) : input.purok_id;
    if (!purokId) throw ApiError.badRequest('Please select a purok.');

    const id = await withTransaction(async (conn) => {
      const purok = await queryOne<{ id: string; name: string }>('SELECT id, name FROM puroks WHERE id = ? FOR UPDATE', [purokId], conn);
      if (!purok) throw ApiError.badRequest('Please select a valid purok.');
      const householdId = newId('hh');
      const number = await nextHouseholdNumber(conn, purok.id, purok.name);
      await execute(
        `INSERT INTO households (id, household_number, purok_id, head_name, contact_number, address_details, family_member_count, waste_segregation_compliant, latitude, longitude, qr_token)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [householdId, number, purok.id, input.head_name, input.contact_number, input.address_details || `${purok.name}, Bang-Bang, Cordova`, input.family_member_count, input.waste_segregation_compliant === false ? 0 : 1, input.latitude ?? null, input.longitude ?? null, randomToken(18)],
        conn,
      );
      await logActivity(conn, user.id, 'CREATE_HOUSEHOLD', 'Household', `Registered household ${number} (${input.head_name}) in ${purok.name}.`, req);
      return householdId;
    });
    const row = await queryOne<Record<string, unknown>>(`${SELECT} WHERE h.id = ?`, [id]);
    res.status(201).json(row && shape(row));
  }),
);

householdsRouter.put(
  '/:id',
  requireRole('admin', 'leader'),
  asyncHandler(async (req, res) => {
    const user = currentUser(req);
    const id = idSchema.parse(req.params.id);
    const input = body(req, householdInput.partial().omit({ purok_id: true }));
    const existing = await queryOne<{ id: string; purok_id: string; household_number: string }>(
      'SELECT id, purok_id, household_number FROM households WHERE id = ?',
      [id],
    );
    if (!existing || (user.role === 'leader' && existing.purok_id !== leaderPurok(user))) throw ApiError.notFound('Household not found.');

    const sets: string[] = [];
    const params: unknown[] = [];
    if (input.head_name !== undefined) { sets.push('head_name = ?'); params.push(input.head_name); }
    if (req.body.contact_number !== undefined) { sets.push('contact_number = ?'); params.push(input.contact_number); }
    if (req.body.address_details !== undefined && input.address_details) { sets.push('address_details = ?'); params.push(input.address_details); }
    if (req.body.family_member_count !== undefined) { sets.push('family_member_count = ?'); params.push(input.family_member_count); }
    if (input.waste_segregation_compliant !== undefined) { sets.push('waste_segregation_compliant = ?'); params.push(input.waste_segregation_compliant ? 1 : 0); }
    if (input.latitude !== undefined && input.longitude !== undefined) {
      sets.push('latitude = ?', 'longitude = ?');
      params.push(input.latitude, input.longitude);
    }
    if (sets.length) {
      await execute(`UPDATE households SET ${sets.join(', ')} WHERE id = ?`, [...params, id]);
      await logActivity(undefined, user.id, 'UPDATE_HOUSEHOLD', 'Household', `Updated household ${existing.household_number}.`, req);
    }
    const row = await queryOne<Record<string, unknown>>(`${SELECT} WHERE h.id = ?`, [id]);
    res.json(row && shape(row));
  }),
);


/** Issues a new QR code for a household (e.g. the printed card was lost). The old QR stops working. */
householdsRouter.post(
  '/:id/regenerate-qr',
  requireRole('admin', 'leader'),
  asyncHandler(async (req, res) => {
    const user = currentUser(req);
    const id = idSchema.parse(req.params.id);
    const existing = await queryOne<{ purok_id: string; household_number: string }>('SELECT purok_id, household_number FROM households WHERE id = ?', [id]);
    if (!existing || (user.role === 'leader' && existing.purok_id !== leaderPurok(user))) throw ApiError.notFound('Household not found.');
    await execute('UPDATE households SET qr_token = ? WHERE id = ?', [randomToken(18), id]);
    await logActivity(undefined, user.id, 'REGENERATE_QR', 'Household', `Issued a new QR code for ${existing.household_number}.`, req);
    const row = await queryOne<Record<string, unknown>>(`${SELECT} WHERE h.id = ?`, [id]);
    res.json(row && shape(row));
  }),
);

/** A resident pins their own house on the map (e.g. with the phone's GPS). */
householdsRouter.put(
  '/mine/location',
  requireRole('resident'),
  asyncHandler(async (req, res) => {
    const user = currentUser(req);
    if (!user.household_id) throw ApiError.forbidden('Your account is not linked to a household yet.');
    const loc = body(req, locationSchema);
    await execute('UPDATE households SET latitude = ?, longitude = ? WHERE id = ?', [loc.latitude, loc.longitude, user.household_id]);
    await logActivity(undefined, user.id, 'SET_LOCATION', 'Household', 'Updated household map location.', req);
    const row = await queryOne<Record<string, unknown>>(`${SELECT} WHERE h.id = ?`, [user.household_id]);
    res.json(row && shape(row));
  }),
);

/** Makes sure every household has a QR token (households created before migration 002). */
export async function backfillHouseholdQrTokens(): Promise<void> {
  const rows = await query<{ id: string }>('SELECT id FROM households WHERE qr_token IS NULL');
  for (const r of rows) await execute('UPDATE households SET qr_token = ? WHERE id = ? AND qr_token IS NULL', [randomToken(18), r.id]);
}
