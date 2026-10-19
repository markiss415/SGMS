/**
 * Authentication: login, logout, resident self-registration (approved by the Purok Leader),
 * password reset by emailed one-time code, and the current-user endpoint.
 */
import { Router } from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import { z } from 'zod';
import { env } from '../../config/env.js';
import { execute, queryOne, withTransaction } from '../../db/pool.js';
import { createSession, currentUser, requireAuth, revokeUserSessions } from '../../middleware/auth.js';
import { rateLimit } from '../../middleware/rateLimit.js';
import { ApiError } from '../../utils/ApiError.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { logActivity } from '../../utils/audit.js';
import { newId, randomCode, randomToken, sha256 } from '../../utils/ids.js';
import { codeEmailHtml, isMailConfigured, sendMail } from '../../utils/mailer.js';
import { notify, notifyMany } from '../../utils/notify.js';
import {
  body, emailSchema, optionalText, passwordSchema, phoneSchema, requiredText, usernameSchema, idSchema,
} from '../../utils/validate.js';
import { getSafeUser, nextHouseholdNumber } from '../shared.js';

export const authRouter = Router();

const loginLimiter = rateLimit({ name: 'login', windowMs: 15 * 60_000, max: 10, skipSuccessfulRequests: true });
const registerLimiter = rateLimit({ name: 'register', windowMs: 60 * 60_000, max: 10 });
const resetLimiter = rateLimit({ name: 'reset', windowMs: 15 * 60_000, max: 8 });

// Used so a login for an unknown username takes as long as a wrong password.
const DUMMY_HASH = bcrypt.hashSync('timing-equaliser-not-a-password', 10);

authRouter.post(
  '/login',
  loginLimiter,
  asyncHandler(async (req, res) => {
    const { identifier, password } = body(
      req,
      z.object({
        identifier: requiredText(120, 'Username or email').transform((v) => v.toLowerCase()),
        password: z.string({ error: 'Password is required.' }).min(1, 'Password is required.').max(128),
      }),
    );
    const user = await queryOne<{ id: string; password_hash: string; status: string; full_name: string; role: string }>(
      'SELECT id, password_hash, status, full_name, role FROM users WHERE LOWER(username) = ? OR LOWER(email) = ? LIMIT 1',
      [identifier, identifier],
    );
    const ok = await bcrypt.compare(password, user?.password_hash ?? DUMMY_HASH);
    if (!user || !ok) {
      await logActivity(undefined, user?.id ?? null, 'LOGIN_FAILED', 'Auth', `Failed sign-in for "${identifier}"`, req);
      throw ApiError.unauthorized('Invalid username/email or password.');
    }
    if (user.status === 'pending') {
      throw ApiError.forbidden('Your registration is still waiting for approval from your Purok Leader.');
    }
    if (user.status !== 'active') {
      throw ApiError.forbidden('This account is deactivated. Please contact the Barangay Office.');
    }
    const token = await withTransaction(async (conn) => {
      const t = await createSession(conn, user.id, req);
      await execute('UPDATE users SET last_login_at = UTC_TIMESTAMP() WHERE id = ?', [user.id], conn);
      await logActivity(conn, user.id, 'LOGIN', 'Auth', `${user.full_name} (${user.role}) signed in.`, req);
      return t;
    });
    res.json({ token, user: await getSafeUser(user.id) });
  }),
);

authRouter.post(
  '/logout',
  asyncHandler(async (req, res) => {
    if (req.user) {
      await execute('DELETE FROM user_sessions WHERE id = ?', [req.user.session_id]);
      await logActivity(undefined, req.user.id, 'LOGOUT', 'Auth', `${req.user.full_name} signed out.`, req);
    }
    res.json({ success: true });
  }),
);

authRouter.get(
  '/me',
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = await getSafeUser(currentUser(req).id);
    if (!user) throw ApiError.unauthorized();
    res.json(user);
  }),
);

