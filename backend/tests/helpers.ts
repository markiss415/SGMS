import './testEnv';
import request from 'supertest';
import { createApp } from '../src/app';

export const app = createApp();
export const PASSWORD = 'TestSeed2026';

export async function login(identifier: string, password = PASSWORD): Promise<string> {
  const res = await request(app).post('/api/auth/login').send({ identifier, password });
  if (res.status !== 200) throw new Error(`login ${identifier} failed: ${res.status} ${JSON.stringify(res.body)}`);
  return res.body.token as string;
}

export const api = {
  get: (url: string, token?: string) => {
    const r = request(app).get(url);
    return token ? r.set('Authorization', `Bearer ${token}`) : r;
  },
  post: (url: string, body: object = {}, token?: string) => {
    const r = request(app).post(url).send(body);
    return token ? r.set('Authorization', `Bearer ${token}`) : r;
  },
  put: (url: string, body: object = {}, token?: string) => {
    const r = request(app).put(url).send(body);
    return token ? r.set('Authorization', `Bearer ${token}`) : r;
  },
  del: (url: string, token?: string) => {
    const r = request(app).delete(url);
    return token ? r.set('Authorization', `Bearer ${token}`) : r;
  },
};
