// `GET /api/v1/diary` и `PATCH /api/v1/diary/{entry_id}` — маршруты 4 и 11 канона
// (`02_pseudocode.md`, «API Contracts»). Требуют активную сессию устройства (cookie `n4_session`,
// `foundation`), как и `routes/scans.ts`.
//
// `{entry_id}` живёт в ДВУХ пространствах идентификаторов, ОСОЗНАННО (01_specification.md,
// «Осознанное разрешение унаследованной неоднозначности маршрута 11»): при `op: 'confirm'` это
// `recognition_id` (строки `diary_entry` до вызова ещё не существует), при `set_portion`/`delete`
// — `diary_entry.id`. Владение в обоих пространствах проверяется по `owner_key`, вычисленному ИЗ
// СЕССИИ, а не по идентификатору из тела запроса.

import { createHash } from 'node:crypto';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { DbPool } from '@n4/db';
import { fail, ok, type Logger } from '@n4/shared';
import { SESSION_COOKIE_NAME } from '../session/create-device-session.js';
import type { ConsentOwnerRef } from '../consent/enforce-before-diary-write.js';
import { confirmDiaryEntry } from '../diary/confirm-diary-entry.js';
import { setDiaryEntryPortion } from '../diary/set-diary-entry-portion.js';
import { deleteDiaryEntry } from '../diary/delete-diary-entry.js';
import { getDiaryDay } from '../diary/get-diary-day.js';
import { PORTION_MAX_GRAMS, PORTION_MIN_GRAMS } from '../diary/portion-bounds.js';
import type { DiaryEntryRow } from '../diary/diary-entry-repository.js';

export interface DiaryRouteDeps {
  readonly pool: DbPool;
  readonly logger: Logger;
}

interface CallerSession {
  readonly deviceSessionId: string;
  readonly accountId: string | null;
}

/** Тот же приём, что `routes/scans.ts::requireSession`: неизвестный/отсутствующий токен — 401. */
async function requireCallerSession(request: FastifyRequest, pool: DbPool): Promise<CallerSession | null> {
  const token = request.cookies[SESSION_COOKIE_NAME];
  if (token === undefined || token.trim() === '') return null;
  const hash = createHash('sha256').update(token, 'utf8').digest('hex');
  const result = await pool.query<{ id: string; account_id: string | null }>(
    'SELECT id, account_id FROM device_session WHERE cookie_token_hash = $1',
    [hash],
  );
  const row = result.rows[0];
  if (row === undefined) return null;
  return { deviceSessionId: row.id, accountId: row.account_id };
}

/** Канонический владелец для `EnforceConsentBeforeDiaryWrite` — тот же приём, что `routes/consent.ts`. */
function ownerRefOf(session: CallerSession): ConsentOwnerRef {
  return session.accountId !== null ? { table: 'account', id: session.accountId } : { table: 'device_session', id: session.deviceSessionId };
}

function ownerKeyOf(session: CallerSession): string {
  return session.accountId ?? session.deviceSessionId;
}

function requestIdOf(request: FastifyRequest): string {
  return (request as FastifyRequest & { n4RequestId?: string }).n4RequestId ?? 'unknown';
}

function entryPayload(entry: DiaryEntryRow): Record<string, unknown> {
  return {
    entry_id: entry.id,
    recognition_id: entry.recognition_id,
    eaten_on: entry.eaten_on,
    meal_slot: entry.meal_slot,
    items: entry.items,
    kcal_total: entry.kcal_total,
    protein_total: Number(entry.protein_total),
    fat_total: Number(entry.fat_total),
    carb_total: Number(entry.carb_total),
    user_corrected: entry.user_corrected,
  };
}

interface PatchDiaryBody {
  readonly op?: unknown;
  readonly index?: unknown;
  readonly mass_g?: unknown;
}