/* ------------------------------------------------------------------------------------------------
 * Resident self-registration with EMAIL OTP verification
 *   1. POST /register          → validates the form, stores it in pending_registrations and emails a 6-digit code
 *   2. POST /register/verify   → checks the code; only then the household + *pending* account are created
 *   3. POST /register/resend   → sends a new code (60 s cooldown, max 5 resends)
 * The Purok Leader still approves the account afterwards (unchanged business rule).
 * ------------------------------------------------------------------------------------------------ */
const OTP_TTL_MINUTES = 10;
const OTP_MAX_ATTEMPTS = 5;
const OTP_RESEND_COOLDOWN_S = 60;
const OTP_MAX_RESENDS = 5;
const otpLimiter = rateLimit({ name: 'register-otp', windowMs: 15 * 60_000, max: 30 });

const maskEmail = (email: string) => {
  const [name, domain] = email.split('@');
  const shown = name.length <= 2 ? name[0] : `${name.slice(0, 2)}${'*'.repeat(Math.min(6, name.length - 2))}`;
  return `${shown}@${domain}`;
};

async function sendRegistrationCode(email: string, name: string, code: string): Promise<void> {
  if (env.isProduction && !isMailConfigured()) {
    throw new ApiError(503, 'Email verification is not available right now. Please contact the Barangay Office.');
  }
  try {
    await sendMail(
      email,
      `${code} is your Barangay Bang-Bang verification code`,
      `Hello ${name},\n\nYour Barangay Bang-Bang SGMS email verification code is: ${code}\n\nIt expires in ${OTP_TTL_MINUTES} minutes. Do not share this code with anyone.\nIf you did not register, you can ignore this email.`,
      codeEmailHtml(name, 'Verify your email address', 'Use this code to finish registering your household in the Barangay Bang-Bang Smart Garbage Monitoring System.', code, OTP_TTL_MINUTES),
    );
  } catch (err) {
    console.error('Failed to send verification email:', (err as Error).message);
    throw new ApiError(502, 'We could not send the verification email. Please check the email address and try again.');
  }
}

async function assertAvailable(username: string, email: string, db?: Parameters<typeof queryOne>[2]) {
  const taken = await queryOne<{ username: string; email: string }>(
    'SELECT username, email FROM users WHERE LOWER(username) = ? OR LOWER(email) = ? LIMIT 1',
    [username, email],
    db,
  );
  if (taken) {
    throw ApiError.conflict(
      taken.username.toLowerCase() === username ? 'That username is already taken.' : 'That email address is already registered.',
    );
  }
}

