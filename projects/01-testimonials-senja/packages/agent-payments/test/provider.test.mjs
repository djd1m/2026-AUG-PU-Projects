import test from 'node:test';
import assert from 'node:assert/strict';
import { YooKassaTestProvider } from '../dist/provider-yookassa.js';
const request={attemptId:'attempt',orderId:'order',scope:{merchantId:'merchant',buyerId:'buyer',resourceId:'resource'},amount:{minor:'99000',currency:'RUB'},description:'Subscription',idempotencyKey:'attempt',returnUrl:'https://example.com/return',saveMethod:true};
function fixture(overrides={}) {return {id:'psp',test:true,recipient:{account_id:'shop'},status:'succeeded',paid:true,amount:{value:'990.00',currency:'RUB'},metadata:{module_order_id:'order',module_attempt_id:'attempt',module_merchant_id:'merchant',module_buyer_id:'buyer',module_resource_id:'resource'},payment_method:{id:'private-method',saved:true},...overrides};}
function provider(raw,capture=()=>{}) {return new YooKassaTestProvider({shopId:'shop',secretKey:'test_fixture',fetch:async(url,options)=>{capture(url,options);return new Response(JSON.stringify(raw),{status:200});}});}
test('reject live configuration before network',()=>assert.throws(()=>new YooKassaTestProvider({shopId:'shop',secretKey:'live_fixture'}),/test_credentials_required/));
test('TEST create sends stable key, exact minor amount and scoped metadata',async()=> {
  let calls=0;
  const p=provider(fixture(),(url,options)=>{calls++;assert.equal(url,'https://api.yookassa.ru/v3/payments');assert.equal(options.headers['Idempotence-Key'],'attempt');const body=JSON.parse(options.body);assert.equal(body.amount.value,'990.00');assert.equal(body.save_payment_method,true);assert.equal(body.metadata.module_order_id,'order');});
  const result=await p.create(request);assert.equal(result.status,'succeeded');assert.equal(result.savedMethod.reference,'private-method');assert.equal(calls,1);
});
test('query without provider ID never calls create',async()=>{let calls=0;assert.equal(await provider({},()=>calls++).query(request),null);assert.equal(calls,0);});
for(const [name,override] of Object.entries({live:{test:false},account:{recipient:{account_id:'other'}},amount:{amount:{value:'1.00',currency:'RUB'}},currency:{amount:{value:'990.00',currency:'USD'}},metadata:{metadata:{}},paid:{paid:false},status:{status:'made_up'},url:{confirmation:{confirmation_url:'https://evil.example/checkout'}}})) {
 test(`reject provider ${name} mismatch`,async()=>assert.rejects(provider(fixture(override)).create(request)));
}
test('saved method flow omits hosted confirmation and uses backend-only method',async()=> {
  await provider(fixture(),(_,o)=>{const b=JSON.parse(o.body);assert.equal(b.payment_method_id,'private-method');assert.equal(b.confirmation,undefined);}).create({...request,methodReference:'private-method',saveMethod:false});
});
test('host metadata cannot override reserved module binding',async()=> {
  const p=new YooKassaTestProvider({shopId:'shop',secretKey:'test_fixture',metadataFor:async()=>({module_order_id:'evil'}),fetch:async()=>{throw Error('must not call');}});
  await assert.rejects(p.create(request),/reserved_metadata/);
});
test('refund verifies parent TEST account server side',async()=> {
  let calls=0;const p=new YooKassaTestProvider({shopId:'shop',secretKey:'test_fixture',fetch:async()=>new Response(JSON.stringify(++calls===1?{id:'refund',payment_id:'psp',status:'succeeded',amount:{value:'10.00',currency:'RUB'}}:fixture({test:false})),{status:200})});
  await assert.rejects(p.queryRefund('refund'),/provider_account_or_mode_mismatch/);assert.equal(calls,2);
});
