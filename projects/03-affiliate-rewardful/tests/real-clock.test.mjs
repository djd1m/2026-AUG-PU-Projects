import test from 'node:test';
import assert from 'node:assert/strict';
import { realState,advanceRealClock } from '../shared/identity/state.mjs';
import { fixtureEvent } from '../shared/domain/events.mjs';
import { id } from '../shared/domain/common.mjs';
import { cashSummary } from '../shared/domain/projections.mjs';

test('real payout due date stays with oldest unpaid earning month across clock changes',()=>{
  const state=realState(id(),'Org',Date.parse('2026-09-09T12:00:00Z'));
  assert.equal(cashSummary(state).dueDate,null);
  state.payments.push({id:'old',kind:'cash',beneficiaryId:'p',rewardMinor:200,effectiveAt:'2026-08-20T00:00:00.000Z',availableAt:'2026-08-27T00:00:00.000Z'},
    {id:'new',kind:'cash',beneficiaryId:'p',rewardMinor:300,effectiveAt:'2026-09-01T00:00:00.000Z',availableAt:'2026-09-08T00:00:00.000Z'});
  state.ledger.push({paymentId:'old',kind:'cash',amountMinor:200},{paymentId:'new',kind:'cash',amountMinor:300});
  assert.equal(cashSummary(state,'p').dueDate,'2026-09-05');
  advanceRealClock(state,Date.parse('2026-10-09T00:00:00Z'));
  assert.equal(cashSummary(state,'p').dueDate,'2026-09-05');
  state.allocations.push({obligationId:'old',transferId:'sent'});
  assert.equal(cashSummary(state,'p').dueDate,'2026-10-05');
  state.ledger.push({paymentId:'new',kind:'cash',amountMinor:-300});
  assert.equal(cashSummary(state,'p').dueDate,null);
});

test('real refunds remain possible after fixture event quota; maturity invalidates old source once',()=>{
  const now=Date.parse('2026-09-09T12:00:00Z'),state=realState(id(),'Org',now),partner={id:id(),role:'partner',name:'P'};
  state.actors.push(partner);
  const event={type:'payment',provider:'yookassa',accountId:'123456',objectId:id(),verified:true,status:'confirmed',customerId:'buyer',beneficiaryId:partner.id,kind:'cash',amountMinor:100000,paidAt:state.clock,cookie:{beneficiaryId:partner.id,attributedAt:state.clock}};
  fixtureEvent(state,event);
  const payment=state.payments[0];
  // Only the history count is relevant to this admission guard; no synthetic money is persisted.
  for(let i=1;i<2000;i++) state.payments.push({id:id(),businessKey:`other/${i}`,availableAt:'2027-01-01T00:00:00Z'});
  fixtureEvent(state,{type:'refund',provider:'yookassa',accountId:'123456',objectId:id(),paymentId:event.objectId,verified:true,status:'confirmed',amountMinor:50000,refundedAt:state.clock});
  assert.equal(state.ledger.filter(x=>x.paymentId===payment.id).reduce((sum,x)=>sum+x.amountMinor,0),10000);
  const version=state.sourceVersion;advanceRealClock(state,now+8*86400000);assert.equal(state.sourceVersion,version+1);
  advanceRealClock(state,now+8*86400000+1);assert.equal(state.sourceVersion,version+1);
});
