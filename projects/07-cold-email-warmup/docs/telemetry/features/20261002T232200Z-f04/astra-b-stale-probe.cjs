// Read-only control-flow probe of the actual worker.poll method; no PG/network/runtime.
const fs=require('node:fs'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const path=require('node:path');const project=path.resolve(__dirname,'../../../..');
const source=fs.readFileSync(path.join(project,'src/replies/worker.ts'),'utf8');
let method=source.slice(source.indexOf(' async poll('),source.indexOf(' async tick(')).trim();
for(const [a,b] of [['tenant:string,mailbox:string','tenant,mailbox'],['let run:Rescan|null=null','let run=null'],['const operation=<T>(call:()=>Promise<T>)','const operation=(call)'],['const current=run;','const current=run;'],['))!;', '));']]) method=method.replace(a,b);
const calls=[];
const poll=new Function('boundedOperation','eligibilityTransaction','identity',`return ({${method}}).poll`)(call=>call(),async(pool,fn)=>fn(pool),r=>({runId:r.runId,attempt:r.attempt,uidvalidity:r.uidvalidity,expectedCursor:r.cursor}));
function deferred(){let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b});return {promise,resolve,reject};}
(async()=>{
 // An old source operation fails only after another worker completed a newer epoch.
 const failure=deferred();const latest={runId:'new-run',uidvalidity:'2',state:'complete',scanComplete:true};
 const pool={async query(sql,args){calls.push({sql,args,currentEpoch:latest.uidvalidity,currentState:latest.state});latest.scanComplete=false;return {rows:[]};}};
 const first=poll.call({mode:'local_test',pool,store:{},adapter:{snapshot:()=>failure.promise}},'tenant','mailbox');
 failure.reject(new Error('old operation failed'));const firstResult=await first;
 assert.equal(firstResult.state,'paused');assert.equal(latest.scanComplete,false);assert.equal(calls.length,1);
 assert.ok(!calls[0].sql.includes('run_id') && !calls[0].sql.includes('uidvalidity'));
 // A successful delayed snapshot is likewise forwarded to capture despite the newer epoch.
 const old=deferred();let capture;
 const second=poll.call({mode:'local_test',pool:{async query(){return {rows:[]};}},store:{async capture(t,m,s){capture={suppliedValidity:s.uidvalidity,newerDurableValidity:'2'};throw new Error('probe stops before mutation');}},adapter:{snapshot:()=>old.promise}},'tenant','mailbox');
 old.resolve({uidvalidity:'1',uidNext:1,observedAt:new Date(),provenance:'local_fixture'});await second;
 assert.deepEqual(capture,{suppliedValidity:'1',newerDurableValidity:'2'});
 const result={scope:'actual worker.poll control flow with deferred adapter and recording store/SQL doubles; not a PG test',command:'node docs/telemetry/features/20261002T232200Z-f04/astra-b-stale-probe.cjs',exit_code:0,worker_sha256:crypto.createHash('sha256').update(source).digest('hex'),late_failure:{result:firstResult,latest_after:latest,queries:calls},late_snapshot:capture,store_source_confirmation:'ReplyStore.capture lines 47-53 accepts differing validity and unconditionally upserts a new run; inspected, not executed by this probe'};
 fs.writeFileSync(path.join(__dirname,'astra-b-stale-probe.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result,null,2));
})().catch(e=>{console.error(e.message);process.exitCode=1;});
