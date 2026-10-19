/**
 * MySQL connection pool + small typed query helpers.
 * All SQL in the app goes through these helpers with `?` placeholders (parameterized).
 */
import mysql, { type Pool, type PoolConnection, type RowDataPacket, type ResultSetHeader } from 'mysql2/promise';
import fs from 'node:fs';
import { env } from '../config/env.js';

let pool: Pool | null = null;

/** TLS options for managed MySQL (e.g. Aiven). MYSQL_SSL_CA may be a file path or the PEM text itself. */
export function sslOptions(): { ca?: string; rejectUnauthorized: boolean } | undefined {
  if (!env.db.ssl) return undefined;
  if (!env.db.sslCa) return { rejectUnauthorized: true };
  const ca = env.db.sslCa.includes('BEGIN CERTIFICATE') ? env.db.sslCa.replace(/\\n/g, '\n') : fs.readFileSync(env.db.sslCa, 'utf8');
  return { ca, rejectUnauthorized: true };
}

export type Db = Pool | PoolConnection;

export function getPool(): Pool {
  if (!pool) {
    pool = mysql.createPool({
      host: env.db.host,
      port: env.db.port,
      user: env.db.user,
      password: env.db.password,
      database: env.db.database,
      connectionLimit: env.db.connectionLimit,
      waitForConnections: true,
      // Store and read TIMESTAMPs as UTC; DATE columns come back as 'YYYY-MM-DD' strings.
      timezone: 'Z',
      dateStrings: ['DATE'],
      decimalNumbers: true,
      supportBigNumbers: true,
      multipleStatements: false,
      ssl: sslOptions(),
    });
    pool.on('connection', (conn) => {
      conn.query("SET time_zone = '+00:00'");
    });
  }
  return pool;
}

export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}

export async function query<T = RowDataPacket>(sql: string, params: unknown[] = [], db: Db = getPool()): Promise<T[]> {
  const [rows] = await db.query<RowDataPacket[]>(sql, params);
  return rows as unknown as T[];
}

export async function queryOne<T = RowDataPacket>(sql: string, params: unknown[] = [], db: Db = getPool()): Promise<T | null> {
  const rows = await query<T>(sql, params, db);
  return rows[0] ?? null;
}

export async function execute(sql: string, params: unknown[] = [], db: Db = getPool()): Promise<ResultSetHeader> {
  const [result] = await db.query<ResultSetHeader>(sql, params);
  return result;
}

/** Runs `fn` inside a transaction; commits on success, rolls back on any error. */
export async function withTransaction<T>(fn: (conn: PoolConnection) => Promise<T>): Promise<T> {
  const conn = await getPool().getConnection();
  try {
    await conn.beginTransaction();
    const result = await fn(conn);
    await conn.commit();
    return result;
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}
