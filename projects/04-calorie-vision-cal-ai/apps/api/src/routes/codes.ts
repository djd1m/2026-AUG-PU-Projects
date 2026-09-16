// `POST /api/v1/codes/apply` — ApplyPartnerCode (маршрут 7 канона, FR-partner-codes-and-
// cabinet-1..6, ADR-008). Требует активную сессию устройства (cookie `n4_session`,
// `foundation`) — без неё некому приписать атрибуцию, `401`.
//
// `source` ВСЕГДА `explicit` для ЭТОГО маршрута: `deeplink`/`cookie` — внутренние
// источники вызова из `scan-pipeline`/веб-клиента (`01_specification.md`,
// FR-partner-codes-and-cabinet-1), они не вводятся пользователем через HTTP напрямую, и
// значение `source`, присланное в теле, ИГНОРИРУЕТСЯ — даже если клиент его пришлёт.

import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { DbPool } from '@n4/db';
import { fail, ok, type Logger } from '@n4/shared';
import { SESSION_COOKIE_NAME } from '../session/create-device-session.js';
import { applyPartnerCode } from '../partner/apply-partner-code.js';

export interface CodesRouteDeps {
  readonly pool: DbPool;
  readonly logger: Logger;
}

interface OwnedSession {
  readonly deviceSessionId: string;
  readonly ipPrefix: string;
}

/**
 * Тот же контракт, что `routes/scans.ts` `requireSession`: неизвестная/отсутствующая cookie
 * — 401. `ipPrefix` — ХРАНИМОЕ значение `device_session.ip_prefix` (то же, что записано при
 * создании сессии), а НЕ свежепосчитанное из заголовка ТЕКУЩЕГО запроса
 * (`RV-partner-codes-and-cabinet-03`): `AntiFraudOnCode` считает историю ПО ЭТОЙ ЖЕ
 * колонке для ВСЕХ сессий (`anti-fraud.ts`, JOIN на `device_session.ip_prefix`) — ключ
 * проверки ОБЯЗАН совпадать с ключом хранения, иначе смена сети между созданием сессии и
 * применением кода отвязывает текущую попытку от истории собственных прошлых применений и
 * анти-фрод-порог обходится нулевым счётчиком «под новым префиксом». Смена сети — НАЗВАННОЕ
 * решение: история конкретной СЕССИИ считается по её сети НА МОМЕНТ СОЗДАНИЯ навсегда,
 * `device_session.ip_prefix` этим маршрутом никогда не обновляется задним числом (иначе
 * прошлые события «переехали» бы вслед за колонкой — тот же класс отказа, только наоборот).
 */
async function requireSession(request: FastifyRequest, pool: DbPool): Promise<OwnedSession | null> {
  const token = request.cookies[SESSION_COOKIE_NAME];
  if (token === undefined || token.trim() === '') return null;
  const { createHash } = await import('node:crypto');
  const hash = createHash('sha256').update(token, 'utf8').digest('hex');
  const result = await pool.query<{ id: string; ip_prefix: string }>('SELECT id, ip_prefix FROM device_session WHERE cookie_token_hash = $1', [
    hash,
  ]);
  const row = result.rows[0];
  if (row === undefined) return null;
  return { deviceSessionId: row.id, ipPrefix: row.ip_prefix };
}

interface ApplyCodeBody {
  readonly code?: string;
  /**
   * Откуда взялся код. Закрытый набор из двух значений, и распознаётся ТОЛЬКО `deeplink` —
   * всё остальное (включая отсутствие поля и подделку) читается как `explicit`.
   *
   * Почему клиенту вообще позволено это говорить и почему это безопасно. ADR-008: явный код
   * сильнее слабого источника, слабый слабого не вытесняет. Переход по ссылке блогера — это
   * `deeplink`, то есть СЛАБЫЙ источник: первая ссылка выигрывает у второй, а код, введённый
   * человеком руками, выигрывает у обеих. Клиент, объявляющий `deeplink`, ОСЛАБЛЯЕТ себя —
   * атаки в эту сторону нет. Обратное направление невозможно по построению: сказать
   * «я explicit» значит ровно то же, что ввести код руками, а это посетителю и так разрешено.
   */
  readonly source?: unknown;
}

export function registerCodesRoutes(app: FastifyInstance, deps: CodesRouteDeps): void {
  app.post<{ Body: ApplyCodeBody }>('/api/v1/codes/apply', async (request: FastifyRequest<{ Body: ApplyCodeBody }>, reply: FastifyReply) => {
    const session = await requireSession(request, deps.pool);
    if (session === null) return reply.code(401).send(fail('unauthenticated', 'сессия отсутствует'));

    const rawCode = request.body?.code;
    if (typeof rawCode !== 'string' || rawCode.trim() === '') {
      return reply.code(422).send(fail('invalid_code', 'code обязателен'));
    }

    const requestId = (request as FastifyRequest & { n4RequestId?: string }).n4RequestId ?? 'unknown';
    const outcome = await applyPartnerCode(
      { rawCode, source: request.body?.source === 'deeplink' ? 'deeplink' : 'explicit', deviceSessionId: session.deviceSessionId, ipPrefix: session.ipPrefix, requestId },
      { pool: deps.pool, logger: deps.logger },
    );

    const envelope = applyOutcomeToEnvelope(outcome);
    return reply.code(envelope.status).send(envelope.body);
  });
}

function applyOutcomeToEnvelope(outcome: Awaited<ReturnType<typeof applyPartnerCode>>): { readonly status: number; readonly body: unknown } {
  if (outcome.outcome === 'applied') return { status: 200, body: ok({ outcome: 'applied' as const }) };
  if (outcome.outcome === 'conflict') {
    return outcome.sameCode
      ? { status: 409, body: fail('conflict', 'этот код уже применён к сессии', { same_code: true }) }
      : { status: 409, body: fail('conflict', 'атрибуция сессии уже определена другим кодом', { same_code: false }) };
  }
  if (outcome.outcome === 'invalid') return { status: 422, body: fail('invalid_code', 'код не найден или не проходит формат') };
  // `rejected(*)` — код существует, но применение отклонено ДО записи (ADR-008): заблокирован,
  // самореферал или anti-fraud только что заблокировал его. Ни одна из причин не подтверждает
  // и не опровергает существование чужих данных — `403`, тот же класс ответа, что у маршрута 8.
  return { status: 403, body: fail('rejected', 'применение кода отклонено', { reason: outcome.reason }) };
}
