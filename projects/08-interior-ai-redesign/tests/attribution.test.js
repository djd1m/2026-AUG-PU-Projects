import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { createAttribution,trackingToken,trackingCookie,TRACKING_TTL,attributionInput,validCookiePreference,trackingHash } from '../web/attribution.js';
import { createPayments } from '../web/payments.js';
import { activePartner } from '../web/partners.js';
import { attributionFixture } from './attribution-fixtures.js';
const secret=randomBytes(32).toString('hex');
function setup() {
  const f=attributionFixture(),id=f.account(),ownerA=f.account(),ownerB=f.account();
  const a=f.partner(ownerA),b=f.partner(ownerB),self=f.partner(id),config={secret,secureCookie:true,runtime:'test',providerMode:'fixture',origin:'http://localhost:18088',platformDailyLimit:200,accountDailyLimit:20};
  return {...f,id,a,b,self,service:createAttribution(f.pool,config),payments:createPayments(f.pool,config)};
}
const header=r=>r.setCookie?.split(';')[0];
const payment=(key,code)=>({package:'ROOM20',idempotency_key:key,...(code===undefined?{}:{partner_code:code})});

test('ATTR-01 default absent/false and forged consent/cookies cannot establish attribution',async()=>{
  const f=setup();assert.deepEqual((await f.service.state(f.id)).state,{tracking_opt_in:false,source:null,partner_code:null,expires_at:null});
  assert.equal((await f.service.state(f.id)).setCookie,null);
  await assert.rejects(f.service.update(f.id,{action:'capture',partner_code:f.a.code}),e=>e.status===403);
  assert.equal(f.preferences.size,0);assert.equal(f.consents.size,0);
  for(const body of [{action:'capture',partner_code:f.a.code,consent:true},{action:'accept',partner_id:f.a.id},{action:'accept',account_id:f.id}])assert.throws(()=>attributionInput(body));
  const fake='roomkind_attribution='+randomBytes(32).toString('base64url');
  const p=await f.payments.create(f.id,payment('forged'),{cookieHeader:fake});assert.equal(f.intents.get(p.payment_id).partner_id,null);
});

test('ATTR-01 accepted cookie policy, first preference and fixed30d expiry; session unchanged',async()=>{
  const f=setup(),r=await f.service.update(f.id,{action:'accept',partner_code:f.a.code});
  assert.match(r.setCookie,/HttpOnly; SameSite=Lax; Max-Age=2592000; Secure$/);
  assert.equal(r.state.tracking_opt_in,true);assert.equal(r.state.source,'cookie');
  const h='roomkind_session='+randomBytes(32).toString('base64url')+'; '+header(r);
  assert.equal((await f.service.state(f.id,h)).state.partner_code,f.a.code);
  const ignored=await f.service.update(f.id,{action:'capture',partner_code:f.b.code},h);
  assert.equal(ignored.state.partner_code,f.a.code);assert.equal(ignored.setCookie,null);assert.equal(ignored.state.expires_at.getTime(),r.state.expires_at.getTime());
  const p=await f.payments.create(f.id,payment('cookie'),{cookieHeader:h});assert.equal(f.intents.get(p.payment_id).partner_id,f.a.id);
  f.advance(TRACKING_TTL*1000);
  const expired=await f.service.state(f.id,h);assert.equal(expired.state.source,null);assert.equal(f.preferences.size,0);
  assert.match(expired.setCookie,/roomkind_attribution=;.*Max-Age=0/);assert.doesNotMatch(expired.setCookie,/roomkind_session/);
});

test('ATTR-01 denied tracking deletes preference, resets opt-in; manual then works without cookie',async()=>{
  const f=setup(),r=await f.service.update(f.id,{action:'accept',partner_code:f.a.code});
  const denied=await f.service.update(f.id,{action:'deny'},header(r));
  assert.equal(denied.state.tracking_opt_in,false);assert.equal(denied.state.source,null);assert.equal(f.preferences.size,0);
  assert.match(denied.setCookie,/Max-Age=0/);assert.doesNotMatch(denied.setCookie,/roomkind_session/);
  const manual=await f.service.update(f.id,{action:'manual',partner_code:f.b.code});assert.equal(manual.setCookie,null);
  assert.equal(manual.state.tracking_opt_in,false);const p=await f.payments.create(f.id,payment('manual'));
  assert.equal(f.intents.get(p.payment_id).partner_id,f.b.id);
});

