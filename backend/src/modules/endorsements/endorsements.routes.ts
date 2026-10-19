/**
 * Endorsement requests. The Purok Leader of the resident's purok is the FINAL approver —
 * there is no Barangay Admin approval stage. Admin can only view.
 */
import { Router } from 'express';
import { z } from 'zod';
import { execute, query, queryOne, withTransaction } from '../../db/pool.js';
import { currentUser, requireAuth, requireRole, type AuthUser } from '../../middleware/auth.js';
import { ApiError } from '../../utils/ApiError.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { logActivity } from '../../utils/audit.js';
import { newId } from '../../utils/ids.js';
import { notify } from '../../utils/notify.js';
import { body, idSchema, optionalText, queryParams, requiredText } from '../../utils/validate.js';
import { leaderPurok, residentHousehold } from '../shared.js';

export const endorsementsRouter = Router();
endorsementsRouter.use(requireAuth);

const SELECT = `
  SELECT e.id, e.resident_id, e.purok_id, e.leader_id, e.purpose, e.details, e.status, e.remarks,
         e.certificate_code, e.certificate_code AS certificate_number, e.issued_at,
         IF(e.status = 'Approved', e.issued_at, NULL) AS approved_at, e.created_at, e.updated_at,
         r.full_name AS resident_name, r.contact_number AS resident_contact,
         h.household_number, h.address_details AS household_address,
         p.name AS purok_name, COALESCE(l.full_name, pl.full_name) AS leader_name
    FROM endorsement_requests e
    JOIN users r ON r.id = e.resident_id
    LEFT JOIN households h ON h.id = r.household_id
    JOIN puroks p ON p.id = e.purok_id
    LEFT JOIN users l ON l.id = e.leader_id
    LEFT JOIN users pl ON pl.id = p.leader_id`;

function scope(user: AuthUser): { sql: string; params: unknown[] } {
  if (user.role === 'admin') return { sql: '1=1', params: [] };
  if (user.role === 'leader') return { sql: 'e.purok_id = ?', params: [leaderPurok(user)] };
  if (user.role === 'resident') return { sql: 'e.resident_id = ?', params: [user.id] };
  throw ApiError.forbidden();
}

const shape = (row: Record<string, unknown>) => ({ ...row, details: row.details ?? '', leader_name: row.leader_name ?? 'Purok Leader' });

endorsementsRouter.get(
  '/',
  requireRole('admin', 'leader', 'resident'),
  asyncHandler(async (req, res) => {
    const user = currentUser(req);
    const q = queryParams(req, z.object({ status: z.enum(['Pending', 'Approved', 'Rejected']).optional() }));
    const sc = scope(user);
    const where = [sc.sql];
    const params = [...sc.params];
    if (q.status) { where.push('e.status = ?'); params.push(q.status); }
    const rows = await query<Record<string, unknown>>(
      `${SELECT} WHERE ${where.join(' AND ')} ORDER BY FIELD(e.status, 'Pending', 'Approved', 'Rejected'), e.created_at DESC LIMIT 1000`,
      params,
    );
    res.json(rows.map(shape));
  }),
);

/** Public-safe verification of an issued certificate code (shows no personal contact details). */
export async function verifyCertificate(code: string) {
  return queryOne<Record<string, unknown>>(
    `SELECT e.certificate_code, e.purpose, e.issued_at, r.full_name AS resident_name, p.name AS purok_name, l.full_name AS leader_name
       FROM endorsement_requests e JOIN users r ON r.id = e.resident_id JOIN puroks p ON p.id = e.purok_id
       LEFT JOIN users l ON l.id = e.leader_id
      WHERE e.certificate_code = ? AND e.status = 'Approved'`,
    [code],
  );
}

