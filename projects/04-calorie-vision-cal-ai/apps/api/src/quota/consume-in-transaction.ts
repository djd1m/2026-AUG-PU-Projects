// Списание квоты ВНУТРИ уже открытой транзакции (FR-scan-pipeline-14).
//
// `foundation` `checkAndConsumeQuota(pool, …)` (`check-and-consume.ts`) открывает СВОЮ
// собственную транзакцию через `withTransaction(pool, …)` — это верно для маршрутов, у
// которых квота есть ЕДИНСТВЕННАЯ операция с базой. У `EnqueueScanForFeature` квота — ОДИН
// из трёх шагов ОДНОЙ короткой транзакции (photo + recognition + квота, FR-scan-pipeline-14):
// вызов той функции ОТКРЫЛ бы ВТОРУЮ, независимую транзакцию на ДРУГОМ соединении пула, и
// списание закоммитилось бы НЕМЕДЛЕННО — даже если внешняя транзакция потом откатится по
// другой причине. Это нарушало бы «квота списывается атомарно вместе с recognition/photo».
//
// Эта функция — тот же SQL и тот же порядок ключей, что в `check-and-consume.ts`, но
// принимает УЖЕ ОТКРЫТЫЙ `DbClient` и не управляет транзакцией сама (BEGIN/COMMIT/ROLLBACK —
// снаружи, в `withTransaction` вызывающего кода). Логика НЕ переписана — скопирована без
// изменений порядка операций; дублирование названо явно (см. `packages/db/src/quota.ts`,
// та же ситуация со стороны `recognizer`).

import type { DbClient } from '@n4/db';
import type { QuotaLimits, QuotaScope } from '@n4/shared';
import { quotaKeys, type QuotaReason } from './keys.js';

export type QuotaTxDecision = { readonly outcome: 'granted' } | { readonly outcome: 'refused'; readonly scope: QuotaScope };

const CONSUME_SQL = `
  INSERT INTO scan_quota_counter (scope, scope_key, day, used, "limit")
  VALUES ($1, $2, $3, 1, $4)
  ON CONFLICT (scope, scope_key, day) DO UPDATE
    SET used = scan_quota_counter.used + 1
    WHERE scan_quota_counter.used < $4
  RETURNING used
`;

export async function consumeQuotaInTransaction(
  client: DbClient,
  input: { readonly sessionId: string; readonly ipPrefix: string; readonly reason: QuotaReason; readonly limits: QuotaLimits; readonly day: string },
): Promise<QuotaTxDecision> {
  const keys = quotaKeys(input.reason, input.sessionId, input.ipPrefix, input.limits);
  for (const key of keys) {
    const result = await client.query(CONSUME_SQL, [key.scope, key.scopeKey, input.day, key.limit]);
    // ПУСТОЙ результат — предел достигнут. Вызывающий код обязан бросить исключение,
    // чтобы ОТКАТИТЬ транзакцию целиком (security-operation-order: отказ — исключение,
    // а не значение, иначе штатный возврат закоммитил бы уже вставленные ключи).
    if (result.rowCount === 0) return { outcome: 'refused', scope: key.scope };
  }
  return { outcome: 'granted' };
}
