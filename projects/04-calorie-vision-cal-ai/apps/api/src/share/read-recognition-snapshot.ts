// Чтение Snapshot скана для карточки (`BuildCardPayload` шаг 1, ADR-001).
//
// ПРАВКА ПОСЛЕ РЕВЬЮ (RV-share-card-and-growth-events-01, review-report.md). Прежняя версия
// читала `item.kcal/protein/fat/carb` НАПРЯМУЮ с позиции — таких полей в РЕАЛЬНОЙ
// персистентной форме НЕТ и не может появиться: единственный производитель этой формы,
// `persistedItem` (`apps/recognizer/src/recognize/recognize-scan.ts`), сохраняет только
// `label_ru | mass_g | unmatched | food_item_id | source_snapshot | parts`. На настоящих
// данных это давало `computeCardSnapshotFromItems` → `null` для КАЖДОГО завершённого скана —
// маршрут отвечал `503`, а прежние тесты этого не ловили, потому что вручную подставляли
// верхнеуровневые `kcal/protein/fat/carb`, которых прод никогда не пишет
// (`tests/unit/share-card-snapshot-contract.test.ts` проверяет именно это несоответствие,
// вызывая РЕАЛЬНЫЙ `persistedItem`, а не копию его формы).
//
// Контракт снимка чисел — из `docs/features/source-and-correct/01_specification.md` (строки
// 139-166, читается координатором как ссылка, не редактируется): `source_snapshot = {
// source, source_id, name_en, kcal_per_100g, protein_per_100g, fat_per_100g, carb_per_100g }`
// — СНИМОК ЗАПИСИ БАЗЫ (per-100г), не готовый итог позиции; порция — `mass_g` самой позиции, а
// не поле внутри `source_snapshot` (там его нет). Итог позиции: `kcal = round(mass_g / 100 ×
// kcal_per_100g)`, макронутриенты — так же, с округлением до одного знака.
//
// Составное блюдо (`parts[]`, PC-08) НЕ обрабатывается этим файлом СОЗНАТЕЛЬНО, а не по
// недосмотру: РЕАЛЬНЫЙ `persistedItem` сегодня помечает такую позицию `unmatched: true`
// (`matched?.foodItemId === null` — верно и для «не найдено», и для «составное, части не на
// верхнем уровне»), то есть код, обрабатывающий `parts[]`, был бы МЁРТВЫМ — недостижимым при
// текущем контракте `unmatched` и непроверяемым на реальных данных. Добавление такого кода без
// возможности его исполнить нарушило бы `guard-must-be-able-to-fail.md` (недоказанная защита не
// есть защита). Координатор заводит это отдельно при слиянии `source-and-correct`, если та фича
// действительно материализует составные блюда через `parts[]` с `unmatched: false`.
//
// Реализация здесь СЧИТАЕТ по этому контракту сама (агрегация "сумма по совпавшим позициям" и
// выбор "верхней" позиции для имени/источника карточки остаются решением ЭТОГО файла, как и
// раньше) — `source-and-correct` не слита в эту ветку, готового агрегата от неё нет. Координатор
// при слиянии сверяет: если та фича хранит уже посчитанные `kcal_total`/`macros` на самой
// `recognition`, чтение здесь переключается на них БЕЗ смены сигнатуры
// `RecognitionCardSnapshot`.
//
// ЧИСЛА БЕРУТСЯ ИЗ Snapshot / позиций, НЕ из `recognition.model_estimate_kcal` — второе
// чтение этого поля запрещено проектным правилом (ADR-001, «путь показа»); эта функция его
// не читает вовсе, страж по исходнику (`tests/unit/share-card-field-set-guard.test.ts`)
// проверяет именно это для файлов этой фичи.

import type { DbClient, DbPool } from '@n4/db';
import type { Kcal, Macro } from '@n4/shared';

interface RawSourceSnapshot {
  readonly source?: string;
  readonly source_id?: string;
  readonly sourceId?: string;
  readonly kcal_per_100g?: number;
  readonly kcalPer100g?: number;
  readonly protein_per_100g?: number;
  readonly proteinPer100g?: number;
  readonly fat_per_100g?: number;
  readonly fatPer100g?: number;
  readonly carb_per_100g?: number;
  readonly carbPer100g?: number;
}

interface RawRecognitionItem {
  readonly label_ru?: string;
  readonly labelRu?: string;
  readonly unmatched?: boolean;
  readonly food_item_id?: string | null;
  readonly foodItemId?: string | null;
  readonly mass_g?: number;
  readonly massG?: number;
  readonly source_snapshot?: RawSourceSnapshot | null;
  readonly sourceSnapshot?: RawSourceSnapshot | null;
}

export interface RecognitionCardSnapshot {
  readonly dishName: string;
  readonly kcalTotal: Kcal;
  readonly proteinTotal: Macro;
  readonly fatTotal: Macro;
  readonly carbTotal: Macro;
  readonly sourceLabel: string;
}

interface ItemNutrition {
  readonly kcal: number;
  readonly protein: number;
  readonly fat: number;
  readonly carb: number;
}

/** Имена баз данных источника — литералы канона (§6: «USDA FoodData Central»), не настройка. */
const SOURCE_DISPLAY_NAME: Record<string, string> = {
  'USDA-FDC': 'USDA FDC',
};

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

/**
 * Число позиции (или части составного блюда) ИЗ снимка записи базы (per-100г) и массы —
 * `docs/features/source-and-correct/01_specification.md:165`: `kcal = round(mass_g / 100 ×
 * kcal_per_100g)`, макронутриенты так же, один знак после запятой. `null` — снимок не несёт ни
 * одного из четырёх ожидаемых чисел (испорченный/чужой формат) — отсутствующее число не
 * подставляется нулём (`fail-closed-defaults.md`), позиция исключается из суммы целиком, а не
 * входит в неё нулём.
 */
