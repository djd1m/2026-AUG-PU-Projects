import { randomUUID } from 'node:crypto';
import type { Pool } from 'pg';
import { HttpError } from '../errors.js';
import type { CanonicalProvider, LiveBinding, VerifiedPayment, VerifiedRefund } from './provider.js';
import { billingTransaction } from './transaction.js';
export interface LivePrice {provider:string;merchant:string;plan:'team';amountMinor:number;currency:string;durationDays:number}
interface Intent {id:string;tenant_id:string;provider:string;merchant:string;mode:'live';plan:'team';amount_minor:number;currency:string;duration_days:number;payment_id:string|null;state:string}
const terminal=(state:string)=>['canceled','declined','refunded'].includes(state);
function bounded(value:unknown,max:number):value is string {return typeof value==='string' && value.length>0 && value.length<=max;}
export function validateLivePrice(p:LivePrice) {
 if(!bounded(p.provider,100) || !bounded(p.merchant,100) || p.plan!=='team' || !Number.isSafeInteger(p.amountMinor) || p.amountMinor<1 || p.amountMinor>2147483647 || !/^[A-Z]{3}$/.test(p.currency) || !Number.isInteger(p.durationDays) || p.durationDays<1 || p.durationDays>366) throw new HttpError(400,'invalid_price');
}
function binding(i:Intent):LiveBinding {return {provider:i.provider,merchant:i.merchant,mode:i.mode,tenant:i.tenant_id,intent:i.id,plan:i.plan,amountMinor:i.amount_minor,currency:i.currency,durationDays:i.duration_days};}
export function matchesLivePayment(b:LiveBinding,p:VerifiedPayment,paymentId?:string|null) {
 return !!p && bounded(p.id,200) && (!paymentId || p.id===paymentId) && p.mode==='live' && Object.entries(b).every(([k,v])=>p[k as keyof LiveBinding]===v) && ['pending','succeeded','canceled','declined'].includes(p.status) && typeof p.paid==='boolean';
}
export function matchesLiveRefund(b:LiveBinding,paymentId:string,r:VerifiedRefund) {
 return !!r && bounded(r.id,200) && r.paymentId===paymentId && r.provider===b.provider && r.merchant===b.merchant && r.mode==='live' && r.currency===b.currency && Number.isSafeInteger(r.amountMinor) && r.amountMinor>0 && r.amountMinor<=b.amountMinor && ['pending','succeeded','canceled'].includes(r.status);
}
function paidTime(p:VerifiedPayment,now:Date) {
 const n=typeof p.paidAt==='string' && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?Z$/.test(p.paidAt)?Date.parse(p.paidAt):NaN;
 if(!p.paid || !Number.isFinite(n) || n>now.getTime()) throw new HttpError(409,'payment_mismatch');return new Date(n);
}
// Internal offline slice: runtime config/UI and referrals are intentionally absent.
export class LiveBillingService {
 readonly price:Readonly<LivePrice>;
 constructor(readonly pool:Pool,readonly provider:CanonicalProvider,price:LivePrice) {validateLivePrice(price);this.price=Object.freeze({...price});}
 async checkout(tenant:string,key:string) {
  if(typeof key!=='string' || !/^[A-Za-z0-9_-]{8,128}$/.test(key)) throw new HttpError(400,'invalid_input');
  const i=await billingTransaction(this.pool,async c=>{
   const old=(await c.query<Intent>('SELECT * FROM live_billing_intent WHERE tenant_id=$1 AND client_key=$2',[tenant,key])).rows[0];
   if(old) {const b=binding(old);if(Object.entries(this.price).some(([k,v])=>b[k as keyof LiveBinding]!==v)) throw new HttpError(409,'idempotency_conflict');return old;}
   return (await c.query<Intent>(`INSERT INTO live_billing_intent(id,tenant_id,client_key,provider,merchant,mode,plan,amount_minor,currency,duration_days) VALUES($1,$2,$3,$4,$5,'live',$6,$7,$8,$9) RETURNING *`,[randomUUID(),tenant,key,this.price.provider,this.price.merchant,this.price.plan,this.price.amountMinor,this.price.currency,this.price.durationDays])).rows[0]!;
  });
  // Ambiguous create persists the intent and always replays its immutable remote key.
  const p=i.payment_id?await this.provider.fetch(i.payment_id):await this.provider.create(Object.freeze(binding(i)));
  await billingTransaction(this.pool,async c=>{
   const current=(await c.query<Intent>('SELECT * FROM live_billing_intent WHERE id=$1 FOR UPDATE',[i.id])).rows[0]!;
   if(!matchesLivePayment(binding(current),p,current.payment_id)) throw new HttpError(409,'provider_binding_conflict');
   await c.query('UPDATE live_billing_intent SET payment_id=$2 WHERE id=$1',[i.id,p.id]);
  });
  return this.status(tenant,i.id);
 }
 async status(tenant:string,id:string) {
  const i=(await this.pool.query<Intent>('SELECT * FROM live_billing_intent WHERE tenant_id=$1 AND id=$2',[tenant,id])).rows[0];if(!i) throw new HttpError(404,'not_found');return i;
 }
 async reconcile(tenant:string,id:string,refundId?:string) {
  const outside=await this.status(tenant,id);if(!outside.payment_id) throw new HttpError(409,'payment_unknown');
  // No DB transaction survives independent canonical remote GETs.
  const p=await this.provider.fetch(outside.payment_id),r=refundId===undefined?null:await this.provider.fetchRefund(refundId);
  return billingTransaction(this.pool,async c=>{
   const i=(await c.query<Intent>('SELECT * FROM live_billing_intent WHERE tenant_id=$1 AND id=$2 FOR UPDATE',[tenant,id])).rows[0]!;
   const b=binding(i);if(!matchesLivePayment(b,p,i.payment_id)) throw new HttpError(409,'payment_mismatch');
   const now=new Date((await c.query('SELECT clock_timestamp() AS now')).rows[0].now),paidAt=p.status==='succeeded'?paidTime(p,now):null;
   if(r && (r.id!==refundId || !matchesLiveRefund(b,i.payment_id!,r))) throw new HttpError(409,'refund_mismatch');
   await c.query("INSERT INTO live_billing_observation(intent_id,kind,snapshot) VALUES($1,'payment',$2)",[id,p]);
   if(r) {
    await c.query("INSERT INTO live_billing_observation(intent_id,kind,snapshot) VALUES($1,'refund',$2)",[id,r]);
    if(r.status==='succeeded') {
     const old=(await c.query('SELECT intent_id,snapshot FROM live_billing_refund WHERE provider=$1 AND merchant=$2 AND refund_id=$3',[b.provider,b.merchant,r.id])).rows[0];
     if(old && (old.intent_id!==id || !matchesLiveRefund(b,i.payment_id!,old.snapshot) || old.snapshot.amountMinor!==r.amountMinor)) throw new HttpError(409,'refund_mismatch');
     await c.query('INSERT INTO live_billing_refund(provider,merchant,refund_id,intent_id,snapshot) VALUES($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING',[b.provider,b.merchant,r.id,id,r]);
    }
   }
   // Any verified succeeded refund (partial included) revokes permanently.
   let state=i.state;
   if(!terminal(state)) {
    if(r?.status==='succeeded') state='refunded';
    else if(['canceled','declined'].includes(p.status)) state=p.status;
    else if(p.status==='succeeded') state='succeeded';
   }
   if(terminal(state)) await c.query('UPDATE live_billing_entitlement SET revoked_at=COALESCE(revoked_at,$2) WHERE intent_id=$1',[id,now]);
   else if(state==='succeeded' && paidAt) {
    const expiry=new Date(paidAt.getTime()+i.duration_days*86400000);
    if(expiry>now) await c.query('INSERT INTO live_billing_entitlement(intent_id,tenant_id,paid_at,expires_at) VALUES($1,$2,$3,$4) ON CONFLICT(intent_id) DO NOTHING',[id,tenant,paidAt,expiry]);
   }
   await c.query('UPDATE live_billing_intent SET state=$2 WHERE id=$1',[id,state]);return {state,label:'LIVE'};
  });
 }
}
