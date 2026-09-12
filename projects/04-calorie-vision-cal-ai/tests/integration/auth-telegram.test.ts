// POST /api/v1/auth/telegram — TelegramLogin (AC-consent-and-telegram-auth-1/2/6/8/20).

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { DbPool } from '@n4/db';
import { createLogger } from '@n4/shared';
import { buildServer } from '../../apps/api/src/server.js';
import { SESSION_COOKIE_NAME } from '../../apps/api/src/session/create-device-session.js';
import { migratedPool, truncateAll } from '../helpers/db.js';
import { testApiConfig } from '../helpers/config.js';
import { buildInitData } from '../helpers/telegram.js';

let pool: DbPool;
let app: FastifyInstance;

beforeAll(async () => {
  pool = await migratedPool('n4-tests-auth-telegram');
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

async function createAnonymousSession(): Promise<{ token: string }> {
  const response = await app.inject({ method: 'POST', url: '/api/v1/auth/device', headers: { 'x-forwarded-for': '203.0.113.9' } });
  return { token: cookieValue(response.headers['set-cookie']) };
}

async function seedDiaryEntries(sessionId: string, count: number): Promise<void> {
  const recognition = await pool.query<{ id: string }>(
    `INSERT INTO recognition (device_session_id, status) VALUES ($1, 'done') RETURNING id`,
    [sessionId],
  );
  const recognitionId = recognition.rows[0]!.id;
  for (let i = 0; i < count; i += 1) {
    await pool.query(
      `INSERT INTO diary_entry (owner_key, recognition_id, eaten_on, meal_slot, items, kcal_total, protein_total, fat_total, carb_total, source_snapshot)
       VALUES ($1, $2, CURRENT_DATE, 'lunch', '[]'::jsonb, 100, 1, 1, 1, '{}'::jsonb)`,
      [sessionId, recognitionId],
    );
  }
}

describe('POST /api/v1/auth/telegram', () => {
  it('AC-1: успешный вход переносит дневник целиком (3 записи)', async () => {
    const { token } = await createAnonymousSession();
    // ID сессии нужен для посева дневника — читаем напрямую по факту единственной строки.
    const sessions = await pool.query<{ id: string }>('SELECT id FROM device_session');
    const sessionId = sessions.rows[0]!.id;
    await seedDiaryEntries(sessionId, 3);

    const initData = buildInitData('700001');
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/telegram',
      headers: { cookie: `${SESSION_COOKIE_NAME}=${token}`, 'content-type': 'application/json' },
      payload: { init_data: initData },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json() as { data: { account_id: string; migrated_entries: number } };
    expect(body.data.migrated_entries).toBe(3);
    // RV-13/AC-1: «с установкой cookie» относится и к УЖЕ существующей анонимной сессии, не
    // только к вновь выпущенной.
    expect(response.headers['set-cookie']).toBeDefined();
    expect(cookieValue(response.headers['set-cookie'])).toBe(token);

    const remaining = await pool.query('SELECT count(*)::int AS n FROM diary_entry WHERE owner_key = $1', [sessionId]);
    expect(remaining.rows[0]?.n).toBe(0);
    const migrated = await pool.query('SELECT count(*)::int AS n FROM diary_entry WHERE owner_key = $1', [body.data.account_id]);
    expect(migrated.rows[0]?.n).toBe(3);

    // RV-06: анонимное recognition, созданное seedDiaryEntries, обязано перейти во владение
    // аккаунта при входе — иначе эразура искала бы активные/удаляемые сканы мимо него.
    const recognition = await pool.query<{ account_id: string | null }>('SELECT account_id FROM recognition WHERE device_session_id = $1', [sessionId]);
    expect(recognition.rows[0]?.account_id).toBe(body.data.account_id);
  });

  it('AC-6: вход с другого устройства не теряет и не дублирует дневник', async () => {
    const sessionA = await createAnonymousSession();
    const initData = buildInitData('700002');
    const loginA = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/telegram',
      headers: { cookie: `${SESSION_COOKIE_NAME}=${sessionA.token}`, 'content-type': 'application/json' },
      payload: { init_data: initData },
    });
    expect(loginA.statusCode).toBe(200);
    const accountId = (loginA.json() as { data: { account_id: string } }).data.account_id;

    const sessionB = await createAnonymousSession();
    const sessions = await pool.query<{ id: string }>('SELECT id FROM device_session ORDER BY created_at');
    const sessionBId = sessions.rows[1]!.id;
    await seedDiaryEntries(sessionBId, 2);

    const initDataB = buildInitData('700002', { authDateSecondsAgo: 5, queryId: 'from-device-b' });
    const loginB = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/telegram',
      headers: { cookie: `${SESSION_COOKIE_NAME}=${sessionB.token}`, 'content-type': 'application/json' },
      payload: { init_data: initDataB },
    });

    expect(loginB.statusCode).toBe(200);
    const bodyB = loginB.json() as { data: { account_id: string; migrated_entries: number } };
    expect(bodyB.data.account_id).toBe(accountId);
    expect(bodyB.data.migrated_entries).toBe(2);

    const total = await pool.query('SELECT count(*)::int AS n FROM diary_entry WHERE owner_key = $1', [accountId]);
    expect(total.rows[0]?.n).toBe(2);
  });

  it('AC-20: повторный вход после erased создаёт новый аккаунт, старые данные не восстанавливаются', async () => {
    const session1 = await createAnonymousSession();
    const login1 = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/telegram',
      headers: { cookie: `${SESSION_COOKIE_NAME}=${session1.token}`, 'content-type': 'application/json' },
      payload: { init_data: buildInitData('700003') },
    });
    const firstAccountId = (login1.json() as { data: { account_id: string } }).data.account_id;
    await pool.query(`UPDATE account SET status = 'erased' WHERE id = $1`, [firstAccountId]);

    const session2 = await createAnonymousSession();
    const login2 = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/telegram',
      headers: { cookie: `${SESSION_COOKIE_NAME}=${session2.token}`, 'content-type': 'application/json' },
      payload: { init_data: buildInitData('700003', { authDateSecondsAgo: 5, queryId: 'after-erase' }) },
    });

    expect(login2.statusCode).toBe(200);
    const secondAccountId = (login2.json() as { data: { account_id: string; migrated_entries: number } }).data.account_id;
    expect(secondAccountId).not.toBe(firstAccountId);

    const accounts = await pool.query('SELECT count(*)::int AS n FROM account WHERE telegram_user_id = $1', ['700003']);
    expect(accounts.rows[0]?.n).toBe(2);
  });

  it('RV-07: несколько erased-строк с одним telegram_user_id — вход находит/создаёт АКТУАЛЬНУЮ, никогда старую erased', async () => {
    // Две УЖЕ erased строки посеяны напрямую (имитация истории удалений до этого теста).
    await pool.query(
      `INSERT INTO account (telegram_user_id, tier, status) VALUES ($1, 'free', 'erased'), ($1, 'free', 'erased')`,
      ['700006'],
    );

    const session = await createAnonymousSession();
    const login = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/telegram',
      headers: { cookie: `${SESSION_COOKIE_NAME}=${session.token}`, 'content-type': 'application/json' },
      payload: { init_data: buildInitData('700006') },
    });

    expect(login.statusCode).toBe(200);
    const newAccountId = (login.json() as { data: { account_id: string } }).data.account_id;
    const erasedIds = await pool.query<{ id: string }>(`SELECT id FROM account WHERE telegram_user_id = $1 AND status = 'erased'`, ['700006']);
    expect(erasedIds.rows.map((r) => r.id)).not.toContain(newAccountId);

    // Второй вход (НОВАЯ initData) обязан найти ТУ ЖЕ новую активную строку, а не одну из старых.
    const secondSession = await createAnonymousSession();
    const secondLogin = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/telegram',
      headers: { cookie: `${SESSION_COOKIE_NAME}=${secondSession.token}`, 'content-type': 'application/json' },
      payload: { init_data: buildInitData('700006', { authDateSecondsAgo: 5, queryId: 'second-active-login' }) },
    });
    expect(secondLogin.statusCode).toBe(200);
    expect((secondLogin.json() as { data: { account_id: string } }).data.account_id).toBe(newAccountId);

    const total = await pool.query('SELECT count(*)::int AS n FROM account WHERE telegram_user_id = $1', ['700006']);
    expect(total.rows[0]?.n).toBe(3);
  });

  it('DEC-A-019: согласие анонимной сессии переносится на аккаунт при входе', async () => {
    const { token } = await createAnonymousSession();
    const consentResponse = await app.inject({
      method: 'POST',
      url: '/api/v1/consent',
      headers: { cookie: `${SESSION_COOKIE_NAME}=${token}`, 'content-type': 'application/json' },
      payload: {
        decision: 'grant',
        consent_version: '2026-09-v1',
        consent_text_hash: (await import('../../apps/api/src/consent/known-versions.js')).computeConsentTextHash('2026-09-v1'),
      },
    });
    expect(consentResponse.statusCode).toBe(200);

    const login = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/telegram',
      headers: { cookie: `${SESSION_COOKIE_NAME}=${token}`, 'content-type': 'application/json' },
      payload: { init_data: buildInitData('700004') },
    });
    expect(login.statusCode).toBe(200);
    const accountId = (login.json() as { data: { account_id: string } }).data.account_id;

    const account = await pool.query<{ consent_at: Date | null }>('SELECT consent_at FROM account WHERE id = $1', [accountId]);
    expect(account.rows[0]?.consent_at).not.toBeNull();
  });

  it('AC-2: подделанная подпись отклоняется 401, ничего не создано', async () => {
    const { token } = await createAnonymousSession();
    const initData = buildInitData('700005').replace(/hash=[0-9a-f]+/, `hash=${'0'.repeat(64)}`);

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/telegram',
      headers: { cookie: `${SESSION_COOKIE_NAME}=${token}`, 'content-type': 'application/json' },
      payload: { init_data: initData },
    });

    expect(response.statusCode).toBe(401);
    const accounts = await pool.query('SELECT count(*)::int AS n FROM account');
    expect(accounts.rows[0]?.n).toBe(0);
  });

  it('AC-7: пустой init_data отклоняется 422, не 401', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/telegram',
      headers: { 'content-type': 'application/json' },
      payload: { init_data: '' },
    });

    expect(response.statusCode).toBe(422);
  });
});
