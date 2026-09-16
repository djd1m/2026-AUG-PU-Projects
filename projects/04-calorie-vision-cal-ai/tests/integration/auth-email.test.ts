// OWN-012: вход по почте и паролю в PWA, приглашение партнёра, владелец по почте.

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { DbPool } from '@n4/db';
import { createLogger } from '@n4/shared';
import { buildServer } from '../../apps/api/src/server.js';
import { createFakePaymentProvider } from '../../apps/api/src/payments/fake.js';
import { SESSION_COOKIE_NAME } from '../../apps/api/src/session/create-device-session.js';
import { migratedPool, truncateAll } from '../helpers/db.js';
import { testScanApiConfig } from '../helpers/scan-config.js';

const OWNER_EMAIL = 'owner@example.com';
let pool: DbPool;
let app: FastifyInstance;

beforeAll(async () => {
  pool = await migratedPool('n4-tests-auth-email');
  app = buildServer({
    config: testScanApiConfig(),
    pool,
    logger: createLogger({ service: 'api-test', sink: () => {} }),
    payments: createFakePaymentProvider(),
    ownerEmails: [OWNER_EMAIL],
  });
  await app.ready();
}, 60_000);

afterAll(async () => {
  await app.close();
  await pool.end();
});

beforeEach(async () => {
  await truncateAll(pool);
});

function cookieOf(response: { headers: Record<string, unknown> }): string | undefined {
  const raw = response.headers['set-cookie'];
  const line = Array.isArray(raw) ? raw[0] : raw;
  if (typeof line !== 'string') return undefined;
  const m = new RegExp(`${SESSION_COOKIE_NAME}=([^;]+)`).exec(line);
  return m?.[1];
}

async function register(email: string, password: string, cookie?: string) {
  return app.inject({ method: 'POST', url: '/api/v1/auth/register', payload: { email, password }, cookies: cookie ? { [SESSION_COOKIE_NAME]: cookie } : {} });
}
async function login(email: string, password: string, cookie?: string) {
  return app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { email, password }, cookies: cookie ? { [SESSION_COOKIE_NAME]: cookie } : {} });
}
async function me(cookie: string) {
  return JSON.parse((await app.inject({ method: 'GET', url: '/api/v1/auth/me', cookies: { [SESSION_COOKIE_NAME]: cookie } })).body).data;
}

describe('регистрация и вход по почте', () => {
  it('регистрация без сессии — 201, выдаёт cookie, /me видит аккаунт', async () => {
    const r = await register('Alice@Example.com', 'strong-password');
    expect(r.statusCode).toBe(201);
    const cookie = cookieOf(r);
    expect(cookie).toBeDefined();
    const who = await me(cookie!);
    expect(who).toMatchObject({ authenticated: true, email: 'alice@example.com', partner: false, owner: false, telegram_linked: false });
  });

  it('повторная регистрация той же почтой (в другом регистре) — 409 email_taken', async () => {
    expect((await register('alice@example.com', 'strong-password')).statusCode).toBe(201);
    const r = await register('ALICE@example.com', 'another-password');
    expect(r.statusCode).toBe(409);
    expect(JSON.parse(r.body).error.code).toBe('email_taken');
  });

  it('плохая почта и короткий пароль — 422 с названным полем', async () => {
    expect(JSON.parse((await register('not-an-email', 'strong-password')).body).error.code).toBe('invalid_email');
    expect(JSON.parse((await register('bob@example.com', 'short')).body).error.code).toBe('invalid_password');
  });

  it('вход: верный пароль — 200; неверный пароль и несуществующая почта — ОДИН И ТОТ ЖЕ 401', async () => {
    await register('bob@example.com', 'strong-password');
    expect((await login('bob@example.com', 'strong-password')).statusCode).toBe(200);
    const wrong = await login('bob@example.com', 'wrong-password');
    const nobody = await login('nobody@example.com', 'strong-password');
    expect(wrong.statusCode).toBe(401);
    expect(nobody.statusCode).toBe(401);
    expect(JSON.parse(wrong.body).error.code).toBe(JSON.parse(nobody.body).error.code);
  });

  it('вход СВЯЗЫВАЕТ анонимную сессию: дневник переезжает на аккаунт', async () => {
    // анонимная сессия с записью дневника
    const anon = await app.inject({ method: 'POST', url: '/api/v1/auth/device' });
    const cookie = cookieOf(anon)!;
    const sessionId = (await pool.query<{ id: string }>(`SELECT id FROM device_session`)).rows[0]!.id;
    const photo = await pool.query<{ id: string }>(
      `INSERT INTO photo (device_session_id, object_key, mime, bytes, width, height, expires_on, file_state) VALUES ($1, 'k', 'image/jpeg', 1, 320, 320, now()::date, 'present') RETURNING id`,
      [sessionId],
    );
    const rec = await pool.query<{ id: string }>(
      `INSERT INTO recognition (device_session_id, photo_id, status, items, idempotency_key) VALUES ($1, $2, 'done', '[]', gen_random_uuid()) RETURNING id`,
      [sessionId, photo.rows[0]!.id],
    );
    await pool.query(
      `INSERT INTO diary_entry (owner_key, recognition_id, eaten_on, meal_slot, items, source_snapshot, kcal_total, protein_total, fat_total, carb_total)
       VALUES ($1, $2, current_date, 'lunch', '[]', '{}', 100, 1, 1, 1)`,
      [sessionId, rec.rows[0]!.id],
    );
    await register('carol@example.com', 'strong-password');
    const r = await login('carol@example.com', 'strong-password', cookie);
    expect(r.statusCode).toBe(200);
    expect(JSON.parse(r.body).data.diary_migrated).toBe(1);
    const accountId = (await pool.query<{ id: string }>(`SELECT id FROM account WHERE email = 'carol@example.com'`)).rows[0]!.id;
    expect((await pool.query(`SELECT 1 FROM diary_entry WHERE owner_key = $1`, [accountId])).rows).toHaveLength(1);
    expect((await pool.query(`SELECT 1 FROM recognition WHERE account_id = $1`, [accountId])).rows).toHaveLength(1);
  });

  it('выход отвязывает сессию: /me снова анонимен, аккаунт остаётся', async () => {
    const r = await register('dave@example.com', 'strong-password');
    const cookie = cookieOf(r)!;
    expect((await app.inject({ method: 'POST', url: '/api/v1/auth/logout', cookies: { [SESSION_COOKIE_NAME]: cookie } })).statusCode).toBe(200);
    expect((await me(cookie)).authenticated).toBe(false);
    expect((await pool.query(`SELECT 1 FROM account WHERE email = 'dave@example.com'`)).rows).toHaveLength(1);
  });

  it('владелец по почте: /me.owner = true и кабинет владельца открыт; для другой почты — 404', async () => {
    const owner = cookieOf(await register(OWNER_EMAIL, 'strong-password'))!;
    expect((await me(owner)).owner).toBe(true);
    expect((await app.inject({ method: 'GET', url: '/api/v1/admin/overview', cookies: { [SESSION_COOKIE_NAME]: owner } })).statusCode).toBe(200);
    const other = cookieOf(await register('eve@example.com', 'strong-password'))!;
    expect((await app.inject({ method: 'GET', url: '/api/v1/admin/overview', cookies: { [SESSION_COOKIE_NAME]: other } })).statusCode).toBe(404);
  });
});

