// `POST /api/v1/scans/{id}/correct` — `CorrectScan` (`02_pseudocode.md`, FR-source-and-
// correct-9/10/11). Ограничение частоты — общий хук `onRequest` (`server.ts`), ДО разбора
// тела для ВСЕХ маршрутов; здесь это не переопределяется (`security-operation-order.md`).

import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { DbPool } from '@n4/db';
import { withTransaction } from '@n4/db';
import { searchFoodCandidatesForReplace } from '@n4/db';
import { fail, ok, type Logger } from '@n4/shared';
import { requireSession } from './scans.js';
import { buildScanResponse, parseItems, type ScanRow } from '../correct/response.js';
import { applyCorrectOp, type CurrentScanRow } from '../correct/apply-op.js';
import { validateOp, validateQuery, type CorrectRequestBody } from '../correct/validate-input.js';
import { resolveScanPhotoResponse } from '../photo/photo-url.js';
import type { PhotoStorage } from '../photo/store-original.js';

export interface ScansCorrectRouteDeps {
  readonly pool: DbPool;
  // FR-LOOK-007/DEC-A-050: этот маршрут отдаёт то же тело, что `GET /scans/{id}`
  // (`buildScanResponse`) — без `storage` ответ правки не мог бы нести `photo_url`, и кадр
  // тихо пропадал бы с экрана результата после любого действия (степпер, замена, удаление).
  readonly storage: PhotoStorage;
  readonly logger: Logger;
}

const SELECT_FOR_CORRECT = `
  SELECT id, status::text AS status, items, confidence, escalated, model_estimate_kcal, failure_reason::text AS failure_reason,
         db_kcal_total, discrepancy_ratio, conflict_flag, conflict_choice, conflict_choice_at, user_corrected, corrections, finished_at, created_at
  FROM recognition WHERE id = $1 AND device_session_id = $2
  FOR UPDATE
`;

const UPDATE_AFTER_CORRECT = `
  UPDATE recognition
  SET items = $3::jsonb,
      corrections = $4::jsonb,
      db_kcal_total = $5,
      discrepancy_ratio = $6,
      conflict_flag = $7,
      conflict_choice = $8,
      conflict_choice_at = $9,
      user_corrected = $10
  WHERE id = $1 AND device_session_id = $2
  RETURNING id, status::text AS status, items, confidence, escalated, model_estimate_kcal, failure_reason::text AS failure_reason,
            db_kcal_total, discrepancy_ratio, conflict_flag, conflict_choice, conflict_choice_at, user_corrected, finished_at, created_at,
            photo_id
`;

interface CorrectRow extends ScanRow {
  readonly corrections: unknown;
}

