/** Operational reports and CSV exports — Admin only. */
import { Router } from 'express';
import { z } from 'zod';
import { query, queryOne } from '../../db/pool.js';
import { currentUser, requireAuth, requireRole } from '../../middleware/auth.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { logActivity } from '../../utils/audit.js';
import { toCsv } from '../../utils/csv.js';
import { manilaToday } from '../../utils/dates.js';
import { dateSchema, queryParams } from '../../utils/validate.js';

export const reportsRouter = Router();
reportsRouter.use(requireAuth, requireRole('admin'));

const n = (v: unknown) => Number(v ?? 0);

reportsRouter.get(
  '/dashboard-stats',
  asyncHandler(async (_req, res) => {
    const c = await queryOne<Record<string, unknown>>(`
      SELECT
        (SELECT COUNT(*) FROM users WHERE role = 'resident' AND status = 'active') AS residents,
        (SELECT COUNT(*) FROM users WHERE role = 'resident' AND status = 'pending') AS residents_pending,
        (SELECT COUNT(*) FROM households) AS households,
        (SELECT COUNT(*) FROM users WHERE role = 'collector' AND status = 'active') AS collectors,
        (SELECT COUNT(*) FROM users WHERE role = 'leader' AND status = 'active') AS leaders,
        (SELECT COUNT(*) FROM collection_schedules WHERE status <> 'Cancelled') AS schedules,
        (SELECT COUNT(*) FROM collection_schedules WHERE status = 'Completed') AS schedules_completed,
        (SELECT COUNT(*) FROM collection_schedules WHERE status = 'In Progress') AS schedules_in_progress,
        (SELECT COUNT(*) FROM collection_schedules WHERE status = 'Scheduled') AS schedules_pending,
        (SELECT COUNT(*) FROM collection_schedules WHERE status = 'Cancelled') AS schedules_cancelled,
        (SELECT COALESCE(SUM(collected_volume_kg), 0) FROM collection_records WHERE status = 'Completed') AS total_volume_kg,
        (SELECT COUNT(*) FROM disposal_submissions) AS disposals_submitted,
        (SELECT COUNT(*) FROM disposal_submissions WHERE verification_status = 'Verified') AS disposals_verified,
        (SELECT COUNT(*) FROM disposal_submissions WHERE verification_status = 'Pending') AS disposals_pending,
        (SELECT COUNT(*) FROM disposal_submissions WHERE verification_status = 'Rejected') AS disposals_rejected,
        (SELECT COUNT(*) FROM payment_submissions) AS payments_total,
        (SELECT COUNT(*) FROM payment_submissions WHERE status = 'Verified') AS payments_verified,
        (SELECT COUNT(*) FROM payment_submissions WHERE status = 'Pending') AS payments_pending,
        (SELECT COUNT(*) FROM payment_submissions WHERE status = 'Rejected') AS payments_rejected,
        (SELECT COALESCE(SUM(amount), 0) FROM payment_submissions WHERE status = 'Verified') AS total_funds_collected,
        (SELECT COUNT(*) FROM endorsement_requests) AS endorsements_total,
        (SELECT COUNT(*) FROM endorsement_requests WHERE status = 'Approved') AS endorsements_approved,
        (SELECT COUNT(*) FROM endorsement_requests WHERE status = 'Pending') AS endorsements_pending,
        (SELECT COUNT(*) FROM endorsement_requests WHERE status = 'Rejected') AS endorsements_rejected,
        (SELECT COUNT(*) FROM collection_schedules WHERE scheduled_date = ? AND status <> 'Cancelled') AS schedules_today
    `, [manilaToday()]);
    const counts = Object.fromEntries(Object.entries(c ?? {}).map(([k, v]) => [k, n(v)]));

    const breakdown = await query<Record<string, unknown>>(`
      SELECT p.id AS purok_id, p.name AS purok_name, l.full_name AS leader_name,
        (SELECT COUNT(*) FROM households h WHERE h.purok_id = p.id) AS households,
        (SELECT COUNT(*) FROM users u WHERE u.purok_id = p.id AND u.role = 'resident' AND u.status = 'active') AS residents,
        (SELECT COUNT(*) FROM collection_schedules s WHERE s.purok_id = p.id AND s.status <> 'Cancelled') AS schedules,
        (SELECT COUNT(*) FROM collection_schedules s WHERE s.purok_id = p.id AND s.status = 'Completed') AS completed,
        (SELECT COUNT(*) FROM disposal_submissions d WHERE d.purok_id = p.id AND d.verification_status = 'Verified') AS disposals_verified,
        (SELECT COUNT(*) FROM payment_submissions pm WHERE pm.purok_id = p.id AND pm.status = 'Pending') AS payments_pending,
        (SELECT COALESCE(SUM(pm.amount), 0) FROM payment_submissions pm WHERE pm.purok_id = p.id AND pm.status = 'Verified') AS total_contributions,
        (SELECT COALESCE(SUM(r.collected_volume_kg), 0) FROM collection_records r JOIN collection_schedules s ON s.id = r.schedule_id
          WHERE s.purok_id = p.id AND r.status = 'Completed') AS volume_kg
      FROM puroks p LEFT JOIN users l ON l.id = p.leader_id
      ORDER BY p.name`);

    const purok_breakdown = breakdown.map((b) => {
      const households = n(b.households);
      const completed = n(b.completed);
      // Participation: verified household set-outs ÷ (households × completed collections).
      const expected = households * completed;
      return {
        purok_id: b.purok_id,
        purok_name: b.purok_name,
        leader_name: b.leader_name ?? null,
        households,
        residents: n(b.residents),
        schedules: n(b.schedules),
        completed,
        disposals_verified: n(b.disposals_verified),
        payments_pending: n(b.payments_pending),
        volume_kg: n(b.volume_kg),
        compliance_rate: expected > 0 ? Math.min(100, Math.round((n(b.disposals_verified) / expected) * 100)) : 0,
        total_contributions: n(b.total_contributions),
      };
    });

    // Last 8 weeks of verified contributions and collected volume (for charts).
    const weekly = await query<Record<string, unknown>>(`
      SELECT DATE_FORMAT(period_start, '%Y-%m-%d') AS week, COALESCE(SUM(amount), 0) AS amount, COUNT(*) AS payments
        FROM payment_submissions WHERE status = 'Verified' AND period_start >= DATE_SUB(?, INTERVAL 8 WEEK)
       GROUP BY period_start ORDER BY period_start`, [manilaToday()]);

    res.json({
      counts,
      total_households: counts.households,
      total_residents: counts.residents,
      completed_collections: counts.schedules_completed,
      total_waste_contributions: counts.total_funds_collected,
      purok_breakdown,
      weekly_contributions: weekly.map((w) => ({ week: w.week, amount: n(w.amount), payments: n(w.payments) })),
    });
  }),
);

