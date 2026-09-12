// Атомарный модуль потолков (FR-foundation-5, `CheckAndConsumeQuota`).
//
// Ядро, на которое опираются все следующие фичи. Здесь модель не вызывается — её в этой
// фиче нет вовсе; здесь только решение «можно» или «отказ с названным scope».
//
// ОДИН оператор на ключ. «Прочитать, потом записать» ЗАПРЕЩЕНО: две попытки приходят
// ОДНОВРЕМЕННО, обе читают `used = 9`, обе пишут `10` — и одиннадцатый скан проходит.
// Последовательный тест зеленеет при обеих реализациях; различает их только конкурентный
// прогон (`shared-resource-verification`).
//
// Все ключи ОДНОЙ попытки — в ОДНОЙ транзакции. Отказ по любому ключу откатывает её
// целиком, а не декрементирует встречными операторами: параллельная попытка, попавшая
// между инкрементом и декрементом, увидела бы завышенное значение и получила бы отказ
// незаслуженно (`CheckAndConsumeQuota` шаг 4).

import { withTransaction, type DbPool } from '@n4/db';
import type { QuotaLimits, QuotaScope } from '@n4/shared';
import { moscowDay, quotaKeys, type QuotaReason } from './keys.js';

export interface QuotaInput {
  readonly sessionId: string;
  readonly ipPrefix: string;
  readonly reason: QuotaReason;
  readonly limits: QuotaLimits;
  /** Момент, от которого берутся московские сутки. Подменяется только тестом. */
  readonly at?: Date;
}

export type QuotaDecision =
  | { readonly outcome: 'granted'; readonly day: string }
  | { readonly outcome: 'refused'; readonly day: string; readonly scope: QuotaScope };

/** Внутренний сигнал отката. Наружу не выходит: он превращается в `refused(scope)`. */
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
  // Порядок ключей ОДИНАКОВ у всех вызывающих (сессия → адрес → global → escalation).
  // Это не косметика: транзакция держит блокировки строк до конца, и два вызова, берущие
  // одни и те же строки в РАЗНОМ порядке, дают взаимную блокировку под конкуренцией.
  const keys = quotaKeys(input.reason, input.sessionId, input.ipPrefix, input.limits);

  try {
    await withTransaction(pool, async (client) => {
      for (const key of keys) {
        const result = await client.query(CONSUME_SQL, [key.scope, key.scopeKey, day, key.limit]);
        // ПУСТОЙ результат И ЕСТЬ «предел достигнут»: строка существует, но условие
        // `used < limit` не выполнилось, поэтому UPDATE не тронул ни одной строки.
        if (result.rowCount === 0) throw new QuotaExhausted(key.scope);
      }
    });
  } catch (error) {
    if (error instanceof QuotaExhausted) return { outcome: 'refused', day, scope: error.scope };
    // Любая другая ошибка — отказ базы, и он обязан быть ИСКЛЮЧЕНИЕМ, а не значением:
    // штатный возврат из транзакции закоммитил бы то, что успело записаться до неё.
    throw error;
  }

  return { outcome: 'granted', day };
}
