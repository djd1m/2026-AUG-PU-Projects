// `POST /api/v1/share-cards` — маршрут 5 канона (`CreateShareCard`,
// `docs/features/share-card-and-growth-events/02_pseudocode.md`).

import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { DbPool } from '@n4/db';
import { fail, ok, type Logger } from '@n4/shared';
import { createHash } from 'node:crypto';
import { SESSION_COOKIE_NAME } from '../session/create-device-session.js';
import { createShareCard, recordShareClickForCaller, type CreateShareCardDeps } from '../share/create-share-card.js';
import type { PhotoStorage } from '../photo/store-original.js';

export interface ShareCardsRouteDeps {
  readonly pool: DbPool;
  readonly storage: PhotoStorage;
  readonly logger: Logger;
}

interface CallerSession {
  readonly deviceSessionId: string;
  readonly accountId: string | null;
}

async function requireCallerSession(request: FastifyRequest, pool: DbPool): Promise<CallerSession | null> {
  const token = request.cookies[SESSION_COOKIE_NAME];
  if (token === undefined || token.trim() === '') return null;
  const hash = createHash('sha256').update(token, 'utf8').digest('hex');
  const result = await pool.query<{ id: string; account_id: string | null }>('SELECT id, account_id FROM device_session WHERE cookie_token_hash = $1', [hash]);
  const row = result.rows[0];
  if (row === undefined) return null;
  return { deviceSessionId: row.id, accountId: row.account_id };
}

interface ShareCardsBody {
  readonly recognition_id?: string;
}

export function registerShareCardsRoute(app: FastifyInstance, deps: ShareCardsRouteDeps): void {
  const createDeps: CreateShareCardDeps = { pool: deps.pool, storage: deps.storage };

  app.post<{ Body: ShareCardsBody }>('/api/v1/share-cards', async (request: FastifyRequest<{ Body: ShareCardsBody }>, reply: FastifyReply) => {
    const session = await requireCallerSession(request, deps.pool);
    if (session === null) return reply.code(401).send(fail('unauthenticated', 'сессия отсутствует'));

    const recognitionId = request.body?.recognition_id;
    if (typeof recognitionId !== 'string' || recognitionId.trim() === '') {
      return reply.code(422).send(fail('invalid_request', 'recognition_id обязателен'));
    }

    let outcome: Awaited<ReturnType<typeof createShareCard>>;
    try {
      outcome = await createShareCard(createDeps, {
        recognitionId,
        callerDeviceSessionId: session.deviceSessionId,
        callerAccountId: session.accountId,
      });
    } catch (error) {
      deps.logger.error('create_share_card_failed', { message: (error as Error).message });
      return reply.code(503).send(fail('dependency_unavailable', 'карточка не собрана'));
    }

    if (outcome.kind === 'not_found') return reply.code(404).send(fail('not_found', 'скан не найден'));
    if (outcome.kind === 'not_done') return reply.code(409).send(fail('scan_not_done', 'скан ещё не завершён'));
    if (outcome.kind === 'refused') return reply.code(403).send(fail('consent_required', 'согласие обязательно перед созданием карточки'));

    // `share_click` — на ОБОИХ успешных исходах (created/existing, FR-8). Сбой записи
    // события не должен превращать успешное создание/получение карточки в ошибку клиенту —
    // тот же принцип, что `RecordCardView` (шаг 5, «событие теряется, а не карточка»).
    try {
      await recordShareClickForCaller(createDeps, outcome.cardId, session.deviceSessionId);
    } catch (error) {
      deps.logger.warn('record_share_click_failed', { message: (error as Error).message });
    }

    const status = outcome.kind === 'created' ? 201 : 200;
    return reply.code(status).send(ok({ card_id: outcome.cardId, url: `/c/${outcome.cardId}` }));
  });
}
