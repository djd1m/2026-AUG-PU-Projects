// из N5: projects/05-podcast-clips-opus/packages/db/src/quota.ts — адаптировано: та же пара операторов
// (INSERT … ON CONFLICT DO NOTHING, затем UPDATE … WHERE used + n <= limit RETURNING) под SAVEPOINT;
// transaction() перенесена без изменений. Вместо фиксированных причин N5 — список пар (scope, scope_key,
// period, n, limit), который строит ceilings.ts из LoadCeilings (10 scope / 14 переменных канона §7).
// refundUploadSlot N5 не взят: у N6 возвратов нет — счёт по попыткам (ADR-008).
import type { Pool, PoolClient } from 'pg';

export async function transaction<T>(pool: Pool, work: (tx: PoolClient) => Promise<T>): Promise<T> {
  const tx = await pool.connect();
  let discard = false;
  try { await tx.query('BEGIN'); const result = await work(tx); await tx.query('COMMIT'); return result; }
  catch (error) {
    try { await tx.query('ROLLBACK'); }
    catch { discard = true; } // Исходная ошибка — диагноз; этот клиент непригоден.
    throw error;
  }
  finally { tx.release(discard || undefined); }
}

// Предел приходит СЮДА числом из окружения, а не из колонки (ADR-008: «предел — окружение, не колонка»).
export interface QuotaCharge { scope: string; scopeKey: string; period: string; n: number; limit: number }
export type QuotaDecision = { granted: true } | { granted: false; scope: string; scopeKey: string };
const INT4_MAX = 2147483647;

function validate(charges: readonly QuotaCharge[]): void {
  if (!charges.length) throw new Error('Пустой список списаний: вызов без квоты не выполняется');
  const seen = new Set<string>();
  for (const c of charges) {
    if (!Number.isSafeInteger(c.n) || c.n <= 0 || c.n > INT4_MAX) throw new Error(`Непригодная величина списания ${c.scope}`);
    if (!Number.isSafeInteger(c.limit) || c.limit <= 0 || c.limit > INT4_MAX) throw new Error(`Непригодный предел ${c.scope}: ненастроенный потолок — отказ, а не «без ограничений»`);
    const key = `${c.scope}\u0000${c.scopeKey}\u0000${c.period}`;
    if (seen.has(key)) throw new Error(`Повтор строки счётчика ${c.scope} в одном списании`);
    seen.add(key);
  }
}

// CheckAndConsumeQuota (Pseudocode): в ОТКРЫТОЙ транзакции вызывающего. Порядок пар — фиксированный
// (от узкого к широкому, задаёт ceilings.ts): все вызывающие берут строки в одном порядке — без
// взаимных блокировок. Пустой RETURNING И ЕСТЬ отказ; откат до точки сохранения снимает ВСЕ scope этого
// списания, транзакция вызывающего остаётся пригодной (например, записать refused_limit).
export async function chargeQuota(tx: PoolClient, charges: readonly QuotaCharge[]): Promise<QuotaDecision> {
  validate(charges);
  await tx.query('SAVEPOINT quota_charge');
  for (const c of charges) {
    // Оператор 1: строка счётчика существует. Предел здесь НЕ проверяется — поэтому он отдельный:
    // однооператорная форма «INSERT … VALUES (n) ON CONFLICT DO UPDATE … WHERE» вставляет первое
    // списание без сравнения с пределом (n > предела на свежей строке проходит).
    await tx.query(`INSERT INTO quota_counter (scope, scope_key, period, used) VALUES ($1, $2, $3, 0)
      ON CONFLICT (scope, scope_key, period) DO NOTHING`, [c.scope, c.scopeKey, c.period]);
    // Оператор 2: строка блокируется UPDATE; конкурент ждёт COMMIT и перепроверяет WHERE на новой версии.
    const result = await tx.query(`UPDATE quota_counter SET used = used + $4
      WHERE scope = $1 AND scope_key = $2 AND period = $3 AND used::bigint + $4 <= $5 RETURNING used`,
    [c.scope, c.scopeKey, c.period, c.n, c.limit]);
    if (!result.rowCount) {
      await tx.query('ROLLBACK TO SAVEPOINT quota_charge');
      await tx.query('RELEASE SAVEPOINT quota_charge');
      return { granted: false, scope: c.scope, scopeKey: c.scopeKey };
    }
  }
  await tx.query('RELEASE SAVEPOINT quota_charge');
  return { granted: true };
}

// Своя КОРОТКАЯ транзакция: строки счётчика (в том числе общая global_*) заблокированы только на время
// списания, а не на время вызова модели (shared-resource-verification п.1). Вызов модели — после COMMIT.
export function consumeQuota(pool: Pool, charges: readonly QuotaCharge[]): Promise<QuotaDecision> {
  validate(charges);
  return transaction(pool, (tx) => chargeQuota(tx, charges));
}
