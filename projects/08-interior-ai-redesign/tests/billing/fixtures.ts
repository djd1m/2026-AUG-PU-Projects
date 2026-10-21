import { randomUUID } from 'node:crypto';
import type { Pool } from 'pg';
import type { Payment, PaymentProvider, Refund, PaymentConfig } from '@n8/domain/billing';
import { PgBilling } from '@n8/db/billing';
import { BillingService } from '@n8/domain/billing';
import { DomainError } from '@n8/domain/common';
export const offer={sku:'room',priceMinor:19900,currency:'RUB' as const,credits:10,unwatermarkedExport:true};
export const config:PaymentConfig={shopId:'12345',testMode:true,publicOrigin:'https://n8.test',skus:[offer]};
export const signal=(id:string,event='payment.succeeded')=>({type:'notification',event,object:{id}});
export function deferred<T=void>(){let resolve!:(value:T)=>void;const promise=new Promise<T>(r=>{resolve=r;});return{promise,resolve};}
export class FixtureProvider implements PaymentProvider {
  payments=new Map<string,Payment>();refunds=new Map<string,Refund>();keys:string[]=[];unavailable=false;
  beforeCreate:(()=>Promise<void>)|undefined;beforeGet:(()=>Promise<void>)|undefined;
  async createPayment(input:{orderId:string;amountMinor:number;returnUrl:string}):Promise<Payment>{
    this.keys.push(input.orderId);if(this.beforeCreate)await this.beforeCreate();
    const existing=[...this.payments.values()].find(x=>x.orderId===input.orderId);
    const payment=existing??{id:randomUUID(),status:'pending',amountMinor:input.amountMinor,currency:'RUB',merchantId:config.shopId,test:true,paid:false,orderId:input.orderId,confirmationUrl:'https://yoomoney.ru/checkout/test'} as Payment;
    this.payments.set(payment.id,payment);if(this.unavailable)throw new DomainError(503,'PAYMENT_PROVIDER_UNAVAILABLE','Недоступно');return structuredClone(payment);
  }
  async getPayment(id:string):Promise<Payment>{if(this.beforeGet)await this.beforeGet();if(this.unavailable)throw new DomainError(503,'PAYMENT_PROVIDER_UNAVAILABLE','Недоступно');const payment=this.payments.get(id);if(!payment)throw Error('fixture missing');return structuredClone(payment);}
  async getRefund(id:string):Promise<Refund>{if(this.unavailable)throw new DomainError(503,'PAYMENT_PROVIDER_UNAVAILABLE','Недоступно');const refund=this.refunds.get(id);if(!refund)throw Error('fixture missing refund');return structuredClone(refund);}
  succeed(id:string){const payment=this.payments.get(id)!;payment.status='succeeded';payment.paid=true;return payment;}
  refund(id:string,amountMinor=100){const refund:Refund={id:randomUUID(),paymentId:id,status:'succeeded',currency:'RUB',amountMinor};this.refunds.set(refund.id,refund);return refund;}
}
export async function account(pool:Pool){const id=randomUUID();await pool.query('INSERT INTO account(id,email_canonical,password_hash) VALUES($1,$2,$3)',[id,`${id}@test.invalid`,'irrelevant']);return id;}
export function services(pool:Pool,provider=new FixtureProvider(),settings=config){const store=new PgBilling(pool);return{store,provider,service:new BillingService(store,provider,settings)};}
export async function counts(pool:Pool,actor:string){return(await pool.query(`SELECT credits_available,paid_export,billing_hold,
 (SELECT count(*)::int FROM payment_event e JOIN payment_order o ON o.id=e.order_id WHERE o.account_id=a.id) events,
 (SELECT count(*)::int FROM payment_order o WHERE o.account_id=a.id) orders FROM account a WHERE id=$1`,[actor])).rows[0];}
