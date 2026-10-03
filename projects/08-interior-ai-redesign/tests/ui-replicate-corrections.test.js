import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';
import {join} from 'node:path';
import {sha,canonical} from '../web/generation.js';

const source=await readFile(new URL('../scripts/ui/replicate-cases.js',import.meta.url),'utf8');
const deferred=()=>{let resolve;const promise=new Promise(r=>{resolve=r;});return {promise,resolve};};
const tick=()=>new Promise(resolve=>setImmediate(resolve));

// Execute the actual scoped functions with controlled boundaries; no PG/browser/network.
function completion(code=source) {
  const start=code.indexOf('async function privateCompletion('),end=code.indexOf('export async function hostedCases');
  assert.ok(start>=0&&end>start);
  const bytes={outputs:Buffer.from('output'),depths:Buffer.from('depth'),configs:Buffer.from('config')};
  const fn=runInNewContext(code.slice(start,end)+'\nprivateCompletion',{
    assert,sha,canonical,join,readFile:async path=>bytes[path.split('/').at(-2)]
  });
  // Deliberately noncanonical insertion order, including nested keys (JSONB equivalent).
  const evidence={quality:'unverified',output_sha:sha(bytes.outputs),hardware:null,
    depth_sha:sha(bytes.depths),warm:null,config_sha:sha(bytes.configs),inference_ms:null,
    billing_actual_microusd:null,metadata:{z:1,a:2}};
  assert.notEqual(sha(JSON.stringify(evidence)),sha(canonical(evidence)));
  const stored=sha(canonical(evidence));
  const run=async digest=>fn({query:async sql=>({rows:sql.includes('generation_evidence')?
    [{canonical_evidence:evidence,...(sql.includes(',evidence_sha')?{evidence_sha:digest}:{})}]:
    [{status:'succeeded',mode:'replicate',quality:'unverified',output_key:'key'}]})},
  {storageDir:'/synthetic'},'job');
  return {run,stored};
}

test('private receipt reports canonical stored digest despite JSONB key order; corrupt digest rejects',async()=>{
  const h=completion();assert.equal((await h.run(h.stored)).evidence_sha,h.stored);
  await assert.rejects(h.run('0'.repeat(64)),{code:'ERR_ASSERTION'});
});

test('digest oracle detects the previous JSON.stringify receipt implementation',async()=>{
  const mutant=source.replace('assert.equal(sha(canonical(e)),rows[0].evidence_sha);','')
    .replace('evidence_sha:rows[0].evidence_sha','evidence_sha:sha(JSON.stringify(e))');
  assert.notEqual(mutant,source);const h=completion(mutant);
  await assert.rejects(async()=>assert.equal((await h.run(h.stored)).evidence_sha,h.stored),{code:'ERR_ASSERTION'});
});

async function deletion(code=source,{status=200,jobStatus=404}={}) {
  const marker='await check(`${width}: hosted deletion during held remote response fences completion/cleanup`,async()=>{';
  const start=code.indexOf(marker)+marker.length,end=code.indexOf('\n    });',start);
  assert.ok(start>=marker.length&&end>start);
  const response=deferred(),handler=deferred(),done=deferred();
  const events=[];let predicate,clicked=false,committed=false,finished=false,confirmed=false;
  const page={waitForResponse:filter=>{predicate=filter;events.push('observe');return response.promise;},
    locator:selector=>({click:async()=>{clicked=true;events.push('click');},
      waitFor:async()=>{assert.equal(selector,'#result');events.push('hidden');}})};
  const matches=(path,method)=>predicate({url:()=>`https://n8-ui.test${path}`,request:()=>({method:()=>method})});
  const gate={entered:Promise.resolve(),release:()=>{
    events.push({release:true,committed,finished,confirmed});done.resolve({completed:false});
  }};
  const active={done:done.promise,claim:{fence:1},counts:()=>({post:1,delivery:0}),cancel:()=>events.push('cancel')};
  const request=async()=>{confirmed=true;events.push('404');return {status:jobStatus};};
  const fn=runInNewContext('async function scoped(){let active;'+code.slice(start,end)+'}\nscoped',{
    assert,URL,page,evidence:[],upload:async()=>{},config:{storageDir:'/synthetic'},reserve:async()=>'deleted',
    responseGate:()=>gate,readdir:async()=>[],join,fixture:{start:async()=>active},request,
    clickAndWaitForHandler:async(p,selector)=>{await p.locator(selector).click();await handler.promise;finished=true;events.push('handler');},
    pool:{query:async sql=>({rows:[{n:sql.includes('generation_evidence')?0:1}]})},
    createJobs:()=>({fail:async()=>false}),cleanupDeleted:async()=>{}
  });
  const pending=fn();const outcome=pending.then(()=>({}),error=>({error}));
  await tick();assert.equal(clicked,true);
  // First DOM hide is immediate, but neither DELETE nor its handler has completed.
  assert.deepEqual(events,['observe','click']);
  assert.equal(matches('/api/jobs/deleted','DELETE'),true);
  assert.equal(matches('/api/jobs/other','DELETE'),false);
  assert.equal(matches('/api/jobs/deleted/result','DELETE'),false);
  assert.equal(matches('/api/jobs/deleted','GET'),false);
  committed=status===200;response.resolve({status:()=>status});await tick();
  try {assert.equal(events.some(e=>e.release),false,'gate must await handler completion');}
  finally {handler.resolve();}
  const result=await outcome;
  return {events,result};
}

test('held response is released only after matching 200, handler completion and owner 404',async()=>{
  const {events,result}=await deletion();assert.equal(result.error,undefined);
  assert.deepEqual(events.find(e=>e.release),{release:true,committed:true,finished:true,confirmed:true});
  assert.ok(events.indexOf('handler')<events.indexOf('404'));
  assert.equal(events.at(-1),'cancel');
});

test('failed DELETE or accessible job fails the case while finally releases/cancels/joins',async()=>{
  for(const options of [{status:500},{jobStatus:200}]) {
    const {events,result}=await deletion(source,options);assert.equal(result.error?.code,'ERR_ASSERTION');
    assert.equal(events.filter(e=>e.release).length,1);assert.ok(events.includes('cancel'));
  }
});

test('ordering oracle detects premature release before handler completion',async()=>{
  const mutant=source.replace("Promise.all([deletion,clickAndWaitForHandler(page,'#delete-job')])",
    "Promise.all([deletion,(clickAndWaitForHandler(page,'#delete-job'),undefined)])");
  assert.notEqual(mutant,source);
  await assert.rejects(deletion(mutant),/gate must await handler completion/);
});
