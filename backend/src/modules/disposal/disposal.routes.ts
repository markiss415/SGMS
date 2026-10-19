/**
 * Resident disposal participation and Purok Leader verification.
 *  - One live submission per household per collection (DB-enforced).
 *  - Leaders verify only submissions from their own purok; a decision is final.
 */
import { Router } from 'express';
import { z } from 'zod';
import { execute, query, queryOne, withTransaction } from '../../db/pool.js';
import { currentUser, requireAuth, requireRole, type AuthUser } from '../../middleware/auth.js';
import { ApiError } from '../../utils/ApiError.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { logActivity } from '../../utils/audit.js';
import { addDays, manilaToday } from '../../utils/dates.js';
import { newId } from '../../utils/ids.js';
import { notify } from '../../utils/notify.js';
import { body, idSchema, optionalText, proofSchema, queryParams } from '../../utils/validate.js';
import { leaderPurok, residentHousehold } from '../shared.js';
import { WASTE_TYPES } from '../schedules/schedules.routes.js';

export const disposalRouter = Router();
disposalRouter.use(requireAuth);

/** How many days after a collection a resident may still log their set-out. */
const SUBMISSION_WINDOW_DAYS = 3;

const SELECT = `
  SELECT d.id, d.schedule_id, d.resident_id, d.household_id, d.purok_id, d.waste_type, d.bag_count, d.notes,
         d.proof_url, d.submission_timestamp, d.created_at, d.verification_status, d.verification_remarks,
         d.verified_at, d.verified_by,
         r.full_name AS resident_name, h.household_number, p.name AS purok_name,
         s.scheduled_date, s.time_slot, s.status AS schedule_status, v.full_name AS leader_name
    FROM disposal_submissions d
    JOIN users r ON r.id = d.resident_id
    JOIN households h ON h.id = d.household_id
    JOIN puroks p ON p.id = d.purok_id
    JOIN collection_schedules s ON s.id = d.schedule_id
    LEFT JOIN users v ON v.id = d.verified_by`;

function scope(user: AuthUser): { sql: string; params: unknown[] } {
  if (user.role === 'admin') return { sql: '1=1', params: [] };
  if (user.role === 'leader') return { sql: 'd.purok_id = ?', params: [leaderPurok(user)] };
  if (user.role === 'resident') return { sql: 'd.household_id = ?', params: [user.household_id ?? ''] };
  throw ApiError.forbidden();
}

function shape(row: Record<string, unknown>) {
  return { ...row, notes: row.notes ?? '', proof_url: row.proof_url ?? '', verification_remarks: row.verification_remarks ?? '' };
}

disposalRouter.get(
  '/submissions',
  requireRole('admin', 'leader', 'resident'),
  asyncHandler(async (req, res) => {
    const user = currentUser(req);
    const q = queryParams(req, z.object({ status: z.enum(['Pending', 'Verified', 'Rejected']).optional(), schedule_id: z.string().max(64).optional() }));
    const sc = scope(user);
    const where = [sc.sql];
    const params = [...sc.params];
    if (q.status) { where.push('d.verification_status = ?'); params.push(q.status); }
    if (q.schedule_id) { where.push('d.schedule_id = ?'); params.push(q.schedule_id); }
    const rows = await query<Record<string, unknown>>(
      `${SELECT} WHERE ${where.join(' AND ')}
        ORDER BY FIELD(d.verification_status, 'Pending', 'Verified', 'Rejected'), d.submission_timestamp DESC LIMIT 1000`,
      params,
    );
    res.json(rows.map(shape));
  }),
);

