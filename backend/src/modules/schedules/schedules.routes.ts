/**
 * Collection schedules.
 *  - Admin creates, edits and cancels schedules.
 *  - Collectors see only their assigned schedules; Leaders and Residents only their purok's.
 * Schedules are never hard-deleted (history and disposal records point to them) — DELETE cancels.
 */
import { Router, type Request } from 'express';
import { z } from 'zod';
import { execute, query, queryOne, withTransaction, type Db } from '../../db/pool.js';
import { currentUser, requireAuth, requireRole, type AuthUser } from '../../middleware/auth.js';
import { ApiError } from '../../utils/ApiError.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { logActivity } from '../../utils/audit.js';
import { manilaToday } from '../../utils/dates.js';
import { newId } from '../../utils/ids.js';
import { notify, notifyMany } from '../../utils/notify.js';
import { body, dateSchema, idSchema, optionalText, queryParams, requiredText } from '../../utils/validate.js';
import { leaderPurok } from '../shared.js';

export const schedulesRouter = Router();
schedulesRouter.use(requireAuth);

export const WASTE_TYPES = ['Biodegradable', 'Non-Biodegradable', 'Recyclable', 'Special Waste'] as const;
const STATUSES = ['Scheduled', 'In Progress', 'Completed', 'Cancelled'] as const;

export const SCHEDULE_SELECT = `
  SELECT s.id, s.purok_id, s.collector_id, s.scheduled_date, s.time_slot, s.waste_type, s.status, s.notes,
         s.created_by, s.created_at, s.updated_at,
         p.name AS purok_name, c.full_name AS collector_name, c.contact_number AS collector_contact,
         r.id AS rec_id, r.started_at AS rec_started_at, r.completed_at AS rec_completed_at, r.status AS rec_status,
         r.truck_number AS rec_truck_number, r.collected_volume_kg AS rec_volume, r.collector_notes AS rec_notes
    FROM collection_schedules s
    JOIN puroks p ON p.id = s.purok_id
    JOIN users c ON c.id = s.collector_id
    LEFT JOIN collection_records r ON r.schedule_id = s.id`;

/** Converts a joined row to the API shape (with the nested execution_record). */
export function shapeSchedule(row: Record<string, unknown>, viewer?: AuthUser) {
  const { rec_id, rec_started_at, rec_completed_at, rec_status, rec_truck_number, rec_volume, rec_notes, ...s } = row;
  const record = rec_id
    ? {
        id: rec_id,
        schedule_id: s.id,
        collector_id: s.collector_id,
        started_at: rec_started_at,
        completed_at: rec_completed_at,
        status: rec_status,
        truck_number: rec_truck_number,
        collected_volume_kg: Number(rec_volume ?? 0),
        collector_notes: rec_notes ?? '',
      }
    : null;
  return {
    ...s,
    notes: s.notes ?? '',
    collector_contact: viewer?.role === 'resident' ? '' : s.collector_contact,
    execution_record: record,
    truck_number: record?.truck_number,
    collected_volume_kg: record?.collected_volume_kg,
  };
}

/** Row-level scope for schedule reads. */
export function scheduleScope(user: AuthUser): { sql: string; params: unknown[] } {
  switch (user.role) {
    case 'admin':
      return { sql: '1=1', params: [] };
    case 'collector':
      return { sql: 's.collector_id = ?', params: [user.id] };
    case 'leader':
      return { sql: 's.purok_id = ?', params: [leaderPurok(user)] };
    default:
      return { sql: 's.purok_id = ?', params: [user.purok_id ?? ''] };
  }
}

export async function getScheduleForUser(id: string, user: AuthUser, db?: Db) {
  const scope = scheduleScope(user);
  const row = await queryOne<Record<string, unknown>>(`${SCHEDULE_SELECT} WHERE s.id = ? AND ${scope.sql}`, [id, ...scope.params], db);
  if (!row) throw ApiError.notFound('Schedule not found.');
  return shapeSchedule(row, user);
}

schedulesRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const user = currentUser(req);
    const q = queryParams(
      req,
      z.object({
        purok_id: z.string().max(64).optional(),
        status: z.enum(STATUSES).optional(),
        collector_id: z.string().max(64).optional(),
        from: dateSchema.optional(),
        to: dateSchema.optional(),
      }),
    );
    const scope = scheduleScope(user);
    const where = [scope.sql];
    const params = [...scope.params];
    if (q.purok_id) { where.push('s.purok_id = ?'); params.push(q.purok_id); }
    if (q.collector_id) { where.push('s.collector_id = ?'); params.push(q.collector_id); }
    if (q.status) { where.push('s.status = ?'); params.push(q.status); }
    if (q.from) { where.push('s.scheduled_date >= ?'); params.push(q.from); }
    if (q.to) { where.push('s.scheduled_date <= ?'); params.push(q.to); }
    const rows = await query<Record<string, unknown>>(
      `${SCHEDULE_SELECT} WHERE ${where.join(' AND ')}
        ORDER BY FIELD(s.status, 'In Progress', 'Scheduled', 'Completed', 'Cancelled'),
                 CASE WHEN s.status IN ('In Progress', 'Scheduled') THEN s.scheduled_date END ASC,
                 s.scheduled_date DESC, s.time_slot ASC
        LIMIT 1000`,
      params,
    );
    res.json(rows.map((r) => shapeSchedule(r, user)));
  }),
);

const scheduleInput = z.object({
  purok_id: idSchema,
  collector_id: idSchema,
  scheduled_date: dateSchema,
  time_slot: requiredText(60, 'Time slot'),
  waste_type: z.enum(WASTE_TYPES).optional().default('Biodegradable'),
  notes: optionalText(1000),
});

async function assertCollector(db: Db, collectorId: string) {
  const c = await queryOne<{ id: string }>("SELECT id FROM users WHERE id = ? AND role = 'collector' AND status = 'active'", [collectorId], db);
  if (!c) throw ApiError.badRequest('Please choose an active garbage collector.');
}

async function notifyScheduleParties(db: Db, purokId: string, collectorId: string, title: string, message: string) {
  await notify(db, collectorId, title, message, 'schedule', 'assigned-tasks');
  await notifyMany(db, "u.purok_id = ? AND u.role IN ('leader', 'resident')", [purokId], title, message, 'schedule', 'schedules');
}

