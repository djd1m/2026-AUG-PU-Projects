import { createHash } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import { z } from 'zod';
import { canonical, DomainError, safeInteger } from '@n8/domain/common';
import { verifyPayment, invalidProof, type BillingStore, type Order, type Payment, type PaymentConfig, type PaymentSku, type VerifiedEvent } from '@n8/domain/billing';
import { withTransaction, validId } from './common.js';
interface OrderRow { id:string; account_id:string; sku:string; price_minor:string; currency:'RUB'; credits:number; unwatermarked_export:boolean; remote_id:string|null; state:Order['state']; confirmation_url:string|null; created_at:Date; paid_at:Date|null; request_hash:string; cursor_at?:string }
const columns = `*,to_char(created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS cursor_at`;
function intentHash(offer:PaymentSku,config:PaymentConfig):string {
  return createHash('sha256').update(canonical({sku:offer.sku,priceMinor:offer.priceMinor,currency:offer.currency,credits:offer.credits,unwatermarkedExport:offer.unwatermarkedExport,shopId:config.shopId,testMode:config.testMode})).digest('hex');
}
function order(row: OrderRow): Order { return { id:row.id,accountId:row.account_id,sku:row.sku,priceMinor:safeInteger(row.price_minor),currency:row.currency,credits:row.credits,
  unwatermarkedExport:row.unwatermarked_export,remoteId:row.remote_id,state:row.state,confirmationUrl:row.confirmation_url,createdAt:row.created_at.toISOString(),paidAt:row.paid_at?.toISOString()??null }; }
