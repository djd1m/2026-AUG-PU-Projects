import type { Pool, PoolClient } from 'pg';
import { transaction } from './quota.js';

/** Plain snapshot read: callers may already hold video; never lock account here. */
export async function hasOwnerUnlimited(db: Pick<PoolClient, 'query'>, accountId: string): Promise<boolean> {
  return (await db.query<{ owner_unlimited: boolean }>(
    `SELECT owner_unlimited FROM account WHERE id::text=$1 AND status='active'`, [accountId])).rows[0]?.owner_unlimited === true;
}
export type OwnerUnlimitedInput = { accountId: string; enabled: boolean; operator: string; reason: string };
export type OwnerUnlimitedResult = { kind: 'updated'; before: boolean; after: boolean } | { kind: 'invalid' | 'not_found' };
export function setOwnerUnlimited(pool: Pool, input: OwnerUnlimitedInput): Promise<OwnerUnlimitedResult> {
  const operator=input.operator.trim(), reason=input.reason.trim();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(input.accountId)
    || typeof input.enabled !== 'boolean' || !operator || operator.length>100 || reason.length<3 || reason.length>450)
    return Promise.resolve({kind:'invalid'});
  return transaction(pool, async tx => {
    const account=(await tx.query<{ plan: 'free' | 'paid'; owner_unlimited: boolean }>(
      `SELECT plan,owner_unlimited FROM account WHERE id=$1 AND status='active' FOR NO KEY UPDATE`,[input.accountId])).rows[0];
    if (!account) return {kind:'not_found'} as const;
    await tx.query('UPDATE account SET owner_unlimited=$2,updated_at=now() WHERE id=$1',[input.accountId,input.enabled]);
    await tx.query(`INSERT INTO operator_action(operator,reason,account_id,action,plan_before,plan_after)
      VALUES($1,$2,$3,'set_owner_unlimited',$4,$4)`,
      [operator,`owner_unlimited:${account.owner_unlimited}->${input.enabled}; ${reason}`,input.accountId,account.plan]);
    return {kind:'updated',before:account.owner_unlimited,after:input.enabled} as const;
  });
}
