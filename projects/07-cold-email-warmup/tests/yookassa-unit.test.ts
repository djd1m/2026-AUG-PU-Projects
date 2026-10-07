import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { YooKassaProvider } from '../src/billing/yookassa.js';
import { formatMinor,parseProviderTimestamp,validateConfirmationUrl,type CreateRequest,type LiveBinding } from '../src/billing/provider.js';
const b:LiveBinding={provider:'yookassa',merchant:'123',mode:'live',tenant:randomUUID(),intent:randomUUID(),plan:'team',amountMinor:25001,currency:'RUB',durationDays:30};
const paymentId=randomUUID(),refundId=randomUUID();
const body:CreateRequest={amount:{value:'250.01',currency:'RUB'},capture:true,confirmation:{type:'redirect',return_url:'https://cabinet.example/app?billingIntent='+b.intent},description:'Team',metadata:{order_id:b.intent}};
const raw=()=>({id:paymentId,status:'pending',amount:{value:'250.01',currency:'RUB'},recipient:{account_id:'123'},test:false,paid:false,metadata:{order_id:b.intent},confirmation:{confirmation_url:'https://yoomoney.ru/checkout/payments/v2/contract?orderId='+paymentId}});
const response=(value:unknown)=>new Response(JSON.stringify(value),{headers:{'content-type':'application/json'}});
const provider=(fetchImpl:typeof fetch)=>new YooKassaProvider({shopId:'123',secretKey:'offline-canary',fetchImpl});
test('YooKassa fixed origin, auth, intent key and exact persisted POST/GET context',async()=>{
 const calls:Array<{url:string;init:RequestInit}>=[];
 const p=provider(async(url,init)=>{calls.push({url:String(url),init:init!});return response(raw());});
 const first=await p.create(b,body,Date.now()+60000);assert.equal(first.intent,b.intent);assert.equal(first.tenant,b.tenant);assert.equal(first.amountMinor,25001);
 assert.equal(calls[0]!.url,'https://api.yookassa.ru/v3/payments');assert.equal(calls[0]!.init.method,'POST');assert.equal(calls[0]!.init.redirect,'error');assert.ok(calls[0]!.init.signal);
 const headers=new Headers(calls[0]!.init.headers);assert.equal(headers.get('authorization'),'Basic '+Buffer.from('123:offline-canary').toString('base64'));assert.equal(headers.get('idempotence-key'),b.intent);assert.deepEqual(JSON.parse(String(calls[0]!.init.body)),body);
 await p.create(b,body,Date.now()+60000);assert.equal(calls[1]!.init.body,calls[0]!.init.body);
 await p.fetch(paymentId,b);assert.equal(calls[2]!.url,'https://api.yookassa.ru/v3/payments/'+paymentId);assert.equal(calls[2]!.init.method,'GET');
 const before=calls.length;await assert.rejects(p.fetch(paymentId));await assert.rejects(p.create(b));await assert.rejects(p.create(b,{...body,metadata:{order_id:randomUUID()}}));assert.equal(calls.length,before);
 assert.equal(formatMinor(1),'0.01');assert.equal(formatMinor(2147483647),'21474836.47');
});
test('actual POST boundary requires an unexpired persisted create deadline',async()=>{
 let posts=0;const p=provider(async()=>{posts++;return response(raw());});
 for(const expires of [undefined,NaN,Date.now()-1,Date.now()]) await assert.rejects(p.create(b,body,expires),{code:'checkout_reconciliation_required'});
 assert.equal(posts,0);await p.create(b,body,Date.now()+60000);assert.equal(posts,1);
});
test('raw provider identity/context is verified before local field enrichment',async()=>{
 for(const patch of [{id:randomUUID()},{recipient:{account_id:'999'}},{test:true},{metadata:{order_id:randomUUID()}},{amount:{value:'250.00',currency:'RUB'}},{amount:{value:'250.01',currency:'USD'}},{amount:{value:'0250.01',currency:'RUB'}},{status:'unexpected'}]) await assert.rejects(provider(async()=>response({...raw(),...patch})).fetch(paymentId,b));
 for(const paidAt of [null,'invalid','2025-02-29T01:00:00Z','2026-04-31T01:00:00Z','2026-01-01T24:00:00Z']) await assert.rejects(provider(async()=>response({...raw(),status:'succeeded',paid:true,captured_at:paidAt})).fetch(paymentId,b));
 await assert.rejects(provider(async()=>response({...raw(),status:'succeeded',paid:false,captured_at:'2026-01-01T00:00:00Z'})).fetch(paymentId,b));
 const rawTime='2024-02-29T01:02:03.123456789Z';const result=await provider(async()=>response({...raw(),status:'succeeded',paid:true,captured_at:rawTime})).fetch(paymentId,b);assert.equal(result.paidAt,rawTime);assert.equal(parseProviderTimestamp(rawTime).toISOString(),'2024-02-29T01:02:03.123Z');
 for(const status of ['waiting_for_capture','canceled']){const value={...raw(),status,confirmation:undefined};assert.equal((await provider(async()=>response(value)).fetch(paymentId,b)).status,status==='waiting_for_capture'?'pending':'canceled');}
});
test('strict calendar precision and confirmation host/credentials/ports/control guards',()=>{
 for(const time of ['2024-02-29T00:00:00Z','2024-02-29T00:00:00.1Z','2024-02-29T00:00:00.123456Z','2024-02-29T00:00:00.123456789Z']) assert.ok(Number.isFinite(parseProviderTimestamp(time).getTime()));
 for(const time of ['1900-02-29T00:00:00Z','2024-02-30T00:00:00Z','2024-13-01T00:00:00Z','2024-01-01T00:60:00Z','2024-01-01T00:00:00.1234567890Z']) assert.throws(()=>parseProviderTimestamp(time));
 assert.equal(validateConfirmationUrl('https://yoomoney.ru/pay'),'https://yoomoney.ru/pay');
 for(const url of ['http://yoomoney.ru/pay','https://yoomoney.ru.evil.test/pay','https://evil.test/yoomoney.ru','https://user:pass@yoomoney.ru','https://yoomoney.ru:444/pay','https://yoomoney.ru./pay','https://yoomoney.ru/\nfoo']) assert.throws(()=>validateConfirmationUrl(url));
});
test('bounded streamed JSON abort/error budgets fail closed and oversized stream cancels',async()=>{
 let canceled=false;
 const streamed=()=>new Response(new ReadableStream<Uint8Array>({start(c){c.enqueue(new Uint8Array(32768).fill(32));c.enqueue(new Uint8Array(32769).fill(32));},cancel(){canceled=true;}}),{headers:{'content-type':'application/json'}});
 await assert.rejects(provider(async()=>streamed()).fetch(paymentId,b),{code:'provider_body_too_large'});assert.equal(canceled,true);
 for(const r of [new Response('{}',{headers:{'content-type':'text/plain'}}),new Response('invalid',{headers:{'content-type':'application/json'}}),new Response('[]',{headers:{'content-type':'application/json'}}),new Response('{}',{status:503}),new Response('{}',{headers:{'content-type':'application/json','content-length':'65537'}}),new Response('{}',{headers:{'content-type':'application/json','content-length':'oops'}})]) await assert.rejects(provider(async()=>r).fetch(paymentId,b));
 await assert.rejects(provider(async()=>{throw new DOMException('aborted','AbortError');}).fetch(paymentId,b),{code:'provider_unavailable'});
 await assert.rejects(provider(async()=>{const r=response(raw());Object.defineProperty(r,'redirected',{value:true});return r;}).fetch(paymentId,b),{code:'provider_unavailable'});
 const text=JSON.stringify(raw());const exact=text+' '.repeat(65536-Buffer.byteLength(text));assert.equal((await provider(async()=>new Response(exact,{headers:{'content-type':'application/json'}})).fetch(paymentId,b)).id,paymentId);
});
test('refund obtains merchant/live context from bound canonical payment, never refund metadata',async()=>{
 const r={id:refundId,payment_id:paymentId,status:'succeeded',amount:{value:'0.01',currency:'RUB'},created_at:'2026-01-01T00:00:00.123456Z'};
 const calls:string[]=[];const p=provider(async url=>{calls.push(String(url));return response(String(url).includes('/refunds/')?r:raw());});
 const refund=await p.fetchRefund(refundId,b,paymentId);assert.equal(refund.merchant,'123');assert.equal(refund.mode,'live');assert.deepEqual(calls,['https://api.yookassa.ru/v3/refunds/'+refundId,'https://api.yookassa.ru/v3/payments/'+paymentId]);
 for(const patch of [{id:randomUUID()},{payment_id:randomUUID()},{amount:{value:'250.02',currency:'RUB'}},{created_at:'2025-02-29T00:00:00Z'}]) await assert.rejects(provider(async()=>response({...r,...patch})).fetchRefund(refundId,b,paymentId));
 await assert.rejects(provider(async url=>response(String(url).includes('/refunds/')?r:{...raw(),test:true})).fetchRefund(refundId,b,paymentId));
});
