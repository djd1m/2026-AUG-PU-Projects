// `GET /internal/share-cards/:cardId` — данные для `RenderPublicCardPage` (маршрут 6 канона,
// `02_pseudocode.md`). НЕ входит в канон «ровно 14 маршрутов /api/v1» и НЕ проксируется наружу
// `Caddyfile` (тот пробрасывает наружу только `/api/*` и `/health`, `03_architecture.md`) — этот
// путь достижим ТОЛЬКО изнутри сети compose, вызывающий — `apps/web` (`API_INTERNAL_URL =
// http://api:3000`). Разместить эту же логику под `/api/v1/...` означало бы либо нарушить
// зафиксированный счёт маршрутов канона, либо сделать её ПУБЛИЧНО вызываемой напрямую в обход
// `/c/{card_id}` (например, для перебора `card_id` без реального открытия страницы) — оба хуже,
// чем отдельный, не проксируемый префикс.
//
// Отвечает ЗА ОБЕ вещи шага 1-3 `RenderPublicCardPage`: проверка `revoked_at`, минтинг
// presigned-URL (СТРОГО после этой проверки — FR-6), разрешение владельца в
// `device_session_id`/`partner_code_id` и запись `growth_event(card_view)` (FR-7) — колокация
// оправдана тем, что `web` не имеет доступа к БД и к ключам S3 напрямую
// (`03_architecture.md`, «web без секретов вызова наружу»).
//
// Тело картинки отдаётся ВТОРЫМ, отдельным маршрутом (`.../image`) — а не presigned-URL,
// вложенным в JSON-ответ первого: браузер запрашивает `<img src>` ОТДЕЛЬНЫМ HTTP-запросом,
// независимо от HTML-запроса, и присвоение этому запросу СВОЕГО обращения к
// `.../:cardId` удвоило бы `growth_event(card_view)` НА КАЖДЫЙ реальный просмотр (AC-10 требует
// РОВНО одну строку на открытие, не одну на HTTP-запрос браузера). Поэтому запись события живёт
// ТОЛЬКО в маршруте метаданных (вызывается ПЕРВЫМ в `RenderPublicCardPage`), а маршрут картинки
// заново проверяет `revoked_at` (AC-9 — живая проверка, а не разовая) и стримит байты САМ, не
// отдавая браузеру ссылку на `minio:9000` — этот адрес не существует за пределами сети compose.

import type { FastifyInstance } from 'fastify';
import type { DbPool } from '@n4/db';
import { fail, ok } from '@n4/shared';
import type { PhotoStorage } from '../photo/store-original.js';
import { readRecognitionSnapshot } from '../share/read-recognition-snapshot.js';
import { PRESIGN_TTL_SECONDS } from '../share/create-share-card.js';
import { recordCardView, resolveOwnerGrowthContext } from '../growth/record-growth-event.js';

export interface ShareCardInternalRouteDeps {
  readonly pool: DbPool;
  readonly storage: PhotoStorage;
}

interface ShareCardRow {
  readonly owner_key: string;
  readonly recognition_id: string;
  readonly object_key: string;
  readonly badge_rendered: boolean;
  readonly revoked_at: Date | null;
}

// UUID синтаксически невалидный `card_id` (E9, AC-7) обязан давать ТОТ ЖЕ 404, что
// несуществующий/отозванный — Postgres иначе бросил бы `invalid input syntax for type uuid`
// (500), а это уже РАЗЛИЧИМЫЙ ответ (утечка «такого не может существовать» от «может, но нет»).
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function findOpenShareCard(pool: DbPool, cardId: string): Promise<ShareCardRow | null> {
  if (!UUID_RE.test(cardId)) return null;
  const result = await pool.query<ShareCardRow>(
    'SELECT owner_key, recognition_id, object_key, badge_rendered, revoked_at FROM share_card WHERE id = $1',
    [cardId],
  );
  const row = result.rows[0];
  // Неизвестная И отозванная карточка — ОДИН и тот же ответ (AC-7): причина отказа наружу не
  // просачивается ни по телу, ни по времени ответа (обе ветки — один индексный SELECT).
  if (row === undefined || row.revoked_at !== null) return null;
  return row;
}

export function registerShareCardInternalRoute(app: FastifyInstance, deps: ShareCardInternalRouteDeps): void {
  app.get<{ Params: { cardId: string } }>('/internal/share-cards/:cardId', async (request, reply) => {
    // `no-store` на КАЖДОЙ ветке этого обработчика ОДНОЙ строкой — тот же принцип, что и на
    // самой публичной странице (FR-5/8): промежуточное звено не должно закэшировать и этот ответ.
    reply.header('Cache-Control', 'no-store');

    const row = await findOpenShareCard(deps.pool, request.params.cardId);
    if (row === null) return reply.code(404).send(fail('not_found', 'карточка не найдена'));

    const snapshot = await readRecognitionSnapshot(deps.pool, row.recognition_id);
    // Snapshot пуст здесь означало бы ту же внутреннюю несогласованность, что и при создании —
    // карточка физически существует, значит Snapshot существовал на момент её сборки.
    if (snapshot === null) throw new Error(`share_card ${request.params.cardId}: Snapshot recognition ${row.recognition_id} пуст`);

    // `card_view` — от имени ВЛАДЕЛЬЦА карточки, зритель НЕ идентифицируется, не получает cookie,
    // его IP этим кодом не читается и не сохраняется (FR-7, NFR-2). Сбой записи события не должен
    // превращать успешный просмотр в отказ зрителю — событие теряется, а не страница (шаг 5).
    const ownerContext = await resolveOwnerGrowthContext(deps.pool, row.owner_key);
    if (ownerContext !== null) {
      try {
        await recordCardView(deps.pool, {
          shareCardId: request.params.cardId,
          deviceSessionId: ownerContext.deviceSessionId,
          partnerCodeId: ownerContext.partnerCodeId,
        });
      } catch {
        // Событие теряется молча — см. обоснование выше; ответ зрителю не должен пострадать.
      }
    }

    return reply.code(200).send(
      ok({
        dish_name: snapshot.dishName,
        source_label: snapshot.sourceLabel,
        badge_rendered: row.badge_rendered,
      }),
    );
  });

  app.get<{ Params: { cardId: string } }>('/internal/share-cards/:cardId/image', async (request, reply) => {
    reply.header('Cache-Control', 'no-store');

    // Живая проверка `revoked_at` (AC-9) — НЕ переиспользует решение, принятое маршрутом
    // метаданных: браузер запрашивает картинку отдельным запросом, который может прийти позже
    // (отзыв между двумя запросами обязан закрыть и этот путь тоже), и НЕ пишет `card_view`
    // повторно (см. комментарий файла).
    const row = await findOpenShareCard(deps.pool, request.params.cardId);
    if (row === null) return reply.code(404).send(fail('not_found', 'карточка не найдена'));

    const presignedUrl = await deps.storage.presignedGetUrl(row.object_key, PRESIGN_TTL_SECONDS);
    const upstream = await fetch(presignedUrl);
    if (!upstream.ok || upstream.body === null) {
      return reply.code(404).send(fail('not_found', 'карточка не найдена'));
    }
    const bytes = Buffer.from(await upstream.arrayBuffer());
    return reply.code(200).header('Content-Type', 'image/jpeg').send(bytes);
  });
}
