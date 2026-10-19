/** Audit trail — Admin only. */
import { Router } from 'express';
import { z } from 'zod';
import { query } from '../../db/pool.js';
import { requireAuth, requireRole } from '../../middleware/auth.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { queryParams } from '../../utils/validate.js';

export const activityRouter = Router();
activityRouter.use(requireAuth, requireRole('admin'));

activityRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const q = queryParams(
      req,
      z.object({
        module: z.string().max(50).optional(),
        search: z.string().trim().max(100).optional(),
        limit: z.coerce.number().int().min(1).max(2000).optional().default(500),
      }),
    );
    const where: string[] = [];
    const params: unknown[] = [];
    if (q.module) { where.push('a.module = ?'); params.push(q.module); }
    if (q.search) {
      const like = `%${q.search.replace(/[%_\\]/g, '\\$&')}%`;
      where.push('(a.action LIKE ? OR a.details LIKE ? OR u.full_name LIKE ?)');
      params.push(like, like, like);
    }
    const rows = await query(
      `SELECT a.id, a.user_id, a.action, a.module, a.details, a.ip_address, a.created_at,
              u.full_name AS user_name, u.role AS user_role
         FROM activity_logs a LEFT JOIN users u ON u.id = a.user_id
         ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
        ORDER BY a.created_at DESC LIMIT ?`,
      [...params, q.limit],
    );
    res.json(rows);
  }),
);
