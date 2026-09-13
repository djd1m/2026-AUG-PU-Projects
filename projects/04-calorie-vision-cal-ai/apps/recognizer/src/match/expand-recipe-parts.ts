// `ExpandRecipeParts` (`02_pseudocode.md`, FR-source-and-correct-5, AC-source-and-correct-10).
//
// Составное блюдо: КАЖДАЯ часть несёт СВОЙ `source_snapshot` — общий снимок на блюдо
// запрещён контрактом порта (`scan-pipeline`, PC-08) и по существу: «борщ» без разложения
// становится безымянным числом, показать источник которого нечем.

import type { DbClient, DbPool } from '@n4/db';
import type { RecipePartRef, Snapshot } from '@n4/shared';
import type { MatchedItem, MatchedPart } from './port.js';

interface FoodItemRow {
  readonly id: string;
  readonly source_id: string;
  readonly name_en: string;
  readonly kcal_per_100g: number;
  readonly protein_per_100g: string;
  readonly fat_per_100g: string;
  readonly carb_per_100g: string;
  readonly import_snapshot_date: string;
}

const SHARE_SUM_TOLERANCE = 0.001;

function toSnapshot(row: FoodItemRow, portionG: number): Snapshot {
  return {
    source: 'USDA-FDC',
    source_id: row.source_id,
    name_en: row.name_en,
    kcal_per_100g: row.kcal_per_100g,
    protein_per_100g: Number(row.protein_per_100g),
    fat_per_100g: Number(row.fat_per_100g),
    carb_per_100g: Number(row.carb_per_100g),
    portion_g: portionG,
    import_snapshot_date: row.import_snapshot_date,
  };
}

/**
 * Раскрывает синоним-рецепт в `parts[]` элемента ответа порта. Возвращает промах ВСЕЙ
 * позиции (`foodItemId: null`), если хотя бы одна часть не разрешилась либо сумма долей
 * отклонилась больше 0,001 (страховка НА ЧТЕНИИ — seed проверяется при загрузке, но
 * запись, вставленная мимо seed, ловится здесь).
 */
export async function expandRecipeParts(
  db: DbPool | DbClient,
  synonymId: string,
  parts: readonly RecipePartRef[],
  massG: number,
): Promise<MatchedItem> {
  const shareSum = parts.reduce((sum, part) => sum + part.share, 0);
  if (Math.abs(shareSum - 1) > SHARE_SUM_TOLERANCE) {
    return { foodItemId: null, portionG: massG, sourceSnapshot: null };
  }

  const ids = parts.map((part) => part.foodItemId);
  const result = await db.query<FoodItemRow>(
    `SELECT id, source_id, name_en, kcal_per_100g, protein_per_100g, fat_per_100g, carb_per_100g, import_snapshot_date::text AS import_snapshot_date
     FROM food_item WHERE id = ANY($1::uuid[])`,
    [ids],
  );
  const byId = new Map(result.rows.map((row) => [row.id, row]));

  const matchedParts: MatchedPart[] = [];
  for (const part of parts) {
    const row = byId.get(part.foodItemId);
    // Часть не разрешилась (запись удалена/не импортирована) — промах ВСЕЙ позиции, а не
    // счёт по остатку долей: сумма 0,7 дала бы число на 30% меньше настоящего.
    if (row === undefined) return { foodItemId: null, portionG: massG, sourceSnapshot: null };
    const partMassG = Math.round(massG * part.share);
    matchedParts.push({ foodItemId: row.id, share: part.share, sourceSnapshot: toSnapshot(row, partMassG) as unknown as Record<string, unknown> });
  }

  return {
    foodItemId: synonymId,
    portionG: massG,
    // Верхний снимок НЕ используется при наличии `parts[]` (`ComputeFromSnapshot` шаг 1.2)
    // — у составного блюда собственной записи базы нет, и подставлять сюда что-либо
    // значило бы дать пользователю число, у которого нет ОДНОГО источника.
    sourceSnapshot: null,
    parts: matchedParts,
  };
}
