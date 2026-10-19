import { afterAll, describe, expect, it } from 'vitest';
import { api, login } from './helpers';
import { closePool, queryOne } from '../src/db/pool';

afterAll(async () => {
  await closePool();
});

const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

async function qrOf(householdId: string) {
  const r = await queryOne<{ qr_token: string }>('SELECT qr_token FROM households WHERE id = ?', [householdId]);
  return `BBSGMS:HH:${r!.qr_token}`;
}

describe('QR payments', () => {
  it('residents get the payment channels and a unique payment code', async () => {
    const t = await login('resident.elena');
    const ch = await api.get('/api/payments/channels', t);
    expect(ch.status).toBe(200);
    expect(ch.body.fee).toBeGreaterThan(0);
    const res = await api.post('/api/payments/submit', { period_start: '2026-11-02', payment_method: 'GCash', reference_number: '1234 567 890123', proof_url: PNG }, t);
    expect(res.status).toBe(201);
    expect(res.body.payment_code).toMatch(/^BB-PAY-[A-Z0-9]{4}-[A-Z0-9]{4}$/);
    expect(res.body.reference_number).toBe('1234567890123');
    expect(res.body.status).toBe('Pending');
  });

  it('validates GCash references, requires the screenshot and blocks reused references', async () => {
    const t = await login('resident.juan');
    expect((await api.post('/api/payments/submit', { period_start: '2026-11-09', payment_method: 'GCash', reference_number: '12345', proof_url: PNG }, t)).status).toBe(400);
    expect((await api.post('/api/payments/submit', { period_start: '2026-11-09', payment_method: 'GCash', reference_number: '9999999999999' }, t)).status).toBe(400);
    const reused = await api.post('/api/payments/submit', { period_start: '2026-11-09', payment_method: 'GCash', reference_number: '1234567890123', proof_url: PNG }, t);
    expect(reused.status).toBe(409);
    expect(reused.body.error).toMatch(/reference number was already used/);
  });

  it('residents cannot submit "Cash to Collector" themselves', async () => {
    const t = await login('resident.juan');
    expect((await api.post('/api/payments/submit', { period_start: '2026-11-16', payment_method: 'Cash to Collector' }, t)).status).toBe(400);
  });

  it('settings hide the big QR images but payment channels return them', async () => {
    const admin = await login('captain.degamo');
    expect((await api.put('/api/settings', { gcash_qr_image: PNG }, admin)).status).toBe(200);
    const s = await api.get('/api/settings');
    expect(s.body.has_gcash_qr_image).toBe('true');
    expect(s.body).not.toHaveProperty('gcash_qr_image');
    const t = await login('resident.maria');
    expect((await api.get('/api/payments/channels', t)).body.gcash.qr_image).toBe(PNG);
  });
});

