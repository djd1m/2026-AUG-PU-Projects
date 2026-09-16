// `CreateShareCard` (02_pseudocode.md) — оркестратор маршрута 5. Собирает: проверку
// владения/статуса скана, чтение Snapshot, рендер файла, тариф fail-closed, вставку под
// защитой согласия (`share-card-repository.ts`) и запись `growth_event(share_click)`.
//
// ОТКЛОНЕНИЕ от буквального порядка операций `02_pseudocode.md` (названо явно, не скрыто):
// рендер изображения (сеть — `fetch` presigned-URL, затем `sharp`) выполняется ДО открытия
// транзакции создания, а не ВНУТРИ неё, и ПОСЛЕ дешёвой предварительной проверки согласия
// (см. `preCheck` ниже, DEC-A-034). Причина — `shared-resource-verification.md`,
// вопрос 1 («что удерживается и как долго? Время, которым управляет КЛИЕНТ/сеть — всегда
// красный флаг»): держать блокировку строки владельца (`FOR UPDATE`) на время сетевого
// вызова расширяет окно конкуренции с `RevokeConsentOrErase` и `AC-17` (20 одновременных
// создателей) без всякой пользы — рендер детерминирован входом, и 20 параллельных рендеров
// одного и того же Snapshot производят БАЙТ-В-БАЙТ одинаковый файл под ОДНИМ и тем же
// `object_key`; какая из копий физически допишется в бакет последней, значения не имеет.
// Тариф читается ОДИН раз, тем же запросом, ДО рендера — чтобы значение `badgeRendered`,
// нарисованное НА изображении, и значение, записанное в колонку `badge_rendered`, никогда
// не расходились (если читать тариф ПОВТОРНО внутри транзакции создания, окно между двумя
// чтениями могло бы дать разные значения — на MVP это принятый риск: платного пути ещё нет,
// `05_completion.md`, тариф не меняется вне прямой записи в тестах).

import type { DbPool } from '@n4/db';
import { resolveTier } from '../subscription/is-pro.js';
import { buildCardPayload } from './build-card-payload.js';
import { renderCardImage, type RenderCardImageDeps } from './render-card-image.js';
import { createShareCardGuarded } from './share-card-repository.js';
import { enforceConsentBeforeDiaryWrite, type ConsentOwnerRef } from '../consent/enforce-before-diary-write.js';
import { findOwnedRecognition, readRecognitionSnapshot } from './read-recognition-snapshot.js';
import { recordShareClick, findAttributionForSession } from '../growth/record-growth-event.js';
import type { PhotoStorage } from '../photo/store-original.js';

/** ADR-010 — тот же срок, что уже действует для presigned-URL фото владельца. */
export const PRESIGN_TTL_SECONDS = 15 * 60;

export type CreateShareCardOutcome =
  | { readonly kind: 'created'; readonly cardId: string }
  | { readonly kind: 'existing'; readonly cardId: string }
  | { readonly kind: 'not_found' }
  | { readonly kind: 'not_done' }
  | { readonly kind: 'refused'; readonly reason: 'consent_required' };

export interface CreateShareCardDeps {
  readonly pool: DbPool;
  readonly storage: PhotoStorage;
  readonly renderDeps?: RenderCardImageDeps;
}

export interface CreateShareCardInput {
  readonly recognitionId: string;
  readonly callerDeviceSessionId: string;
  readonly callerAccountId: string | null;
}

function ownerRefFor(input: CreateShareCardInput): ConsentOwnerRef {
  return input.callerAccountId !== null
    ? { table: 'account', id: input.callerAccountId }
    : { table: 'device_session', id: input.callerDeviceSessionId };
}

async function readTier(deps: CreateShareCardDeps, accountId: string | null): Promise<unknown> {
  if (accountId === null) return undefined; // анонимная сессия — строки account нет вовсе (E3, AC-4).
  // Тариф — по АКТИВНОЙ ПОДПИСКЕ, а не по `account.tier`: поле никем не поддерживалось, и
  // оплатившие получали бейдж как бесплатные (OWN-012, `subscription/is-pro.ts`).
  return resolveTier(deps.pool, accountId);
}

export function shareCardObjectKey(recognitionId: string): string {
  // Детерминированный ключ (не по содержимому) — повторный рендер того же скана
  // перезаписывает ТОТ ЖЕ объект, не плодит мусор (`03_architecture.md`).
  return `share-cards/${recognitionId}.jpg`;
}

/**
 * Единственный путь создания карточки (маршрут 5 обязан вызывать ТОЛЬКО эту функцию).
 * `share_click` НЕ пишется здесь — вызывающий (маршрут) обязан вызвать его САМ на ОБОИХ
 * успешных исходах (`created`/`existing`), потому что повторный клик по уже существующей
 * карточке (E5, AC-11) тоже считается кликом, а этот оркестратор не знает разницы между
 * «первый вызов маршрута» и «десятый» — это дело маршрута, не создания.
 */