function nutritionFromSnapshot(snapshot: RawSourceSnapshot | null | undefined, massG: number): ItemNutrition | null {
  if (snapshot === null || snapshot === undefined) return null;
  const kcalPer100g = snapshot.kcal_per_100g ?? snapshot.kcalPer100g;
  const proteinPer100g = snapshot.protein_per_100g ?? snapshot.proteinPer100g;
  const fatPer100g = snapshot.fat_per_100g ?? snapshot.fatPer100g;
  const carbPer100g = snapshot.carb_per_100g ?? snapshot.carbPer100g;
  if (
    typeof kcalPer100g !== 'number' ||
    typeof proteinPer100g !== 'number' ||
    typeof fatPer100g !== 'number' ||
    typeof carbPer100g !== 'number'
  ) {
    return null;
  }
  const factor = massG / 100;
  return {
    kcal: Math.round(factor * kcalPer100g),
    protein: round1(factor * proteinPer100g),
    fat: round1(factor * fatPer100g),
    carb: round1(factor * carbPer100g),
  };
}

function addNutrition(a: ItemNutrition, b: ItemNutrition): ItemNutrition {
  return { kcal: a.kcal + b.kcal, protein: a.protein + b.protein, fat: a.fat + b.fat, carb: a.carb + b.carb };
}

/** Число ОДНОЙ (несоставной) позиции — см. комментарий файла о том, почему `parts[]` здесь
 *  сознательно не обрабатывается. */
function computeItemNutrition(item: RawRecognitionItem): ItemNutrition | null {
  const massG = item.mass_g ?? item.massG ?? 0;
  return nutritionFromSnapshot(item.source_snapshot ?? item.sourceSnapshot, massG);
}

function formatSourceLabel(snapshot: RawSourceSnapshot | null | undefined, portionG: number): string {
  if (snapshot === null || snapshot === undefined) return '';
  const source = snapshot.source ?? '';
  const sourceId = snapshot.source_id ?? snapshot.sourceId ?? '';
  const displayName = SOURCE_DISPLAY_NAME[source] ?? source;
  if (displayName === '' || sourceId === '') return '';
  return `${displayName} #${sourceId} · ${portionG} г`;
}

/**
 * Считает Snapshot карточки из массива позиций скана. `null` — ни одной сопоставленной
 * (совпавшей) позиции: делиться нечем, вызывающий обязан трактовать это как внутреннюю
 * несогласованность (`recognition.status = 'done'` без единой сопоставленной позиции
 * противоречит DEC-A-014/DEC-A-023 — `done` не достижим при нуле совпадений), а не как
 * обычный отказ маршрута.
 */
export function computeCardSnapshotFromItems(items: readonly RawRecognitionItem[]): RecognitionCardSnapshot | null {
  type Contribution = { readonly item: RawRecognitionItem; readonly nutrition: ItemNutrition };
  const contributions: Contribution[] = [];
  for (const item of items) {
    if (item.unmatched === true) continue;
    if ((item.food_item_id ?? item.foodItemId ?? null) === null) continue;
    const nutrition = computeItemNutrition(item);
    if (nutrition === null) continue; // нечего посчитать — позиция не участвует, не нулём
    contributions.push({ item, nutrition });
  }
  if (contributions.length === 0) return null;

  let total: ItemNutrition = { kcal: 0, protein: 0, fat: 0, carb: 0 };
  let top = contributions[0]!;
  for (const contribution of contributions) {
    total = addNutrition(total, contribution.nutrition);
    if (contribution.nutrition.kcal > top.nutrition.kcal) top = contribution;
  }

  const dishName = top.item.label_ru ?? top.item.labelRu ?? '';
  const topMassG = top.item.mass_g ?? top.item.massG ?? 0;
  const sourceLabel = formatSourceLabel(top.item.source_snapshot ?? top.item.sourceSnapshot, topMassG);

  return {
    dishName,
    kcalTotal: Math.round(total.kcal) as Kcal,
    proteinTotal: round1(total.protein) as Macro,
    fatTotal: round1(total.fat) as Macro,
    carbTotal: round1(total.carb) as Macro,
    sourceLabel,
  };
}

export interface RecognitionForCard {
  readonly id: string;
  readonly deviceSessionId: string;
  readonly status: string;
  readonly photoId: string | null;
}

export async function findOwnedRecognition(executor: DbPool | DbClient, recognitionId: string): Promise<RecognitionForCard | null> {
  const result = await executor.query<{ id: string; device_session_id: string; status: string; photo_id: string | null; items: unknown }>(
    'SELECT id, device_session_id, status, photo_id, items FROM recognition WHERE id = $1',
    [recognitionId],
  );
  const row = result.rows[0];
  if (row === undefined) return null;
  return { id: row.id, deviceSessionId: row.device_session_id, status: row.status, photoId: row.photo_id };
}

export async function readRecognitionSnapshot(executor: DbPool | DbClient, recognitionId: string): Promise<RecognitionCardSnapshot | null> {
  const result = await executor.query<{ items: unknown }>('SELECT items FROM recognition WHERE id = $1', [recognitionId]);
  const row = result.rows[0];
  if (row === undefined) return null;
  const items = Array.isArray(row.items) ? (row.items as RawRecognitionItem[]) : [];
  return computeCardSnapshotFromItems(items);
}
