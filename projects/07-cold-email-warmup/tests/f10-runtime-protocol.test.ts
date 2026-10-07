import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fork,spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { acquireTransportSlot,bindTransportChild,closedOwnerProof,releaseTransportSlot,type TransportSlot } from '../src/mailboxes/transport-slots.js';
import { cadenceFixture,runtimeFixture } from './f10-runtime-fixture.js';
import { transportFixture,recoveryScenario } from './f09-transport-fixture.js';

import { createPool } from '../src/db.js';
import { loadConfig } from '../src/config.js';
const fairTables=['runtime_due','reply_rescan','mailbox_poll','transport_operation'] as const;
async function assertFairDatabase(pool:ReturnType<typeof createPool>){
 const name=(await pool.query('SELECT current_database() AS name')).rows[0].name;assert.equal(name,process.env.DATABASE_NAME);assert.ok(['n7f10_a2','n7f11_a8'].includes(String(name)),'only explicitly owned disposable namespaces permit fixture instrumentation');
}
async function cleanupFairInstrumentation(pool:ReturnType<typeof createPool>){
 await assertFairDatabase(pool);
 for(const table of fairTables)await pool.query(`DROP TRIGGER IF EXISTS n7_fair_record ON public.${table}`);
 await pool.query('DROP FUNCTION IF EXISTS public.n7_fair_record()');
 await pool.query('DROP TABLE IF EXISTS public.n7_fair_events');
}
async function installFairInstrumentation(pool:ReturnType<typeof createPool>){
 await assertFairDatabase(pool);
  await pool.query('DROP TABLE IF EXISTS n7_fair_events');await pool.query('CREATE TABLE n7_fair_events(event_id bigserial,at timestamptz DEFAULT clock_timestamp(),kind text,mailbox uuid,body jsonb)');
  await pool.query(`CREATE OR REPLACE FUNCTION n7_fair_record() RETURNS trigger LANGUAGE plpgsql AS $$ DECLARE occupancy jsonb; BEGIN
   SELECT jsonb_agg(jsonb_build_object('protocol',t.protocol,'slot',t.slot,'operation',t.operation,'mailbox',t.mailbox_id,'owner_process',t.owner_process,'runtime_owner',d.owner_id,'generation',d.generation) ORDER BY t.protocol,t.slot) INTO occupancy FROM transport_operation t LEFT JOIN runtime_due d ON d.mailbox_id=t.mailbox_id AND d.kind='poll';
   IF TG_TABLE_NAME='transport_operation' THEN
    INSERT INTO n7_fair_events(kind,mailbox,body) VALUES(CASE WHEN OLD.operation IS NULL AND NEW.operation IS NOT NULL THEN 'physical_acquire' WHEN OLD.operation IS NOT NULL AND NEW.operation IS NULL THEN 'physical_release' ELSE 'physical_update' END,COALESCE(NEW.mailbox_id,OLD.mailbox_id),jsonb_build_object('old',jsonb_build_object('protocol',OLD.protocol,'slot',OLD.slot,'operation',OLD.operation,'mailbox',OLD.mailbox_id,'owner_process',OLD.owner_process),'new',jsonb_build_object('protocol',NEW.protocol,'slot',NEW.slot,'operation',NEW.operation,'mailbox',NEW.mailbox_id,'owner_process',NEW.owner_process),'runtime', (SELECT jsonb_build_object('owner_id',owner_id,'generation',generation,'service_seq',service_seq,'state',state) FROM runtime_due WHERE mailbox_id=COALESCE(NEW.mailbox_id,OLD.mailbox_id) AND kind='poll'),'slots',occupancy,'transaction_id',txid_current(),'backend_pid',pg_backend_pid(),'phase','after_slot_update'));
    RETURN NEW;
   END IF;
   IF TG_TABLE_NAME='runtime_due' THEN IF NEW.kind='poll' THEN
    IF NEW.service_seq<>OLD.service_seq THEN INSERT INTO n7_fair_events(kind,mailbox,body) VALUES('turn',NEW.mailbox_id,to_jsonb(NEW)||jsonb_build_object('slots',occupancy,'transaction_id',txid_current(),'backend_pid',pg_backend_pid(),'observation','same_runtime_update_transaction_read_committed_not_admission_failure')); END IF;
    IF NEW.state='claimed' AND (OLD.state<>'claimed' OR OLD.owner_id IS DISTINCT FROM NEW.owner_id) THEN INSERT INTO n7_fair_events(kind,mailbox,body) VALUES('selection',NEW.mailbox_id,to_jsonb(NEW)||jsonb_build_object('slots',occupancy,'transaction_id',txid_current(),'backend_pid',pg_backend_pid(),'observation','same_runtime_update_transaction_read_committed_not_admission_failure')); END IF;
    IF OLD.state='claimed' AND NEW.state<>'claimed' THEN INSERT INTO n7_fair_events(kind,mailbox,body) VALUES('yield',NEW.mailbox_id,to_jsonb(NEW)||jsonb_build_object('slots',occupancy,'transaction_id',txid_current(),'backend_pid',pg_backend_pid(),'observation','same_runtime_update_transaction_read_committed_not_admission_failure')); END IF;
   END IF; ELSIF TG_TABLE_NAME='reply_rescan' THEN INSERT INTO n7_fair_events(kind,mailbox,body) VALUES('page',NEW.mailbox_id,to_jsonb(NEW));
   ELSIF TG_TABLE_NAME='mailbox_poll' THEN INSERT INTO n7_fair_events(kind,mailbox,body) VALUES('poll',NEW.mailbox_id,to_jsonb(NEW)); END IF; RETURN NEW; END $$`);
  for(const table of fairTables)await pool.query(`CREATE TRIGGER n7_fair_record AFTER UPDATE ON ${table} FOR EACH ROW EXECUTE FUNCTION n7_fair_record()`);
}
async function fairCatalog(pool:ReturnType<typeof createPool>){
 return (await pool.query("SELECT (SELECT count(*)::int FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname=ANY($1::text[]) AND t.tgname='n7_fair_record') AS triggers,to_regprocedure('public.n7_fair_record()') IS NOT NULL AS function,to_regclass('public.n7_fair_events') IS NOT NULL AS table",[fairTables])).rows[0];
}
test('owned fairness instrumentation removes forced stale triggers idempotently',{timeout:15000},async()=>{
 const pool=createPool(loadConfig().databaseUrl);const catalogs:unknown[]=[];
 try{
  await cleanupFairInstrumentation(pool);await installFairInstrumentation(pool);
  const before=await fairCatalog(pool);catalogs.push({phase:'forced_stale',...before});assert.deepEqual(before,{triggers:4,function:true,table:true});
  const client=await pool.connect();try{await client.query('BEGIN');await client.query('SELECT pg_advisory_xact_lock(7,1)');
   assert.equal((await client.query('SELECT count(*)::int AS occupied FROM transport_operation WHERE operation IS NOT NULL')).rows[0].occupied,0,'short synthetic observer proof requires empty physical slots');
   const tenant=randomUUID(),mailbox=randomUUID();await client.query('INSERT INTO tenant(id) VALUES($1)',[tenant]);await client.query("INSERT INTO mailbox(id,tenant_id,label,state) VALUES($1,$2,'synthetic observer proof','configured')",[mailbox,tenant]);
   await client.query("UPDATE transport_operation SET operation=$1,owner_process=$2,tenant_id=$3,mailbox_id=$4,owner_host='synthetic_fixture',expires_at=clock_timestamp()+interval '120 seconds' WHERE protocol='imap' AND slot=1",[randomUUID(),randomUUID(),tenant,mailbox]);
   await client.query("UPDATE transport_operation SET operation=NULL,owner_process=NULL,tenant_id=NULL,mailbox_id=NULL,owner_host=NULL,expires_at=NULL WHERE protocol='imap' AND slot=1");
   const transitions=(await client.query("SELECT kind,body FROM n7_fair_events WHERE kind IN ('physical_acquire','physical_release') ORDER BY event_id")).rows;
   assert.deepEqual(transitions.map(e=>e.kind),['physical_acquire','physical_release']);assert.equal(transitions[0].body.new.operation,transitions[1].body.old.operation);assert.equal(transitions[0].body.new.owner_process,transitions[1].body.old.owner_process);assert.equal(transitions[1].body.new.operation,null);assert.equal(transitions[0].body.slots.length,6);catalogs.push({phase:'synthetic_transition_proof_no_native_IO',transitions});
  }finally{await client.query('ROLLBACK');client.release();}
  await cleanupFairInstrumentation(pool);const after=await fairCatalog(pool);catalogs.push({phase:'cleanup',...after});assert.deepEqual(after,{triggers:0,function:false,table:false});
  await cleanupFairInstrumentation(pool);const repeated=await fairCatalog(pool);catalogs.push({phase:'repeat_cleanup',...repeated});assert.deepEqual(repeated,after);
  await installFairInstrumentation(pool);assert.deepEqual(await fairCatalog(pool),before);await cleanupFairInstrumentation(pool);
  await writeFile(`${process.env.F10_EVIDENCE_DIR}/stale-catalog-proof.json`,JSON.stringify({at:new Date().toISOString(),catalogs,reinstalled:true})+'\n');
 }finally{await cleanupFairInstrumentation(pool);await pool.end();}
});
test('suspended transport owners retain physical slots across runtime restart',{timeout:160000},async()=>{
 const c=await runtimeFixture(0),f=await transportFixture({stall:true}),owners:{slot:TransportSlot;child:ReturnType<typeof fork>;exit:Promise<void>}[]=[];
 const cli=async()=>{const child=spawn(process.execPath,['dist/runtime/worker.js'],{cwd:new URL('..',import.meta.url),env:{...process.env,POLL_MODE:'disabled',DISPATCH_MODE:'disabled'},stdio:['ignore','pipe','pipe']});let output='';child.stdout.on('data',b=>{output+=b.toString();});child.stderr.on('data',b=>{output+=b.toString();});const code=await new Promise<number|null>(r=>child.once('exit',r));assert.equal(code,0);assert.equal(output,'');};
 try{
  for(const protocol of ['smtp','smtp','imap','imap','imap','imap'] as const){
   const id=randomUUID();await c.pool.query("INSERT INTO mailbox(id,tenant_id,label,state) VALUES($1,$2,'physical fixture','configured')",[id,c.tenant]);
   const slot=await acquireTransportSlot(c.pool,protocol,c.tenant,id),child=fork(new URL('./f09-slot-owner-fixture.ts',import.meta.url),[],{execArgv:['--disable-warning=ExperimentalWarning'],stdio:['ignore','ignore','ignore','ipc'],serialization:'advanced'});bindTransportChild(slot,child);
   const exit=new Promise<void>(r=>child.once('exit',()=>r()));owners.push({slot,child,exit});const ready=new Promise<void>((r,j)=>{child.once('message',()=>r());child.once('error',j);});child.send({port:protocol==='smtp'?f.options!.smtp465:f.options!.imap993,ca:f.cert.cert,servername:protocol==='smtp'?'smtp.gmail.com':'imap.gmail.com'});await ready;
   await assert.rejects(acquireTransportSlot(c.pool,protocol,c.tenant,id));assert.throws(()=>closedOwnerProof(slot),/closure_unproved/);
  }
  assert.equal(f.sockets.size,6);await cli();const original=(await c.pool.query('SELECT operation,owner_process FROM transport_operation ORDER BY protocol,slot')).rows;
  const owner=owners[0]!;process.kill(owner.child.pid!,'SIGSTOP');const begun=Date.now();await new Promise(r=>setTimeout(r,120100));await cli();
  assert.deepEqual((await c.pool.query('SELECT operation,owner_process FROM transport_operation ORDER BY protocol,slot')).rows,original);
  assert.equal((await c.pool.query('SELECT count(*) FROM transport_operation WHERE operation IS NOT NULL AND expires_at<clock_timestamp()')).rows[0].count,'6');
  for(const protocol of ['smtp','imap'] as const)await assert.rejects(acquireTransportSlot(c.pool,protocol,c.tenant,randomUUID()),/transport_busy/);
  owner.child.kill('SIGTERM');assert.throws(()=>closedOwnerProof(owner.slot),/closure_unproved/);owner.child.kill('SIGKILL');await owner.exit;const proof=closedOwnerProof(owner.slot);
  await c.pool.query("CREATE FUNCTION n7_f10_release_fail() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'release_unavailable'; END $$");await c.pool.query('CREATE TRIGGER n7_f10_release_fail BEFORE UPDATE ON transport_operation FOR EACH ROW EXECUTE FUNCTION n7_f10_release_fail()');await assert.rejects(releaseTransportSlot(c.pool,proof));await assert.rejects(acquireTransportSlot(c.pool,'smtp',c.tenant,owner.slot.mailbox));
  await c.pool.query('DROP TRIGGER n7_f10_release_fail ON transport_operation');await c.pool.query('DROP FUNCTION n7_f10_release_fail()');assert.equal(await releaseTransportSlot(c.pool,proof),true);
  const replacement=await acquireTransportSlot(c.pool,'smtp',c.tenant,owner.slot.mailbox);assert.equal(await releaseTransportSlot(c.pool,closedOwnerProof(owner.slot)),false);await releaseTransportSlot(c.pool,closedOwnerProof(replacement));
  for(const x of owners.slice(1)){x.child.kill('SIGTERM');await x.exit;await releaseTransportSlot(c.pool,closedOwnerProof(x.slot));}
  await new Promise(r=>setTimeout(r,30));assert.equal(f.sockets.size,0);assert.equal((await c.pool.query('SELECT count(*) FROM transport_operation WHERE operation IS NOT NULL')).rows[0].count,'0');
  await writeFile('/tmp/n7-f10-native-verify-a5/sigstop-v1.json',JSON.stringify({started:begun,elapsedMs:Date.now()-begun,physicalSocketsMax:f.maxConnections,smtp:2,imap:4,perMailbox:1,restartCLI:2,dbFailureRetained:true,staleProofDenied:true})+'\n');
 }finally{for(const x of owners)if(x.child.exitCode===null&&x.child.signalCode===null){x.child.kill('SIGKILL');await x.exit;}await c.pool.query('DROP TRIGGER IF EXISTS n7_f10_release_fail ON transport_operation');await c.pool.query('DROP FUNCTION IF EXISTS n7_f10_release_fail()');await f.close();await c.pool.end();}
});
test('native ambiguous submission and UID recovery compose with runtime transport guards',recoveryScenario);

