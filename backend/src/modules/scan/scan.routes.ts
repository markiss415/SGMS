/**
 * Field QR scanning.
 *
 * Every household has a printed QR card ("BBSGMS:HH:<random token>").
 *  - Collector, during an IN-PROGRESS collection in that purok:
 *      • Disposal scan  → marks that the household's garbage was picked up (one per household per run)
 *      • Cash payment   → records the weekly fee handed to the collector (stays Pending until the Purok Leader verifies)
 *  - Purok Leader (own purok only):
 *      • Cash payment   → the leader is the verifier, so cash received in person is recorded as Verified
 * The Admin and the purok's Leader are notified of every scan; the household's residents are told too.
 */
import { Router } from 'express';
import { z } from 'zod';
import { execute, query, queryOne, withTransaction, type Db } from '../../db/pool.js';
import { currentUser, requireAuth, requireRole, type AuthUser } from '../../middleware/auth.js';
import { rateLimit } from '../../middleware/rateLimit.js';
import { ApiError } from '../../utils/ApiError.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { logActivity } from '../../utils/audit.js';
import { addDays, manilaToday, weekStart } from '../../utils/dates.js';
import { HOUSEHOLD_QR_PREFIX, newId } from '../../utils/ids.js';
import { notifyMany } from '../../utils/notify.js';
import { body, dateSchema, idSchema, optionalText, queryParams } from '../../utils/validate.js';
import { getSetting, leaderPurok } from '../shared.js';
import { insertPayment } from '../payments/payments.routes.js';

export const scanRouter = Router();
scanRouter.use(requireAuth);

const scanLimiter = rateLimit({ name: 'scan', windowMs: 60_000, max: 90 });

interface HouseholdRow {
  id: string;
  household_number: string;
  head_name: string;
  purok_id: string;
  purok_name: string;
  address_details: string;
  contact_number: string;
  family_member_count: number;
  latitude: string | null;
  longitude: string | null;
}

/** Accepts the scanned QR text, or a household number typed by hand (e.g. "HH-MAN-001") when the camera fails. */
const codeSchema = z
  .string({ error: 'Scan a household QR code or type the household number.' })
  .trim()
  .min(3, 'Scan a household QR code or type the household number.')
  .max(200);

const coords = {
  latitude: z.coerce.number().min(-90).max(90).nullable().optional(),
  longitude: z.coerce.number().min(-180).max(180).nullable().optional(),
};

async function findHousehold(code: string, db?: Db): Promise<HouseholdRow> {
  const cols = `h.id, h.household_number, h.head_name, h.purok_id, p.name AS purok_name, h.address_details, h.contact_number,
                h.family_member_count, h.latitude, h.longitude`;
  let row: HouseholdRow | null;
  if (code.startsWith(HOUSEHOLD_QR_PREFIX)) {
    const token = code.slice(HOUSEHOLD_QR_PREFIX.length);
    row = await queryOne<HouseholdRow>(`SELECT ${cols} FROM households h JOIN puroks p ON p.id = h.purok_id WHERE h.qr_token = ?`, [token], db);
    if (!row) throw ApiError.notFound('This QR code is not valid anymore. The household may have been issued a new card.');
  } else if (/^HH-[A-Z]{3}-\d{3,}$/i.test(code)) {
    row = await queryOne<HouseholdRow>(`SELECT ${cols} FROM households h JOIN puroks p ON p.id = h.purok_id WHERE h.household_number = ?`, [code.toUpperCase()], db);
    if (!row) throw ApiError.notFound(`No household with number ${code.toUpperCase()}.`);
  } else {
    throw ApiError.badRequest('That is not a Barangay Bang-Bang household QR code.');
  }
  return row;
}

/** Collector: own schedules today in the household's purok. Leader: own purok only. */
async function assertCanScan(user: AuthUser, hh: HouseholdRow, db?: Db) {
  if (user.role === 'leader') {
    if (hh.purok_id !== leaderPurok(user)) throw ApiError.forbidden(`${hh.household_number} belongs to ${hh.purok_name}, not your purok.`);
    return [];
  }
  if (user.role === 'admin') return [];
  const schedules = await query<{ id: string; status: string; time_slot: string; waste_type: string; scheduled_date: string }>(
    `SELECT id, status, time_slot, waste_type, scheduled_date FROM collection_schedules
      WHERE collector_id = ? AND purok_id = ? AND scheduled_date = ? AND status IN ('Scheduled', 'In Progress', 'Completed')
      ORDER BY FIELD(status, 'In Progress', 'Scheduled', 'Completed'), time_slot`,
    [user.id, hh.purok_id, manilaToday()],
    db,
  );
  if (!schedules.length) {
    throw ApiError.forbidden(`You have no collection in ${hh.purok_name} today, so you cannot scan ${hh.household_number}.`);
  }
  return schedules;
}