authRouter.post(
  '/register',
  registerLimiter,
  asyncHandler(async (req, res) => {
    const input = body(
      req,
      z.object({
        full_name: requiredText(150, 'Full name'),
        username: usernameSchema,
        email: emailSchema,
        password: passwordSchema,
        contact_number: phoneSchema,
        purok_id: idSchema,
        address_details: optionalText(255),
        family_member_count: z.coerce.number().int().min(1).max(50).optional().default(1),
        latitude: z.coerce.number().min(-90).max(90).nullable().optional(),
        longitude: z.coerce.number().min(-180).max(180).nullable().optional(),
      }),
    );
    const purok = await queryOne<{ id: string }>('SELECT id FROM puroks WHERE id = ?', [input.purok_id]);
    if (!purok) throw ApiError.badRequest('Please select a valid purok.');
    await assertAvailable(input.username, input.email);

    // Old/abandoned attempts are cleaned up; one live attempt per email address.
    await execute('DELETE FROM pending_registrations WHERE expires_at < UTC_TIMESTAMP() - INTERVAL 1 DAY OR email = ?', [input.email]);
    const pendingSameUser = await queryOne<{ id: string }>(
      'SELECT id FROM pending_registrations WHERE LOWER(username) = ? AND expires_at > UTC_TIMESTAMP() LIMIT 1',
      [input.username],
    );
    if (pendingSameUser) throw ApiError.conflict('That username is being registered by someone else right now. Please choose another one.');

    const id = newId('reg');
    const code = randomCode();
    const hash = await bcrypt.hash(input.password, env.bcryptRounds);
    await execute(
      `INSERT INTO pending_registrations (id, username, email, full_name, password_hash, contact_number, purok_id, address_details,
                                          family_member_count, latitude, longitude, code_hash, last_sent_at, expires_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, UTC_TIMESTAMP(), ?)`,
      [id, input.username, input.email, input.full_name, hash, input.contact_number, input.purok_id, input.address_details || null,
        input.family_member_count, input.latitude ?? null, input.longitude ?? null, sha256(`${id}:${code}`), new Date(Date.now() + OTP_TTL_MINUTES * 60_000)],
    );
    try {
      await sendRegistrationCode(input.email, input.full_name, code);
    } catch (err) {
      await execute('DELETE FROM pending_registrations WHERE id = ?', [id]);
      throw err;
    }
    await logActivity(undefined, null, 'REGISTER_OTP_SENT', 'Auth', `Verification code sent to ${maskEmail(input.email)} for "${input.username}".`, req);

    res.status(202).json({
      require_verification: true,
      verification_id: id,
      email: maskEmail(input.email),
      expires_in_seconds: OTP_TTL_MINUTES * 60,
      resend_after_seconds: OTP_RESEND_COOLDOWN_S,
      message: `We sent a 6-digit code to ${maskEmail(input.email)}. Enter it to finish your registration.`,
    });
  }),
);

authRouter.post(
  '/register/resend',
  otpLimiter,
  asyncHandler(async (req, res) => {
    const { verification_id } = body(req, z.object({ verification_id: idSchema }));
    const p = await queryOne<{ id: string; email: string; full_name: string; resend_count: number; seconds_since: number }>(
      `SELECT id, email, full_name, resend_count, TIMESTAMPDIFF(SECOND, last_sent_at, UTC_TIMESTAMP()) AS seconds_since
         FROM pending_registrations WHERE id = ?`,
      [verification_id],
    );
    if (!p) throw ApiError.badRequest('This registration has expired. Please fill in the form again.');
    const wait = OTP_RESEND_COOLDOWN_S - Number(p.seconds_since);
    if (wait > 0) throw new ApiError(429, `Please wait ${wait} seconds before requesting a new code.`);
    if (p.resend_count >= OTP_MAX_RESENDS) throw new ApiError(429, 'Too many codes requested. Please register again later.');
    const code = randomCode();
    await execute(
      `UPDATE pending_registrations SET code_hash = ?, attempts = 0, resend_count = resend_count + 1,
              last_sent_at = UTC_TIMESTAMP(), expires_at = ? WHERE id = ?`,
      [sha256(`${p.id}:${code}`), new Date(Date.now() + OTP_TTL_MINUTES * 60_000), p.id],
    );
    await sendRegistrationCode(p.email, p.full_name, code);
    res.json({
      success: true,
      email: maskEmail(p.email),
      expires_in_seconds: OTP_TTL_MINUTES * 60,
      resend_after_seconds: OTP_RESEND_COOLDOWN_S,
      message: `A new code was sent to ${maskEmail(p.email)}.`,
    });
  }),
);

