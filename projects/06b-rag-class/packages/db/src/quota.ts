// Атомарные квоты — перенос N4 packages/db/src/quota.ts (#14), адаптирован под quota_counter N6b (scope + day).
// Инвариант: ОДНА инструкция на ключ (INSERT … ON CONFLICT DO UPDATE … WHERE used + n <= limit RETURNING);
// «прочитать, потом записать» запрещено — проходит однопоточный тест и пропускает лишнее при параллельных запросах.
// Все ключи попытки — в одной транзакции: отказ любого ключа откатывает резерв остальных.
// Счёт по ПОПЫТКАМ: резерв коммитится до работы и не возвращается при её неудаче (model-call-cost.md).

import type { Pool, PoolClient } from './pool.js';
import { withService } from './tenant.js';

export interface QuotaKey {
  readonly scope: string;
  readonly limit: number;
  readonly n?: number;
}

export class QuotaRefused extends Error {
  constructor(readonly scope: string) {
    super(`предел исчерпан: ${scope}`);
    this.name = 'QuotaRefused';
  }
}

const CONSUME_SQL = `
  INSERT INTO quota_counter (scope, day, used) VALUES ($1, $2::date, $3)
  ON CONFLICT (scope, day) DO UPDATE SET used = quota_counter.used + $3
    WHERE quota_counter.used + $3 <= $4
  RETURNING used`;

/** Календарные сутки по Москве, YYYY-MM-DD. */
export function moscowDay(at: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Moscow', year: 'numeric', month: '2-digit',
    day: '2-digit' }).format(at);
}

/** Час по Москве, YYYY-MM-DDTHH — часть ключа почасового предела. */
export function moscowHour(at: Date = new Date()): string {
  const hour = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Moscow', hour: '2-digit', hourCycle: 'h23' })
    .format(at);
  return `${moscowDay(at)}T${hour}`;
}

function assertKey(key: QuotaKey): number {
  const n = key.n ?? 1;
  // Предел не число — отказ, а не «без ограничений» (honest-configuration CFG-I6).
  if (!Number.isSafeInteger(key.limit) || key.limit < 1) throw new Error(`непригодный предел для ${key.scope}`);
  if (!Number.isSafeInteger(n) || n < 1) throw new Error(`непригодный размер резерва для ${key.scope}`);
  return n;
}

/** Резерв внутри уже открытой транзакции вызывающего (роль n6b_service). Отказ — исключение QuotaRefused. */
export async function reserveQuota(client: PoolClient, keys: readonly QuotaKey[], day: string): Promise<void> {
  if (keys.length === 0) throw new Error('резерв без ключей: предел не проверен');
  for (const key of keys) {
    const n = assertKey(key);
    if (n > key.limit) throw new QuotaRefused(key.scope);
    const result = await client.query(CONSUME_SQL, [key.scope, day, n, key.limit]);
    if (result.rowCount !== 1) throw new QuotaRefused(key.scope);
  }
}

export type QuotaDecision = { readonly ok: true } | { readonly ok: false; readonly scope: string };

/** Отдельная короткая транзакция: резерв фиксируется ДО дорогой операции (bcrypt, вызов модели). */
export async function reserveQuotaNow(pool: Pool, keys: readonly QuotaKey[], at: Date = new Date()):
  Promise<QuotaDecision> {
  try {
    await withService(pool, (c) => reserveQuota(c, keys, moscowDay(at)));
    return { ok: true };
  } catch (error) {
    if (error instanceof QuotaRefused) return { ok: false, scope: error.scope };
    throw error; // недоступность БД — исключение, не «разрешить»
  }
}
