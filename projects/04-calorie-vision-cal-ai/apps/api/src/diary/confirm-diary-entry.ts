// ConfirmDiaryEntry (FR-diary-and-streak-1, FR-diary-and-streak-2, AC-diary-and-streak-1..5).
//
// Порядок ШАГОВ — часть требования, а не стиль (`.claude/rules/security-operation-order.md`):
// согласие проверяется ПЕРВЫМ действием, `recognition` не читается вовсе при отказе. Атомарная
// вставка/идемпотентное чтение — в `diary-entry-repository.ts` (`createDiaryEntryGuarded`),
// единственном месте, создающем строки `diary_entry` (03_architecture.md).

import type { DbPool } from '@n4/db';
import type { MealSlot } from '@n4/shared';
import { moscowDay } from '../quota/keys.js';
import { enforceConsentBeforeDiaryWrite, type ConsentOwnerRef } from '../consent/enforce-before-diary-write.js';
import { createDiaryEntryGuarded, type DiaryEntryRow } from './diary-entry-repository.js';
import { recomputeDayTotals, type DayTotalsResult } from './day-totals.js';
import { recomputeEntryTotals, type RawItem } from './recompute-entry-from-snapshot.js';

export type ConfirmDiaryEntryResult =
  | { readonly outcome: 'created'; readonly entry: DiaryEntryRow; readonly totals: DayTotalsResult }
  | { readonly outcome: 'refused'; readonly reason: 'consent_required' }
  | { readonly outcome: 'not_found' }
  | { readonly outcome: 'not_done'; readonly failureReason: string | null };

interface RecognitionRow {
  readonly id: string;
  readonly status: string;
  readonly items: unknown;
  readonly failure_reason: string | null;
}

const SELECT_OWNED_RECOGNITION = `
  SELECT id, status, items, failure_reason
  FROM recognition
  WHERE id = $1 AND (device_session_id = $2 OR ($3::uuid IS NOT NULL AND account_id = $3))
`;

/**
 * Границы московского часа для приёма пищи — РЕШЕНИЕ ЭТОЙ ФИЧИ: канон и корневой `Pseudocode.md`
 * требуют определять `meal_slot` «по времени суток», но не фиксируют часы дословно (в отличие,
 * например, от порога уверенности 0,6 — числа канона). Раз число не канона — оно называется явно
 * здесь, а не рассеивается магическими константами: завтрак 05–10, обед 11–15, ужин 16–21,
 * перекус — остальное. Правится одним тапом (FR-diary-and-streak-2) — эта эвристика лишь
 * начальное значение.
 */
function mealSlotForMoscowHour(hour: number): MealSlot {
  if (hour >= 5 && hour < 11) return 'breakfast';
  if (hour >= 11 && hour < 16) return 'lunch';
  if (hour >= 16 && hour < 22) return 'dinner';
  return 'snack';
}

function moscowHour(at: Date): number {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Moscow', hour: '2-digit', hourCycle: 'h23' }).formatToParts(at);
  return Number.parseInt(parts.find((part) => part.type === 'hour')?.value ?? '0', 10);
}

export interface ConfirmDiaryEntryDeps {
  readonly pool: DbPool;
  readonly owner: ConsentOwnerRef;
  readonly deviceSessionId: string;
  readonly accountId: string | null;
  readonly recognitionId: string;
  readonly now?: Date;
}

export async function confirmDiaryEntry(deps: ConfirmDiaryEntryDeps): Promise<ConfirmDiaryEntryResult> {
  const now = deps.now ?? new Date();

  // Шаг 1 (02_pseudocode.md, ConfirmDiaryEntry): согласие ПЕРВЫМ действием. При отказе
  // `recognition` НЕ читается вовсе — граница ПЕРВАЯ, до любого чтения предметных данных.
  const gate = await enforceConsentBeforeDiaryWrite(deps.pool, deps.owner);
  if (gate.outcome === 'refused') return { outcome: 'refused', reason: 'consent_required' };

  // Шаг 3: владение проверяется В WHERE — чужая и несуществующая запись дают ОДИН и тот же 404,
  // `403` на этом шаге невозможен по построению.
  const recognitionResult = await deps.pool.query<RecognitionRow>(SELECT_OWNED_RECOGNITION, [
    deps.recognitionId,
    deps.deviceSessionId,
    deps.accountId,
  ]);
  const recognition = recognitionResult.rows[0];
  if (recognition === undefined) return { outcome: 'not_found' };
  if (recognition.status !== 'done') return { outcome: 'not_done', failureReason: recognition.failure_reason };

  // Шаг 5: состав, числа и source_snapshot — из СНИМКА recognition.items[], не из живой food_item
  // (`.claude/rules/coding-style.md`, «Числа и источник»). `diary_entry.source_snapshot` хранит
  // ПАРАЛЛЕЛЬНЫЙ массив снимков по индексу — источник математики `set_portion`.
  const items = Array.isArray(recognition.items) ? (recognition.items as RawItem[]) : [];
  const snapshots = items.map((item) => (item['source_snapshot'] as RawItem | null | undefined) ?? null);
  const totals = recomputeEntryTotals(items, snapshots);

  const eatenOn = moscowDay(now);
  const mealSlot = mealSlotForMoscowHour(moscowHour(now));

  // Шаг 6-8: ОДИН атомарный оператор в `createDiaryEntryGuarded` — вставка либо идемпотентное
  // чтение при конфликте. Повторный consent-гейт — ВНУТРИ его транзакции, с блокировкой строки
  // владельца: закрывает гонку «проверили тут, отозвали до записи».
  const created = await createDiaryEntryGuarded(deps.pool, {
    owner: deps.owner,
    recognitionId: deps.recognitionId,
    eatenOn,
    mealSlot,
    items,
    kcalTotal: totals.kcal,
    proteinTotal: totals.protein,
    fatTotal: totals.fat,
    carbTotal: totals.carb,
    sourceSnapshot: snapshots,
  });
  if (created.outcome === 'refused') return { outcome: 'refused', reason: 'consent_required' };

  const dayTotals = await recomputeDayTotals(deps.pool, created.entry.owner_key, created.entry.eaten_on);
  return { outcome: 'created', entry: created.entry, totals: dayTotals };
}
