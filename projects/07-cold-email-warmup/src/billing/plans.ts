import type { Pool,PoolClient } from 'pg';
import { HttpError } from '../errors.js';
export const PLANS=Object.freeze({free:Object.freeze({mailboxes:3,activeCampaigns:3}),team:Object.freeze({mailboxes:10,activeCampaigns:10})});
export const TEST_TEAM=Object.freeze({plan:'team',amountMinor:100,currency:'RUB',durationDays:30,label:'TEST'});
export async function currentEntitlement(db:Pool|PoolClient,tenant:string) {
 const row=(await db.query(`SELECT e.expires_at FROM billing_entitlement e JOIN billing_intent i ON i.id=e.intent_id JOIN local_provider_payment p ON p.id=i.payment_id WHERE e.tenant_id=$1 AND e.revoked_at IS NULL AND e.expires_at>clock_timestamp() AND p.status='succeeded' ORDER BY e.expires_at DESC LIMIT 1`,[tenant])).rows[0];
 const plan=row?'team':'free';return {plan,limits:row?PLANS.team:PLANS.free,expiresAt:row?.expires_at??null,label:row?'TEST':null,hardMailQuota:30};
}
export async function checkCapacity(client:PoolClient,tenant:string,resource:'mailboxes'|'activeCampaigns') {
 const entitlement=await currentEntitlement(client,tenant);
 const sql=resource==='mailboxes'?'SELECT count(*) FROM mailbox WHERE tenant_id=$1':"SELECT count(*) FROM campaign WHERE tenant_id=$1 AND state='active'";
 const count=Number((await client.query(sql,[tenant])).rows[0].count);
 if(count>=entitlement.limits[resource]) throw new HttpError(409,'plan_limit_reached');
}
