import { effectivePlanSql, type Pool } from '@clipmaker/db';
import type { Limits } from '@clipmaker/shared/config';
import { moscowDay, quotaResetAt } from '@clipmaker/shared/upload';
import type { RemainingLimits } from '../lib/limits-contract';

export async function remainingLimits(pool: Pool, limits: Limits, account: string, now = new Date()): Promise<RemainingLimits> {
  const rows = (await pool.query<{ scope: string; used: number }>(`SELECT scope,used FROM quota_counter
    WHERE scope_key=$1 AND day=$2::date AND scope IN ('user_uploads','user_minutes','user_llm')`,
  [account, moscowDay(now)])).rows;
  const used = new Map(rows.map(row => [row.scope, row.used]));
  // OWN-019: остаток минут тарифа paid считается от его потолка — тем же выражением плана, что и списание.
  const plan = (await pool.query<{ plan: string }>(`SELECT ${effectivePlanSql('a')} AS plan FROM account a WHERE a.id::text=$1`, [account])).rows[0]?.plan;
  const minutesLimit = plan === 'paid' ? limits.N5_LIMIT_PAID_USER_MINUTES : limits.N5_LIMIT_USER_MINUTES;
  return {
    uploads: Math.max(0, limits.N5_LIMIT_USER_UPLOADS - (used.get('user_uploads') ?? 0)),
    minutes: Math.max(0, minutesLimit - (used.get('user_minutes') ?? 0)),
    selections: Math.max(0, limits.N5_LIMIT_USER_LLM - (used.get('user_llm') ?? 0)),
    resets_at: quotaResetAt(now),
  };
}
