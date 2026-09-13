// `POST /api/v1/scans` и `GET /api/v1/scans/{id}` — `EnqueueScanForFeature` и
// `GetScanStatus` (`02_pseudocode.md`). Требует активную сессию устройства (cookie
// `n4_session`, `foundation`): без неё `owner_key` пуст, и владение недоказуемо.

import { randomUUID } from 'node:crypto';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { DbPool, DbClient } from '@n4/db';
import { withTransaction } from '@n4/db';
import { fail, ok, type ApiConfig, type Logger } from '@n4/shared';
import { SESSION_COOKIE_NAME } from '../session/create-device-session.js';
import { moscowDay } from '../quota/keys.js';
import { consumeQuotaInTransaction } from '../quota/consume-in-transaction.js';
import { clientAddressFrom, toIpPrefix } from '../session/ip-prefix.js';
import { validateContent, isValidIdempotencyKey } from '../photo/validate-content.js';
import { isDecodable } from '../photo/decode-check.js';
import { objectKeyFor, mimeFor, type PhotoStorage } from '../photo/store-original.js';

export interface ScansRouteDeps {
  readonly pool: DbPool;
  readonly config: ApiConfig;
  readonly storage: PhotoStorage;
  readonly logger: Logger;
}

interface OwnedSession {
  readonly deviceSessionId: string;
  readonly ipPrefix: string;
  // Находка слияния consent-and-telegram-auth (merge-consent.md, DEC-A-036 №2): `account_id`
  // связанного аккаунта и его СВЕЖИЙ статус — нужны только для отказа в создании нового скана,
  // когда аккаунт в процессе удаления (см. проверку после `requireSession` в POST-обработчике).
  // `null`/`null` означает «сессия не связана ни с каким аккаунтом» — анонимный владелец
  // `erasing` не бывает по построению (маршрут удаления требует связанной сессии).
  readonly accountId: string | null;
  readonly accountStatus: string | null;
}

async function requireSession(request: FastifyRequest, pool: DbPool): Promise<OwnedSession | null> {
  const token = request.cookies[SESSION_COOKIE_NAME];
  if (token === undefined || token.trim() === '') return null;
  const { createHash } = await import('node:crypto');
  const hash = createHash('sha256').update(token, 'utf8').digest('hex');
  // LEFT JOIN — `device_session.account_id` (`ON DELETE SET NULL`) гарантирует, что строка
  // `account` существует ВСЕГДА, когда `account_id` не NULL: `account_status = NULL`
  // однозначно значит «сессия не связана», а не «строка владельца потерялась».
  const result = await pool.query<{ id: string; account_id: string | null; account_status: string | null }>(
    `SELECT ds.id, ds.account_id, a.status AS account_status
     FROM device_session ds LEFT JOIN account a ON a.id = ds.account_id
     WHERE ds.cookie_token_hash = $1`,
    [hash],
  );
  const row = result.rows[0];
  if (row === undefined) return null;
  const address = clientAddressFrom(request.headers['x-forwarded-for'], request.ip);
  return { deviceSessionId: row.id, ipPrefix: toIpPrefix(address), accountId: row.account_id, accountStatus: row.account_status };
}

interface UploadedFile {
  readonly buffer: Buffer;
}

async function readMultipartFile(request: FastifyRequest): Promise<UploadedFile | null> {
  // `@fastify/multipart` регистрирует `request.file()`. Тип не расширяется глобально —
  // достаточно узкого приведения на границе маршрута.
  const withFile = request as FastifyRequest & { file: () => Promise<{ toBuffer: () => Promise<Buffer> } | undefined> };
  const part = await withFile.file();
  if (part === undefined) return null;
  const buffer = await part.toBuffer();
  return { buffer };
}

const INSERT_PHOTO = `
  INSERT INTO photo (device_session_id, object_key, mime, bytes, width, height, expires_on, file_state)
  VALUES ($1, $2, $3, $4, $5, $6, (now() + interval '30 days')::date, 'present')
  RETURNING id
`;

