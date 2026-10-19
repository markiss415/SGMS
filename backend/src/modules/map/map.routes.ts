/**
 * Map tracking & monitoring.
 *  - POST /map/ping       Collector's phone sends its GPS position while a collection is In Progress.
 *  - GET  /map/overview   Role-scoped data for the map:
 *        admin     → every purok, household, today's routes, live trucks and scans
 *        leader    → own purok only (+ trucks working there)
 *        collector → puroks of own routes for the day (+ own trail)
 *        resident  → own household + the live truck in their purok ("Where is the truck?")
 */
import { Router } from 'express';
import { z } from 'zod';
import { execute, query, queryOne } from '../../db/pool.js';
import { currentUser, requireAuth, requireRole } from '../../middleware/auth.js';
import { ApiError } from '../../utils/ApiError.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { manilaToday, weekStart } from '../../utils/dates.js';
import { body, dateSchema, idSchema, queryParams } from '../../utils/validate.js';
import { getSetting, leaderPurok } from '../shared.js';

export const mapRouter = Router();
mapRouter.use(requireAuth);

const num = (v: unknown) => (v == null ? null : Number(v));

mapRouter.post(
  '/ping',
  requireRole('collector'),
  asyncHandler(async (req, res) => {
    const user = currentUser(req);
    const input = body(
      req,
      z.object({
        schedule_id: idSchema,
        latitude: z.coerce.number().min(-90).max(90),
        longitude: z.coerce.number().min(-180).max(180),
        accuracy: z.coerce.number().min(0).max(100000).nullable().optional(),
      }),
    );
    const s = await queryOne<{ collector_id: string; status: string }>('SELECT collector_id, status FROM collection_schedules WHERE id = ?', [input.schedule_id]);
    if (!s || s.collector_id !== user.id) throw ApiError.notFound('This collection is not assigned to you.');
    if (s.status !== 'In Progress') return res.json({ stored: false, reason: 'Collection is not in progress.' });
    // Ignore pings closer than 10 seconds apart (keeps the trail light).
    const last = await queryOne<{ secs: number }>(
      'SELECT TIMESTAMPDIFF(SECOND, MAX(recorded_at), UTC_TIMESTAMP(3)) AS secs FROM collector_locations WHERE schedule_id = ? AND collector_id = ?',
      [input.schedule_id, user.id],
    );
    if (last?.secs != null && Number(last.secs) < 10) return res.json({ stored: false, reason: 'Too soon.' });
    await execute(
      'INSERT INTO collector_locations (collector_id, schedule_id, latitude, longitude, accuracy_m) VALUES (?, ?, ?, ?, ?)',
      [user.id, input.schedule_id, input.latitude, input.longitude, input.accuracy ?? null],
    );
    res.json({ stored: true });
  }),
);

