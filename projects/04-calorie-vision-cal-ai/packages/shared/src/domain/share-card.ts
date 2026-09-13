// `ShareCardRenderInput` — ЕДИНСТВЕННЫЙ вход рендера карточки (FR-share-card-and-growth-events-1/11).
// ЗАКРЫТОЕ множество из восьми полей: это САМ контракт, а не документация к нему.
// `GuardShareCardFieldSet` (tests/guard/share-card-field-set.test.ts) проверяет ИМЕННО это
// множество РАВЕНСТВОМ, а не подмножеством — новое поле того же смысла (например
// `dailyTotalKcal`) красит страж так же, как явно запрещённое имя.
//
// Полей `weightKg`, `goalKcal`, `dailyTotalKcal`, `streakDays` здесь НЕТ и не может появиться
// без правки строки стража — это граница персональных данных (NFR-SEC-002), а не оформление.

import type { Kcal, Macro } from './units.js';

export interface ShareCardRenderInput {
  readonly dishName: string;
  readonly kcal: Kcal;
  readonly proteinG: Macro;
  readonly fatG: Macro;
  readonly carbG: Macro;
  readonly sourceLabel: string;
  readonly badgeRendered: boolean;
  readonly photoUrl: string;
}

/**
 * Эталонное множество имён — источник истины и для стража по типу (AST-разбор
 * `share-card.ts`), и для рантайм-проверки набора ключей объекта.
 */
export const ALLOWED_SHARE_CARD_FIELDS = [
  'dishName',
  'kcal',
  'proteinG',
  'fatG',
  'carbG',
  'sourceLabel',
  'badgeRendered',
  'photoUrl',
] as const;

export type ShareCardRenderField = (typeof ALLOWED_SHARE_CARD_FIELDS)[number];
