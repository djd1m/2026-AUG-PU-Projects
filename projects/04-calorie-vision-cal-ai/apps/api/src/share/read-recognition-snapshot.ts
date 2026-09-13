// Чтение Snapshot скана для карточки (`BuildCardPayload` шаг 1, ADR-001).
//
// СТЫК, названный явно (не покрыт `01_specification.md`/`03_architecture.md` дословно):
// на момент реализации `source-and-correct` (владелец `Snapshot` и агрегатов на позицию,
// `docs/features/source-and-correct/02_pseudocode.md` §Data Structures) НЕ СЛИТА в эту
// ветку — `recognition` не несёт отдельных колонок для итоговых белков/жиров/углеводов, а
// только per-item поля внутри `recognition.items` (jsonb): `kcal | protein | fat | carb |
// source_snapshot`. Агрегация «сумма по СОВПАВШИМ позициям» и выбор «верхней» позиции для
// имени/источника карточки — РЕШЕНИЕ ЭТОГО ФАЙЛА, а не готовый агрегат source-and-correct.
// Координатор при слиянии сверяет это с фактической реализацией source-and-correct: если
// та фича считает и хранит собственные итоги, чтение здесь переключается на них БЕЗ смены
// сигнатуры `RecognitionCardSnapshot` (интерфейс уже ровно то, что нужно карточке).
//
// ЧИСЛА БЕРУТСЯ ИЗ Snapshot / позиций, НЕ из `recognition.model_estimate_kcal` — второе
// чтение этого поля запрещено проектным правилом (ADR-001, «путь показа»); эта функция его
// не читает вовсе, и страж по исходнику (`tests/guard/no-model-estimate-in-card.test.ts`)
// проверяет именно это.

import type { DbClient, DbPool } from '@n4/db';
import type { Kcal, Macro } from '@n4/shared';

interface RawSourceSnapshot {
  readonly source?: string;
  readonly source_id?: string;
  readonly sourceId?: string;
  readonly portion_g?: number;
  readonly portionG?: number;
}

interface RawRecognitionItem {
  readonly label_ru?: string;
  readonly labelRu?: string;
  readonly unmatched?: boolean;
  readonly food_item_id?: string | null;
  readonly foodItemId?: string | null;
  readonly kcal?: number | null;
  readonly protein?: number | null;
  readonly fat?: number | null;
  readonly carb?: number | null;
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

/** Имена баз данных источника — литералы канона (§6: «USDA FoodData Central»), не настройка. */
const SOURCE_DISPLAY_NAME: Record<string, string> = {
  'USDA-FDC': 'USDA FDC',
};

function formatSourceLabel(snapshot: RawSourceSnapshot | null | undefined, portionFallback: number): string {
  if (snapshot === null || snapshot === undefined) return '';
  const source = snapshot.source ?? '';
  const sourceId = snapshot.source_id ?? snapshot.sourceId ?? '';
  const portion = snapshot.portion_g ?? snapshot.portionG ?? portionFallback;
  const displayName = SOURCE_DISPLAY_NAME[source] ?? source;
  if (displayName === '' || sourceId === '') return '';
  return `${displayName} #${sourceId} · ${portion} г`;
}

/**
 * Считает Snapshot карточки из массива позиций скана. `null` — ни одной сопоставленной
 * (совпавшей) позиции: делиться нечем, вызывающий обязан трактовать это как внутреннюю
 * несогласованность (`recognition.status = 'done'` без единой сопоставленной позиции
 * противоречит DEC-A-014/DEC-A-023 — `done` не достижим при нуле совпадений), а не как
 * обычный отказ маршрута.
 */
export function computeCardSnapshotFromItems(items: readonly RawRecognitionItem[]): RecognitionCardSnapshot | null {
  const matched = items.filter((item) => item.unmatched !== true && (item.food_item_id ?? item.foodItemId ?? null) !== null && typeof item.kcal === 'number');
  if (matched.length === 0) return null;

  let kcalTotal = 0;
  let proteinTotal = 0;
  let fatTotal = 0;
  let carbTotal = 0;
  let top: RawRecognitionItem = matched[0]!;
  for (const item of matched) {
    kcalTotal += item.kcal ?? 0;
    proteinTotal += item.protein ?? 0;
    fatTotal += item.fat ?? 0;
    carbTotal += item.carb ?? 0;
    if ((item.kcal ?? 0) > (top.kcal ?? 0)) top = item;
  }

  const dishName = top.label_ru ?? top.labelRu ?? '';
  const sourceLabel = formatSourceLabel(top.source_snapshot ?? top.sourceSnapshot, 0);

  return {
    dishName,
    kcalTotal: Math.round(kcalTotal) as Kcal,
    proteinTotal: (Math.round(proteinTotal * 10) / 10) as Macro,
    fatTotal: (Math.round(fatTotal * 10) / 10) as Macro,
    carbTotal: (Math.round(carbTotal * 10) / 10) as Macro,
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
