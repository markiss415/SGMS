/** Self-service profile: any signed-in user can update their own contact details and password. */
import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { env } from '../../config/env.js';
import { execute, queryOne, withTransaction } from '../../db/pool.js';
import { currentUser, requireAuth, revokeUserSessions } from '../../middleware/auth.js';
import { ApiError } from '../../utils/ApiError.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { logActivity } from '../../utils/audit.js';
import { body, emailSchema, passwordSchema, phoneSchema, requiredText } from '../../utils/validate.js';
import { getSafeUser } from '../shared.js';

export const profileRouter = Router();
profileRouter.use(requireAuth);

profileRouter.put(
  '/',
  asyncHandler(async (req, res) => {
    const user = currentUser(req);
    const input = body(
      req,
      z.object({
        full_name: requiredText(150, 'Full name').optional(),
        email: emailSchema.optional(),
        contact_number: phoneSchema,
      }),
    );
    if (input.email) {
      const dup = await queryOne('SELECT id FROM users WHERE LOWER(email) = ? AND id <> ?', [input.email, user.id]);
      if (dup) throw ApiError.conflict('That email is already registered to another account.');
    }
    const sets: string[] = [];
    const params: unknown[] = [];
    if (input.full_name) { sets.push('full_name = ?'); params.push(input.full_name); }
    if (input.email) { sets.push('email = ?'); params.push(input.email); }
    if (req.body?.contact_number !== undefined) { sets.push('contact_number = ?'); params.push(input.contact_number); }
    if (sets.length) {
      await execute(`UPDATE users SET ${sets.join(', ')} WHERE id = ?`, [...params, user.id]);
      await logActivity(undefined, user.id, 'UPDATE_PROFILE', 'Profile', 'Updated own profile details.', req);
    }
    res.json(await getSafeUser(user.id));
  }),
);

profileRouter.post(
  '/password',
  asyncHandler(async (req, res) => {
    const user = currentUser(req);
    const input = body(
      req,
      z.object({
        current_password: z.string({ error: 'Current password is required.' }).min(1, 'Current password is required.').max(128),
        new_password: passwordSchema,
      }),
    );
    const row = await queryOne<{ password_hash: string }>('SELECT password_hash FROM users WHERE id = ?', [user.id]);
    if (!row || !(await bcrypt.compare(input.current_password, row.password_hash))) {
      throw ApiError.badRequest('Your current password is incorrect.');
    }
    if (input.current_password === input.new_password) throw ApiError.badRequest('Choose a new password that is different from the current one.');
    const hash = await bcrypt.hash(input.new_password, env.bcryptRounds);
    await withTransaction(async (conn) => {
      await execute('UPDATE users SET password_hash = ? WHERE id = ?', [hash, user.id], conn);
      await revokeUserSessions(conn, user.id, user.session_id);
      await logActivity(conn, user.id, 'CHANGE_PASSWORD', 'Profile', 'Changed own password.', req);
    });
    res.json({ success: true, message: 'Password updated. Other devices have been signed out.' });
  }),
);
