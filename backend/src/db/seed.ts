/**
 * Database seeding.
 *
 *   npm run db:seed          → settings + the 7 puroks of Barangay Bang-Bang (+ first admin from ADMIN_* env vars)
 *   npm run db:seed:demo     → the above + demo accounts and sample records (password = SEED_PASSWORD from .env)
 *   npm run db:reset         → DEV ONLY: drop all tables, migrate, and seed demo data
 *
 * No password is hardcoded: demo accounts use SEED_PASSWORD, and the first admin uses ADMIN_PASSWORD.
 */
import bcrypt from 'bcryptjs';
import path from 'node:path';
import { env } from '../config/env.js';
import { addDays, manilaToday, weekStart } from '../utils/dates.js';
import { newPaymentCode, randomToken } from '../utils/ids.js';
import { closePool, execute, queryOne, withTransaction } from './pool.js';
import { dropAllTables, friendlyDbError, runMigrations } from './migrate.js';
import type { PoolConnection } from 'mysql2/promise';

const SETTINGS: [string, string, string][] = [
  ['weekly_contribution_fee', '5.00', 'Weekly solid waste contribution fee per household (PHP)'],
  ['barangay_name', 'Barangay Bang-Bang', 'Official barangay name'],
  ['municipality_name', 'Cordova', 'Municipality'],
  ['province_name', 'Cebu', 'Province'],
  ['barangay_captain', 'Hon. Artemio Degamo', 'Incumbent Punong Barangay'],
  ['contact_hotline', '(032) 496-8120 / +63 917 849 2031', 'Barangay operations hotline'],
  ['gcash_treasury_number', '0917-849-2031 (Barangay Bang-Bang Waste Fund)', 'Official GCash number for weekly contributions'],
  ['maya_number', '0917-849-2031 (Barangay Bang-Bang Waste Fund)', 'Official Maya number for weekly contributions'],
  ['gcash_qr_image', '', 'Official GCash QR image (uploaded by the Admin)'],
  ['maya_qr_image', '', 'Official Maya QR image (uploaded by the Admin)'],
  ['map_center_lat', '10.2588', 'Map center latitude (Barangay Bang-Bang)'],
  ['map_center_lng', '123.9445', 'Map center longitude (Barangay Bang-Bang)'],
];

/** Approximate centre of each purok inside Barangay Bang-Bang, Cordova (for the map). */
const PUROK_COORDS: Record<string, [number, number]> = {
  'pur-1': [10.2602, 123.9468],
  'pur-2': [10.2589, 123.9440],
  'pur-3': [10.2571, 123.9462],
  'pur-4': [10.2580, 123.9425],
  'pur-5': [10.2598, 123.9432],
  'pur-6': [10.2565, 123.9440],
  'pur-7': [10.2612, 123.9450],
};

const PUROKS: [string, string, string, string][] = [
  ['pur-1', 'Purok Mangga', 'Coastal residential zone with fishing landing site and access to Mangga chapel road', 'Monday, Thursday'],
  ['pur-2', 'Purok Nangka', 'Central neighborhood surrounding the community elementary school and sports plaza', 'Tuesday, Friday'],
  ['pur-3', 'Purok Saging', 'Agricultural and residential border section near mangrove preservation perimeter', 'Wednesday, Saturday'],
  ['pur-4', 'Purok Sambag', 'Commercial intersection section with local sari-sari stalls and bakery row', 'Monday, Thursday'],
  ['pur-5', 'Purok Santol', 'Interior residential sector with closely-knit household clusters and footpaths', 'Tuesday, Friday'],
  ['pur-6', 'Purok Pag-asa', 'Newer settlement district with active youth organization and community garden', 'Wednesday, Saturday'],
  ['pur-7', 'Purok Malinawon', 'Quiet peripheral coastal strip with seaside residential households', 'Friday, Sunday'],
];