mapRouter.get(
  '/overview',
  asyncHandler(async (req, res) => {
    const user = currentUser(req);
    const q = queryParams(req, z.object({ date: dateSchema.optional() }));
    const date = q.date || manilaToday();
    const thisWeek = weekStart(manilaToday());

    // Which puroks this user may see.
    let purokIds: string[] | null = null; // null = all
    if (user.role === 'leader') purokIds = [leaderPurok(user)];
    if (user.role === 'resident') purokIds = user.purok_id ? [user.purok_id] : [];
    if (user.role === 'collector') {
      const rows = await query<{ purok_id: string }>(
        "SELECT DISTINCT purok_id FROM collection_schedules WHERE collector_id = ? AND scheduled_date = ? AND status <> 'Cancelled'",
        [user.id, date],
      );
      purokIds = rows.map((r) => r.purok_id);
    }
    const inPuroks = (col: string) =>
      purokIds === null ? { sql: '1=1', params: [] as unknown[] } : purokIds.length ? { sql: `${col} IN (${purokIds.map(() => '?').join(',')})`, params: purokIds as unknown[] } : { sql: '1=0', params: [] };

    const pk = inPuroks('p.id');
    const puroks = await query<Record<string, unknown>>(
      `SELECT p.id, p.name, p.latitude, p.longitude, l.full_name AS leader_name,
              (SELECT COUNT(*) FROM households h WHERE h.purok_id = p.id) AS households
         FROM puroks p LEFT JOIN users l ON l.id = p.leader_id WHERE ${pk.sql} ORDER BY p.name`,
      pk.params,
    );

    // Households: a resident only sees their own house.
    const hk = user.role === 'resident' ? { sql: 'h.id = ?', params: [user.household_id ?? ''] as unknown[] } : inPuroks('h.purok_id');
    const households = await query<Record<string, unknown>>(
      `SELECT h.id, h.household_number, h.head_name, h.purok_id, p.name AS purok_name, h.address_details, h.latitude, h.longitude,
              (SELECT pm.status FROM payment_submissions pm WHERE pm.household_id = h.id AND pm.period_start = ? AND pm.status <> 'Rejected' LIMIT 1) AS payment_status,
              (SELECT COUNT(*) FROM collection_scans c JOIN collection_schedules s ON s.id = c.schedule_id
                WHERE c.household_id = h.id AND c.scan_type = 'Disposal' AND s.scheduled_date = ?) AS scanned_today,
              (SELECT COUNT(*) FROM disposal_submissions d JOIN collection_schedules s ON s.id = d.schedule_id
                WHERE d.household_id = h.id AND d.verification_status <> 'Rejected' AND s.scheduled_date = ?) AS logged_today
         FROM households h JOIN puroks p ON p.id = h.purok_id
        WHERE ${hk.sql} ORDER BY h.household_number`,
      [thisWeek, date, date, ...hk.params],
    );

    // Routes (schedules) for the day.
    const sk = inPuroks('s.purok_id');
    const routeWhere = [sk.sql, 's.scheduled_date = ?', "s.status <> 'Cancelled'"];
    const routeParams: unknown[] = [...sk.params, date];
    if (user.role === 'collector') { routeWhere.push('s.collector_id = ?'); routeParams.push(user.id); }
    const routes = await query<Record<string, unknown>>(
      `SELECT s.id, s.purok_id, p.name AS purok_name, s.collector_id, u.full_name AS collector_name, s.time_slot, s.waste_type, s.status,
              r.truck_number, r.collected_volume_kg, r.started_at, r.completed_at,
              (SELECT COUNT(*) FROM collection_scans c WHERE c.schedule_id = s.id AND c.scan_type = 'Disposal') AS scans
         FROM collection_schedules s JOIN puroks p ON p.id = s.purok_id JOIN users u ON u.id = s.collector_id
         LEFT JOIN collection_records r ON r.schedule_id = s.id
        WHERE ${routeWhere.join(' AND ')} ORDER BY s.time_slot`,
      routeParams,
    );

    // GPS trails for those routes (residents only get the latest point of an in-progress truck).
    const routeIds = routes.map((r) => String(r.id));
    let trails: Record<string, { latitude: number; longitude: number; recorded_at: string }[]> = {};
    if (routeIds.length) {
      const pts = await query<{ schedule_id: string; latitude: string; longitude: string; recorded_at: string }>(
        `SELECT schedule_id, latitude, longitude, recorded_at FROM collector_locations
          WHERE schedule_id IN (${routeIds.map(() => '?').join(',')}) ORDER BY recorded_at`,
        routeIds,
      );
      trails = {};
      for (const p of pts) {
        (trails[p.schedule_id] ||= []).push({ latitude: Number(p.latitude), longitude: Number(p.longitude), recorded_at: p.recorded_at });
      }
    }
    const routesOut = routes
      .filter((r) => user.role !== 'resident' || r.status === 'In Progress')
      .map((r) => {
        const trail = trails[String(r.id)] || [];
        return {
          ...r,
          collected_volume_kg: num(r.collected_volume_kg),
          scans: Number(r.scans),
          last_position: trail.length ? trail[trail.length - 1] : null,
          trail: user.role === 'resident' ? [] : trail,
        };
      });

    // Scan markers for the day (not for residents).
    let scans: Record<string, unknown>[] = [];
    if (user.role !== 'resident') {
      const ck = inPuroks('c.purok_id');
      const scanWhere = [ck.sql, "DATE(CONVERT_TZ(c.created_at, '+00:00', '+08:00')) = ?"];
      const scanParams: unknown[] = [...ck.params, date];
      if (user.role === 'collector') { scanWhere.push('c.scanned_by = ?'); scanParams.push(user.id); }
      scans = (
        await query<Record<string, unknown>>(
          `SELECT c.id, c.scan_type, c.household_id, h.household_number, h.head_name, c.bag_count, c.latitude, c.longitude, c.created_at,
                  u.full_name AS scanned_by_name, pm.payment_code
             FROM collection_scans c JOIN households h ON h.id = c.household_id JOIN users u ON u.id = c.scanned_by
             LEFT JOIN payment_submissions pm ON pm.id = c.payment_id
            WHERE ${scanWhere.join(' AND ')} ORDER BY c.created_at`,
          scanParams,
        )
      ).map((s) => ({ ...s, latitude: num(s.latitude), longitude: num(s.longitude) }));
    }

    res.json({
      date,
      center: {
        latitude: Number((await getSetting('map_center_lat')) || 10.2588),
        longitude: Number((await getSetting('map_center_lng')) || 123.9445),
      },
      puroks: puroks.map((p) => ({ ...p, latitude: num(p.latitude), longitude: num(p.longitude), households: Number(p.households) })),
      households: households.map((h) => ({
        ...h,
        latitude: num(h.latitude),
        longitude: num(h.longitude),
        payment_status: h.payment_status ?? null,
        scanned_today: Number(h.scanned_today) > 0,
        logged_today: Number(h.logged_today) > 0,
      })),
      routes: routesOut,
      scans,
    });
  }),
);
