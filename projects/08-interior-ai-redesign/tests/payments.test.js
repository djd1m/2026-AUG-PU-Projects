import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID,randomBytes } from 'node:crypto';
import { createProvider,verifyPayment,verifyRefund,minor,confirmationUrl } from '../web/provider.js';
import { paymentInput,notification,createPayments,CREATE_WINDOW_MS } from '../web/payments.js';
import { readConfig } from '../web/config.js';
import { createFixtureProvider } from '../web/payment-fixture.js';
const config={providerMode:'live',shopId:'123',providerSecret:'synthetic-test-secret'};
const intent={id:randomUUID(),account_id:randomUUID(),merchant_id:'123',amount_minor:90000,provider_id:randomUUID()};
const payment=()=>({id:intent.provider_id,recipient:{account_id:'123'},metadata:{intent_id:intent.id,account_id:intent.account_id,package:'ROOM20'},amount:{value:'900.00',currency:'RUB'},status:'succeeded',paid:true});
test('PAY-01 price/input/key and notification signals are bounded',()=>{
  const b={package:'ROOM20',idempotency_key:'key'};
  assert.equal(paymentInput(b).hash,paymentInput({...b,idempotency_key:'other'}).hash);
  for(const p of [null,[],{}, {...b,price:1},{...b,package:'OTHER'},{...b,idempotency_key:''},{...b,partner_id:randomUUID()}])assert.throws(()=>paymentInput(p));
  assert.deepEqual(notification({event:'payment.succeeded',object:{id:intent.provider_id,amount:{value:'0.01'}}}),{kind:'payment',event:'payment.succeeded',id:intent.provider_id});
  for(const event of ['payment.refunded','unknown',undefined])assert.throws(()=>notification({event,object:{id:intent.provider_id}}));
  assert.ok(CREATE_WINDOW_MS<24*60*60*1000);
});
test('PAY-02 provider binding guard rejects the wrong merchant',()=>{
  const p=payment();p.recipient.account_id='other';let rejected=false;
  try{verifyPayment(p,intent,intent.provider_id,'succeeded');}catch{rejected=true;}
  assert.equal(rejected,true,'PAY-02 wrong merchant must be rejected');
});
test('PAY-02 every verified payment binding field rejects independently',()=>{
  assert.doesNotThrow(()=>verifyPayment(payment(),intent,intent.provider_id,'succeeded'));
  const edits=[p=>p.id=randomUUID(),p=>p.metadata.intent_id=randomUUID(),p=>p.metadata.account_id=randomUUID(),
    p=>p.metadata.package='OTHER',p=>p.amount.value='899.99',p=>p.amount.currency='USD',p=>p.paid=false,p=>p.status='pending'];
  for(const edit of edits){const p=payment();edit(p);assert.throws(()=>verifyPayment(p,intent,intent.provider_id,'succeeded'));}
  assert.throws(()=>verifyPayment(payment(),{...intent,provider_id:randomUUID()},intent.provider_id,'succeeded'));
});
test('PAY-04 exact positive minor RUB and refund bindings',()=>{
  const id=randomUUID(),r={id,payment_id:intent.provider_id,status:'succeeded',amount:{value:'0.01',currency:'RUB'}};
  assert.equal(verifyRefund(r,id,intent.provider_id),1);
  for(const amount of [{value:'0.00',currency:'RUB'},{value:'900.01',currency:'RUB'},{value:'1e2',currency:'RUB'},
    {value:900,currency:'RUB'},{value:'900.0',currency:'RUB'},{value:'0900.00',currency:'RUB'},{value:'1.00',currency:'USD'}])assert.throws(()=>verifyRefund({...r,amount},id,intent.provider_id));
  for(const patch of [{id:randomUUID()},{payment_id:randomUUID()},{status:'pending'}])assert.throws(()=>verifyRefund({...r,...patch},id,intent.provider_id));
  assert.equal(minor({value:'900.00',currency:'RUB'}),90000);
});
test('SEC-01 disabled/missing live keys refuse; fixture explicit and production forbidden',()=>{
  for(const c of [{},{...config,providerMode:'disabled'},{...config,providerSecret:undefined},{...config,shopId:undefined}])assert.throws(()=>createProvider(c),e=>e.status===503);
  for(const runtime of ['production',undefined])assert.throws(()=>createFixtureProvider({}, {providerMode:'fixture',runtime}));
  const e={NODE_ENV:'test',DATABASE_URL:`postgresql://rk:${randomBytes(24).toString('hex')}@localhost/test`,SESSION_SECRET:randomBytes(32).toString('hex'),APP_ORIGIN:'http://localhost:18088',STORAGE_DIR:'/tmp/n8-pay-test',PROVIDER_MODE:'fixture',WORKER_MODE:'disabled',PLATFORM_DAILY_LIMIT:'200',ACCOUNT_DAILY_LIMIT:'20'};
  assert.equal(readConfig(e).providerMode,'fixture');assert.throws(()=>readConfig({...e,NODE_ENV:'production'}));
  assert.equal(readConfig({...e,PROVIDER_MODE:'live'}).providerMode,'live');
  const disabled=createPayments({}, {runtime:'test',platformDailyLimit:200,accountDailyLimit:20,providerMode:'disabled'});
  return assert.rejects(disabled.create(randomUUID(),{package:'ROOM20',idempotency_key:'key'}),e=>e.status===503);
});
test('PAY-01 hosted confirmation permits HTTPS credentials-free, fixture local exception only',()=>{
  assert.equal(confirmationUrl('https://checkout.example/pay'),'https://checkout.example/pay');
  for(const u of ['http://evil.test','https://user:pass@evil.test','javascript:alert(1)','not-url'])assert.throws(()=>confirmationUrl(u));
  assert.equal(confirmationUrl('http://localhost:18088/',true,'http://localhost:18088'),'http://localhost:18088/');
  assert.throws(()=>confirmationUrl('http://localhost:9999/',true,'http://localhost:18088'));
});
test('PAY-02 adapter fixed endpoint, auth, immutable body/key and capped/invalid injected responses',async()=>{
  let captured;const adapter=createProvider(config,{fetchImpl:async(url,options)=>{captured={url,options};return new Response(JSON.stringify(payment()));}});
  await adapter.create('{"immutable":true}',intent.id);
  assert.equal(captured.url,'https://api.yookassa.ru/v3/payments');assert.equal(captured.options.redirect,'error');
  assert.equal(captured.options.headers['Idempotence-Key'],intent.id);assert.equal(captured.options.body,'{"immutable":true}');
  assert.ok(captured.options.headers.Authorization.startsWith('Basic '));
  for(const response of [()=>new Response('{'),()=>new Response('x'.repeat(65537)),()=>new Response('{}',{status:302}),()=>new Response('{}',{headers:{'content-length':'65537'}})]) {
    await assert.rejects(createProvider(config,{fetchImpl:async()=>response()}).payment(intent.provider_id),e=>e.status===503);
  }
});
test('PAY-02 timeout bounds injected slow headers and streaming body to5s',async()=>{
  for(const stage of ['headers','body']) {
    const adapter=createProvider(config,{fetchImpl:async(_url,{signal})=>{
      if(stage==='headers')return new Promise((resolve,reject)=>signal.addEventListener('abort',()=>reject(new Error('aborted')),{once:true}));
      return new Response(new ReadableStream({start(controller){controller.enqueue(new TextEncoder().encode('{'));
        signal.addEventListener('abort',()=>controller.error(new Error('aborted')),{once:true});}}));
    }});
    const start=Date.now();await assert.rejects(adapter.payment(intent.provider_id),e=>e.status===503);
    assert.ok(Date.now()-start>=4900 && Date.now()-start<7000);
  }
});