describe('household QR scanning', () => {
  it('collector scans a household on an in-progress run and admin + leader are notified', async () => {
    const col = await login('collector.danilo');
    const code = await qrOf('hh-1');
    const look = await api.post('/api/scan/lookup', { code }, col);
    expect(look.status).toBe(200);
    expect(look.body.household.household_number).toBe('HH-MAN-001');
    const run = look.body.schedules.find((s: { status: string }) => s.status === 'In Progress');
    expect(run).toBeTruthy();

    const scan = await api.post('/api/scan/disposal', { code, schedule_id: run.id, bag_count: 3, latitude: 10.26, longitude: 123.946 }, col);
    expect(scan.status).toBe(201);
    const again = await api.post('/api/scan/disposal', { code, schedule_id: run.id }, col);
    expect(again.status).toBe(409);

    const leader = await login('leader.rolando');
    const lNotes = await api.get('/api/notifications', leader);
    expect(lNotes.body.some((n: { title: string }) => n.title === 'Household Garbage Collected')).toBe(true);
    const admin = await login('captain.degamo');
    const aNotes = await api.get('/api/notifications', admin);
    expect(aNotes.body.some((n: { title: string }) => n.title === 'Household Garbage Collected')).toBe(true);
    const res = await login('resident.maria');
    const rNotes = await api.get('/api/notifications', res);
    expect(rNotes.body.some((n: { title: string }) => n.title === 'Your Garbage Was Collected')).toBe(true);
  });

  it('a collector cannot scan households outside their routes for today', async () => {
    const col = await login('collector.danilo');
    const code = await qrOf('hh-6'); // Purok Sambag — not on Danilo's route today
    expect((await api.post('/api/scan/lookup', { code }, col)).status).toBe(403);
    expect((await api.post('/api/scan/lookup', { code: 'BBSGMS:HH:forged-token' }, col)).status).toBe(404);
    expect((await api.post('/api/scan/lookup', { code: 'hello world' }, col)).status).toBe(400);
  });

  it('collector cash payment stays Pending for the leader; leader cash payment is Verified', async () => {
    const col = await login('collector.danilo');
    const pay = await api.post('/api/scan/payment', { code: await qrOf('hh-2'), period_start: '2026-11-02' }, col);
    expect(pay.status).toBe(201);
    expect(pay.body.status).toBe('Pending');
    const leader = await login('leader.rolando');
    const list = await api.get(`/api/payments?code=${pay.body.payment_code}`, leader);
    expect(list.body[0].payment_method).toBe('Cash to Collector');
    expect(list.body[0].recorded_by_name).toBe('Danilo Enoc');

    const lp = await api.post('/api/scan/payment', { code: 'HH-MAN-002', period_start: '2026-11-09' }, leader);
    expect(lp.status).toBe(201);
    expect(lp.body.status).toBe('Verified');
    // Other purok's leader cannot record it
    const other = await login('leader.marilou');
    expect((await api.post('/api/scan/payment', { code: 'HH-MAN-002' }, other)).status).toBe(403);
    // Residents cannot scan
    const res = await login('resident.maria');
    expect((await api.post('/api/scan/lookup', { code: 'HH-MAN-002' }, res)).status).toBe(403);
  });

  it('regenerating a QR invalidates the old card', async () => {
    const leader = await login('leader.rolando');
    const old = await qrOf('hh-2');
    const r = await api.post('/api/households/hh-2/regenerate-qr', {}, leader);
    expect(r.status).toBe(200);
    expect(r.body.qr_payload).not.toBe(old);
    const col = await login('collector.danilo');
    expect((await api.post('/api/scan/lookup', { code: old }, col)).status).toBe(404);
  });
});

describe('map tracking', () => {
  it('collector GPS pings are stored only for own in-progress runs', async () => {
    const col = await login('collector.danilo');
    expect((await api.post('/api/map/ping', { schedule_id: 'sch-1', latitude: 10.259, longitude: 123.945 }, col)).status).toBe(200);
    const other = await login('collector.bernardo');
    expect((await api.post('/api/map/ping', { schedule_id: 'sch-1', latitude: 10.259, longitude: 123.945 }, other)).status).toBe(404);
  });

  it('map overview is scoped per role', async () => {
    const admin = await login('captain.degamo');
    const a = await api.get('/api/map/overview', admin);
    expect(a.status).toBe(200);
    expect(a.body.puroks.length).toBe(7);
    expect(a.body.routes.some((r: { trail: unknown[] }) => r.trail.length > 0)).toBe(true);

    const leader = await login('leader.marilou');
    const l = await api.get('/api/map/overview', leader);
    expect(l.body.households.every((h: { purok_id: string }) => h.purok_id === 'pur-2')).toBe(true);

    const res = await login('resident.maria');
    const r = await api.get('/api/map/overview', res);
    expect(r.body.households.length).toBe(1);
    expect(r.body.scans).toEqual([]);
    expect(r.body.routes.every((x: { trail: unknown[] }) => x.trail.length === 0)).toBe(true);
  });

  it('a resident can pin their own house location', async () => {
    const res = await login('resident.maria');
    const r = await api.put('/api/households/mine/location', { latitude: 10.2601, longitude: 123.9466 }, res);
    expect(r.status).toBe(200);
    expect(r.body.latitude).toBeCloseTo(10.2601);
  });
});