async function seedBase(conn: PoolConnection) {
  for (const [key, value, description] of SETTINGS) {
    await execute(
      'INSERT IGNORE INTO system_settings (id, setting_key, setting_value, description) VALUES (?, ?, ?, ?)',
      [`set-${key}`, key, value, description],
      conn,
    );
  }
  for (const [id, name, description, days] of PUROKS) {
    await execute(
      'INSERT IGNORE INTO puroks (id, name, description, target_collection_days) VALUES (?, ?, ?, ?)',
      [id, name, description, days],
      conn,
    );
    const c = PUROK_COORDS[id];
    if (c) await execute('UPDATE puroks SET latitude = COALESCE(latitude, ?), longitude = COALESCE(longitude, ?) WHERE id = ?', [c[0], c[1], id], conn);
  }
}

/** Creates the first admin from ADMIN_USERNAME / ADMIN_EMAIL / ADMIN_PASSWORD when no admin exists yet. */
async function seedFirstAdmin(conn: PoolConnection) {
  const exists = await queryOne("SELECT id FROM users WHERE role = 'admin' LIMIT 1", [], conn);
  if (exists) return;
  const { ADMIN_USERNAME, ADMIN_EMAIL, ADMIN_PASSWORD, ADMIN_FULL_NAME } = process.env;
  if (!ADMIN_USERNAME || !ADMIN_EMAIL || !ADMIN_PASSWORD) {
    console.log('ℹ No admin account yet. Set ADMIN_USERNAME, ADMIN_EMAIL and ADMIN_PASSWORD in .env and run `npm run db:seed` again.');
    return;
  }
  assertStrong(ADMIN_PASSWORD, 'ADMIN_PASSWORD');
  await execute(
    `INSERT INTO users (id, username, email, password_hash, full_name, role, status) VALUES (?, ?, ?, ?, ?, 'admin', 'active')`,
    ['usr-admin', ADMIN_USERNAME.toLowerCase(), ADMIN_EMAIL.toLowerCase(), await bcrypt.hash(ADMIN_PASSWORD, env.bcryptRounds), ADMIN_FULL_NAME || 'Barangay Administrator'],
    conn,
  );
  console.log(`✔ Created admin account "${ADMIN_USERNAME}".`);
}

function assertStrong(pw: string, name: string) {
  if (pw.length < 8 || !/[A-Za-z]/.test(pw) || !/[0-9]/.test(pw)) {
    throw new Error(`${name} must be at least 8 characters and contain letters and numbers.`);
  }
}

