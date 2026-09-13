// `SearchFoodCandidates` (`02_pseudocode.md`, FR-source-and-correct-3, NFR-source-and-
// correct-1). Три стратегии ПО ПОРЯДКУ, останавливается на первом результате:
//   1. точное совпадение `food_synonym.name_ru_normalized`;
//   2. нечёткое по триграммам `food_synonym.name_ru_normalized` (`word_similarity`, >= 0,45,
//      см. примечание у `TRGM_SYNONYM_SQL` — короткий запрос против многословной курации);
//   3. auto: нечёткое по `food_item.name_en` ТОЛЬКО среди `candidates[]` модели;
//      manual: нечёткое по `food_item.name_en` по ВСЕЙ базе, LIMIT 20.
//
// Порог 0,45 и пределы 5/20 — ЛИТЕРАЛЫ кода, не переменные окружения
// (`03_architecture.md`, «Переменные окружения»): их вынос наружу тихо превратил бы
// «не нашли» в «нашли не то».

import type { FoodMatchResult, FoodSearchCandidate, RecipePartRef } from '@n4/shared';
import { normalizeRuName } from '@n4/shared';
import type { DbClient, DbPool } from '../pool.js';

export const SIMILARITY_THRESHOLD = 0.45;
export const AUTO_CANDIDATE_LIMIT = 5;
export const MANUAL_CANDIDATE_LIMIT = 20;

export type SearchMode = 'auto' | 'manual';

export interface SearchFoodCandidatesInput {
  readonly query: string;
  readonly mode: SearchMode;
  /** `fdc_id` кандидатов модели — читаются ТОЛЬКО в режиме `auto`, шаг 4. */
  readonly modelCandidateSourceIds?: readonly string[];
}

interface SynonymRow {
  readonly synonym_id: string;
  readonly name_ru: string;
  readonly food_item_id: string | null;
  readonly recipe_parts: unknown;
  readonly name_en: string | null;
  readonly default_portion_g: number | null;
  readonly kcal_per_100g: number | null;
  readonly protein_per_100g: string | null;
  readonly fat_per_100g: string | null;
  readonly carb_per_100g: string | null;
  readonly source_id: string | null;
  readonly import_snapshot_date: string | null;
  readonly similarity?: number;
}

interface FoodItemRow {
  readonly food_item_id: string;
  readonly name_en: string;
  readonly default_portion_g: number | null;
  readonly kcal_per_100g: number;
  readonly protein_per_100g: string;
  readonly fat_per_100g: string;
  readonly carb_per_100g: string;
  readonly source_id: string;
  readonly import_snapshot_date: string;
  readonly similarity: number;
}

const EXACT_SYNONYM_SQL = `
  SELECT fs.id AS synonym_id, fs.name_ru, fs.food_item_id, fs.recipe_parts,
         fi.name_en, fi.default_portion_g, fi.kcal_per_100g, fi.protein_per_100g, fi.fat_per_100g, fi.carb_per_100g,
         fi.source_id, fi.import_snapshot_date::text AS import_snapshot_date, 1.0::real AS similarity
  FROM food_synonym fs
  LEFT JOIN food_item fi ON fi.id = fs.food_item_id
  WHERE fs.name_ru_normalized = $1
  LIMIT $2
`;

// `word_similarity($1, name)`, а НЕ симметричная `similarity(name, $1)` — измерено на
// живом PostgreSQL (2026-09-13): курация состоит из МНОГОСЛОВНЫХ названий («рис белый
// вареный», «плов с курицей»), а частый запрос — ОДНО слово («рис», «плов»).
// `similarity('рис', 'рис белый вареный')` = 0,235 — ниже порога 0,45, и AC-5 (покрытие
// 50 запросов) красный на восьми из них. `word_similarity('рис', 'рис белый вареный')` = 1:
// функция ищет НАИЛУЧШУЮ непрерывную подпоследовательность триграмм внутри второго
// аргумента, а не сравнивает строки целиком — ровно тот случай, когда короткий запрос
// является частью длинного курированного названия. Опечатка по-прежнему ловится
// (`word_similarity('гречк вареная', 'гречка вареная')` = 0,8125), случайная строка
// по-прежнему нет (`word_similarity('автомобильное колесо', …)` = 0). Порог 0,45 остаётся
// тем же литералом — обе функции возвращают величину 0..1, и измеренные значения выше
// подтверждают, что порог по-прежнему разделяет совпадение и промах.
const TRGM_SYNONYM_SQL = `
  SELECT fs.id AS synonym_id, fs.name_ru, fs.food_item_id, fs.recipe_parts,
         fi.name_en, fi.default_portion_g, fi.kcal_per_100g, fi.protein_per_100g, fi.fat_per_100g, fi.carb_per_100g,
         fi.source_id, fi.import_snapshot_date::text AS import_snapshot_date, word_similarity($1, fs.name_ru_normalized) AS similarity
  FROM food_synonym fs
  LEFT JOIN food_item fi ON fi.id = fs.food_item_id
  WHERE word_similarity($1, fs.name_ru_normalized) >= $2
  ORDER BY similarity DESC
  LIMIT $3
`;

const TRGM_FOOD_ITEM_SCOPED_SQL = `
  SELECT id AS food_item_id, name_en, default_portion_g, kcal_per_100g, protein_per_100g, fat_per_100g, carb_per_100g,
         source_id, import_snapshot_date::text AS import_snapshot_date, similarity(name_en, $1) AS similarity
  FROM food_item
  WHERE source_id = ANY($3::text[]) AND similarity(name_en, $1) >= $2
  ORDER BY similarity DESC
  LIMIT $4
`;

