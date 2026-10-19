/**
 * User accounts.
 *  - Admin: full management of all four roles.
 *  - Purok Leader: read-only list of their own purok + approve/reject pending resident registrations.
 */
import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { env } from '../../config/env.js';
import { execute, query, queryOne, withTransaction, type Db } from '../../db/pool.js';
import { currentUser, requireAuth, requireRole, revokeUserSessions } from '../../middleware/auth.js';
import { ApiError } from '../../utils/ApiError.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { logActivity } from '../../utils/audit.js';
import { newId, randomToken } from '../../utils/ids.js';
import { notify } from '../../utils/notify.js';
import {
  body, parse, emailSchema, idSchema, optionalText, passwordSchema, phoneSchema, queryParams, requiredText, usernameSchema,
} from '../../utils/validate.js';
import { getSafeUser, leaderPurok, nextHouseholdNumber, USER_COLUMNS, USER_JOINS } from '../shared.js';

export const usersRouter = Router();
usersRouter.use(requireAuth);

const roleSchema = z.enum(['admin', 'collector', 'leader', 'resident'], { error: 'Please choose a valid role.' });
const statusSchema = z.enum(['active', 'inactive', 'pending']);

usersRouter.get(
  '/',
  requireRole('admin', 'leader'),
  asyncHandler(async (req, res) => {
    const user = currentUser(req);
    const q = queryParams(
      req,
      z.object({
        role: roleSchema.optional(),
        purok_id: z.string().max(64).optional(),
        status: statusSchema.optional(),
        search: z.string().trim().max(100).optional(),
      }),
    );
    const where: string[] = [];
    const params: unknown[] = [];
    if (user.role === 'leader') {
      where.push('u.purok_id = ?');
      params.push(leaderPurok(user));
    } else if (q.purok_id) {
      where.push('u.purok_id = ?');
      params.push(q.purok_id);
    }
    if (q.role) { where.push('u.role = ?'); params.push(q.role); }
    if (q.status) { where.push('u.status = ?'); params.push(q.status); }
    if (q.search) {
      const like = `%${q.search.replace(/[%_\\]/g, '\\$&')}%`;
      where.push('(u.full_name LIKE ? OR u.username LIKE ? OR u.email LIKE ?)');
      params.push(like, like, like);
    }
    const rows = await query(
      `SELECT ${USER_COLUMNS} FROM users u ${USER_JOINS} ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
        ORDER BY FIELD(u.status, 'pending', 'active', 'inactive'), FIELD(u.role, 'admin', 'leader', 'collector', 'resident'), u.full_name`,
      params,
    );
    res.json(rows);
  }),
);

/** Makes `userId` the leader of `purokId`. Refuses if another active leader already holds it. */
async function assignLeader(db: Db, userId: string, purokId: string) {
  const purok = await queryOne<{ id: string; name: string; leader_id: string | null; leader_status: string | null; leader_name: string | null }>(
    `SELECT p.id, p.name, p.leader_id, l.status AS leader_status, l.full_name AS leader_name
       FROM puroks p LEFT JOIN users l ON l.id = p.leader_id WHERE p.id = ? FOR UPDATE`,
    [purokId],
    db,
  );
  if (!purok) throw ApiError.badRequest('Please select a valid purok.');
  if (purok.leader_id && purok.leader_id !== userId && purok.leader_status === 'active') {
    throw ApiError.conflict(`${purok.name} already has an active Purok Leader (${purok.leader_name}). Deactivate or reassign that leader first.`);
  }
  await execute('UPDATE puroks SET leader_id = NULL WHERE leader_id = ? AND id <> ?', [userId, purokId], db);
  await execute('UPDATE puroks SET leader_id = ? WHERE id = ?', [userId, purokId], db);
}