const INSERT_RECOGNITION = `
  INSERT INTO recognition (id, device_session_id, idempotency_key, status, photo_id, attempt_no, escalated, lease_fence)
  VALUES ($1, $2, $3, 'queued', $4, 1, false, 0)
  ON CONFLICT (device_session_id, idempotency_key) DO NOTHING
  RETURNING id, status
`;

const SELECT_EXISTING_BY_KEY = `
  SELECT id, status FROM recognition WHERE device_session_id = $1 AND idempotency_key = $2
`;

// RV-scan-pipeline-15: БЕЗ `AND id != $2` эта проверка находит СВОЮ ЖЕ ТОЛЬКО ЧТО
// закоммиченную строку (транзакция уже COMMIT'нута) и потому возвращает ровно одну строку
// ПРИ КАЖДОМ скане — `growth_event(install)` писался на каждый скан, искажая ростовые
// метрики, а не только на первый.
const SELECT_ANY_PRIOR_SCAN = `SELECT 1 FROM recognition WHERE device_session_id = $1 AND id != $2 LIMIT 1`;
const INSERT_INSTALL_EVENT = `INSERT INTO growth_event (type, device_session_id) VALUES ('install', $1)`;

export function registerScansRoutes(app: FastifyInstance, deps: ScansRouteDeps): void {
  app.post('/api/v1/scans', async (request: FastifyRequest, reply: FastifyReply) => {
    const session = await requireSession(request, deps.pool);
    if (session === null) return reply.code(401).send(fail('unauthenticated', 'сессия отсутствует'));

    // Находка слияния consent-and-telegram-auth (merge-consent.md, DEC-A-036 №2): пока аккаунт
    // связанной сессии в статусе, ОТЛИЧНОМ от `active` (обычно `erasing` — запрошено удаление),
    // маршрут продолжал принимать новые сканы. `RunErasureJob` откладывает аккаунт, у которого
    // есть `recognition` в статусе `queued` (`erasure-job.ts`), поэтому непрерывный поток новых
    // сканов откладывал удаление НЕОГРАНИЧЕННО — при объявленном сроке 72 часа (`security.md`).
    // Fail-closed (`fail-closed-defaults.md`): проверяется РАВЕНСТВО `'active'`, а не НЕРАВЕНСТВО
    // известным плохим значениям — статус, не входящий в закрытое перечисление `account_status`
    // (сейчас такого нет, но НЕ полагаемся на это), тоже отказывает. Анонимная сессия
    // (`accountId === null`) под эту проверку не подпадает: анонимный владелец не может быть
    // `erasing` — маршрут удаления (`account-delete.ts`) требует СВЯЗАННУЮ сессию.
    if (session.accountId !== null && session.accountStatus !== 'active') {
      return reply.code(409).send(fail('account_erasing', 'аккаунт удаляется, создание новых сканов недоступно'));
    }

    // Шаг 6: формат ключа повторности — ДО загрузки объекта и ДО любого обращения к БД/квоте.
    const idempotencyKeyHeader = request.headers['idempotency-key'];
    if (!isValidIdempotencyKey(idempotencyKeyHeader)) {
      return reply.code(422).send(fail('idempotency_key_required', 'заголовок Idempotency-Key обязателен и обязан быть UUID'));
    }
    const idempotencyKey = idempotencyKeyHeader.trim().toLowerCase();

    let uploaded: UploadedFile | null;
    try {
      uploaded = await readMultipartFile(request);
    } catch {
      return reply.code(422).send(fail('invalid_image', 'тело запроса не удалось разобрать как multipart'));
    }
    if (uploaded === null) return reply.code(422).send(fail('invalid_image', 'файл изображения не передан'));

    // Шаги 2-4: сигнатура по байтам, decompression bomb, размер/разрешение.
    const validated = validateContent(uploaded.buffer);
    if (!validated.ok) {
      return reply.code(validated.httpStatus ?? 422).send(fail(validated.code ?? 'invalid_image', 'файл не прошёл проверку содержимого'));
    }
    const signature = validated.signature as NonNullable<typeof validated.signature>;

    // Шаг 5: ограниченная, но настоящая декодируемость — ДО загрузки объекта.
    const decodable = await isDecodable(uploaded.buffer);
    if (!decodable) return reply.code(422).send(fail('invalid_image', 'файл не декодируется'));

    // Шаг 7: recognition_id ДО загрузки; ключ объекта — по НЕМУ, не по содержимому.
    const recognitionId = randomUUID();
    const objectKey = objectKeyFor(session.deviceSessionId, recognitionId, signature);

    // Шаг 8: PUT ДО любой транзакции БД. Соединение с базой на этом шаге не открыто.
    try {
      await deps.storage.putOriginal(objectKey, uploaded.buffer, mimeFor(signature));
    } catch (error) {
      deps.logger.error('storage_put_failed', { message: (error as Error).message });
      return reply.code(503).send(fail('dependency_unavailable', 'хранилище недоступно'));
    }

    let width = 0;
    let height = 0;
    try {
      const sharpModule = (await import('sharp')).default;
      const metadata = await sharpModule(uploaded.buffer).metadata();
      width = metadata.width ?? 0;
      height = metadata.height ?? 0;
    } catch {
      // Метаданные для строки БД — best-effort; декодируемость уже доказана шагом 5.
    }

    let outcome:
      | { readonly kind: 'existing'; readonly scanId: string; readonly status: string }
      | { readonly kind: 'queued'; readonly scanId: string }
      | { readonly kind: 'refused'; readonly scope: 'user' | 'global' | 'escalation' };

    try {
      outcome = await withTransaction(deps.pool, async (client: DbClient) => {
        const photoRow = await client.query<{ id: string }>(INSERT_PHOTO, [
          session.deviceSessionId,
          objectKey,
          mimeFor(signature),
          uploaded.buffer.byteLength,
          width || 1,
          height || 1,
        ]);
        const photoId = photoRow.rows[0]?.id;
        if (photoId === undefined) throw new Error('строка photo не создана');

        const inserted = await client.query<{ id: string; status: string }>(INSERT_RECOGNITION, [
          recognitionId,
          session.deviceSessionId,
          idempotencyKey,
          photoId,
        ]);
        const insertedRow = inserted.rows[0];
        if (insertedRow === undefined) {
          // Конфликт по (device_session_id, idempotency_key) — повтор. ROLLBACK всей
          // транзакции (photo этой попытки НЕ сохраняется), вернуть прежний scan_id.
          const existing = await client.query<{ id: string; status: string }>(SELECT_EXISTING_BY_KEY, [
            session.deviceSessionId,
            idempotencyKey,
          ]);
          const existingRow = existing.rows[0];
          if (existingRow === undefined) throw new Error('конфликт идемпотентности без существующей строки');
          throw new IdempotentReplay(existingRow.id, existingRow.status);
        }

        const day = moscowDay();
        const decision = await consumeQuotaInTransaction(client, {
          sessionId: session.deviceSessionId,
          ipPrefix: session.ipPrefix,
          reason: 'primary',
          limits: deps.config.quota,
          day,
        });
        if (decision.outcome === 'refused') throw new QuotaRefused(decision.scope);

        return { kind: 'queued' as const, scanId: recognitionId };
      });
    } catch (error) {
      if (error instanceof IdempotentReplay) {
        // Повтор: удалить СВОЙ, только что загруженный объект (адресован recognition_id
        // ЭТОЙ отклонённой попытки — структурно не может задеть чужой, PC2-01).
        await deps.storage.removeObject(objectKey);
        return reply.code(202).send(ok({ scan_id: error.scanId, status: error.status }));
      }
      if (error instanceof QuotaRefused) {
        await deps.storage.removeObject(objectKey);
        const resetAt = nextMoscowMidnight();
        return reply
          .code(429)
          .send(fail('quota_exhausted', 'потолок исчерпан', { limit: limitForScope(deps.config, error.scope), reset_at: resetAt, scope: error.scope }));
      }
      deps.logger.error('enqueue_scan_failed', { message: (error as Error).message });
      await deps.storage.removeObject(objectKey);
      return reply.code(503).send(fail('dependency_unavailable', 'база данных недоступна'));
    }

    // Шаг 10: первый скан сессии — growth_event(install), ВНЕ транзакции.
    try {
      const prior = await deps.pool.query(SELECT_ANY_PRIOR_SCAN, [session.deviceSessionId, outcome.scanId]);
      if (prior.rowCount === 0) await deps.pool.query(INSERT_INSTALL_EVENT, [session.deviceSessionId]);
    } catch (error) {
      deps.logger.warn('install_event_failed', { message: (error as Error).message });
    }

    return reply.code(202).send(ok({ scan_id: outcome.scanId, status: 'queued' }));
  });

  app.get('/api/v1/scans/:id', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const session = await requireSession(request, deps.pool);
    if (session === null) return reply.code(401).send(fail('unauthenticated', 'сессия отсутствует'));

    const result = await deps.pool.query(
      `SELECT status, items, confidence, escalated, model_estimate_kcal, failure_reason, finished_at, created_at
       FROM recognition WHERE id = $1 AND device_session_id = $2`,
      [request.params.id, session.deviceSessionId],
    );
    const row = result.rows[0] as
      | {
          status: string;
          items: unknown;
          confidence: number | null;
          escalated: boolean;
          model_estimate_kcal: number | null;
          failure_reason: string | null;
          finished_at: Date | null;
          created_at: Date;
        }
      | undefined;
    // Чужой И несуществующий id — ОДИН и тот же 404 (AC-scan-pipeline-18).
    if (row === undefined) return reply.code(404).send(fail('not_found', 'скан не найден'));

    const items = Array.isArray(row.items)
      ? (row.items as Array<Record<string, unknown>>).map((item) => ({
          label_ru: item.labelRu ?? item.label_ru,
          mass_g: item.massG ?? item.mass_g,
          unmatched: item.unmatched ?? true,
          food_item_id: item.foodItemId ?? item.food_item_id ?? null,
        }))
      : [];

    return reply.code(200).send(
      ok(
        {
          status: row.status,
          items,
          confidence: row.confidence,
          low_confidence: row.confidence !== null && row.confidence < 0.6,
          escalated: row.escalated,
          model_estimate_kcal: row.model_estimate_kcal,
          failure_reason: row.failure_reason,
        },
        { updated_at: (row.finished_at ?? row.created_at).toISOString() },
      ),
    );
  });
}

