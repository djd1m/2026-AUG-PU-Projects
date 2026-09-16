// `ShareCardRenderInput` — ЕДИНСТВЕННЫЙ вход рендера карточки (FR-share-card-and-growth-events-1/11).
// ЗАКРЫТОЕ множество из ДЕВЯТИ полей: это САМ контракт, а не документация к нему.
// `GuardShareCardFieldSet` (tests/guard/share-card-field-set.test.ts) проверяет ИМЕННО это
// множество РАВЕНСТВОМ, а не подмножеством — новое поле того же смысла (например
// `dailyTotalKcal`) красит страж так же, как явно запрещённое имя.
//
// Полей `weightKg`, `goalKcal`, `dailyTotalKcal`, `streakDays` здесь НЕТ и не может появиться
// без правки строки стража — это граница персональных данных (NFR-SEC-002), а не оформление.

import type { Kcal, Macro } from './units.js';

/** Одна позиция состава блюда: то, что человек видит на экране результата (FR-SOURCE-002). */
export interface ShareCardItem {
  readonly label: string;
  readonly massG: number;
  readonly kcal: number;
}

export interface ShareCardRenderInput {
  readonly dishName: string;
  /**
   * Состав ЭТОГО ОДНОГО блюда (OWN-013). FR-share-card-and-growth-events-1 запрещает данные
   * ВЛАДЕЛЬЦА, «не относящиеся к составу ЭТОГО ОДНОГО блюда» — состав самого блюда под запрет
   * не подпадал никогда; прежний набор из восьми полей был уже требования, и карточка
   * показывала одно название («хлеб») при числах, посчитанных по трём позициям.
   */
  readonly items: readonly ShareCardItem[];
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
  'items',
  'kcal',
  'proteinG',
  'fatG',
  'carbG',
  'sourceLabel',
  'badgeRendered',
  'photoUrl',
] as const;

export type ShareCardRenderField = (typeof ALLOWED_SHARE_CARD_FIELDS)[number];