test('compiled healthy polling completes twice without a TypeScript loader',{timeout:110000},async()=>{
 let delayTurn=0;const c=await cadenceFixture(),f=await transportFixture({uidNext:1,headers:[],imapDelayMs:()=>[0,15,40][delayTurn++%3]!}),child=fork(new URL('./f10-runtime-process-fixture.ts',import.meta.url),[],{execArgv:[],stdio:['ignore','pipe','pipe','ipc'],serialization:'advanced'});
 const completed=new Map<string,number[]>(),begun=Date.now();let stderr='',startup:unknown,drained=false;child.on('message',m=>{if((m as {drained?:boolean}).drained)drained=true;});child.stderr?.on('data',b=>{stderr+=b.toString();});const exit=new Promise<{code:number|null;signal:NodeJS.Signals|null}>(r=>child.once('exit',(code,signal)=>r({code,signal})));
 try{const started=new Promise<void>((resolve,reject)=>{child.once('message',m=>{startup=m;if((m as {started?:boolean}).started)resolve();else reject(new Error('fixture_start_failed'));});child.once('error',reject);});child.send(f.options);await started;
  while(Date.now()-begun<95000){const rows=(await c.pool.query('SELECT mailbox_id,completed_at FROM mailbox_poll WHERE mailbox_id=ANY($1::uuid[])',[c.active])).rows;for(const row of rows){if(!row.completed_at)continue;const values=completed.get(row.mailbox_id)??[],at=row.completed_at.getTime();if(values.at(-1)!==at)values.push(at);completed.set(row.mailbox_id,values);}if(c.active.every(id=>(completed.get(id)?.length??0)>=2))break;await new Promise(r=>setTimeout(r,100));}
  const gaps=c.active.map(id=>({id,completed:completed.get(id)??[],gap:(completed.get(id)?.[1]??Infinity)-(completed.get(id)?.[0]??0)}));await writeFile('/tmp/n7-f10-cadence-implement-a7/short-native-v2.json',JSON.stringify({begun,ended:Date.now(),startup,stderr,gaps,peerLatencies:f.peerLatencies,operationCounts:Object.fromEntries(f.verbs.reduce((m:Map<string,number>,v)=>m.set(v,(m.get(v)??0)+1),new Map()))},null,2)+'\n');assert.equal(stderr,'');assert.ok(gaps.every(r=>r.completed.length>=2));assert.ok(gaps.every(r=>r.gap<=30000),JSON.stringify(gaps.map(r=>r.gap)));
 }finally{const stopAt=Date.now();child.kill('SIGTERM');const outcome=await exit;await writeFile('/tmp/n7-f10-cadence-implement-a7/short-native-v2-drain.json',JSON.stringify({...outcome,drained,elapsedMs:Date.now()-stopAt})+'\n');assert.equal(outcome.code,0);assert.equal(outcome.signal,null);assert.equal(drained,true);await f.close();await c.pool.end();}
});