async function accountLock(c: PoolClient, id: string): Promise<{ billing_hold:boolean; status:string }> {
  const row=(await c.query<{billing_hold:boolean;status:string}>('SELECT billing_hold,status FROM account WHERE id=$1 FOR UPDATE',[id])).rows[0];
  if (!row) throw new DomainError(404,'NOT_FOUND','Не найдено'); return row;
}
async function lockedOrder(c: PoolClient, accountId: string, id: string): Promise<OrderRow> {
  const row=(await c.query<OrderRow>('SELECT * FROM payment_order WHERE id=$1 AND account_id=$2 FOR UPDATE',[id,accountId])).rows[0];
  if (!row) throw new DomainError(404,'NOT_FOUND','Не найдено'); return row;
}
export class PgBilling implements BillingStore {
  constructor(private readonly pool: Pool) {}
  async prepare(accountId:string,key:string,offer:PaymentSku,config:PaymentConfig):Promise<Order> {
    const hash=intentHash(offer,config);
    return withTransaction(this.pool,async c=>{
      const a=await accountLock(c,accountId);
      const existing=(await c.query<OrderRow>('SELECT * FROM payment_order WHERE account_id=$1 AND idempotency_key=$2 FOR UPDATE',[accountId,key])).rows[0];
      if(existing){ if(existing.request_hash!==hash) throw new DomainError(409,'IDEMPOTENCY_CONFLICT','Этот ключ уже связан с другим пакетом');
        if(a.billing_hold && ['created','pending'].includes(existing.state)) throw new DomainError(409,'BILLING_HOLD','Нужна сверка оплаты'); return order(existing); }
      if(a.status!=='active'||a.billing_hold) throw new DomainError(409,'BILLING_HOLD','Нужна сверка оплаты');
      const row=(await c.query<OrderRow>(`INSERT INTO payment_order(account_id,sku,price_minor,currency,credits,unwatermarked_export,idempotency_key,request_hash,provider)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,'yookassa') RETURNING *`,[accountId,offer.sku,offer.priceMinor,offer.currency,offer.credits,offer.unwatermarkedExport,key,hash])).rows[0];return order(row);
    });
  }
  async bind(accountId:string,id:string,payment:Payment,config:PaymentConfig):Promise<Order> {
    return withTransaction(this.pool,async c=>{
      await accountLock(c,accountId);const row=await lockedOrder(c,accountId,id);if(row.request_hash!==intentHash(order(row),config))invalidProof();verifyPayment(payment,order(row),config);
      // Checkout never grants credits, even if the provider already succeeded. Preserve terminal states.
      const state=['created','pending'].includes(row.state)?payment.status==='canceled'?'canceled':'pending':row.state;
      const updated=(await c.query<OrderRow>(`UPDATE payment_order SET remote_id=COALESCE(remote_id,$2),state=$3,
        confirmation_url=CASE WHEN $3='pending' THEN $4 ELSE NULL END WHERE id=$1 RETURNING *`,[id,payment.id,state,payment.confirmationUrl])).rows[0];return order(updated);
    });
  }
  async apply(event:VerifiedEvent,config:PaymentConfig):Promise<{outcome:'applied'|'duplicate'|'ignored'}> {
    const {payment,refund}=event;
    if(!z.string().uuid().safeParse(payment.orderId).success) invalidProof();
    const metadata=(await this.pool.query<{account_id:string}>('SELECT account_id FROM payment_order WHERE id=$1',[payment.orderId])).rows[0];if(!metadata)invalidProof();
    return withTransaction(this.pool,async c=>{
      const a=await accountLock(c,metadata.account_id);const row=await lockedOrder(c,metadata.account_id,payment.orderId);if(row.request_hash!==intentHash(order(row),config))invalidProof();verifyPayment(payment,order(row),config,true);
      if(event.kind==='refund_hold'&&(!refund||refund.paymentId!==payment.id||refund.status!=='succeeded'||refund.currency!=='RUB'||!Number.isSafeInteger(refund.amountMinor)||refund.amountMinor<=0||refund.amountMinor>payment.amountMinor))invalidProof();
      const objectId=event.kind==='succeeded'?payment.id:refund!.id;const key=`${event.kind}:${objectId}`;
      const inserted=await c.query(`INSERT INTO payment_event(provider,remote_event_key,order_id,kind,remote_object_id,payload_hash,applied_at)
        VALUES('yookassa',$1,$2,$3,$4,$5,now()) ON CONFLICT DO NOTHING RETURNING id`,[key,row.id,event.kind,objectId,createHash('sha256').update(canonical(event)).digest('hex')]);
      if(!inserted.rowCount)return{outcome:'duplicate'};
      if(event.kind==='refund_hold'){
        await c.query("UPDATE payment_order SET remote_id=COALESCE(remote_id,$2),state='refund_hold',confirmation_url=NULL WHERE id=$1",[row.id,payment.id]);
        await c.query('UPDATE account SET billing_hold=true,paid_export=false WHERE id=$1',[row.account_id]);
        await c.query(`UPDATE share_link s SET revoked_at=COALESCE(s.revoked_at,now()) FROM project p,asset a
          WHERE s.project_id=p.id AND p.account_id=$1 AND a.id=s.asset_id AND a.project_id=p.id AND a.metadata->>'watermarked'='false'`,[row.account_id]);
        return{outcome:'applied'};
      }
      if(!['created','pending'].includes(row.state)||a.billing_hold||a.status!=='active'){
        await c.query(`INSERT INTO audit_event(account_id,kind,event_key,request_id,data) VALUES($1,'payment_ignored',$2,$3,$4)`,[row.account_id,key,row.id,{orderId:row.id,reason:a.billing_hold?'billing_hold':row.state}]);
        return{outcome:'ignored'};
      }
      await c.query("UPDATE payment_order SET remote_id=COALESCE(remote_id,$2),state='succeeded',paid_at=now(),confirmation_url=NULL WHERE id=$1",[row.id,payment.id]);
      await c.query('UPDATE account SET credits_available=credits_available+$2,paid_export=paid_export OR $3 WHERE id=$1',[row.account_id,row.credits,row.unwatermarked_export]);
      return{outcome:'applied'};
    });
  }
  async get(accountId:string,id:string):Promise<Order>{validId(id);const row=(await this.pool.query<OrderRow>('SELECT * FROM payment_order WHERE id=$1 AND account_id=$2',[id,accountId])).rows[0];if(!row)throw new DomainError(404,'NOT_FOUND','Не найдено');return order(row);}
  async list(accountId:string,cursor?:string):Promise<{items:Order[];nextCursor:string|null}>{
    let after:{at:string;id:string}|undefined;
    if(cursor){try{if(cursor.length>512||!/^[A-Za-z0-9_-]+$/.test(cursor))throw Error();after=z.object({at:z.string().datetime(),id:z.string().uuid()}).strict().parse(JSON.parse(Buffer.from(cursor,'base64url').toString('utf8')));}catch{throw new DomainError(400,'INVALID_CURSOR','Некорректная страница');}}
    const rows=(await this.pool.query<OrderRow>(`SELECT ${columns} FROM payment_order WHERE account_id=$1 ${after?'AND (created_at,id)<($2::timestamptz,$3::uuid)':''} ORDER BY created_at DESC,id DESC LIMIT 51`,after?[accountId,after.at,after.id]:[accountId])).rows;
    const page=rows.slice(0,50),last=page.at(-1);return{items:page.map(order),nextCursor:rows.length>50&&last?Buffer.from(JSON.stringify({at:last.cursor_at,id:last.id})).toString('base64url'):null};
  }
}
