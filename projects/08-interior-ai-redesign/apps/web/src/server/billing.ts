import { DomainError } from '@n8/domain/common';
import { BillingService, orderDto, type PaymentProvider } from '@n8/domain/billing';
import { PgBilling } from '@n8/db/billing';
import { createYooKassaProvider, isYooKassaPeer } from '@n8/adapters/yookassa';
import { getBase, type Base } from './composition';
import { guardRequest, readJson, route, success, RateLimitError } from './http';
import { requestPeer } from './peer';
export interface BillingTestOptions { provider?: PaymentProvider; sourceVerifier?: (peer:string)=>boolean }
function checkTest(options?:BillingTestOptions):void{if(options&&process.env.NODE_ENV!=='test')throw new Error('PAYMENT_TEST_INJECTION_FORBIDDEN');}
export function billingServices(base:Base=getBase(),options?:BillingTestOptions){
  checkTest(options);const store=new PgBilling(base.pool),live=base.config.paymentLive;
  if(base.config.paymentsMode!=='live'||!live)throw new DomainError(503,'PAYMENTS_DISABLED','Оплата не настроена');
  const provider=options?.provider??createYooKassaProvider(live);
  return{store,service:new BillingService(store,provider,{...live,publicOrigin:base.config.publicOrigin})};
}
export function offersHandler(base?:Base){return route(async(request,requestId)=>{const b=base??getBase();await guardRequest(request,{access:'read'},b,requestId);const enabled=b.config.paymentsMode==='live'&&!!b.config.paymentLive;
  return success({enabled,offers:enabled?b.config.paymentLive!.skus:[]},requestId);});}
export function checkoutHandler(base?:Base,options?:BillingTestOptions){checkTest(options);return route(async(request,requestId)=>{
  const b=base??getBase();const actor=await guardRequest(request,{access:'mutation'},b,requestId);const{service}=billingServices(b,options);
  return success(await service.checkout(actor.accountId,request.headers.get('idempotency-key')??'',await readJson(request)),requestId,200);
});}
export function ordersHandler(id?:string,base?:Base){return route(async(request,requestId)=>{
  const b=base??getBase();const actor=await guardRequest(request,{access:'read'},b,requestId);const store=new PgBilling(b.pool);
  if(id)return success(orderDto(await store.get(actor.accountId,id)),requestId);
  const page=await store.list(actor.accountId,new URL(request.url).searchParams.get('cursor')??undefined);return success({...page,items:page.items.map(orderDto)},requestId);
});}
export function webhookHandler(base?:Base,options?:BillingTestOptions){checkTest(options);return route(async(request,requestId)=>{
  const b=base??getBase();if(b.config.paymentsMode!=='live')throw new DomainError(404,'NOT_FOUND','Не найдено');
  const peer=requestPeer(request);if(!(options?.sourceVerifier??isYooKassaPeer)(peer))throw new DomainError(403,'PAYMENT_SOURCE_FORBIDDEN','Источник не разрешён');
  const rate=await b.rate.hit(b.hashSubject(`payment:${peer}`),'mutation',60);if(!rate.allowed)throw new RateLimitError(rate.retryAfter);
  const{service}=billingServices(b,options);return success(await service.notification(await readJson(request)),requestId);
});}
