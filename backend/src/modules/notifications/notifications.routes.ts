/** Each user can only read and mark their own notifications. */
import { Router } from 'express';
import { execute, query } from '../../db/pool.js';
import { currentUser, requireAuth } from '../../middleware/auth.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { idSchema } from '../../utils/validate.js';

export const notificationsRouter = Router();
notificationsRouter.use(requireAuth);

notificationsRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const user = currentUser(req);
    const rows = await query<Record<string, unknown>>(
      'SELECT id, user_id, title, message, type, link, (is_read = 1) AS is_read, created_at FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 200',
      [user.id],
    );
    res.json(rows.map((r) => ({ ...r, is_read: Boolean(r.is_read) })));
  }),
);

notificationsRouter.post(
  '/read-all',
  asyncHandler(async (req, res) => {
    await execute('UPDATE notifications SET is_read = 1 WHERE user_id = ? AND is_read = 0', [currentUser(req).id]);
    res.json({ success: true });
  }),
);

notificationsRouter.post(
  '/:id/read',
  asyncHandler(async (req, res) => {
    await execute('UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?', [idSchema.parse(req.params.id), currentUser(req).id]);
    res.json({ success: true });
  }),
);
