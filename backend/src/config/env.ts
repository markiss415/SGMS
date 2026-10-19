/**
 * Environment configuration. Every secret comes from the environment (.env);
 * nothing sensitive is hardcoded.
 */
import 'dotenv/config';

function str(name: string, fallback?: string): string {
  const v = process.env[name];
  if (v === undefined || v === '') {
    if (fallback !== undefined) return fallback;
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return v;
}

function int(name: string, fallback: number): number {
  const v = process.env[name];
  if (!v) return fallback;
  const n = Number.parseInt(v, 10);
  if (Number.isNaN(n)) throw new Error(`Environment variable ${name} must be a number`);
  return n;
}

function bool(name: string, fallback: boolean): boolean {
  const v = process.env[name];
  if (!v) return fallback;
  return ['1', 'true', 'yes', 'on'].includes(v.toLowerCase());
}

const nodeEnv = process.env.NODE_ENV || 'development';

export const env = {
  nodeEnv,
  isProduction: nodeEnv === 'production',
  isTest: nodeEnv === 'test',
  port: int('PORT', 4000),
  appUrl: str('APP_URL', 'http://localhost:5173'),
  /** Browser origins allowed to call the API (comma-separated), e.g. your Vercel URL. */
  corsOrigins: str('CORS_ORIGIN', 'http://localhost:5173')
    .split(',')
    .map((o) => o.trim().replace(/\/$/, ''))
    .filter(Boolean),
  trustProxy: int('TRUST_PROXY', 0),

  db: {
    host: str('MYSQL_HOST', 'localhost'),
    port: int('MYSQL_PORT', 3306),
    user: str('MYSQL_USER', 'root'),
    password: process.env.MYSQL_PASSWORD ?? '',
    database: str('MYSQL_DATABASE', 'bangbang_sgms'),
    ssl: bool('MYSQL_SSL', false),
    sslCa: process.env.MYSQL_SSL_CA || '',
    connectionLimit: int('MYSQL_CONNECTION_LIMIT', 10),
  },

  sessionTtlHours: int('SESSION_TTL_HOURS', 12),
  bcryptRounds: int('BCRYPT_ROUNDS', 12),

  smtp: {
    host: process.env.SMTP_HOST || '',
    port: int('SMTP_PORT', 587),
    secure: bool('SMTP_SECURE', false),
    user: process.env.SMTP_USER || '',
    password: process.env.SMTP_PASSWORD || '',
    from: process.env.SMTP_FROM || 'Barangay Bang-Bang SGMS <no-reply@localhost>',
  },
};
