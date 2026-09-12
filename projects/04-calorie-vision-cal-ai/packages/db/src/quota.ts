// Атомарный модуль потолков — копия `apps/api/src/quota/{check-and-consume,keys}.ts`
// (`foundation`, FR-foundation-5), перенесённая СЮДА, чтобы `apps/recognizer` могла
// списывать квоту (FR-scan-pipeline-7/15) БЕЗ импорта из чужого приложения: корневой
// `tsconfig.json` не объявляет алиас `@n4/api`, и apps/api не экспортируется как пакет
// (`main` указывает на `dist/bootstrap.js`, без поля `exports`).
//
// ОТКЛОНЕНИЕ ОТ ПЛАНА, названное явно (см. `receipts/impl-scan-pipeline.md`): логика
// дублирована, а не перенесена — правка `apps/api/src/quota/*.ts` (файла `foundation`)
// этой квитанцией НЕ вносится. Координатор при слиянии должен решить: либо оставить
// обе копии (они уже идентичны логически и покрыты одними и теми же тестами), либо
// перевести `apps/api` на импорт отсюда и удалить его локальную копию.
//
// Инвариант тот же: ОДИН оператор на ключ, «прочитать-потом-записать» ЗАПРЕЩЕНО —
// см. подробный комментарий в оригинале.

import { withTransaction, type DbPool } from './pool.js';
import type { QuotaLimits, QuotaScope } from '@n4/shared';

export type QuotaReason = 'primary' | 'escalation';

export interface QuotaKey {
  readonly scope: QuotaScope;
  readonly scopeKey: string;
  readonly limit: number;
}

export const GLOBAL_SCOPE_KEY = 'all';

export function quotaKeys(reason: QuotaReason, sessionId: string, ipPrefix: string, limits: QuotaLimits): QuotaKey[] {
  const keys: QuotaKey[] = [
    { scope: 'user', scopeKey: sessionId, limit: limits.scanLimitUser },
    { scope: 'user', scopeKey: ipPrefix, limit: limits.scanLimitUser },
    { scope: 'global', scopeKey: GLOBAL_SCOPE_KEY, limit: limits.scanLimitDay },
  ];
  if (reason === 'escalation') {
    keys.push({ scope: 'escalation', scopeKey: GLOBAL_SCOPE_KEY, limit: limits.escalationLimitDay });
  }
  return keys;
}

/** Календарные сутки в Europe/Moscow (FR-scan-pipeline-18). */
export function moscowDay(at: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Moscow',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(at);
}

export interface QuotaInput {
  readonly sessionId: string;
  readonly ipPrefix: string;
  readonly reason: QuotaReason;
  readonly limits: QuotaLimits;
  readonly at?: Date;
}

export type QuotaDecision =
  | { readonly outcome: 'granted'; readonly day: string }
  | { readonly outcome: 'refused'; readonly day: string; readonly scope: QuotaScope };

class QuotaExhausted extends Error {
  readonly scope: QuotaScope;
  constructor(scope: QuotaScope) {
    super(`потолок ${scope} достигнут`);
    this.name = 'QuotaExhausted';
    this.scope = scope;
  }
}

const CONSUME_SQL = `
  INSERT INTO scan_quota_counter (scope, scope_key, day, used, "limit")
  VALUES ($1, $2, $3, 1, $4)
  ON CONFLICT (scope, scope_key, day) DO UPDATE
    SET used = scan_quota_counter.used + 1
    WHERE scan_quota_counter.used < $4
  RETURNING used
`;

export async function checkAndConsumeQuota(pool: DbPool, input: QuotaInput): Promise<QuotaDecision> {
  const day = moscowDay(input.at);
  const keys = quotaKeys(input.reason, input.sessionId, input.ipPrefix, input.limits);

  try {
    await withTransaction(pool, async (client) => {
      for (const key of keys) {
        const result = await client.query(CONSUME_SQL, [key.scope, key.scopeKey, day, key.limit]);
        if (result.rowCount === 0) throw new QuotaExhausted(key.scope);
      }
    });
  } catch (error) {
    if (error instanceof QuotaExhausted) return { outcome: 'refused', day, scope: error.scope };
    throw error;
  }

  return { outcome: 'granted', day };
}
