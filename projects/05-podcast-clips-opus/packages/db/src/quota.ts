import type { Pool, PoolClient } from 'pg';
import type { Limits, LimitName } from '@clipmaker/shared/config';
import type { QuotaScope, VideoFailureReason } from '@clipmaker/shared/enums';
import { moscowDay } from '@clipmaker/shared/upload';

export async function transaction<T>(pool: Pool, work: (tx: PoolClient) => Promise<T>): Promise<T> {
  const tx = await pool.connect();
  let discard = false;
  try { await tx.query('BEGIN'); const result = await work(tx); await tx.query('COMMIT'); return result; }
  catch (error) {
    try { await tx.query('ROLLBACK'); }
    catch { discard = true; } // Original error remains the diagnostic; this client is unusable.
    throw error;
  }
  finally { tx.release(discard || undefined); }
}
const limitNames: Record<QuotaScope, LimitName> = {
  user_rerenders: 'N5_LIMIT_USER_RERENDERS', user_minutes: 'N5_LIMIT_USER_MINUTES', user_uploads: 'N5_LIMIT_USER_UPLOADS',
  user_upload_refunds: 'N5_LIMIT_USER_UPLOAD_REFUNDS', user_llm: 'N5_LIMIT_USER_LLM',
  global_minutes: 'N5_LIMIT_GLOBAL_MINUTES', global_llm: 'N5_LIMIT_GLOBAL_LLM',
};
export type QuotaReason = 'upload' | 'upload_refund' | 'minutes' | 'llm' | 'rerender';
const scopes: Record<QuotaReason, QuotaScope[]> = { rerender: ['user_rerenders'], upload: ['user_uploads'], upload_refund: ['user_upload_refunds'],
  minutes: ['user_minutes', 'global_minutes'], llm: ['user_llm', 'global_llm'] };
export type QuotaResult = { granted: true } | { granted: false; scope: QuotaScope };
export async function checkAndConsumeQuota(tx: PoolClient, limits: Limits, account: string,
  reason: QuotaReason, n: number, now: Date): Promise<QuotaResult> {
  if (!Number.isSafeInteger(n) || n <= 0 || n > 2147483647) throw new Error('Непригодная величина квоты');
  await tx.query('SAVEPOINT quota_charge');
  for (const scope of scopes[reason]) {
    const key = scope.startsWith('global_') ? 'all' : account;
    const args = [scope, key, moscowDay(now), n, limits[limitNames[scope]]];
    await tx.query(`INSERT INTO quota_counter (scope, scope_key, day, used) VALUES ($1, $2, $3, 0)
      ON CONFLICT (scope, scope_key, day) DO NOTHING`, args.slice(0, 3));
    const result = await tx.query(`UPDATE quota_counter SET used = used + $4
      WHERE scope = $1 AND scope_key = $2 AND day = $3 AND used::bigint + $4 <= $5 RETURNING used`, args);
    if (!result.rowCount) {
      await tx.query('ROLLBACK TO SAVEPOINT quota_charge');
      await tx.query('RELEASE SAVEPOINT quota_charge');
      return { granted: false, scope };
    }
  }
  await tx.query('RELEASE SAVEPOINT quota_charge');
  return { granted: true };
}
export const FILE_FAILURES: readonly VideoFailureReason[] = ['too_large', 'not_media', 'no_audio', 'too_short', 'too_long', 'probe_timeout'];
// Вызывающий держит блокировку video и фиксирует failed в ЭТОЙ же транзакции.
export async function refundUploadSlot(tx: PoolClient, limits: Limits, account: string,
  uploadDay: string, reason: VideoFailureReason, now: Date): Promise<boolean> {
  if (!FILE_FAILURES.includes(reason)) return false;
  // Обе стороны возврата относятся к дню создания загрузки, не к дню отказа.
  const chargedAt = new Date(`${uploadDay}T00:00:00+03:00`);
  if (moscowDay(chargedAt) !== uploadDay || uploadDay > moscowDay(now)) throw new Error('Непригодный день загрузки');
  await tx.query('SAVEPOINT upload_refund');
  const allowance = await checkAndConsumeQuota(tx, limits, account, 'upload_refund', 1, chargedAt);
  if (!allowance.granted) { await tx.query('RELEASE SAVEPOINT upload_refund'); return false; }
  const result = await tx.query(`UPDATE quota_counter SET used = used - 1
    WHERE scope = 'user_uploads' AND scope_key = $1 AND day = $2 AND used > 0 RETURNING used`, [account, uploadDay]);
  if (!result.rowCount) await tx.query('ROLLBACK TO SAVEPOINT upload_refund');
  await tx.query('RELEASE SAVEPOINT upload_refund');
  return Boolean(result.rowCount);
}
