// Типы уровня кода фичи `source-and-correct` (`02_pseudocode.md`, Data Structures —
// «Типы уровня кода (не таблицы)»). Общие для `packages/db`, `apps/recognizer`, `apps/api`.
//
// ПОЛЯ — snake_case НАМЕРЕННО, вопреки общему соглашению `camelCase — значения`
// (`coding-style.md`): `Snapshot` и `FoodSearchCandidate` — это WIRE-форма, записываемая
// В `recognition.items` (jsonb) и отдаваемая В ОТВЕТЕ API БЕЗ преобразования регистра
// (контракт `AC-source-and-correct-9`, `FoodSearchResult` `02_pseudocode.md`). Слой
// `MatchedItem.sourceSnapshot: Record<string, unknown>` — уже опаковый мешок именно под
// эту форму (см. `tests/unit/match/composite-parts.test.ts`, поля `kcal_per_100g` и
// `import_snapshot_date` в тестовом двойнике).

/** Неизменяемый снимок записи `food_item` на момент сопоставления (FR-source-and-correct-6). */
export interface Snapshot {
  readonly source: 'USDA-FDC';
  readonly source_id: string;
  readonly name_en: string;
  readonly kcal_per_100g: number;
  readonly protein_per_100g: number;
  readonly fat_per_100g: number;
  readonly carb_per_100g: number;
  /** Использованная порция — масса ОТ МОДЕЛИ, а НЕ `default_portion_g` записи. */
  readonly portion_g: number;
  readonly import_snapshot_date: string;
}

/** Кандидат ручного поиска (`replace_item` с `query`) — до 20, человек выбирает сам. */
export interface FoodSearchCandidate {
  readonly food_item_id: string;
  /** `fdc_id` — публичный идентификатор источника, показывается в чипе «USDA FDC · …». */
  readonly source_id: string;
  readonly name_ru?: string;
  readonly name_en: string;
  readonly default_portion_g: number | null;
  readonly kcal_per_100g: number;
  readonly protein_per_100g: number;
  readonly fat_per_100g: number;
  readonly carb_per_100g: number;
  /** Нужна для построения `Snapshot` в режиме `auto` (`MatchIngredients`). */
  readonly import_snapshot_date: string;
  readonly similarity: number;
}

/** Одна часть составного блюда, УЖЕ разрешённая к `food_item.id` (загрузка seed). */
export interface RecipePartRef {
  readonly foodItemId: string;
  readonly share: number;
}

/** Результат внутреннего поиска для сопоставления (`MatchIngredients`, режим `auto`). */
export type FoodMatchResult =
  | { readonly kind: 'item'; readonly candidate: FoodSearchCandidate }
  | {
      readonly kind: 'recipe';
      readonly synonymId: string;
      readonly nameRu: string;
      readonly parts: readonly RecipePartRef[];
      readonly similarity: number;
    };

/** Строка seed'а RU-курации ДО разрешения `food_item_source_id` в UUID. */
export interface SeedSynonymRow {
  readonly name_ru: string;
  readonly food_item_source_id?: string;
  readonly recipe_parts?: ReadonlyArray<{ readonly food_item_source_id: string; readonly share: number }>;
  readonly curated_by: string;
}
