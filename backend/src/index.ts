/**
 * SMART GARBAGE MONITORING SYSTEM — Barangay Bang-Bang, Cordova, Cebu
 * Backend entry point: REST API under /api (the React frontend lives in ../frontend).
 */
import { env } from './config/env.js';
import { createApp } from './app.js';
import { getPool } from './db/pool.js';
import { friendlyDbError, runMigrations } from './db/migrate.js';
import { backfillHouseholdQrTokens } from './modules/households/households.routes.js';
import { isMailConfigured, verifyMailer } from './utils/mailer.js';

async function start() {
  try {
    if (process.env.AUTO_MIGRATE !== 'false') await runMigrations((m) => console.log(`[db] ${m}`));
    await getPool().query('SELECT 1');
    await backfillHouseholdQrTokens();
  } catch (err) {
    console.error('\n✖ Cannot connect to MySQL.');
    console.error(`  ${friendlyDbError(err as { code?: string; message?: string })}\n`);
    process.exit(1);
  }

  createApp().listen(env.port, '0.0.0.0', () => {
    console.log('\n======================================================');
    console.log('  BARANGAY BANG-BANG SGMS — API');
    console.log(`  Running at http://localhost:${env.port}/api  (${env.nodeEnv})`);
    console.log(`  Allowed frontend origin(s): ${env.corsOrigins.join(', ')}`);
    console.log(
      isMailConfigured()
        ? `  Email (OTP): SMTP ${env.smtp.host}:${env.smtp.port} as ${env.smtp.user || '(no auth)'}`
        : '  Email (OTP): SMTP not set — verification codes are printed in this terminal',
    );
    console.log('======================================================\n');
    void verifyMailer();
  });
}

start().catch((err) => {
  console.error('Fatal server error:', err);
  process.exit(1);
});
