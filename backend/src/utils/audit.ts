import type { Request } from 'express';
import { execute, type Db } from '../db/pool.js';
import { newId } from './ids.js';

/** Writes an activity (audit) log row. Pass the transaction connection when inside one. */
export async function logActivity(
  db: Db | undefined,
  userId: string | null,
  action: string,
  module: string,
  details: string,
  req?: Request,
): Promise<void> {
  const ip = (req?.ip || '').slice(0, 64);
  const sql = 'INSERT INTO activity_logs (id, user_id, action, module, details, ip_address) VALUES (?, ?, ?, ?, ?, ?)';
  const params = [newId('act'), userId, action, module, details.slice(0, 2000), ip];
  if (db) await execute(sql, params, db);
  else await execute(sql, params);
}