usersRouter.post(
  '/',
  requireRole('admin'),
  asyncHandler(async (req, res) => {
    const admin = currentUser(req);
    const input = body(
      req,
      z.object({
        full_name: requiredText(150, 'Full name'),
        username: usernameSchema,
        email: emailSchema,
        password: passwordSchema,
        role: roleSchema,
        purok_id: z.string().max(64).optional().nullable(),
        household_id: z.string().max(64).optional().nullable(),
        contact_number: phoneSchema,
        address_details: optionalText(255),
      }),
    );
    if ((input.role === 'leader' || input.role === 'resident') && !input.purok_id) {
      throw ApiError.badRequest('Purok Leaders and Residents must be assigned to a purok.');
    }

    const id = await withTransaction(async (conn) => {
      const taken = await queryOne<{ username: string }>(
        'SELECT username FROM users WHERE LOWER(username) = ? OR LOWER(email) = ? LIMIT 1',
        [input.username, input.email],
        conn,
      );
      if (taken) throw ApiError.conflict(taken.username.toLowerCase() === input.username ? 'That username is already taken.' : 'That email is already registered.');

      const purokId = input.role === 'leader' || input.role === 'resident' ? input.purok_id! : null;
      let householdId: string | null = null;
      if (input.role === 'resident') {
        const purok = await queryOne<{ id: string; name: string }>('SELECT id, name FROM puroks WHERE id = ? FOR UPDATE', [purokId], conn);
        if (!purok) throw ApiError.badRequest('Please select a valid purok.');
        if (input.household_id) {
          const hh = await queryOne<{ purok_id: string }>('SELECT purok_id FROM households WHERE id = ?', [input.household_id], conn);
          if (!hh || hh.purok_id !== purokId) throw ApiError.badRequest('The selected household is not in that purok.');
          householdId = input.household_id;
        } else {
          householdId = newId('hh');
          const number = await nextHouseholdNumber(conn, purok.id, purok.name);
          await execute(
            'INSERT INTO households (id, household_number, purok_id, head_name, contact_number, address_details, qr_token) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [householdId, number, purok.id, input.full_name, input.contact_number, input.address_details || `${purok.name}, Bang-Bang, Cordova`, randomToken(18)],
            conn,
          );
        }
      }
      const userId = newId('usr');
      const hash = await bcrypt.hash(input.password, env.bcryptRounds);
      await execute(
        `INSERT INTO users (id, username, email, password_hash, full_name, role, purok_id, household_id, contact_number, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'active')`,
        [userId, input.username, input.email, hash, input.full_name, input.role, purokId, householdId, input.contact_number],
        conn,
      );
      if (input.role === 'leader') await assignLeader(conn, userId, purokId!);
      await logActivity(conn, admin.id, 'CREATE_USER', 'Users', `Created ${input.role} account ${input.full_name} (${input.username}).`, req);
      return userId;
    });
    res.status(201).json(await getSafeUser(id));
  }),
);

usersRouter.put(
  '/:id',
  requireRole('admin'),
  asyncHandler(async (req, res) => {
    const admin = currentUser(req);
    const id = idSchema.parse(req.params.id);
    const input = body(
      req,
      z.object({
        full_name: requiredText(150, 'Full name').optional(),
        email: emailSchema.optional(),
        role: roleSchema.optional(),
        purok_id: z.string().max(64).optional().nullable(),
        contact_number: z.string().optional(),
        status: statusSchema.optional(),
        new_password: z.union([z.literal(''), passwordSchema]).optional(),
      }),
    );
    if (input.contact_number !== undefined) parse(phoneSchema, input.contact_number);

    await withTransaction(async (conn) => {
      const target = await queryOne<{ id: string; role: string; purok_id: string | null; household_id: string | null; status: string; full_name: string }>(
        'SELECT id, role, purok_id, household_id, status, full_name FROM users WHERE id = ? FOR UPDATE',
        [id],
        conn,
      );
      if (!target) throw ApiError.notFound('User not found.');
      const isSelf = target.id === admin.id;
      if (isSelf && input.role && input.role !== 'admin') throw ApiError.badRequest('You cannot remove your own admin role.');
      if (isSelf && input.status && input.status !== 'active') throw ApiError.badRequest('You cannot deactivate your own account.');

      const role = input.role ?? target.role;
      let purokId = input.purok_id !== undefined ? input.purok_id || null : target.purok_id;
      if (role === 'admin' || role === 'collector') purokId = null;
      if ((role === 'leader' || role === 'resident') && !purokId) throw ApiError.badRequest('Purok Leaders and Residents must be assigned to a purok.');
      if (role === 'resident' && target.role !== 'resident' && !target.household_id) {
        throw ApiError.badRequest('To make someone a resident, create a resident account so a household is linked.');
      }
      if (role === 'resident' && target.household_id && purokId !== target.purok_id) {
        throw ApiError.badRequest("A resident's purok follows their household. Move the household instead.");
      }

      if (input.email) {
        const dup = await queryOne('SELECT id FROM users WHERE LOWER(email) = ? AND id <> ?', [input.email, id], conn);
        if (dup) throw ApiError.conflict('That email is already registered.');
      }

      const sets: string[] = ['role = ?', 'purok_id = ?'];
      const params: unknown[] = [role, purokId];
      if (input.full_name) { sets.push('full_name = ?'); params.push(input.full_name); }
      if (input.email) { sets.push('email = ?'); params.push(input.email); }
      if (input.contact_number !== undefined) { sets.push('contact_number = ?'); params.push(input.contact_number.trim()); }
      if (input.status) { sets.push('status = ?'); params.push(input.status); }
      if (input.new_password) { sets.push('password_hash = ?'); params.push(await bcrypt.hash(input.new_password, env.bcryptRounds)); }
      await execute(`UPDATE users SET ${sets.join(', ')} WHERE id = ?`, [...params, id], conn);

      // Keep puroks.leader_id in sync with the leader's role/purok/status.
      if (role === 'leader' && (input.status ?? target.status) === 'active') {
        await assignLeader(conn, id, purokId!);
      } else {
        await execute('UPDATE puroks SET leader_id = NULL WHERE leader_id = ?', [id], conn);
      }
      if (input.new_password || (input.status && input.status !== 'active') || (input.role && input.role !== target.role)) {
        await revokeUserSessions(conn, id);
      }
      const changes = Object.keys(input).filter((k) => k !== 'new_password').join(', ') + (input.new_password ? ', password' : '');
      await logActivity(conn, admin.id, 'UPDATE_USER', 'Users', `Updated ${target.full_name}: ${changes || 'no changes'}.`, req);
    });
    res.json(await getSafeUser(id));
  }),
);