test('explicit retry captures changed native UID proof in one quantum without old FETCH or freshness',{timeout:60000},async()=>{
 const {transportContext}=await import('./f09-transport-fixture.js');const {RuntimeStore}=await import('../src/runtime/store.js');const {PollWorker,identity}=await import('../src/replies/worker.js');const {LiveReplyAdapter}=await import('../src/replies/adapter.js');
 const c=await transportContext(),behavior={uidvalidity:'1',uidNext:1,headers:[],examineFailure:false},f=await transportFixture(behavior);try{
  const mailbox=c.boxes[0]!,tenant=c.actors[0]!.tenant_id;await c.pool.query('DELETE FROM capacity_lease WHERE mailbox_id=$1',[c.boxes[1]]);
  const store=new RuntimeStore(c.pool),worker=new PollWorker(c.pool,c.config.credentialKeyring,'live_provider',new LiveReplyAdapter(c.pool,c.config,f.options));await store.maintenance();
  let run=await worker.store.capture(tenant,mailbox,{uidvalidity:'1',uidNext:1,observedAt:new Date(),provenance:'imap_headers'});await worker.store.checkpointTail(tenant,mailbox,identity(run),{uidvalidity:'1',uidNext:1,observedAt:new Date(),provenance:'imap_headers'});
  const freshness=(await c.pool.query('SELECT completed_at FROM mailbox_poll WHERE mailbox_id=$1',[mailbox])).rows[0].completed_at.getTime();
  behavior.examineFailure=true;const first=await store.claim('poll');assert.ok(first);assert.equal((await worker.quantum(tenant,mailbox,store.guard(first),new AbortController().signal)).state,'paused');await store.finish(first,'provider_backoff');
  run=(await worker.store.status(tenant,mailbox))!;assert.equal(run.state,'rescan_incomplete');const heldVerbs=f.verbs.length;assert.equal((await worker.quantum(tenant,mailbox,async()=>{},new AbortController().signal)).state,'rescan_incomplete');assert.equal(f.verbs.length,heldVerbs);
  behavior.examineFailure=false;behavior.uidvalidity='2';behavior.uidNext=2;run=await worker.store.retry(tenant,mailbox,identity(run));assert.equal(run.uidvalidity,'1');assert.equal(run.tailHighWater,0);assert.equal(run.attempt,2);
  await new Promise(r=>setTimeout(r,30100));await store.maintenance();const next=await store.claim('poll');assert.ok(next);const examines=f.verbs.filter(v=>v==='EXAMINE').length,fetches=f.verbs.filter(v=>v==='UID').length;
  assert.equal((await worker.quantum(tenant,mailbox,store.guard(next),new AbortController().signal)).state,'scanning','current native EXAMINE must recover explicit old-generation retry');await store.finish(next);
  assert.equal(f.verbs.filter(v=>v==='EXAMINE').length,examines+1);assert.equal(f.verbs.filter(v=>v==='UID').length,fetches,'old generation must not FETCH');
  run=(await worker.store.status(tenant,mailbox))!;assert.equal(run.uidvalidity,'2');assert.equal(run.cursor,0);assert.equal(run.highWater,1);assert.equal(run.tailHighWater,null);assert.equal(run.attempt,1);assert.equal(run.pages,0);
  const poll=(await c.pool.query('SELECT scan_complete,completed_at FROM mailbox_poll WHERE mailbox_id=$1',[mailbox])).rows[0];assert.equal(poll.scan_complete,false);assert.equal(poll.completed_at.getTime(),freshness);
  for(let i=0;i<3;i++){const claim=await store.claim('poll');assert.ok(claim);const result=await worker.quantum(tenant,mailbox,store.guard(claim),new AbortController().signal);await store.finish(claim,'ready',result.state==='complete');}
  assert.equal((await worker.store.status(tenant,mailbox))!.state,'complete');assert.equal((await c.pool.query('SELECT count(*) FROM transport_operation WHERE operation IS NOT NULL')).rows[0].count,'0');
 }finally{await f.close();await c.close();}
});


