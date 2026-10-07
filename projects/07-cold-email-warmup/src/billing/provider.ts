import { randomUUID } from 'node:crypto';
import type { Pool } from 'pg';
import { HttpError } from '../errors.js';
import { billingTransaction } from './transaction.js';
export interface Payment {id:string;provider_key:string;amount_minor:number;currency:string;metadata:{tenant:string;intent:string;plan:string;durationDays:number};status:string;paid_at:Date|null;version:number;available:boolean}
export interface Provider {create(input:{id:string;tenant_id:string;amount_minor:number;currency:string}):Promise<Payment>;fetch(id:string):Promise<Payment>}
export class LocalProvider implements Provider {
 constructor(readonly pool:Pool,readonly mode:'disabled'|'local_test'='disabled') {}
 requireAvailable() {if(this.mode!=='local_test') throw new HttpError(503,'billing_unavailable');}
 async create(intent:{id:string;tenant_id:string;amount_minor:number;currency:string}) {
  this.requireAvailable();
  const metadata={tenant:intent.tenant_id,intent:intent.id,plan:'team',durationDays:30};
  // Independent provider transaction, outside the application's intent transaction.
  await billingTransaction(this.pool,async client=>{await client.query('INSERT INTO local_provider_payment(id,provider_key,amount_minor,currency,metadata) VALUES($1,$2,$3,$4,$5) ON CONFLICT(provider_key) DO NOTHING',[randomUUID(),intent.id,intent.amount_minor,intent.currency,metadata]);});
  const row=(await this.pool.query<Payment>('SELECT * FROM local_provider_payment WHERE provider_key=$1',[intent.id])).rows[0]!;
  if(row.amount_minor!==intent.amount_minor || row.currency!==intent.currency || JSON.stringify(row.metadata)!==JSON.stringify(metadata)) {
   // Compare fields rather than JSON order below; pg jsonb sorts keys.
   if(row.amount_minor!==intent.amount_minor || row.currency!==intent.currency || row.metadata.tenant!==metadata.tenant || row.metadata.intent!==metadata.intent || row.metadata.plan!=='team' || row.metadata.durationDays!==30) throw new HttpError(409,'provider_binding_conflict');
  }
  if(!row.available) throw new HttpError(503,'provider_unavailable');return row;
 }
 async fetch(id:string) {
  this.requireAvailable();const row=(await this.pool.query<Payment>('SELECT * FROM local_provider_payment WHERE id=$1',[id])).rows[0];
  if(!row) throw new HttpError(404,'not_found');if(!row.available) throw new HttpError(503,'provider_unavailable');return row;
 }
 async simulate(id:string,input:Record<string,unknown>) {
  this.requireAvailable();
  const allowed=['status','amountMinor','currency','metadata','paidAt','available'];
  if(Object.keys(input).some(k=>!allowed.includes(k)) || !['pending','succeeded','canceled','revoked','expired'].includes(String(input.status))) throw new HttpError(400,'invalid_input');
  if(input.amountMinor!==undefined && (!Number.isSafeInteger(input.amountMinor) || Number(input.amountMinor)<1)) throw new HttpError(400,'invalid_input');
  if(input.currency!==undefined && (typeof input.currency!=='string' || !/^[A-Z]{3}$/.test(input.currency))) throw new HttpError(400,'invalid_input');
  if(input.available!==undefined && typeof input.available!=='boolean') throw new HttpError(400,'invalid_input');
  if(input.metadata!==undefined && (!input.metadata || typeof input.metadata!=='object' || Array.isArray(input.metadata))) throw new HttpError(400,'invalid_input');
  const paidAt=input.paidAt===undefined?null:new Date(String(input.paidAt));
  if(paidAt && (!Number.isFinite(paidAt.getTime()) || paidAt.getTime()>Date.now())) throw new HttpError(400,'invalid_input');
  return billingTransaction(this.pool,async client=>{
   const old=(await client.query<Payment>('SELECT * FROM local_provider_payment WHERE id=$1 FOR UPDATE',[id])).rows[0];if(!old) throw new HttpError(404,'not_found');
   const next=String(input.status);
   if(old.status!==next && !((old.status==='pending' && ['succeeded','canceled','expired'].includes(next)) || (old.status==='succeeded' && ['canceled','revoked','expired'].includes(next)))) throw new HttpError(409,'provider_terminal');
   // paidAt freezes on first success, even repeated operator notifications cannot extend it.
   return (await client.query<Payment>(`UPDATE local_provider_payment SET status=$2,version=version+1,amount_minor=$3,currency=$4,metadata=$5,paid_at=COALESCE(paid_at,$6),available=$7 WHERE id=$1 RETURNING *`,[id,next,input.amountMinor??old.amount_minor,input.currency??old.currency,input.metadata??old.metadata,old.paid_at??(next==='succeeded'?(paidAt??new Date()):null),input.available??old.available])).rows[0]!;
  });
 }
}