export function registerDiaryRoutes(app: FastifyInstance, deps: DiaryRouteDeps): void {
  app.get('/api/v1/diary', async (request: FastifyRequest<{ Querystring: { date?: string } }>, reply: FastifyReply) => {
    const session = await requireCallerSession(request, deps.pool);
    if (session === null) return reply.code(401).send(fail('unauthenticated', 'сессия отсутствует'));

    const result = await getDiaryDay(deps.pool, ownerKeyOf(session), request.query.date);
    if (result.outcome === 'invalid_date') {
      return reply.code(422).send(fail('invalid_date', 'date обязана быть корректной календарной датой не позже сегодняшней по Europe/Moscow'));
    }

    return reply.code(200).send(
      ok(
        {
          date: result.date,
          entries: result.entries.map(entryPayload),
          totals: result.totals.totals,
          by_meal: result.totals.byMeal,
          streak: { days: result.streak.days, frozen_days: result.streak.frozenDays },
        },
        { request_id: requestIdOf(request), timezone: 'Europe/Moscow' },
      ),
    );
  });

  app.patch(
    '/api/v1/diary/:entryId',
    async (request: FastifyRequest<{ Params: { entryId: string }; Body: PatchDiaryBody }>, reply: FastifyReply) => {
      const session = await requireCallerSession(request, deps.pool);
      if (session === null) return reply.code(401).send(fail('unauthenticated', 'сессия отсутствует'));

      const body = request.body ?? {};
      const entryId = request.params.entryId;

      if (body.op === 'confirm') {
        const result = await confirmDiaryEntry({
          pool: deps.pool,
          owner: ownerRefOf(session),
          deviceSessionId: session.deviceSessionId,
          accountId: session.accountId,
          recognitionId: entryId,
        });
        if (result.outcome === 'refused') {
          return reply.code(403).send(fail('consent_required', 'согласие на обработку данных о питании не дано'));
        }
        if (result.outcome === 'not_found') return reply.code(404).send(fail('not_found', 'скан не найден'));
        if (result.outcome === 'not_done') {
          return reply
            .code(409)
            .send(fail('not_done', 'скан ещё не в статусе done', { failure_reason: result.failureReason }));
        }
        return reply
          .code(200)
          .send(ok({ entry: entryPayload(result.entry), totals: result.totals.totals }, { request_id: requestIdOf(request) }));
      }

      if (body.op === 'set_portion') {
        const result = await setDiaryEntryPortion({
          pool: deps.pool,
          ownerKey: ownerKeyOf(session),
          entryId,
          index: body.index,
          massG: body.mass_g,
        });
        if (result.outcome === 'not_found') return reply.code(404).send(fail('not_found', 'запись не найдена'));
        if (result.outcome === 'already_deleted') return reply.code(409).send(fail('already_deleted', 'запись уже удалена'));
        if (result.outcome === 'invalid') {
          const isPortion = result.code === 'portion_out_of_range';
          return reply
            .code(422)
            .send(
              fail(
                result.code,
                isPortion ? 'масса порции вне диапазона 5–2000 г' : 'индекс позиции вне списка',
                isPortion ? { range: [PORTION_MIN_GRAMS, PORTION_MAX_GRAMS] } : undefined,
              ),
            );
        }
        return reply
          .code(200)
          .send(ok({ entry: entryPayload(result.entry), totals: result.totals.totals }, { request_id: requestIdOf(request) }));
      }

      if (body.op === 'delete') {
        const result = await deleteDiaryEntry(deps.pool, entryId, ownerKeyOf(session));
        if (result.outcome === 'not_found') return reply.code(404).send(fail('not_found', 'запись не найдена'));
        if (result.outcome === 'already_deleted') return reply.code(409).send(fail('already_deleted', 'запись уже удалена'));
        return reply.code(200).send(ok({ totals: result.totals.totals }, { request_id: requestIdOf(request) }));
      }

      return reply.code(422).send(fail('unknown_op', 'op обязан быть confirm, set_portion или delete'));
    },
  );
}
