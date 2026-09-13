// `SeedFoodSynonyms` (`02_pseudocode.md`, FR-source-and-correct-2, AC-source-and-correct-4).
//
// Строгое ИЛИ обеспечивает БАЗА (`food_synonym_exactly_one_form`, `001_init.sql`), а не
// код — здесь дублируется намеренно: код называет строку файла, база называет
// ограничение, лечить нужно файл. Частично загруженная курация — молчаливо уменьшенное
// покрытие, поэтому загрузка либо применяет ВСЕ строки, либо не применяет ни одной.

import { normalizeRuName, type SeedSynonymRow } from '@n4/shared';
import type { DbClient, DbPool } from '../pool.js';
import { withTransaction } from '../pool.js';

export interface SeedRejection {
  readonly nameRu: string;
  readonly reason: string;
}

export interface SeedLoadResult {
  readonly inserted: number;
  readonly rejected: readonly SeedRejection[];
}

const SHARE_SUM_TOLERANCE = 0.001;

function sumShares(parts: ReadonlyArray<{ share: number }>): number {
  return parts.reduce((sum, part) => sum + part.share, 0);
}

async function resolveSourceId(client: DbClient, sourceId: string): Promise<string | undefined> {
  const result = await client.query<{ id: string }>(`SELECT id FROM food_item WHERE source = 'USDA-FDC' AND source_id = $1`, [sourceId]);
  return result.rows[0]?.id;
}

const INSERT_SYNONYM = `
  INSERT INTO food_synonym (name_ru, name_ru_normalized, food_item_id, recipe_parts, curated_by, curated_at)
  VALUES ($1, $2, $3, $4::jsonb, $5, now())
`;

/**
 * Загружает seed ЦЕЛИКОМ в ОДНОЙ транзакции: строка, отвергнутая на шаге 1.1/1.2/1.3,
 * откатывает всё — частичная курация хуже отсутствующей, потому что выглядит полной.
 */
export async function loadFoodSynonyms(pool: DbPool, rows: readonly SeedSynonymRow[]): Promise<SeedLoadResult> {
  const rejected: SeedRejection[] = [];

  const inserted = await withTransaction(pool, async (client) => {
    let count = 0;
    for (const row of rows) {
      const hasDirect = row.food_item_source_id !== undefined;
      const hasRecipe = row.recipe_parts !== undefined;

      // Шаг 1.1: строгое ИЛИ — обе формы либо ни одной.
      if (hasDirect === hasRecipe) {
        rejected.push({ nameRu: row.name_ru, reason: hasDirect ? 'both_forms_present' : 'no_form_present' });
        continue;
      }

      const nameRuNormalized = normalizeRuName(row.name_ru);

      if (hasRecipe) {
        const recipeParts = row.recipe_parts as ReadonlyArray<{ food_item_source_id: string; share: number }>;
        // Шаг 1.2: сумма долей — нормализация ЗАПРЕЩЕНА, отклонение отвергает строку.
        const total = sumShares(recipeParts);
        if (Math.abs(total - 1) > SHARE_SUM_TOLERANCE) {
          rejected.push({ nameRu: row.name_ru, reason: `share_sum_invalid:${total}` });
          continue;
        }
        // Шаг 1.3: разрешить КАЖДЫЙ food_item_source_id.
        const resolvedParts: Array<{ foodItemId: string; share: number }> = [];
        let missing: string | undefined;
        for (const part of recipeParts) {
          const id = await resolveSourceId(client, part.food_item_source_id);
          if (id === undefined) {
            missing = part.food_item_source_id;
            break;
          }
          resolvedParts.push({ foodItemId: id, share: part.share });
        }
        if (missing !== undefined) {
          rejected.push({ nameRu: row.name_ru, reason: `unresolved_fdc_id:${missing}` });
          continue;
        }
        await client.query(INSERT_SYNONYM, [row.name_ru, nameRuNormalized, null, JSON.stringify(resolvedParts), row.curated_by]);
        count += 1;
        continue;
      }

      // Прямая форма.
      const sourceId = row.food_item_source_id as string;
      const foodItemId = await resolveSourceId(client, sourceId);
      if (foodItemId === undefined) {
        rejected.push({ nameRu: row.name_ru, reason: `unresolved_fdc_id:${sourceId}` });
        continue;
      }
      await client.query(INSERT_SYNONYM, [row.name_ru, nameRuNormalized, foodItemId, null, row.curated_by]);
      count += 1;
    }

    // Шаг 2: хотя бы одна отвергнутая строка — вся загрузка откатывается.
    if (rejected.length > 0) {
      throw new SeedRejectedError(rejected);
    }
    return count;
  }).catch((error) => {
    if (error instanceof SeedRejectedError) return 0;
    throw error;
  });

  return { inserted, rejected };
}

class SeedRejectedError extends Error {
  constructor(readonly rejections: readonly SeedRejection[]) {
    super('seed отвергнут: одна или несколько строк не прошли проверку');
  }
}
