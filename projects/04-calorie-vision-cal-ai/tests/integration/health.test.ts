// Служебная проба здоровья (AC-foundation-14).
//
// Недоступность базы — ОТКАЗ с названной причиной, а не «наверное, всё хорошо».
// Это ровно тот случай, где «процесс жив» и «система работает» расходятся.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createPool, type DbPool } from '@n4/db';
import { createLogger } from '@n4/shared';
import { buildServer } from '../../apps/api/src/server.js';
import { migratedPool } from '../helpers/db.js';
import { testApiConfig } from '../helpers/config.js';

let pool: DbPool;
let app: FastifyInstance;

beforeAll(async () => {
  pool = await migratedPool('n4-tests-health');
  app = buildServer({ config: testApiConfig(), pool, logger: createLogger({ service: 'api-test', sink: () => {} }) });
  await app.ready();
}, 60_000);

afterAll(async () => {
  await app.close();
  await pool.end();
});

describe('GET /health', () => {
  it('health отвечает 200 при живой базе и 503 при недоступной', async () => {
    const alive = await app.inject({ method: 'GET', url: '/health' });
    expect(alive.statusCode).toBe(200);
    expect(JSON.parse(alive.body)).toEqual({ data: { status: 'ok', db: 'ok' } });

    // Недоступная база: адрес, которого нет. Пул с таймаутом соединения — без него
    // ожидание было бы БЕСКОНЕЧНЫМ, и проба не ответила бы вовсе.
    const brokenPool = createPool({
      databaseUrl: 'postgresql://n4_app:wrong@127.0.0.1:59999/n4',
      applicationName: 'n4-tests-health-broken',
      connectionTimeoutMillis: 1_000,
    });
    brokenPool.on('error', () => {});
    const broken = buildServer({ config: testApiConfig(), pool: brokenPool, logger: createLogger({ service: 'api-test', sink: () => {} }) });
    await broken.ready();
    try {
      const response = await broken.inject({ method: 'GET', url: '/health' });
      expect(response.statusCode).toBe(503);
      const body = JSON.parse(response.body);
      expect(body.error.code).toBe('database_unavailable');
      // Причина названа, но без строки подключения, пользователя и хоста: служебная
      // ручка не обязана быть источником разведданных.
      expect(response.body).not.toContain('59999');
      expect(response.body).not.toContain('n4_app');
    } finally {
      await broken.close();
      await brokenPool.end().catch(() => {});
    }
  });
});
