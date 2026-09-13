// Общая форма ответа `GET /api/v1/scans/{id}` и `POST /api/v1/scans/{id}/correct`
// (`02_pseudocode.md`, API Contracts маршрут 2/3) — ОДНА функция, а не две копии: поля
// `items[]`, `kcal_total`, `macros`, `db_kcal_total`, `discrepancy_ratio`, `conflict_flag`
// обязаны совпадать буквально, иначе экран результата и ответ правки разойдутся молча.

import type { FoodSearchCandidate, Snapshot } from '@n4/shared';

export interface PersistedItem {
  readonly label_ru: string;
  readonly mass_g: number;
  readonly original_mass_g?: number;
  readonly candidates?: readonly string[];
  readonly unmatched: boolean;
  readonly food_item_id: string | null;
  readonly source_snapshot: Snapshot | null;
  readonly parts?: ReadonlyArray<{ readonly foodItemId: string; readonly share: number; readonly sourceSnapshot: Snapshot }>;
  readonly kcal: number | null;
  readonly protein: number | null;
  readonly fat: number | null;
  readonly carb: number | null;
}

export interface ScanRow {
  readonly id: string;
  readonly status: string;
  readonly items: unknown;
  readonly confidence: number | null;
  readonly escalated: boolean;
  readonly model_estimate_kcal: number | null;
  readonly failure_reason: string | null;
  readonly db_kcal_total: number | null;
  readonly discrepancy_ratio: number | null;
  readonly conflict_flag: boolean;
  readonly conflict_choice: string | null;
  readonly conflict_choice_at: Date | null;
  readonly user_corrected: boolean;
  readonly finished_at: Date | null;
  readonly created_at: Date;
}

export function parseItems(raw: unknown): PersistedItem[] {
  if (!Array.isArray(raw)) return [];
  return raw as PersistedItem[];
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

export interface ScanResponseOptions {
  /** `candidates[]` появляется ТОЛЬКО в ответе `correct` с `op = 'replace_item'` + `query`. */
  readonly candidates?: readonly FoodSearchCandidate[];
}

/** `kcal_total` — публичный алиас `db_kcal_total` (та же величина, имя канона `diary_entry`). */
export function buildScanResponse(row: ScanRow, options: ScanResponseOptions = {}) {
  const items = parseItems(row.items);
  const macros = items.reduce(
    (acc, item) => {
      if (item.unmatched) return acc;
      return { protein: acc.protein + (item.protein ?? 0), fat: acc.fat + (item.fat ?? 0), carb: acc.carb + (item.carb ?? 0) };
    },
    { protein: 0, fat: 0, carb: 0 },
  );

  const body: Record<string, unknown> = {
    scan_id: row.id,
    status: row.status,
    items: items.map((item) => ({
      label_ru: item.label_ru,
      mass_g: item.mass_g,
      original_mass_g: item.original_mass_g ?? item.mass_g,
      unmatched: item.unmatched,
      food_item_id: item.food_item_id,
      source_snapshot: item.source_snapshot,
      parts: item.parts,
      kcal: item.kcal,
      protein: item.protein,
      fat: item.fat,
      carb: item.carb,
    })),
    kcal_total: row.db_kcal_total,
    macros: { protein: round1(macros.protein), fat: round1(macros.fat), carb: round1(macros.carb) },
    db_kcal_total: row.db_kcal_total,
    model_estimate_kcal: row.model_estimate_kcal,
    discrepancy_ratio: row.discrepancy_ratio,
    conflict_flag: row.conflict_flag,
    conflict_choice: row.conflict_choice,
    user_corrected: row.user_corrected,
    confidence: row.confidence,
    low_confidence: row.confidence !== null && row.confidence < 0.6,
    escalated: row.escalated,
    failure_reason: row.failure_reason,
  };
  if (options.candidates !== undefined) body.candidates = options.candidates;
  return body;
}