class IdempotentReplay extends Error {
  constructor(readonly scanId: string, readonly status: string) {
    super('idempotent replay');
  }
}

class QuotaRefused extends Error {
  constructor(readonly scope: 'user' | 'global' | 'escalation') {
    super('quota refused');
  }
}

function limitForScope(config: ApiConfig, scope: 'user' | 'global' | 'escalation'): number {
  if (scope === 'user') return config.quota.scanLimitUser;
  if (scope === 'global') return config.quota.scanLimitDay;
  return config.quota.escalationLimitDay;
}

/** Следующая полночь Europe/Moscow ОТ ЭТОГО момента (FR-scan-pipeline-18). */
export function nextMoscowMidnight(at: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Moscow',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(at);
  const get = (type: string): number => Number.parseInt(parts.find((p) => p.type === type)?.value ?? '0', 10);
  // Строим следующую полночь как UTC-момент, соответствующий 00:00 Europe/Moscow дня+1,
  // используя фиксированное смещение +03:00 (Москва без переходов на летнее время).
  const y = get('year');
  const mo = get('month');
  const d = get('day');
  const nextMidnightUtc = Date.UTC(y, mo - 1, d + 1, 0, 0, 0) - 3 * 60 * 60 * 1000;
  return new Date(nextMidnightUtc).toISOString();
}