test('native five-second rescans yield fairly to later healthy E across competing worker restart',{timeout:145000},async()=>{
 const {adversarialFixture}=await import('./f10-runtime-fixture.js'),{readFile}=await import('node:fs/promises');const setupPool=createPool(loadConfig().databaseUrl);try{await cleanupFairInstrumentation(setupPool);}finally{await setupPool.end();}const c=await adversarialFixture(),begun=Date.now(),children:{child:ReturnType<typeof fork>;exit:Promise<unknown>;pid:number;startticks:string;drained:boolean}[]=[],phases:unknown[]=[],observerQueries:unknown[]=[];let failure:string|null=null,firstECompletion:number|null=null;
 const start=async(once:boolean)=>{const child=fork(new URL('./f10-runtime-process-fixture.ts',import.meta.url),[],{execArgv:[],env:{...process.env,F10_FAIR_ONCE:once?'1':'0'},stdio:['ignore','pipe','pipe','ipc'],serialization:'advanced'}),entry={child,pid:child.pid!,startticks:(await readFile(`/proc/${child.pid}/stat`,'utf8')).split(') ')[1]!.split(' ')[19]!,drained:false,exit:Promise.resolve<unknown>(null)};let stderr='';child.stderr?.on('data',b=>{stderr+=b.toString();});entry.exit=new Promise(r=>child.once('exit',(code,signal)=>r({pid:child.pid,code,signal,stderr,drained:entry.drained,at:Date.now()})));children.push(entry);child.on('message',m=>{if((m as {drained?:boolean}).drained)entry.drained=true;});const ready=new Promise<void>((r,j)=>{child.once('message',m=>(m as {started?:boolean}).started?r():j(new Error('worker_start_failed')));child.once('error',j);});child.send(c.options);await ready;return entry;};
 type Event={event_id:string;at:Date;kind:string;mailbox:string;body:{service_seq:number;scan_complete?:boolean;completed_at?:string;state?:string}};type Final={mailbox_id:string;scan_complete:boolean;pages:number;scan_state:string;reason:string;due_at:Date};let events:Event[]=[],final:Final[]=[];
 try{
  await installFairInstrumentation(c.pool);
  const first=await start(true);phases.push({phase:'first_start',pid:first.pid,at:Date.now()});const firstExit=await first.exit;phases.push({phase:'actual_first_join',at:Date.now(),outcome:firstExit});assert.equal((firstExit as {code:number}).code,0);
  const before=(await c.pool.query("SELECT mailbox_id,due_at,service_seq FROM runtime_due WHERE kind='poll' ORDER BY mailbox_id")).rows;phases.push({phase:'persisted_before_restart',at:Date.now(),rows:before});
  await start(false);await start(false);phases.push({phase:'competing_restart',at:Date.now()});
  while(Date.now()-begun<112000){
   const queryStarted={utc:new Date().toISOString(),monotonicNs:process.hrtime.bigint().toString()};events=(await c.pool.query('SELECT * FROM n7_fair_events ORDER BY event_id')).rows;observerQueries.push({begin:queryStarted,end:{utc:new Date().toISOString(),monotonicNs:process.hrtime.bigint().toString()},lastEvent:events.at(-1)?.event_id});
   const selected=events.filter(e=>e.kind==='selection'),initial=selected.slice(0,4),fifth=selected[4];
   if(fifth){assert.equal(new Set(initial.map(e=>e.mailbox)).size,4,'A-D each receive their first quantum');assert.ok(initial.every(e=>c.boxes.slice(0,4).includes(e.mailbox)),'A-D first four claims');assert.equal(fifth.mailbox,c.boxes[4],'fair E selection precedes ANY A-D second quantum after actual restart');}
   const ePoll=(await c.pool.query('SELECT completed_at,scan_complete FROM mailbox_poll WHERE mailbox_id=$1',[c.boxes[4]])).rows[0];if(ePoll?.scan_complete&&firstECompletion===null){firstECompletion=ePoll.completed_at.getTime();assert.ok(firstECompletion!-begun<=30000,'healthy E actual completion <=30s');}
   const held=(await c.pool.query("SELECT count(*) FROM reply_rescan WHERE mailbox_id=ANY($1::uuid[]) AND state='rescan_incomplete'",[c.boxes.slice(0,4)])).rows[0].count;
   if(held==='4'){phases.push({phase:'all_long_scans_held',at:Date.now()});await new Promise(r=>setTimeout(r,1200));break;}await new Promise(r=>setTimeout(r,100));
  }
  for(const e of children.slice(1))e.child.kill('SIGTERM');for(const e of children.slice(1))phases.push({phase:'competing_join',at:Date.now(),outcome:await e.exit});
  events=(await c.pool.query('SELECT * FROM n7_fair_events ORDER BY event_id')).rows;final=(await c.pool.query("SELECT d.*,r.pages,r.state AS scan_state,p.scan_complete,p.completed_at FROM runtime_due d LEFT JOIN reply_rescan r ON r.mailbox_id=d.mailbox_id LEFT JOIN mailbox_poll p ON p.mailbox_id=d.mailbox_id WHERE d.kind='poll' ORDER BY d.mailbox_id")).rows;
  const selected=events.filter(e=>e.kind==='selection'),turns=events.filter(e=>e.kind==='turn');assert.equal(final.length,5,'all five participants remain denominator');assert.ok(selected.find(e=>e.mailbox===c.boxes[4])!.at.getTime()-begun<=60000,'healthy E selection <=60s');assert.notEqual(firstECompletion,null,'E really completed before worker drain');
  for(const id of c.boxes.slice(0,4)){const row=final.find(e=>e.mailbox_id===id)!;assert.equal(row.scan_complete,false,'partial A-D page must never count as full poll completion');assert.equal(row.pages,20,'literal twenty-page attempt cap');assert.equal(row.scan_state,'rescan_incomplete','exhausted long scan stays explicitly held');assert.equal(row.reason,'rescan_incomplete');assert.equal(row.due_at.getTime(),before.find(e=>e.mailbox_id===id)!.due_at.getTime(),'original due age survives yields and restart');}
  for(const claim of selected){const preceding=turns.filter(e=>e.mailbox===claim.mailbox&&Number(e.event_id)<Number(claim.event_id)),last=preceding.at(-1)!;assert.equal(last.body.service_seq,claim.body.service_seq,'selected durable service turn precedes native I/O');assert.equal(preceding.filter(e=>e.body.service_seq===claim.body.service_seq).length,1,'each selected durable turn advances exactly once');}
  for(const id of c.boxes.slice(0,4)){const native=c.traffic as {mailbox:string;started:number;completed?:number;elapsedMs?:number;beforeIO?:{state:string;service_seq:string}}[];assert.ok(native.some(e=>e.mailbox===id&&e.started>=begun&&e.completed!==undefined&&(e.elapsedMs??0)>=5000),'each A-D first scheduled native page succeeds for at least five seconds');}for(const row of c.eligibility.rows){assert.ok(row.next_check_at.getTime()<=selected[0]!.at.getTime(),'all five eligible before first claims');}const eDue=c.eligibility.rows.find(r=>r.mailbox_id===c.boxes[4])!.due_at.getTime();assert.ok(c.eligibility.rows.filter(r=>r.mailbox_id!==c.boxes[4]).every(r=>r.due_at.getTime()<eDue),'E is later due than existing A-D rescans');
  const eCompletions=[...new Set(events.filter(e=>e.kind==='poll'&&e.mailbox===c.boxes[4]&&e.body.scan_complete&&e.body.completed_at).map(e=>new Date(e.body.completed_at!).getTime()))];assert.ok(eCompletions.length>1,'E repeatedly completes while long scans continue');assert.ok(eCompletions.slice(1).every((at,i)=>at-eCompletions[i]!<=30000),'every healthy E full completion gap <=30s');
  for(const id of c.boxes){let active=false;for(const event of events.filter(e=>e.mailbox===id)){if(event.kind==='selection'){assert.equal(active,false,'new owner never overlaps prior claim');active=true;}if(event.kind==='yield')active=false;}}
  assert.equal(turns.length,selected.length,'yield/restart never resets durable service sequence');assert.ok(c.maxSockets<=4,'fixed four physical IMAP lanes');assert.equal((await c.pool.query('SELECT count(*) FROM transport_operation WHERE operation IS NOT NULL')).rows[0].count,'0','all native transport ownership joined');
 }catch(error){failure=error instanceof Error?error.message:String(error);throw error;}finally{
  for(const e of children)if(e.child.exitCode===null&&e.child.signalCode===null)e.child.kill('SIGTERM');const joins=await Promise.all(children.map(e=>e.exit));
  events=(await c.pool.query('SELECT * FROM n7_fair_events ORDER BY event_id')).rows;
  await writeFile(`${process.env.F10_EVIDENCE_DIR}/fairness-${begun}.json`,JSON.stringify({begun,ended:Date.now(),failure,phases,observerQueries,wire:c.wire,observationGaps:['Slot snapshots are same runtime selection/yield transaction READ COMMITTED observations; the transport_busy read-only admission transaction rolls back without a trigger. Its exact failure boundary remains unobserved.','Database UTC timestamps and fixture monotonic timestamps correlate through recorded UTC pairs; clocks are not a shared monotonic clock.','Server response write records do not prove client receipt or child exit; socket close and DB physical_release are distinct phases.'],children:children.map(e=>({pid:e.pid,startticks:e.startticks})),joins,firstECompletion,eligibility:c.eligibility,traffic:c.traffic,maxSockets:c.maxSockets,events,final,participants:c.boxes.map((id,i)=>({label:['A','B','C','D','E'][i],id,selections:events.filter(e=>e.kind==='selection'&&e.mailbox===id),pages:events.filter(e=>e.kind==='page'&&e.mailbox===id),fullPollCompletions:events.filter(e=>e.kind==='poll'&&e.mailbox===id&&e.body.scan_complete),incomplete:events.filter(e=>e.kind==='page'&&e.mailbox===id&&e.body.state==='rescan_incomplete'),ownership:events.filter(e=>['selection','yield'].includes(e.kind)&&e.mailbox===id),ownershipDurationsMs:events.filter(e=>e.kind==='selection'&&e.mailbox===id).map(e=>({selected:e.at.getTime(),released:events.find(v=>v.kind==='yield'&&v.mailbox===id&&Number(v.event_id)>Number(e.event_id))?.at.getTime()??null}))}))},null,2)+'\n');
  await cleanupFairInstrumentation(c.pool);await c.close();
 }
});