function publicHousehold(hh: HouseholdRow) {
  return {
    id: hh.id,
    household_number: hh.household_number,
    head_name: hh.head_name,
    purok_id: hh.purok_id,
    purok_name: hh.purok_name,
    address_details: hh.address_details,
    contact_number: hh.contact_number,
    family_member_count: hh.family_member_count,
    latitude: hh.latitude == null ? null : Number(hh.latitude),
    longitude: hh.longitude == null ? null : Number(hh.longitude),
  };
}

/** Step 1: identify the household and show what can be done for it. */
scanRouter.post(
  '/lookup',
  requireRole('collector', 'leader', 'admin'),
  scanLimiter,
  asyncHandler(async (req, res) => {
    const user = currentUser(req);
    const { code } = body(req, z.object({ code: codeSchema }));
    const hh = await findHousehold(code);
    const schedules = await assertCanScan(user, hh);
    const thisWeek = weekStart(manilaToday());
    const payment = await queryOne<{ status: string; payment_method: string; payment_code: string; amount: number }>(
      `SELECT status, payment_method, payment_code, amount FROM payment_submissions
        WHERE household_id = ? AND period_start = ? AND status <> 'Rejected' LIMIT 1`,
      [hh.id, thisWeek],
    );
    const unpaid = await queryOne<{ n: number }>(
      `SELECT COUNT(*) AS n FROM (SELECT 0 AS k UNION ALL SELECT 1 UNION ALL SELECT 2 UNION ALL SELECT 3) w
        WHERE NOT EXISTS (SELECT 1 FROM payment_submissions pm WHERE pm.household_id = ? AND pm.status <> 'Rejected'
                            AND pm.period_start = DATE_SUB(?, INTERVAL w.k * 7 DAY))`,
      [hh.id, thisWeek],
    );
    const scannedIds = schedules.length
      ? (await query<{ schedule_id: string; bag_count: number; created_at: string }>(
          `SELECT schedule_id, bag_count, created_at FROM collection_scans
            WHERE scan_type = 'Disposal' AND household_id = ? AND schedule_id IN (${schedules.map(() => '?').join(',')})`,
          [hh.id, ...schedules.map((s) => s.id)],
        ))
      : [];
    const residentLog = schedules.length
      ? await queryOne<{ bag_count: number; verification_status: string }>(
          `SELECT bag_count, verification_status FROM disposal_submissions
            WHERE household_id = ? AND schedule_id IN (${schedules.map(() => '?').join(',')}) AND verification_status <> 'Rejected' LIMIT 1`,
          [hh.id, ...schedules.map((s) => s.id)],
        )
      : null;
    res.json({
      household: publicHousehold(hh),
      fee: Number((await getSetting('weekly_contribution_fee')) || 5),
      week_start: thisWeek,
      week_end: addDays(thisWeek, 6),
      this_week_payment: payment ? { ...payment, amount: Number(payment.amount) } : null,
      unpaid_weeks_last_4: Number(unpaid?.n ?? 0),
      schedules: schedules.map((s) => ({
        ...s,
        already_scanned: scannedIds.some((x) => x.schedule_id === s.id),
      })),
      resident_disposal_log: residentLog,
    });
  }),
);

