import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fork,spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { acquireTransportSlot,bindTransportChild,closedOwnerProof,releaseTransportSlot,type TransportSlot } from '../src/mailboxes/transport-slots.js';
import { cadenceFixture,runtimeFixture } from './f10-runtime-fixture.js';
import { transportFixture,recoveryScenario } from './f09-transport-fixture.js';
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
