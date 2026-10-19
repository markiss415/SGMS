/**
 * Weekly contributions (default ₱5.00, configurable in Settings).
 *  - The amount is always taken from Settings on the server, never from the browser.
 *  - One live payment per household per week (DB-enforced).
 *  - Payments are NEVER auto-verified: only the resident's Purok Leader can verify or reject.
 */
import { Router } from 'express';
import { z } from 'zod';
import { execute, query, queryOne, withTransaction, type Db } from '../../db/pool.js';
import { currentUser, requireAuth, requireRole, type AuthUser } from '../../middleware/auth.js';
import { ApiError } from '../../utils/ApiError.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { logActivity } from '../../utils/audit.js';
import { addDays, manilaToday, weekStart } from '../../utils/dates.js';
import { newId, newPaymentCode } from '../../utils/ids.js';
import { notify, notifyMany } from '../../utils/notify.js';
import { body, dateSchema, idSchema, optionalText, proofSchema, queryParams } from '../../utils/validate.js';
import { getSetting, leaderPurok, residentHousehold } from '../shared.js';

export const paymentsRouter = Router();
paymentsRouter.use(requireAuth);

export const PAYMENT_METHODS = ['Cash to Leader', 'Cash to Collector', 'GCash', 'Maya', 'Barangay Hall'] as const;
/** Methods a resident can submit online. "Cash to Collector" is only recorded by a collector's QR scan. */
export const RESIDENT_METHODS = ['GCash', 'Maya', 'Cash to Leader', 'Barangay Hall'] as const;

/** GCash reference numbers are 13 digits; Maya references are 12 letters/numbers (accept 8–20 to be safe). */
export function normalizeReference(method: string, raw: string): string {
  const v = raw.replace(/[\s-]/g, '').toUpperCase();
  if (method === 'GCash') {
    if (!/^\d{13}$/.test(v)) throw ApiError.badRequest('The GCash reference number must be the 13-digit Ref. No. shown on your GCash receipt.');
  } else if (method === 'Maya') {
    if (!/^[A-Z0-9]{8,20}$/.test(v)) throw ApiError.badRequest('Please enter the reference number shown on your Maya receipt (letters and numbers only).');
  }
  return v;
}

