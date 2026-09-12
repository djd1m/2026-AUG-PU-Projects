// Служебная проба здоровья `GET /health` (FR-foundation-9).
//
// Путь ВНЕ префикса `/api/v1`: продуктовых маршрутов канона по-прежнему 14, служебный в
// их число не входит и данных пользователя не отдаёт.
//
// Недоступность базы — ОТКАЗ (`503` с названной причиной), а не «наверное, всё хорошо».
// Ответ не содержит ни версий, ни имён переменных, ни строки подключения: служебная ручка
// не обязана быть источником разведданных.

import type { FastifyInstance } from 'fastify';
import type { DbPool } from '@n4/db';
import { fail, ok } from '@n4/shared';

export function registerHealthRoute(app: FastifyInstance, pool: DbPool): void {
  app.get('/health', async (_request, reply) => {
    try {
      await pool.query('SELECT 1');
    } catch {
      // Причина названа КЛАССОМ отказа, без текста ошибки драйвера: он содержит хост,
      // пользователя и имя базы.
      return reply.code(503).send(fail('database_unavailable', 'база данных не отвечает на SELECT 1'));
    }
    return reply.code(200).send(ok({ status: 'ok', db: 'ok' }));
  });
}