authRouter.post(
  '/register/verify',
  otpLimiter,
  asyncHandler(async (req, res) => {
    const input = body(
      req,
      z.object({
        verification_id: idSchema,
        code: z.string().trim().regex(/^\d{6}$/, 'The verification code is 6 digits.'),
      }),
    );

    const outcome = await withTransaction(async (conn) => {
      const p = await queryOne<{
        id: string; username: string; email: string; full_name: string; password_hash: string; contact_number: string;
        purok_id: string; address_details: string | null; family_member_count: number; latitude: string | null; longitude: string | null;
        code_hash: string; attempts: number; expired: number;
      }>(
        `SELECT *, (expires_at <= UTC_TIMESTAMP()) AS expired FROM pending_registrations WHERE id = ? FOR UPDATE`,
        [input.verification_id],
        conn,
      );
      if (!p) return { error: 'This registration has expired. Please fill in the form again.' } as const;
      if (Number(p.expired)) return { error: 'This code has expired. Tap "Resend code" to get a new one.' } as const;
      if (p.attempts >= OTP_MAX_ATTEMPTS) return { error: 'Too many wrong codes. Tap "Resend code" to get a new one.' } as const;
      const given = Buffer.from(sha256(`${p.id}:${input.code}`));
      if (!crypto.timingSafeEqual(given, Buffer.from(p.code_hash))) {
        await execute('UPDATE pending_registrations SET attempts = attempts + 1 WHERE id = ?', [p.id], conn);
        const left = OTP_MAX_ATTEMPTS - p.attempts - 1;
        return { error: left > 0 ? `Incorrect code. You have ${left} attempt(s) left.` : 'Too many wrong codes. Tap "Resend code" to get a new one.' } as const;
      }

      const purok = await queryOne<{ id: string; name: string; leader_id: string | null }>(
        'SELECT id, name, leader_id FROM puroks WHERE id = ? FOR UPDATE',
        [p.purok_id],
        conn,
      );
      if (!purok) throw ApiError.badRequest('The selected purok no longer exists. Please register again.');
      await assertAvailable(p.username.toLowerCase(), p.email.toLowerCase(), conn);

      const householdId = newId('hh');
      const householdNumber = await nextHouseholdNumber(conn, purok.id, purok.name);
      await execute(
        `INSERT INTO households (id, household_number, purok_id, head_name, contact_number, address_details, family_member_count, latitude, longitude, qr_token)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [householdId, householdNumber, purok.id, p.full_name, p.contact_number, p.address_details || `${purok.name}, Bang-Bang, Cordova`,
          p.family_member_count, p.latitude, p.longitude, randomToken(18)],
        conn,
      );
      const userId = newId('usr');
      await execute(
        `INSERT INTO users (id, username, email, email_verified_at, password_hash, full_name, role, purok_id, household_id, contact_number, status)
         VALUES (?, ?, ?, UTC_TIMESTAMP(), ?, ?, 'resident', ?, ?, ?, 'pending')`,
        [userId, p.username, p.email, p.password_hash, p.full_name, purok.id, householdId, p.contact_number],
        conn,
      );
      await execute('DELETE FROM pending_registrations WHERE id = ?', [p.id], conn);
      const msg = `${p.full_name} registered in ${purok.name} (${householdNumber}) with a verified email and is waiting for approval.`;
      if (purok.leader_id) {
        await notify(conn, purok.leader_id, 'New Resident Registration', msg, 'system', 'registrations');
      } else {
        await notifyMany(conn, "u.role = 'admin'", [], 'New Resident Registration', `${msg} ${purok.name} has no Purok Leader yet.`, 'system', 'residents');
      }
      await logActivity(conn, userId, 'REGISTER', 'Auth', `Resident ${p.full_name} verified their email and registered in ${purok.name} (pending approval).`, req);
      return { userId, purokName: purok.name } as const;
    });

    if ('error' in outcome) throw ApiError.badRequest(outcome.error);
    res.status(201).json({
      require_approval: true,
      user_id: outcome.userId,
      message: `Email verified! Your Purok Leader in ${outcome.purokName} will review and approve your account. You can sign in once it is approved.`,
    });
  }),
);

const GENERIC_RESET_MESSAGE =
  'If an account matches what you entered, a 6-digit reset code has been sent to its registered email address. The code expires in 15 minutes.';

authRouter.post(
  '/forgot-password',
  resetLimiter,
  asyncHandler(async (req, res) => {
    const { identifier } = body(req, z.object({ identifier: requiredText(120, 'Username or email').transform((v) => v.toLowerCase()) }));
    const user = await queryOne<{ id: string; email: string; full_name: string }>(
      "SELECT id, email, full_name FROM users WHERE (LOWER(username) = ? OR LOWER(email) = ?) AND status = 'active' LIMIT 1",
      [identifier, identifier],
    );
    if (user) {
      const code = randomCode();
      await execute('UPDATE password_reset_codes SET used_at = UTC_TIMESTAMP() WHERE user_id = ? AND used_at IS NULL', [user.id]);
      await execute(
        'INSERT INTO password_reset_codes (id, user_id, code_hash, expires_at) VALUES (?, ?, ?, ?)',
        [newId('rst'), user.id, sha256(`${user.id}:${code}`), new Date(Date.now() + 15 * 60_000)],
      );
      await logActivity(undefined, user.id, 'PASSWORD_RESET_REQUEST', 'Auth', 'Password reset code requested.', req);
      await sendMail(
        user.email,
        'Barangay Bang-Bang SGMS password reset code',
        `Hello ${user.full_name},\n\nYour password reset code is: ${code}\n\nIt expires in 15 minutes. If you did not request this, you can ignore this email.`,
        codeEmailHtml(user.full_name, 'Password reset code', 'Use this code to reset your Barangay Bang-Bang SGMS password.', code, 15),
      ).catch((err) => console.error('Failed to send reset email:', err.message));
    }
    res.json({ success: true, message: GENERIC_RESET_MESSAGE });
  }),
);

authRouter.post(
  '/reset-password',
  resetLimiter,
  asyncHandler(async (req, res) => {
    const input = body(
      req,
      z.object({
        identifier: requiredText(120, 'Username or email').transform((v) => v.toLowerCase()),
        code: z.string().trim().regex(/^\d{6}$/, 'The reset code is 6 digits.'),
        new_password: passwordSchema,
      }),
    );
    const invalid = ApiError.badRequest('Invalid or expired reset code. Please request a new one.');
    const user = await queryOne<{ id: string; username: string }>(
      "SELECT id, username FROM users WHERE (LOWER(username) = ? OR LOWER(email) = ?) AND status = 'active' LIMIT 1",
      [input.identifier, input.identifier],
    );
    if (!user) throw invalid;

    await withTransaction(async (conn) => {
      const rec = await queryOne<{ id: string; code_hash: string; attempts: number }>(
        `SELECT id, code_hash, attempts FROM password_reset_codes
          WHERE user_id = ? AND used_at IS NULL AND expires_at > UTC_TIMESTAMP()
          ORDER BY created_at DESC LIMIT 1 FOR UPDATE`,
        [user.id],
        conn,
      );
      if (!rec || rec.attempts >= 5) throw invalid;
      const given = Buffer.from(sha256(`${user.id}:${input.code}`));
      if (!crypto.timingSafeEqual(given, Buffer.from(rec.code_hash))) {
        await execute('UPDATE password_reset_codes SET attempts = attempts + 1 WHERE id = ?', [rec.id], conn);
        return 'wrong';
      }
      const hash = await bcrypt.hash(input.new_password, env.bcryptRounds);
      await execute('UPDATE users SET password_hash = ? WHERE id = ?', [hash, user.id], conn);
      await execute('UPDATE password_reset_codes SET used_at = UTC_TIMESTAMP() WHERE id = ?', [rec.id], conn);
      await revokeUserSessions(conn, user.id);
      await logActivity(conn, user.id, 'PASSWORD_RESET', 'Auth', `Password reset completed for ${user.username}.`, req);
      return 'ok';
    }).then((outcome) => {
      if (outcome === 'wrong') throw invalid;
    });

    res.json({ success: true, message: 'Your password has been reset. You can now sign in with your new password.' });
  }),
);
