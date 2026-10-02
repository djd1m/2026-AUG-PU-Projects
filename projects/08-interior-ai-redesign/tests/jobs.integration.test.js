import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes,randomUUID } from 'node:crypto';
import { mkdtemp,writeFile,readFile,rm,utimes,mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import pg from 'pg';
import { createPool,transaction } from '../web/db.js';
import { createJobs } from '../web/jobs.js';
import { createApp } from '../web/app.js';
import { tokenHash } from '../web/auth.js';
import { migrate } from '../scripts/migrate.js';
import { prepareStorage } from '../web/media.js';
import { cleanupDeleted,prepareOutputStorage,sweepOutputs } from '../scripts/maintenance.js';
import { fixtureOutput } from './job-fixtures.js';

// Isolated PostgreSQL16 schema, no mock DB; no external inference/provider call.
test('F02a real PostgreSQL durable queue, budget, deadlines, fencing and owner APIs',async t=>{
  if (!process.env.TEST_DATABASE_URL || process.env.N8_TEST_DB_OWNERSHIP!=='n8-f02a') throw new Error('Dedicated F02a PostgreSQL URL and ownership assertion required');
  const db=new URL(process.env.TEST_DATABASE_URL);
  if (!['localhost','127.0.0.1','[::1]','db'].includes(db.hostname)) throw new Error('Dedicated local/internal database required');
  const admin=new pg.Pool({connectionString:db.href,max:2,connectionTimeoutMillis:2000});
  const schema='f02a_'+randomBytes(8).toString('hex'); let pool,dir,server;
  let now;const config={platformDailyLimit:200,accountDailyLimit:20,runtime:'test'};
  try {
    assert.match((await admin.query('SHOW server_version')).rows[0].server_version,/^16\./);
    await admin.query(`CREATE SCHEMA ${schema}`); db.searchParams.set('options',`-c search_path=${schema}`);
    pool=createPool(db.href);await migrate(pool);await migrate(pool);
    dir=await mkdtemp(join(tmpdir(),'n8-f02a-'));await prepareStorage(dir);await prepareOutputStorage(dir);
    const jobs=(limits={})=>createJobs(pool,{...config,...limits},{trustedClock:()=>now});
    async function reset() {await pool.query('TRUNCATE account, attempt_budget CASCADE');now=new Date('2026-10-02T12:00:00Z');}
    async function owner(credits=5) {
      const id=randomUUID(),upload=randomUUID();
      await pool.query('INSERT INTO account(id,email,password_hash) VALUES($1,$2,$3)',[id,id+'@example.test','synthetic-unused-hash']);
      await pool.query("INSERT INTO credit_ledger(id,account_id,delta,kind,reference) VALUES($1,$2,$3,'purchase',$4)",[randomUUID(),id,credits,randomUUID()]);
      await pool.query("INSERT INTO upload(id,account_id,private_key,sha256,width,height,mime) VALUES($1,$2,$1,$3,1,1,'image/webp')",[upload,id,'a'.repeat(64)]);
      return {id,upload};
    }
    const body=(o,key=randomUUID(),style='warm')=>({upload_id:o.upload,style,idempotency_key:key});
    const row=async id=>(await pool.query('SELECT * FROM job WHERE id=$1',[id])).rows[0];
    const count=async(sql,params=[])=>(await pool.query(sql,params)).rows[0].n;
    const releases=id=>count("SELECT count(*)::int AS n FROM credit_ledger WHERE kind='release' AND reference=$1",[id]);
    const advance=ms=>{now=new Date(now.getTime()+ms);};
    async function start(q,o){const r=await q.reserve(o.id,body(o));const claim=await q.claim();assert.equal(claim.job_id,r.job_id);return claim;}

    await t.test('JOB-01 same-key concurrent replay and changed body conflict have one effect even at caps/hold',async()=>{
      await reset();const o=await owner(1),q=jobs({platformDailyLimit:1,accountDailyLimit:1}),b=body(o);
      const results=await Promise.all(Array.from({length:8},()=>q.reserve(o.id,b)));
      assert.equal(new Set(results.map(r=>r.job_id)).size,1);
      assert.equal(await count('SELECT count(*)::int AS n FROM job'),1);
      await pool.query('UPDATE account SET billing_hold=true WHERE id=$1',[o.id]);
      assert.deepEqual(await q.reserve(o.id,b),results[0]);
      await assert.rejects(q.reserve(o.id,{...b,style:'minimal'}),e=>e.status===409);
      assert.equal(await count("SELECT sum(count)::int AS n FROM attempt_budget"),2);
      assert.equal(await count("SELECT count(*)::int AS n FROM credit_ledger WHERE kind='reserve'"),1);
    });
    await t.test('JOB-01/02 style and wrong owner upload cannot reserve; last credit concurrent race',async()=>{
      await reset();const o=await owner(1),other=await owner(),q=jobs();
      await assert.rejects(q.reserve(other.id,body(o)),e=>e.status===404);
      await assert.rejects(q.reserve(o.id,body(o,randomUUID(),'invalid')),e=>e.status===400);
      const results=await Promise.allSettled(Array.from({length:8},()=>q.reserve(o.id,body(o))));
      assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
      assert.equal(await count('SELECT sum(delta)::int AS n FROM credit_ledger WHERE account_id=$1',[o.id]),0);
      assert.equal(await count('SELECT sum(count)::int AS n FROM attempt_budget'),2);
    });
    await t.test('PERF-01 platform last ticket concurrent admission changes both buckets atomically',async()=>{
      await reset();const a=await owner(),b=await owner(),q=jobs({platformDailyLimit:1,accountDailyLimit:1});
      const results=await Promise.allSettled([q.reserve(a.id,body(a)),q.reserve(b.id,body(b))]);
      assert.equal(results.filter(r=>r.status==='fulfilled').length,1,'SEC-03 budget last slot admits exactly one');
      assert.equal(results.find(r=>r.status==='rejected').reason.status,429);
      assert.equal(await count('SELECT sum(count)::int AS n FROM attempt_budget'),2);
      assert.equal(await count('SELECT count(*)::int AS n FROM job'),1);
    });
    await t.test('PERF-01 account last ticket concurrent admission rolls back platform and credit',async()=>{
      await reset();const o=await owner(),q=jobs({accountDailyLimit:1});
      const results=await Promise.allSettled([q.reserve(o.id,body(o)),q.reserve(o.id,body(o))]);
      assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
      assert.equal(await count('SELECT sum(count)::int AS n FROM attempt_budget'),2);
      assert.equal(await count('SELECT sum(delta)::int AS n FROM credit_ledger WHERE account_id=$1',[o.id]),4);
    });
    await t.test('JOB-03 first same-day claim reuses ticket; concurrent workers cannot double start',async()=>{
      await reset();const o=await owner(),q=jobs();await q.reserve(o.id,body(o));
      const claims=await Promise.all(Array.from({length:8},()=>q.claim()));
      const active=claims.filter(Boolean);assert.equal(active.length,1);assert.equal(active[0].attempt,1);
      assert.equal(await count('SELECT sum(count)::int AS n FROM attempt_budget'),2);
      assert.equal(await count('SELECT count(*)::int AS n FROM attempt_ticket WHERE consumed_at IS NOT NULL'),1);
      assert.equal(active[0].attempt_deadline-now,180000);assert.equal(active[0].lease_until-now,30000);
    });
    await t.test('JOB-04 retry consumes new capacity and max two starts; duplicate/stale failures release once',async()=>{
      await reset();const o=await owner(),q=jobs(),a=await start(q,o);
      assert.equal(await q.fail(a.job_id,a.fence,{retryable:true}),true);
      const b=await q.claim();assert.equal(b.attempt,2);assert.ok(b.fence>a.fence);
      assert.equal(await count('SELECT sum(count)::int AS n FROM attempt_budget'),4);
      assert.equal(await q.complete(a.job_id,a.fence,fixtureOutput()),false);
      assert.equal(await q.fail(a.job_id,a.fence),false);
      const failures=await Promise.all([q.fail(b.job_id,b.fence,{retryable:true}),q.fail(b.job_id,b.fence)]);
      assert.equal(failures.filter(Boolean).length,1);assert.equal(await q.claim(),null);
      assert.equal(await releases(a.job_id),1);assert.equal((await row(a.job_id)).attempts,2);
      assert.equal(await count('SELECT count(*)::int AS n FROM generation_evidence'),0);
    });
    await t.test('JOB-04 absent reserve cannot credit; actual reserve releases exactly once across repeated operations',async()=>{
      for(const reserved of [false,true]) {
        await reset();const o=await owner(),q=jobs();let id;
        if(reserved) id=(await q.reserve(o.id,body(o))).job_id;
        else {
          // Inconsistent reserved=true fixture exercises the ledger guard, not an early boolean return.
          id=randomUUID();
          await pool.query(`INSERT INTO job(id,account_id,upload_id,style,idempotency_key,request_hash,created_at,queue_deadline,hard_deadline)
            VALUES($1,$2,$3,'warm',$4,$5,$6,$7,$8)`,[id,o.id,o.upload,randomUUID(),'0'.repeat(64),now,
            new Date(now.getTime()+60000),new Date(now.getTime()+360000)]);
        }
        assert.equal((await row(id)).reserved,true);
        assert.equal(await count("SELECT count(*)::int AS n FROM credit_ledger WHERE kind='reserve' AND reference=$1",[id]),reserved?1:0);
        advance(60000);
        assert.equal((await q.get(o.id,id)).status,'failed');await q.get(o.id,id);await q.maintenance();
        await q.deleteUpload(o.id,o.upload);
        assert.equal(await releases(id),reserved?1:0);
        assert.equal(await count('SELECT sum(delta)::int AS n FROM credit_ledger WHERE account_id=$1',[o.id]),5);
        assert.equal((await row(id)).reserved,false);
        assert.equal((await row(id)).failure_reason,'queue_expired');
      }
    });
    await t.test('JOB-04 retry budget exhaustion terminal release does not refund tickets',async()=>{
      for(const limits of [{accountDailyLimit:1},{platformDailyLimit:1,accountDailyLimit:1}]) {
        await reset();const o=await owner(),q=jobs(limits),a=await start(q,o);
        await q.fail(a.job_id,a.fence,{retryable:true});assert.equal(await q.claim(),null);
        assert.equal((await row(a.job_id)).failure_reason,'budget_exhausted');assert.equal(await releases(a.job_id),1);
        assert.equal(await count('SELECT sum(count)::int AS n FROM attempt_budget'),2);
      }
    });
    await t.test('PERF-02 UTC rollover replaces unstarted old ticket; exhaustion releases once',async()=>{
      for(const exhausted of [false,true]) {
        await reset();now=new Date('2026-10-02T23:59:50Z');const o=await owner(),q=jobs({platformDailyLimit:1,accountDailyLimit:1});
        const r=await q.reserve(o.id,body(o));advance(20000);
        if(exhausted) await pool.query("INSERT INTO attempt_budget(bucket,owner,day,count) VALUES('platform','platform','2026-10-03',1)");
        const a=await q.claim();
        assert.equal(await count("SELECT sum(count)::int AS n FROM attempt_budget WHERE day='2026-10-02'"),2);
        if(exhausted) {assert.equal(a,null);assert.equal(await releases(r.job_id),1);}
        else {
          assert.equal(a.job_id,r.job_id);assert.equal(await count('SELECT count(*)::int AS n FROM attempt_ticket'),2);
          assert.equal(await count('SELECT count(*)::int AS n FROM attempt_ticket WHERE superseded'),1);
          assert.equal(await count("SELECT sum(count)::int AS n FROM attempt_budget WHERE day='2026-10-03'"),2);
        }
      }
    });
    await t.test('JOB-03 queue expires at exactly 60s and repeated maintenance releases once',async()=>{
      await reset();const o=await owner(),q=jobs(),r=await q.reserve(o.id,body(o));advance(59999);
      await q.maintenance();assert.equal((await row(r.job_id)).status,'queued');advance(1);
      await q.maintenance();await q.maintenance();assert.equal(await q.claim(),null);
      assert.equal((await row(r.job_id)).failure_reason,'queue_expired');assert.equal(await releases(r.job_id),1);
    });
    await t.test('JOB-03 healthy 10s heartbeats cannot extend attempt 180s or absolute job 360s',async()=>{
      await reset();const o=await owner(),q=jobs(),a=await start(q,o);
      for(let i=0;i<17;i++){advance(10000);assert.equal(await q.heartbeat(a.job_id,a.fence),true);}
      assert.equal((await row(a.job_id)).attempt_deadline-a.attempt_deadline,0);
      advance(10000);assert.equal(await q.heartbeat(a.job_id,a.fence),false);assert.equal(await q.complete(a.job_id,a.fence,fixtureOutput()),false);
      const b=await q.claim();assert.equal(b.attempt,2);assert.equal(b.attempt_deadline-b.hard_deadline,0);
      for(let i=0;i<17;i++){advance(10000);assert.equal(await q.heartbeat(b.job_id,b.fence),true);}
      advance(10000);assert.equal(await q.complete(b.job_id,b.fence,fixtureOutput()),false);
      await q.maintenance();assert.equal((await row(a.job_id)).failure_reason,'hard_deadline');assert.equal(await releases(a.job_id),1);
    });
    await t.test('JOB-04 lease boundary fences expired attempt before retry; no late attach or release',async()=>{
      await reset();const o=await owner(),q=jobs(),a=await start(q,o);advance(30000);
      assert.equal(await q.heartbeat(a.job_id,a.fence),false);assert.equal(await q.complete(a.job_id,a.fence,fixtureOutput()),false);
      const b=await q.claim();assert.equal(b.attempt,2);assert.ok(b.fence>a.fence);
      assert.equal(await q.complete(a.job_id,a.fence,fixtureOutput()),false);assert.equal(await releases(a.job_id),0);
      assert.equal(await q.complete(b.job_id,b.fence,fixtureOutput()),true);
      assert.equal(await q.complete(b.job_id,b.fence,fixtureOutput()),false);
      assert.equal((await row(a.job_id)).quality,'unverified');assert.equal(await releases(a.job_id),0);
      await assert.rejects(pool.query('UPDATE generation_evidence SET seed=2 WHERE job_id=$1',[a.job_id]),/immutable/);
    });
    await t.test('Completion persists canonical sd/controlnet/depth revisions without invoking supplied toJSON',async()=>{
      await reset();const o=await owner(),q=jobs(),a=await start(q,o),output=fixtureOutput();
      const expected={sd:'synthetic-sd-revision',controlnet:'synthetic-controlnet-revision',depth:'synthetic-depth-revision'};
      output.evidence.model_revisions={...expected,toJSON(){throw new Error('Untrusted serializer executed');}};
      assert.equal(await q.complete(a.job_id,a.fence,output),true);
      const evidence=(await pool.query('SELECT model_revisions FROM generation_evidence WHERE job_id=$1',[a.job_id])).rows[0];
      assert.deepEqual(evidence.model_revisions,expected);
    });
    await t.test('Atomic output attach rejects wrong input and rolls back evidence on output-key conflict',async()=>{
      await reset();const o=await owner(),q=jobs(),a=await start(q,o),wrong=fixtureOutput();wrong.evidence.input_sha='e'.repeat(64);
      await assert.rejects(q.complete(a.job_id,a.fence,wrong),/binding mismatch/);
      assert.equal(await count('SELECT count(*)::int AS n FROM generation_evidence'),0);
      assert.equal((await row(a.job_id)).status,'running');
      const output=fixtureOutput();assert.equal(await q.complete(a.job_id,a.fence,output),true);
      const b=await start(q,o);await assert.rejects(q.complete(b.job_id,b.fence,output),e=>e.code==='23505');
      assert.equal(await count('SELECT count(*)::int AS n FROM generation_evidence'),1);
      assert.equal((await row(b.job_id)).status,'running');
      // A fresh controller resumes durable state from PostgreSQL without in-memory ownership.
      assert.equal(await jobs().fail(b.job_id,b.fence),true);assert.equal(await releases(b.job_id),1);
    });
    await t.test('PAY-05 applicable hold serialization: queued fail, active pre-hold finish, retry denied',async()=>{
      await reset();const o=await owner(),q=jobs(),a=await start(q,o);const queued=await q.reserve(o.id,body(o));
      await pool.query('UPDATE account SET billing_hold=true WHERE id=$1',[o.id]);
      assert.equal(await q.claim(),null);assert.equal(await releases(queued.job_id),1);
      assert.equal(await q.complete(a.job_id,a.fence,fixtureOutput()),true);
      await assert.rejects(q.reserve(o.id,body(o)),e=>e.code==='billing_hold');
      await reset();const x=await owner(),b=await start(q,x);
      await pool.query('UPDATE account SET billing_hold=true WHERE id=$1',[x.id]);
      await q.fail(b.job_id,b.fence,{retryable:true});assert.equal(await q.claim(),null);assert.equal(await releases(b.job_id),1);
    });
    await t.test('PAY-05 hold race is serialized under account lock for admission and start',async()=>{
      for(const operation of ['reserve','claim']) {
        await reset();const o=await owner(),q=jobs();let r;
        if(operation==='claim') r=await q.reserve(o.id,body(o));
        const blocker=await pool.connect();await blocker.query('BEGIN');await blocker.query('SELECT id FROM account WHERE id=$1 FOR UPDATE',[o.id]);
        const pending=operation==='reserve'?q.reserve(o.id,body(o)).then(()=>null,e=>e):q.claim();
        await blocker.query('UPDATE account SET billing_hold=true WHERE id=$1',[o.id]);await blocker.query('COMMIT');blocker.release();
        const result=await pending;
        if(operation==='reserve') {assert.equal(result.code,'billing_hold');assert.equal(await count('SELECT count(*)::int AS n FROM job'),0);}
        else {assert.equal(result,null);assert.equal(await releases(r.job_id),1);}
      }
    });
    await t.test('GALLERY-03 deletion tombstones upload/all jobs and fences completion; cleanup retries',async()=>{
      await reset();const o=await owner(),other=await owner(),q=jobs(),a=await start(q,o),b=await q.reserve(o.id,body(o));
      await assert.rejects(q.deleteUpload(other.id,o.upload),e=>e.status===404);
      await writeFile(join(dir,o.upload),'synthetic upload');await q.deleteUpload(o.id,o.upload);
      for(const id of [a.job_id,b.job_id]) {await assert.rejects(q.get(o.id,id),e=>e.status===404);assert.equal(await releases(id),1);}
      assert.equal(await q.complete(a.job_id,a.fence,fixtureOutput()),false);assert.equal(await q.fail(a.job_id,a.fence),false);
      assert.equal((await q.list(o.id)).jobs.length,0);
      assert.equal(await cleanupDeleted(pool,dir),1);await assert.rejects(readFile(join(dir,o.upload)),e=>e.code==='ENOENT');
      assert.equal(await cleanupDeleted(pool,dir),0);
      // A failed unlink is retried; tombstone is independent of physical cleanup.
      const x=await owner();await mkdir(join(dir,x.upload));await q.deleteUpload(x.id,x.upload);
      await cleanupDeleted(pool,dir);assert.equal((await pool.query('SELECT files_cleaned_at FROM upload WHERE id=$1',[x.upload])).rows[0].files_cleaned_at,null);
      await rm(join(dir,x.upload),{recursive:true});await cleanupDeleted(pool,dir);
      assert.ok((await pool.query('SELECT files_cleaned_at FROM upload WHERE id=$1',[x.upload])).rows[0].files_cleaned_at);
    });
    await t.test('GALLERY-03 deletion racing active complete cannot attach after tombstone or release twice',async()=>{
      await reset();const o=await owner(),q=jobs(),a=await start(q,o);
      const blocker=await pool.connect();await blocker.query('BEGIN');await blocker.query('SELECT id FROM account WHERE id=$1 FOR UPDATE',[o.id]);
      const deletion=q.deleteUpload(o.id,o.upload);const completion=q.complete(a.job_id,a.fence,fixtureOutput());
      await blocker.query('COMMIT');blocker.release();await deletion;await completion;
      assert.ok((await row(a.job_id)).deleted_at);assert.equal(await q.complete(a.job_id,a.fence,fixtureOutput()),false);
      assert.equal(await releases(a.job_id),1); // Deletion releases a still-reserved unverified result exactly once.
    });
    await t.test('Output UUIDs live in separate registry sweep; bounded cursor protects live result and reaches tail',async()=>{
      await reset();const o=await owner(),q=jobs(),a=await start(q,o),output=fixtureOutput();await q.complete(a.job_id,a.fence,output);
      const root=join(dir,'outputs'),orphan='ffffffff-ffff-4fff-8fff-ffffffffffff',old=new Date(Date.now()-7200000);
      for(const key of [output.output_key,orphan]) {await writeFile(join(root,key),'synthetic output');await utimes(join(root,key),old,old);}
      for(let i=0;i<4;i++) await sweepOutputs(pool,dir,Date.now(),{scanLimit:1,deleteLimit:1});
      assert.equal((await readFile(join(root,output.output_key))).toString(),'synthetic output');await assert.rejects(readFile(join(root,orphan)),e=>e.code==='ENOENT');
    });
    await t.test('AUTH-04/GALLERY-01 actual owner job routes, Origin, pagination, no-store and no worker endpoint',async()=>{
      await reset();const o=await owner(70),other=await owner(),q=createJobs(pool,config);
      const secret=randomBytes(32).toString('hex'),token=randomBytes(32).toString('base64url'),otherToken=randomBytes(32).toString('base64url');
      for(const [account,value] of [[o,token],[other,otherToken]]) await pool.query("INSERT INTO session(token_hash,account_id,expires_at) VALUES($1,$2,clock_timestamp()+interval '1 hour')",[tokenHash(value,secret),account.id]);
      server=createApp(pool,{...config,storageDir:dir,secret,origin:'http://127.0.0.1:18088',secureCookie:false});await new Promise(r=>server.listen(0,'127.0.0.1',r));
      const base='http://127.0.0.1:'+server.address().port;
      const call=async(path,{method='GET',value=token,data,origin='http://127.0.0.1:18088'}={})=>{
        const res=await fetch(base+path,{method,headers:{Cookie:'roomkind_session='+value,Origin:origin,'Content-Type':'application/json'},body:data===undefined?undefined:JSON.stringify(data)});return {status:res.status,headers:res.headers,json:await res.json()};
      };
      const request=body(o);const created=await call('/api/jobs',{method:'POST',data:request});assert.equal(created.status,202);const id=created.json.job_id;
      assert.equal((await call('/api/jobs/'+id,{value:otherToken})).status,404);
      assert.equal((await call('/api/jobs/'+id,{method:'DELETE',value:otherToken})).status,404);
      assert.equal((await call('/api/jobs',{method:'POST',data:request})).json.job_id,id);
      assert.equal((await call('/api/jobs',{method:'POST',data:{...request,style:'minimal'}})).status,409);
      assert.equal((await call('/api/jobs',{method:'POST',data:body(o),origin:'http://evil.test'})).status,403);
      assert.equal((await call('/api/worker/claim',{method:'POST',data:{}})).status,404);
      assert.equal((await call('/api/jobs',{method:'POST',data:{...body(o),padding:'x'.repeat(17000)}})).status,413);
      // Historical gallery rows are synthetic state fixtures, not admitted inference or GPU proof.
      for(let i=0;i<55;i++) await pool.query(`INSERT INTO job(id,account_id,upload_id,style,idempotency_key,request_hash,status,created_at,queue_deadline,hard_deadline)
        VALUES($1,$2,$3,'warm',$4,$5,$6,clock_timestamp(),clock_timestamp()+interval '60 seconds',clock_timestamp()+interval '360 seconds')`,[randomUUID(),o.id,o.upload,'gallery-fixture-'+i,'a'.repeat(64),['queued','running','succeeded','failed'][i%4]]);
      const first=await call('/api/jobs');assert.equal(first.json.jobs.length,50);assert.ok(first.json.next);
      assert.match(first.headers.get('cache-control'),/private, no-store/);assert.match(first.headers.get('x-robots-tag'),/noindex/);
      const second=await call('/api/jobs?before='+first.json.next);assert.equal(second.json.jobs.length,6);assert.equal(second.json.next,null);
      assert.equal(new Set([...first.json.jobs,...second.json.jobs].map(j=>j.job_id)).size,56);
      assert.equal((await call('/api/jobs',{value:otherToken})).json.jobs.length,0);
      for(const query of ['limit=51','limit=0','before=invalid','unexpected=x','limit=2&limit=3']) assert.equal((await call('/api/jobs?'+query)).status,400);
      await call('/api/jobs/'+id,{method:'DELETE'});assert.equal((await call('/api/uploads/'+o.upload)).status,404);
      server.closeAllConnections();await new Promise(r=>server.close(r));server=null;
    });
  } finally {
    if(server){server.closeAllConnections();await new Promise(r=>server.close(r));}
    await pool?.end();await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`).catch(()=>{});await admin.end();
    if(dir) await rm(dir,{recursive:true,force:true});
  }
});
