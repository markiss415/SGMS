/**
 * Collector field workflow: start → update progress → complete.
 * Only the collector assigned to a schedule can act on it.
 */
import { Router } from 'express';
import { z } from 'zod';
import { execute, queryOne, withTransaction } from '../../db/pool.js';
import { currentUser, requireAuth, requireRole } from '../../middleware/auth.js';
import { ApiError } from '../../utils/ApiError.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { logActivity } from '../../utils/audit.js';
import { manilaToday } from '../../utils/dates.js';
import { newId } from '../../utils/ids.js';
import { notifyMany } from '../../utils/notify.js';
import { body, idSchema, optionalText } from '../../utils/validate.js';
import { getScheduleForUser } from '../schedules/schedules.routes.js';

export const collectionsRouter = Router();
collectionsRouter.use(requireAuth, requireRole('collector'));

const volumeSchema = z.coerce.number({ error: 'Collected volume must be a number.' }).min(0, 'Collected volume cannot be negative.').max(100000, 'Collected volume looks too large.');

async function lockOwnSchedule(conn: Parameters<typeof queryOne>[2], scheduleId: string, collectorId: string) {
  const s = await queryOne<{ id: string; status: string; scheduled_date: string; purok_id: string; purok_name: string; collector_id: string; waste_type: string }>(
    `SELECT s.id, s.status, s.scheduled_date, s.purok_id, s.collector_id, s.waste_type, p.name AS purok_name
       FROM collection_schedules s JOIN puroks p ON p.id = s.purok_id WHERE s.id = ? FOR UPDATE`,
    [scheduleId],
    conn,
  );
  if (!s || s.collector_id !== collectorId) throw ApiError.notFound('This schedule is not assigned to you.');
  return s;
}

collectionsRouter.post(
  '/start',
  asyncHandler(async (req, res) => {
    const user = currentUser(req);
    const input = body(req, z.object({ schedule_id: idSchema, truck_number: optionalText(50), notes: optionalText(1000) }));
    const record = await withTransaction(async (conn) => {
      const s = await lockOwnSchedule(conn, input.schedule_id, user.id);
      if (s.status !== 'Scheduled') throw ApiError.conflict(`This collection cannot be started because it is already ${s.status}.`);
      if (s.scheduled_date > manilaToday()) throw ApiError.badRequest(`This collection is scheduled for ${s.scheduled_date}. You can start it on that day.`);
      const recId = newId('rec');
      await execute(
        `INSERT INTO collection_records (id, schedule_id, collector_id, started_at, status, truck_number, collector_notes)
         VALUES (?, ?, ?, UTC_TIMESTAMP(), 'In Progress', ?, ?)`,
        [recId, s.id, user.id, input.truck_number || 'LGU-BangBang-01', input.notes || `Collection started in ${s.purok_name}.`],
        conn,
      );
      await execute("UPDATE collection_schedules SET status = 'In Progress' WHERE id = ?", [s.id], conn);
      await notifyMany(
        conn,
        "u.purok_id = ? AND u.role IN ('leader', 'resident')",
        [s.purok_id],
        'Collection Truck On The Way',
        `${s.waste_type} collection has started in ${s.purok_name}. Please bring out your segregated waste.`,
        'schedule',
        'schedules',
      );
      await logActivity(conn, user.id, 'START_COLLECTION', 'Collection', `${user.full_name} started the ${s.purok_name} collection (${s.scheduled_date}).`, req);
      return recId;
    });
    const schedule = await getScheduleForUser(input.schedule_id, user);
    res.json({ schedule, record: schedule.execution_record ?? { id: record } });
  }),
);

collectionsRouter.post(
  '/update-progress',
  asyncHandler(async (req, res) => {
    const user = currentUser(req);
    const input = body(req, z.object({ schedule_id: idSchema, collected_volume_kg: volumeSchema.optional(), collector_notes: z.string().trim().max(1000).optional() }));
    await withTransaction(async (conn) => {
      const s = await lockOwnSchedule(conn, input.schedule_id, user.id);
      if (s.status !== 'In Progress') throw ApiError.conflict('Progress can only be updated while the collection is in progress.');
      const sets: string[] = [];
      const params: unknown[] = [];
      if (input.collected_volume_kg !== undefined) { sets.push('collected_volume_kg = ?'); params.push(input.collected_volume_kg); }
      if (input.collector_notes !== undefined) { sets.push('collector_notes = ?'); params.push(input.collector_notes); }
      if (sets.length) await execute(`UPDATE collection_records SET ${sets.join(', ')} WHERE schedule_id = ?`, [...params, s.id], conn);
      await logActivity(conn, user.id, 'UPDATE_COLLECTION', 'Collection', `Progress update for ${s.purok_name}: ${input.collected_volume_kg ?? '-'} kg.`, req);
    });
    const schedule = await getScheduleForUser(input.schedule_id, user);
    res.json(schedule.execution_record);
  }),
);

collectionsRouter.post(
  '/complete',
  asyncHandler(async (req, res) => {
    const user = currentUser(req);
    const input = body(req, z.object({ schedule_id: idSchema, collected_volume_kg: volumeSchema, collector_notes: z.string().trim().max(1000).optional() }));
    await withTransaction(async (conn) => {
      const s = await lockOwnSchedule(conn, input.schedule_id, user.id);
      if (s.status !== 'In Progress') throw ApiError.conflict('Start the collection before marking it as completed.');
      await execute(
        `UPDATE collection_records SET status = 'Completed', completed_at = UTC_TIMESTAMP(), collected_volume_kg = ?,
                collector_notes = COALESCE(?, collector_notes) WHERE schedule_id = ?`,
        [input.collected_volume_kg, input.collector_notes || null, s.id],
        conn,
      );
      await execute("UPDATE collection_schedules SET status = 'Completed' WHERE id = ?", [s.id], conn);
      const scanned = await queryOne<{ n: number }>("SELECT COUNT(*) AS n FROM collection_scans WHERE schedule_id = ? AND scan_type = 'Disposal'", [s.id], conn);
      const msg = `${s.purok_name} collection on ${s.scheduled_date} was completed by ${user.full_name} (${input.collected_volume_kg} kg, ${Number(scanned?.n ?? 0)} household QR scan(s)).`;
      await notifyMany(conn, "u.role = 'admin' OR (u.role = 'leader' AND u.purok_id = ?)", [s.purok_id], 'Collection Completed', msg, 'schedule', 'monitoring');
      await logActivity(conn, user.id, 'COMPLETE_COLLECTION', 'Collection', msg, req);
    });
    const schedule = await getScheduleForUser(input.schedule_id, user);
    res.json({ schedule, record: schedule.execution_record });
  }),
);