const TRGM_FOOD_ITEM_SQL = `
  SELECT id AS food_item_id, name_en, default_portion_g, kcal_per_100g, protein_per_100g, fat_per_100g, carb_per_100g,
         source_id, import_snapshot_date::text AS import_snapshot_date, similarity(name_en, $1) AS similarity
  FROM food_item
  WHERE similarity(name_en, $1) >= $2
  ORDER BY similarity DESC
  LIMIT $3
`;

function toFoodMatchResult(row: SynonymRow): FoodMatchResult | undefined {
  if (row.food_item_id !== null && row.name_en !== null && row.kcal_per_100g !== null && row.import_snapshot_date !== null && row.source_id !== null) {
    return {
      kind: 'item',
      candidate: {
        food_item_id: row.food_item_id,
        source_id: row.source_id,
        name_ru: row.name_ru,
        name_en: row.name_en,
        default_portion_g: row.default_portion_g,
        kcal_per_100g: row.kcal_per_100g,
        protein_per_100g: Number(row.protein_per_100g),
        fat_per_100g: Number(row.fat_per_100g),
        carb_per_100g: Number(row.carb_per_100g),
        import_snapshot_date: row.import_snapshot_date,
        similarity: row.similarity ?? 1,
      },
    };
  }
  if (row.recipe_parts !== null && row.recipe_parts !== undefined) {
    const parts = row.recipe_parts as ReadonlyArray<{ foodItemId: string; share: number }>;
    const partRefs: RecipePartRef[] = parts.map((part) => ({ foodItemId: part.foodItemId, share: part.share }));
    return { kind: 'recipe', synonymId: row.synonym_id, nameRu: row.name_ru, parts: partRefs, similarity: row.similarity ?? 1 };
  }
  // Синоним указывает в удалённую/несуществующую запись — промах ВСЕЙ строки, а не
  // счёт по остатку (FR-source-and-correct-5): осторожно проигнорировать, а не бросить.
  return undefined;
}

function toFoodItemCandidate(row: FoodItemRow): FoodMatchResult {
  return {
    kind: 'item',
    candidate: {
      food_item_id: row.food_item_id,
      source_id: row.source_id,
      name_en: row.name_en,
      default_portion_g: row.default_portion_g,
      kcal_per_100g: row.kcal_per_100g,
      protein_per_100g: Number(row.protein_per_100g),
      fat_per_100g: Number(row.fat_per_100g),
      carb_per_100g: Number(row.carb_per_100g),
      import_snapshot_date: row.import_snapshot_date,
      similarity: row.similarity,
    },
  };
}

/**
 * Поиск для СОПОСТАВЛЕНИЯ (режим `auto`) — может вернуть и прямую запись, и составное
 * блюдо (`recipe`). Пустой список — законный результат, означающий `unmatched`.
 */
export async function searchFoodCandidates(db: DbPool | DbClient, input: SearchFoodCandidatesInput): Promise<FoodMatchResult[]> {
  const q = normalizeRuName(input.query);
  if (q === '') return [];
  const limit = input.mode === 'auto' ? AUTO_CANDIDATE_LIMIT : MANUAL_CANDIDATE_LIMIT;

  // Шаг 2: точное совпадение синонима. Вторая стратегия НЕ выполняется вовсе при успехе —
  // проверяется счётчиком обращений (AC-source-and-correct-6), а не текстом журнала.
  const exact = await db.query<SynonymRow>(EXACT_SYNONYM_SQL, [q, input.mode === 'auto' ? 1 : limit]);
  if (exact.rows.length > 0) {
    const mapped = exact.rows.map(toFoodMatchResult).filter((r): r is FoodMatchResult => r !== undefined);
    if (mapped.length > 0) return input.mode === 'auto' ? mapped.slice(0, 1) : mapped;
  }

  // Шаг 3: триграммы по курации, порог 0,45 — литерал.
  const trgmSynonym = await db.query<SynonymRow>(TRGM_SYNONYM_SQL, [q, SIMILARITY_THRESHOLD, limit]);
  if (trgmSynonym.rows.length > 0) {
    const mapped = trgmSynonym.rows.map(toFoodMatchResult).filter((r): r is FoodMatchResult => r !== undefined);
    if (mapped.length > 0) return mapped;
  }

  if (input.mode === 'auto') {
    // Шаг 4: только среди кандидатов модели — полная база по английскому названию НЕ
    // опрашивается (русский запрос похож на английское название лишь случайно).
    const candidateIds = input.modelCandidateSourceIds ?? [];
    if (candidateIds.length === 0) return [];
    const scoped = await db.query<FoodItemRow>(TRGM_FOOD_ITEM_SCOPED_SQL, [q, SIMILARITY_THRESHOLD, candidateIds, limit]);
    return scoped.rows.map(toFoodItemCandidate);
  }

  // Шаг 5: manual — вся база, LIMIT 20. Выбор делает человек, видя числа.
  const full = await db.query<FoodItemRow>(TRGM_FOOD_ITEM_SQL, [q, SIMILARITY_THRESHOLD, limit]);
  return full.rows.map(toFoodItemCandidate);
}

/** Ручной поиск (`replace_item` с `query`) — только прямые записи, человек ВИДИТ числа. */
export async function searchFoodCandidatesForReplace(db: DbPool | DbClient, query: string): Promise<FoodSearchCandidate[]> {
  const results = await searchFoodCandidates(db, { query, mode: 'manual' });
  return results.filter((r): r is Extract<FoodMatchResult, { kind: 'item' }> => r.kind === 'item').map((r) => r.candidate);
}
