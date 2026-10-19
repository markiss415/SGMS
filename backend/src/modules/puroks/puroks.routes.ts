import { Router } from 'express';
import { query } from '../../db/pool.js';
import { asyncHandler } from '../../utils/asyncHandler.js';

export const puroksRouter = Router();

/**
 * Puroks are public reference data (the registration form and landing page need them).
 * The leader's phone number is only included for signed-in users.
 */
puroksRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const rows = await query<Record<string, unknown>>(
      `SELECT p.id, p.name, p.description, p.target_collection_days, p.leader_id,
              l.full_name AS leader_name, l.contact_number AS leader_contact,
              (SELECT COUNT(*) FROM households h WHERE h.purok_id = p.id) AS households_count,
              (SELECT COUNT(*) FROM users r WHERE r.purok_id = p.id AND r.role = 'resident' AND r.status = 'active') AS residents_count
         FROM puroks p
         LEFT JOIN users l ON l.id = p.leader_id AND l.status = 'active'
        ORDER BY p.name`,
    );
    res.json(
      rows.map((r) => ({
        ...r,
        leader_name: r.leader_name ?? 'No assigned leader',
        leader_contact: req.user ? (r.leader_contact ?? '') : '',
        households_count: Number(r.households_count),
        residents_count: Number(r.residents_count),
      })),
    );
  }),
);
