// `POST /api/v1/interest` — RecordProInterest (маршрут 10 канона,
// `docs/features/pro-interest-and-limits-ui/`). Требует активную сессию устройства
// (cookie `n4_session`, `foundation`): без неё `owner_key` определить нечем, а владелец
// записи обязан браться с сервера, а не из тела запроса (`.claude/rules/security.md`).
//
// `owner_key` — КАНОНИЧЕСКИЙ владелец: `account.id`, если сессия связана со входом через
// Telegram, иначе сама `device_session.id` — тот же принцип, что у `GET /api/v1/diary`
// (`docs/Pseudocode.md` маршрут 4, `03_architecture.md`).

import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { DbPool } from '@n4/db';
import { fail, ok, type Logger } from '@n4/shared';
import { SESSION_COOKIE_NAME, hashSessionToken } from '../session/create-device-session.js';
import { moscowDay } from '../quota/keys.js';
import { recordProInterest } from '../interest/record-pro-interest.js';

export interface InterestRouteDeps {
  readonly pool: DbPool;
  readonly logger: Logger;
}

interface InterestBody {
  readonly contact?: unknown;
  readonly source?: unknown;
}

interface OwnedRequest {
  readonly ownerKey: string;
  readonly deviceSessionId: string;
}

async function requireOwner(request: FastifyRequest, pool: DbPool): Promise<OwnedRequest | null> {
  const token = request.cookies[SESSION_COOKIE_NAME];
  if (token === undefined || token.trim() === '') return null;
  const result = await pool.query<{ id: string; account_id: string | null }>(
    'SELECT id, account_id FROM device_session WHERE cookie_token_hash = $1',
    [hashSessionToken(token)],
  );
  const row = result.rows[0];
  if (row === undefined) return null;
  // Владелец — аккаунт, если сессия связана входом через Telegram, иначе сама сессия
  // (тот же принцип, что `consent.ts`: `ownerTable`/`ownerId`).
  return { ownerKey: row.account_id ?? row.id, deviceSessionId: row.id };
}

export function registerInterestRoute(app: FastifyInstance, deps: InterestRouteDeps): void {
  app.post<{ Body: InterestBody }>('/api/v1/interest', async (request: FastifyRequest<{ Body: InterestBody }>, reply: FastifyReply) => {
    const owner = await requireOwner(request, deps.pool);
    if (owner === null) return reply.code(401).send(fail('unauthenticated', 'сессия отсутствует'));

    const body = request.body ?? {};
    // Приведение к строке — единственная роль клиентского значения здесь: решение по
    // ФОРМЕ принимает `recordProInterest` (шаги 1-2 `RecordProInterest`), не этот маршрут
    // (AC-pro-interest-and-limits-ui-6 — прямой вызов минует ЛЮБУЮ клиентскую проверку).
    const contact = typeof body.contact === 'string' ? body.contact : '';
    const source = typeof body.source === 'string' ? body.source : '';

    let result;
    try {
      result = await recordProInterest(deps.pool, {
        ownerKey: owner.ownerKey,
        deviceSessionId: owner.deviceSessionId,
        contact,
        source,
        day: moscowDay(),
      });
    } catch (error) {
      deps.logger.error('record_interest_failed', { message: (error as Error).message });
      return reply.code(503).send(fail('dependency_unavailable', 'база данных недоступна'));
    }

    if (result.outcome === 'invalid_source') {
      return reply.code(422).send(fail('invalid_source', 'source обязан быть user_limit либо global_limit'));
    }
    if (result.outcome === 'invalid_contact') {
      return reply.code(422).send(fail('invalid_contact', 'значение контакта не распознано ни как email, ни как Telegram'));
    }
    if (result.outcome === 'already_recorded') {
      // НЕ путать с общим `429 rate_limited` ограничителя частоты (`http/rate-limit.ts`):
      // это своя, бизнесовая причина по СВОЕМУ ключу (`owner_key`, не `ip_prefix`) и своему
      // окну (календарные сутки, а не минута) — `security-operation-order.md`.
      return reply.code(429).send(fail('already_recorded_today', 'запись за сегодня уже есть'));
    }

    return reply.code(201).send(ok({ recorded: true, contact_kind: result.contactKind }));
  });
}
