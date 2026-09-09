import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createHttpServer } from '../apps/api/http.mjs';
import { referralPaymentFixture as setup } from './helpers/referral-payment-fixture.mjs';

async function serve(t,app,mode='hybrid') {
  const server=createHttpServer(app,{mode,cookieSecure:false});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  t.after(()=>new Promise(resolve=>{server.closeAllConnections();server.close(resolve);}));
  const base=`http://127.0.0.1:${server.address().port}`;
  return async (path,input,headers={})=>{
    const response=await fetch(base+path,{method:input===undefined?'GET':'POST',redirect:'manual',headers:{...(input===undefined?{}:{'Content-Type':'application/json'}),...headers},...(input===undefined?{}:{body:JSON.stringify(input)})});
    return {status:response.status,headers:response.headers,text:await response.text()};
  };
}
const origin='http://127.0.0.1:13031';
test('public redirect and classic tracker work on merchant origin; private connector rejects browser and cookie authority',async t=>{
  const x=await setup(t),http=await serve(t,x.f.app);
  const visit=await http(`/r/${x.joined.actorId}`,undefined,{Origin:'https://merchant.example'});
  assert.equal(visit.status,302);assert.equal(new URL(visit.headers.get('location')).origin,'https://merchant.example');
  const tracker=await http(`/api/referrals/${x.config.tenantId}/tracker.js`,undefined,{Origin:'https://merchant.example'});
  assert.equal(tracker.status,200);assert.match(tracker.headers.get('content-type'),/javascript/);assert.ok(!tracker.text.includes(x.key));
  const input={customerId:randomUUID(),email:'verified@example.test',emailVerified:true,visitToken:new URL(visit.headers.get('location')).searchParams.get('n3_ref')};
  const headers={Authorization:`Bearer ${x.key}`};
  assert.equal((await http('/api/integration/order',{orderId:'-'.repeat(36)},headers)).status,400);
  assert.equal((await http('/api/integration/customers',input,{...headers,Origin:origin})).status,403);
  assert.equal((await http('/api/integration/customers',input,{Cookie:`n3_session=${x.owner.token}`})).status,401);
  assert.equal((await http('/api/integration/customers',{...input,tenantId:randomUUID()},headers)).status,400);
  assert.equal((await http('/api/integration/customers',input,headers)).status,200);
  const created=await http('/api/integration/checkout',{customerId:input.customerId,amountMinor:100000,idempotencyKey:randomUUID()},headers);
  assert.equal(created.status,200);const order=JSON.parse(created.text).data;
  const pending=await http('/api/integration/order',{orderId:order.orderId},headers);assert.equal(JSON.parse(pending.text).data.verified,false);
  await x.settle(order);
  const paid=await http('/api/integration/order',{orderId:order.orderId},headers);assert.equal(JSON.parse(paid.text).data.verified,true);
  assert.equal((await http('/api/account/referral-status',{membershipId:x.owner.membershipId},{Cookie:`n3_session=${x.owner.token}`})).status,403);
  assert.equal((await http('/api/account/referral-status',{membershipId:x.owner.membershipId},{Cookie:`n3_session=${x.owner.token}`,Origin:origin})).status,200);
  assert.equal((await http('/api/account/referral-key',{membershipId:x.owner.membershipId},{Cookie:`n3_session=${x.partner.token}`,Origin:origin})).status,403);
});

test('public flood has bounded separate quota; forged forwarded IP cannot evade it and account remains usable',async t=>{
  let visits=0,statusReads=0;
  const http=await serve(t,{referrals:{visit:async()=>{visits++;return {location:'https://merchant.example/'};},status:async()=>{statusReads++;return {metrics:{visits}};}},identity:{}});
  // Same socket peer has already used a small part of the module-wide public budget in the prior test.
  let rejected=0;
  for(let i=0;i<305;i++) if((await http(`/r/${randomUUID()}`,undefined,{'X-Forwarded-For':`198.51.100.${i%250}`})).status===429)rejected++;
  assert.ok(rejected>=5);assert.ok(visits<=300);
  const account=await http('/api/account/referral-status',{membershipId:randomUUID()},{Origin:origin,Cookie:'n3_session=opaque'});
  assert.equal(account.status,200);assert.equal(statusReads,1);
});

test('fixture mode exposes no real referral or connector routes',async t=>{
  const http=await serve(t,{},'fixture');
  assert.equal((await http(`/r/${randomUUID()}`)).status,404);
  assert.equal((await http('/api/integration/customers',{})).status,404);
});