export function registerScansCorrectRoute(app: FastifyInstance, deps: ScansCorrectRouteDeps): void {
  app.post('/api/v1/scans/:id/correct', async (request: FastifyRequest<{ Params: { id: string }; Body: CorrectRequestBody }>, reply: FastifyReply) => {
    const session = await requireSession(request, deps.pool);
    if (session === null) return reply.code(401).send(fail('unauthenticated', 'сессия отсутствует'));

    const body = (request.body ?? {}) as CorrectRequestBody;
    const opResult = validateOp(body);
    if (!opResult.ok) return reply.code(422).send(fail(opResult.error.code, opResult.error.message, opResult.error.details));
    const op = opResult.value;

    // `replace_item` с `query` — ЧИСТЫЙ поиск, состав скана НЕ меняется (FR-source-and-
    // correct-10). Владение всё равно проверяется — иначе перебор `id` подтверждал бы,
    // что скан существует и в статусе `done`, чужой сессии.
    if (op === 'replace_item' && typeof body.query === 'string') {
      const queryResult = validateQuery(body);
      if (!queryResult.ok) return reply.code(422).send(fail(queryResult.error.code, queryResult.error.message));
      const owned = await deps.pool.query<{ status: string }>(`SELECT status::text AS status FROM recognition WHERE id = $1 AND device_session_id = $2`, [request.params.id, session.deviceSessionId]);
      const ownedRow = owned.rows[0];
      if (ownedRow === undefined) return reply.code(404).send(fail('not_found', 'скан не найден'));
      if (ownedRow.status !== 'done') return reply.code(409).send(fail('scan_not_done', 'скан ещё не завершён'));
      const candidates = await searchFoodCandidatesForReplace(deps.pool, queryResult.value);
      const scanResult = await deps.pool.query<ScanRow>(
        `SELECT id, status::text AS status, items, confidence, escalated, model_estimate_kcal, failure_reason::text AS failure_reason,
                db_kcal_total, discrepancy_ratio, conflict_flag, conflict_choice, conflict_choice_at, user_corrected, finished_at, created_at,
                photo_id
         FROM recognition WHERE id = $1`,
        [request.params.id],
      );
      const scanRow = scanResult.rows[0] as ScanRow;
      // Чистый поиск не меняет скан — кадр тот же, что и в GET (FR-LOOK-007/DEC-A-050).
      const photo = await resolveScanPhotoResponse(deps.pool, deps.storage, scanRow.id, scanRow.photo_id);
      return reply.code(200).send(ok(buildScanResponse(scanRow, { candidates, photo })));
    }

    try {
      const updated = await withTransaction(deps.pool, async (client) => {
        const current = await client.query<CorrectRow>(SELECT_FOR_CORRECT, [request.params.id, session.deviceSessionId]);
        const currentRow = current.rows[0];
        // Чужой И несуществующий `id` — ОДИН и тот же `404` (AC-source-and-correct-23).
        if (currentRow === undefined) throw new RouteError(404, 'not_found', 'скан не найден');
        if (currentRow.status !== 'done') throw new RouteError(409, 'scan_not_done', 'скан ещё не завершён');

        const currentForOp: CurrentScanRow = {
          items: parseItems(currentRow.items),
          model_estimate_kcal: currentRow.model_estimate_kcal,
          conflict_flag: currentRow.conflict_flag,
          conflict_choice: currentRow.conflict_choice,
          conflict_choice_at: currentRow.conflict_choice_at,
          corrections: Array.isArray(currentRow.corrections) ? currentRow.corrections : [],
        };

        const applied = await applyCorrectOp(client, currentForOp, op, body);
        if (applied.kind === 'error') throw new RouteError(applied.status, applied.error.code, applied.error.message, applied.error.details);

        const userCorrected = currentRow.user_corrected || applied.result.userCorrected;
        const result = await client.query<ScanRow>(UPDATE_AFTER_CORRECT, [
          request.params.id,
          session.deviceSessionId,
          JSON.stringify(applied.result.items),
          JSON.stringify(applied.result.corrections),
          applied.result.dbKcalTotal,
          applied.result.discrepancyRatio,
          applied.result.conflictFlag,
          applied.result.conflictChoice,
          applied.result.conflictChoiceAt,
          userCorrected,
        ]);
        const updatedRow = result.rows[0];
        if (updatedRow === undefined) throw new RouteError(404, 'not_found', 'скан не найден');
        return updatedRow;
      });
      // Presigned-URL — ПОСЛЕ закрытия транзакции (`shared-resource-verification.md`,
      // вопрос 1): сетевой вызов клиента хранилища не должен удерживать блокировку строки
      // `FOR UPDATE`, которую держала транзакция выше.
      const photo = await resolveScanPhotoResponse(deps.pool, deps.storage, updated.id, updated.photo_id);
      return reply.code(200).send(ok(buildScanResponse(updated, { photo })));
    } catch (error) {
      if (error instanceof RouteError) {
        return reply.code(error.status).send(fail(error.code, error.message, error.details));
      }
      deps.logger.error('correct_scan_failed', { message: (error as Error).message });
      return reply.code(503).send(fail('dependency_unavailable', 'база данных недоступна'));
    }
  });
}

/**
 * Отказ ВНУТРИ транзакции обязан быть ИСКЛЮЧЕНИЕМ — штатный возврат из колбэка её
 * КОММИТИТ вместе со всем, что успело записаться (`security-operation-order.md`).
 */
class RouteError extends Error {
  constructor(readonly status: 404 | 409 | 422, readonly code: string, message: string, readonly details?: Record<string, unknown>) {
    super(message);
  }
}