/** Approve a pending self-registered resident. Leaders: own purok only. */
usersRouter.post(
  '/:id/approve',
  requireRole('admin', 'leader'),
  asyncHandler(async (req, res) => {
    const actor = currentUser(req);
    const id = idSchema.parse(req.params.id);
    await withTransaction(async (conn) => {
      const target = await queryOne<{ id: string; purok_id: string | null; status: string; full_name: string; role: string }>(
        'SELECT id, purok_id, status, full_name, role FROM users WHERE id = ? FOR UPDATE',
        [id],
        conn,
      );
      if (!target || target.role !== 'resident' || (actor.role === 'leader' && target.purok_id !== leaderPurok(actor))) {
        throw ApiError.notFound('Registration not found.');
      }
      if (target.status !== 'pending') throw ApiError.conflict('This registration was already processed.');
      await execute("UPDATE users SET status = 'active' WHERE id = ?", [id], conn);
      await notify(conn, id, 'Registration Approved', `Welcome! Your account was approved by ${actor.full_name}. You can now use the resident portal.`, 'system', 'dashboard');
      await logActivity(conn, actor.id, 'APPROVE_REGISTRATION', 'Users', `Approved resident registration of ${target.full_name}.`, req);
    });
    res.json(await getSafeUser(id));
  }),
);

/** Reject a pending registration: the account and its new, unused household are removed. */
usersRouter.post(
  '/:id/reject',
  requireRole('admin', 'leader'),
  asyncHandler(async (req, res) => {
    const actor = currentUser(req);
    const id = idSchema.parse(req.params.id);
    const { reason } = body(req, z.object({ reason: optionalText(500) }));
    await withTransaction(async (conn) => {
      const target = await queryOne<{ id: string; purok_id: string | null; status: string; full_name: string; role: string; household_id: string | null; username: string }>(
        'SELECT id, purok_id, status, full_name, role, household_id, username FROM users WHERE id = ? FOR UPDATE',
        [id],
        conn,
      );
      if (!target || target.role !== 'resident' || (actor.role === 'leader' && target.purok_id !== leaderPurok(actor))) {
        throw ApiError.notFound('Registration not found.');
      }
      if (target.status !== 'pending') throw ApiError.conflict('This registration was already processed.');
      await execute('DELETE FROM notifications WHERE user_id = ?', [id], conn);
      await execute('UPDATE activity_logs SET user_id = NULL WHERE user_id = ?', [id], conn);
      await execute('DELETE FROM users WHERE id = ?', [id], conn);
      if (target.household_id) {
        const others = await queryOne<{ n: number }>(
          `SELECT (SELECT COUNT(*) FROM users WHERE household_id = ?) + (SELECT COUNT(*) FROM disposal_submissions WHERE household_id = ?)
                + (SELECT COUNT(*) FROM payment_submissions WHERE household_id = ?)
                + (SELECT COUNT(*) FROM collection_scans WHERE household_id = ?) AS n`,
          [target.household_id, target.household_id, target.household_id, target.household_id],
          conn,
        );
        if (Number(others?.n) === 0) await execute('DELETE FROM households WHERE id = ?', [target.household_id], conn);
      }
      await logActivity(conn, actor.id, 'REJECT_REGISTRATION', 'Users', `Rejected registration of ${target.full_name} (${target.username})${reason ? `: ${reason}` : ''}.`, req);
    });
    res.json({ success: true });
  }),
);