/** Inserts a payment with a unique BB-PAY code (retries on the very unlikely code collision). */
export async function insertPayment(
  conn: Db,
  p: {
    resident_id: string | null; household_id: string; purok_id: string; start: string; end: string; amount: number;
    method: (typeof PAYMENT_METHODS)[number]; reference: string | null; proof_url: string | null;
    status?: 'Pending' | 'Verified'; reviewer?: string | null; recorded_by?: string | null; source?: 'resident' | 'collector_scan' | 'leader_scan';
  },
): Promise<{ id: string; code: string }> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const id = newId('pay');
    const code = newPaymentCode();
    try {
      await execute(
        `INSERT INTO payment_submissions (id, payment_code, resident_id, household_id, purok_id, period_start, period_end, amount, payment_method,
                                          reference_number, proof_url, status, reviewed_by_leader_id, reviewed_at, recorded_by, source)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [id, code, p.resident_id, p.household_id, p.purok_id, p.start, p.end, p.amount, p.method, p.reference ?? code, p.proof_url,
          p.status ?? 'Pending', p.reviewer ?? null, p.status === 'Verified' ? new Date() : null, p.recorded_by ?? null, p.source ?? 'resident'],
        conn,
      );
      return { id, code };
    } catch (err) {
      const e = err as { code?: string; message?: string };
      if (e.code === 'ER_DUP_ENTRY' && e.message?.includes('uq_payments_code')) continue;
      if (e.code === 'ER_DUP_ENTRY' && e.message?.includes('uq_payments_ref')) {
        throw ApiError.conflict('That reference number was already used for another payment. Please check your receipt.');
      }
      if (e.code === 'ER_DUP_ENTRY') throw ApiError.conflict(`This household already has a payment for the week of ${p.start}.`);
      throw err;
    }
  }
  throw new Error('Could not generate a unique payment code.');
}

const SELECT = `
  SELECT pm.id, pm.payment_code, pm.source, pm.recorded_by, rb.full_name AS recorded_by_name, pm.resident_id, pm.household_id, pm.purok_id, pm.period_start, pm.period_end, pm.amount,
         pm.payment_method, pm.reference_number, pm.proof_url, pm.status, pm.reviewed_by_leader_id, pm.reviewed_at,
         pm.reviewed_at AS verified_at, pm.rejection_reason, pm.created_at,
         COALESCE(r.full_name, h.head_name) AS resident_name, h.household_number, h.head_name, p.name AS purok_name, v.full_name AS reviewer_name
    FROM payment_submissions pm
    LEFT JOIN users r ON r.id = pm.resident_id
    LEFT JOIN users rb ON rb.id = pm.recorded_by
    JOIN households h ON h.id = pm.household_id
    JOIN puroks p ON p.id = pm.purok_id
    LEFT JOIN users v ON v.id = pm.reviewed_by_leader_id`;

function scope(user: AuthUser): { sql: string; params: unknown[] } {
  if (user.role === 'admin') return { sql: '1=1', params: [] };
  if (user.role === 'leader') return { sql: 'pm.purok_id = ?', params: [leaderPurok(user)] };
  if (user.role === 'resident') return { sql: 'pm.household_id = ?', params: [user.household_id ?? ''] };
  throw ApiError.forbidden();
}

const shape = (row: Record<string, unknown>) => ({ ...row, amount: Number(row.amount), proof_url: row.proof_url ?? '' });

paymentsRouter.get(
  '/',
  requireRole('admin', 'leader', 'resident'),
  asyncHandler(async (req, res) => {
    const user = currentUser(req);
    const q = queryParams(req, z.object({ status: z.enum(['Pending', 'Verified', 'Rejected']).optional(), code: z.string().trim().max(40).optional() }));
    const sc = scope(user);
    const where = [sc.sql];
    const params = [...sc.params];
    if (q.status) { where.push('pm.status = ?'); params.push(q.status); }
    if (q.code) { where.push('(pm.payment_code = ? OR pm.reference_number = ?)'); params.push(q.code.toUpperCase(), q.code.replace(/[\s-]/g, '').toUpperCase()); }
    const rows = await query<Record<string, unknown>>(
      `${SELECT} WHERE ${where.join(' AND ')}
        ORDER BY FIELD(pm.status, 'Pending', 'Verified', 'Rejected'), pm.period_start DESC, pm.created_at DESC LIMIT 1000`,
      params,
    );
    res.json(rows.map(shape));
  }),
);

/** Payment channels shown to residents: fee, e-wallet numbers and the official QR images. */
paymentsRouter.get(
  '/channels',
  asyncHandler(async (_req, res) => {
    const rows = await query<{ setting_key: string; setting_value: string }>(
      `SELECT setting_key, setting_value FROM system_settings
        WHERE setting_key IN ('weekly_contribution_fee', 'gcash_treasury_number', 'maya_number', 'gcash_qr_image', 'maya_qr_image', 'barangay_name')`,
    );
    const s = Object.fromEntries(rows.map((r) => [r.setting_key, r.setting_value]));
    res.json({
      fee: Number(s.weekly_contribution_fee || 5),
      barangay_name: s.barangay_name || 'Barangay Bang-Bang',
      gcash: { number: s.gcash_treasury_number || '', qr_image: s.gcash_qr_image || '' },
      maya: { number: s.maya_number || '', qr_image: s.maya_qr_image || '' },
    });
  }),
);

paymentsRouter.post(
  '/submit',
  requireRole('resident'),
  asyncHandler(async (req, res) => {
    const user = currentUser(req);
    const { household_id, purok_id } = residentHousehold(user);
    const input = body(
      req,
      z.object({
        period_start: dateSchema,
        payment_method: z.enum(RESIDENT_METHODS, { error: 'Please choose GCash, Maya, Cash to Leader or Barangay Hall.' }).optional().default('GCash'),
        reference_number: optionalText(100),
        proof_url: proofSchema,
      }),
    );
    const start = weekStart(input.period_start);
    const end = addDays(start, 6);
    if (start > addDays(weekStart(manilaToday()), 28)) throw ApiError.badRequest('You can only pay up to 4 weeks in advance.');
    if (start < '2020-01-01') throw ApiError.badRequest('Please choose a valid week.');
    const isWallet = input.payment_method === 'GCash' || input.payment_method === 'Maya';
    let reference: string | null = null;
    if (isWallet) {
      reference = normalizeReference(input.payment_method, input.reference_number);
      if (!input.proof_url) throw ApiError.badRequest(`Please attach the screenshot of your ${input.payment_method} receipt.`);
    }

    const fee = Number(await getSetting('weekly_contribution_fee'));
    if (!Number.isFinite(fee) || fee <= 0) throw ApiError.badRequest('The weekly contribution fee is not configured. Please contact the Barangay Admin.');

    const id = await withTransaction(async (conn) => {
      const existing = await queryOne<{ status: string }>(
        "SELECT status FROM payment_submissions WHERE household_id = ? AND period_start = ? AND status <> 'Rejected' FOR UPDATE",
        [household_id, start],
        conn,
      );
      if (existing) throw ApiError.conflict(`Your household already has a ${existing.status.toLowerCase()} payment for the week of ${start}.`);
      const { id: payId, code } = await insertPayment(conn, {
        resident_id: user.id, household_id, purok_id, start, end, amount: fee, method: input.payment_method,
        reference, proof_url: input.proof_url || null, recorded_by: user.id,
      });
      const leader = await queryOne<{ leader_id: string | null }>('SELECT leader_id FROM puroks WHERE id = ?', [purok_id], conn);
      const refText = reference ? ` (Ref: ${reference})` : '';
      await notify(conn, leader?.leader_id, 'Payment Needs Verification', `${user.full_name} submitted ₱${fee.toFixed(2)} for the week of ${start} via ${input.payment_method}${refText}. Payment code ${code}.`, 'payment', 'payment-verification');
      await logActivity(conn, user.id, 'SUBMIT_PAYMENT', 'Payment', `Submitted ₱${fee.toFixed(2)} for week ${start} (${input.payment_method}, ${code}${refText}).`, req);
      return payId;
    });
    const row = await queryOne<Record<string, unknown>>(`${SELECT} WHERE pm.id = ?`, [id]);
    res.status(201).json(row && shape(row));
  }),
);

paymentsRouter.post(
  '/verify',
  requireRole('leader'),
  asyncHandler(async (req, res) => {
    const user = currentUser(req);
    const purokId = leaderPurok(user);
    const input = body(
      req,
      z.object({
        payment_id: idSchema,
        status: z.enum(['Verified', 'Rejected'], { error: 'Decision must be Verified or Rejected.' }),
        rejection_reason: optionalText(1000),
      }),
    );
    if (input.status === 'Rejected' && !input.rejection_reason) throw ApiError.badRequest('Please give a reason when rejecting a payment.');

    await withTransaction(async (conn) => {
      const p = await queryOne<{ id: string; purok_id: string; status: string; resident_id: string; reference_number: string; period_start: string; amount: number }>(
        'SELECT id, purok_id, status, resident_id, reference_number, period_start, amount FROM payment_submissions WHERE id = ? FOR UPDATE',
        [input.payment_id],
        conn,
      );
      if (!p || p.purok_id !== purokId) throw ApiError.notFound('Payment not found in your purok.');
      if (p.status !== 'Pending') throw ApiError.conflict(`This payment was already ${p.status.toLowerCase()}.`);
      await execute(
        'UPDATE payment_submissions SET status = ?, reviewed_by_leader_id = ?, reviewed_at = UTC_TIMESTAMP(), rejection_reason = ? WHERE id = ?',
        [input.status, user.id, input.status === 'Rejected' ? input.rejection_reason : null, p.id],
        conn,
      );
      if (input.status === 'Verified') {
        await notifyMany(conn, "u.role = 'admin'", [], 'Contribution Verified', `${user.full_name} verified payment ${p.reference_number} (₱${Number(p.amount).toFixed(2)}, week of ${p.period_start}).`, 'payment', 'payments');
      }
      await notify(
        conn,
        p.resident_id,
        `Contribution ${input.status}`,
        `Your ₱${Number(p.amount).toFixed(2)} payment for the week of ${p.period_start} (Ref: ${p.reference_number}) was ${input.status.toLowerCase()} by ${user.full_name}.${input.rejection_reason ? ` Reason: ${input.rejection_reason}` : ''}`,
        'payment',
        'contributions',
      );
      await logActivity(conn, user.id, 'VERIFY_PAYMENT', 'Payment', `${input.status} payment ${p.reference_number} (week ${p.period_start}).`, req);
    });
    const row = await queryOne<Record<string, unknown>>(`${SELECT} WHERE pm.id = ?`, [input.payment_id]);
    res.json(row && shape(row));
  }),
);
