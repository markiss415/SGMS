/** Announcements: published by the Admin, readable by every signed-in user (and on the public landing page). */
import { Router } from 'express';
import { z } from 'zod';
import { execute, query, queryOne, withTransaction } from '../../db/pool.js';
import { currentUser, requireAuth, requireRole } from '../../middleware/auth.js';
import { ApiError } from '../../utils/ApiError.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { logActivity } from '../../utils/audit.js';
import { newId } from '../../utils/ids.js';
import { notifyMany } from '../../utils/notify.js';
import { body, idSchema, requiredText } from '../../utils/validate.js';

export const announcementsRouter = Router();

export const CATEGORIES = ['Schedule Update', 'Community Advisory', 'Policy Advisory', 'Collection Alert'] as const;
export const PRIORITIES = ['Normal', 'Important', 'Urgent'] as const;

export const ANNOUNCEMENT_SELECT = `
  SELECT a.id, a.title, a.content, a.category, a.priority, a.created_by, (a.is_active = 1) AS is_active,
         a.created_at, a.updated_at, u.full_name AS author_name
    FROM announcements a LEFT JOIN users u ON u.id = a.created_by`;

export const shapeAnnouncement = (r: Record<string, unknown>) => ({ ...r, is_active: Boolean(r.is_active) });

announcementsRouter.get(
  '/',
  requireAuth,
  asyncHandler(async (_req, res) => {
    const rows = await query<Record<string, unknown>>(
      `${ANNOUNCEMENT_SELECT} WHERE a.is_active = 1 ORDER BY FIELD(a.priority, 'Urgent', 'Important', 'Normal'), a.created_at DESC LIMIT 200`,
    );
    res.json(rows.map(shapeAnnouncement));
  }),
);

announcementsRouter.post(
  '/',
  requireAuth,
  requireRole('admin'),
  asyncHandler(async (req, res) => {
    const user = currentUser(req);
    const input = body(
      req,
      z.object({
        title: requiredText(200, 'Title'),
        content: requiredText(5000, 'Content'),
        category: z.enum(CATEGORIES).optional().default('Community Advisory'),
        priority: z.enum(PRIORITIES).optional().default('Normal'),
      }),
    );
    const id = await withTransaction(async (conn) => {
      const annId = newId('ann');
      await execute(
        'INSERT INTO announcements (id, title, content, category, priority, created_by) VALUES (?, ?, ?, ?, ?, ?)',
        [annId, input.title, input.content, input.category, input.priority, user.id],
        conn,
      );
      const preview = input.content.length > 140 ? `${input.content.slice(0, 140)}…` : input.content;
      await notifyMany(conn, 'u.id <> ?', [user.id], `${input.priority === 'Urgent' ? 'URGENT: ' : ''}${input.title}`, preview, 'announcement', 'announcements');
      await logActivity(conn, user.id, 'CREATE_ANNOUNCEMENT', 'Announcements', `Published "${input.title}" (${input.priority}).`, req);
      return annId;
    });
    const row = await queryOne<Record<string, unknown>>(`${ANNOUNCEMENT_SELECT} WHERE a.id = ?`, [id]);
    res.status(201).json(row && shapeAnnouncement(row));
  }),
);

/** Archives (soft-deletes) an announcement. */
announcementsRouter.delete(
  '/:id',
  requireAuth,
  requireRole('admin'),
  asyncHandler(async (req, res) => {
    const user = currentUser(req);
    const id = idSchema.parse(req.params.id);
    const a = await queryOne<{ title: string }>('SELECT title FROM announcements WHERE id = ? AND is_active = 1', [id]);
    if (!a) throw ApiError.notFound('Announcement not found.');
    await execute('UPDATE announcements SET is_active = 0 WHERE id = ?', [id]);
    await logActivity(undefined, user.id, 'ARCHIVE_ANNOUNCEMENT', 'Announcements', `Archived "${a.title}".`, req);
    res.json({ success: true });
  }),
);