/** Collector confirms the household's garbage was picked up. */
scanRouter.post(
  '/disposal',
  requireRole('collector'),
  scanLimiter,
  asyncHandler(async (req, res) => {
    const user = currentUser(req);
    const input = body(
      req,
      z.object({
        code: codeSchema,
        schedule_id: idSchema,
        bag_count: z.coerce.number().int().min(1, 'Bag count must be at least 1.').max(50, 'Bag count looks too high.').optional().default(1),
        notes: optionalText(500),
        ...coords,
      }),
    );
    const result = await withTransaction(async (conn) => {
      const hh = await findHousehold(input.code, conn);
      const s = await queryOne<{ id: string; status: string; purok_id: string; collector_id: string; scheduled_date: string; waste_type: string }>(
        'SELECT id, status, purok_id, collector_id, scheduled_date, waste_type FROM collection_schedules WHERE id = ? FOR UPDATE',
        [input.schedule_id],
        conn,
      );
      if (!s || s.collector_id !== user.id) throw ApiError.notFound('This collection is not assigned to you.');
      if (s.purok_id !== hh.purok_id) throw ApiError.badRequest(`${hh.household_number} is in ${hh.purok_name}, not in this collection's purok.`);
      if (s.status !== 'In Progress') throw ApiError.conflict('Start the collection first, then scan the households.');
      const dup = await queryOne<{ id: string }>(
        "SELECT id FROM collection_scans WHERE scan_type = 'Disposal' AND schedule_id = ? AND household_id = ?",
        [s.id, hh.id],
        conn,
      );
      if (dup) throw ApiError.conflict(`${hh.household_number} (${hh.head_name}) was already scanned for this collection.`);
      const id = newId('scn');
      await execute(
        `INSERT INTO collection_scans (id, scan_type, schedule_id, household_id, purok_id, scanned_by, bag_count, latitude, longitude, notes)
         VALUES (?, 'Disposal', ?, ?, ?, ?, ?, ?, ?, ?)`,
        [id, s.id, hh.id, hh.purok_id, user.id, input.bag_count, input.latitude ?? null, input.longitude ?? null, input.notes || null],
        conn,
      );
      // Pin the household on the map the first time it is scanned, if it has no location yet.
      if (input.latitude != null && input.longitude != null && hh.latitude == null) {
        await execute('UPDATE households SET latitude = ?, longitude = ? WHERE id = ? AND latitude IS NULL', [input.latitude, input.longitude, hh.id], conn);
      }
      const msg = `${user.full_name} picked up ${input.bag_count} bag(s) of ${s.waste_type} waste from ${hh.household_number} (${hh.head_name}), ${hh.purok_name}.`;
      await notifyMany(conn, "u.role = 'admin' OR (u.role = 'leader' AND u.purok_id = ?)", [hh.purok_id], 'Household Garbage Collected', msg, 'disposal', 'map');
      await notifyMany(conn, "u.role = 'resident' AND u.household_id = ?", [hh.id], 'Your Garbage Was Collected',
        `The collector scanned your household QR: ${input.bag_count} bag(s) of ${s.waste_type} waste picked up. Salamat!`, 'disposal', 'my-disposal');
      await logActivity(conn, user.id, 'SCAN_DISPOSAL', 'Collection', msg, req);
      return { id, household: publicHousehold(hh), message: msg };
    });
    res.status(201).json(result);
  }),
);

