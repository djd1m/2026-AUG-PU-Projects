import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { seed } from '../shared/infrastructure/seed.mjs';
import { prepare,approve,sent } from '../shared/domain/registry.mjs';
import { dashboard } from '../shared/domain/projections.mjs';
import { addDays,sourceChanged } from '../shared/domain/common.mjs';

// Resolve the deployment's /shared import to the same checked-out module for Node's renderer test.
const path=new URL('../variants/a-merchant/app/views.mjs',import.meta.url);
const source=await readFile(path,'utf8');
assert.equal(source.split("from '/shared/ui/ui.mjs'").length,2);
const {registryView}=await import('data:text/javascript;base64,'+Buffer.from(source.replace("from '/shared/ui/ui.mjs'",
  `from '${new URL('../shared/ui/ui.mjs',import.meta.url).href}'`)).toString('base64'));
const exact=r=>({artifactId:r.artifactId,revision:r.revision,hash:r.hash});

test('SC-US-103-2 historical transfer never hides newly eligible obligations in later registry revision',()=>{
  const state=seed('render-test'),owner=state.actors.find(a=>a.role==='merchant'),anna=state.actors.find(a=>a.name==='Анна');
  const first=prepare(state,{period:'2026-08'},owner.id);approve(state,exact(first),owner.id);
  sent(state,{...exact(first),partnerId:anna.id,evidence:'fixture transfer',sentAt:state.clock},owner.id);
  state.clock=addDays(state.clock,7);sourceChanged(state);
  const next=prepare(state,{period:'2026-08',artifactId:first.artifactId},owner.id);
  const current=approve(state,exact(next),owner.id);
  assert.equal(current.status,'approved','current revision excludes historical transfers');
  assert.equal(current.revision,2);assert.equal(current.rows.find(r=>r.partnerId===anna.id).amountMinor,10000);
  assert.equal(state.transfers[0].revision,1);
  const html=registryView(current,dashboard(state,owner));
  assert.ok(html.includes(`<option value="${anna.id}">`),'new Anna obligation must remain selectable for manual send');
  const table=html.match(/<table[\s\S]*?<\/table>/)[0];
  assert.doesNotMatch(table,/state-(?:sent|partially_sent)/,'historical transfer must not mark current row sent');
});
