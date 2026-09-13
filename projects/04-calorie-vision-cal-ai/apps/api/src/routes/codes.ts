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
import { clientAddressFrom, toIpPrefix } from '../session/ip-prefix.js';
import { applyPartnerCode } from '../partner/apply-partner-code.js';

export interface CodesRouteDeps {
  readonly pool: DbPool;
  readonly logger: Logger;
}

interface OwnedSession {
  readonly deviceSessionId: string;
  readonly ipPrefix: string;
}

/** Тот же контракт, что `routes/scans.ts` `requireSession`: неизвестная/отсутствующая cookie — 401. */
async function requireSession(request: FastifyRequest, pool: DbPool): Promise<OwnedSession | null> {
  const token = request.cookies[SESSION_COOKIE_NAME];
  if (token === undefined || token.trim() === '') return null;
  const { createHash } = await import('node:crypto');
  const hash = createHash('sha256').update(token, 'utf8').digest('hex');
  const result = await pool.query<{ id: string }>('SELECT id FROM device_session WHERE cookie_token_hash = $1', [hash]);
  const row = result.rows[0];
  if (row === undefined) return null;
  const address = clientAddressFrom(request.headers['x-forwarded-for'], request.ip);
  return { deviceSessionId: row.id, ipPrefix: toIpPrefix(address) };
}

interface ApplyCodeBody {
  readonly code?: string;
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
      { rawCode, source: 'explicit', deviceSessionId: session.deviceSessionId, ipPrefix: session.ipPrefix, requestId },
      { pool: deps.pool, logger: deps.logger },
    );

    const envelope = applyOutcomeToEnvelope(outcome);
    return reply.code(envelope.status).send(envelope.body);
  });
}

function applyOutcomeToEnvelope(outcome: Awaited<ReturnType<typeof applyPartnerCode>>): { readonly status: number; readonly body: unknown } {
  if (outcome.outcome === 'applied') return { status: 200, body: ok({ outcome: 'applied' as const }) };
  if (outcome.outcome === 'conflict') return { status: 409, body: fail('conflict', 'атрибуция сессии уже определена явным кодом') };
  if (outcome.outcome === 'invalid') return { status: 422, body: fail('invalid_code', 'код не найден или не проходит формат') };
  // `rejected(*)` — код существует, но применение отклонено ДО записи (ADR-008): заблокирован,
  // самореферал или anti-fraud только что заблокировал его. Ни одна из причин не подтверждает
  // и не опровергает существование чужих данных — `403`, тот же класс ответа, что у маршрута 8.
  return { status: 403, body: fail('rejected', 'применение кода отклонено', { reason: outcome.reason }) };
}