/** Cash weekly fee handed to a collector (Pending) or to the Purok Leader (Verified). */
scanRouter.post(
  '/payment',
  requireRole('collector', 'leader'),
  scanLimiter,
  asyncHandler(async (req, res) => {
    const user = currentUser(req);
    const input = body(req, z.object({ code: codeSchema, period_start: dateSchema.optional(), notes: optionalText(500), ...coords }));
    const fee = Number(await getSetting('weekly_contribution_fee'));
    if (!Number.isFinite(fee) || fee <= 0) throw ApiError.badRequest('The weekly contribution fee is not configured.');
    const start = weekStart(input.period_start || manilaToday());
    if (start > addDays(weekStart(manilaToday()), 28)) throw ApiError.badRequest('You can only record up to 4 weeks in advance.');
    if (start < addDays(weekStart(manilaToday()), -365)) throw ApiError.badRequest('That week is too far in the past.');
    const isLeader = user.role === 'leader';

    const result = await withTransaction(async (conn) => {
      const hh = await findHousehold(input.code, conn);
      await assertCanScan(user, hh, conn);
      const existing = await queryOne<{ status: string; payment_method: string }>(
        "SELECT status, payment_method FROM payment_submissions WHERE household_id = ? AND period_start = ? AND status <> 'Rejected' FOR UPDATE",
        [hh.id, start],
        conn,
      );
      if (existing) {
        throw ApiError.conflict(`${hh.household_number} already has a ${existing.status.toLowerCase()} ${existing.payment_method} payment for the week of ${start}.`);
      }
      const resident = await queryOne<{ id: string }>(
        "SELECT id FROM users WHERE household_id = ? AND role = 'resident' AND status = 'active' ORDER BY created_at LIMIT 1",
        [hh.id],
        conn,
      );
      const { id: paymentId, code } = await insertPayment(conn, {
        resident_id: resident?.id ?? null,
        household_id: hh.id,
        purok_id: hh.purok_id,
        start,
        end: addDays(start, 6),
        amount: fee,
        method: isLeader ? 'Cash to Leader' : 'Cash to Collector',
        reference: null,
        proof_url: null,
        status: isLeader ? 'Verified' : 'Pending',
        reviewer: isLeader ? user.id : null,
        recorded_by: user.id,
        source: isLeader ? 'leader_scan' : 'collector_scan',
      });
      await execute(
        `INSERT INTO collection_scans (id, scan_type, household_id, purok_id, scanned_by, payment_id, latitude, longitude, notes)
         VALUES (?, 'Payment', ?, ?, ?, ?, ?, ?, ?)`,
        [newId('scn'), hh.id, hh.purok_id, user.id, paymentId, input.latitude ?? null, input.longitude ?? null, input.notes || null],
        conn,
      );
      const msg = `${user.full_name} received ₱${fee.toFixed(2)} cash from ${hh.household_number} (${hh.head_name}) for the week of ${start}. Payment code ${code}.`;
      await notifyMany(
        conn,
        "u.role = 'admin' OR (u.role = 'leader' AND u.purok_id = ?)",
        [hh.purok_id],
        isLeader ? 'Cash Contribution Received' : 'Cash Payment Needs Verification',
        isLeader ? msg : `${msg} Please verify it.`,
        'payment',
        isLeader ? 'payments' : 'payment-verification',
      );
      await notifyMany(conn, "u.role = 'resident' AND u.household_id = ?", [hh.id], 'Cash Payment Recorded',
        `${user.full_name} recorded your ₱${fee.toFixed(2)} cash contribution for the week of ${start} (${code}).${isLeader ? ' It is verified.' : ' Your Purok Leader will verify it.'}`,
        'payment', 'contributions');
      await logActivity(conn, user.id, 'SCAN_PAYMENT', 'Payment', msg, req);
      return { payment_id: paymentId, payment_code: code, status: isLeader ? 'Verified' : 'Pending', household: publicHousehold(hh), message: msg };
    });
    res.status(201).json(result);
  }),
);

/** Recent scans (collector: own; leader: own purok; admin: all). */
scanRouter.get(
  '/recent',
  requireRole('collector', 'leader', 'admin'),
  asyncHandler(async (req, res) => {
    const user = currentUser(req);
    const q = queryParams(req, z.object({ schedule_id: z.string().max(64).optional(), date: dateSchema.optional() }));
    const where: string[] = [];
    const params: unknown[] = [];
    if (user.role === 'collector') { where.push('c.scanned_by = ?'); params.push(user.id); }
    if (user.role === 'leader') { where.push('c.purok_id = ?'); params.push(leaderPurok(user)); }
    if (q.schedule_id) { where.push('c.schedule_id = ?'); params.push(q.schedule_id); }
    if (q.date) {
      // created_at is UTC; the date filter is a Philippine calendar day.
      where.push("DATE(CONVERT_TZ(c.created_at, '+00:00', '+08:00')) = ?");
      params.push(q.date);
    }
    const rows = await query<Record<string, unknown>>(
      `SELECT c.id, c.scan_type, c.schedule_id, c.household_id, c.purok_id, c.bag_count, c.payment_id, c.latitude, c.longitude, c.notes, c.created_at,
              h.household_number, h.head_name, p.name AS purok_name, u.full_name AS scanned_by_name, u.role AS scanned_by_role,
              pm.payment_code, pm.status AS payment_status, pm.amount
         FROM collection_scans c
         JOIN households h ON h.id = c.household_id
         JOIN puroks p ON p.id = c.purok_id
         JOIN users u ON u.id = c.scanned_by
         LEFT JOIN payment_submissions pm ON pm.id = c.payment_id
        ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
        ORDER BY c.created_at DESC LIMIT 300`,
      params,
    );
    res.json(
      rows.map((r) => ({
        ...r,
        latitude: r.latitude == null ? null : Number(r.latitude),
        longitude: r.longitude == null ? null : Number(r.longitude),
        amount: r.amount == null ? null : Number(r.amount),
      })),
    );
  }),
);
