/**
 * Bearer-token authentication.
 * The browser keeps an opaque random token; the database stores only its SHA-256 hash,
 * so a leaked database cannot be used to log in. Sessions expire and are revoked on logout,
 * password change, and account deactivation.
 */
import type { NextFunction, Request, Response } from 'express';
import { env } from '../config/env.js';
import { execute, queryOne, type Db } from '../db/pool.js';
import { ApiError } from '../utils/ApiError.js';
import { newId, randomToken, sha256 } from '../utils/ids.js';

export type Role = 'admin' | 'collector' | 'leader' | 'resident';

export interface AuthUser {
  id: string;
  username: string;
  full_name: string;
  email: string;
  role: Role;
  purok_id: string | null;
  household_id: string | null;
  session_id: string;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

function readToken(req: Request): string | null {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) return null;
  const token = header.slice(7).trim();
  return token.length >= 32 && token.length <= 128 ? token : null;
}

export async function createSession(db: Db, userId: string, req: Request): Promise<string> {
  const token = randomToken(32);
  const expires = new Date(Date.now() + env.sessionTtlHours * 3600_000);
  await execute(
    `INSERT INTO user_sessions (id, user_id, token_hash, ip_address, user_agent, expires_at, last_seen_at)
     VALUES (?, ?, ?, ?, ?, ?, UTC_TIMESTAMP())`,
    [newId('ses'), userId, sha256(token), (req.ip || '').slice(0, 64), String(req.headers['user-agent'] || '').slice(0, 255), expires],
    db,
  );
  return token;
}

export async function revokeUserSessions(db: Db, userId: string, exceptSessionId?: string): Promise<void> {
  if (exceptSessionId) {
    await execute('DELETE FROM user_sessions WHERE user_id = ? AND id <> ?', [userId, exceptSessionId], db);
  } else {
    await execute('DELETE FROM user_sessions WHERE user_id = ?', [userId], db);
  }
}

/** Attaches req.user when a valid token is present. Never fails the request by itself. */
export async function loadUser(req: Request, _res: Response, next: NextFunction) {
  try {
    const token = readToken(req);
    if (token) {
      const row = await queryOne<AuthUser & { expires_at: Date; last_seen_at: Date }>(
        `SELECT u.id, u.username, u.full_name, u.email, u.role, u.purok_id, u.household_id,
                s.id AS session_id, s.expires_at, s.last_seen_at
           FROM user_sessions s
           JOIN users u ON u.id = s.user_id
          WHERE s.token_hash = ? AND s.expires_at > UTC_TIMESTAMP() AND u.status = 'active'`,
        [sha256(token)],
      );
      if (row) {
        const { expires_at: _e, last_seen_at, ...user } = row;
        req.user = user;
        // Touch the session at most once a minute.
        if (Date.now() - new Date(last_seen_at).getTime() > 60_000) {
          execute('UPDATE user_sessions SET last_seen_at = UTC_TIMESTAMP() WHERE id = ?', [row.session_id]).catch(() => {});
        }
      }
    }
    next();
  } catch (err) {
    next(err);
  }
}

export function requireAuth(req: Request, _res: Response, next: NextFunction) {
  if (!req.user) return next(ApiError.unauthorized('Your session has expired. Please sign in again.'));
  next();
}

export function requireRole(...roles: Role[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) return next(ApiError.unauthorized());
    if (!roles.includes(req.user.role)) return next(ApiError.forbidden());
    next();
  };
}

/** Returns the authenticated user (use after requireAuth). */
export function currentUser(req: Request): AuthUser {
  if (!req.user) throw ApiError.unauthorized();
  return req.user;
}
