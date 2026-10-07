import assert from 'node:assert/strict';
import { test } from 'node:test';
import { runRuntime } from '../src/runtime/loop.js';
import { RuntimeStore } from '../src/runtime/store.js';
import { PollWorker } from '../src/replies/worker.js';
import { seedFixture } from '../src/replies/fixture.js';
import { eligibilityTransaction } from '../src/consent/transaction.js';
import { randomUUID } from 'node:crypto';
import { PoolStore } from '../src/pool/store.js';
import { DispatchStore } from '../src/dispatch/store.js';
import { SubmissionStore } from '../src/dispatch/submission.js';
import { runtimeFixture,poolRuntimeFixture } from './f10-runtime-fixture.js';
test('overload backoff preserves due age and independent tenant progress',async()=>{
 const {pool,boxes}=await runtimeFixture();try{
  const store=new RuntimeStore(pool);await store.maintenance();
  await pool.query("UPDATE runtime_due SET due_at=clock_timestamp()-interval '1 hour' WHERE mailbox_id=ANY($1::uuid[])",[boxes.slice(0,4)]);
  const served:string[]=[];
  for(let i=0;i<5;i++){
   const claim=await new RuntimeStore(pool).claim('poll');assert.ok(claim);served.push(claim.mailbox_id);
   const age=claim.due_at;await store.finish(claim,'transport_busy');
   await pool.query("UPDATE runtime_due SET next_check_at=clock_timestamp()-interval '1 second' WHERE mailbox_id=$1 AND kind='poll'",[claim.mailbox_id]);
   assert.equal((await pool.query("SELECT due_at FROM runtime_due WHERE mailbox_id=$1 AND kind='poll'",[claim.mailbox_id])).rows[0].due_at.getTime(),age.getTime());
  }
  assert.equal(new Set(served).size,5,'A-D old due turns must yield to healthy E before a second turn');
  const claim=await store.claim('poll');assert.ok(claim);await store.finish(claim,'provider_backoff');
  const r=(await pool.query("SELECT failure_count,extract(epoch from(next_check_at-clock_timestamp())) AS seconds FROM runtime_due WHERE mailbox_id=$1 AND kind='poll'",[claim.mailbox_id])).rows[0];assert.equal(r.failure_count,1);assert.ok(Number(r.seconds)>28);
 }finally{await pool.end();}
});
test('durable runtime drains and recovers without replaying uncertain sends',async()=>{
 const {pool}=await runtimeFixture(30);try{
  const store=new RuntimeStore(pool);await store.maintenance();
  const claims=await Promise.all(Array.from({length:20},()=>store.claim('poll')));assert.equal(new Set(claims.map(c=>c?.mailbox_id)).size,20);
  const old=claims[0]!;await pool.query("UPDATE runtime_due SET lease_until=clock_timestamp()-interval '1 second' WHERE mailbox_id=$1 AND kind='poll'",[old.mailbox_id]);
  await store.claim('poll');assert.equal(await store.finish(old),0,'expired owner cannot overwrite a new generation');
  await assert.rejects(eligibilityTransaction(pool,c=>store.guard(old)(c)));
  await pool.query("UPDATE runtime_due SET state='claimed',owner_id=$2,generation=generation+1,lease_until=clock_timestamp()+interval '120 seconds' WHERE mailbox_id=$1 AND kind='poll'",[old.mailbox_id,old.owner_id]);
  assert.equal(await store.finish(old),0,'same owner UUID cannot bypass changed generation');
  assert.equal((await pool.query('SELECT count(*) FROM transport_operation WHERE operation IS NOT NULL')).rows[0].count,'0');
 }finally{await pool.end();}
});
test('fair polling serves thirty active mailboxes and preserves activity intent',async()=>{
 const {pool,boxes}=await runtimeFixture(100);try{
  await pool.query("UPDATE capacity_lease SET state='waiting_capacity',expires_at=NULL WHERE mailbox_id=ANY($1::uuid[])",[boxes.slice(30)]);
  const store=new RuntimeStore(pool);assert.equal(await store.maintenance(),30);
  const selected=new Set<string>();for(let i=0;i<30;i++){const c=await store.claim('poll');assert.ok(c);selected.add(c.mailbox_id);await store.finish(c);}assert.equal(selected.size,30);
  await eligibilityTransaction(pool,c=>c.query('DELETE FROM capacity_lease WHERE mailbox_id=$1',[boxes[0]]));
  await store.maintenance();assert.equal((await pool.query('SELECT count(*) FROM capacity_lease WHERE mailbox_id=$1',[boxes[0]])).rows[0].count,'0');
  assert.equal((await pool.query("SELECT count(*) FROM capacity_lease WHERE state='active'")).rows[0].count,'30');
 }finally{await pool.end();}
});
test('poll quanta persist the fixed tail before yielding and never retry incomplete scans',async()=>{
 const {pool,config,tenant,boxes}=await runtimeFixture(1);try{
  const id=boxes[0]!,store=new RuntimeStore(pool),worker=new PollWorker(pool,config.credentialKeyring,'local_test');
  await seedFixture(pool,tenant,id,{uidvalidity:'1',uidNext:3,headers:[{uid:1,from:'unrelated@example.test'}]});await store.maintenance();
  const run=async()=>{const c=await store.claim('poll');assert.ok(c);const r=await worker.quantum(tenant,id,store.guard(c),new AbortController().signal);await store.finish(c);return r;};
  assert.equal((await run()).state,'scanning');assert.equal((await worker.store.status(tenant,id))!.pages,0);
  await run();assert.equal((await worker.store.status(tenant,id))!.cursor,2);
  await run();assert.equal((await worker.store.status(tenant,id))!.tailHighWater,2);
  assert.equal((await run()).state,'complete');
  await run();await pool.query("UPDATE reply_rescan SET state='rescan_incomplete' WHERE mailbox_id=$1",[id]);
  const before=await worker.store.status(tenant,id);assert.equal((await run()).state,'rescan_incomplete');assert.deepEqual(await worker.store.status(tenant,id),before);
 }finally{await pool.end();}
});
test('automatic pool allocation skips pair conflicts and remains idempotent',async()=>{
 const {pool,actors,now}=await poolRuntimeFixture();try{
  const cohort=new PoolStore(pool),a=actors[0]!;assert.equal((await cohort.tick(now,a.id)).created,1);
  const initial=(await pool.query("SELECT * FROM send_job WHERE mailbox_id=$1",[a.id])).rows[0];
  await pool.query("UPDATE send_job SET state='submitted' WHERE id=$1",[initial.id]);await pool.query('UPDATE runtime_mailbox SET pool_peer_after=NULL WHERE mailbox_id=$1',[a.id]);
  assert.equal((await cohort.tick(now,a.id)).created,1,'pair conflict must skip to another eligible tenant');
  assert.equal((await cohort.tick(now,a.id)).created,0,'one movable outbound per sender');
  assert.equal((await pool.query("SELECT count(*) FROM send_job WHERE mailbox_id=$1 AND kind='initial'",[a.id])).rows[0].count,'2');
  await cohort.tick(now,initial.recipient_mailbox_id);await cohort.tick(now,initial.recipient_mailbox_id);
  assert.equal((await pool.query("SELECT count(*) FROM send_job WHERE parent_id=$1",[initial.id])).rows[0].count,'1');
 }finally{await pool.end();}
});
test('paced dispatch preserves current day quota and every stop fence',async()=>{
 const {pool,config,actors,now}=await poolRuntimeFixture();try{
  const a=actors[0]!,b=actors[1]!,day=now.toISOString().slice(0,10);let calls=0;
  const enqueue=async()=>{const id=randomUUID();await pool.query(`INSERT INTO send_job(id,tenant_id,mailbox_id,recipient_mailbox_id,scope,state,due_at,payload,pair_key,kind,parent_id)
   VALUES($1,$2,$3,$4,'pool','queued',$5,'{"subject":"F10","body":"Consented fixture"}',$6,'initial',NULL)`,[id,a.tenant,a.id,b.id,now,id+':'+day]);return id;};
  await enqueue();const claim=await new DispatchStore(pool).claim(undefined,now,a.id);assert.ok(claim);
  const submit=new SubmissionStore(pool,{...config,dispatchMode:'local_test'},{clock:()=>now,adapter:{mode:'local_test',async submit(){calls++;return {kind:'pre_data_transient',proof:'no_data_submitted'};}}});
  assert.equal((await submit.submit(claim.id,claim.lease_owner)).state,'queued');assert.equal(calls,1);
  const retry=(await pool.query('SELECT due_at,first_attempt_at FROM send_job WHERE id=$1',[claim.id])).rows[0];assert.equal(retry.due_at.getTime()-retry.first_attempt_at.getTime(),60000);
  await enqueue();assert.equal(await new DispatchStore(pool).claim(undefined,now,a.id),null);
  const next=new Date(now.getTime()+60000);await pool.query('UPDATE mailbox_poll SET completed_at=$1',[next]);
  const c=await new DispatchStore(pool).claim(undefined,next,a.id);assert.ok(c);
  await eligibilityTransaction(pool,async client=>{await client.query('DELETE FROM capacity_lease WHERE mailbox_id=$1',[a.id]);});
  assert.equal((await new SubmissionStore(pool,{...config,dispatchMode:'local_test'},{clock:()=>next,adapter:{mode:'local_test',async submit(){calls++;return {kind:'accepted'};}}}).submit(c.id,c.lease_owner)).state,'blocked');assert.equal(calls,1);
  assert.equal((await pool.query("SELECT count(*) FROM send_job WHERE state='unknown'")).rows[0].count,'0');
 }finally{await pool.end();}
});
test('persisted keyset reconciliation advances beyond first hundred without recreating activity',async()=>{
 const {pool,boxes}=await runtimeFixture(205);try{
  await pool.query("UPDATE capacity_lease SET state='waiting_capacity',expires_at=NULL WHERE mailbox_id=ANY($1::uuid[])",[boxes.slice(30)]);
  const late=boxes[204]!;
  await pool.query('DELETE FROM capacity_lease WHERE mailbox_id=$1',[late]);
  await pool.query("INSERT INTO runtime_due(tenant_id,mailbox_id,kind,due_at,next_check_at) SELECT tenant_id,id,'poll',clock_timestamp(),clock_timestamp() FROM mailbox WHERE id=$1",[late]);
  await new RuntimeStore(pool).maintenance();const first=(await pool.query('SELECT * FROM runtime_reconcile')).rows[0];assert.ok(first.after_mailbox);
  assert.equal((await pool.query("SELECT reason FROM runtime_due WHERE mailbox_id=$1 AND kind='poll'",[late])).rows[0].reason,'ready');
  await new RuntimeStore(pool).maintenance();const second=(await pool.query('SELECT * FROM runtime_reconcile')).rows[0];assert.ok(second.after_created_at>first.after_created_at||second.after_mailbox!==first.after_mailbox);
  await new RuntimeStore(pool).maintenance();assert.equal((await pool.query('SELECT after_mailbox FROM runtime_reconcile')).rows[0].after_mailbox,null);
  assert.equal((await pool.query("SELECT reason FROM runtime_due WHERE mailbox_id=$1 AND kind='poll'",[late])).rows[0].reason,'waiting_capacity');
  assert.equal((await pool.query('SELECT count(*) FROM capacity_lease WHERE mailbox_id=$1',[late])).rows[0].count,'0');
 }finally{await pool.end();}
});
test('actual dispatch job age survives restart backoff pacing quota and an empty queue',async()=>{
 const {pool,actors,now}=await poolRuntimeFixture();try{
  const id=actors[0]!.id,store=new RuntimeStore(pool);await new PoolStore(pool).tick(now,id);
  const due=new Date(now.getTime()-7200000);await pool.query('UPDATE send_job SET due_at=$1 WHERE mailbox_id=$2',[due,id]);
  await store.maintenance();let row=(await pool.query("SELECT * FROM runtime_due WHERE mailbox_id=$1 AND kind='dispatch'",[id])).rows[0];assert.equal(row.due_at.getTime(),due.getTime());
  const claim=await store.claim('dispatch');assert.ok(claim);assert.equal(claim.mailbox_id,id);await store.finish(claim,'provider_backoff');
  row=(await pool.query("SELECT * FROM runtime_due WHERE mailbox_id=$1 AND kind='dispatch'",[id])).rows[0];const next=row.next_check_at;
  await new RuntimeStore(pool).maintenance();row=(await pool.query("SELECT * FROM runtime_due WHERE mailbox_id=$1 AND kind='dispatch'",[id])).rows[0];assert.equal(row.due_at.getTime(),due.getTime());assert.ok(row.next_check_at>=next);
  await pool.query("UPDATE runtime_due SET failure_count=0,reason='ready' WHERE mailbox_id=$1 AND kind='dispatch'",[id]);
  const pacing=new Date(now.getTime()+90000);await pool.query('UPDATE runtime_mailbox SET next_smtp_at=$2 WHERE mailbox_id=$1',[id,pacing]);await store.maintenance();
  row=(await pool.query("SELECT * FROM runtime_due WHERE mailbox_id=$1 AND kind='dispatch'",[id])).rows[0];assert.equal(row.reason,'waiting_pacing');assert.equal(row.next_check_at.getTime(),pacing.getTime());assert.equal(row.due_at.getTime(),due.getTime());
  await pool.query('UPDATE mailbox SET daily_limit=1 WHERE id=$1',[id]);
  await pool.query("INSERT INTO send_job(id,tenant_id,mailbox_id,recipient_mailbox_id,scope,state,reserved_day,pair_key,due_at,payload) SELECT $1::uuid,tenant_id,mailbox_id,recipient_mailbox_id,'pool','unknown',$2::date,$1::text||':'||$2::text,$3,payload FROM send_job WHERE mailbox_id=$4 LIMIT 1",[randomUUID(),now.toISOString().slice(0,10),now,id]);
  await store.maintenance();row=(await pool.query("SELECT * FROM runtime_due WHERE mailbox_id=$1 AND kind='dispatch'",[id])).rows[0];assert.equal(row.reason,'waiting_budget');assert.equal(row.due_at.getTime(),due.getTime());
  await pool.query("UPDATE send_job SET state='cancelled' WHERE mailbox_id=$1 AND state='queued'",[id]);await store.maintenance();row=(await pool.query("SELECT * FROM runtime_due WHERE mailbox_id=$1 AND kind='dispatch'",[id])).rows[0];assert.equal(row.reason,'waiting_peer');assert.equal(row.due_at.getTime(),due.getTime());
  assert.equal((await pool.query("SELECT count(*) FROM send_job WHERE mailbox_id=$1 AND state='unknown'",[id])).rows[0].count,'1');
 }finally{await pool.end();}
});
test('actual database failure during a poll quantum propagates without provider backoff writes',async()=>{
 const {pool,config,tenant,boxes}=await runtimeFixture(1);try{
  const id=boxes[0]!,store=new RuntimeStore(pool);await store.maintenance();await seedFixture(pool,tenant,id,{uidvalidity:'1',uidNext:1,headers:[]});const claim=await store.claim('poll');assert.ok(claim);
  const worker=new PollWorker(pool,config.credentialKeyring,'local_test',{mode:'local_test',async snapshot(){
   const client=await pool.connect();client.on('error',()=>{});try{
    const pid=(await client.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;
    await pool.query('SELECT pg_terminate_backend($1)',[pid]);await client.query('SELECT 1');assert.fail('terminated owned connection must fail');
   }finally{client.release(true);}
  },async read(){assert.fail('no page IO after database failure');}});
  await assert.rejects(worker.quantum(tenant,id,store.guard(claim),new AbortController().signal));
  assert.equal(await worker.store.status(tenant,id),null);
  assert.equal((await pool.query("SELECT failure_count FROM runtime_due WHERE mailbox_id=$1 AND kind='poll'",[id])).rows[0].failure_count,0);
 }finally{await pool.end();}
});
test('denied live submission returns typed authority outcome before acquiring a physical slot',async()=>{
 const {pool,config,actors,now}=await poolRuntimeFixture();try{
  const id=actors[0]!.id;await new PoolStore(pool).tick(now,id);const claim=await new DispatchStore(pool).claim(undefined,now,id);assert.ok(claim);
  const result=await new SubmissionStore(pool,{...config,dispatchMode:'live_provider'}).submit(claim.id,claim.lease_owner);
  assert.equal(result.state,'blocked');assert.ok('reason' in result);assert.equal(result.reason,'authority_denied');
  assert.equal((await pool.query('SELECT count(*) FROM transport_operation WHERE operation IS NOT NULL')).rows[0].count,'0');
  assert.equal((await pool.query('SELECT attempt_count FROM send_job WHERE id=$1',[claim.id])).rows[0].attempt_count,0);
 }finally{await pool.end();}
});
test('projection recovers expired logical claims without self quota deadlock and holds fresh owners',async()=>{
 const {pool,actors,now}=await poolRuntimeFixture();try{
  const id=actors[0]!.id;await new PoolStore(pool).tick(now,id);await pool.query('UPDATE mailbox SET daily_limit=1 WHERE id=$1',[id]);const job=await new DispatchStore(pool).claim(undefined,now,id);assert.ok(job);
  const store=new RuntimeStore(pool);await store.maintenance();let row=(await pool.query("SELECT * FROM runtime_due WHERE mailbox_id=$1 AND kind='dispatch'",[id])).rows[0];assert.equal(row.reason,'waiting_peer');assert.equal(row.next_check_at.getTime(),job.lease_until.getTime());
  await pool.query("UPDATE send_job SET lease_until=clock_timestamp()-interval '1 second' WHERE id=$1",[job.id]);await store.maintenance();
  row=(await pool.query("SELECT * FROM runtime_due WHERE mailbox_id=$1 AND kind='dispatch'",[id])).rows[0];assert.equal(row.reason,'ready');assert.ok(await store.claim('dispatch'));
  const recovered=(await pool.query('SELECT * FROM send_job WHERE id=$1',[job.id])).rows[0];assert.equal(recovered.state,'queued');assert.equal(recovered.reserved_day,null);assert.equal(recovered.lease_owner,null);
 }finally{await pool.end();}
});
test('new and proved completed jobs reset backoff while the same failed job retains original age',async()=>{
 const {pool,actors,now}=await poolRuntimeFixture();try{
  const id=actors[0]!.id,store=new RuntimeStore(pool);await new PoolStore(pool).tick(now,id);await store.maintenance();const claim=await store.claim('dispatch');assert.ok(claim);await store.finish(claim,'provider_backoff');
  await store.maintenance();let row=(await pool.query("SELECT * FROM runtime_due WHERE mailbox_id=$1 AND kind='dispatch'",[id])).rows[0];assert.equal(row.failure_count,1);assert.equal(row.due_at.getTime(),claim.due_at.getTime());
  await pool.query("UPDATE send_job SET state='submitted' WHERE id=$1",[row.job_id]);await store.maintenance();row=(await pool.query("SELECT * FROM runtime_due WHERE mailbox_id=$1 AND kind='dispatch'",[id])).rows[0];assert.equal(row.failure_count,0);assert.equal(row.reason,'waiting_peer');
  await pool.query("UPDATE runtime_due SET failure_count=3,reason='provider_backoff',next_check_at=clock_timestamp()+interval '300 seconds' WHERE mailbox_id=$1 AND kind='dispatch'",[id]);
  await new PoolStore(pool).tick(now,id);await store.maintenance();row=(await pool.query("SELECT * FROM runtime_due WHERE mailbox_id=$1 AND kind='dispatch'",[id])).rows[0];assert.equal(row.failure_count,0);assert.equal(row.reason,'ready');assert.ok(row.next_check_at.getTime()<Date.now()+1000);
 }finally{await pool.end();}
});
test('expired claimed reservation is recovered before quota projection independently of a fresh hold',async()=>{
 const {pool,actors,now}=await poolRuntimeFixture();try{
  const id=actors[0]!.id;await new PoolStore(pool).tick(now,id);await pool.query('UPDATE mailbox SET daily_limit=1 WHERE id=$1',[id]);const job=await new DispatchStore(pool).claim(undefined,now,id);assert.ok(job);
  await pool.query("UPDATE send_job SET lease_until=clock_timestamp()-interval '1 second' WHERE id=$1",[job.id]);await new RuntimeStore(pool).maintenance();
  const row=(await pool.query("SELECT * FROM runtime_due WHERE mailbox_id=$1 AND kind='dispatch'",[id])).rows[0];assert.equal(row.reason,'ready');assert.ok(await new RuntimeStore(pool).claim('dispatch'));
  assert.equal((await pool.query('SELECT reserved_day FROM send_job WHERE id=$1',[job.id])).rows[0].reserved_day,null);
 }finally{await pool.end();}
});
test('a new oldest logical job clears prior backoff independently of terminal history',async()=>{
 const {pool,actors,now}=await poolRuntimeFixture();try{
  const id=actors[0]!.id,store=new RuntimeStore(pool);await new PoolStore(pool).tick(now,id);await store.maintenance();const claim=await store.claim('dispatch');assert.ok(claim);await store.finish(claim,'provider_backoff');
  const old=(await pool.query("SELECT * FROM runtime_due WHERE mailbox_id=$1 AND kind='dispatch'",[id])).rows[0];
  await pool.query("UPDATE send_job SET due_at=$2::timestamptz+interval '1 day' WHERE id=$1",[old.job_id,now]);
  const next=randomUUID();await pool.query("INSERT INTO send_job(id,tenant_id,mailbox_id,recipient_mailbox_id,scope,state,pair_key,due_at,payload) SELECT $1::uuid,tenant_id,mailbox_id,recipient_mailbox_id,scope,'queued',$1::text||':'||$2::text,$3,payload FROM send_job WHERE id=$4",[next,now.toISOString().slice(0,10),now,old.job_id]);
  await store.maintenance();let row=(await pool.query("SELECT * FROM runtime_due WHERE mailbox_id=$1 AND kind='dispatch'",[id])).rows[0];assert.equal(row.job_id,next);assert.equal(row.failure_count,0);assert.equal(row.reason,'ready');
  await pool.query("UPDATE send_job SET state='unknown' WHERE mailbox_id=$1",[id]);await pool.query("UPDATE runtime_due SET failure_count=1,reason='provider_backoff',next_check_at=clock_timestamp()+interval '30 seconds' WHERE mailbox_id=$1 AND kind='dispatch'",[id]);await store.maintenance();
  row=(await pool.query("SELECT * FROM runtime_due WHERE mailbox_id=$1 AND kind='dispatch'",[id])).rows[0];assert.equal(row.failure_count,1);assert.equal((await pool.query("SELECT count(*) FROM send_job WHERE mailbox_id=$1 AND state='unknown'",[id])).rows[0].count,'2');
 }finally{await pool.end();}
});
test('a fresh logical owner holds the sender even when another queued job is older',async()=>{
 const {pool,actors,now}=await poolRuntimeFixture();try{
  const id=actors[0]!.id;await new PoolStore(pool).tick(now,id);const job=await new DispatchStore(pool).claim(undefined,now,id);assert.ok(job);
  const next=randomUUID();await pool.query("INSERT INTO send_job(id,tenant_id,mailbox_id,recipient_mailbox_id,scope,state,pair_key,due_at,payload) SELECT $1::uuid,tenant_id,mailbox_id,recipient_mailbox_id,scope,'queued',$1::text||':'||$2::text,$3::timestamptz-interval '1 hour',payload FROM send_job WHERE id=$4",[next,now.toISOString().slice(0,10),now,job.id]);
  const store=new RuntimeStore(pool);await store.maintenance();const row=(await pool.query("SELECT * FROM runtime_due WHERE mailbox_id=$1 AND kind='dispatch'",[id])).rows[0];assert.equal(row.job_id,next);assert.equal(row.reason,'waiting_peer');assert.equal(row.next_check_at.getTime(),job.lease_until.getTime());assert.equal(await store.claim('dispatch'),null);
 }finally{await pool.end();}
});

test('complete proof becomes immediately eligible without resetting its selected fair turn',async()=>{
 const {pool}=await runtimeFixture(1);try{const store=new RuntimeStore(pool);await store.maintenance();
  const poll=await store.claim('poll');assert.ok(poll);await seedFixture(pool,poll.tenant_id,poll.mailbox_id,{uidvalidity:'1',uidNext:1,headers:[]});const worker=new PollWorker(pool,(await import('../src/config.js')).loadConfig().credentialKeyring,'local_test');await worker.quantum(poll.tenant_id,poll.mailbox_id,store.guard(poll),new AbortController().signal);await worker.quantum(poll.tenant_id,poll.mailbox_id,store.guard(poll),new AbortController().signal);await worker.quantum(poll.tenant_id,poll.mailbox_id,store.guard(poll),new AbortController().signal);const selectedSeq=(await pool.query("SELECT service_seq FROM runtime_due WHERE kind='poll'")).rows[0].service_seq;await store.finish(poll,'ready',true);const next=(await pool.query("SELECT next_check_at=due_at AND next_check_at<=clock_timestamp() AS ready,service_seq,failure_count FROM runtime_due WHERE kind='poll'")).rows[0];assert.equal(next.ready,true,'complete proof adds no successful-poll sleep');assert.equal(next.service_seq,selectedSeq,'completion retains the selected mailbox turn');assert.equal(next.failure_count,0);
  const peer=await store.claim('pool');assert.ok(peer);await store.finish(peer,'waiting_peer',true);const seconds=Number((await pool.query("SELECT extract(epoch from(next_check_at-clock_timestamp())) AS seconds FROM runtime_due WHERE kind='pool'")).rows[0].seconds);assert.ok(seconds>58&&seconds<=60,'pool opportunity is rechecked within the sixty-second fair round');
  for(const [index,minimum] of [29,59,119,299].entries()){await pool.query("UPDATE runtime_due SET next_check_at=clock_timestamp()-interval '1 second' WHERE kind='poll'");const failed=await store.claim('poll');assert.ok(failed);const age=failed.due_at;await store.finish(failed,'provider_backoff',true);assert.equal((await pool.query("SELECT due_at FROM runtime_due WHERE kind='poll'")).rows[0].due_at.getTime(),age.getTime(),'failure cannot become successful readiness even with a satisfied flag');const row=(await pool.query("SELECT failure_count,extract(epoch from(next_check_at-clock_timestamp())) AS seconds FROM runtime_due WHERE kind='poll'")).rows[0];assert.equal(row.failure_count,index+1);assert.ok(Number(row.seconds)>minimum&&Number(row.seconds)<=minimum+1);}
 }finally{await pool.end();}
});

test('partial and held scans cannot manufacture successful polling readiness',async()=>{const {pool}=await runtimeFixture(1);try{const store=new RuntimeStore(pool);await store.maintenance();for(const reason of ['ready','transport_busy','authority_denied','rescan_incomplete','cleanup_blocked'] as const){await pool.query("UPDATE runtime_due SET state='ready',next_check_at=clock_timestamp()-interval '1 second' WHERE kind='poll'");const claim=await store.claim('poll');assert.ok(claim);await store.finish(claim,reason,true);const row=(await pool.query("SELECT due_at,state,reason FROM runtime_due WHERE kind='poll'")).rows[0];assert.equal(row.due_at.getTime(),claim.due_at.getTime());assert.equal(row.reason,reason);assert.equal(row.state,['rescan_incomplete','cleanup_blocked'].includes(reason)?'blocked':'ready');}}finally{await pool.end();}});

test('dispatch claims project only one sender and rotate deferred candidates',async()=>{const {pool}=await runtimeFixture(30);try{const store=new RuntimeStore(pool);await store.maintenance();await pool.query("UPDATE runtime_due SET next_check_at=clock_timestamp()-interval '1 second' WHERE kind='dispatch'");const originalConnect=pool.connect,projected:string[]=[],perClaim:number[]=[];pool.connect=new Proxy(originalConnect,{apply(target,thisArg,args){return Reflect.apply(target,thisArg,args).then((client:import('pg').PoolClient)=>{const originalQuery=client.query,originalRelease=client.release;client.query=new Proxy(originalQuery,{apply(query,that,arguments_){const text=typeof arguments_[0]==='string'?arguments_[0]:arguments_[0]?.text??'';if(text.includes("UPDATE send_job SET state='queued',reserved_day=NULL"))projected.push(arguments_[1][1]);return Reflect.apply(query,that,arguments_);}});client.release=new Proxy(originalRelease,{apply(release,that,arguments_){client.query=originalQuery;client.release=originalRelease;return Reflect.apply(release,that,arguments_);}});return client;});}});try{for(let i=0;i<5;i++){const before=projected.length;assert.equal(await store.claim('dispatch'),null);perClaim.push(projected.length-before);}}finally{pool.connect=originalConnect;}assert.deepEqual(perClaim,[1,1,1,1,1],'one fresh projection per selected sender');assert.equal(new Set(projected).size,5,'deferred first candidate cannot hide another sender');}finally{await pool.end();}});

test('graceful stop after committed claim releases logical owners before lease expiry',async()=>{
 const {pool}=await runtimeFixture(1);try{
  const store=new RuntimeStore(pool),abort=new AbortController();let operations=0;
  await store.maintenance();
  const claim=store.claim.bind(store);store.claim=async kind=>{const result=await claim(kind);if(result)abort.abort();return result;};
  const operation=async()=>{operations++;return {};};
  await runRuntime(store,{poll:operation,pool:operation,dispatch:operation},abort.signal);
  assert.equal(operations,0);
  assert.equal((await pool.query("SELECT count(*) FROM runtime_due WHERE state='claimed'")).rows[0].count,'0','joined graceful stop must not wait 120s for committed claim');
 }finally{await pool.end();}
});

test('inflight graceful drain joins cleanup and retains explicit holds and fairness',async()=>{
 const {pool}=await runtimeFixture(5);try{
  const store=new RuntimeStore(pool),abort=new AbortController();let started=0,joined=0;const seen:import('../src/runtime/store.js').RuntimeClaim[]=[];
  await store.maintenance();await pool.query("UPDATE runtime_due SET due_at=clock_timestamp()-interval '1 hour'");
  const claim=store.claim.bind(store);store.claim=async kind=>kind==='poll'?claim(kind):null;
  const operation=async(c:import('../src/runtime/store.js').RuntimeClaim,signal:AbortSignal)=>{
   const ordinal=started++;seen.push(c);if(started===4)setImmediate(()=>abort.abort());
   await new Promise<void>(resolve=>signal.addEventListener('abort',()=>setTimeout(resolve,20),{once:true}));joined++;
   return {reason:ordinal===0?'rescan_incomplete' as const:ordinal===1?'cleanup_blocked' as const:'ready' as const,satisfied:true};
  };
  await runRuntime(store,{poll:operation,pool:operation,dispatch:operation},abort.signal);
  assert.equal(started,4);assert.equal(joined,4);
  assert.equal((await pool.query("SELECT count(*) FROM runtime_due WHERE state='claimed'")).rows[0].count,'0');
  for(let i=0;i<seen.length;i++){
   const c=seen[i]!,row=(await pool.query('SELECT * FROM runtime_due WHERE mailbox_id=$1 AND kind=$2',[c.mailbox_id,c.kind])).rows[0];
   assert.equal(row.due_at.getTime(),c.due_at.getTime());assert.equal(row.service_seq,c.service_seq);
   if(i<2){assert.equal(row.state,'blocked');assert.equal(row.reason,i===0?'rescan_incomplete':'cleanup_blocked');}
   assert.equal(await store.cancel(c),0,'cancelled owner cannot mutate released or held row');
  }
  const held=(await pool.query("SELECT mailbox_id,kind FROM runtime_due WHERE reason IN ('rescan_incomplete','cleanup_blocked')")).rows;
  for(let i=0;i<15;i++){const c=await store.claim('poll');if(c){assert.ok(!held.some(r=>r.mailbox_id===c.mailbox_id&&r.kind===c.kind));await store.finish(c);}}
  assert.equal((await pool.query("SELECT count(*) FROM runtime_due WHERE state='blocked' AND reason IN ('rescan_incomplete','cleanup_blocked')")).rows[0].count,'2','restart selection must never auto-retry explicit holds');
 }finally{await pool.end();}
});

test('cancel scopes occupied cleanup to its own protocol without releasing physical ownership',async()=>{
 const {pool,tenant,boxes}=await runtimeFixture(1);try{
  const {acquireTransportSlot,closedOwnerProof,releaseTransportSlot}=await import('../src/mailboxes/transport-slots.js');
  const store=new RuntimeStore(pool);await store.maintenance();const poll=await store.claim('poll'),allocation=await store.claim('pool');assert.ok(poll);assert.ok(allocation);
  const physical=await acquireTransportSlot(pool,'imap',tenant,boxes[0]!);
  assert.equal(await store.cancel(allocation),1);
  assert.equal((await pool.query("SELECT state FROM runtime_due WHERE mailbox_id=$1 AND kind='pool'",[boxes[0]])).rows[0].state,'ready','non-I/O pool cancellation must not inherit sibling IMAP cleanup');
  assert.equal(await store.cancel(poll),1);
  const held=(await pool.query("SELECT * FROM runtime_due WHERE mailbox_id=$1 AND kind='poll'",[boxes[0]])).rows[0];assert.equal(held.state,'blocked');assert.equal(held.reason,'cleanup_blocked');
  assert.equal((await pool.query("SELECT operation FROM transport_operation WHERE protocol='imap' AND slot=$1",[physical.slot])).rows[0].operation,physical.operation,'logical cancellation never clears physical occupancy');
  assert.equal(await store.cancel(poll),0);assert.equal(await store.finish(poll),0);assert.equal(await store.claim('poll'),null,'held same-protocol owner cannot be auto-retried');
  await releaseTransportSlot(pool,closedOwnerProof(physical));
  assert.equal(await store.claim('poll'),null,'later closure alone does not erase an explicit cleanup hold');
 }finally{await pool.end();}
});

test('reset capture fences expected identity provenance tenant holds and transaction rollback',async()=>{
 const {pool,tenant,boxes,config}=await runtimeFixture(1);try{
  const {ReplyStore}=await import('../src/replies/store.js');const {identity}=await import('../src/replies/worker.js');const {validateReadResult}=await import('../src/replies/adapter.js');const store=new ReplyStore(pool,config.credentialKeyring),id=boxes[0]!;
  const proof=(v:string)=>({uidvalidity:v,uidNext:2,observedAt:new Date(),provenance:'local_fixture' as const});let run=await store.capture(tenant,id,proof('1'));
  await assert.rejects(store.capture(randomUUID(),id,proof('2'),undefined,identity(run)));
  await assert.rejects(store.capture(tenant,id,{...proof('2'),provenance:'imap_headers'},undefined,identity(run)));
  const old=run;run=await store.capture(tenant,id,proof('2'),undefined,identity(run));await assert.rejects(store.capture(tenant,id,proof('3'),undefined,identity(old)));assert.deepEqual(await store.status(tenant,id),run);
  await store.failTail(tenant,id,identity(run));await assert.rejects(store.capture(tenant,id,proof('3'),undefined,identity(run)));const held=(await store.status(tenant,id))!;run=await store.retry(tenant,id,identity(held));await assert.rejects(store.capture(tenant,id,proof('3'),undefined,identity(held)));assert.deepEqual(await store.status(tenant,id),run);
  const before=(await pool.query('SELECT * FROM mailbox_poll WHERE mailbox_id=$1',[id])).rows[0];
  await pool.query("CREATE FUNCTION n7_a15_reset_fail() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'reset_injected'; END $$");await pool.query('CREATE TRIGGER n7_a15_reset_fail BEFORE UPDATE ON reply_rescan FOR EACH ROW EXECUTE FUNCTION n7_a15_reset_fail()');
  await assert.rejects(store.capture(tenant,id,proof('3'),undefined,identity(run)));assert.deepEqual(await store.status(tenant,id),run);assert.deepEqual((await pool.query('SELECT * FROM mailbox_poll WHERE mailbox_id=$1',[id])).rows[0],before);
  await pool.query('DROP TRIGGER n7_a15_reset_fail ON reply_rescan');await pool.query('DROP FUNCTION n7_a15_reset_fail()');
  for(const result of [{kind:'unknown'}, {kind:'uidvalidity_changed',snapshot:proof('2')},{kind:'uidvalidity_changed',snapshot:{...proof('3'),provenance:'imap_headers'}}])assert.throws(()=>validateReadResult(result,'2','local_fixture'));
 }finally{await pool.query('DROP TRIGGER IF EXISTS n7_a15_reset_fail ON reply_rescan');await pool.query('DROP FUNCTION IF EXISTS n7_a15_reset_fail()');await pool.end();}
});


test('native poll claim reserves physical admission atomically across competing processes',async()=>{
 const {pool,boxes}=await runtimeFixture();const {consumePreadmittedSlot,releaseUnusedTransportSlot}=await import('../src/mailboxes/transport-slots.js');
 const reservations:{store:RuntimeStore;claim:import('../src/runtime/store.js').RuntimeClaim}[]=[];
 try{
  const authority=async()=>{};const stores=Array.from({length:5},()=>new RuntimeStore(pool,authority));await stores[0]!.maintenance();
  await pool.query("UPDATE runtime_due SET due_at=clock_timestamp()-CASE WHEN mailbox_id=$1 THEN interval '1 minute' ELSE interval '2 minutes' END WHERE kind='poll'",[boxes[4]]);
  const before=(await pool.query("SELECT mailbox_id,due_at FROM runtime_due WHERE kind='poll' ORDER BY mailbox_id")).rows;
  const first=await Promise.all(stores.slice(0,4).map(s=>s.claim('poll')));for(let i=0;i<first.length;i++)if(first[i])reservations.push({store:stores[i]!,claim:first[i]!});assert.ok(first.every(Boolean));assert.equal(new Set(first.map(c=>c!.mailbox_id)).size,4);assert.ok(first.every(c=>c!.mailbox_id!==boxes[4]));
  assert.equal((await pool.query("SELECT count(*) FROM transport_operation WHERE protocol='imap' AND operation IS NOT NULL")).rows[0].count,'4');
  for(let i=0;i<4;i++)assert.equal(first[i]!.owner_id,stores[i]!.pollAdmission(first[i]!)!.slot!.operation,'fresh native reservation binds logical owner atomically');
  const ranks=(await pool.query("SELECT mailbox_id,service_seq,owner_id FROM runtime_due WHERE kind='poll' ORDER BY mailbox_id")).rows;assert.equal(await stores[4]!.claim('poll'),null);assert.deepEqual((await pool.query("SELECT mailbox_id,service_seq,owner_id FROM runtime_due WHERE kind='poll' ORDER BY mailbox_id")).rows,ranks,'full physical capacity commits no turn or claim');
  const released=first[2]!;await stores[2]!.cancel(released);const restart=new RuntimeStore(pool,authority),e=await restart.claim('poll');assert.ok(e);assert.equal(e.mailbox_id,boxes[4],'later due E receives released slot before any old second selection');const slot=restart.pollAdmission(e)!.slot!;assert.equal(slot.mailbox,e.mailbox_id);consumePreadmittedSlot(slot,e.tenant_id,e.mailbox_id);assert.throws(()=>consumePreadmittedSlot(slot,e.tenant_id,e.mailbox_id));await restart.cancel(e);
  for(let i=0;i<4;i++)if(i!==2)await stores[i]!.cancel(first[i]!);
  assert.equal((await pool.query('SELECT count(*) FROM transport_operation WHERE operation IS NOT NULL')).rows[0].count,'0');
  assert.deepEqual((await pool.query("SELECT mailbox_id,due_at FROM runtime_due WHERE kind='poll' ORDER BY mailbox_id")).rows,before,'unsatisfied original due survives cleanup and restart');
  const denied=new RuntimeStore(pool,async()=>{throw new (await import('../src/errors.js')).HttpError(503,'transport_denied');});const claim=await denied.claim('poll');assert.ok(claim);assert.equal(denied.pollAdmission(claim)!.reason,'authority_denied');assert.ok(first.every((c,i)=>claim.owner_id!==stores[i]!.pollAdmission(c!)!.slot!.operation),'denied admission never copies a native operation');await denied.finish(claim,'authority_denied');assert.equal((await pool.query('SELECT count(*) FROM transport_operation WHERE operation IS NOT NULL')).rows[0].count,'0');
  // A stale physical operation cannot become the owner of a transport-busy replacement.
  await pool.query("UPDATE runtime_due SET next_check_at=clock_timestamp() WHERE kind='poll'");
  const occupied=new RuntimeStore(pool,authority),old=await occupied.claim('poll');assert.ok(old);reservations.push({store:occupied,claim:old});const oldSlot=occupied.pollAdmission(old)!.slot!;
  await pool.query("UPDATE runtime_due SET lease_until=clock_timestamp()-interval '1 second' WHERE mailbox_id=$1 AND kind='poll'",[old.mailbox_id]);
  await pool.query("UPDATE runtime_due SET next_check_at=clock_timestamp()+interval '1 minute' WHERE kind='poll' AND mailbox_id<>$1",[old.mailbox_id]);
  const replacementStore=new RuntimeStore(pool,authority),replacement=await replacementStore.claim('poll');assert.ok(replacement);reservations.push({store:replacementStore,claim:replacement});assert.equal(replacementStore.pollAdmission(replacement)!.reason,'transport_busy');assert.notEqual(replacement.owner_id,oldSlot.operation);assert.notEqual(replacement.generation,old.generation);
  assert.equal(await occupied.finish(old),0);assert.equal(await occupied.cancel(old),0);await replacementStore.finish(replacement,'transport_busy');
  const localStore=new RuntimeStore(pool),local=await localStore.claim('pool');assert.ok(local);assert.notEqual(local.owner_id,oldSlot.operation);await localStore.finish(local);
  await pool.query("UPDATE runtime_due SET next_check_at=clock_timestamp() WHERE kind='poll'");const localPoll=await localStore.claim('poll');assert.ok(localPoll);assert.equal(localStore.pollAdmission(localPoll),undefined);await localStore.cancel(localPoll);
  // Force a real SQL transaction to fail AFTER its physical reservation update.
  const wrapped={async connect(){const c=await pool.connect();return {query:async(sql:string,args?:unknown[])=>{if(sql.startsWith("UPDATE runtime_due SET state='claimed'"))throw new Error('injected claim failure');return c.query(sql,args);},release:()=>c.release()};}} as unknown as import('pg').Pool;
  const rollbackRanks=(await pool.query("SELECT mailbox_id,service_seq,owner_id FROM runtime_due WHERE kind='poll' ORDER BY mailbox_id")).rows;
  await assert.rejects(new RuntimeStore(wrapped,authority).claim('poll'),/injected claim failure/);assert.deepEqual((await pool.query("SELECT mailbox_id,service_seq,owner_id FROM runtime_due WHERE kind='poll' ORDER BY mailbox_id")).rows,rollbackRanks);assert.equal((await pool.query('SELECT count(*) FROM transport_operation WHERE operation IS NOT NULL')).rows[0].count,'0');
  assert.equal(await releaseUnusedTransportSlot(pool,slot),false);
  // Abort after COMMIT must dispose the reserved slot without invoking any operation.
  const abort=new AbortController();const committed=new RuntimeStore(pool,authority);let operations=0;const claimMethod=committed.claim.bind(committed);
  committed.claim=async kind=>{const next=await claimMethod(kind);if(next)abort.abort();return next;};
  const operation=async()=>{operations++;return {};};await runRuntime(committed,{poll:operation,pool:operation,dispatch:operation},abort.signal,true);assert.equal(operations,0);assert.equal((await pool.query('SELECT count(*) FROM transport_operation WHERE operation IS NOT NULL')).rows[0].count,'0');
 }finally{for(const owned of reservations.reverse())await owned.store.cancel(owned.claim);await pool.end();}
});


test('F11 FIFO HEADER preference retains urgent fairness and exact bounded admission gates',async()=>{
 const {seedBodyPressureCohort}=await import('./f10-runtime-process-fixture.js'),{enqueueCaptureClient,captureHeaderFrontierClient,captureHeaderContextClient}=await import('../src/replies/context-store.js'),{authorizeTransport}=await import('../src/mailboxes/transport-authority.js');
 const {createPool}=await import('../src/db.js'),{loadConfig}=await import('../src/config.js'),pre=createPool(loadConfig().databaseUrl);try{const facts=(await pre.query("SELECT current_schema() schema,(SELECT count(*)::int FROM transport_operation WHERE operation IS NOT NULL) physical,(SELECT count(*)::int FROM runtime_due WHERE state='claimed') runtime")).rows[0];assert.equal(facts.schema,process.env.N7_TEST_SCHEMA);assert.equal(facts.physical,0);assert.equal(facts.runtime,0);}finally{await pre.end();}
 const empty=await runtimeFixture(0);await empty.pool.end();
 const c=await seedBodyPressureCohort(),targets=c.participants.slice(0,4),ordinary=c.participants[4]!;
 const runtime=new RuntimeStore(c.pool,(client,t,m)=>authorizeTransport(client,c.config,t,m,'imap_headers'),c.config);
 const ownedClaims:import('../src/runtime/store.js').RuntimeClaim[]=[],claimOriginal=runtime.claim.bind(runtime);runtime.claim=async kind=>{const claim=await claimOriginal(kind);if(claim)ownedClaims.push(claim);return claim;};
 try{
  await runtime.maintenance();
  for(const target of targets)await eligibilityTransaction(c.pool,client=>enqueueCaptureClient(client,{tenant:target.tenant,mailbox:target.mailbox,uidvalidity:'1',uid:1,runId:randomUUID(),attempt:1,source:'imap_headers',observedAt:new Date(),enrollment:target.enrollment,root:target.root,sender:target.recipient}));
  await c.pool.query("INSERT INTO mailbox_poll(mailbox_id,scan_complete,completed_at) SELECT mailbox_id,true,clock_timestamp() FROM capacity_lease WHERE state='active' ON CONFLICT(mailbox_id) DO UPDATE SET completed_at=EXCLUDED.completed_at");
  await c.pool.query("UPDATE runtime_due SET service_seq=100,next_check_at=clock_timestamp() WHERE kind='poll'");await c.pool.query("UPDATE runtime_due SET service_seq=0 WHERE kind='poll' AND mailbox_id=$1",[ordinary.mailbox]);
  const expected=targets.slice(0,3).map(t=>({tenant:t.tenant,mailbox:t.mailbox}));
  assert.deepEqual(await eligibilityTransaction(c.pool,client=>captureHeaderFrontierClient(client,c.config)),expected);
  const selected=await runtime.claim('poll');assert.ok(selected);await runtime.cancel(selected);assert.ok(expected.some(t=>t.mailbox===selected.mailbox_id),'genuine frontier HEADER must beat older ordinary service');
  const turns=(await c.pool.query("SELECT d.service_seq mailbox,t.service_seq tenant FROM runtime_due d JOIN runtime_tenant_turn t ON t.tenant_id=d.tenant_id AND t.kind=d.kind WHERE d.mailbox_id=$1 AND d.kind='poll'",[selected.mailbox_id])).rows[0];assert.notEqual(Number(turns.mailbox),100);assert.ok(Number(turns.tenant)>0);assert.equal(selected.owner_id,runtime.pollAdmission(selected)!.slot!.operation);
  const second=await runtime.claim('poll');assert.ok(second);assert.notEqual(second.mailbox_id,selected.mailbox_id,'unserved frontier peer retains tenant/mailbox turn priority');await runtime.cancel(second);
  await c.pool.query("UPDATE mailbox_poll SET completed_at=clock_timestamp()-interval '26 seconds' WHERE mailbox_id=$1",[ordinary.mailbox]);
  const urgent=await runtime.claim('poll');assert.ok(urgent);assert.equal(urgent.mailbox_id,ordinary.mailbox);await runtime.cancel(urgent);
  await c.pool.query('UPDATE mailbox_poll SET completed_at=NULL WHERE mailbox_id=$1',[ordinary.mailbox]);const missing=await runtime.claim('poll');assert.ok(missing);assert.equal(missing.mailbox_id,ordinary.mailbox);await runtime.cancel(missing);
  // Material selection witness: actual urgent age beats an older ordinary turn
  // while admitted pressure disables only the first-window frontier.
  for(const pressure of ['three windows','continuation']){
   await c.pool.query("UPDATE mailbox_poll SET completed_at=clock_timestamp()");
   await c.pool.query("UPDATE mailbox_poll SET completed_at=clock_timestamp()-interval '26 seconds' WHERE mailbox_id=$1",[targets[0]!.mailbox]);
   await c.pool.query("UPDATE runtime_tenant_turn SET service_seq=0 WHERE kind='poll'");
   await c.pool.query("UPDATE runtime_due SET service_seq=100 WHERE kind='poll'");
   await c.pool.query("UPDATE runtime_due SET service_seq=0 WHERE kind='poll' AND mailbox_id=$1",[ordinary.mailbox]);
   const admitted=pressure==='three windows'?targets.slice(1,4):targets.slice(1,2);
   await c.pool.query("UPDATE incoming_ai_event SET window_start=statement_timestamp(),window_end=statement_timestamp()+interval '12 seconds',window_completed_at=statement_timestamp(),window_revision='1',window_mailbox_revision='0' WHERE mailbox_id=ANY($1::uuid[])",[admitted.map(p=>p.mailbox)]);
   assert.deepEqual(await eligibilityTransaction(c.pool,client=>captureHeaderFrontierClient(client,c.config)),[],pressure);
   assert.equal(await eligibilityTransaction(c.pool,client=>captureHeaderContextClient(client,c.config)),true,pressure);
   const beforeEvents=(await c.pool.query('SELECT * FROM incoming_ai_event ORDER BY id')).rows;
   const beforeProof=(await c.pool.query('SELECT * FROM mailbox_poll ORDER BY mailbox_id')).rows;
   const beforeDue=(await c.pool.query("SELECT mailbox_id,due_at,next_check_at FROM runtime_due WHERE kind='poll' ORDER BY mailbox_id")).rows;
   const selected=await runtime.claim('poll');assert.ok(selected);assert.equal(selected.mailbox_id,targets[0]!.mailbox,'urgent HEADER survives empty frontier '+pressure);await runtime.cancel(selected);
   assert.deepEqual((await c.pool.query('SELECT * FROM incoming_ai_event ORDER BY id')).rows,beforeEvents,'selection never admits or changes BODY');
   assert.deepEqual((await c.pool.query('SELECT * FROM mailbox_poll ORDER BY mailbox_id')).rows,beforeProof,'selection never manufactures completion');
   assert.deepEqual((await c.pool.query("SELECT mailbox_id,due_at,next_check_at FROM runtime_due WHERE kind='poll' ORDER BY mailbox_id")).rows,beforeDue,'no phantom twelve-second deferral');
   await c.pool.query('UPDATE incoming_ai_event SET window_start=NULL,window_end=NULL,window_completed_at=NULL,window_revision=NULL,window_mailbox_revision=NULL');
  }
  // All candidates in one urgency tier still consume both ordinary fair turns.
  await c.pool.query('UPDATE mailbox_poll SET completed_at=NULL');await c.pool.query("UPDATE runtime_tenant_turn SET service_seq=0 WHERE kind='poll'");await c.pool.query("UPDATE runtime_due SET service_seq=0 WHERE kind='poll'");
  const fair:string[]=[];for(let i=0;i<5;i++){const claim=await runtime.claim('poll');assert.ok(claim);fair.push(claim.mailbox_id);await runtime.cancel(claim);}assert.equal(new Set(fair).size,5,'urgent tier serves unserved peer before any second quantum');
  const client=await c.pool.connect();try{await client.query('BEGIN');await client.query('SELECT pg_advisory_xact_lock(7,1)');
   for(const [name,sql,args] of [
    ['BODY grant',"UPDATE transport_grant SET scope=jsonb_set(scope,'{capabilities}','[\"imap_headers\"]')",[]],
    ['revoked grant',"UPDATE transport_grant SET state='revoked',scope=NULL",[]],
    ['HEADER grant',"UPDATE transport_grant SET scope=jsonb_set(scope,'{capabilities}','[\"imap_body\"]')",[]],
    ['recipient',"UPDATE incoming_ai_event SET authenticated_recipient_hash=repeat('0',64)",[]],
    ['attempt expiry',"UPDATE incoming_ai_event SET attempt_deadline=clock_timestamp()-interval '1 second'",[]],
    ['expired grant',"UPDATE transport_grant SET scope=jsonb_set(scope,'{expiresAt}',to_jsonb((clock_timestamp()-interval '1 second')::text))",[]],
    ['suppression',"INSERT INTO suppression(tenant_id,recipient_hash,reason) SELECT tenant_id,authenticated_recipient_hash,'unsubscribe' FROM incoming_ai_event",[]],
    ['root',"UPDATE incoming_ai_event SET authenticated_root_message_id='<wrong@example.test>'",[]],
    ['sender',"UPDATE incoming_ai_event SET sender_binding=repeat('0',64)",[]],
    ['recipient AAD',"UPDATE enrollment n SET recipient_envelope=(SELECT other.recipient_envelope FROM enrollment other WHERE other.id<>n.id ORDER BY other.id LIMIT 1)",[]],
    ['recipient AEAD',"UPDATE enrollment SET recipient_envelope='{}'::jsonb",[]],
    ['activity',"UPDATE capacity_lease SET state='waiting_capacity',expires_at=NULL",[]],
    ['TTL',"UPDATE incoming_ai_event SET expires_at=clock_timestamp()-interval '1 second'",[]],
    ['continuation',"UPDATE incoming_ai_event SET window_start=statement_timestamp(),window_end=statement_timestamp()+interval '12 seconds',window_completed_at=statement_timestamp(),window_revision='1',window_mailbox_revision='0' WHERE mailbox_id=$1",[targets[3]!.mailbox]],
    ['three windows',"UPDATE incoming_ai_event SET capture_state='claimed',owner_id=gen_random_uuid(),lease_until=clock_timestamp()+interval '12 seconds',window_start=statement_timestamp(),window_end=statement_timestamp()+interval '12 seconds',window_completed_at=statement_timestamp(),window_revision='1',window_mailbox_revision='0' WHERE mailbox_id=ANY($1::uuid[])",[targets.slice(0,3).map(t=>t.mailbox)]],
    ['ordinary capacity',"UPDATE transport_operation SET operation=gen_random_uuid(),tenant_id=$1,mailbox_id=($2::uuid[])[slot],owner_process=gen_random_uuid(),owner_host='test',expires_at=clock_timestamp()+interval '1 minute',operation_purpose='header' WHERE protocol='imap' AND NOT header_reserved",[ordinary.tenant,[1,4,7,10].map(i=>c.participants[i]!.mailbox)]],
    ['BODY UNKNOWN cap',"UPDATE transport_operation SET operation=gen_random_uuid(),tenant_id=$1,mailbox_id=($2::uuid[])[slot],owner_process=gen_random_uuid(),owner_host='test',expires_at=clock_timestamp()+interval '1 minute',operation_purpose=NULL WHERE protocol='imap' AND slot>=2",[ordinary.tenant,[1,4,7,10].map(i=>c.participants[i]!.mailbox)]],
    ['missing reservation',"UPDATE transport_operation SET header_reserved=false",[]],
   ] as [string,string,unknown[]][]){await client.query('SAVEPOINT gate');await client.query(sql,args);assert.deepEqual(await captureHeaderFrontierClient(client,c.config),[],name);assert.equal(await captureHeaderContextClient(client,c.config),['continuation','three windows','ordinary capacity','BODY UNKNOWN cap','missing reservation'].includes(name),'context '+name);await client.query('ROLLBACK TO SAVEPOINT gate');}
   await client.query("UPDATE transport_grant SET scope=jsonb_set(scope,'{capabilities}','[\"imap_headers\"]') WHERE mailbox_id=ANY($1::uuid[])",[targets.slice(0,3).map(t=>t.mailbox)]);assert.deepEqual(await captureHeaderFrontierClient(client,c.config),[],'do not promote fourth past denied oldest three');
   assert.equal(await captureHeaderContextClient(client,c.config),false,'no fourth unwindowed promotion');
   await client.query("UPDATE incoming_ai_event SET window_start=statement_timestamp(),window_end=statement_timestamp()+interval '12 seconds',window_completed_at=statement_timestamp(),window_revision='1',window_mailbox_revision='0' WHERE mailbox_id=$1",[targets[3]!.mailbox]);assert.equal(await captureHeaderContextClient(client,c.config),true,'genuine admitted fourth remains context without frontier');
   await client.query("UPDATE transport_grant SET state='revoked',scope=NULL WHERE mailbox_id=$1",[targets[3]!.mailbox]);assert.equal(await captureHeaderContextClient(client,c.config),false,'revoked admitted context remains denied');
   assert.deepEqual(await captureHeaderFrontierClient(client,{...c.config,pollMode:'local_test'}),[]);assert.equal(await captureHeaderContextClient(client,{...c.config,pollMode:'local_test'}),false);
  }finally{await client.query('ROLLBACK');client.release();}
  const legacy=new RuntimeStore(c.pool,(client,t,m)=>authorizeTransport(client,c.config,t,m,'imap_headers'));await c.pool.query("UPDATE runtime_due SET service_seq=100 WHERE kind='poll'");await c.pool.query("UPDATE runtime_due SET service_seq=0 WHERE kind='poll' AND mailbox_id=$1",[ordinary.mailbox]);await c.pool.query("UPDATE runtime_tenant_turn SET service_seq=0 WHERE kind='poll'");const normal=await legacy.claim('poll');assert.ok(normal);assert.equal(normal.mailbox_id,ordinary.mailbox);await legacy.cancel(normal);
  assert.equal((await c.pool.query('SELECT count(*) FROM incoming_ai_event WHERE window_start IS NOT NULL')).rows[0].count,'0');assert.equal((await c.pool.query('SELECT count(*) FROM transport_operation WHERE operation IS NOT NULL')).rows[0].count,'0');
 }finally{for(const owned of ownedClaims.reverse())await runtime.cancel(owned);const claims=(await c.pool.query("SELECT * FROM runtime_due WHERE state='claimed'")).rows;for(const owned of claims)await runtime.cancel(owned);await c.pool.query('TRUNCATE tenant CASCADE');await c.pool.end();}
});


test('native joint snapshot validates observation provenance and order without inventing missing evidence',async()=>{
 const {validateReadResult}=await import('../src/replies/adapter.js');const now=new Date(),page={uidvalidity:'1',coveredThrough:1,headers:[],startedAt:new Date(now.getTime()-10),completedAt:now},snapshot={uidvalidity:'1',uidNext:2,observedAt:new Date(now.getTime()-5),provenance:'imap_headers' as const};
 assert.equal(validateReadResult({kind:'page',page},'1','imap_headers').kind,'page');
 assert.equal((validateReadResult({kind:'page',page,snapshot},'1','imap_headers') as {snapshot:unknown}).snapshot,snapshot);
 for(const mutation of [{...snapshot,uidNext:1},{...snapshot,uidvalidity:'2'},{...snapshot,provenance:'local_fixture'},{...snapshot,observedAt:new Date(now.getTime()+1)},{...snapshot,observedAt:new Date(now.getTime()-11)}])assert.throws(()=>validateReadResult({kind:'page',page,snapshot:mutation},'1','imap_headers'));
});
