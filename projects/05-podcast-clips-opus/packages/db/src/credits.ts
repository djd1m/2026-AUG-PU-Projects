import type { Pool, PoolClient } from 'pg';
import type { BillingMode } from '@clipmaker/shared/config';
import { CREDIT_TRIAL_SECONDS, CREDIT_SKUS, inputCreditSeconds, type CreditSku, type CreditPurchaseWindows } from '@clipmaker/shared/tariff';
import { transaction } from './quota.js';
import { effectivePlanSql } from './plan.js';
import { hasOwnerUnlimited } from './owner-entitlement.js';

export async function creditAccountLock(tx: PoolClient, accountId: string): Promise<void> {
  await tx.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [`credits:${accountId}`]);
}
// Acquire before video, including terminal callbacks: recovery INSERT takes an implicit
// account FK lock. Erasure holds account before videos, so the reverse order deadlocks.
export async function lockCreditAccountForVideo(tx: PoolClient, videoId: string): Promise<void> {
  await tx.query(`SELECT a.id FROM account a JOIN video v ON v.account_id=a.id
    WHERE v.id=$1 AND v.billing_policy='credits_v1' FOR SHARE OF a`, [videoId]);
}
export async function grantTrialTx(tx: PoolClient, accountId: string, source: 'signup' | 'migration_trial'): Promise<void> {
  await tx.query(`INSERT INTO credit_grant(account_id,source,source_key,total_seconds,remaining_seconds)
    VALUES($1,$2,$3,$4,$4) ON CONFLICT DO NOTHING`, [accountId,source,`trial:${accountId}`,CREDIT_TRIAL_SECONDS]);
}
export async function optInCredits(pool: Pool, input: { accountId: string; mode: BillingMode; operator: string; reason: string }): Promise<boolean> {
  if (input.mode !== 'credits_v1') return false;
  if (!input.operator.trim() || input.operator.length>100 || input.reason.trim().length<3 || input.reason.length>500) throw new Error('Нужны оператор и причина');
  return transaction(pool, async tx => {
    const owner = (await tx.query<{ billing_policy: string; plan: string }>(`SELECT a.billing_policy,${effectivePlanSql('a')} AS plan
      FROM account a WHERE id=$1 AND status='active' FOR NO KEY UPDATE`, [input.accountId])).rows[0];
    if (!owner || owner.plan !== 'free') return false;
    if (owner.billing_policy === 'credits_v1') return true;
    const pending = await tx.query(`SELECT 1 FROM payment_intent WHERE account_id=$1 AND sku='legacy_pro990_v1' AND status='created'`, [input.accountId]);
    if (pending.rowCount) return false;
    await creditAccountLock(tx,input.accountId);
    await tx.query("UPDATE account SET billing_policy='credits_v1',updated_at=now() WHERE id=$1",[input.accountId]);
    await grantTrialTx(tx,input.accountId,'migration_trial');
    await tx.query(`INSERT INTO operator_action(operator,reason,account_id,action,plan_before,plan_after)
      VALUES($1,$2,$3,'credit_opt_in','free','free')`,[input.operator,input.reason,input.accountId]);
    return true;
  });
}
export interface CreditBalance { available_seconds: number; reserved_seconds: number; recovery_seconds?: number; next_expiry: Date | null }
export async function readCreditBalance(pool: Pick<Pool, 'query'>, accountId: string, now = new Date()): Promise<CreditBalance | null> {
  const result = await pool.query<CreditBalance>(`SELECT COALESCE(sum(g.remaining_seconds) FILTER
    (WHERE g.recovery_video_id IS NULL AND g.available_at<=$2 AND (g.expires_at IS NULL OR g.expires_at>$2)),0)::int available_seconds,
    COALESCE(sum(g.remaining_seconds) FILTER (WHERE g.recovery_video_id IS NOT NULL AND g.available_at<=$2 AND g.expires_at>$2),0)::int recovery_seconds,
    COALESCE(sum(g.reserved_seconds),0)::int reserved_seconds,
    min(g.expires_at) FILTER (WHERE g.remaining_seconds>0 AND g.available_at<=$2 AND g.expires_at>$2) next_expiry
    FROM account a LEFT JOIN credit_grant g ON g.account_id=a.id
    WHERE a.id=$1 AND a.status='active' AND a.billing_policy='credits_v1' GROUP BY a.id`,[accountId,now]);
  const row=result.rows[0];
  return row && Number.isSafeInteger(row.available_seconds) && Number.isSafeInteger(row.reserved_seconds) ? row : null;
}
interface Charge { id: string; state: 'reserved' | 'settled' | 'released'; billable_seconds: number; paid_render: boolean; cycle: number }
// Caller holds account SHARE then video lock. No helper locks account after video.
export async function reserveVideoCreditsTx(tx: PoolClient, videoId: string, duration: number, now: Date): Promise<'legacy' | 'reserved' | 'shortage' | 'owner_exempt'> {
  const video = (await tx.query<{ account_id: string; billing_policy: string; billable_seconds: number | null; plan: string }>(`SELECT v.account_id,v.billing_policy,v.billable_seconds,
    ${effectivePlanSql('a','$2')} AS plan FROM video v JOIN account a ON a.id=v.account_id WHERE v.id=$1 AND a.status='active' AND v.deleted_at IS NULL`,[videoId,now])).rows[0];
  if (!video || video.billing_policy !== 'credits_v1') return 'legacy';
  await creditAccountLock(tx,video.account_id);
  const charge = (await tx.query<Charge>('SELECT * FROM video_credit_charge WHERE video_id=$1 ORDER BY cycle DESC LIMIT 1',[videoId])).rows[0];
  if (charge && charge.state !== 'released') return 'reserved';
  if (await hasOwnerUnlimited(tx,video.account_id)) return 'owner_exempt';
  const seconds = video.billable_seconds ?? inputCreditSeconds(duration);
  await tx.query('UPDATE video SET billable_seconds=$2 WHERE id=$1',[videoId,seconds]);
  const grants = (await tx.query<{ id: string; remaining_seconds: number; recovery_video_id: string | null; entitlement_end: Date | null }>(`SELECT * FROM credit_grant WHERE account_id=$1
    AND available_at<=$2 AND (expires_at IS NULL OR expires_at>$2) AND remaining_seconds>0
    AND (recovery_video_id IS NULL OR recovery_video_id=$3)
    ORDER BY expires_at NULLS LAST,created_at,id FOR UPDATE`,[video.account_id,now,videoId])).rows;
  if (grants.reduce((n,g)=>n+g.remaining_seconds,0)<seconds) return 'shortage';
  const paid = video.plan === 'paid' || grants.some(g=>g.recovery_video_id===videoId && g.entitlement_end !== null);
  const created = (await tx.query<{ id: string }>(`INSERT INTO video_credit_charge(video_id,cycle,billable_seconds,state,paid_render)
    VALUES($1,$2,$3,'reserved',$4) RETURNING id`,[videoId,(charge?.cycle ?? 0)+1,seconds,paid])).rows[0]!;
  let remaining=seconds;
  for (const grant of grants) {
    if (!remaining) break;
    const take=Math.min(remaining,grant.remaining_seconds);
    const moved=await tx.query(`UPDATE credit_grant SET remaining_seconds=remaining_seconds-$2,reserved_seconds=reserved_seconds+$2
      WHERE id=$1 AND remaining_seconds>=$2 RETURNING id`,[grant.id,take]);
    if (!moved.rowCount) throw new Error('Изменился кредитный остаток');
    await tx.query('INSERT INTO credit_allocation(charge_id,grant_id,seconds) VALUES($1,$2,$3)',[created.id,grant.id,take]);
    remaining-=take;
  }
  return 'reserved';
}
// Current video/fence validity belongs to the caller. Re-read accepted output in the
// same authoritative transaction: a partial usable result always settles, never refunds.
export async function finalizeVideoCreditsTx(tx: PoolClient, videoId: string, now = new Date()): Promise<void> {
  const video=(await tx.query<{ account_id: string; billing_policy: string; status: string; done: boolean }>(`SELECT v.account_id,v.billing_policy,v.status,
    EXISTS(SELECT 1 FROM clip c WHERE c.video_id=v.id AND c.status='done') done FROM video v JOIN account owner ON owner.id=v.account_id WHERE v.id=$1 AND owner.status='active'`,[videoId])).rows[0];
  if (!video || video.billing_policy!=='credits_v1') return;
  await creditAccountLock(tx,video.account_id);
  const charge=(await tx.query<Charge>("SELECT * FROM video_credit_charge WHERE video_id=$1 AND state='reserved' FOR UPDATE",[videoId])).rows[0];
  if (!charge || (!video.done && video.status!=='failed')) return;
  const allocations=(await tx.query<{ id: string; grant_id: string; seconds: number; expires_at: Date | null; entitlement_start: Date | null; entitlement_end: Date | null; original_entitlement_ref: string | null }>(`SELECT ca.*,g.expires_at,g.entitlement_start,g.entitlement_end,g.original_entitlement_ref
    FROM credit_allocation ca JOIN credit_grant g ON g.id=ca.grant_id WHERE ca.charge_id=$1 ORDER BY g.expires_at NULLS LAST,g.id FOR UPDATE OF g`,[charge.id])).rows;
  for (const a of allocations) {
    const expired=a.expires_at !== null && a.expires_at<=now;
    await tx.query(`UPDATE credit_grant SET reserved_seconds=reserved_seconds-$2,
      remaining_seconds=remaining_seconds+$3 WHERE id=$1`,[a.grant_id,a.seconds,!video.done && !expired ? a.seconds : 0]);
    if (!video.done && expired) await tx.query(`INSERT INTO credit_grant(account_id,source,source_key,total_seconds,remaining_seconds,
      available_at,expires_at,entitlement_start,entitlement_end,original_entitlement_ref,recovery_video_id)
      VALUES($1,'recovery',$2,$3,$3,$4,$4::timestamptz+interval '24 hours',$5,$6,$7,$8) ON CONFLICT(source_key) DO NOTHING`,
      [video.account_id,`recovery:${charge.id}:${a.id}`,a.seconds,now,a.entitlement_start,a.entitlement_end,a.original_entitlement_ref ?? a.grant_id,videoId]);
  }
  await tx.query('UPDATE video_credit_charge SET state=$2,finished_at=$3 WHERE id=$1',[charge.id,video.done?'settled':'released',now]);
}
export async function fulfillCreditIntentTx(tx: PoolClient, input: { id: string; account_id: string; sku: CreditSku; grant_seconds: number }, now: Date): Promise<{ start: Date; end: Date }> {
  await creditAccountLock(tx,input.account_id);
  const sku=CREDIT_SKUS[input.sku];
  const start=sku.kind==='addon' ? now : await nextCreditBaseStart(tx,input.account_id,now);
  const end=new Date(start.getTime()+sku.days*86_400_000);
  await tx.query(`INSERT INTO credit_grant(account_id,source,source_key,total_seconds,remaining_seconds,available_at,expires_at,
    entitlement_start,entitlement_end,payment_ref,base_sku) VALUES($1,'payment',$2,$3,$3,$4,$5,$4,$5,$6,$7)`,
    [input.account_id,`intent:${input.id}`,input.grant_seconds,start,end,input.id,sku.kind==='base'?input.sku:null]);
  await tx.query('UPDATE payment_intent SET fulfilled_at=$2,period_start=$3,period_end=$4,status=\'succeeded\' WHERE id=$1',[input.id,now,start,end]);
  return {start,end};
}

