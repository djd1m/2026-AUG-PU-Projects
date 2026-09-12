// Анонимная сессия (AC-foundation-6, AC-foundation-7).

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { DbPool } from '@n4/db';
import { createLogger } from '@n4/shared';
import { buildServer } from '../../apps/api/src/server.js';
import { hashSessionToken, SESSION_COOKIE_NAME } from '../../apps/api/src/session/create-device-session.js';
import { migratedPool, truncateAll } from '../helpers/db.js';
import { testApiConfig } from '../helpers/config.js';

let pool: DbPool;
let app: FastifyInstance;

beforeAll(async () => {
  pool = await migratedPool('n4-tests-session');
  app = buildServer({ config: testApiConfig(), pool, logger: createLogger({ service: 'api-test', sink: () => {} }) });
  await app.ready();
}, 60_000);

afterAll(async () => {
  await app.close();
  await pool.end();
});

beforeEach(async () => {
  await truncateAll(pool);
});

function cookieValue(setCookie: string | string[] | undefined): string {
  const raw = Array.isArray(setCookie) ? setCookie[0] : setCookie;
  if (raw === undefined) throw new Error('Set-Cookie отсутствует');
  return raw.split(';')[0]?.split('=')[1] ?? '';
}

describe('POST /api/v1/auth/device', () => {
  it('первый запрос создаёт сессию с флагами HttpOnly Secure SameSite и хранит только хэш', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/device',
      headers: { 'x-forwarded-for': '198.51.100.9, 203.0.113.77' },
    });

    expect(response.statusCode).toBe(201);
    const setCookie = response.headers['set-cookie'];
    const header = Array.isArray(setCookie) ? setCookie[0] ?? '' : setCookie ?? '';
    expect(header).toContain('HttpOnly');
    expect(header).toContain('Secure');
    expect(header).toContain('SameSite=Lax');
    expect(header).toContain('Path=/');

    const token = cookieValue(setCookie);
    // ≥ 128 бит энтропии: 32 байта в base64url — 43 символа.
    expect(token.length).toBeGreaterThanOrEqual(43);

    const rows = await pool.query<{
      cookie_token_hash: string; ip_prefix: string; account_id: string | null; days: string;
    }>(`SELECT cookie_token_hash, ip_prefix, account_id,
               extract(epoch from (anonymous_diary_expires_at - created_at)) / 86400 AS days
        FROM device_session`);

    expect(rows.rowCount).toBe(1);
    const row = rows.rows[0];
    // В базе ТОЛЬКО хэш: утечка дампа не выдаёт действующих сессий.
    expect(row?.cookie_token_hash).not.toBe(token);
    expect(row?.cookie_token_hash).toBe(hashSessionToken(token));
    // Адрес усечён: полного нет нигде. Берётся ПОСЛЕДНИЙ элемент — его поставил наш Caddy.
    expect(row?.ip_prefix).toBe('203.0.113.0/24');
    expect(row?.account_id).toBeNull();
    expect(Math.round(Number(row?.days))).toBe(7);
  });

  it('повторный запрос с действующей cookie не создаёт вторую сессию', async () => {
    const first = await app.inject({ method: 'POST', url: '/api/v1/auth/device', headers: { 'x-forwarded-for': '203.0.113.77' } });
    const token = cookieValue(first.headers['set-cookie']);
    const before = await pool.query<{ id: string; last_seen_at: Date }>('SELECT id, last_seen_at FROM device_session');

    const second = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/device',
      headers: { 'x-forwarded-for': '203.0.113.77', cookie: `${SESSION_COOKIE_NAME}=${token}` },
    });

    expect(second.statusCode).toBe(200);
    expect(second.headers['set-cookie']).toBeUndefined();

    const after = await pool.query<{ id: string; last_seen_at: Date }>('SELECT id, last_seen_at FROM device_session');
    expect(after.rowCount).toBe(1);
    expect(after.rows[0]?.id).toBe(before.rows[0]?.id);
    expect(new Date(after.rows[0]!.last_seen_at).getTime()).toBeGreaterThanOrEqual(new Date(before.rows[0]!.last_seen_at).getTime());
  });

  it('неизвестная cookie создаёт новую сессию и не изменяет прежнюю', async () => {
    const first = await app.inject({ method: 'POST', url: '/api/v1/auth/device', headers: { 'x-forwarded-for': '203.0.113.77' } });
    const original = await pool.query<{ id: string; cookie_token_hash: string }>('SELECT id, cookie_token_hash FROM device_session');
    expect(first.statusCode).toBe(201);

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/device',
      headers: { 'x-forwarded-for': '203.0.113.77', cookie: `${SESSION_COOKIE_NAME}=подделанное-значение` },
    });

    // Неизвестный токен — это ОТСУТСТВИЕ сессии: выдаётся новая, прежняя не воскрешается.
    expect(response.statusCode).toBe(201);
    const rows = await pool.query<{ id: string; cookie_token_hash: string }>('SELECT id, cookie_token_hash FROM device_session ORDER BY created_at');
    expect(rows.rowCount).toBe(2);
    expect(rows.rows[0]?.cookie_token_hash).toBe(original.rows[0]?.cookie_token_hash);
  });
});