export async function bodyPressureFleetWitness(bodyFault=false){
 const {seedBodyPressureCohort}=await import('./f10-runtime-process-fixture.js'),{bodyFixture}=await import('./f11-body-fixture.js'),{readFile}=await import('node:fs/promises');
 // This additive cohort requires a fresh owned database; no existing fixture reset.
 const c=await seedBodyPressureCohort(),smtp=await transportFixture({uidNext:1,headers:[]}),imap=await bodyFixture({mailboxes:c.mailboxes,phaseDelayMs:2800,...(bodyFault?{bodyFaults:1}:{})}),fixture={...smtp.options!,ca:smtp.options!.ca+'\n'+imap.fixture.ca,imap993:imap.fixture.imap993};
 const begun=Date.now(),children:{pid:number;startTicks:string;child:ReturnType<typeof fork>;exit:Promise<{code:number|null;signal:NodeJS.Signals|null;drained:boolean;stderr:string}>}[]=[],samples:unknown[]=[],readyAt=new Map<string,number>(),completions=new Map<string,number[]>();let failure:string|null=null;
 const start=async()=>{const child=fork(new URL('./f10-runtime-process-fixture.ts',import.meta.url),[],{execArgv:[],stdio:['ignore','pipe','pipe','ipc'],serialization:'advanced'});let drained=false,stderr='';child.stderr?.on('data',b=>{stderr+=b.toString();});child.on('message',m=>{if((m as {drained?:boolean}).drained)drained=true;});const entry={pid:child.pid!,startTicks:(await readFile(`/proc/${child.pid}/stat`,'utf8')).split(') ')[1]!.split(' ')[19]!,child,exit:new Promise<{code:number|null;signal:NodeJS.Signals|null;drained:boolean;stderr:string}>(r=>child.once('exit',(code,signal)=>r({code,signal,drained,stderr})))};children.push(entry);const started=new Promise<void>((r,j)=>{child.once('message',m=>(m as {started?:boolean}).started?r():j(Error('worker_start_failed')));child.once('error',j);});child.send(fixture);await started;return entry;};
 try{
  assert.equal(c.connected.length,100);assert.equal(c.participants.length,30);assert.equal(c.actors.length,3);await installFairInstrumentation(c.pool);
  await c.pool.query(`CREATE FUNCTION n7_body_record() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN INSERT INTO n7_fair_events(kind,mailbox,body) VALUES('body',NEW.mailbox_id,to_jsonb(NEW)-'phase_metadata'-'content_envelope'); RETURN NEW; END $$`);await c.pool.query('CREATE TRIGGER n7_body_record AFTER INSERT OR UPDATE ON incoming_ai_event FOR EACH ROW EXECUTE FUNCTION n7_body_record()');
  await start();await start();let restarted=false;
  while(Date.now()-begun<300000){
   const at=Date.now(),rows=(await c.pool.query('SELECT e.id,e.mailbox_id,e.capture_state,e.capture_phase,e.window_start,e.window_end,e.queue_eligible_at,e.attempt_deadline,e.captured_at,p.completed_at,p.scan_complete FROM mailbox_poll p LEFT JOIN incoming_ai_event e ON e.mailbox_id=p.mailbox_id WHERE p.mailbox_id=ANY($1::uuid[])',[c.participants.map(p=>p.mailbox)])).rows;
   for(const row of rows){if(row.capture_state==='ready'&&!readyAt.has(row.mailbox_id))readyAt.set(row.mailbox_id,row.captured_at.getTime());if(row.scan_complete&&row.completed_at){const times=completions.get(row.mailbox_id)??[];if(times.at(-1)!==row.completed_at.getTime())times.push(row.completed_at.getTime());completions.set(row.mailbox_id,times);}}
   const counts=(await c.pool.query("SELECT (SELECT count(*)::int FROM incoming_ai_event WHERE window_end>clock_timestamp() AND capture_state IN ('pending','claimed')) AS windows,(SELECT count(*)::int FROM transport_operation WHERE protocol='imap' AND operation IS NOT NULL) AS imap,(SELECT count(*)::int FROM transport_operation WHERE protocol='smtp' AND operation IS NOT NULL) AS smtp")).rows[0];samples.push({utc:new Date().toISOString(),monotonicNs:process.hrtime.bigint().toString(),rows,counts});assert.ok(counts.windows<=3);assert.ok(counts.imap<=4);assert.ok(counts.smtp<=2);
   if(at-begun>=240000)assert.equal(readyAt.size,30,'ALL30 legal both-phase captures ready <=240s');
   if(!restarted&&at-begun>150000){const old=children[0]!;old.child.kill('SIGTERM');const join=await old.exit;assert.equal(join.code,0);assert.equal(join.drained,true);await start();restarted=true;}
   await new Promise(r=>setTimeout(r,250));
  }
  assert.equal(readyAt.size,30);assert.ok([...readyAt.values()].every(at=>at-c.seededAt<=240000));
  const events=(await c.pool.query('SELECT * FROM n7_fair_events ORDER BY event_id')).rows;
  for(const p of c.participants){const times=completions.get(p.mailbox)??[];assert.ok(times.length>=2);assert.ok(times.slice(1).every((at,i)=>at-times[i]!<=30000),'ALL30 full header gap <=30s');assert.ok(times[0]!-begun<=30000);assert.ok(Date.now()-times.at(-1)!<=30000);const selected=events.filter(e=>e.kind==='selection'&&e.mailbox===p.mailbox);assert.ok(selected.length>0);assert.ok(selected.every(e=>e.at.getTime()-new Date(e.body.due_at).getTime()<=60000),'ALL30 fair due selection <=60s');const capture=events.filter(e=>e.kind==='body'&&e.mailbox===p.mailbox);assert.ok(capture.some(e=>e.body.capture_phase==='text'&&e.body.capture_state==='pending'));assert.ok(capture.some(e=>e.body.capture_state==='ready'));const windows=capture.filter(e=>e.body.window_start);assert.equal(new Set(windows.map(e=>e.body.window_end)).size,1);assert.equal(new Set(capture.map(e=>e.body.attempt_deadline)).size,1);assert.ok(windows.every(e=>new Date(e.body.window_end).getTime()-new Date(e.body.window_start).getTime()===12000));}
  const occupiedPeers=new Map<string,number>();for(const event of imap.wire){if(event.phase==='authenticated'){const n=(occupiedPeers.get(event.mailbox)??0)+1;occupiedPeers.set(event.mailbox,n);assert.ok(n<=1,'independent peer mailbox concurrency <=1');}if(event.phase==='socket_close'&&event.mailbox)occupiedPeers.set(event.mailbox,(occupiedPeers.get(event.mailbox)??0)-1);}assert.ok(smtp.maxConnections<=2);
  assert.ok(imap.peak<=4);assert.ok(imap.bodyPeak<=3);assert.ok(smtp.verbs.includes('DATA'),'SMTP continues under body pressure');
  const phaseOperations=imap.wire.filter(e=>e.phase==='phase_start'||e.phase==='fault_injected').map(phase=>{
   const acquired=events.filter(e=>e.kind==='physical_acquire'&&e.mailbox===phase.mailbox&&e.at.getTime()<=Date.parse(phase.utc)).at(-1);assert.ok(acquired,'native phase binds to actual mailbox physical acquisition');
   const release=events.find(e=>e.kind==='physical_release'&&e.body.old.operation===acquired.body.new.operation&&e.body.old.owner_process===acquired.body.new.owner_process);assert.ok(release,'exact operation and owner release');
   const close=imap.wire.find(e=>e.connection===phase.connection&&e.phase==='socket_close');assert.ok(close);assert.ok(release.at.getTime()>=Date.parse(close.utc),'DB release follows independent socket close');assert.ok(release.at.getTime()-acquired.at.getTime()<=5000,'each actual native BODY phase physical lifetime <=5s');return {phase,acquired,close,release};
  });
  if(bodyFault){const faults=phaseOperations.filter(e=>e.phase.phase==='fault_injected');assert.equal(faults.length,1);const fault=faults[0]!;const recovered=phaseOperations.find(e=>e.phase.mailbox===fault.phase.mailbox&&e.phase.monotonicMs>fault.close.monotonicMs&&e.phase.phase==='phase_start');assert.ok(recovered,'same mailbox recovers after exact closed failure');assert.ok(recovered.acquired.at>=fault.release.at,'replacement admission follows exact owner release');assert.equal(imap.behavior.bodyFaults,0);}

 }catch(error){failure=error instanceof Error?error.message:String(error);throw error;}finally{
  for(const e of children)if(e.child.exitCode===null&&e.child.signalCode===null)e.child.kill('SIGTERM');const joins=await Promise.all(children.map(e=>e.exit));const events=(await c.pool.query('SELECT * FROM n7_fair_events ORDER BY event_id')).rows;
  const occupied=Number((await c.pool.query('SELECT count(*) AS n FROM transport_operation WHERE operation IS NOT NULL')).rows[0].n);
  await writeFile(`${process.env.F10_EVIDENCE_DIR}/all30-body-${begun}.json`,JSON.stringify({bodyFault,begun,ended:Date.now(),seededAt:c.seededAt,failure,connected:c.connected,participants:c.participants.map(({tenant,mailbox,root,enrollment})=>({tenant,mailbox,root,enrollment})),readyAt:[...readyAt],completions:[...completions],samples,events,wire:imap.wire,imapPeak:imap.peak,bodyPeak:imap.bodyPeak,smtpPeak:smtp.maxConnections,smtpVerbs:smtp.verbs,children:children.map(e=>({pid:e.pid,startTicks:e.startTicks})),joins,occupied},null,2)+'\n');
  await c.pool.query('DROP TRIGGER IF EXISTS n7_body_record ON incoming_ai_event');await c.pool.query('DROP FUNCTION IF EXISTS n7_body_record()');await cleanupFairInstrumentation(c.pool);await imap.close();await smtp.close();await c.pool.end();assert.equal(occupied,0);assert.ok(joins.every(e=>e.code===0&&e.signal===null&&e.drained&&e.stderr===''),'actual worker exits joined');
 }
}
test('F11 ALL30 both2800ms phases preserve complete headers and existing fleet lanes full300s',{timeout:330000},()=>bodyPressureFleetWitness());
test('F11 ALL30 finite native BODY fault recovers both2800ms phases full300s',{timeout:330000},()=>bodyPressureFleetWitness(true));
