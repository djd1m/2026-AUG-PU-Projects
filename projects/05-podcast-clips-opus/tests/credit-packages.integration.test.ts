import { afterAll,beforeAll,describe,it,expect } from 'vitest';
import { randomBytes,randomUUID } from 'node:crypto';
import { createPool,transaction,createPaymentIntent,applyVerifiedPayment,optInCredits,readCreditBalance,
  reserveVideoCreditsTx,finalizeVideoCreditsTx,lockCreditAccountForVideo,effectivePlanSql,type Pool } from '../packages/db/src/index';
import { migrate } from '../packages/db/src/migrate';
import { CREDIT_SKUS,inputCreditSeconds } from '../packages/shared/src/tariff';
import { loadBillingMode,loadWebConfig,loadWorkerConfig } from '../packages/shared/src/config';
import { environment } from './fixtures/environment';
import { PgAuthStore } from '../apps/web/src/server/auth-store';
import { eraseAccount } from '../apps/web/src/server/retention';
import { ensureTestDatabase } from '../scripts/test-db.mjs';
const url=process.env.DATABASE_URL;
const now=new Date('2030-01-01T00:00:00Z');
const day=86_400_000;
const key=()=>randomUUID();
it('credit mode defaults closed; all process configs reject unknown/empty and honor explicit mode',()=>{
  expect(loadBillingMode({})).toBe('legacy');
  for (const value of ['', 'credits',' credit_v1','CREDITS_V1']) {
    expect(()=>loadWebConfig({...environment(),N5_BILLING_MODE:value})).toThrow('N5_BILLING_MODE');
    for (const role of ['worker-stt','worker-llm','worker-video'] as const) expect(()=>loadWorkerConfig(role,{...environment(),N5_BILLING_MODE:value})).toThrow('N5_BILLING_MODE');
  }
  expect(loadWebConfig({...environment(),N5_BILLING_MODE:'credits_v1'}).billingMode).toBe('credits_v1');
  const absent=environment(); delete absent.N5_BILLING_MODE;
  expect(loadWebConfig(absent).billingMode).toBe('legacy');
});
it('closed exact catalog uses seconds, never whole-minute rounding',()=>{
  expect(Object.values(CREDIT_SKUS).map(s=>[s.priceMinor,s.seconds,s.credits,s.hours,s.days])).toEqual([
    [99000,18000,300,5,30],[399000,108000,1800,30,30],[149000,36000,600,10,30]]);
  expect([120,121,120.1].map(inputCreditSeconds)).toEqual([120,121,121]);
});
describe.skipIf(!url)('credit packages on isolated PostgreSQL',()=>{
  let pool:Pool;
  const schema=`credits_${randomBytes(8).toString('hex')}`;
  beforeAll(async()=>{
    if (!url || !new URL(url).pathname.endsWith('_test')) throw new Error('Only *_test database');
    await ensureTestDatabase(url);pool=createPool(url,schema);await pool.query(`CREATE SCHEMA ${schema}`);await migrate(pool);
  },60_000);
  afterAll(async()=>{if(pool){await pool.query(`DROP SCHEMA ${schema} CASCADE`);await pool.end();}});
  async function account(policy='credits_v1') {
    return (await pool.query<{id:string}>(`INSERT INTO account(email,password_hash,plan,billing_policy) VALUES($1,'x','free',$2) RETURNING id`,[`${key()}@test.invalid`,policy])).rows[0]!.id;
  }
  async function video(accountId:string) {
    return (await pool.query<{id:string}>(`INSERT INTO video(account_id,idempotency_key,source,declared_bytes,status,object_key,actual_bytes)
      VALUES($1,$2,'upload',1,'queued','original',1) RETURNING id`,[accountId,key()])).rows[0]!.id;
  }
  async function grant(accountId:string,seconds:number,expires:Date|null=null) {
    return (await pool.query<{id:string}>(`INSERT INTO credit_grant(account_id,source,source_key,total_seconds,remaining_seconds,available_at,expires_at)
      VALUES($1,'signup',$2,$3,$3,$4,$5) RETURNING id`,[accountId,key(),seconds,new Date(now.getTime()-day),expires])).rows[0]!.id;
  }
  async function reserve(id:string,seconds=120,at=now) {
    return transaction(pool,async tx=>{await lockCreditAccountForVideo(tx,id);await tx.query('SELECT id FROM video WHERE id=$1 FOR UPDATE',[id]);return reserveVideoCreditsTx(tx,id,seconds,at);});
  }
  async function fail(id:string,at=now) {
    return transaction(pool,async tx=>{await lockCreditAccountForVideo(tx,id);await tx.query('SELECT id FROM video WHERE id=$1 FOR UPDATE',[id]);await tx.query("UPDATE video SET status='failed' WHERE id=$1",[id]);await finalizeVideoCreditsTx(tx,id,at);});
  }
  async function buy(id:string,sku:'start_v1'|'pro_v1'|'addon_v1',at=now) {
    const i=await createPaymentIntent(pool,{accountId:id,sku,billingMode:'credits_v1',priceMinor:CREDIT_SKUS[sku].priceMinor,idempotencyKey:key()});
    if(i.kind!=='created') throw new Error('intent not created');
    const p={provider:'fake' as const,eventKey:key(),payloadSha256:'a'.repeat(64),payment:{id:key(),orderId:i.intent.id,amountMinor:i.intent.price_minor,feeMinor:null,paidAt:at.toISOString()}};
    return {i,p};
  }
  it('20 same-email signups create one no-expiry trial and one session, legacy creates none',async()=>{
    const store=new PgAuthStore(pool,'credits_v1'),email=`${key()}@test.invalid`;
    await Promise.all(Array.from({length:20},()=>store.register(email,'hash',{hash:randomBytes(32).toString('hex'),ipPrefix:'198.51.100.0/24',expiresAt:new Date(Date.now()+day)})));
    const rows=await pool.query(`SELECT a.billing_policy,g.total_seconds,g.expires_at,(SELECT count(*)::int FROM session s WHERE s.account_id=a.id) sessions
      FROM account a JOIN credit_grant g ON g.account_id=a.id WHERE a.email=$1`,[email]);
    expect(rows.rows).toEqual([{billing_policy:'credits_v1',total_seconds:1800,expires_at:null,sessions:1}]);
    const old=await account('legacy_daily_v1');expect(await readCreditBalance(pool,old,now)).toBeNull();
  });
  it('explicit opt-in protects old paid, operator and pending invoices; replay cannot replenish',async()=>{
    const id=await account('legacy_daily_v1');const input={accountId:id,operator:'tester',reason:'explicit test',mode:'credits_v1' as const};
    expect(await optInCredits(pool,{...input,mode:'legacy'})).toBe(false);
    expect(await optInCredits(pool,input)).toBe(true);await pool.query('UPDATE credit_grant SET remaining_seconds=1 WHERE account_id=$1',[id]);
    expect(await optInCredits(pool,input)).toBe(true);expect((await readCreditBalance(pool,id))?.available_seconds).toBe(1);
    for(const source of ['operator','none','payment']) {
      const old=await account('legacy_daily_v1');await pool.query("UPDATE account SET plan='paid',plan_source=$2,plan_paid_until=now()+interval '1 day' WHERE id=$1",[old,source]);
      expect(await optInCredits(pool,{...input,accountId:old})).toBe(false);
    }
    const pending=await account('legacy_daily_v1');await createPaymentIntent(pool,{accountId:pending,priceMinor:99000,idempotencyKey:key()});
    expect(await optInCredits(pool,{...input,accountId:pending})).toBe(false);
  });
  it('20 last-balance reservations remain nonnegative and preserve video identity across retries',async()=>{
    const id=await account();await grant(id,120);const videos=await Promise.all(Array.from({length:20},()=>video(id)));
    const results=await Promise.all(videos.map(v=>reserve(v)));expect(results.filter(r=>r==='reserved')).toHaveLength(1);
    const winner=videos[results.indexOf('reserved')]!;expect(await reserve(winner,121)).toBe('reserved');
    expect(await readCreditBalance(pool,id,now)).toMatchObject({available_seconds:0,reserved_seconds:120});
    const c=await pool.query('SELECT billable_seconds FROM video_credit_charge WHERE video_id=$1',[winner]);expect(c.rows).toEqual([{billable_seconds:120}]);
    await fail(winner);await fail(winner);expect(await readCreditBalance(pool,id,now)).toMatchObject({available_seconds:120,reserved_seconds:0});
    expect(await reserve(winner)).toBe('reserved');expect((await pool.query('SELECT cycle FROM video_credit_charge WHERE video_id=$1 ORDER BY cycle',[winner])).rows).toEqual([{cycle:1},{cycle:2}]);
  });
  it('expired release recovers only held units for 24h and only original input',async()=>{
    const id=await account(),g=await grant(id,600,new Date(now.getTime()+1000)),v=await video(id);
    await reserve(v,120);await fail(v,new Date(now.getTime()+2000));await fail(v,new Date(now.getTime()+3000));
    const result=(await pool.query("SELECT * FROM credit_grant WHERE account_id=$1 AND source='recovery'",[id])).rows;
    expect(result).toHaveLength(1);expect(result[0]).toMatchObject({total_seconds:120,remaining_seconds:120,recovery_video_id:v,original_entitlement_ref:g});
    expect(result[0].expires_at.getTime()-result[0].available_at.getTime()).toBe(day);
    expect(await readCreditBalance(pool,id,new Date(now.getTime()+2000))).toMatchObject({available_seconds:0,recovery_seconds:120});
    const another=await video(id);expect(await reserve(another,120,new Date(now.getTime()+2000))).toBe('shortage');
    expect(await reserve(v,120,new Date(now.getTime()+2000))).toBe('reserved');
  });
  it('exact SKU grants, duplicate event IDs and alternative provider payments cannot double fulfill',async()=>{
    for(const sku of ['start_v1','pro_v1','addon_v1'] as const) {
      const id=await account(),{i,p}=await buy(id,sku);
      const results=await Promise.all(Array.from({length:20},()=>applyVerifiedPayment(pool,{...p,eventKey:key()})));
      expect(results.filter(r=>r.applied)).toHaveLength(1);
      expect((await pool.query('SELECT sum(total_seconds)::int n FROM credit_grant WHERE account_id=$1',[id])).rows[0].n).toBe(CREDIT_SKUS[sku].seconds);
      expect(await applyVerifiedPayment(pool,{...p,eventKey:key(),payment:{...p.payment,id:key()}})).toMatchObject({applied:false,reason:'intent_already_fulfilled'});
      expect(await createPaymentIntent(pool,{accountId:id,sku:sku==='start_v1'?'pro_v1':'start_v1',billingMode:'credits_v1',priceMinor:sku==='start_v1'?399000:99000,idempotencyKey:(await pool.query('SELECT idempotency_key FROM payment_intent WHERE id=$1',[i.intent.id])).rows[0].idempotency_key})).toEqual({kind:'conflict'});
      await expect(pool.query("UPDATE payment_intent SET grant_seconds=1 WHERE id=$1",[i.intent.id])).rejects.toThrow('immutable');
    }
  });
  it('base renewals serialize future periods; exhausted add-on still grants independent paid rights',async()=>{
    const id=await account(),start=await buy(id,'start_v1');await applyVerifiedPayment(pool,start.p);
    const pro=await Promise.all([buy(id,'pro_v1'),buy(id,'pro_v1')]);await Promise.all(pro.map(x=>applyVerifiedPayment(pool,x.p)));
    const base=(await pool.query('SELECT available_at,expires_at,total_seconds FROM credit_grant WHERE account_id=$1 ORDER BY available_at',[id])).rows;
    expect(base.map(g=>g.available_at.getTime()-now.getTime())).toEqual([0,30*day,60*day]);
    expect((await readCreditBalance(pool,id,now))?.available_seconds).toBe(18000);
    const addon=await buy(id,'addon_v1',new Date(now.getTime()+85*day));await applyVerifiedPayment(pool,addon.p);
    await pool.query("UPDATE credit_grant SET remaining_seconds=0 WHERE account_id=$1",[id]);
    const at=new Date(now.getTime()+100*day);
    expect((await pool.query(`SELECT ${effectivePlanSql('a','$2')} plan FROM account a WHERE id=$1`,[id,at])).rows[0].plan).toBe('paid');
    expect((await pool.query(`SELECT ${effectivePlanSql('a','$2')} plan FROM account a WHERE id=$1`,[id,new Date(now.getTime()+115*day)])).rows[0].plan).toBe('free');
  });
  it('old 990 intent remains legacy daily after late payment; no credit grant',async()=>{
    const id=await account('legacy_daily_v1'),i=await createPaymentIntent(pool,{accountId:id,priceMinor:99000,idempotencyKey:key()});if(i.kind!=='created')throw new Error();
    expect(await applyVerifiedPayment(pool,{provider:'fake',eventKey:key(),payloadSha256:'a'.repeat(64),payment:{id:key(),orderId:i.intent.id,amountMinor:99000,feeMinor:null,paidAt:now.toISOString()}})).toMatchObject({applied:true});
    expect((await pool.query('SELECT count(*)::int n FROM credit_grant WHERE account_id=$1',[id])).rows[0].n).toBe(0);
    expect((await pool.query('SELECT billing_policy,plan FROM account WHERE id=$1',[id])).rows[0]).toEqual({billing_policy:'legacy_daily_v1',plan:'paid'});
  });
  it('account→video barrier prevents erasure/recovery FK deadlock and removes all personal credit links',async()=>{
    const id=await account();await grant(id,120,new Date(now.getTime()+1000));const v=await video(id);await reserve(v);
    const tx=await pool.connect();await tx.query('BEGIN');await tx.query('SELECT id FROM account WHERE id=$1 FOR UPDATE',[id]);
    const pending=fail(v,new Date(now.getTime()+2000));
    for(let i=0;i<100;i++) {
      if((await pool.query("SELECT 1 FROM pg_stat_activity WHERE application_name=$1 AND wait_event_type='Lock'",[schema])).rowCount)break;
      if(i===99)throw new Error('barrier not reached');await new Promise(r=>setTimeout(r,10));
    }
    await tx.query("UPDATE account SET status='erasing' WHERE id=$1",[id]);await tx.query('COMMIT');tx.release();await pending;
    const storage={delete:async()=>{},erasePrefix:async()=>{},eraseClipPrefix:async()=>{}};
    await eraseAccount(pool,storage,id,now);
    expect((await pool.query('SELECT count(*)::int n FROM credit_grant WHERE account_id=$1',[id])).rows[0].n).toBe(0);
    expect((await pool.query('SELECT count(*)::int n FROM video_credit_charge WHERE video_id=$1',[v])).rows[0].n).toBe(0);
  });
  it('trusted probe seconds reserve once across provider retries and explicit new fences; provider budgets still count',async()=>{
    const {acceptProbe}=await import('../packages/db/src/probe');
    const {ensureInitialAttempt}=await import('../packages/db/src/attempts');
    const {authorizeSttCall,failTranscription}=await import('../packages/db/src/transcription');
    const {VideoRetryService}=await import('../apps/web/src/server/video-retry');
    const {loadLimits}=await import('../packages/shared/src/config');
    const limits=loadLimits(environment()),id=await account();await grant(id,600);const v=await video(id),attempt=(await ensureInitialAttempt(pool,v))!;
    await pool.query('UPDATE job_attempt SET started_at=$2 WHERE video_id=$1',[v,now]);
    expect(await acceptProbe(pool,attempt,limits,120.1,now)).toBe('transcribing');
    expect(await authorizeSttCall(pool,attempt,limits,0,120.1,now,0)).toBe(1);
    expect(await authorizeSttCall(pool,attempt,limits,0,120.1,now,1)).toBe(2);
    expect(await readCreditBalance(pool,id,now)).toMatchObject({reserved_seconds:121,available_seconds:479});
    expect((await pool.query("SELECT used FROM quota_counter WHERE scope='user_minutes' AND scope_key=$1",[id])).rows[0].used).toBe(6);
    expect(await failTranscription(pool,attempt,'stt_failed',now)).toBe(true);
    const jobs:import('../packages/db/src/attempts').Attempt[]=[];
    await new VideoRetryService(pool,limits,async a=>{jobs.push(a);},()=>now).retry(id,v);
    expect(await acceptProbe(pool,jobs[0]!,limits,120.01,now)).toBe('transcribing');
    expect(await readCreditBalance(pool,id,now)).toMatchObject({reserved_seconds:121,available_seconds:479});
    expect((await pool.query('SELECT billable_seconds FROM video WHERE id=$1',[v])).rows[0].billable_seconds).toBe(121);
    expect((await pool.query("SELECT used FROM quota_counter WHERE scope='user_minutes' AND scope_key=$1",[id])).rows[0].used).toBe(9);
    const empty=await account(),refused=await video(empty),refusedAttempt=(await ensureInitialAttempt(pool,refused))!;
    expect(await acceptProbe(pool,refusedAttempt,limits,120,now)).toBe('failed');
    expect(await authorizeSttCall(pool,refusedAttempt,limits,0,120,now)).toBeNull();
    expect((await pool.query('SELECT failure_reason FROM video WHERE id=$1',[refused])).rows[0].failure_reason).toBe('refused_credit_balance');
    expect((await pool.query('SELECT count(*)::int n FROM quota_counter WHERE scope_key=$1',[empty])).rows[0].n).toBe(0);
  });
  it('first usable partial output settles once; watchdog failure and stale output cannot refund success',async()=>{
    const {leaseAttempt}=await import('../packages/db/src/attempts');
    const {publishRenderResult}=await import('../packages/db/src/render');
    const {watchdogTick}=await import('../apps/web/src/server/watchdog');
    const id=await account();await grant(id,600,new Date(now.getTime()+1000));const v=await video(id);await reserve(v);
    await pool.query("UPDATE video SET status='rendering',clips_total=2,updated_at=$2 WHERE id=$1",[v,now]);
    const attempts=[];
    for(let i=1;i<=2;i++) {
      const c=(await pool.query<{id:string}>(`INSERT INTO clip(video_id,"index",start_seconds,end_seconds,title,status,watermarked)
        VALUES($1,$2,0,20,'clip','queued',true) RETURNING id`,[v,i])).rows[0]!.id;
      await pool.query('INSERT INTO clip_link(clip_id,code) VALUES($1,$2)',[c,randomBytes(3).toString('hex')]);
      attempts.push((await leaseAttempt(pool,v,'render',1,c))!);
    }
    const output={object_key:'clip',thumbnail_key:'thumb',bytes:10,watermarked:true,duration_seconds:20};
    expect(await publishRenderResult(pool,attempts[0]!,output,async()=>10)).toBe(true);
    expect((await readCreditBalance(pool,id,now))?.reserved_seconds).toBe(0);
    expect((await pool.query('SELECT state FROM video_credit_charge WHERE video_id=$1',[v])).rows[0].state).toBe('settled');
    await pool.query('UPDATE video SET updated_at=$2 WHERE id=$1',[v,now]);
    await watchdogTick(pool,async()=>{},new Date(now.getTime()+31*60_000));
    expect((await pool.query('SELECT state FROM video_credit_charge WHERE video_id=$1',[v])).rows[0].state).toBe('settled');
    expect(await publishRenderResult(pool,attempts[1]!,output,async()=>10)).toBe(false);
    expect((await pool.query("SELECT count(*)::int n FROM credit_grant WHERE account_id=$1 AND source='recovery'",[id])).rows[0].n).toBe(0);
  });
  it('zero-result watchdog wins barrier before late render publication and returns expired units only once',async()=>{
    const {leaseAttempt}=await import('../packages/db/src/attempts');
    const {publishRenderResult}=await import('../packages/db/src/render');
    const {watchdogTick}=await import('../apps/web/src/server/watchdog');
    const id=await account();await grant(id,600,new Date(now.getTime()+1000));const v=await video(id);await reserve(v);
    await pool.query("UPDATE video SET status='rendering',clips_total=1,updated_at=$2 WHERE id=$1",[v,now]);
    const c=(await pool.query<{id:string}>(`INSERT INTO clip(video_id,"index",start_seconds,end_seconds,title,status,watermarked)
      VALUES($1,1,0,20,'clip','queued',true) RETURNING id`,[v])).rows[0]!.id;
    await pool.query('INSERT INTO clip_link(clip_id,code) VALUES($1,$2)',[c,randomBytes(3).toString('hex')]);
    const attempt=(await leaseAttempt(pool,v,'render',1,c))!;
    let publishStarted!:()=>void,releasePublish!:()=>void;
    const started=new Promise<void>(r=>{publishStarted=r;}),barrier=new Promise<void>(r=>{releasePublish=r;});
    const late=publishRenderResult(pool,attempt,{object_key:'late',thumbnail_key:'late-thumb',bytes:10,watermarked:true,duration_seconds:20},async()=>{publishStarted();await barrier;return 10;});
    await started;await watchdogTick(pool,async()=>{},new Date(now.getTime()+31*60_000));releasePublish();expect(await late).toBe(false);
    await watchdogTick(pool,async()=>{},new Date(now.getTime()+32*60_000));
    expect((await pool.query('SELECT state FROM video_credit_charge WHERE video_id=$1',[v])).rows[0].state).toBe('released');
    const recovered=(await pool.query("SELECT total_seconds FROM credit_grant WHERE account_id=$1 AND source='recovery'",[id])).rows;
    expect(recovered).toEqual([{total_seconds:120}]);
  });
  it('credit checkout rejects immediate upgrade before intent/provider and returns actual named package periods',async()=>{
    const {createBillingDependencies}=await import('../apps/web/src/server/billing-deps');
    const {createCheckoutHandler,createCheckoutStatusHandler}=await import('../apps/web/src/server/billing-handler');
    const {createFakePaymentProvider}=await import('../apps/web/src/server/payments/fake');
    const id=await account(),provider=createFakePaymentProvider();let providerCalls=0;
    const create=provider.createPayment.bind(provider);provider.createPayment=async input=>{providerCalls++;return create(input);};
    const deps=createBillingDependencies({pool,billingMode:'credits_v1',publicOrigin:'https://test.invalid',trustedProxyHops:2,provider,
      allowMutation:async()=>true,allowRead:async()=>true,authenticate:async()=>({account_id:id})});
    const req=(body:unknown)=>new Request('https://test.invalid/api/checkout',{method:'POST',headers:{origin:'https://test.invalid','x-forwarded-for':'198.51.100.7, 10.0.0.2, 10.0.0.3',cookie:'__Host-n5_session=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx','content-type':'application/json'},body:JSON.stringify(body)});
    const checkout=createCheckoutHandler(deps);
    expect((await checkout(req({operation:'immediate_upgrade',sku:'pro_v1',idempotency_key:key()}))).status).toBe(422);
    expect(providerCalls).toBe(0);expect((await pool.query('SELECT count(*)::int n FROM payment_intent WHERE account_id=$1',[id])).rows[0].n).toBe(0);
    for(const body of [{sku:'wat',idempotency_key:key()},{sku:'start_v1',idempotency_key:key(),price_minor:1},{idempotency_key:key()}]) expect((await checkout(req(body))).status).toBe(422);
    const response=await checkout(req({sku:'addon_v1',idempotency_key:key()}));expect(response.status).toBe(201);
    const intent=(await response.json()).data.intent_id as string;
    await applyVerifiedPayment(pool,{provider:'fake',eventKey:key(),payloadSha256:'a'.repeat(64),payment:{id:(await pool.query('SELECT provider_payment_id FROM payment_intent WHERE id=$1',[intent])).rows[0].provider_payment_id,orderId:intent,amountMinor:149000,feeMinor:null,paidAt:new Date().toISOString()}});
    const status=await createCheckoutStatusHandler(deps)(new Request('https://test.invalid/api/checkout/'+intent,{headers:{cookie:'__Host-n5_session=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx','x-forwarded-for':'198.51.100.7, 10.0.0.2, 10.0.0.3'}}),intent);
    expect((await status.json()).data).toMatchObject({sku:'addon_v1',package_title:'Дополнительный пакет',grant_seconds:36000,account_plan:'paid',period_start:expect.any(String),period_end:expect.any(String)});
    const disabled=createCheckoutHandler({...deps,billingMode:'legacy'});expect((await disabled(req({sku:'start_v1',idempotency_key:key()}))).status).toBe(422);
  });
  it('payment and probe wait behind erasure barrier and issue no late grant or hold',async()=>{
    const id=await account();await grant(id,600);const v=await video(id),purchase=await buy(id,'pro_v1');
    const tx=await pool.connect();await tx.query('BEGIN');await tx.query('SELECT id FROM account WHERE id=$1 FOR UPDATE',[id]);
    const pendingPayment=applyVerifiedPayment(pool,purchase.p),pendingProbe=reserve(v);
    for(let i=0;i<100;i++) {
      const waiters=(await pool.query<{n:number}>("SELECT count(*)::int n FROM pg_stat_activity WHERE application_name=$1 AND wait_event_type='Lock'",[schema])).rows[0]!.n;
      if(waiters>=2)break;if(i===99)throw new Error('two financial waiters barrier not reached');await new Promise(r=>setTimeout(r,10));
    }
    await tx.query("UPDATE account SET status='erasing' WHERE id=$1",[id]);await tx.query('COMMIT');tx.release();
    expect(await pendingPayment).toMatchObject({applied:false,reason:'account_erasing'});
    expect(await pendingProbe).not.toBe('reserved');
    expect((await pool.query("SELECT count(*)::int n FROM credit_grant WHERE account_id=$1 AND source='payment'",[id])).rows[0].n).toBe(0);
    expect((await pool.query('SELECT count(*)::int n FROM video_credit_charge WHERE video_id=$1',[v])).rows[0].n).toBe(0);
  });
  it('lifetime trial constraint and nonnegative counters are enforced by SQL independently of helpers',async()=>{
    const id=await account();await grant(id,120);
    await expect(pool.query(`INSERT INTO credit_grant(account_id,source,source_key,total_seconds,remaining_seconds)
      VALUES($1,'migration_trial',$2,1800,1800)`,[id,key()])).rejects.toThrow();
    await expect(pool.query('UPDATE credit_grant SET remaining_seconds=-1 WHERE account_id=$1',[id])).rejects.toThrow();
    await expect(pool.query('UPDATE credit_grant SET reserved_seconds=total_seconds+1 WHERE account_id=$1',[id])).rejects.toThrow();
  });

  it('additive migration rehearsal preserves scrubbed legacy paid, operator, pending invoice and in-flight cohorts without gifts',async()=>{
    const {mkdtemp,readdir,copyFile,rm}=await import('node:fs/promises');
    const {tmpdir}=await import('node:os');const path=await import('node:path');
    const oldSchema=`credit_old_${randomBytes(8).toString('hex')}`,directory=await mkdtemp(path.join(tmpdir(),'n5-credit-old-schema-'));
    const oldPool=createPool(url!,oldSchema);
    try{
      await oldPool.query(`CREATE SCHEMA ${oldSchema}`);
      for(const name of await readdir('packages/db/migrations')) if(name.endsWith('.sql') && !name.startsWith('022_'))await copyFile(path.join('packages/db/migrations',name),path.join(directory,name));
      await migrate(oldPool,directory);
      const a=(await oldPool.query<{id:string}>(`INSERT INTO account(email,password_hash,plan,plan_source,plan_paid_until)
        VALUES('old-paid@test.invalid','x','paid','payment','2031-01-01'),('old-operator@test.invalid','x','paid','operator',NULL),('old-free@test.invalid','x','free','none',NULL) RETURNING id`)).rows;
      const i=(await oldPool.query<{id:string}>(`INSERT INTO payment_intent(account_id,price_minor,idempotency_key) VALUES($1,99000,'legacy_invoice') RETURNING id`,[a[2]!.id])).rows[0]!.id;
      await oldPool.query(`INSERT INTO video(account_id,idempotency_key,source,declared_bytes,status) VALUES($1,'legacy_job','upload',1,'transcribing')`,[a[0]!.id]);
      await migrate(oldPool);await migrate(oldPool);
      expect((await oldPool.query('SELECT DISTINCT billing_policy FROM account')).rows).toEqual([{billing_policy:'legacy_daily_v1'}]);
      expect((await oldPool.query('SELECT DISTINCT billing_policy FROM video')).rows).toEqual([{billing_policy:'legacy_daily_v1'}]);
      expect((await oldPool.query('SELECT count(*)::int n FROM credit_grant')).rows[0].n).toBe(0);
      expect((await oldPool.query('SELECT sku,grant_seconds,status FROM payment_intent WHERE id=$1',[i])).rows[0]).toEqual({sku:'legacy_pro990_v1',grant_seconds:0,status:'created'});
      expect((await oldPool.query("SELECT count(*)::int n FROM account WHERE plan='paid'")).rows[0].n).toBe(2);
    }finally{await oldPool.query(`DROP SCHEMA IF EXISTS ${oldSchema} CASCADE`);await oldPool.end();await rm(directory,{recursive:true,force:true});}
  });

  it('one verified provider payment cannot be rebound to a second intent or account',async()=>{
    const a=await account(),b=await account(),first=await buy(a,'addon_v1'),second=await buy(b,'addon_v1');
    expect(await applyVerifiedPayment(pool,first.p)).toMatchObject({applied:true});
    expect(await applyVerifiedPayment(pool,{...second.p,payment:{...second.p.payment,id:first.p.payment.id}})).toEqual({applied:false,reason:'duplicate'});
    expect((await pool.query("SELECT count(*)::int n FROM credit_grant WHERE account_id=$1 AND source='payment'",[b])).rows[0].n).toBe(0);
    expect((await pool.query('SELECT status FROM payment_intent WHERE id=$1',[second.i.intent.id])).rows[0].status).toBe('created');
  });
  it('failed credit signup rolls back account, trial and session together',async()=>{
    const store=new PgAuthStore(pool,'credits_v1'),first=`${key()}@test.invalid`,second=`${key()}@test.invalid`;
    const session={hash:randomBytes(32).toString('hex'),ipPrefix:'198.51.100.0/24',expiresAt:new Date(Date.now()+day)};
    await store.register(first,'hash',session);await expect(store.register(second,'hash',session)).rejects.toThrow();
    expect((await pool.query('SELECT count(*)::int n FROM account WHERE email=$1',[second])).rows[0].n).toBe(0);
    expect((await pool.query('SELECT count(*)::int n FROM session WHERE cookie_token_hash=$1',[session.hash])).rows[0].n).toBe(1);
    expect((await pool.query('SELECT count(*)::int n FROM credit_grant g JOIN account a ON a.id=g.account_id WHERE a.email=$1',[first])).rows[0].n).toBe(1);
  });

  it('multiple committed future base periods show server-derived prospective dates before payment and exclude addon windows',async()=>{
    const {readCreditPurchaseWindows}=await import('../packages/db/src/credits');
    const {createElement}=await import('react');const {renderToStaticMarkup}=await import('react-dom/server');
    const {UpgradeScreen}=await import('../apps/web/src/app/upgrade/UpgradeScreen');
    const id=await account();
    for(const sku of ['start_v1','pro_v1','pro_v1'] as const){const purchase=await buy(id,sku);await applyVerifiedPayment(pool,purchase.p);}
    const windows=await readCreditPurchaseWindows(pool,id,now);
    expect(windows).toEqual({asOf:'2030-01-01T00:00:00.000Z',baseStart:'2030-04-01T00:00:00.000Z',baseEnd:'2030-05-01T00:00:00.000Z',addonStart:'2030-01-01T00:00:00.000Z',addonEnd:'2030-01-31T00:00:00.000Z',scheduled:true});
    const html=renderToStaticMarkup(createElement(UpgradeScreen,{purchaseWindows:windows!,creditMode:true,salesEnabled:true,title:'Pro',price:'990 ₽',days:30,paidMinutes:270,current:{plan:'free',plan_source:'none',plan_paid_until:null}}));
    expect(html.match(/dateTime="2030-04-01T00:00:00.000Z"/g)).toHaveLength(2);
    expect(html.match(/dateTime="2030-05-01T00:00:00.000Z"/g)).toHaveLength(2);
    expect(html).toContain('1 апреля 2030');expect(html).toContain('1 мая 2030');
    expect(html).toContain('Начнётся позже');expect(html).toContain('Даты предварительные');expect(html).toContain('Итоговые даты покажем после подтверждения оплаты');
    const addonOnly=await account(),addon=await buy(addonOnly,'addon_v1');await applyVerifiedPayment(pool,addon.p);
    expect(await readCreditPurchaseWindows(pool,addonOnly,now)).toMatchObject({baseStart:now.toISOString(),scheduled:false});
    await pool.query("UPDATE account SET plan='paid',plan_source='payment',plan_paid_until='2030-02-15T00:00:00Z' WHERE id=$1",[addonOnly]);
    expect(await readCreditPurchaseWindows(pool,addonOnly,now)).toMatchObject({baseStart:'2030-02-15T00:00:00.000Z',baseEnd:'2030-03-17T00:00:00.000Z',scheduled:true});
  });

});