endorsementsRouter.post(
  '/request',
  requireRole('resident'),
  asyncHandler(async (req, res) => {
    const user = currentUser(req);
    const { purok_id } = residentHousehold(user);
    const input = body(req, z.object({ purpose: requiredText(150, 'Purpose'), details: optionalText(2000) }));

    const id = await withTransaction(async (conn) => {
      const pending = await queryOne<{ n: number }>(
        "SELECT COUNT(*) AS n FROM endorsement_requests WHERE resident_id = ? AND status = 'Pending' AND purpose = ?",
        [user.id, input.purpose],
        conn,
      );
      if (Number(pending?.n) > 0) throw ApiError.conflict('You already have a pending request for this purpose. Please wait for your Purok Leader.');
      const purok = await queryOne<{ leader_id: string | null; name: string }>('SELECT leader_id, name FROM puroks WHERE id = ?', [purok_id], conn);
      const endId = newId('end');
      await execute(
        'INSERT INTO endorsement_requests (id, resident_id, purok_id, leader_id, purpose, details) VALUES (?, ?, ?, ?, ?, ?)',
        [endId, user.id, purok_id, purok?.leader_id ?? null, input.purpose, input.details],
        conn,
      );
      await notify(conn, purok?.leader_id, 'New Endorsement Request', `${user.full_name} requested an endorsement: ${input.purpose}.`, 'endorsement', 'endorsement-processing');
      await logActivity(conn, user.id, 'REQUEST_ENDORSEMENT', 'Endorsement', `Requested endorsement: ${input.purpose}.`, req);
      return endId;
    });
    const row = await queryOne<Record<string, unknown>>(`${SELECT} WHERE e.id = ?`, [id]);
    res.status(201).json(row && shape(row));
  }),
);

endorsementsRouter.post(
  '/review',
  requireRole('leader'),
  asyncHandler(async (req, res) => {
    const user = currentUser(req);
    const purokId = leaderPurok(user);
    const input = body(
      req,
      z.object({
        endorsement_id: idSchema,
        status: z.enum(['Approved', 'Rejected'], { error: 'Decision must be Approved or Rejected.' }),
        remarks: optionalText(1000),
      }),
    );
    if (input.status === 'Rejected' && !input.remarks) throw ApiError.badRequest('Please give a reason when rejecting an endorsement.');

    await withTransaction(async (conn) => {
      const e = await queryOne<{ id: string; purok_id: string; status: string; resident_id: string; purpose: string }>(
        'SELECT id, purok_id, status, resident_id, purpose FROM endorsement_requests WHERE id = ? FOR UPDATE',
        [input.endorsement_id],
        conn,
      );
      if (!e || e.purok_id !== purokId) throw ApiError.notFound('Endorsement request not found in your purok.');
      if (e.status !== 'Pending') throw ApiError.conflict(`This request was already ${e.status.toLowerCase()}. Leader decisions are final.`);

      let code: string | null = null;
      if (input.status === 'Approved') {
        const year = new Date().getUTCFullYear();
        const prefix = `BB-END-${year}-`;
        const last = await queryOne<{ max_no: number | null }>(
          'SELECT MAX(CAST(SUBSTRING(certificate_code, ?) AS UNSIGNED)) AS max_no FROM endorsement_requests WHERE certificate_code LIKE ? FOR UPDATE',
          [prefix.length + 1, `${prefix}%`],
          conn,
        );
        code = `${prefix}${String((last?.max_no ?? 0) + 1).padStart(5, '0')}`;
      }
      await execute(
        `UPDATE endorsement_requests SET status = ?, remarks = ?, leader_id = ?, certificate_code = ?,
                issued_at = IF(? = 'Approved', UTC_TIMESTAMP(), NULL) WHERE id = ?`,
        [input.status, input.remarks || null, user.id, code, input.status, e.id],
        conn,
      );
      await notify(
        conn,
        e.resident_id,
        `Endorsement ${input.status}`,
        `Your request for "${e.purpose}" was ${input.status.toLowerCase()} by Purok Leader ${user.full_name}.${code ? ` Certificate code: ${code}.` : ''}${input.remarks ? ` Remarks: ${input.remarks}` : ''}`,
        'endorsement',
        'endorsements',
      );
      await logActivity(conn, user.id, 'REVIEW_ENDORSEMENT', 'Endorsement', `${input.status} endorsement "${e.purpose}"${code ? ` (${code})` : ''}.`, req);
    });
    const row = await queryOne<Record<string, unknown>>(`${SELECT} WHERE e.id = ?`, [input.endorsement_id]);
    res.json(row && shape(row));
  }),
);
