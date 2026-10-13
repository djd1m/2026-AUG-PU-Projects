from pathlib import Path
import json,hashlib,importlib.util,fcntl
R=Path('/tmp/n7-f10-cancel-diagnostic-a34');S=R/'compact-shadow-a34';N='/tmp/n7-expanded-runtime-20261006/bin/node';sha=lambda f:hashlib.sha256(Path(f).read_bytes()).hexdigest();spec=importlib.util.spec_from_file_location('nr',R/'native-run-a34.py');nr=importlib.util.module_from_spec(spec);spec.loader.exec_module(nr);write=lambda n,x:(R/n).write_text(json.dumps(x,indent=2)+'\n');assert (R/'fence-terminal-a34.json').exists();assert not nr.nodes()
probe="""import assert from 'node:assert/strict';
import {test} from 'node:test';
import {RuntimeStore} from '../src/runtime/store.js';
import {runRuntime} from '../src/runtime/loop.js';
import {runtimeFixture} from './f10-runtime-fixture.js';
const mark=(phase:string,counts?:unknown)=>console.log('A34_AWAIT '+JSON.stringify({phase,pid:process.pid,utc:new Date().toISOString(),counts}));
const count=async(pool:any)=>Number((await pool.query('SELECT count(*) FROM transport_operation WHERE operation IS NOT NULL')).rows[0].count);
test('A34 direct cancellation releases its never-started reservation',async()=>{
 const {pool}=await runtimeFixture(5);const store=new RuntimeStore(pool,async()=>{});let claim:any;
 try{await store.maintenance();mark('claim_begin');claim=await store.claim('poll');mark('claim_end',await count(pool));assert.ok(claim);mark('cancel_begin');await store.cancel(claim);mark('cancel_end',await count(pool));assert.equal(await count(pool),0,'direct cancel must release never-started physical reservation');}
 finally{mark('exact_unused_cleanup_begin');if(claim)await store.disposeUnusedAdmission(claim);mark('exact_unused_cleanup_end',await count(pool));mark('pool_end_begin');await pool.end();mark('pool_end_end');}
});
test('A34 abort after committed native claim releases slots before any operation',async()=>{
 const {pool}=await runtimeFixture(5);const store=new RuntimeStore(pool,async()=>{}),abort=new AbortController(),seen:any[]=[];let operations=0;const original=store.claim.bind(store);
 store.claim=async kind=>{mark('abort_claim_begin');const claim=await original(kind);if(claim){seen.push(claim);abort.abort();}mark('abort_claim_end',{claimed:Boolean(claim),reserved:Boolean(claim&&store.pollAdmission(claim)?.slot)});return claim;};const operation=async()=>{operations++;return {};};
 try{mark('runtime_begin');await runRuntime(store,{poll:operation,pool:operation,dispatch:operation},abort.signal,true);mark('runtime_joined',{operations,claimed:seen.length,slots:await count(pool)});assert.equal(operations,0,'abort invokes zero operation callbacks');assert.equal(await count(pool),0,'aborted committed native claims release never-started physical reservations');}
 finally{mark('abort_exact_unused_cleanup_begin');for(const claim of seen)await store.disposeUnusedAdmission(claim);mark('abort_exact_unused_cleanup_end',await count(pool));mark('abort_pool_end_begin');await pool.end();mark('abort_pool_end_end');}
});
"""
(S/'tests/a34-cancel-seam.test.ts').write_text(probe);(S/'tests/a34-cancel-seam-compiled.test.ts').write_text(probe.replace('../src/','../dist/'))
cases=[{'name':'cancel-disposal-omitted','changes':[{'path':'src/runtime/store.ts','old':"async cancel(claim:RuntimeClaim,reason:RuntimeReason='ready'){\n  await this.disposeUnusedAdmission(claim);",'new':"async cancel(claim:RuntimeClaim,reason:RuntimeReason='ready'){\n  // omitted disposal"},{'path':'dist/runtime/store.js','old':"async cancel(claim, reason = 'ready') {\n        await this.disposeUnusedAdmission(claim);",'new':"async cancel(claim, reason = 'ready') {\n        // omitted disposal"}]},{'name':'abort-cancel-cloned-identity','changes':[{'path':'src/runtime/loop.ts','old':'if(signal.aborted){await store.cancel(claim);return;}','new':'if(signal.aborted){await store.cancel({...claim});return;}'},{'path':'dist/runtime/loop.js','old':'await store.cancel(claim);','new':'await store.cancel({ ...claim });'}]}]
for c in cases:
 for x in c['changes']:assert (S/x['path']).read_text().count(x['old'])==1,(c['name'],x['path'])
write('cancel-probe-command-manifest-a34.json',{'utc':nr.now(),'runner_sha256':sha(__file__),'guard_sha256':sha(R/'guard-a34.mjs'),'preload_sha256':sha(R/'suite-output-a34.mjs'),'native_runner_sha256':sha(R/'native-run-a34.py'),'test_sha256':{f:sha(S/f) for f in ['tests/a34-cancel-seam.test.ts','tests/a34-cancel-seam-compiled.test.ts']},'cases':cases,'budget_seconds':12,'origin':'existing real PG runtimeFixture and Store/runRuntime abort-after-COMMIT seam; bounded operational numeric await/slot observer, no durable product/test edit','cleanup':'exact original Store admission proof release in finally; no TTL or unknown-child reclaim'})
lock=open('/tmp/codex-heavy-build.lock','rb');fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB);results=[]
try:
 for c in cases:
  for mode,test in [('source','tests/a34-cancel-seam.test.ts'),('compiled','tests/a34-cancel-seam-compiled.test.ts')]:
   name=c['name']+'-'+mode;cmd=[N,'node_modules/tsx/dist/cli.mjs','--test','--test-concurrency=1',test];e={'name':name,'baseline':nr.run(name+'-baseline',cmd,S,12)};assert e['baseline']['native_exit']==0;original={x['path']:(S/x['path']).read_bytes() for x in c['changes']};e['original_sha256']={f:hashlib.sha256(b).hexdigest() for f,b in original.items()}
   try:
    for x in c['changes']:
     f=S/x['path'];t=f.read_text();assert t.count(x['old'])==1;f.write_text(t.replace(x['old'],x['new']))
    e['mutated_sha256']={f:sha(S/f) for f in original};e['negative']=nr.run(name+'-negative',cmd,S,12)
   finally:
    for f,b in original.items():(S/f).write_bytes(b)
   e['restored']=nr.run(name+'-restored',cmd,S,12);q=e['negative'];e['status']='caught_material_assertion' if q['native_exit']!=0 and q['assertion_failure'] and q['failure_titles'] and e['restored']['native_exit']==0 else 'not_caught_material';results.append(e);write('cancel-probe-results-a34.json',results);print(name+' '+e['status'],flush=True)
finally:
 write('cancel-probe-terminal-a34.json',{'utc':nr.now(),'results':results,'source_drift':nr.candidate_check(),'nodes':nr.nodes(),'PG':nr.snapshot(),'DB':nr.status(),'mutex':'released after receipt'});fcntl.flock(lock,fcntl.LOCK_UN);lock.close()
