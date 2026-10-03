import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { test } from 'node:test';
import { cookieCode,referralToken } from '../src/growth/attribution.js';
import { parseCheckout } from '../src/billing/service.js';
import { PLANS,TEST_TEAM } from '../src/billing/plans.js';
test('F05 immutable server plans and closed checkout input',()=>{
 assert.deepEqual(PLANS,{free:{mailboxes:3,activeCampaigns:3},team:{mailboxes:10,activeCampaigns:10}});
 assert.deepEqual(TEST_TEAM,{plan:'team',amountMinor:100,currency:'RUB',durationDays:30,label:'TEST'});
 assert.equal(parseCheckout({plan:'team',idempotencyKey:'abcdefgh'}).key,'abcdefgh');
 for(const raw of [{plan:'free',idempotencyKey:'abcdefgh'},{plan:'team',idempotencyKey:'short'},...['amount','currency','duration','paid','status'].map(k=>({plan:'team',idempotencyKey:'abcdefgh',[k]:100}))]) assert.throws(()=>parseCheckout(raw));
});
test('F05 bounded purpose HMAC cookie exact30day expiration and tamper',()=>{
 const key=randomBytes(32),code='0123456789abcdef',token=referralToken(code,key,1000),cookie='n7_referral='+token;
 assert.deepEqual(cookieCode(cookie,key,1000),{code,reason:'cookie_valid'});
 assert.equal(cookieCode(cookie,key,1000+30*86400000-1).code,code);
 assert.equal(cookieCode(cookie,key,1000+30*86400000).reason,'cookie_expired');
 assert.equal(cookieCode(cookie,randomBytes(32),1000).reason,'cookie_invalid');
 assert.equal(cookieCode('n7_referral='+token.slice(0,-1)+'!',key).reason,'cookie_invalid');
 assert.equal(cookieCode(cookie+'; '+cookie,key).reason,'cookie_invalid');
 assert.equal(cookieCode('n7_referral='+'x'.repeat(1000),key).reason,'cookie_invalid');
 assert.equal(cookieCode(undefined,key).reason,'cookie_absent');
});