test('ATTR-01 missing/blocked/tampered/repeated and other-account cookies never use cookie server preference',async()=>{
  for(const mode of ['missing','tampered','duplicate','cross-account']) {
    const f=setup(),r=await f.service.update(f.id,{action:'accept',partner_code:f.a.code});let h=header(r);
    if(mode==='missing')h=undefined;
    if(mode==='tampered')h='roomkind_attribution='+randomBytes(32).toString('base64url');
    if(mode==='duplicate')h+='; '+h;
    if(mode==='cross-account') {
      const other=f.account();f.preferences.set(other,{...f.preferences.get(f.id),account_id:other});f.consents.set(other,{opted_in:true});
      const p=await f.payments.create(other,payment(mode),{cookieHeader:h});assert.equal(f.intents.get(p.payment_id).partner_id,null);continue;
    }
    const p=await f.payments.create(f.id,payment(mode),{cookieHeader:h});assert.equal(f.intents.get(p.payment_id).partner_id,null);assert.equal(f.preferences.size,0);
    const manual=await f.payments.create(f.id,payment(mode+'manual',f.b.code));assert.equal(f.intents.get(manual.payment_id).partner_id,f.b.id);
  }
});

test('ATTR-01 consent guard: stored preference plus genuine token but no server opt-in is rejected',async()=>{
  const f=setup(),r=await f.service.update(f.id,{action:'accept',partner_code:f.a.code});f.consents.delete(f.id);
  const row=f.preferences.get(f.id);
  assert.equal(validCookiePreference(row,null,f.id,header(r),secret,new Date('2026-10-02')),false,'ATTR-01 absent consent must reject genuine cookie');
  const p=await f.payments.create(f.id,payment('without-consent'),{cookieHeader:header(r)});
  assert.equal(f.intents.get(p.payment_id).partner_id,null);
});

test('ATTR-02 manual override before each new intent, old snapshot/idempotency stays immutable',async()=>{
  const f=setup(),r=await f.service.update(f.id,{action:'accept',partner_code:f.a.code});
  await f.service.update(f.id,{action:'manual',partner_code:f.b.code},header(r));
  const first=await f.payments.create(f.id,payment('one'));assert.equal(f.intents.get(first.payment_id).partner_id,f.b.id);
  await f.service.update(f.id,{action:'manual',partner_code:f.a.code});
  assert.deepEqual(await f.payments.create(f.id,payment('one')),first);
  assert.equal(f.intents.get(first.payment_id).partner_id,f.b.id);
  const second=await f.payments.create(f.id,payment('two'));assert.equal(f.intents.get(second.payment_id).partner_id,f.a.id);
  await assert.rejects(f.payments.create(f.id,payment('one',f.a.code)),e=>e.status===409);
  const third=await f.payments.create(f.id,payment('three',f.b.code));assert.equal(f.intents.get(third.payment_id).partner_id,f.b.id);
  assert.equal((await f.service.state(f.id)).state.partner_code,f.b.code);
});

test('ATTR-02 invalid/self/inactive/ownerless codes have no preference or consent effects',async()=>{
  const f=setup();await f.service.update(f.id,{action:'manual',partner_code:f.a.code});
  const inactive=f.partner(f.account());inactive.active=false;const ownerless=f.partner(null);
  await assert.rejects(activePartner(f.client,f.id,ownerless.code),e=>e.status===422,'PARTNER-01 ownerless code must reject');
  for(const code of ['unknowncode',f.self.code,inactive.code,ownerless.code]) {
    await assert.rejects(f.service.update(f.id,{action:'accept',partner_code:code}),e=>e.status===422);
    await assert.rejects(f.payments.create(f.id,payment('bad-'+code,code)),e=>e.status===422);
    assert.equal(f.preferences.get(f.id).partner_id,f.a.id);assert.equal(f.consents.size,0);
  }
});

test('ATTR-01 expiry checked during payment use; clear and malformed tokens do not retain attribution',async()=>{
  const f=setup(),r=await f.service.update(f.id,{action:'accept',partner_code:f.a.code});f.advance(TRACKING_TTL*1000+1);let clear;
  const p=await f.payments.create(f.id,payment('expired'),{cookieHeader:header(r),clearCookie:c=>{clear=c;}});
  assert.equal(f.intents.get(p.payment_id).partner_id,null);assert.match(clear,/Max-Age=0/);
  await f.service.update(f.id,{action:'manual',partner_code:f.b.code});await f.service.update(f.id,{action:'clear'});
  assert.equal((await f.service.state(f.id)).state.source,null);
  for(const h of ['roomkind_attribution=bad','roomkind_attribution='+('a'.repeat(43))+'; roomkind_attribution='+('b'.repeat(43))])assert.equal(trackingToken(h),null);
  assert.doesNotMatch(trackingCookie('',false,true),/Secure|roomkind_session/);
  assert.notEqual(trackingHash('a'.repeat(43),secret,f.id),trackingHash('a'.repeat(43),secret,f.a.account_id));
});
