import { randomUUID } from 'node:crypto';
import type { Pool } from 'pg';
import { HttpError } from '../errors.js';
import { resolveAttribution } from '../growth/attribution.js';
import { TEST_TEAM,currentEntitlement } from './plans.js';
import { billingTransaction } from './transaction.js';
import { LocalProvider,type Provider,type Payment } from './provider.js';
interface Intent {id:string;tenant_id:string;request_payload:{plan:string;code?:string};payment_id:string|null;amount_minor:number;currency:string;partner_tenant:string|null;partner_code:string|null;attribution_reason:string;state:string;applied_version:number}
export function parseCheckout(input:Record<string,unknown>) {
 if(Object.keys(input).some(k=>!['plan','idempotencyKey','code'].includes(k)) || input.plan!=='team' || typeof input.idempotencyKey!=='string' || !/^[A-Za-z0-9_-]{8,128}$/.test(input.idempotencyKey) || (input.code!==undefined && typeof input.code!=='string')) throw new HttpError(400,'invalid_input');
 return {key:input.idempotencyKey,payload:{plan:'team',...(input.code!==undefined?{code:input.code as string}:{})}};
}
export function matches(intent:Intent,payment:Payment) {
 const m=payment.metadata;
 return payment.id===intent.payment_id && payment.provider_key===intent.id && Number.isSafeInteger(payment.amount_minor) && payment.amount_minor===intent.amount_minor && payment.currency===intent.currency && m?.tenant===intent.tenant_id && m?.intent===intent.id && m?.plan==='team' && m?.durationDays===30 && Object.keys(m).length===4;
}
export class BillingService {
 readonly provider:Provider;
 constructor(readonly pool:Pool,readonly key:Buffer,readonly mode:'disabled'|'local_test'='disabled',provider?:Provider) {this.provider=provider??new LocalProvider(pool,mode);}
 requireAvailable() {if(this.mode!=='local_test') throw new HttpError(503,'billing_unavailable');}
 async checkout(tenant:string,input:Record<string,unknown>,cookie?:string) {
  const parsed=parseCheckout(input);this.requireAvailable();
  const intent=await billingTransaction(this.pool,async client=>{
   const old=(await client.query<Intent>('SELECT * FROM billing_intent WHERE tenant_id=$1 AND client_key=$2',[tenant,parsed.key])).rows[0];
   if(old) {
    if(old.request_payload.plan!==parsed.payload.plan || old.request_payload.code!==parsed.payload.code) throw new HttpError(409,'idempotency_conflict');return old;
   }
   const a=await resolveAttribution(client,tenant,parsed.payload.code,cookie,this.key);
   return (await client.query<Intent>(`INSERT INTO billing_intent(id,tenant_id,client_key,request_payload,plan,amount_minor,currency,duration_days,partner_tenant,partner_code,attribution_reason) VALUES($1,$2,$3,$4,'team',100,'RUB',30,$5,$6,$7) RETURNING *`,[randomUUID(),tenant,parsed.key,parsed.payload,a.partner,a.code,a.reason])).rows[0]!;
  });
  // No application transaction survives either adapter call. Binding always wins over create.
  const payment=intent.payment_id?await this.provider.fetch(intent.payment_id):await this.provider.create(intent);
  await billingTransaction(this.pool,async client=>{
   const current=(await client.query<Intent>('SELECT * FROM billing_intent WHERE id=$1 FOR UPDATE',[intent.id])).rows[0]!;
   if(current.payment_id && current.payment_id!==payment.id) throw new HttpError(409,'provider_binding_conflict');
   if(!matches({...current,payment_id:payment.id},payment)) throw new HttpError(409,'provider_binding_conflict');
   await client.query('UPDATE billing_intent SET payment_id=$2 WHERE id=$1',[intent.id,payment.id]);
  });
  return this.status(tenant,intent.id);
 }
 async status(tenant:string,id:string) {
  const row=(await this.pool.query('SELECT id,plan,state,payment_id,attribution_reason,created_at FROM billing_intent WHERE tenant_id=$1 AND id=$2',[tenant,id])).rows[0];if(!row) throw new HttpError(404,'not_found');
  let canonicalStatus:string|null=null;
  if(row.payment_id && this.mode==='local_test') canonicalStatus=(await this.provider.fetch(row.payment_id)).status;
  return {...row,canonicalStatus,mode:this.mode,label:'TEST',price:TEST_TEAM,checkoutUrl:row.payment_id?`/api/billing/intents/${row.id}`:null,entitlement:await currentEntitlement(this.pool,tenant)};
 }
 async ownerStatus(tenant:string) {return {...await currentEntitlement(this.pool,tenant),mode:this.mode,checkoutAvailable:this.mode==='local_test',testPlan:TEST_TEAM};}
 async reconcile(id:string) {
  this.requireAvailable();
  const outside=(await this.pool.query<Intent>('SELECT * FROM billing_intent WHERE id=$1',[id])).rows[0];if(!outside?.payment_id) throw new HttpError(404,'not_found');
  const canonical=await this.provider.fetch(outside.payment_id);
  return billingTransaction(this.pool,async client=>{
   const intent=(await client.query<Intent>('SELECT * FROM billing_intent WHERE id=$1 FOR UPDATE',[id])).rows[0]!;
   const current=(await client.query<Payment>('SELECT * FROM local_provider_payment WHERE id=$1 FOR UPDATE',[intent.payment_id])).rows[0];
   // Atomic fence: a previously fetched success cannot survive a canonical cancel/expiry.
   if(!current || current.version!==canonical.version || current.status!==canonical.status || !current.available) throw new HttpError(409,'canonical_changed');
   if(!matches(intent,canonical) || !matches(intent,current)) throw new HttpError(409,'payment_mismatch');
   const now=new Date((await client.query('SELECT clock_timestamp() AS now')).rows[0].now);
   if(['canceled','revoked','expired'].includes(canonical.status)) {
    await client.query('UPDATE billing_entitlement SET revoked_at=COALESCE(revoked_at,$2) WHERE intent_id=$1',[id,now]);
   } else if(canonical.status==='succeeded') {
    if(!canonical.paid_at || !Number.isFinite(canonical.paid_at.getTime()) || canonical.paid_at>now) throw new HttpError(409,'payment_mismatch');
    const expiry=new Date(canonical.paid_at.getTime()+30*86400000);
    if(expiry>now) {
     await client.query('INSERT INTO billing_entitlement(intent_id,tenant_id,paid_at,expires_at) VALUES($1,$2,$3,$4) ON CONFLICT(intent_id) DO NOTHING',[id,intent.tenant_id,canonical.paid_at,expiry]);
     if(intent.partner_tenant && intent.partner_code) await client.query('INSERT INTO partner_conversion(buyer_tenant,intent_id,partner_tenant,code) VALUES($1,$2,$3,$4) ON CONFLICT(buyer_tenant) DO NOTHING',[intent.tenant_id,id,intent.partner_tenant,intent.partner_code]);
    }
   }
   await client.query('UPDATE billing_intent SET state=$2,applied_version=$3 WHERE id=$1',[id,canonical.status,canonical.version]);
   return {state:canonical.status,label:'TEST'};
  });
 }
}
