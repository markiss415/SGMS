import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { api, login } from './helpers';
import { closePool, queryOne } from '../src/db/pool';

let admin: string, collector: string, otherCollector: string, leader: string, leader2: string, resident: string, resident2: string;

beforeAll(async () => {
  [admin, collector, otherCollector, leader, leader2, resident, resident2] = await Promise.all([
    login('captain.degamo'),
    login('collector.danilo'),
    login('collector.bernardo'),
    login('leader.rolando'), // Purok Mangga (pur-1)
    login('leader.marilou'), // Purok Nangka (pur-2)
    login('resident.maria'), // pur-1, hh-1
    login('resident.juan'), // pur-2, hh-3
  ]);
});

afterAll(async () => {
  await closePool();
});

describe('role permissions', () => {
  it('every private endpoint requires sign-in', async () => {
    for (const url of ['/api/schedules', '/api/households', '/api/users', '/api/payments', '/api/disposal/submissions', '/api/endorsements', '/api/notifications', '/api/activity-logs', '/api/reports/dashboard-stats', '/api/announcements']) {
      expect((await api.get(url)).status, url).toBe(401);
    }
  });

  it('only the admin can see reports, activity logs and change settings', async () => {
    for (const t of [collector, leader, resident]) {
      expect((await api.get('/api/reports/dashboard-stats', t)).status).toBe(403);
      expect((await api.get('/api/activity-logs', t)).status).toBe(403);
      expect((await api.put('/api/settings', { weekly_contribution_fee: '1' }, t)).status).toBe(403);
      expect((await api.get('/api/reports/export-csv?type=payments', t)).status).toBe(403);
    }
    expect((await api.get('/api/reports/dashboard-stats', admin)).status).toBe(200);
  });

  it('settings reject unknown keys and invalid fees', async () => {
    expect((await api.put('/api/settings', { weekly_contribution_fee: '-5' }, admin)).status).toBe(400);
    expect((await api.put('/api/settings', { is_admin: 'yes' }, admin)).status).toBe(400);
  });

  it('a leader only sees their own purok, even if they ask for another', async () => {
    const hh = await api.get('/api/households?purok_id=pur-2', leader);
    expect(hh.status).toBe(200);
    expect(hh.body.length).toBeGreaterThan(0);
    expect(hh.body.every((h: { purok_id: string }) => h.purok_id === 'pur-1')).toBe(true);
    const users = await api.get('/api/users', leader);
    expect(users.body.every((u: { purok_id: string }) => u.purok_id === 'pur-1')).toBe(true);
    const pays = await api.get('/api/payments', leader);
    expect(pays.body.every((p: { purok_id: string }) => p.purok_id === 'pur-1')).toBe(true);
  });

  it('a resident only sees their own household records', async () => {
    const pays = await api.get('/api/payments', resident);
    expect(pays.body.length).toBeGreaterThan(0);
    expect(pays.body.every((p: { household_id: string }) => p.household_id === 'hh-1')).toBe(true);
    const subs = await api.get('/api/disposal/submissions', resident2);
    expect(subs.body.every((s: { household_id: string }) => s.household_id === 'hh-3')).toBe(true);
    expect((await api.get('/api/users', resident)).status).toBe(403);
    const sched = await api.get('/api/schedules', resident);
    expect(sched.body.every((s: { purok_id: string }) => s.purok_id === 'pur-1')).toBe(true);
    expect(sched.body.every((s: { collector_contact: string }) => s.collector_contact === '')).toBe(true);
  });

  it('collectors see only their own assigned schedules and have no household access', async () => {
    const res = await api.get('/api/schedules', collector);
    expect(res.body.length).toBeGreaterThan(0);
    expect(res.body.every((s: { collector_id: string }) => s.collector_id === 'usr-col-1')).toBe(true);
    expect((await api.get('/api/households', collector)).status).toBe(403);
  });

  it('only the admin manages users and schedules', async () => {
    const body = { full_name: 'X', username: 'hacker.x', email: 'x@example.com', password: 'Hacker2026', role: 'admin' };
    expect((await api.post('/api/users', body, leader)).status).toBe(403);
    expect((await api.put('/api/users/usr-res-1', { role: 'admin' }, leader)).status).toBe(403);
    expect((await api.post('/api/schedules', {}, collector)).status).toBe(403);
    expect((await api.del('/api/schedules/sch-2', leader)).status).toBe(403);
  });

  it('the admin cannot demote or deactivate themselves', async () => {
    expect((await api.put('/api/users/usr-admin', { role: 'resident' }, admin)).status).toBe(400);
    expect((await api.put('/api/users/usr-admin', { status: 'inactive' }, admin)).status).toBe(400);
  });

  it('a purok can only have one active leader', async () => {
    const res = await api.post('/api/users', { full_name: 'Second Leader', username: 'second.leader', email: 'second@example.com', password: 'Leader2026x', role: 'leader', purok_id: 'pur-1' }, admin);
    expect(res.status).toBe(409);
  });

  it('deactivating a user signs them out immediately', async () => {
    const t = await login('resident.elena');
    expect((await api.put('/api/users/usr-res-3', { status: 'inactive' }, admin)).status).toBe(200);
    expect((await api.get('/api/auth/me', t)).status).toBe(401);
    await api.put('/api/users/usr-res-3', { status: 'active' }, admin);
  });
});

