// RV-partner-codes-and-cabinet-03 (правка после ревью): ключ проверки anti-fraud обязан
// совпадать с ключом хранения. ДО правки `routes/codes.ts` вычислял `ipPrefix` заново из
// заголовка ТЕКУЩЕГО запроса, а `anti-fraud.ts` считал историю по `device_session.ip_prefix`
// (значению, сохранённому при СОЗДАНИИ сессии) — смена сети между созданием сессии и
// текущим запросом отвязывала попытку от собственной истории и обнуляла счётчик.
//
// Тест на реальном HTTP: 50 сессий и применений из сети A; 51-я сессия ТОЖЕ создана в сети
// A (её СОБСТВЕННЫЙ device_session.ip_prefix = A), но САМ запрос применения приходит с
// ЗАГОЛОВКОМ, заявляющим другую сеть B. До правки это давало 0 в счётчике (JOIN искал B) и
// пропускало 51-ю попытку; после правки счётчик считается по ХРАНИМОМУ значению сессии (A)
// независимо от заголовка текущего запроса — 51-я попытка блокируется.

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { DbPool } from '@n4/db';
import { createLogger } from '@n4/shared';
import { buildServer } from '../../../apps/api/src/server.js';
import { SESSION_COOKIE_NAME } from '../../../apps/api/src/session/create-device-session.js';
import { migratedPool, truncateAll } from '../../helpers/db.js';
import { testApiConfig } from '../../helpers/config.js';
import { seedPartner, seedPartnerCode } from '../../helpers/partner.js';

let pool: DbPool;
let app: FastifyInstance;

const NETWORK_A = '203.0.113.9';
const NETWORK_B = '198.51.100.9';

beforeAll(async () => {
  pool = await migratedPool('n4-tests-antifraud-ip-consistency');
  // Порог по умолчанию (`mutatePerMinute: 30`) ниже, чем 50+ создаваемых здесь сессий с
  // ОДНОГО ip_prefix за один прогон — без повышения теста тест уткнулся бы в СВОЙ ЖЕ
  // rate-limit (429, без Set-Cookie), а не в проверяемое anti-fraud поведение.
  app = buildServer({
    config: testApiConfig({ rateLimits: { mutatePerMinute: 500, readPerMinute: 500 } }),
    pool,
    logger: createLogger({ service: 'api-test', sink: () => {} }),
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

function cookieValue(setCookie: string | string[] | undefined): string {
  const raw = Array.isArray(setCookie) ? setCookie[0] : setCookie;
  if (raw === undefined) throw new Error('Set-Cookie отсутствует');
  return raw.split(';')[0]?.split('=')[1] ?? '';
}

async function newSessionFrom(networkIp: string): Promise<string> {
  const device = await app.inject({ method: 'POST', url: '/api/v1/auth/device', headers: { 'x-forwarded-for': networkIp } });
  return cookieValue(device.headers['set-cookie']);
}

async function applyCode(token: string, code: string, requestNetworkIp: string): Promise<number> {
  const response = await app.inject({
    method: 'POST',
    url: '/api/v1/codes/apply',
    headers: { cookie: `${SESSION_COOKIE_NAME}=${token}`, 'content-type': 'application/json', 'x-forwarded-for': requestNetworkIp },
    payload: { code },
  });
  return response.statusCode;
}

describe('RV-partner-codes-and-cabinet-03: ключ проверки согласован с ключом хранения', () => {
  it('50 применений из сети A + попытка №51 той же сессией, ЗАЯВЛЯЮЩЕЙ сеть B в текущем запросе, — всё равно блокируется', async () => {
    const partner = await seedPartner(pool, 'liza');
    const code = await seedPartnerCode(pool, partner.partnerId, 'IPCHECK1');

    for (let i = 0; i < 50; i += 1) {
      // Заголовок при создании И при применении — сеть A: обычный случай, сессия и её
      // собственная история согласованы.
      const token = await newSessionFrom(NETWORK_A);
      const status = await applyCode(token, code.code, NETWORK_A);
      expect(status).toBe(200);
    }

    // 51-я сессия СОЗДАНА в сети A (её device_session.ip_prefix = A, как и у первых 50),
    // но САМ запрос применения приходит с заголовком сети B.
    const token51 = await newSessionFrom(NETWORK_A);
    const status51 = await applyCode(token51, code.code, NETWORK_B);

    // До правки: ключ проверки (B из заголовка) не совпадал с ключом истории (A на всех
    // 50 сессиях) -> count(B)=0 -> 200 (пропущено). После правки: ключ проверки — ХРАНИМЫЙ
    // ip_prefix ЭТОЙ сессии (A, как и было при её создании) -> count(A)=50 -> заблокировано.
    expect(status51).toBe(403);

    const codeRow = await pool.query<{ status: string; blocked_reason: string | null }>(
      'SELECT status::text AS status, blocked_reason::text AS blocked_reason FROM partner_code WHERE id = $1',
      [code.id],
    );
    expect(codeRow.rows[0]).toMatchObject({ status: 'blocked', blocked_reason: 'antifraud_ip_burst' });
  }, 30_000);

  it('сессия, ДЕЙСТВИТЕЛЬНО созданная в другой сети, получает СВОЙ независимый счётчик (named behavior)', async () => {
    const partner = await seedPartner(pool, 'liza');
    const code = await seedPartnerCode(pool, partner.partnerId, 'IPCHECK2');

    for (let i = 0; i < 50; i += 1) {
      const token = await newSessionFrom(NETWORK_A);
      const status = await applyCode(token, code.code, NETWORK_A);
      expect(status).toBe(200);
    }

    // Сессия, СОЗДАННАЯ и ПРИМЕНЯЮЩАЯ из сети B целиком — её собственная история (B) пуста,
    // это ДРУГАЯ сеть по построению, а не обход: FR-partner-codes-and-cabinet-3 считает
    // anti-fraud ПО КОДУ И IP-ПРЕФИКСУ, а не глобально по коду.
    const tokenB = await newSessionFrom(NETWORK_B);
    const statusB = await applyCode(tokenB, code.code, NETWORK_B);
    expect(statusB).toBe(200);
  }, 30_000);
});
