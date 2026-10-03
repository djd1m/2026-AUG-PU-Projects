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
