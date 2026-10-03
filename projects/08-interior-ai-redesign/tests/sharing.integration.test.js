import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import pg from 'pg';
import { createPool } from '../web/db.js';
import { createJobs } from '../web/jobs.js';
import { createQuality } from '../web/quality.js';
import { createSharing } from '../web/sharing.js';
import { canonical, sha } from '../web/generation.js';
import { migrate } from '../scripts/migrate.js';
import { qualityFixture } from './quality-fixtures.js';
import { publication } from './sharing-fixtures.js';

// ACTUAL PostgreSQL16, random schema, dedicated coordinator-owned database only.
// Every controlnet-labelled artifact/report is SYNTHETIC SOFTWARE data, never GPU proof.
test('F04 PG16 composite/publication authorization, atomic revoke, events and hold serialization',async t=>{
  if(!process.env.TEST_DATABASE_URL||process.env.N8_TEST_DB_OWNERSHIP!=='n8-f04a')throw new Error('Dedicated F04a PostgreSQL URL and ownership assertion required');
  const url=new URL(process.env.TEST_DATABASE_URL);
  if(!['localhost','127.0.0.1','[::1]','db'].includes(url.hostname))throw new Error('Dedicated local/internal database required');
  const admin=new pg.Pool({connectionString:url.href,max:2,connectionTimeoutMillis:2000});
  const schema='f04a_'+randomBytes(8).toString('hex');let pool,dir;
  try {
    assert.match((await admin.query('SHOW server_version')).rows[0].server_version,/^16\./);
    await admin.query(`CREATE SCHEMA ${schema}`);url.searchParams.set('options',`-c search_path=${schema}`);
    pool=createPool(url.href);await migrate(pool);await migrate(pool);
    assert.equal((await pool.query('SELECT count(*)::int AS n FROM schema_migration')).rows[0].n,6);
    dir=await mkdtemp(join(tmpdir(),'n8-f04a-pg-'));
    const config={storageDir:dir,runtime:'test',platformDailyLimit:200,accountDailyLimit:20};
    const jobs=createJobs(pool,config),q=createQuality(pool,config,{operatorIdentity:'SYNTHETIC_SOFTWARE_OPERATOR'}),s=createSharing(pool,config);
    async function provision({mode='controlnet',accept=true,account}={}) {
      const f=await qualityFixture(dir,mode);account??=f.row.account_id;
      if(!(await pool.query('SELECT id FROM account WHERE id=$1',[account])).rowCount)await pool.query('INSERT INTO account(id,email,password_hash) VALUES($1,$2,$3)',[account,account+'@example.test','unused-synthetic-hash']);
      await pool.query("INSERT INTO credit_ledger(id,account_id,delta,kind,reference) VALUES($1,$2,1,'purchase',$3)",[randomUUID(),account,randomUUID()]);
      await pool.query("INSERT INTO upload(id,account_id,private_key,sha256,width,height,mime) VALUES($1,$2,$1,$3,8,8,'image/webp')",[f.uploadId,account,f.row.input_sha]);
      const {job_id:id}=await jobs.reserve(account,{upload_id:f.uploadId,style:'warm',idempotency_key:randomUUID()});
      // Do not assume one claim processes this intent; unexpected queued work fails explicitly.
      let claim;for(let tries=0;tries<10;tries++) {
        claim=await jobs.claim();if(!claim)throw new Error('target_claim_unavailable');
        if(claim.job_id===id)break;
        await jobs.fail(claim.job_id,claim.fence,{retryable:false});
      }
      if(claim.job_id!==id)throw new Error('target_claim_budget_exhausted');
      const evidence={...f.row.canonical_evidence,job_id:id};
      assert.equal(await jobs.complete(id,claim.fence,{output_key:f.row.output_key,mode,evidence}),true);
      f.report.pairs[0].evidence_sha=sha(canonical(evidence));const bytes=Buffer.from(canonical(f.report));await writeFile(f.reportPath,bytes);
      const review={jobId:id,decision:'accepted',reason:'SYNTHETIC SOFTWARE ONLY',reportPath:f.reportPath,reportSha:sha(bytes)};
      if(accept&&mode==='controlnet')await q.review(review);
      return {...f,id,account,review};
    }
    const count=async type=>(await pool.query('SELECT count(*)::int AS n FROM event WHERE type=$1',[type])).rows[0].n;
    const deny=promise=>assert.rejects(promise,e=>e.status===404);
    await t.test('two owners; accepted-only per-job consent; boundaries and byte/evidence mismatch',async()=>{
      const a=await provision(),b=await provision({account:a.account}),other=await provision(),demo=await provision({mode:'fixture'}),unverified=await provision({accept:false});
      await deny(s.attempt(other.account,a.id,{event_key:randomUUID(),mode:'native'}));
      for(const input of [publication({publish:false}),publication({source_context:''}),publication({source_context:'x'.repeat(161)}),publication({description:'d'.repeat(39)}),publication({description:'d'.repeat(2001)}),publication({style:'unknown'})])await assert.rejects(s.publish(a.account,a.id,input),e=>e.status===422);
      const v=await s.publish(a.account,a.id,publication({source_context:'x',description:'d'.repeat(40)}));
      assert.equal((await s.state(a.account,b.id)).published,false);await assert.rejects(s.publish(a.account,b.id,publication({publish:false})),e=>e.status===422);
      await deny(s.publish(other.account,a.id,publication()));await deny(s.publish(demo.account,demo.id,publication()));await deny(s.publish(unverified.account,unverified.id,publication()));
      await s.publish(a.account,b.id,publication({source_context:'😀'.repeat(160),description:'d'.repeat(2000)}));
      assert.ok((await s.publicRead(v.token)).image.data.length);
      await writeFile(join(dir,'outputs',a.row.output_key),'changed bytes');await deny(s.publicRead(v.token));
      await writeFile(join(dir,'outputs',a.row.output_key),a.image);
      await pool.query('UPDATE share SET evidence_sha=$2 WHERE token=$1',[v.token,'0'.repeat(64)]);await deny(s.publicRead(v.token));
      assert.equal(await count('share_completed'),0);
    });
    await t.test('revoke/republication/delete/reject atomically close old tokens without ledger regression',async()=>{
      const a=await provision();const v=await s.publish(a.account,a.id,publication());await s.publicRead(v.token);
      await s.revoke(a.account,a.id);await deny(s.publicRead(v.token));assert.equal((await pool.query('SELECT published FROM share WHERE token=$1',[v.token])).rows[0].published,false);
      const fresh=await s.publish(a.account,a.id,publication());assert.notEqual(fresh.token,v.token);
      await jobs.delete(a.account,a.id);await deny(s.publicRead(fresh.token));
      assert.equal((await pool.query('SELECT published FROM share WHERE token=$1',[fresh.token])).rows[0].published,false);
      assert.equal((await pool.query("SELECT count(*)::int AS n FROM credit_ledger WHERE kind='release' AND reference=$1",[a.id])).rows[0].n,1);
      await assert.rejects(jobs.delete(a.account,a.id));
      const b=await provision(),published=await s.publish(b.account,b.id,publication());
      await q.review({...b.review,decision:'rejected'});await deny(s.publicRead(published.token));
      assert.equal((await pool.query('SELECT published FROM share WHERE token=$1',[published.token])).rows[0].published,false);
      assert.equal((await pool.query("SELECT count(*)::int AS n FROM credit_ledger WHERE kind='release' AND reference=$1",[b.id])).rows[0].n,1);
      assert.ok(!(await s.list({limit:20})).items.some(i=>[v.token,fresh.token,published.token].includes(i.token)));
    });
    await t.test('cache hit waits for concurrent hold account lock then rejects stale unbadged image',async()=>{
      const f=await provision();await pool.query('UPDATE account SET badge_free_entitlement=true WHERE id=$1',[f.account]);
      let onPrepare;const service=createSharing(pool,config,{afterPrepare:()=>onPrepare?.()});
      const key=randomUUID();await service.attempt(f.account,f.id,{event_key:key,mode:'download'});await service.ownerComposite(f.account,f.id,'download',key);
      const v=await service.publish(f.account,f.id,publication());await service.publicRead(v.token);
      const hold=await pool.connect();let resolvePrepared;const prepared=new Promise(resolve=>{resolvePrepared=resolve;});
      try {
        await hold.query('BEGIN');await hold.query('UPDATE account SET billing_hold=true WHERE id=$1',[f.account]);
        onPrepare=()=>resolvePrepared();let finished=false;
        const image=service.ownerComposite(f.account,f.id,'download',key).then(v=>{finished=true;return v;},e=>{finished=true;throw e;});
        // Attach rejection before releasing the lock to avoid an unhandled rejection.
        const blocked=deny(image);await prepared;await new Promise(resolve=>setTimeout(resolve,25));assert.equal(finished,false);
        await hold.query('COMMIT');await blocked;onPrepare=undefined;
        await deny(service.publicRead(v.token));
        const branded=await service.ownerComposite(f.account,f.id,'download',key);assert.ok(branded.data.length);
      }finally{await hold.query('ROLLBACK');hold.release();}
    });
    await t.test('concurrent event replay admits one attempt/completion/export and abort/error/unavailable zero completion',async()=>{
      const f=await provision(),native=randomUUID(),download=randomUUID();const initial=await count('share_completed');
      await Promise.all([s.attempt(f.account,f.id,{event_key:native,mode:'native'}),s.attempt(f.account,f.id,{event_key:native,mode:'native'})]);
      await s.ownerComposite(f.account,f.id,'native',native);
      await Promise.all([s.outcome(f.account,f.id,{event_key:native,outcome:'resolved'}),s.outcome(f.account,f.id,{event_key:native,outcome:'resolved'})]);
      for(const outcome of ['abort','error','unavailable']) {const event_key=randomUUID();await s.attempt(f.account,f.id,{event_key,mode:'native'});await s.outcome(f.account,f.id,{event_key,outcome});}
      assert.equal(await count('share_completed'),initial+1);
      await s.attempt(f.account,f.id,{event_key:download,mode:'download'});const image=await s.ownerComposite(f.account,f.id,'download',download);
      const exports=await count('export_delivered');await Promise.all([image.delivered(),image.delivered()]);assert.equal(await count('export_delivered'),exports+1);
      await assert.rejects(s.outcome(f.account,f.id,{event_key:download,outcome:'resolved'}),e=>e.status===409);
      assert.equal((await pool.query('SELECT count(*)::int AS n FROM event WHERE reference=$1 AND type=$2',[f.id,'share_attempt'])).rows[0].n,5);
    });
    await t.test('public list keyset pagination is bounded and consent remains job scoped',async()=>{
      const created=[];
      for(let i=0;i<4;i++) {const f=await provision();created.push((await s.publish(f.account,f.id,publication({source_context:'Комната '+i}))).token);}
      let before,seen=new Set();for(let page=0;page<20;page++) {
        const result=await s.list({limit:2,before});assert.ok(result.items.length<=2);
        for(const item of result.items){assert.equal(seen.has(item.token),false);seen.add(item.token);assert.equal(item.job_id,undefined);assert.equal(item.account_id,undefined);}
        if(!result.next)break;before=result.next;
      }
      for(const token of created)assert.equal(seen.has(token),true);
      await assert.rejects(s.list({limit:21}),e=>e.status===400);
    });
  }finally{
    await pool?.end();await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);await admin.end();if(dir)await rm(dir,{recursive:true,force:true});
  }
});
