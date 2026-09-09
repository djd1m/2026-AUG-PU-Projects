import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source=await readFile(new URL('../variants/c-partner/app/app.mjs',import.meta.url),'utf8');
test('C failed optional lab load stays inactive and can retry without breaking partner history',async()=>{
  const handler=source.slice(source.indexOf('function bindHistory()'),source.indexOf('\nfunction bindShare()'));
  let click,fail=true,renders=0;
  const document={querySelector:selector=>selector==='#open-operator-lab'?{addEventListener:(type,fn)=>click=fn}:null};
  const state=Function('document','run','refreshLab','render',`let labActive=false;${handler};bindHistory();return ()=>labActive`)(
    document,(button,operation)=>operation(),async()=>{if(fail)throw new Error('offline')},()=>renders++);
  await assert.rejects(click({currentTarget:{}}),/offline/);assert.equal(state(),false);assert.equal(renders,0);
  fail=false;await click({currentTarget:{}});assert.equal(state(),true);assert.equal(renders,1);
});

test('C initial partner session does not request merchant lab authority',async()=>{
  const handler=source.slice(source.indexOf('async function start()'),source.lastIndexOf('\nstart();'));
  const calls=[];
  const start=Function('connect','refreshPartner','refreshLab','render','fatalState',`let api,view,program={enrollment:null};${handler};return start`)(
    async(...args)=>{calls.push(args);return{}},async()=>calls.push('partner.read'),async()=>{throw new Error('no merchant')},
    ()=>calls.push('render'),e=>calls.push(e.message));
  await start();assert.deepEqual(calls,[['C','partner'],'partner.read','render']);
});