const EXPORT_TYPES = ['collections', 'payments', 'households', 'endorsements', 'disposals'] as const;

reportsRouter.get(
  '/export-csv',
  asyncHandler(async (req, res) => {
    const user = currentUser(req);
    const q = queryParams(
      req,
      z.object({ type: z.enum(EXPORT_TYPES).optional().default('collections'), purok_id: z.string().max(64).optional(), from: dateSchema.optional(), to: dateSchema.optional() }),
    );
    const where: string[] = [];
    const params: unknown[] = [];
    const addFilters = (purokCol: string, dateCol?: string) => {
      if (q.purok_id) { where.push(`${purokCol} = ?`); params.push(q.purok_id); }
      if (dateCol && q.from) { where.push(`${dateCol} >= ?`); params.push(q.from); }
      if (dateCol && q.to) { where.push(`${dateCol} <= ?`); params.push(q.to); }
    };
    const w = () => (where.length ? `WHERE ${where.join(' AND ')}` : '');
    let headers: string[];
    let rows: unknown[][];

    if (q.type === 'collections') {
      addFilters('s.purok_id', 's.scheduled_date');
      const data = await query<Record<string, unknown>>(
        `SELECT s.scheduled_date, s.time_slot, p.name AS purok, c.full_name AS collector, s.waste_type, s.status,
                r.truck_number, r.started_at, r.completed_at, r.collected_volume_kg, s.notes
           FROM collection_schedules s JOIN puroks p ON p.id = s.purok_id JOIN users c ON c.id = s.collector_id
           LEFT JOIN collection_records r ON r.schedule_id = s.id ${w()} ORDER BY s.scheduled_date DESC, s.time_slot`,
        params,
      );
      headers = ['Date', 'Time Slot', 'Purok', 'Collector', 'Waste Type', 'Status', 'Truck', 'Started At', 'Completed At', 'Volume (kg)', 'Notes'];
      rows = data.map((d) => [d.scheduled_date, d.time_slot, d.purok, d.collector, d.waste_type, d.status, d.truck_number, d.started_at, d.completed_at, d.collected_volume_kg ?? 0, d.notes]);
    } else if (q.type === 'payments') {
      addFilters('pm.purok_id', 'pm.period_start');
      const data = await query<Record<string, unknown>>(
        `SELECT pm.period_start, pm.period_end, COALESCE(r.full_name, h.head_name) AS resident, h.household_number, p.name AS purok, pm.amount,
                pm.payment_method, pm.payment_code, pm.reference_number, pm.status, v.full_name AS reviewer, pm.reviewed_at, pm.rejection_reason, pm.created_at
           FROM payment_submissions pm LEFT JOIN users r ON r.id = pm.resident_id JOIN households h ON h.id = pm.household_id
           JOIN puroks p ON p.id = pm.purok_id LEFT JOIN users v ON v.id = pm.reviewed_by_leader_id ${w()}
          ORDER BY pm.period_start DESC`,
        params,
      );
      headers = ['Week Start', 'Week End', 'Resident', 'Household', 'Purok', 'Amount (PHP)', 'Method', 'Payment Code', 'Reference', 'Status', 'Reviewed By', 'Reviewed At', 'Rejection Reason', 'Submitted At'];
      rows = data.map((d) => [d.period_start, d.period_end, d.resident, d.household_number, d.purok, Number(d.amount).toFixed(2), d.payment_method, d.payment_code, d.reference_number, d.status, d.reviewer, d.reviewed_at, d.rejection_reason, d.created_at]);
    } else if (q.type === 'households') {
      addFilters('h.purok_id');
      const data = await query<Record<string, unknown>>(
        `SELECT h.household_number, h.head_name, p.name AS purok, h.contact_number, h.address_details, h.family_member_count,
                h.waste_segregation_compliant, (SELECT COUNT(*) FROM users u WHERE u.household_id = h.id AND u.status = 'active') AS accounts
           FROM households h JOIN puroks p ON p.id = h.purok_id ${w()} ORDER BY p.name, h.household_number`,
        params,
      );
      headers = ['Household No.', 'Head of Household', 'Purok', 'Contact', 'Address', 'Family Members', 'Segregation', 'Resident Accounts'];
      rows = data.map((d) => [d.household_number, d.head_name, d.purok, d.contact_number, d.address_details, d.family_member_count, d.waste_segregation_compliant ? 'Compliant' : 'Non-compliant', d.accounts]);
    } else if (q.type === 'disposals') {
      addFilters('d.purok_id', 's.scheduled_date');
      const data = await query<Record<string, unknown>>(
        `SELECT s.scheduled_date, r.full_name AS resident, h.household_number, p.name AS purok, d.waste_type, d.bag_count,
                d.verification_status, v.full_name AS verifier, d.verified_at, d.verification_remarks, d.submission_timestamp
           FROM disposal_submissions d JOIN collection_schedules s ON s.id = d.schedule_id JOIN users r ON r.id = d.resident_id
           JOIN households h ON h.id = d.household_id JOIN puroks p ON p.id = d.purok_id LEFT JOIN users v ON v.id = d.verified_by
           ${w()} ORDER BY s.scheduled_date DESC`,
        params,
      );
      headers = ['Collection Date', 'Resident', 'Household', 'Purok', 'Waste Type', 'Bags', 'Status', 'Verified By', 'Verified At', 'Remarks', 'Submitted At'];
      rows = data.map((d) => [d.scheduled_date, d.resident, d.household_number, d.purok, d.waste_type, d.bag_count, d.verification_status, d.verifier, d.verified_at, d.verification_remarks, d.submission_timestamp]);
    } else {
      addFilters('e.purok_id');
      const data = await query<Record<string, unknown>>(
        `SELECT e.certificate_code, r.full_name AS resident, p.name AS purok, e.purpose, e.status, l.full_name AS leader,
                e.remarks, e.created_at, e.issued_at
           FROM endorsement_requests e JOIN users r ON r.id = e.resident_id JOIN puroks p ON p.id = e.purok_id
           LEFT JOIN users l ON l.id = e.leader_id ${w()} ORDER BY e.created_at DESC`,
        params,
      );
      headers = ['Certificate Code', 'Resident', 'Purok', 'Purpose', 'Status', 'Purok Leader', 'Remarks', 'Requested At', 'Issued At'];
      rows = data.map((d) => [d.certificate_code ?? 'N/A', d.resident, d.purok, d.purpose, d.status, d.leader, d.remarks, d.created_at, d.issued_at]);
    }

    await logActivity(undefined, user.id, 'EXPORT_CSV', 'Reports', `Exported ${q.type} report (${rows.length} rows).`, req);
    const filename = `bangbang_${q.type}_${manilaToday()}.csv`;
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(toCsv(headers, rows));
  }),
);
