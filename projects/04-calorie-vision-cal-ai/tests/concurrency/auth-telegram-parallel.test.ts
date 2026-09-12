// Конкурентные прогоны TelegramLogin (VC-03, AC-consent-and-telegram-auth-1/5).
//
// Последовательный тест зеленеет и при неправильной реализации без блокировки строки —
// разделяемый ресурс (account по telegram_user_id) закрывается ТОЛЬКО конкурентным прогоном
// (`shared-resource-verification.md`).

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { DbPool } from '@n4/db';
import { createLogger } from '@n4/shared';
import { buildServer } from '../../apps/api/src/server.js';
import { migratedPool, truncateAll } from '../helpers/db.js';
import { testApiConfig } from '../helpers/config.js';
import { buildInitData } from '../helpers/telegram.js';

let pool: DbPool;
let app: FastifyInstance;

beforeAll(async () => {
  pool = await migratedPool('n4-tests-auth-telegram-parallel');
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

describe('20 одновременных POST /auth/telegram с ОДНОЙ initData', () => {
  it('ровно 1 успех (200), 19 × 401 initdata_replayed (VC-03)', async () => {
    const initData = buildInitData('900001');

    const results = await Promise.all(
      Array.from({ length: 20 }, async () =>
        app.inject({
          method: 'POST',
          url: '/api/v1/auth/telegram',
          headers: { 'content-type': 'application/json' },
          payload: { init_data: initData },
        }),
      ),
    );

    const succeeded = results.filter((r) => r.statusCode === 200);
    const replayed = results.filter((r) => r.statusCode === 401);
    expect(succeeded).toHaveLength(1);
    expect(replayed).toHaveLength(19);
    for (const r of replayed) {
      expect((r.json() as { error: { code: string } }).error.code).toBe('initdata_replayed');
    }

    const accounts = await pool.query('SELECT count(*)::int AS n FROM account WHERE telegram_user_id = $1', ['900001']);
    expect(accounts.rows[0]?.n).toBe(1);
  }, 30_000);
});

describe('два параллельных ПЕРВЫХ входа одним telegram_user_id, РАЗНОЙ initData', () => {
  it('ровно ОДНА строка account, оба запроса успешны и указывают на неё (VC-03)', async () => {
    const initDataA = buildInitData('900002', { authDateSecondsAgo: 10, queryId: 'a' });
    const initDataB = buildInitData('900002', { authDateSecondsAgo: 11, queryId: 'b' });

    const [responseA, responseB] = await Promise.all([
      app.inject({ method: 'POST', url: '/api/v1/auth/telegram', headers: { 'content-type': 'application/json' }, payload: { init_data: initDataA } }),
      app.inject({ method: 'POST', url: '/api/v1/auth/telegram', headers: { 'content-type': 'application/json' }, payload: { init_data: initDataB } }),
    ]);

    expect(responseA.statusCode).toBe(200);
    expect(responseB.statusCode).toBe(200);
    const accountA = (responseA.json() as { data: { account_id: string } }).data.account_id;
    const accountB = (responseB.json() as { data: { account_id: string } }).data.account_id;
    expect(accountA).toBe(accountB);

    const accounts = await pool.query('SELECT count(*)::int AS n FROM account WHERE telegram_user_id = $1', ['900002']);
    expect(accounts.rows[0]?.n).toBe(1);
  }, 30_000);
});