describe('приглашение партнёра', () => {
  async function seedPartner(): Promise<string> {
    return (await pool.query<{ id: string }>(`INSERT INTO partner (display_name, contact) VALUES ('Блогер', '@blogger') RETURNING id`)).rows[0]!.id;
  }

  it('владелец создаёт приглашение → ссылка на APP_ORIGIN; предпросмотр отдаёт имя партнёра', async () => {
    const owner = cookieOf(await register(OWNER_EMAIL, 'strong-password'))!;
    const partnerId = await seedPartner();
    const r = await app.inject({ method: 'POST', url: `/api/v1/admin/partners/${partnerId}/invites`, cookies: { [SESSION_COOKIE_NAME]: owner } });
    expect(r.statusCode).toBe(201);
    const url: string = JSON.parse(r.body).data.url;
    expect(url.startsWith('https://tarelka.test/invite/')).toBe(true);
    const token = url.split('/invite/')[1]!;
    const preview = await app.inject({ method: 'GET', url: `/api/v1/partner/invites/${token}` });
    expect(preview.statusCode).toBe(200);
    expect(JSON.parse(preview.body).data.partner_display_name).toBe('Блогер');
    // в базе — только хеш
    expect((await pool.query(`SELECT 1 FROM partner_invite WHERE token_hash = $1`, [token])).rows).toHaveLength(0);
  });

  it('не владелец создать приглашение не может — 404', async () => {
    const someone = cookieOf(await register('x@example.com', 'strong-password'))!;
    const partnerId = await seedPartner();
    expect((await app.inject({ method: 'POST', url: `/api/v1/admin/partners/${partnerId}/invites`, cookies: { [SESSION_COOKIE_NAME]: someone } })).statusCode).toBe(404);
  });

  it('вошедший принимает приглашение → стал партнёром, кабинет открыт; второй раз — 410; чужой — 409', async () => {
    const owner = cookieOf(await register(OWNER_EMAIL, 'strong-password'))!;
    const partnerId = await seedPartner();
    const url: string = JSON.parse((await app.inject({ method: 'POST', url: `/api/v1/admin/partners/${partnerId}/invites`, cookies: { [SESSION_COOKIE_NAME]: owner } })).body).data.url;
    const token = url.split('/invite/')[1]!;

    const blogger = cookieOf(await register('blogger@example.com', 'strong-password'))!;
    expect((await me(blogger)).partner).toBe(false);
    const enroll = await app.inject({ method: 'POST', url: '/api/v1/partner/enroll', payload: { token }, cookies: { [SESSION_COOKIE_NAME]: blogger } });
    expect(enroll.statusCode).toBe(200);
    expect((await me(blogger)).partner).toBe(true);
    expect((await app.inject({ method: 'GET', url: '/api/v1/partner/earnings', cookies: { [SESSION_COOKIE_NAME]: blogger } })).statusCode).toBe(200);

    // повтор той же ссылки — уже использована
    const again = await app.inject({ method: 'POST', url: '/api/v1/partner/enroll', payload: { token }, cookies: { [SESSION_COOKIE_NAME]: blogger } });
    expect(again.statusCode).toBe(410);
    // без входа — 401
    expect((await app.inject({ method: 'POST', url: '/api/v1/partner/enroll', payload: { token } })).statusCode).toBe(401);
  });
});