// Read-only estimate and serialized fulfillment share the scheduling rule. Add-on
// windows never postpone the next base; a concurrent purchase can change this estimate.
async function nextCreditBaseStart(db: Pool | PoolClient, accountId: string, now: Date): Promise<Date> {
  return (await db.query<{ start: Date }>(`SELECT GREATEST($2::timestamptz,
    (SELECT max(entitlement_end) FROM credit_grant WHERE account_id=$1 AND base_sku IS NOT NULL),
    (SELECT plan_paid_until FROM account WHERE id=$1 AND plan_source='payment')) AS start`,[accountId,now])).rows[0]!.start;
}
export async function readCreditPurchaseWindows(pool: Pool, accountId: string, now = new Date()): Promise<CreditPurchaseWindows | null> {
  const active=await pool.query("SELECT id FROM account WHERE id=$1 AND status='active' AND billing_policy='credits_v1'",[accountId]);
  if(!active.rowCount) return null;
  const baseStart=await nextCreditBaseStart(pool,accountId,now);
  return {asOf:now.toISOString(),baseStart:baseStart.toISOString(),
    baseEnd:new Date(baseStart.getTime()+CREDIT_SKUS.start_v1.days*86_400_000).toISOString(),
    addonStart:now.toISOString(),addonEnd:new Date(now.getTime()+CREDIT_SKUS.addon_v1.days*86_400_000).toISOString(),
    scheduled:baseStart.getTime()>now.getTime()};
}