schedulesRouter.post(
  '/',
  requireRole('admin'),
  asyncHandler(async (req, res) => {
    const admin = currentUser(req);
    const input = body(req, scheduleInput);
    if (input.scheduled_date < manilaToday()) throw ApiError.badRequest('The collection date cannot be in the past.');

    const id = await withTransaction(async (conn) => {
      const purok = await queryOne<{ name: string }>('SELECT name FROM puroks WHERE id = ?', [input.purok_id], conn);
      if (!purok) throw ApiError.badRequest('Please choose a valid purok.');
      await assertCollector(conn, input.collector_id);
      const scheduleId = newId('sch');
      try {
        await execute(
          `INSERT INTO collection_schedules (id, purok_id, collector_id, scheduled_date, time_slot, waste_type, notes, created_by)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [scheduleId, input.purok_id, input.collector_id, input.scheduled_date, input.time_slot, input.waste_type, input.notes, admin.id],
          conn,
        );
      } catch (err) {
        if ((err as { code?: string }).code === 'ER_DUP_ENTRY') {
          throw ApiError.conflict(`${purok.name} already has a collection on ${input.scheduled_date} (${input.time_slot}).`);
        }
        throw err;
      }
      await notifyScheduleParties(
        conn,
        input.purok_id,
        input.collector_id,
        'New Collection Schedule',
        `${input.waste_type} collection for ${purok.name} on ${input.scheduled_date} (${input.time_slot}).`,
      );
      await logActivity(conn, admin.id, 'CREATE_SCHEDULE', 'Schedule', `Scheduled ${input.waste_type} collection for ${purok.name} on ${input.scheduled_date} ${input.time_slot}.`, req);
      return scheduleId;
    });
    res.status(201).json(await getScheduleForUser(id, admin));
  }),
);

async function cancelSchedule(req: Request, id: string, reason: string) {
  const admin = currentUser(req);
  await withTransaction(async (conn) => {
    const s = await queryOne<{ status: string; purok_id: string; collector_id: string; scheduled_date: string; time_slot: string; purok_name: string }>(
      `SELECT s.status, s.purok_id, s.collector_id, s.scheduled_date, s.time_slot, p.name AS purok_name
         FROM collection_schedules s JOIN puroks p ON p.id = s.purok_id WHERE s.id = ? FOR UPDATE`,
      [id],
      conn,
    );
    if (!s) throw ApiError.notFound('Schedule not found.');
    if (s.status === 'Cancelled') throw ApiError.conflict('This schedule is already cancelled.');
    if (s.status !== 'Scheduled') throw ApiError.conflict(`Only upcoming schedules can be cancelled (this one is ${s.status}).`);
    await execute("UPDATE collection_schedules SET status = 'Cancelled', notes = CONCAT(COALESCE(notes, ''), ?) WHERE id = ?", [reason ? `\n[Cancelled] ${reason}` : '', id], conn);
    await notifyScheduleParties(conn, s.purok_id, s.collector_id, 'Collection Cancelled', `The collection for ${s.purok_name} on ${s.scheduled_date} (${s.time_slot}) was cancelled.${reason ? ` Reason: ${reason}` : ''}`);
    await logActivity(conn, admin.id, 'CANCEL_SCHEDULE', 'Schedule', `Cancelled ${s.purok_name} collection on ${s.scheduled_date}.`, req);
  });
}

schedulesRouter.put(
  '/:id',
  requireRole('admin'),
  asyncHandler(async (req, res) => {
    const admin = currentUser(req);
    const id = idSchema.parse(req.params.id);
    const input = body(
      req,
      z.object({
        purok_id: idSchema.optional(),
        collector_id: idSchema.optional(),
        scheduled_date: dateSchema.optional(),
        time_slot: requiredText(60, 'Time slot').optional(),
        waste_type: z.enum(WASTE_TYPES).optional(),
        notes: z.string().trim().max(1000).optional(),
        status: z.enum(['Scheduled', 'Cancelled'], { error: 'Admins can only cancel a schedule; collectors record progress.' }).optional(),
      }),
    );

    if (input.status === 'Cancelled') {
      await cancelSchedule(req, id, '');
      return res.json(await getScheduleForUser(id, admin));
    }

    await withTransaction(async (conn) => {
      const s = await queryOne<{ status: string; purok_id: string; collector_id: string; scheduled_date: string }>(
        'SELECT status, purok_id, collector_id, scheduled_date FROM collection_schedules WHERE id = ? FOR UPDATE',
        [id],
        conn,
      );
      if (!s) throw ApiError.notFound('Schedule not found.');
      if (s.status !== 'Scheduled') throw ApiError.conflict(`Only upcoming schedules can be edited (this one is ${s.status}).`);
      if (input.scheduled_date && input.scheduled_date !== s.scheduled_date && input.scheduled_date < manilaToday()) {
        throw ApiError.badRequest('The collection date cannot be in the past.');
      }
      if (input.collector_id) await assertCollector(conn, input.collector_id);
      if (input.purok_id) {
        const p = await queryOne('SELECT id FROM puroks WHERE id = ?', [input.purok_id], conn);
        if (!p) throw ApiError.badRequest('Please choose a valid purok.');
      }
      const sets: string[] = [];
      const params: unknown[] = [];
      for (const key of ['purok_id', 'collector_id', 'scheduled_date', 'time_slot', 'waste_type', 'notes'] as const) {
        if (input[key] !== undefined) { sets.push(`${key} = ?`); params.push(input[key]); }
      }
      if (sets.length) {
        try {
          await execute(`UPDATE collection_schedules SET ${sets.join(', ')} WHERE id = ?`, [...params, id], conn);
        } catch (err) {
          if ((err as { code?: string }).code === 'ER_DUP_ENTRY') throw ApiError.conflict('That purok already has a collection at the same date and time slot.');
          throw err;
        }
        const updated = await queryOne<{ purok_id: string; collector_id: string; scheduled_date: string; time_slot: string; purok_name: string }>(
          'SELECT s.purok_id, s.collector_id, s.scheduled_date, s.time_slot, p.name AS purok_name FROM collection_schedules s JOIN puroks p ON p.id = s.purok_id WHERE s.id = ?',
          [id],
          conn,
        );
        if (updated) {
          await notifyScheduleParties(conn, updated.purok_id, updated.collector_id, 'Collection Schedule Updated', `The ${updated.purok_name} collection is now on ${updated.scheduled_date} (${updated.time_slot}).`);
          if (input.collector_id && input.collector_id !== s.collector_id) {
            await notify(conn, s.collector_id, 'Schedule Reassigned', `The ${updated.purok_name} collection on ${updated.scheduled_date} was reassigned to another collector.`, 'schedule', 'assigned-tasks');
          }
        }
        await logActivity(conn, admin.id, 'UPDATE_SCHEDULE', 'Schedule', `Updated schedule ${id} (${Object.keys(input).join(', ')}).`, req);
      }
    });
    res.json(await getScheduleForUser(id, admin));
  }),
);

/** "Delete" = cancel, so records that reference the schedule keep their history. */
schedulesRouter.delete(
  '/:id',
  requireRole('admin'),
  asyncHandler(async (req, res) => {
    const id = idSchema.parse(req.params.id);
    const reason = typeof req.query.reason === 'string' ? req.query.reason.slice(0, 300) : '';
    await cancelSchedule(req, id, reason);
    res.json({ success: true, message: 'Schedule cancelled. Affected collector, leader and residents were notified.' });
  }),
);
