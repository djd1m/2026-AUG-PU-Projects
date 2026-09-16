// `BuildCardPayload` (02_pseudocode.md) — собирает `ShareCardRenderInput` (ровно восемь
// полей, FR-share-card-and-growth-events-1/11) из Snapshot скана и тарифа.
//
// FR-share-card-and-growth-events-15 / AC-15: РЕЗУЛЬТАТ собирается ЯВНОЙ деструктуризацией
// восьми полей, НЕ спредом (`{ ...input }`) — вход функции МОЖЕТ нести лишние поля (граница
// сервисов, JSON, а не тип TypeScript), и они физически не должны попасть в SQL/SVG. Это
// ВТОРОЙ, поведенческий слой защиты — страж по типу (`share-card.ts`) защищает только
// компилируемый код, не JSON-границу.

import { sanitizeForCardText, type ShareCardItem, type ShareCardRenderInput } from '@n4/shared';
import type { Kcal, Macro } from '@n4/shared';

const DISH_NAME_MAX_LEN = 60;
const SOURCE_LABEL_MAX_LEN = 80;

/** Сколько позиций состава помещается на карточке, не превращая её в таблицу. */
export const MAX_CARD_ITEMS = 5;
const ITEM_LABEL_MAX_LEN = 28;

export interface BuildCardPayloadInput {
  readonly dishName: string;
  readonly items: readonly ShareCardItem[];
  readonly kcal: Kcal;
  readonly proteinG: Macro;
  readonly fatG: Macro;
  readonly carbG: Macro;
  readonly sourceLabel: string;
  readonly photoUrl: string;
  /**
   * `account.tier` прочитанный СЕРВЕРОМ — НЕ значение из тела клиентского запроса
   * (FR-share-card-and-growth-events-3). `undefined`/`null` — анонимная сессия без строки
   * `account`, трактуется КАК ЛЮБОЕ неопознанное значение.
   */
  readonly tier: unknown;
}

/**
 * Fail-closed бейдж (`honest-configuration.md` CFG-I3/I6): РОВНО `'paid'` снимает бейдж,
 * ЛЮБОЕ другое значение — включая `null`, `''`, `'PAID'`, `'premium'`, отсутствие строки —
 * ставит его. Клиентское поле тела запроса сюда не попадает вовсе — вызывающий обязан
 * передать `tier` ТОЛЬКО из строки, прочитанной сервером в транзакции создания.
 */
export function isBadgeRequired(tier: unknown): boolean {
  return tier !== 'paid';
}

/**
 * Явная деструктуризация ВХОДА (не спред) — та же вторая линия защиты на СВОЁМ конце: даже
 * если `input` в рантайме несёт лишнее поле (например, весь объект `diary_entry` по ошибке
 * вызывающего кода), только восемь перечисленных имён читаются ИЗ него.
 */
export function buildCardPayload(input: BuildCardPayloadInput & Record<string, unknown>): ShareCardRenderInput {
  const { dishName, items, kcal, proteinG, fatG, carbG, sourceLabel, photoUrl, tier } = input;
  return {
    dishName: sanitizeForCardText(dishName, DISH_NAME_MAX_LEN),
    // Тот же приём, что и для строк выше: каждая позиция чистится и укорачивается ЗДЕСЬ,
    // на границе, а не в рендере — в SVG попадает уже безопасный текст. Лишние позиции
    // отбрасываются, а не ужимаются шрифтом: шесть строк мелким кеглем читаются хуже, чем
    // пять и «и ещё N» (рисует рендер по длине исходного списка).
    items: (Array.isArray(items) ? items : []).slice(0, MAX_CARD_ITEMS).map((item) => ({
      label: sanitizeForCardText(item.label, ITEM_LABEL_MAX_LEN),
      massG: Math.max(0, Math.round(item.massG)),
      kcal: Math.max(0, Math.round(item.kcal)),
    })),
    kcal,
    proteinG,
    fatG,
    carbG,
    sourceLabel: sanitizeForCardText(sourceLabel, SOURCE_LABEL_MAX_LEN),
    badgeRendered: isBadgeRequired(tier),
    photoUrl,
  };
}
