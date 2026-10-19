import { afterAll, describe, expect, it } from 'vitest';
import { app, api, login, PASSWORD } from './helpers';
import request from 'supertest';
import { closePool, execute } from '../src/db/pool';
import { sha256 } from '../src/utils/ids';
import { testOutbox } from '../src/utils/mailer';

afterAll(async () => {
  await closePool();
});

describe('authentication', () => {
  it('rejects the old forged "Bearer usr-admin" token', async () => {
    const res = await api.get('/api/auth/me', 'usr-admin');
    expect(res.status).toBe(401);
  });

  it('has no master password', async () => {
    const res = await api.post('/api/auth/login', { identifier: 'captain.degamo', password: 'Password123!' });
    expect(res.status).toBe(401);
  });

  it('logs in with username or email and never returns the password hash', async () => {
    const res = await api.post('/api/auth/login', { identifier: 'CAPTAIN@bangbang-cordova.gov.ph', password: PASSWORD });
    expect(res.status).toBe(200);
    expect(res.body.token).toMatch(/^[A-Za-z0-9_-]{40,}$/);
    expect(res.body.user.role).toBe('admin');
    expect(JSON.stringify(res.body)).not.toContain('password_hash');
  });

  it('blocks pending accounts until the leader approves them', async () => {
    const res = await api.post('/api/auth/login', { identifier: 'resident.josefa', password: PASSWORD });
    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/waiting for approval/i);
  });

  it('logout revokes the session token', async () => {
    const token = await login('resident.elena');
    expect((await api.get('/api/auth/me', token)).status).toBe(200);
    expect((await api.post('/api/auth/logout', {}, token)).status).toBe(200);
    expect((await api.get('/api/auth/me', token)).status).toBe(401);
  });

  it('registration needs the emailed OTP before the pending resident + household are created', async () => {
    testOutbox.length = 0;
    const reg = await api.post('/api/auth/register', {
      full_name: 'Test Registrant',
      username: 'test.registrant',
      email: 'registrant@example.com',
      password: 'Register2026',
      contact_number: '0917-111-2222',
      purok_id: 'pur-2',
      address_details: 'Near the plaza',
      family_member_count: 3,
    });
    expect(reg.status).toBe(202);
    expect(reg.body.require_verification).toBe(true);
    expect(reg.body.email).toBe('re******@example.com');
    expect(JSON.stringify(reg.body)).not.toMatch(/\b\d{6}\b/); // the code is never sent to the browser
    // Not a user yet
    expect((await api.post('/api/auth/login', { identifier: 'test.registrant', password: 'Register2026' })).status).toBe(401);

    const mail = testOutbox.find((m) => m.to === 'registrant@example.com');
    expect(mail).toBeTruthy();
    const code = /(\d{6})/.exec(mail!.subject)![1];

    const wrong = await api.post('/api/auth/register/verify', { verification_id: reg.body.verification_id, code: code === '000000' ? '111111' : '000000' });
    expect(wrong.status).toBe(400);
    expect(wrong.body.error).toMatch(/4 attempt/);

    const resendTooSoon = await api.post('/api/auth/register/resend', { verification_id: reg.body.verification_id });
    expect(resendTooSoon.status).toBe(429);

    const ok = await api.post('/api/auth/register/verify', { verification_id: reg.body.verification_id, code });
    expect(ok.status).toBe(201);
    expect(ok.body.require_approval).toBe(true);
    // The code cannot be used twice
    expect((await api.post('/api/auth/register/verify', { verification_id: reg.body.verification_id, code })).status).toBe(400);

    // Wrong leader (other purok) cannot see or approve it
    const otherLeader = await login('leader.rolando');
    expect((await api.post(`/api/users/${ok.body.user_id}/approve`, {}, otherLeader)).status).toBe(404);

    const leader = await login('leader.marilou');
    const pending = await api.get('/api/users?status=pending', leader);
    expect(pending.body.map((u: { id: string }) => u.id)).toContain(ok.body.user_id);
    expect((await api.post(`/api/users/${ok.body.user_id}/approve`, {}, leader)).status).toBe(200);

    const token = await login('test.registrant', 'Register2026');
    const me = await api.get('/api/auth/me', token);
    expect(me.body.purok_id).toBe('pur-2');
    expect(me.body.household_number).toMatch(/^HH-NAN-\d{3}$/);
  });

  it('locks an OTP after 5 wrong codes', async () => {
    testOutbox.length = 0;
    const reg = await api.post('/api/auth/register', {
      full_name: 'Locked Out', username: 'locked.out', email: 'locked@example.com', password: 'Locked2026', purok_id: 'pur-1',
    });
    expect(reg.status).toBe(202);
    const code = /(\d{6})/.exec(testOutbox[0].subject)![1];
    const bad = code === '999999' ? '888888' : '999999';
    for (let i = 0; i < 5; i++) await api.post('/api/auth/register/verify', { verification_id: reg.body.verification_id, code: bad });
    const after = await api.post('/api/auth/register/verify', { verification_id: reg.body.verification_id, code });
    expect(after.status).toBe(400);
    expect(after.body.error).toMatch(/too many/i);
  });

  it('rejects weak passwords and duplicate usernames on registration', async () => {
    const weak = await api.post('/api/auth/register', { full_name: 'X', username: 'weak.user', email: 'weak@example.com', password: 'short', purok_id: 'pur-1' });
    expect(weak.status).toBe(400);
    const dup = await api.post('/api/auth/register', { full_name: 'X', username: 'resident.maria', email: 'new@example.com', password: 'Good2026pass', purok_id: 'pur-1' });
    expect(dup.status).toBe(409);
  });

  it('forgot-password never reveals whether an account exists', async () => {
    const known = await api.post('/api/auth/forgot-password', { identifier: 'resident.pedro' });
    const unknown = await api.post('/api/auth/forgot-password', { identifier: 'nobody.here' });
    expect(known.status).toBe(200);
    expect(unknown.body.message).toBe(known.body.message);
    expect(known.body).not.toHaveProperty('demo_code');
  });

  it('resets a password with a valid one-time code only', async () => {
    await api.post('/api/auth/forgot-password', { identifier: 'resident.pedro' });
    // The real code was "emailed"; plant a known code for the test.
    await execute(
      "UPDATE password_reset_codes SET code_hash = ? WHERE user_id = 'usr-res-4' AND used_at IS NULL",
      [sha256('usr-res-4:654321')],
    );
    const wrong = await api.post('/api/auth/reset-password', { identifier: 'resident.pedro', code: '123456', new_password: 'NewPedro2026' });
    expect(wrong.status).toBe(400);
    const ok = await api.post('/api/auth/reset-password', { identifier: 'resident.pedro', code: '654321', new_password: 'NewPedro2026' });
    expect(ok.status).toBe(200);
    const reuse = await api.post('/api/auth/reset-password', { identifier: 'resident.pedro', code: '654321', new_password: 'Another2026' });
    expect(reuse.status).toBe(400);
    await login('resident.pedro', 'NewPedro2026');
  });

  it('profile: users can change their own password but must know the current one', async () => {
    const token = await login('collector.eduardo');
    const bad = await api.post('/api/profile/password', { current_password: 'wrong-one1', new_password: 'Eduardo2026' }, token);
    expect(bad.status).toBe(400);
    const ok = await api.post('/api/profile/password', { current_password: PASSWORD, new_password: 'Eduardo2026' }, token);
    expect(ok.status).toBe(200);
    await login('collector.eduardo', 'Eduardo2026');
  });

  it('API responses are not cacheable', async () => {
    const res = await request(app).get('/api/health');
    expect(res.headers['cache-control']).toBe('no-store');
  });
});
