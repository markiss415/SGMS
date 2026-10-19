/**
 * Simple forward-only migration runner.
 * Applies every database/migrations/*.sql file once, in filename order,
 * and records it in the schema_migrations table.
 *
 *   npm run db:migrate
 */
import fs from 'node:fs';
import path from 'node:path';
import mysql from 'mysql2/promise';
import { env } from '../config/env.js';
import { sslOptions } from './pool.js';

const MIGRATIONS_DIR = path.resolve(process.cwd(), 'database', 'migrations');

/** Splits a .sql file into statements (no stored procedures are used, so ';' at line end is safe). */
function splitStatements(sql: string): string[] {
  return sql
    .split('\n')
    .filter((line) => !line.trim().startsWith('--'))
    .join('\n')
    .split(/;\s*(?:\n|$)/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Creates the configured database if it does not exist yet (needs CREATE privilege, e.g. root). */
export async function ensureDatabase(log: (msg: string) => void = console.log): Promise<void> {
  const conn = await mysql.createConnection({
    host: env.db.host,
    port: env.db.port,
    user: env.db.user,
    password: env.db.password,
    ssl: sslOptions(),
  });
  try {
    const [rows] = await conn.query<mysql.RowDataPacket[]>('SELECT SCHEMA_NAME FROM information_schema.SCHEMATA WHERE SCHEMA_NAME = ?', [env.db.database]);
    if (rows.length === 0) {
      const name = env.db.database.replace(/`/g, '');
      await conn.query(`CREATE DATABASE \`${name}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
      log(`Created database "${name}".`);
    }
  } finally {
    await conn.end();
  }
}

export async function runMigrations(log: (msg: string) => void = console.log): Promise<string[]> {
  await ensureDatabase(log);
  const conn = await mysql.createConnection({
    host: env.db.host,
    port: env.db.port,
    user: env.db.user,
    password: env.db.password,
    database: env.db.database,
    timezone: 'Z',
    ssl: sslOptions(),
  });
  const applied: string[] = [];
  try {
    await conn.query("SET time_zone = '+00:00'");
    await conn.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
      name VARCHAR(255) PRIMARY KEY,
      applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB`);
    const [rows] = await conn.query<mysql.RowDataPacket[]>('SELECT name FROM schema_migrations');
    const done = new Set(rows.map((r) => r.name as string));

    const files = fs.readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql')).sort();
    for (const file of files) {
      if (done.has(file)) continue;
      log(`Applying migration ${file} ...`);
      const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
      for (const stmt of splitStatements(sql)) {
        await conn.query(stmt);
      }
      await conn.query('INSERT INTO schema_migrations (name) VALUES (?)', [file]);
      applied.push(file);
    }
    log(applied.length ? `Applied ${applied.length} migration(s).` : 'Database is already up to date.');
    return applied;
  } finally {
    await conn.end();
  }
}

/** Drops every table in the configured database. Development/test only. */
export async function dropAllTables(): Promise<void> {
  if (env.isProduction) throw new Error('Refusing to drop tables in production.');
  await ensureDatabase(() => {});
  const conn = await mysql.createConnection({
    host: env.db.host,
    port: env.db.port,
    user: env.db.user,
    password: env.db.password,
    database: env.db.database,
    ssl: sslOptions(),
  });
  try {
    const [rows] = await conn.query<mysql.RowDataPacket[]>(
      'SELECT table_name AS t FROM information_schema.tables WHERE table_schema = ?',
      [env.db.database],
    );
    await conn.query('SET FOREIGN_KEY_CHECKS = 0');
    for (const r of rows) await conn.query(`DROP TABLE IF EXISTS \`${String(r.t).replace(/`/g, '')}\``);
    await conn.query('SET FOREIGN_KEY_CHECKS = 1');
  } finally {
    await conn.end();
  }
}

const isDirectRun = process.argv[1] && path.resolve(process.argv[1]).includes(path.join('src', 'db', 'migrate'));
if (isDirectRun) {
  runMigrations()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('Migration failed:', friendlyDbError(err));
      process.exit(1);
    });
}

/** Turns common MySQL connection errors into plain advice. */
export function friendlyDbError(err: { code?: string; message?: string }): string {
  switch (err.code) {
    case 'ER_ACCESS_DENIED_ERROR':
      return `MySQL rejected the username/password (${err.message}).\n  → Check MYSQL_USER and MYSQL_PASSWORD in backend/.env. They must be the same ones you use to log in to MySQL Workbench.`;
    case 'ECONNREFUSED':
      return `MySQL is not running on ${env.db.host}:${env.db.port}.\n  → Start the MySQL service (Windows: Services → MySQL84 → Start) and check MYSQL_HOST / MYSQL_PORT.`;
    case 'ER_DBACCESS_DENIED_ERROR':
      return `This MySQL user cannot create/use the database "${env.db.database}". Use the root user or create the database manually.`;
    default:
      return err.message || String(err);
  }
}