export async function createShareCard(deps: CreateShareCardDeps, input: CreateShareCardInput): Promise<CreateShareCardOutcome> {
  const recognition = await findOwnedRecognition(deps.pool, input.recognitionId);
  // Владение — КАК ВО ВСЕХ маршрутах канона: чужое и несуществующее неразличимы (404).
  if (recognition === null || recognition.deviceSessionId !== input.callerDeviceSessionId) {
    return { kind: 'not_found' };
  }
  if (recognition.status !== 'done') return { kind: 'not_done' };

  // Идемпотентность — быстрый путь ВНЕ транзакции (шаг 3 псевдокода): не пересобирает файл
  // и не трогает БД лишний раз, если карточка уже есть. Гонку ДВУХ одновременных первых
  // вызовов закрывает `ON CONFLICT DO NOTHING` в `createShareCardGuarded` (AC-17), этот
  // ранний выход — оптимизация повторных вызовов, а не единственная защита.
  const existingResult = await deps.pool.query<{ id: string }>('SELECT id FROM share_card WHERE recognition_id = $1', [input.recognitionId]);
  const existingRow = existingResult.rows[0];
  if (existingRow !== undefined) return { kind: 'existing', cardId: existingRow.id };

  // ИСПРАВЛЕНИЕ (ревизия после гибели предыдущей сессии, DEC-A-034 «отложенная сборка»):
  // предварительная, НЕ авторитетная проверка согласия — ДО чтения Snapshot, ДО фетча фото и
  // ДО рендера/загрузки файла в бакет. Без неё для КАЖДОГО скана без согласия (типичный первый
  // анонимный скан, E14) собирался и клался в бакет JPEG с полным составом блюда (ккал, белки,
  // жиры, углеводы, название) ДО какого-либо решения о согласии — а DEC-A-034 разрешает сборку
  // ДО согласия только когда карточка НЕ несёт данных о питании, что здесь неверно. Это ПРОСТОЙ
  // `pool.query` (без `FOR UPDATE`, без транзакции) — он не участвует в атомарной защите от
  // гонки с отзывом (FR-9, ниже, в `createShareCardGuarded`) и не обязан участвовать: это только
  // фильтр «не делать дорогую и небезопасную работу, когда согласия точно нет», а не источник
  // истины. Гонка «согласие было, но отозвано МЕЖДУ этой проверкой и `createShareCardGuarded`»
  // остаётся — и остаётся ЗАКОННО: она уже закрыта на уровне СТРОКИ (FR-9) и не создаёт открытую
  // карточку дольше момента коммита отзыва; здесь речь только про артефакт в бакете для случая,
  // когда согласия НЕ БЫЛО НИКОГДА, а не про узкое окно гонки.
  const preCheck = await enforceConsentBeforeDiaryWrite(deps.pool, ownerRefFor(input));
  if (preCheck.outcome === 'refused') return { kind: 'refused', reason: 'consent_required' };

  const snapshot = await readRecognitionSnapshot(deps.pool, input.recognitionId);
  if (snapshot === null) {
    // `done` без единой сопоставленной позиции противоречит DEC-A-014/023 — внутренняя
    // несогласованность, не пользовательский отказ; названо явно, не проглочено молча.
    throw new Error(`recognition ${input.recognitionId} в статусе done без сопоставленных позиций — Snapshot пуст`);
  }

  if (recognition.photoId === null) throw new Error(`recognition ${input.recognitionId} без photo_id`);
  const photoRow = await deps.pool.query<{ object_key: string }>('SELECT object_key FROM photo WHERE id = $1', [recognition.photoId]);
  const photoObjectKey = photoRow.rows[0]?.object_key;
  if (photoObjectKey === undefined) throw new Error(`photo для recognition ${input.recognitionId} не найдено`);
  const photoUrl = await deps.storage.presignedGetUrl(photoObjectKey, PRESIGN_TTL_SECONDS);

  const tier = await readTier(deps, input.callerAccountId);

  const payload = buildCardPayload({
    dishName: snapshot.dishName,
    kcal: snapshot.kcalTotal,
    proteinG: snapshot.proteinTotal,
    fatG: snapshot.fatTotal,
    carbG: snapshot.carbTotal,
    sourceLabel: snapshot.sourceLabel,
    photoUrl,
    tier,
  });

  const imageBuffer = await renderCardImage(payload, deps.renderDeps);
  const objectKey = shareCardObjectKey(input.recognitionId);
  await deps.storage.putOriginal(objectKey, imageBuffer, 'image/jpeg');

  const created = await createShareCardGuarded(deps.pool, {
    owner: ownerRefFor(input),
    recognitionId: input.recognitionId,
    objectKey,
    badgeRendered: payload.badgeRendered,
  });

  if (created.outcome === 'refused') return { kind: 'refused', reason: 'consent_required' };
  return created.outcome === 'created' ? { kind: 'created', cardId: created.id } : { kind: 'existing', cardId: created.id };
}

/** `share_click` — на ОБОИХ успешных исходах маршрута 5 (FR-8), не внутри `createShareCard`. */
export async function recordShareClickForCaller(deps: CreateShareCardDeps, cardId: string, callerDeviceSessionId: string): Promise<void> {
  const partnerCodeId = await findAttributionForSession(deps.pool, callerDeviceSessionId);
  await recordShareClick(deps.pool, { shareCardId: cardId, deviceSessionId: callerDeviceSessionId, partnerCodeId });
}
