import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { acceptsTask, logicalTask, exact } from '../variants/d-agent/app/state.mjs';
import { seed } from '../shared/infrastructure/seed.mjs';
import { prepare, approve } from '../shared/domain/registry.mjs';
import { fixtureEvent } from '../shared/domain/events.mjs';
import { dashboard } from '../shared/domain/projections.mjs';

test('D response must match both selected task ID and request generation',()=>{
  assert.equal(acceptsTask('T2',2,{taskId:'T1'},2),false);
  assert.equal(acceptsTask('T2',2,{taskId:'T2'},1),false);
  assert.equal(acceptsTask('T2',2,{taskId:'T2'},2),true);
  assert.deepEqual(logicalTask('merchant','artifact','key'),{key:'key',input:{kind:'registry',input:{period:'2026-08',artifactId:'artifact'}}});
  assert.deepEqual(logicalTask('customer',null,'key').input,{kind:'credit',input:{}});
});

test('D refund explanation uses exact server source and artifact payment scope after reload',async()=>{
  let source=await readFile(new URL('../variants/d-agent/app/views.mjs',import.meta.url),'utf8');
  source=source.replace("from '/shared/ui/ui.mjs'",`from '${new URL('../shared/ui/ui.mjs',import.meta.url).href}'`)
    .replace("'./state.mjs'",`'${new URL('../variants/d-agent/app/state.mjs',import.meta.url).href}'`);
  const {artifactView}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
  const state=seed('d-render'),owner=state.actors.find(a=>a.role==='merchant');
  const first=prepare(state,{period:'2026-08'},owner.id);approve(state,exact(first),owner.id);
  fixtureEvent(state,state.fixtureEvents.refund);
  let html=artifactView(first,{},'/unused',dashboard(state,owner));
  assert.match(html,/Источник изменился/);assert.doesNotMatch(html,/data-amount-minor="-5000"/);
  const next=prepare(state,{period:'2026-08',artifactId:first.artifactId},owner.id);assert.equal(next.amountMinor,55000);
  const current=approve(state,exact(next),owner.id),view=dashboard(state,owner);
  const correction=view.ledger.find(e=>e.amountMinor===-5000);
  view.ledger.push({...correction,id:'foreign-correction',paymentId:'unrelated-payment'});
  html=artifactView(current,{},'/unused',view); // Empty UI state models reload or refund performed elsewhere.
  for(const id of [correction.id,correction.paymentId,correction.originalEntryId])assert.ok(html.includes(id));
  assert.match(html,/data-amount-minor="-5000"/);assert.doesNotMatch(html,/foreign-correction|unrelated-payment/);
  assert.doesNotMatch(html,/прежнее утверждение недействительно/);assert.equal(state.transfers.length,0);
});
