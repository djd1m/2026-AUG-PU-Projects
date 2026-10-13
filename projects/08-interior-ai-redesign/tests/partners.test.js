import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createPartners } from '../web/partners.js';
import { partnerCommand } from '../scripts/partner.js';
test('PARTNER-01 operator creates opaque active codes with specified existing owner; duplicate409 and missing owner404',async()=>{
  const owner=randomUUID();let values;
  const service=createPartners({async query(sql,v){values=v;return {rows:[{id:v[0],code:v[2],active:true}],rowCount:1};}});
  const p=await partnerCommand(service,['create',owner]);assert.match(p.code,/^[A-Za-z0-9_-]{32}$/);assert.equal(values[1],owner);assert.equal(p.active,true);assert.equal(p.account_id,undefined);
  await assert.rejects(partnerCommand(service,['owner',p.id,randomUUID()]));
  await assert.rejects(partnerCommand(service,['create',owner,'chosen_code']));
  for(const [code,status] of [['23505',409],['23503',404]])await assert.rejects(createPartners({query:async()=>{throw Object.assign(new Error('db'),{code});}}).create(owner,'duplicate_code'),e=>e.status===status);
  await assert.rejects(service.create('invalid'),e=>e.status===400);
});
test('PARTNER-01 activation input validated and operator aggregate shape exposes no private metadata',async()=>{
  const id=randomUUID(),service=createPartners({async query(sql){return sql.startsWith('SELECT count')?{rows:[{first_conversions:2,amount_minor:'180000',currency:'RUB'}],rowCount:1}:{rows:[{id}],rowCount:1};}});
  assert.deepEqual(await partnerCommand(service,['aggregate',id]),{first_conversions:2,amount_minor:'180000',currency:'RUB'});
  assert.deepEqual(await partnerCommand(service,['activate',id,'false']),{ok:true});
  await assert.rejects(service.activate(id,'false'),e=>e.status===400);
});