// An adapter returns these only after independent authenticated canonical GETs.
// They carry identity, not a synthetic provider chronology/version.
export interface LiveBinding {
 provider:string; merchant:string; mode:'live'; tenant:string; intent:string;
 plan:'team'; amountMinor:number; currency:string; durationDays:number;
}
export interface VerifiedPayment extends LiveBinding {
 id:string; status:'pending'|'succeeded'|'canceled'|'declined'; paid:boolean; paidAt:string|null; confirmationUrl?:ConfirmationUrl|null;
}
export interface VerifiedRefund {
 id:string; paymentId:string; provider:string; merchant:string; mode:'live';
 status:'pending'|'succeeded'|'canceled'; amountMinor:number; currency:string;
}
export interface CanonicalProvider {
 // Every replay uses binding.intent as the remote idempotency key.
 create(binding:Readonly<LiveBinding>,request?:Readonly<CreateRequest>|null):Promise<VerifiedPayment>;
 fetch(paymentId:string,expected?:Readonly<LiveBinding>):Promise<VerifiedPayment>;
 fetchRefund(refundId:string,expected?:Readonly<LiveBinding>,paymentId?:string):Promise<VerifiedRefund>;
}

export type ConfirmationUrl=string & {readonly __confirmationUrl:unique symbol};
export interface CreateRequest {
 amount:{value:string;currency:'RUB'};capture:true;
 confirmation:{type:'redirect';return_url:string};description:string;metadata:{order_id:string};
}
// Shared N3 timestamp contract: retain raw precision, truncate Date to milliseconds.
export function parseProviderTimestamp(value:unknown):Date {
 const m=typeof value==='string' && value.length<=64?/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,9})?Z$/.exec(value):null;
 if(!m) throw new HttpError(409,'payment_mismatch');
 const year=Number(m[1]),month=Number(m[2]),day=Number(m[3]);
 const leap=year%4===0 && (year%100!==0 || year%400===0);
 const days=[31,leap?29:28,31,30,31,30,31,31,30,31,30,31];
 const n=Date.parse(value as string);
 if(month<1 || month>12 || day<1 || day>days[month-1]! || Number(m[4])>23 || Number(m[5])>59 || Number(m[6])>59 || !Number.isFinite(n)) throw new HttpError(409,'payment_mismatch');
 return new Date(n);
}
export function validateConfirmationUrl(value:unknown):ConfirmationUrl {
 if(typeof value!=='string' || value.length>2048 || /[\u0000-\u0020\u007f]/.test(value)) throw new HttpError(409,'invalid_confirmation_url');
 let url:URL;try {url=new URL(value);} catch {throw new HttpError(409,'invalid_confirmation_url');}
 if(url.protocol!=='https:' || url.hostname!=='yoomoney.ru' || url.username || url.password || url.port) throw new HttpError(409,'invalid_confirmation_url');
 return value as ConfirmationUrl;
}
export function formatMinor(value:number) {
 if(!Number.isSafeInteger(value) || value<1 || value>2147483647) throw new HttpError(400,'invalid_price');
 return `${Math.floor(value/100)}.${String(value%100).padStart(2,'0')}`;
}
