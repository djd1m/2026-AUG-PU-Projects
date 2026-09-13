// POST /api/v1/interest — RecordProInterest (AC-pro-interest-and-limits-ui-6/7/9/10,
// маршрут 10 канона). Конкурентный прогон AC-8 — отдельно, `tests/concurrency/interest-cadence.test.ts`
// (`shared-resource-verification`: последовательный тест на разделяемом ресурсе доказывает
// меньше, чем кажется, но необходим как база перед конкурентным).

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { DbPool } from '@n4/db';
import { createLogger } from '@n4/shared';
import { buildServer } from '../../apps/api/src/server.js';
import { SESSION_COOKIE_NAME, hashSessionToken } from '../../apps/api/src/session/create-device-session.js';
import { migratedPool, truncateAll } from '../helpers/db.js';
import { testApiConfig } from '../helpers/config.js';

let pool: DbPool;
let app: FastifyInstance;

beforeAll(async () => {
  pool = await migratedPool('n4-tests-interest');
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

async function newSessionCookie(ip: string): Promise<string> {
  const device = await app.inject({ method: 'POST', url: '/api/v1/auth/device', headers: { 'x-forwarded-for': ip } });
  return cookieValue(device.headers['set-cookie']);
}

/** Атрибуция создаётся напрямую SQL: `partner-codes-and-cabinet` (`POST /codes/apply`) в
 * это дерево ещё не влит — эта фича ТОЛЬКО читает уже существующую атрибуцию (`03_architecture.md`). */
async function seedAttribution(sessionCookieToken: string): Promise<string> {
  const session = await pool.query<{ id: string }>(
    'SELECT id FROM device_session WHERE cookie_token_hash = $1',
    [hashSessionToken(sessionCookieToken)],
  );
  const deviceSessionId = session.rows[0]?.id;
  if (deviceSessionId === undefined) throw new Error('сессия не найдена для атрибуции');

  const partner = await pool.query<{ id: string }>(
    `INSERT INTO partner (display_name, contact) VALUES ('Партнёр теста', 'p@test.ru') RETURNING id`,
  );
  const partnerCode = await pool.query<{ id: string }>(
    `INSERT INTO partner_code (partner_id, code) VALUES ($1, 'CODE1') RETURNING id`,
    [partner.rows[0]?.id],
  );
  const partnerCodeId = partnerCode.rows[0]?.id;
  if (partnerCodeId === undefined) throw new Error('код партнёра не создан');

  await pool.query(
    `INSERT INTO attribution (device_session_id, partner_code_id, status, source) VALUES ($1, $2, 'pending', 'explicit')`,
    [deviceSessionId, partnerCodeId],
  );
  return partnerCodeId;
}

describe('POST /api/v1/interest', () => {
  it('без сессии — 401', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/interest',
      headers: { 'content-type': 'application/json' },
      payload: { contact: 'a@b.ru', source: 'user_limit' },
    });
    expect(response.statusCode).toBe(401);
  });

  it('AC-6: прямой запрос с пустым контактом получает 422 в обход клиента, строка не создаётся', async () => {
    const token = await newSessionCookie('203.0.113.40');

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/interest',
      headers: { cookie: `${SESSION_COOKIE_NAME}=${token}`, 'content-type': 'application/json' },
      payload: { contact: '', source: 'user_limit' },
    });

    expect(response.statusCode).toBe(422);
    const rows = await pool.query('SELECT id FROM pro_interest');
    expect(rows.rowCount).toBe(0);
  });

  it('AC-10: неизвестное значение source отклоняется 422, строка не создаётся', async () => {
    const token = await newSessionCookie('203.0.113.41');

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/interest',
      headers: { cookie: `${SESSION_COOKIE_NAME}=${token}`, 'content-type': 'application/json' },
      payload: { contact: 'a@b.ru', source: 'sale' },
    });

    expect(response.statusCode).toBe(422);
    const rows = await pool.query('SELECT id FROM pro_interest');
    expect(rows.rowCount).toBe(0);
  });

  it('AC-7: повторная отправка за те же сутки получает 429 и не плодит строку', async () => {
    const token = await newSessionCookie('203.0.113.42');

    const first = await app.inject({
      method: 'POST',
      url: '/api/v1/interest',
      headers: { cookie: `${SESSION_COOKIE_NAME}=${token}`, 'content-type': 'application/json' },
      payload: { contact: 'a@b.ru', source: 'user_limit' },
    });
    expect(first.statusCode).toBe(201);

    const second = await app.inject({
      method: 'POST',
      url: '/api/v1/interest',
      headers: { cookie: `${SESSION_COOKIE_NAME}=${token}`, 'content-type': 'application/json' },
      payload: { contact: 'other@b.ru', source: 'global_limit' },
    });
    expect(second.statusCode).toBe(429);
    expect(second.json().error.code).toBe('already_recorded_today');

    const rows = await pool.query<{ contact: string; source_screen: string }>('SELECT contact, source_screen FROM pro_interest');
    expect(rows.rowCount).toBe(1);
    // Поля ПЕРВОЙ строки не изменены повторной попыткой.
    expect(rows.rows[0]?.contact).toBe('a@b.ru');
    expect(rows.rows[0]?.source_screen).toBe('user_limit');
  });

  it('AC-9: source_screen и атрибуция сохраняются верно; без атрибуции — NULL, не пропущенное поле', async () => {
    const attributedToken = await newSessionCookie('203.0.113.43');
    const partnerCodeId = await seedAttribution(attributedToken);

    const attributed = await app.inject({
      method: 'POST',
      url: '/api/v1/interest',
      headers: { cookie: `${SESSION_COOKIE_NAME}=${attributedToken}`, 'content-type': 'application/json' },
      payload: { contact: '@ivan_petrov', source: 'global_limit' },
    });
    expect(attributed.statusCode).toBe(201);
    expect(attributed.json().data.contact_kind).toBe('telegram');

    const plainToken = await newSessionCookie('203.0.113.44');
    const plain = await app.inject({
      method: 'POST',
      url: '/api/v1/interest',
      headers: { cookie: `${SESSION_COOKIE_NAME}=${plainToken}`, 'content-type': 'application/json' },
      payload: { contact: 'plain@b.ru', source: 'global_limit' },
    });
    expect(plain.statusCode).toBe(201);

    const rows = await pool.query<{ contact: string; source_screen: string; partner_code_id: string | null }>(
      'SELECT contact, source_screen, partner_code_id FROM pro_interest ORDER BY created_at',
    );
    expect(rows.rowCount).toBe(2);
    const attributedRow = rows.rows.find((row) => row.contact === '@ivan_petrov');
    const plainRow = rows.rows.find((row) => row.contact === 'plain@b.ru');
    expect(attributedRow?.source_screen).toBe('global_limit');
    expect(attributedRow?.partner_code_id).toBe(partnerCodeId);
    expect(plainRow?.partner_code_id).toBeNull();
  });

  it('два разных owner_key в один день — оба успешны (cadence считается по каждому отдельно)', async () => {
    const tokenA = await newSessionCookie('203.0.113.45');
    const tokenB = await newSessionCookie('203.0.113.46');

    const a = await app.inject({
      method: 'POST',
      url: '/api/v1/interest',
      headers: { cookie: `${SESSION_COOKIE_NAME}=${tokenA}`, 'content-type': 'application/json' },
      payload: { contact: 'a@b.ru', source: 'user_limit' },
    });
    const b = await app.inject({
      method: 'POST',
      url: '/api/v1/interest',
      headers: { cookie: `${SESSION_COOKIE_NAME}=${tokenB}`, 'content-type': 'application/json' },
      payload: { contact: 'b@b.ru', source: 'user_limit' },
    });

    expect(a.statusCode).toBe(201);
    expect(b.statusCode).toBe(201);
  });
});
