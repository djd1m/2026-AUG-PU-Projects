import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID,randomBytes } from 'node:crypto';
import pg from 'pg';
import { createPool,transaction } from '../web/db.js';
import { migrate } from '../scripts/migrate.js';
import { createPayments,CREATE_WINDOW_MS } from '../web/payments.js';
import { createFixtureProvider } from '../web/payment-fixture.js';
import { createJobs } from '../web/jobs.js';
import { createApp } from '../web/app.js';
import { tokenHash } from '../web/auth.js';
import { fixtureOutput } from './job-fixtures.js';

test('F03a real PostgreSQL verified payments, refunds, replay and billing serialization',async t=>{
  if(!process.env.TEST_DATABASE_URL||process.env.N8_TEST_DB_OWNERSHIP!=='n8-f03a')throw new Error('Dedicated F03a PostgreSQL URL and ownership assertion required');
  const db=new URL(process.env.TEST_DATABASE_URL);
  if(!['localhost','127.0.0.1','[::1]','db'].includes(db.hostname))throw new Error('Dedicated local/internal database required');
  const admin=new pg.Pool({connectionString:db.href,max:2,connectionTimeoutMillis:2000});
  const schema='f03a_'+randomBytes(8).toString('hex');let pool,server;
  const config={runtime:'test',providerMode:'fixture',origin:'http://localhost:18088',platformDailyLimit:200,accountDailyLimit:20};
  try {
    assert.match((await admin.query('SHOW server_version')).rows[0].server_version,/^16\./);
    await admin.query(`CREATE SCHEMA ${schema}`);db.searchParams.set('options',`-c search_path=${schema}`);
    pool=createPool(db.href);await migrate(pool);await migrate(pool);
    const fixture=createFixtureProvider(pool,config),payments=createPayments(pool,config),jobs=createJobs(pool,config);
    const row=async(table,id)=>(await pool.query(`SELECT * FROM ${table} WHERE id=$1`,[id])).rows[0]; // test-owned closed table names
    const count=async(sql,values=[])=>(await pool.query(sql,values)).rows[0].n;
    const balance=id=>count('SELECT COALESCE(sum(delta),0)::int AS n FROM credit_ledger WHERE account_id=$1',[id]);
    const purchases=id=>count("SELECT count(*)::int AS n FROM credit_ledger WHERE kind='purchase' AND account_id=$1",[id]);
    async function reset(){await pool.query('TRUNCATE account,attempt_budget,payment_fixture_object,provider_event CASCADE');}
    async function owner(credits=1) {
      const id=randomUUID(),upload=randomUUID();await pool.query('INSERT INTO account(id,email,password_hash) VALUES($1,$2,$3)',[id,id+'@example.test','unused']);
      if(credits)await pool.query("INSERT INTO credit_ledger(id,account_id,delta,kind,reference) VALUES($1,$2,1,'trial',$2)",[randomUUID(),id]);
      await pool.query("INSERT INTO upload(id,account_id,private_key,sha256,width,height,mime) VALUES($1,$2,$1,$3,1,1,'image/webp')",[upload,id,'a'.repeat(64)]);
      return {id,upload};
    }
    async function partner(ownerId=null,code='partner_'+randomBytes(8).toString('hex')) {
      ownerId??=(await owner(0)).id;
      const id=randomUUID();await pool.query('INSERT INTO partner(id,account_id,code,active) VALUES($1,$2,$3,true)',[id,ownerId,code]);return {id,code};
    }
    async function intent(o,code,key=randomUUID()) {
      const result=await payments.create(o.id,{package:'ROOM20',idempotency_key:key,...(code?{partner_code:code}:{})});
      await payments.runOne();const p=await row('payment_intent',result.payment_id);assert.ok(p.provider_id);return p;
    }
    async function state(p,status='succeeded',patch={}) {
      const b=JSON.parse(p.provider_body),original={id:p.provider_id,amount:b.amount,metadata:b.metadata,recipient:{account_id:'fixture'},confirmation:{type:'redirect',confirmation_url:config.origin+'/'}},next={...original,status,paid:status==='succeeded',...patch};
      await pool.query("UPDATE payment_fixture_object SET body=$2 WHERE kind='payment' AND id=$1",[p.provider_id,JSON.stringify(next)]);return next;
    }
    const success=p=>payments.notify({event:'payment.succeeded',object:{id:p.provider_id,amount:{value:'1.00'},metadata:{account_id:randomUUID()}}});
    const cancel=p=>payments.notify({event:'payment.canceled',object:{id:p.provider_id}});
    async function refund(p,value='1.00',patch={}) {
      const id=randomUUID(),r={id,payment_id:p.provider_id,status:'succeeded',amount:{value,currency:'RUB'},...patch};
      await pool.query("INSERT INTO payment_fixture_object(kind,id,body) VALUES('refund',$1,$2)",[id,JSON.stringify(r)]);
      return {id,send:()=>payments.notify({event:'refund.succeeded',object:{id}})};
    }
    await t.test('PAY-01 immutable server-priced intents, ten creates reuse and conflicting body409',async()=>{
      await reset();const o=await owner(),p=await partner(),b={package:'ROOM20',idempotency_key:'same'};
      const all=await Promise.all(Array.from({length:10},()=>payments.create(o.id,b)));
      assert.equal(new Set(all.map(p=>p.payment_id)).size,1);assert.equal(all[0].status,'created');assert.equal(await balance(o.id),1);
      const i=await row('payment_intent',all[0].payment_id);assert.equal(i.amount_minor,90000);assert.equal(JSON.parse(i.provider_body).amount.value,'900.00');
      await assert.rejects(payments.create(o.id,{...b,partner_code:p.code}),e=>e.status===409);
      await assert.rejects(pool.query('UPDATE payment_intent SET amount_minor=1 WHERE id=$1',[i.id]));
      await assert.rejects(pool.query('UPDATE payment_intent SET account_id=$2 WHERE id=$1',[i.id,randomUUID()]));
      await payments.runOne();await payments.runOne();assert.equal(await count('SELECT count(*)::int AS n FROM payment_fixture_object'),1);
      const created=await row('payment_intent',i.id);assert.equal(created.provider_key,i.provider_key);assert.equal(created.provider_body,i.provider_body);
      const other=await owner();await assert.rejects(payments.get(other.id,i.id),e=>e.status===404);
    });
    await t.test('PAY-01 bounded durable runner retries identical body/key and stops unknown outcomes before24h',async()=>{
      await reset();const o=await owner(),calls=[];
      const failing=createPayments(pool,config,{provider:{...fixture,create:async(body,key)=>{calls.push({body,key});throw new Error('unknown outcome');}}});
      const v=await failing.create(o.id,{package:'ROOM20',idempotency_key:'retry'});
      await failing.runOne();await pool.query("UPDATE payment_intent SET next_attempt_at=clock_timestamp()-interval '1 second' WHERE id=$1",[v.payment_id]);
      await failing.runOne();assert.equal(calls.length,2);assert.deepEqual(calls[0],calls[1]);
      // Trigger faithfully rejects changing first attempt. A separate fresh row seeds an old first attempt once.
      const old=await failing.create(o.id,{package:'ROOM20',idempotency_key:'old'});
      await pool.query("UPDATE payment_intent SET first_attempt_at=clock_timestamp()-interval '24 hours' WHERE id=$1",[old.payment_id]);
      await failing.runOne();assert.equal((await row('payment_intent',old.payment_id)).status,'review');assert.equal(calls.length,2);
      assert.ok(CREATE_WINDOW_MS<86400000);
    });
    await t.test('PAY-02 mismatches/transients grant0 and claim no event; valid retry grants20',async()=>{
      await reset();const o=await owner(),p=await intent(o);const original=await state(p);
      const patches=[{id:randomUUID()},{recipient:{account_id:'wrong'}},{metadata:{...original.metadata,intent_id:randomUUID()}},
        {metadata:{...original.metadata,account_id:randomUUID()}},{metadata:{...original.metadata,package:'OTHER'}},
        {amount:{value:'899.99',currency:'RUB'}},{amount:{value:'900.00',currency:'USD'}},{paid:false},{status:'pending'}];
      for(const patch of patches){await state(p,'succeeded',patch);await assert.rejects(success(p));
        assert.equal(await balance(o.id),1);assert.equal(await count('SELECT count(*)::int AS n FROM provider_event'),0);}
      const unavailable=createPayments(pool,config,{provider:{...fixture,payment:async()=>{throw Object.assign(new Error('timeout'),{status:503});}}});
      await assert.rejects(unavailable.notify({event:'payment.succeeded',object:{id:p.provider_id}}));assert.equal(await count('SELECT count(*)::int AS n FROM provider_event'),0);
      await state(p);await success(p);assert.equal(await balance(o.id),21);
    });

    await t.test('PAY-01 ten create runners share one lease and do network work outside account locks',async()=>{
      await reset();const o=await owner();let calls=0;
      const bounded=createPayments(pool,config,{provider:{...fixture,create:async(body,key)=>{
        calls++;
        await transaction(pool,async c=>{await c.query('SET LOCAL lock_timeout=1000');await c.query('SELECT id FROM account WHERE id=$1 FOR UPDATE',[o.id]);});
        await new Promise(resolve=>setTimeout(resolve,50));return fixture.create(body,key);
      }}});
      await bounded.create(o.id,{package:'ROOM20',idempotency_key:'one-lease'});
      await Promise.all(Array.from({length:10},()=>bounded.runOne()));
      assert.equal(calls,1);assert.equal(await count('SELECT sum(attempts)::int AS n FROM payment_intent'),1);
      assert.equal(await count('SELECT count(*)::int AS n FROM payment_fixture_object'),1);
    });
    await t.test('PAY-02 unknown provider ID cannot attach itself through notification metadata',async()=>{
      await reset();const o=await owner(),p=await intent(o);const fakeId=randomUUID(),original=await state(p);
      await pool.query("INSERT INTO payment_fixture_object(kind,id,body) VALUES('payment',$1,$2)",[fakeId,JSON.stringify({...original,id:fakeId})]);
      await assert.rejects(payments.notify({event:'payment.succeeded',object:{id:fakeId}}),e=>e.status===503);
      assert.equal(await balance(o.id),1);assert.equal(await count('SELECT count(*)::int AS n FROM provider_event'),0);
      assert.equal((await row('payment_intent',p.id)).provider_id,p.provider_id);
    });
    await t.test('PAY-03 ten concurrent success replays grant20 once; legitimate repeat grants again',async()=>{
      await reset();const o=await owner(),p=await intent(o);await state(p);
      await Promise.all(Array.from({length:10},()=>success(p)));assert.equal(await purchases(o.id),1);assert.equal(await balance(o.id),21);
      assert.equal(await count('SELECT count(*)::int AS n FROM provider_event'),1);
      const p2=await intent(o);await state(p2);await success(p2);assert.equal(await balance(o.id),41);assert.equal((await row('account',o.id)).first_paid_payment_id,p.id);
    });
    await t.test('PAY-03 canceled→success allowed; duplicate cancel harmless; review monotonic',async()=>{
      await reset();const o=await owner(),p=await intent(o);await state(p,'canceled');await cancel(p);assert.equal((await row('payment_intent',p.id)).status,'canceled');
      await state(p);await success(p);await state(p,'canceled');await cancel(p);assert.equal((await row('payment_intent',p.id)).status,'succeeded');
      await state(p);const r=await refund(p);await r.send();await success(p);assert.equal((await row('payment_intent',p.id)).status,'review');
      await assert.rejects(pool.query("UPDATE payment_intent SET status='succeeded' WHERE id=$1",[p.id]));
      await assert.rejects(pool.query('UPDATE account SET billing_hold=false WHERE id=$1',[o.id]));
    });
    await t.test('PAY-03 fresh success→first cancellation handled without downgrading or duplicate purchase',async()=>{
      await reset();const o=await owner(),p=await intent(o);await state(p);await success(p);
      assert.equal((await row('payment_intent',p.id)).status,'succeeded');assert.equal(await purchases(o.id),1);
      assert.equal(await count("SELECT count(*)::int AS n FROM provider_event WHERE provider_object_id=$1 AND event_type='payment.canceled'",[p.provider_id]),0);
      await state(p,'canceled');assert.deepEqual(await cancel(p),{ok:true});
      assert.equal(await count("SELECT count(*)::int AS n FROM provider_event WHERE provider_object_id=$1 AND event_type='payment.canceled'",[p.provider_id]),1);
      assert.equal((await row('payment_intent',p.id)).status,'succeeded');assert.equal(await purchases(o.id),1);
    });
    await t.test('PAY-04 refund binding matrix effects0; verified partial/full permanent hold without reversal',async()=>{
      await reset();const o=await owner(),p=await intent(o);await state(p);await success(p);
      for(const patch of [{id:randomUUID()},{payment_id:randomUUID()},{status:'pending'},
        {amount:{value:'0.00',currency:'RUB'}},{amount:{value:'900.01',currency:'RUB'}},{amount:{value:'1.00',currency:'USD'}}]) {
        const r=await refund(p,'1.00',patch);await assert.rejects(r.send());assert.equal((await row('account',o.id)).billing_hold,false);
      }
      const original=await fixture.payment(p.provider_id);
      for(const patch of [{recipient:{account_id:'wrong'}},{metadata:{...original.metadata,account_id:randomUUID()}}]) {
        await state(p,'succeeded',patch);const r=await refund(p);await assert.rejects(r.send());assert.equal((await row('account',o.id)).billing_hold,false);
      }
      await state(p);const partial=await refund(p,'0.01');await Promise.all(Array.from({length:10},()=>partial.send()));
      const full=await refund(p,'900.00');await full.send();assert.equal(await balance(o.id),21);
      assert.equal(await count('SELECT count(*)::int AS n FROM verified_refund'),2);assert.equal((await payments.account(o.id)).effective_badge_free_entitlement,false);
    });
    await t.test('PAY-05 refund before success prevents ledger but first success claims marker; unrelated held purchase unspendable',async()=>{
      await reset();const o=await owner(),partnered=await partner(),p=await intent(o,partnered.code);await state(p);
      await (await refund(p)).send();await success(p);assert.equal(await purchases(o.id),0);assert.equal((await row('account',o.id)).first_paid_payment_id,p.id);
      const p2=await intent(o,partnered.code);await state(p2);await success(p2);assert.equal(await purchases(o.id),1);
      assert.equal((await payments.account(o.id)).effective_badge_free_entitlement,false);assert.equal(await count('SELECT count(*)::int AS n FROM first_conversion'),0);
      await assert.rejects(jobs.reserve(o.id,{upload_id:o.upload,style:'warm',idempotency_key:'held'}),e=>e.status===403);
    });
    await t.test('PAY-05 hold releases queued jobs once, denies start/retry; active attempt may finish private',async()=>{
      await reset();const o=await owner(),p=await intent(o);await state(p);await success(p);
      const b=key=>({upload_id:o.upload,style:'warm',idempotency_key:key});
      const activeId=(await jobs.reserve(o.id,b('active'))).job_id,active=await jobs.claim();assert.equal(active.job_id,activeId);
      const queued=(await jobs.reserve(o.id,b('queued'))).job_id;
      const r=await refund(p);await r.send();await r.send();assert.equal((await row('job',queued)).status,'failed');
      assert.equal(await count("SELECT count(*)::int AS n FROM credit_ledger WHERE kind='release' AND reference=$1",[queued]),1);
      assert.equal(await jobs.claim(),null);assert.equal(await jobs.complete(active.job_id,active.fence,fixtureOutput()),true);
      assert.equal((await row('job',activeId)).status,'succeeded');
      await reset();const o2=await owner(),p2=await intent(o2);await state(p2);await success(p2);
      await jobs.reserve(o2.id,{upload_id:o2.upload,style:'warm',idempotency_key:'retry'});const a=await jobs.claim();await (await refund(p2)).send();
      assert.equal(await jobs.fail(a.job_id,a.fence,{retryable:true}),true);assert.equal((await row('job',a.job_id)).status,'failed');assert.equal(await jobs.claim(),null);
    });
    await t.test('PAY-05 account serialization races refund with admission and success, with no post-hold effects',async()=>{
      await reset();const o=await owner(),p=await intent(o);await state(p);const r=await refund(p);
      const results=await Promise.allSettled([success(p),r.send(),jobs.reserve(o.id,{upload_id:o.upload,style:'warm',idempotency_key:'race'})]);
      assert.equal(results[0].status,'fulfilled');assert.equal(results[1].status,'fulfilled');assert.equal((await row('account',o.id)).billing_hold,true);
      assert.equal((await row('payment_intent',p.id)).status,'review');assert.equal(await jobs.claim(),null);
      assert.equal(await count("SELECT count(*)::int AS n FROM job WHERE status='queued'"),0);
      assert.equal((await payments.account(o.id)).effective_badge_free_entitlement,false);
    });
    await t.test('ATTR-03 no-partner first winner excludes backfill and refund promotion forever',async()=>{
      await reset();const o=await owner(),partnered=await partner(),p=await intent(o),p2=await intent(o,partnered.code);
      await state(p);await state(p2);await success(p);await success(p2);await (await refund(p)).send();
      assert.equal((await row('account',o.id)).first_paid_payment_id,p.id);assert.equal(await count('SELECT count(*)::int AS n FROM first_conversion'),0);
      assert.equal(await purchases(o.id),2);
    });
    await t.test('ATTR-03 two attributed successes have one committed winner/event; refund invalidates without promoting',async()=>{
      await reset();const o=await owner(),a=await partner(),b=await partner(),p=await intent(o,a.code),p2=await intent(o,b.code);
      await state(p);await state(p2);await Promise.all([success(p),success(p2)]);
      const winner=(await row('account',o.id)).first_paid_payment_id,conversion=(await pool.query('SELECT * FROM first_conversion')).rows[0];
      assert.equal(conversion.payment_intent_id,winner);assert.equal(await count('SELECT count(*)::int AS n FROM first_conversion'),1);
      assert.equal(await count("SELECT count(*)::int AS n FROM event WHERE type='paid_conversion'"),1);assert.equal(await purchases(o.id),2);
      await (await refund(winner===p.id?p:p2)).send();assert.equal((await pool.query('SELECT valid FROM first_conversion')).rows[0].valid,false);
      assert.equal((await row('account',o.id)).first_paid_payment_id,winner);
    });
    await t.test('ATTR-03 only validated active nonself manual code or server attribution snapshots',async()=>{
      await reset();const o=await owner(),p=await partner(),self=await partner(o.id);
      for(const code of ['unknowncode',self.code])await assert.rejects(payments.create(o.id,{package:'ROOM20',idempotency_key:randomUUID(),partner_code:code}),e=>e.status===422);
      await pool.query("INSERT INTO attribution(account_id,partner_id,source) VALUES($1,$2,'code')",[o.id,p.id]);
      const i=await intent(o);assert.equal(i.partner_id,p.id);await pool.query('UPDATE attribution SET partner_id=$2 WHERE account_id=$1',[o.id,self.id]);
      assert.equal((await row('payment_intent',i.id)).partner_id,p.id);
      await assert.rejects(pool.query('UPDATE payment_intent SET partner_id=$2 WHERE id=$1',[i.id,self.id]));
    });
    await t.test('PAY-01 HTTP authenticated owner/Origin/body/return boundaries and payload ignored',async()=>{
      await reset();const o=await owner(),other=await owner();const secret=randomBytes(32).toString('hex'),token=randomBytes(32).toString('base64url');
      await pool.query("INSERT INTO session(token_hash,account_id,expires_at) VALUES($1,$2,clock_timestamp()+interval '1 day')",[tokenHash(token,secret),o.id]);
      server=createApp(pool,{...config,secret,storageDir:'/tmp/n8-f03a-http-private',secureCookie:false});await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
      const base='http://127.0.0.1:'+server.address().port,cookie='roomkind_session='+token;
      const send=(path,body,headers={})=>fetch(base+path,{method:'POST',headers:{Cookie:cookie,Origin:config.origin,'Content-Type':'application/json',...headers},body:JSON.stringify(body)});
      assert.equal((await send('/api/payments',{package:'ROOM20',idempotency_key:'x'},{Origin:'http://evil.test'})).status,403);
      assert.equal((await send('/api/payments',{package:'ROOM20',idempotency_key:'x'},{Cookie:''})).status,401);
      assert.equal((await send('/api/payments',{package:'ROOM20',idempotency_key:'x',price:1})).status,400);
      const created=await send('/api/payments',{package:'ROOM20',idempotency_key:'x'});assert.equal(created.status,202);
      const httpIntent=(await created.json()).payment;assert.equal(httpIntent.status,'created');
      const queued=await row('payment_intent',httpIntent.payment_id);assert.equal(queued.account_id,o.id);assert.equal(queued.status,'created');assert.equal(queued.provider_id,null);
      assert.equal(await payments.runOne(),true);
      const attached=await row('payment_intent',httpIntent.payment_id);assert.ok(attached.provider_id);assert.equal(attached.status,'pending');
      const p=await intent(other);assert.equal((await fetch(base+'/api/payments/'+p.id,{headers:{Cookie:cookie}})).status,404);
      const before=await balance(o.id);assert.equal((await fetch(base+'/')).status,200);assert.equal(await balance(o.id),before);
      assert.equal((await send('/api/payments/webhook',{event:'unknown',object:{id:p.provider_id}},{Origin:''})).status,400);
      assert.equal((await send('/api/payments/webhook',{event:'payment.succeeded',object:{id:p.provider_id},padding:'x'.repeat(16384)},{Origin:''})).status,413);
      await new Promise(resolve=>server.close(resolve));server=null;
    });
  }finally {if(server){server.closeAllConnections();await new Promise(r=>server.close(r));}await pool?.end();await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`).catch(()=>{});await admin.end();}
});
