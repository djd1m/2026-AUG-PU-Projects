// Ограничение частоты ДО разбора тела (AC-foundation-13).
//
// Различающее свойство теста: тело запроса — СИНТАКСИЧЕСКИ НЕВЕРНЫЙ JSON. Пока порог не
// исчерпан, Fastify разбирает его и отвечает `400`. После порога ответ обязан быть `429`
// БЕЗ единого `400`: если бы хук стоял на `preHandler`, разбор случился бы раньше счётчика
// и в ответе появился бы `400 invalid json` — перебор мусором был бы бесплатен.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { DbPool } from '@n4/db';
import { createLogger } from '@n4/shared';
import { buildServer } from '../../apps/api/src/server.js';
import { createRateLimiter } from '../../apps/api/src/http/rate-limit.js';
import { migratedPool } from '../helpers/db.js';
import { testApiConfig } from '../helpers/config.js';

const MUTATE_LIMIT = 5;
const READ_LIMIT = 7;

let pool: DbPool;
let app: FastifyInstance;

beforeAll(async () => {
  pool = await migratedPool('n4-tests-rate-limit');
  app = buildServer({
    config: testApiConfig({ rateLimits: { mutatePerMinute: MUTATE_LIMIT, readPerMinute: READ_LIMIT } }),
    pool,
    logger: createLogger({ service: 'api-test', sink: () => {} }),
  });
  await app.ready();
}, 60_000);

afterAll(async () => {
  await app.close();
  await pool.end();
});

describe('ограничение частоты', () => {
  it('превышение частоты отвечает 429 до разбора тела', async () => {
    const codes: number[] = [];
    for (let i = 0; i < MUTATE_LIMIT + 5; i += 1) {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/device',
        headers: { 'x-forwarded-for': '198.51.100.4', 'content-type': 'application/json' },
        payload: '{ это не json',
      });
      codes.push(response.statusCode);
      if (response.statusCode === 429) {
        expect(JSON.parse(response.body).error.code).toBe('rate_limited');
      }
    }

    expect(codes.slice(0, MUTATE_LIMIT).every((code) => code === 400)).toBe(true);
    // Последние пять — 429 и НИ ОДНОГО 400: тела для них никто не разбирал.
    expect(codes.slice(MUTATE_LIMIT)).toEqual([429, 429, 429, 429, 429]);
  });

  it('порог чтения отдельный и выше порога мутаций', async () => {
    const codes: number[] = [];
    for (let i = 0; i < READ_LIMIT + 2; i += 1) {
      const response = await app.inject({ method: 'GET', url: '/health', headers: { 'x-forwarded-for': '198.51.100.5' } });
      codes.push(response.statusCode);
    }
    expect(codes.filter((code) => code === 429)).toHaveLength(2);
    expect(codes.slice(0, READ_LIMIT).every((code) => code === 200)).toBe(true);
  });

  it('ключ — усечённый префикс: соседний адрес той же сети делит счётчик, чужая сеть нет', async () => {
    const limiter = createRateLimiter({ mutatePerMinute: 2, readPerMinute: 2 });
    expect(limiter.consume('203.0.113.0/24', 'mutate').allowed).toBe(true);
    expect(limiter.consume('203.0.113.0/24', 'mutate').allowed).toBe(true);
    expect(limiter.consume('203.0.113.0/24', 'mutate').allowed).toBe(false);
    // Другая сеть — свой счётчик: механизм не наказывает добросовестного.
    expect(limiter.consume('198.51.100.0/24', 'mutate').allowed).toBe(true);
    // Чтение и мутации считаются РАЗДЕЛЬНО.
    expect(limiter.consume('203.0.113.0/24', 'read').allowed).toBe(true);
  });

  it('после исчерпания окна счётчик восстанавливается', () => {
    const limiter = createRateLimiter({ mutatePerMinute: 1, readPerMinute: 1 });
    const start = 1_000_000;
    expect(limiter.consume('203.0.113.0/24', 'mutate', start).allowed).toBe(true);
    expect(limiter.consume('203.0.113.0/24', 'mutate', start + 100).allowed).toBe(false);
    expect(limiter.consume('203.0.113.0/24', 'mutate', start + 60_001).allowed).toBe(true);
  });
});