const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

describe('weekly contributions', () => {
  it('uses the fee from settings (not the browser), stays Pending, and blocks a second payment for the same week', async () => {
    await api.put('/api/settings', { weekly_contribution_fee: '7.50' }, admin);
    const res = await api.post('/api/payments/submit', { period_start: '2026-09-02', amount: 1, payment_method: 'GCash', reference_number: '5550001112223', proof_url: PNG }, resident2);
    expect(res.status).toBe(201);
    expect(res.body.amount).toBe(7.5);
    expect(res.body.status).toBe('Pending');
    expect(res.body.period_start).toBe('2026-08-31'); // normalised to Monday
    expect(res.body.period_end).toBe('2026-09-06');
    const dup = await api.post('/api/payments/submit', { period_start: '2026-09-04', payment_method: 'Maya', reference_number: 'A1B2C3D4E5F6', proof_url: PNG }, resident2);
    expect(dup.status).toBe(409);
    await api.put('/api/settings', { weekly_contribution_fee: '5.00' }, admin);
  });

  it('GCash payments need a reference number; cash does not', async () => {
    expect((await api.post('/api/payments/submit', { period_start: '2026-08-17', payment_method: 'GCash' }, resident2)).status).toBe(400);
    const cash = await api.post('/api/payments/submit', { period_start: '2026-08-17', payment_method: 'Cash to Leader' }, resident2);
    expect(cash.status).toBe(201);
    expect(cash.body.reference_number).toBe(cash.body.payment_code); // cash uses the unique BB-PAY code
  });

  it('only the resident’s own purok leader can verify, the admin cannot, and decisions are final', async () => {
    const pay = await queryOne<{ id: string }>("SELECT id FROM payment_submissions WHERE household_id = 'hh-3' AND status = 'Pending' LIMIT 1");
    expect((await api.post('/api/payments/verify', { payment_id: pay!.id, status: 'Verified' }, leader)).status).toBe(404);
    expect((await api.post('/api/payments/verify', { payment_id: pay!.id, status: 'Verified' }, admin)).status).toBe(403);
    expect((await api.post('/api/payments/verify', { payment_id: pay!.id, status: 'Rejected' }, leader2)).status).toBe(400); // reason required
    expect((await api.post('/api/payments/verify', { payment_id: pay!.id, status: 'Verified' }, leader2)).status).toBe(200);
    expect((await api.post('/api/payments/verify', { payment_id: pay!.id, status: 'Rejected', rejection_reason: 'x' }, leader2)).status).toBe(409);
  });

  it('rejects disguised or oversized proof uploads', async () => {
    const fakePng = `data:image/png;base64,${Buffer.from('<script>alert(1)</script>').toString('base64')}`;
    const res = await api.post('/api/payments/submit', { period_start: '2026-08-10', payment_method: 'Cash to Leader', proof_url: fakePng }, resident2);
    expect(res.status).toBe(400);
    const js = await api.post('/api/payments/submit', { period_start: '2026-08-10', payment_method: 'Cash to Leader', proof_url: 'javascript:alert(1)' }, resident2);
    expect(js.status).toBe(400);
  });
});

describe('disposal submissions', () => {
  it('prevents duplicate submissions for the same household and collection', async () => {
    // hh-1 already logged sch-1 in the seed data
    const dup = await api.post('/api/disposal/submit', { schedule_id: 'sch-1', bag_count: 1 }, resident);
    expect(dup.status).toBe(409);
  });

  it('blocks logging for another purok’s schedule and for future collections', async () => {
    expect((await api.post('/api/disposal/submit', { schedule_id: 'sch-2' }, resident)).status).toBe(404); // pur-2 schedule
    expect((await api.post('/api/disposal/submit', { schedule_id: 'sch-3' }, resident)).status).toBe(404); // pur-3
    expect((await api.post('/api/disposal/submit', { schedule_id: 'sch-2', bag_count: 2 }, resident2)).status).toBe(201);
  });

  it('only the purok leader verifies, and a rejected log can be re-submitted', async () => {
    const sub = await queryOne<{ id: string }>("SELECT id FROM disposal_submissions WHERE household_id = 'hh-3' AND schedule_id = 'sch-2'");
    expect((await api.post('/api/disposal/verify', { submission_id: sub!.id, status: 'Verified' }, leader)).status).toBe(404);
    expect((await api.post('/api/disposal/verify', { submission_id: sub!.id, status: 'Rejected', remarks: 'Not segregated' }, leader2)).status).toBe(200);
    expect((await api.post('/api/disposal/submit', { schedule_id: 'sch-2', bag_count: 1, notes: 'Re-sorted' }, resident2)).status).toBe(201);
  });
});

