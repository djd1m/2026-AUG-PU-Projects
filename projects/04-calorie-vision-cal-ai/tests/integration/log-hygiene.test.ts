// Гигиена журнала НА ЖИВОМ СЕРВЕРЕ (AC-foundation-16).
//
// Почему этот файл появился отдельно от `tests/unit/source-guards.test.ts`: страж по
// исходнику проверяет, что запрещённые ИМЕНА не передаются в вызовы журналирования, и он
// был зелёным — а в журнал всё равно уезжали токен и полный адрес, потому что опасной
// оказалась ПРОИЗВОЛЬНАЯ СТРОКА в разрешённом поле `route` (слепое ревью, RV-foundation-01).
//
// Отсюда правило, которое этот файл закрепляет: журнал проверяется ПРОГОНОМ ЗАПРОСА через
// сервер и ЧТЕНИЕМ того, что он написал. Тест, отключающий журнал заглушкой `sink: () => {}`,
// проверяет, что код не падает, и ничего не проверяет о содержимом.

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { DbPool } from '@n4/db';
import { createLogger, REDACTED, SERVICE_LOG_FIELDS } from '@n4/shared';
import { buildServer } from '../../apps/api/src/server.js';
import { SESSION_COOKIE_NAME } from '../../apps/api/src/session/create-device-session.js';
import { migratedPool, truncateAll } from '../helpers/db.js';
import { testApiConfig } from '../helpers/config.js';

const LEAKED_TOKEN = 'review-cookie-token-0123456789';
const LEAKED_IP = '203.0.113.77';

let pool: DbPool;
let app: FastifyInstance;
let lines: string[];

beforeAll(async () => {
  pool = await migratedPool('n4-tests-log-hygiene');
  lines = [];
  app = buildServer({
    config: testApiConfig(),
    pool,
    // Настоящий журнал сервиса: те же правила редактирования, что в бою.
    logger: createLogger({ service: 'api', allowedFields: SERVICE_LOG_FIELDS, sink: (line) => lines.push(line) }),
  });
  await app.ready();
}, 60_000);

afterAll(async () => {
  await app.close();
  await pool.end();
});

beforeEach(async () => {
  await truncateAll(pool);
  lines.length = 0;
});

describe('гигиена журнала на живом сервере', () => {
  it('журнал не содержит секретов и полного адреса даже на ошибочном запросе к неизвестному маршруту', async () => {
    // Точное воспроизведение прогона ревью: неизвестный маршрут, секреты в query, битое тело.
    const response = await app.inject({
      method: 'POST',
      url: `/unknown?token=${LEAKED_TOKEN}&ip=${LEAKED_IP}`,
      headers: { 'content-type': 'application/json', 'x-forwarded-for': LEAKED_IP },
      payload: '{bad',
    });

    expect([400, 404]).toContain(response.statusCode);
    expect(lines.length).toBeGreaterThan(0);
    const journal = lines.join('\n');

    // Ни токена из query, ни полного адреса, ни самой строки запроса.
    expect(journal).not.toContain(LEAKED_TOKEN);
    expect(journal).not.toContain(LEAKED_IP);
    expect(journal).not.toContain('/unknown?');
    expect(journal).not.toContain('token=');

    // Разбор инцидента при этом возможен: метод, статус и ПОСТОЯННЫЙ идентификатор маршрута.
    const failure = lines.map((line) => JSON.parse(line)).find((entry) => entry.event === 'request_failed');
    expect(failure).toBeDefined();
    expect(failure.route).toBe('unmatched');
    expect(failure.method).toBe('POST');
    expect(typeof failure.status).toBe('number');
  });

  it('поле вне закрытого списка затирается, а не печатается как есть', async () => {
    // Разворот правила: разрешено ПЕРЕЧИСЛЕННОЕ. Список запрещённых значений всегда неполон,
    // список разрешённых полей конечен и виден целиком.
    const probe = createLogger({ service: 'api', allowedFields: SERVICE_LOG_FIELDS, sink: (line) => lines.push(line) });
    probe.info('probe_event', { route: '/api/v1/auth/device', unexpected_field: `${LEAKED_TOKEN} ${LEAKED_IP}` });

    const entry = JSON.parse(lines[lines.length - 1] ?? '{}');
    expect(entry.route).toBe('/api/v1/auth/device');
    // Поле СОХРАНЕНО и затёрто: исчезнувшее поле выглядело бы как «его и не было».
    expect(Object.keys(entry)).toContain('unexpected_field');
    expect(entry.unexpected_field).toBe(REDACTED);
  });

  it('журнал реальной сессии не содержит сырого токена cookie', async () => {
    const created = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/device',
      headers: { 'x-forwarded-for': LEAKED_IP },
    });
    expect(created.statusCode).toBe(201);

    const setCookie = created.headers['set-cookie'];
    const raw = Array.isArray(setCookie) ? setCookie[0] ?? '' : setCookie ?? '';
    const token = raw.split(';')[0]?.split('=')[1] ?? '';
    expect(token.length).toBeGreaterThanOrEqual(43);

    // Повтор с действующей cookie: токен уходит В ЗАПРОСЕ и не имеет права попасть в журнал.
    await app.inject({
      method: 'POST',
      url: '/api/v1/auth/device',
      headers: { 'x-forwarded-for': LEAKED_IP, cookie: `${SESSION_COOKIE_NAME}=${token}` },
    });

    const journal = lines.join('\n');
    expect(journal).not.toContain(token);
    expect(journal).not.toContain(LEAKED_IP);
    // Усечённый префикс — это НЕ полный адрес, он остаётся читаемым.
    expect(journal).toContain('203.0.113.0/24');
  });
});
