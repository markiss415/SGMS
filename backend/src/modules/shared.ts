/** Helpers shared by several modules. */
import { queryOne, type Db, getPool } from '../db/pool.js';
import type { AuthUser } from '../middleware/auth.js';
import { ApiError } from '../utils/ApiError.js';

export const USER_COLUMNS = `u.id, u.username, u.email, u.full_name, u.role, u.purok_id, u.household_id,
  u.contact_number, u.status, u.last_login_at, u.created_at,
  p.name AS purok_name, h.household_number, h.address_details`;

export const USER_JOINS = `LEFT JOIN puroks p ON p.id = u.purok_id LEFT JOIN households h ON h.id = u.household_id`;

export async function getSafeUser(id: string, db: Db = getPool()) {
  return queryOne(`SELECT ${USER_COLUMNS} FROM users u ${USER_JOINS} WHERE u.id = ?`, [id], db);
}

/** A leader must have an assigned purok to do anything purok-scoped. */
export function leaderPurok(user: AuthUser): string {
  if (!user.purok_id) throw ApiError.forbidden('Your Purok Leader account has no assigned purok yet. Please contact the Barangay Admin.');
  return user.purok_id;
}

/** A resident needs a household and purok to submit records. */
export function residentHousehold(user: AuthUser): { household_id: string; purok_id: string } {
  if (!user.household_id || !user.purok_id) {
    throw ApiError.forbidden('Your account is not linked to a household yet. Please contact your Purok Leader.');
  }
  return { household_id: user.household_id, purok_id: user.purok_id };
}

/** Next household number for a purok, e.g. HH-MNG-004. Call inside a transaction after locking the purok row. */
export async function nextHouseholdNumber(db: Db, purokId: string, purokName: string): Promise<string> {
  const code = purokName.replace(/^Purok\s+/i, '').replace(/[^A-Za-z]/g, '').slice(0, 3).toUpperCase().padEnd(3, 'X');
  const prefix = `HH-${code}-`;
  const row = await queryOne<{ max_no: number | null }>(
    `SELECT MAX(CAST(SUBSTRING(household_number, ?) AS UNSIGNED)) AS max_no
       FROM households WHERE household_number LIKE ?`,
    [prefix.length + 1, `${prefix}%`],
    db,
  );
  return `${prefix}${String((row?.max_no ?? 0) + 1).padStart(3, '0')}`;
}

export async function getSetting(key: string, db: Db = getPool()): Promise<string | null> {
  const row = await queryOne<{ setting_value: string }>('SELECT setting_value FROM system_settings WHERE setting_key = ?', [key], db);
  return row?.setting_value ?? null;
}