describe('endorsements — the Purok Leader is the final approver', () => {
  it('admin cannot approve; the leader approves once and a certificate code is issued', async () => {
    const req = await api.post('/api/endorsements/request', { purpose: 'Residency Endorsement', details: 'For a job application' }, resident2);
    expect(req.status).toBe(201);
    const id = req.body.id;
    expect((await api.post('/api/endorsements/review', { endorsement_id: id, status: 'Approved' }, admin)).status).toBe(403);
    expect((await api.post('/api/endorsements/review', { endorsement_id: id, status: 'Approved' }, leader)).status).toBe(404);
    const ok = await api.post('/api/endorsements/review', { endorsement_id: id, status: 'Approved' }, leader2);
    expect(ok.status).toBe(200);
    expect(ok.body.certificate_code).toMatch(/^BB-END-\d{4}-\d{5}$/);
    expect((await api.post('/api/endorsements/review', { endorsement_id: id, status: 'Rejected', remarks: 'oops' }, leader2)).status).toBe(409);
    const verify = await api.get(`/api/public/verify-certificate/${ok.body.certificate_code}`);
    expect(verify.status).toBe(200);
    expect(verify.body.resident_name).toBe('Juan Dela Cruz');
    expect(verify.body).not.toHaveProperty('resident_contact');
  });
});

describe('collection workflow', () => {
  it('collectors can only act on their own schedules, in order', async () => {
    expect((await api.post('/api/collections/start', { schedule_id: 'sch-6' }, otherCollector)).status).toBe(404);
    expect((await api.post('/api/collections/complete', { schedule_id: 'sch-6', collected_volume_kg: 10 }, collector)).status).toBe(409);
    expect((await api.post('/api/collections/start', { schedule_id: 'sch-3' }, collector)).status).toBe(400); // tomorrow
    const start = await api.post('/api/collections/start', { schedule_id: 'sch-6', truck_number: 'TRK-7' }, collector);
    expect(start.status).toBe(200);
    expect(start.body.schedule.status).toBe('In Progress');
    expect((await api.post('/api/collections/start', { schedule_id: 'sch-6' }, collector)).status).toBe(409);
    expect((await api.post('/api/collections/complete', { schedule_id: 'sch-6', collected_volume_kg: -1 }, collector)).status).toBe(400);
    const done = await api.post('/api/collections/complete', { schedule_id: 'sch-6', collected_volume_kg: 88.5 }, collector);
    expect(done.status).toBe(200);
    expect(done.body.record.collected_volume_kg).toBe(88.5);
    expect((await api.post('/api/collections/start', {}, admin)).status).toBe(403);
  });

  it('the admin creates schedules, duplicates are blocked, and delete only cancels', async () => {
    const body = { purok_id: 'pur-6', collector_id: 'usr-col-2', scheduled_date: '2030-01-07', time_slot: '06:00 AM - 09:00 AM', waste_type: 'Recyclable' };
    const created = await api.post('/api/schedules', body, admin);
    expect(created.status).toBe(201);
    expect((await api.post('/api/schedules', body, admin)).status).toBe(409);
    expect((await api.post('/api/schedules', { ...body, scheduled_date: '2020-01-01' }, admin)).status).toBe(400);
    expect((await api.post('/api/schedules', { ...body, collector_id: 'usr-res-1', scheduled_date: '2030-01-08' }, admin)).status).toBe(400);
    expect((await api.del(`/api/schedules/${created.body.id}`, admin)).status).toBe(200);
    const row = await queryOne<{ status: string }>('SELECT status FROM collection_schedules WHERE id = ?', [created.body.id]);
    expect(row?.status).toBe('Cancelled');
    // a cancelled slot can be scheduled again
    expect((await api.post('/api/schedules', body, admin)).status).toBe(201);
  });
});

describe('notifications and exports', () => {
  it('users only read and mark their own notifications', async () => {
    const mine = await api.get('/api/notifications', resident2);
    expect(mine.body.every((n: { user_id: string }) => n.user_id === 'usr-res-2')).toBe(true);
    const other = await queryOne<{ id: string; is_read: number }>("SELECT id, is_read FROM notifications WHERE user_id = 'usr-ldr-1' AND is_read = 0 LIMIT 1");
    await api.post(`/api/notifications/${other!.id}/read`, {}, resident2);
    const after = await queryOne<{ is_read: number }>('SELECT is_read FROM notifications WHERE id = ?', [other!.id]);
    expect(after?.is_read).toBe(0);
  });

  it('CSV export escapes spreadsheet formulas', async () => {
    await api.post('/api/households', { head_name: '=HYPERLINK("http://evil")', purok_id: 'pur-1' }, admin);
    const res = await api.get('/api/reports/export-csv?type=households', admin);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/csv');
    expect(res.text).toContain(`"'=HYPERLINK(""http://evil"")"`);
  });

  it('public endpoints expose no personal contact data', async () => {
    const res = await api.get('/api/public/schedules');
    expect(res.status).toBe(200);
    expect(JSON.stringify(res.body)).not.toMatch(/contact|email|09\d\d-/);
    const puroks = await api.get('/api/puroks');
    expect(puroks.body.every((p: { leader_contact: string }) => p.leader_contact === '')).toBe(true);
  });
});