async function seedDemo(conn: PoolConnection) {
  const existing = await queryOne<{ n: number }>('SELECT COUNT(*) AS n FROM users', [], conn);
  if (Number(existing?.n) > 0) {
    console.log('ℹ Users already exist — skipping demo data. Use `npm run db:reset` to start over (development only).');
    return;
  }
  const password = process.env.SEED_PASSWORD;
  if (!password) throw new Error('Set SEED_PASSWORD in .env (the password for all demo accounts), then run the seed again.');
  assertStrong(password, 'SEED_PASSWORD');
  const hash = await bcrypt.hash(password, env.bcryptRounds);

  const today = manilaToday();
  const tomorrow = addDays(today, 1);
  const threeDaysAgo = addDays(today, -3);
  const thisWeek = weekStart(today);
  const lastWeek = addDays(thisWeek, -7);
  const hoursAgo = (h: number) => new Date(Date.now() - h * 3600_000);

  const households: [string, string, string, string, string, string, number][] = [
    ['hh-1', 'HH-MAN-001', 'pur-1', 'Maria Clara Deatras', '0917-555-0101', 'Sitio Seaside, Purok Mangga, Bang-Bang', 4],
    ['hh-2', 'HH-MAN-002', 'pur-1', 'Pedro Alcantara', '0918-555-0102', 'Cor. Chapel Lane, Purok Mangga, Bang-Bang', 5],
    ['hh-3', 'HH-NAN-001', 'pur-2', 'Juan Dela Cruz', '0920-555-0201', 'Near Elementary School, Purok Nangka', 3],
    ['hh-4', 'HH-NAN-002', 'pur-2', 'Lourdes Mendoza', '0922-555-0202', 'Block 3 Lot 14, Purok Nangka, Bang-Bang', 6],
    ['hh-5', 'HH-SAG-001', 'pur-3', 'Elena Ramos', '0923-555-0301', 'Mangrove View Road, Purok Saging', 4],
    ['hh-6', 'HH-SAM-001', 'pur-4', 'Ramon Gutierrez', '0925-555-0401', 'Main Highway junction, Purok Sambag', 5],
    ['hh-7', 'HH-SAN-001', 'pur-5', 'Salvacion Fernandez', '0927-555-0501', 'Interior Alley 2, Purok Santol', 3],
    ['hh-8', 'HH-PAG-001', 'pur-6', 'Nestor Villamor', '0929-555-0601', 'Community Garden St., Purok Pag-asa', 4],
    ['hh-9', 'HH-MAL-001', 'pur-7', 'Teresita Cañete', '0930-555-0701', 'Coastal Dyke Rd, Purok Malinawon', 2],
  ];
  // Small offsets around each purok centre so the markers do not overlap on the map.
  const offsets = [[-0.0006, -0.0005], [-0.0005, 0.0006], [0.0006, 0.0007], [-0.0008, -0.0001]];
  const perPurok: Record<string, number> = {};
  for (const h of households) {
    const n = (perPurok[h[2]] = (perPurok[h[2]] ?? -1) + 1);
    const [lat, lng] = PUROK_COORDS[h[2]];
    const [dLat, dLng] = offsets[n % offsets.length];
    await execute(
      `INSERT INTO households (id, household_number, purok_id, head_name, contact_number, address_details, family_member_count, latitude, longitude, qr_token)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [...h, lat + dLat, lng + dLng, randomToken(18)],
      conn,
    );
  }

  const users: [string, string, string, string, string, string | null, string | null, string][] = [
    ['usr-admin', 'captain.degamo', 'captain@bangbang-cordova.gov.ph', 'Hon. Artemio Degamo', 'admin', null, null, '0917-849-2031'],
    ['usr-col-1', 'collector.danilo', 'danilo.enoc@bangbang-cordova.gov.ph', 'Danilo Enoc', 'collector', null, null, '0918-333-1001'],
    ['usr-col-2', 'collector.bernardo', 'bernardo.casquejo@bangbang-cordova.gov.ph', 'Bernardo Casquejo', 'collector', null, null, '0919-333-1002'],
    ['usr-col-3', 'collector.eduardo', 'eduardo.berdin@bangbang-cordova.gov.ph', 'Eduardo Berdin', 'collector', null, null, '0920-333-1003'],
    ['usr-ldr-1', 'leader.rolando', 'rolando.cabigas@bangbang-cordova.gov.ph', 'Rolando Cabigas', 'leader', 'pur-1', null, '0921-444-2001'],
    ['usr-ldr-2', 'leader.marilou', 'marilou.dinopol@bangbang-cordova.gov.ph', 'Marilou Dinopol', 'leader', 'pur-2', null, '0922-444-2002'],
    ['usr-ldr-3', 'leader.crispin', 'crispin.ando@bangbang-cordova.gov.ph', 'Crispin Ando', 'leader', 'pur-3', null, '0923-444-2003'],
    ['usr-ldr-4', 'leader.gemma', 'gemma.jumaoas@bangbang-cordova.gov.ph', 'Gemma Jumao-as', 'leader', 'pur-4', null, '0924-444-2004'],
    ['usr-res-1', 'resident.maria', 'maria.deatras@example.com', 'Maria Clara Deatras', 'resident', 'pur-1', 'hh-1', '0917-555-0101'],
    ['usr-res-2', 'resident.juan', 'juan.delacruz@example.com', 'Juan Dela Cruz', 'resident', 'pur-2', 'hh-3', '0920-555-0201'],
    ['usr-res-3', 'resident.elena', 'elena.ramos@example.com', 'Elena Ramos', 'resident', 'pur-3', 'hh-5', '0923-555-0301'],
    ['usr-res-4', 'resident.pedro', 'pedro.alcantara@example.com', 'Pedro Alcantara', 'resident', 'pur-1', 'hh-2', '0918-555-0102'],
  ];
  for (const [id, username, email, name, role, purok, household, phone] of users) {
    await execute(
      `INSERT INTO users (id, username, email, email_verified_at, password_hash, full_name, role, purok_id, household_id, contact_number, status)
       VALUES (?, ?, ?, UTC_TIMESTAMP(), ?, ?, ?, ?, ?, ?, 'active')`,
      [id, username, email, hash, name, role, purok, household, phone],
      conn,
    );
  }
  // A pending self-registration so the leader approval flow can be demonstrated.
  await execute(
    `INSERT INTO households (id, household_number, purok_id, head_name, contact_number, address_details, family_member_count, latitude, longitude, qr_token)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ['hh-10', 'HH-MAN-003', 'pur-1', 'Josefa Tumulak', '0915-555-0103', 'Fish Port Road, Purok Mangga, Bang-Bang', 3, 10.2608, 123.9474, randomToken(18)],
    conn,
  );
  await execute(
    `INSERT INTO users (id, username, email, password_hash, full_name, role, purok_id, household_id, contact_number, status)
     VALUES ('usr-res-5', 'resident.josefa', 'josefa.tumulak@example.com', ?, 'Josefa Tumulak', 'resident', 'pur-1', 'hh-10', '0915-555-0103', 'pending')`,
    [hash],
    conn,
  );
  for (const [purok, leader] of [['pur-1', 'usr-ldr-1'], ['pur-2', 'usr-ldr-2'], ['pur-3', 'usr-ldr-3'], ['pur-4', 'usr-ldr-4']]) {
    await execute('UPDATE puroks SET leader_id = ? WHERE id = ?', [leader, purok], conn);
  }

  const schedules: [string, string, string, string, string, string, string, string][] = [
    ['sch-1', 'pur-1', 'usr-col-1', today, '06:00 AM - 09:00 AM', 'Biodegradable', 'In Progress', 'Priority collection of organic kitchen and garden waste along Sitio Seaside road'],
    ['sch-2', 'pur-2', 'usr-col-2', today, '09:30 AM - 12:00 PM', 'Non-Biodegradable', 'Scheduled', 'Residual plastics, styrofoam, and dry non-recyclable domestic items'],
    ['sch-3', 'pur-3', 'usr-col-1', tomorrow, '06:00 AM - 09:00 AM', 'Recyclable', 'Scheduled', 'Corrugated cartons, clean PET bottles, beverage aluminum cans'],
    ['sch-4', 'pur-4', 'usr-col-3', tomorrow, '02:00 PM - 05:00 PM', 'Biodegradable', 'Scheduled', 'Commercial sector and bakery lane green waste'],
    ['sch-5', 'pur-1', 'usr-col-1', threeDaysAgo, '06:00 AM - 08:30 AM', 'Recyclable', 'Completed', 'All resident bins gathered and delivered to the MRF.'],
    ['sch-6', 'pur-1', 'usr-col-1', today, '01:00 PM - 03:00 PM', 'Recyclable', 'Scheduled', 'Afternoon recyclables pick-up for Purok Mangga'],
    ['sch-7', 'pur-5', 'usr-col-3', addDays(today, 2), '07:00 AM - 10:00 AM', 'Biodegradable', 'Scheduled', ''],
  ];
  for (const s of schedules) {
    await execute(
      `INSERT INTO collection_schedules (id, purok_id, collector_id, scheduled_date, time_slot, waste_type, status, notes, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'usr-admin')`,
      s,
      conn,
    );
  }
  await execute(
    `INSERT INTO collection_records (id, schedule_id, collector_id, started_at, completed_at, status, truck_number, collected_volume_kg, collector_notes) VALUES
     ('rec-1', 'sch-1', 'usr-col-1', ?, NULL, 'In Progress', 'LGU-BangBang-01', 145.5, 'Started at Sitio Seaside; proceeding toward chapel street.'),
     ('rec-5', 'sch-5', 'usr-col-1', ?, ?, 'Completed', 'LGU-BangBang-01', 280.0, 'Purok Mangga residents compliant. Fully sorted materials.')`,
    [hoursAgo(1), hoursAgo(72), hoursAgo(70)],
    conn,
  );

  await execute(
    `INSERT INTO disposal_submissions (id, schedule_id, resident_id, household_id, purok_id, waste_type, bag_count, notes, submission_timestamp,
                                       verification_status, verified_by, verification_remarks, verified_at) VALUES
     ('dsp-1', 'sch-1', 'usr-res-1', 'hh-1', 'pur-1', 'Biodegradable', 2, 'Two sacks of kitchen waste by our main gate bin.', ?, 'Pending', NULL, NULL, NULL),
     ('dsp-2', 'sch-1', 'usr-res-4', 'hh-2', 'pur-1', 'Biodegradable', 1, 'Garden clippings and coconut husks.', ?, 'Pending', NULL, NULL, NULL),
     ('dsp-5', 'sch-5', 'usr-res-1', 'hh-1', 'pur-1', 'Recyclable', 3, 'Cardboard boxes and plastic bottles cleanly bound.', ?, 'Verified', 'usr-ldr-1', 'On-site inspection completed at Sitio Seaside.', ?)`,
    [hoursAgo(0.7), hoursAgo(0.4), hoursAgo(72), hoursAgo(71)],
    conn,
  );

  await execute(
    `INSERT INTO payment_submissions (id, payment_code, resident_id, household_id, purok_id, period_start, period_end, amount, payment_method, reference_number,
                                      status, reviewed_by_leader_id, reviewed_at, created_at) VALUES
     ('pay-1', ?, 'usr-res-1', 'hh-1', 'pur-1', ?, ?, 5.00, 'GCash', '9921402831004', 'Pending', NULL, NULL, ?),
     ('pay-2', ?, 'usr-res-2', 'hh-3', 'pur-2', ?, ?, 5.00, 'Cash to Leader', 'CASH-P2-01', 'Pending', NULL, NULL, ?),
     ('pay-3', ?, 'usr-res-1', 'hh-1', 'pur-1', ?, ?, 5.00, 'GCash', '9883120194002', 'Verified', 'usr-ldr-1', ?, ?)`,
    [newPaymentCode(), thisWeek, addDays(thisWeek, 6), hoursAgo(2), newPaymentCode(), thisWeek, addDays(thisWeek, 6), hoursAgo(4), newPaymentCode(), lastWeek, addDays(lastWeek, 6), hoursAgo(150), hoursAgo(160)],
    conn,
  );

  // Field scan by the collector on today's Mangga run + a short GPS trail of the truck.
  const [mLat, mLng] = PUROK_COORDS['pur-1'];
  await execute(
    `INSERT INTO collection_scans (id, scan_type, schedule_id, household_id, purok_id, scanned_by, bag_count, latitude, longitude, notes, created_at)
     VALUES ('scn-1', 'Disposal', 'sch-1', 'hh-2', 'pur-1', 'usr-col-1', 2, ?, ?, 'Segregated bags picked up at the gate.', ?)`,
    [mLat - 0.0003, mLng + 0.0004, hoursAgo(0.5)],
    conn,
  );
  for (let i = 0; i < 8; i++) {
    await execute(
      'INSERT INTO collector_locations (collector_id, schedule_id, latitude, longitude, accuracy_m, recorded_at) VALUES (?, ?, ?, ?, ?, ?)',
      ['usr-col-1', 'sch-1', mLat - 0.0012 + i * 0.00016, mLng - 0.001 + i * 0.00017, 12, hoursAgo(1 - i * 0.12)],
      conn,
    );
  }

  const year = new Date().getUTCFullYear();
  await execute(
    `INSERT INTO endorsement_requests (id, resident_id, purok_id, leader_id, purpose, details, status, remarks, certificate_code, issued_at, created_at) VALUES
     ('end-1', 'usr-res-1', 'pur-1', 'usr-ldr-1', 'Barangay Clearance Endorsement', 'Needed for a student scholarship application in Cordova LGU.', 'Pending', NULL, NULL, NULL, ?),
     ('end-2', 'usr-res-4', 'pur-1', 'usr-ldr-1', 'Waste Compliance Certificate', 'Proof of household waste segregation compliance.', 'Approved',
      'Resident is compliant with the Barangay Bang-Bang Solid Waste Ordinance.', ?, ?, ?)`,
    [hoursAgo(5), `BB-END-${year}-00001`, hoursAgo(48), hoursAgo(50)],
    conn,
  );

  await execute(
    `INSERT INTO announcements (id, title, content, category, priority, created_by, created_at) VALUES
     ('ann-1', 'Strict Segregation Compliance Ordinance No. 2026-04',
      'Pahibalo sa tanang residente sa Barangay Bang-Bang: gipatuman na ang "No Segregation, No Collection" policy. Palihug ibulag ang malata (Biodegradable), dili malata (Non-Biodegradable), ug ma-recycle, subay sa Republic Act 9003.',
      'Policy Advisory', 'Important', 'usr-admin', ?),
     ('ann-2', 'Schedule Adjustment for Coastal Puroks (Mangga & Malinawon)',
      'Due to tidal conditions this week, morning collection along Sitio Seaside, Purok Mangga starts at 6:00 AM sharp so the truck can pass before high tide.',
      'Schedule Update', 'Normal', 'usr-admin', ?),
     ('ann-3', 'Weekly ₱5.00 Solid Waste Contribution',
      'Gipahinumdoman ang matag household sa pagbayad sa semanal nga ₱5.00 contribution alang sa fuel sa truck ug sa mga purok sweepers. Pwede mobayad pinaagi sa GCash o direkta sa inyong Purok Leader.',
      'Community Advisory', 'Normal', 'usr-admin', ?)`,
    [hoursAgo(24), hoursAgo(48), hoursAgo(72)],
    conn,
  );

  await execute(
    `INSERT INTO notifications (id, user_id, title, message, type, link, is_read, created_at) VALUES
     ('ntf-1', 'usr-res-1', 'Collection Truck On The Way', 'Biodegradable collection has started in Purok Mangga. Please bring out your segregated waste.', 'schedule', 'schedules', 0, ?),
     ('ntf-2', 'usr-ldr-1', 'Disposal Verification Needed', 'Maria Clara Deatras logged 2 bag(s) for today''s collection.', 'disposal', 'disposal-verification', 0, ?),
     ('ntf-3', 'usr-ldr-1', 'New Resident Registration', 'Josefa Tumulak registered in Purok Mangga (HH-MAN-003) and is waiting for approval.', 'system', 'registrations', 0, ?),
     ('ntf-4', 'usr-res-4', 'Endorsement Approved', 'Your Waste Compliance Certificate request was approved by Purok Leader Rolando Cabigas.', 'endorsement', 'endorsements', 1, ?)`,
    [hoursAgo(1), hoursAgo(0.7), hoursAgo(3), hoursAgo(48)],
    conn,
  );

  await execute(
    `INSERT INTO activity_logs (id, user_id, action, module, details, ip_address, created_at) VALUES
     ('act-seed-1', 'usr-admin', 'SEED', 'System', 'Demo data loaded for Barangay Bang-Bang.', '127.0.0.1', ?)`,
    [new Date()],
    conn,
  );
  console.log(`✔ Demo data loaded. All demo accounts use the SEED_PASSWORD from your .env file.`);
}

export async function seed(opts: { demo: boolean }) {
  await withTransaction(async (conn) => {
    await seedBase(conn);
    if (opts.demo) await seedDemo(conn);
    else await seedFirstAdmin(conn);
  });
}

const isDirectRun = process.argv[1] && path.resolve(process.argv[1]).includes(path.join('src', 'db', 'seed'));
if (isDirectRun) {
  const args = process.argv.slice(2);
  const demo = args.includes('--demo');
  const reset = args.includes('--reset');
  (async () => {
    if (reset) {
      if (env.isProduction) throw new Error('db:reset is disabled in production.');
      console.log(`Resetting database "${env.db.database}" ...`);
      await dropAllTables();
    }
    await runMigrations();
    await seed({ demo: demo || reset });
    console.log('✔ Seeding finished.');
  })()
    .then(() => closePool())
    .then(() => process.exit(0))
    .catch(async (err) => {
      console.error('✖ Seeding failed:', friendlyDbError(err));
      await closePool();
      process.exit(1);
    });
}