disposalRouter.post(
  '/submit',
  requireRole('resident'),
  asyncHandler(async (req, res) => {
    const user = currentUser(req);
    const { household_id, purok_id } = residentHousehold(user);
    const input = body(
      req,
      z.object({
        schedule_id: idSchema,
        waste_type: z.enum(WASTE_TYPES).optional(),
        bag_count: z.coerce.number().int().min(1, 'Bag count must be at least 1.').max(50, 'Bag count looks too high.').optional().default(1),
        notes: optionalText(1000),
        proof_url: proofSchema,
      }),
    );

    const id = await withTransaction(async (conn) => {
      const s = await queryOne<{ id: string; purok_id: string; status: string; scheduled_date: string; waste_type: string; time_slot: string }>(
        'SELECT id, purok_id, status, scheduled_date, waste_type, time_slot FROM collection_schedules WHERE id = ? FOR UPDATE',
        [input.schedule_id],
        conn,
      );
      if (!s || s.purok_id !== purok_id) throw ApiError.notFound('That collection schedule is not for your purok.');
      if (s.status === 'Cancelled') throw ApiError.badRequest('That collection was cancelled.');
      const today = manilaToday();
      if (s.scheduled_date > today) throw ApiError.badRequest(`You can log your disposal on the collection day (${s.scheduled_date}).`);
      if (s.scheduled_date < addDays(today, -SUBMISSION_WINDOW_DAYS)) {
        throw ApiError.badRequest(`Disposal logs must be submitted within ${SUBMISSION_WINDOW_DAYS} days of the collection.`);
      }
      const existing = await queryOne<{ verification_status: string }>(
        "SELECT verification_status FROM disposal_submissions WHERE household_id = ? AND schedule_id = ? AND verification_status <> 'Rejected'",
        [household_id, s.id],
        conn,
      );
      if (existing) throw ApiError.conflict(`Your household already submitted a disposal record for this collection (status: ${existing.verification_status}).`);

      const subId = newId('dsp');
      await execute(
        `INSERT INTO disposal_submissions (id, schedule_id, resident_id, household_id, purok_id, waste_type, bag_count, notes, proof_url)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [subId, s.id, user.id, household_id, purok_id, input.waste_type ?? s.waste_type, input.bag_count, input.notes, input.proof_url || null],
        conn,
      );
      const leader = await queryOne<{ leader_id: string | null }>('SELECT leader_id FROM puroks WHERE id = ?', [purok_id], conn);
      await notify(conn, leader?.leader_id, 'Disposal Verification Needed', `${user.full_name} logged ${input.bag_count} bag(s) for the ${s.scheduled_date} collection.`, 'disposal', 'disposal-verification');
      await logActivity(conn, user.id, 'SUBMIT_DISPOSAL', 'Disposal', `Logged ${input.bag_count} bag(s) for the ${s.scheduled_date} collection.`, req);
      return subId;
    });
    const row = await queryOne<Record<string, unknown>>(`${SELECT} WHERE d.id = ?`, [id]);
    const submission = row && shape(row);
    res.status(201).json({ submission, verification: { status: 'Pending' } });
  }),
);

disposalRouter.post(
  '/verify',
  requireRole('leader'),
  asyncHandler(async (req, res) => {
    const user = currentUser(req);
    const purokId = leaderPurok(user);
    const input = body(
      req,
      z.object({
        submission_id: idSchema,
        status: z.enum(['Verified', 'Rejected'], { error: 'Decision must be Verified or Rejected.' }),
        remarks: optionalText(1000),
      }),
    );
    if (input.status === 'Rejected' && !input.remarks) throw ApiError.badRequest('Please give a reason when rejecting a disposal record.');

    await withTransaction(async (conn) => {
      const d = await queryOne<{ id: string; purok_id: string; verification_status: string; resident_id: string; scheduled_date: string }>(
        `SELECT d.id, d.purok_id, d.verification_status, d.resident_id, s.scheduled_date
           FROM disposal_submissions d JOIN collection_schedules s ON s.id = d.schedule_id WHERE d.id = ? FOR UPDATE`,
        [input.submission_id],
        conn,
      );
      if (!d || d.purok_id !== purokId) throw ApiError.notFound('Disposal record not found in your purok.');
      if (d.verification_status !== 'Pending') throw ApiError.conflict(`This record was already ${d.verification_status.toLowerCase()}.`);
      await execute(
        'UPDATE disposal_submissions SET verification_status = ?, verified_by = ?, verification_remarks = ?, verified_at = UTC_TIMESTAMP() WHERE id = ?',
        [input.status, user.id, input.remarks || null, d.id],
        conn,
      );
      await notify(
        conn,
        d.resident_id,
        `Disposal Record ${input.status}`,
        `Your disposal log for the ${d.scheduled_date} collection was ${input.status.toLowerCase()} by ${user.full_name}.${input.remarks ? ` Note: ${input.remarks}` : ''}${input.status === 'Rejected' ? ' You may submit a corrected log.' : ''}`,
        'disposal',
        'my-disposal',
      );
      await logActivity(conn, user.id, 'VERIFY_DISPOSAL', 'Disposal', `${input.status} disposal record ${d.id}.`, req);
    });
    const row = await queryOne<Record<string, unknown>>(`${SELECT} WHERE d.id = ?`, [input.submission_id]);
    res.json(row && shape(row));
  }),
);
