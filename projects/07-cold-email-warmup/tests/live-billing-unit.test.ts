import assert from 'node:assert/strict';
import { test } from 'node:test';
import { matchesLivePayment,matchesLiveRefund,validateLivePrice } from '../src/billing/live.js';
import type { LiveBinding,VerifiedPayment } from '../src/billing/provider.js';
const b:LiveBinding={provider:'double',merchant:'shop',mode:'live',tenant:'tenant',intent:'intent',plan:'team',amountMinor:25000,currency:'RUB',durationDays:30};
test('live binding rejects independently mismatched identity and TEST context',()=>{
 const p:VerifiedPayment={...b,id:'payment',status:'succeeded',paid:true,paidAt:new Date().toISOString()};
 assert.equal(matchesLivePayment(b,p,'payment'),true);
 for(const [k,v] of Object.entries({...b,id:'payment'})) assert.equal(matchesLivePayment(b,{...p,[k]:typeof v==='number'?v+1:v+'wrong'} as VerifiedPayment,'payment'),false,k);
 assert.equal(matchesLivePayment(b,{...p,mode:'local_test'} as unknown as VerifiedPayment),false);
});
test('configured price and canonical refund binding are closed',()=>{
 validateLivePrice(b);for(const amountMinor of [0,-1,1.5,NaN,2147483648]) assert.throws(()=>validateLivePrice({...b,amountMinor}));
 const r={id:'r',paymentId:'payment',provider:'double',merchant:'shop',mode:'live' as const,status:'succeeded' as const,amountMinor:1,currency:'RUB'};
 assert.equal(matchesLiveRefund(b,'payment',r),true);
 for(const patch of [{paymentId:'wrong'},{merchant:'wrong'},{provider:'wrong'},{currency:'USD'},{amountMinor:25001},{amountMinor:0},{mode:'local_test'}]) assert.equal(matchesLiveRefund(b,'payment',{...r,...patch} as typeof r),false);
});
