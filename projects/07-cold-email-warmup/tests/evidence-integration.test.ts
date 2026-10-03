import assert from 'node:assert/strict';
import { randomBytes,randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { loadConfig } from '../src/config.js';
import { createPool,migrate } from '../src/db.js';
import { application } from '../src/server.js';
import { publicProjection } from '../src/growth/reports.js';
import type { Observation } from '../src/evidence/input.js';
import type { Identity } from '../src/auth/store.js';
import { seedTestEntitlement } from './billing-fixture.js';
const day=86400000;
function observation(end:number,numerator=10,denominator=30):Observation {
 return {sourceUrl:'https://source.example/private/PII_EMAIL_CANARY@example.test?secret=PII_CREDENTIAL_CANARY',reference:'PII_TENANT_CANARY PII_MAILBOX_CANARY <script>alert(1)</script>',observedAt:new Date(end).toISOString(),windowStart:new Date(end-day).toISOString(),windowEnd:new Date(end).toISOString(),metric:'inbox_placement',unit:'count',direction:'higher',numerator,denominator,manualVerified:true};
}
test('F05 B1–B6 real PostgreSQL HTTP evidence and public report gates',async t=>{
 const config={...loadConfig(),billingMode:'local_test' as const},pool=createPool(config.databaseUrl);await migrate(pool);await pool.query('TRUNCATE tenant,auth_bucket,public_stop_bucket CASCADE');
 const app=await application(config,pool);await new Promise<void>(r=>app.server.listen(0,'127.0.0.1',r));const addr=app.server.address();assert.ok(addr && typeof addr==='object');const base=`http://127.0.0.1:${addr.port}`;
 const request=async(path:string,method='GET',cookie?:string,payload:unknown={},origin:string|null=config.origin)=>{
  const response=await fetch(base+path,{method,headers:{'Content-Type':'application/json',...(origin?{Origin:origin}:{}),...(cookie?{Cookie:cookie}:{})},body:method==='GET'?undefined:JSON.stringify(payload)});
  const text=await response.text();return {status:response.status,text,data:response.headers.get('content-type')?.includes('application/json')?JSON.parse(text):null,cookie:response.headers.get('set-cookie')?.split(';')[0]};
 };
 const register=async(n:string)=>{const r=await request('/api/auth/register','POST',undefined,{email:n+'@example.test',password:randomBytes(20).toString('hex')});assert.equal(r.status,201);return {cookie:r.cookie!,identity:(await request('/api/auth/me','GET',r.cookie)).data.data as Identity};};
 try {
  const owner=await register('evidence-owner'),other=await register('evidence-other'),tenant=owner.identity.tenant_id;
  const record=async(o:Observation,cookie=owner.cookie)=>{const r=await request('/api/evidence','POST',cookie,o);assert.equal(r.status,201);return r.data.data.id as string;};
  const now=Date.now(),baseline=observation(now-2*day),latest=observation(now-day,20);
  let baselineId='',latestId='',reportId='',reportUrl='';
  await t.test('B1 owner input manual provenance unknown and no external source IO',async()=>{
   const empty=await request('/api/evidence','GET',owner.cookie);assert.equal(empty.data.data.reputation,'unknown');assert.deepEqual(empty.data.data.observations,[]);
   assert.equal((await request('/api/evidence','POST',undefined,baseline)).status,401);
   assert.equal((await request('/api/evidence','POST',owner.cookie,baseline,'https://wrong.test')).status,403);
   for(const extra of [{manualVerified:false},{denominator:Infinity},{metric:'invented_reputation'},{windowEnd:baseline.windowStart},{sourceUrl:'javascript:alert(1)'},{rawHTML:'<script>'}]) assert.equal((await request('/api/evidence','POST',owner.cookie,{...baseline,...extra})).status,400);
   assert.equal((await request('/api/evidence','POST',owner.cookie,observation(Date.now()+day))).data.error.code,'future_observation');
   baselineId=await record(baseline);latestId=await record(latest);
   assert.equal((await request('/api/evidence','GET',other.cookie)).data.data.observations.length,0);
   const privateList=await request('/api/evidence','GET',owner.cookie);assert.equal(privateList.data.data.provenance,'manual/user-confirmed');assert.ok(privateList.text.includes('PII_EMAIL_CANARY'));
   await assert.rejects(pool.query('UPDATE evidence_observation SET evidence=$1 WHERE id=$2',[latest,baselineId]));
  });
  await t.test('B2 owner pair, stale/incomparable/noimprovement and foreign404',async()=>{
   const compare=async(b:string,l:string,cookie=owner.cookie)=>request('/api/evidence/compare','POST',cookie,{baselineId:b,latestId:l});
   assert.equal((await compare(baselineId,latestId)).data.data.reason,'improved');
   assert.equal((await compare(baselineId,latestId,other.cookie)).status,404);
   const bad=await record({...latest,sourceUrl:'https://other-source.test/private'}),same=await record({...latest,numerator:10}),old=await record(observation(now-8*day,20));
   for(const [id,reason] of [[bad,'incomparable'],[same,'noimprovement'],[old,'stale']]) {
    const r=await request('/api/reports','POST',owner.cookie,{baselineId,latestId:id,idempotencyKey:randomUUID()});assert.equal(r.status,409);assert.equal(r.data.error.code,reason);
   }
   assert.equal((await request('/api/reports','POST',other.cookie,{baselineId,latestId,idempotencyKey:randomUUID()})).status,404);
  });
  await t.test('B3 concurrent explicit share yields ONE report/event and payload409',async()=>{
   const key=randomUUID(),payload={baselineId,latestId,idempotencyKey:key};
   assert.equal((await request('/api/reports','POST',undefined,payload)).status,401);
   assert.equal((await request('/api/reports','POST',owner.cookie,payload,null)).status,403);
   assert.equal((await request('/api/reports','POST',owner.cookie,{...payload,paid:true})).status,400);
   const results=await Promise.all(Array.from({length:12},()=>request('/api/reports','POST',owner.cookie,payload)));
   assert.ok(results.every(r=>r.status===201));assert.equal(new Set(results.map(r=>r.data.data.url)).size,1);
   reportId=results[0]!.data.data.id;reportUrl=results[0]!.data.data.url;assert.match(reportUrl,/^\/reports\/[A-Za-z0-9_-]{43}$/);
   assert.equal(Number((await pool.query('SELECT count(*) FROM evidence_report')).rows[0].count),1);assert.equal(Number((await pool.query('SELECT count(*) FROM evidence_event')).rows[0].count),1);
   assert.equal((await request('/api/reports','POST',owner.cookie,{...payload,baselineId:latestId})).status,409);
   await assert.rejects(pool.query("UPDATE evidence_report SET snapshot='{}' WHERE id=$1",[reportId]));
   const html=await request(reportUrl+'?paid=true');assert.equal(html.status,200);assert.ok(html.text.includes('manual/user-confirmed'));
   for(const forbidden of ['PII_EMAIL_CANARY','PII_CREDENTIAL_CANARY','PII_TENANT_CANARY','PII_MAILBOX_CANARY','<script>',tenant,owner.identity.account_id,baselineId,latestId]) assert.ok(!html.text.includes(forbidden));
   assert.ok(html.text.includes('https://source.example'));assert.equal((html.text.match(/data-n7-source-badge/g)??[]).length,1);
  });
  await t.test('B2/B3 HTTP denominators29/30 raw counts versus ratios and window guard',async()=>{
   const b29=await record({...baseline,denominator:29}),l30=await record({...latest,numerator:11});
   const raw=(await request('/api/reports','POST',owner.cookie,{baselineId:b29,latestId:l30,idempotencyKey:randomUUID()}));assert.equal(raw.status,201);
   const rawHtml=await request(raw.data.data.url);assert.ok(!rawHtml.text.includes('%'));assert.ok(rawHtml.text.includes('<td>29</td>'));
   const b30=await record(baseline);
   const ratio=await request('/api/reports','POST',owner.cookie,{baselineId:b30,latestId:l30,idempotencyKey:randomUUID()});assert.equal(ratio.status,201);assert.ok((await request(ratio.data.data.url)).text.includes('%'));
   const equalRatio=await record({...latest,numerator:20,denominator:60});assert.equal((await request('/api/reports','POST',owner.cookie,{baselineId:b30,latestId:equalRatio,idempotencyKey:randomUUID()})).data.error.code,'noimprovement');
   const badWindow=await record({...latest,windowStart:new Date(Date.parse(latest.windowStart)+1).toISOString()});assert.equal((await request('/api/reports','POST',owner.cookie,{baselineId,latestId:badWindow,idempotencyKey:randomUUID()})).data.error.code,'incomparable');
  });
  await t.test('B3 authoritative clock after waiting lock blocks expired create',async()=>{
   const b=await record(observation(Date.now()-8*day)),l=await record(observation(Date.now()-7*day+150,20));
   const db=await pool.connect();await db.query('BEGIN');await db.query('SELECT pg_advisory_xact_lock(8,hashtext($1))',[tenant]);
   const waiting=request('/api/reports','POST',owner.cookie,{baselineId:b,latestId:l,idempotencyKey:randomUUID()});
   await new Promise(r=>setTimeout(r,250));await db.query('COMMIT');db.release();
   const result=await waiting;assert.equal(result.status,409);assert.equal(result.data.error.code,'stale');
  });
  await t.test('B4 EVERY view current TEST entitlement, expiry and committed revocation',async()=>{
   await seedTestEntitlement(pool,tenant);
   assert.equal((await request(reportUrl+'?paid=false')).text.includes('data-n7-source-badge'),false);
   const entitlement=(await pool.query('SELECT intent_id,expires_at FROM billing_entitlement WHERE tenant_id=$1',[tenant])).rows[0];
   await pool.query('UPDATE billing_entitlement SET expires_at=clock_timestamp() WHERE intent_id=$1',[entitlement.intent_id]);
   assert.equal((await request(reportUrl+'?paid=true')).text.includes('data-n7-source-badge'),true);
   await pool.query('UPDATE billing_entitlement SET expires_at=$2 WHERE intent_id=$1',[entitlement.intent_id,entitlement.expires_at]);
   const db=await pool.connect();await db.query('BEGIN');await db.query('UPDATE billing_entitlement SET revoked_at=clock_timestamp() WHERE intent_id=$1',[entitlement.intent_id]);
   assert.equal((await request(reportUrl)).text.includes('data-n7-source-badge'),false);await db.query('COMMIT');db.release();
   assert.equal((await request(reportUrl+'?paid=true')).text.includes('data-n7-source-badge'),true);
   await pool.query('UPDATE billing_entitlement SET revoked_at=NULL WHERE intent_id=$1',[entitlement.intent_id]);
   const payment=(await pool.query('SELECT payment_id FROM billing_intent WHERE id=$1',[entitlement.intent_id])).rows[0].payment_id;
   await app.billingProvider.simulate(payment,{status:'revoked'});assert.ok((await request(reportUrl)).text.includes('data-n7-source-badge'));
   const snapshot=publicProjection(observation(now-10*day),observation(now-9*day,20),'ratios');
   const historicalToken=randomBytes(32).toString('base64url');
   await pool.query('INSERT INTO evidence_report(tenant_id,token,idempotency_key,baseline_id,latest_id,snapshot) VALUES($1,$2,$3,$4,$5,$6)',[tenant,historicalToken,randomUUID(),baselineId,latestId,snapshot]);
   const historical=await request('/reports/'+historicalToken);assert.ok(historical.text.includes('Historical snapshot; no current improvement claim.'));assert.ok(!historical.text.includes('<h1>Observed metric improvement'));
   assert.equal((await request('/reports/'+randomBytes(32).toString('base64url'))).status,404);
  });
  await t.test('B5 own aggregate counts explicit idempotent copy/link and bounded histories',async()=>{
   await request('/api/partner','POST',owner.cookie,{});
   const key=randomUUID(),payload={kind:'copy',idempotencyKey:key};
   const replies=await Promise.all(Array.from({length:8},()=>request('/api/reports/'+reportId+'/events','POST',owner.cookie,payload)));assert.ok(replies.every(r=>r.status===200));
   assert.equal((await request('/api/reports/'+reportId+'/events','POST',owner.cookie,{...payload,kind:'link'})).status,409);
   assert.equal((await request('/api/reports/'+reportId+'/events','POST',other.cookie,payload)).status,404);
   assert.equal((await request('/api/reports/'+reportId+'/events','POST',owner.cookie,{kind:'link',idempotencyKey:randomUUID()})).status,200);
   const status=await request('/api/partner','GET',owner.cookie);assert.equal(status.data.data.events.shares,3);assert.equal(status.data.data.events.copies,1);assert.equal(status.data.data.events.links,1);assert.equal(status.data.data.reward,null);assert.equal(status.data.data.label,'TEST');assert.equal(status.data.data.events.display,'counts_only');
   assert.equal((await request('/api/partner/'+status.data.data.code,'GET',other.cookie)).status,404);
   const events=await request('/api/growth/events?limit=1','GET',owner.cookie);assert.equal(events.data.data.length,1);assert.deepEqual(Object.keys(events.data.data[0]).sort(),['created_at','kind']);
   assert.deepEqual((await request('/api/growth/events','GET',other.cookie)).data.data,[]);
   assert.equal((await request('/api/reports?limit=1','GET',owner.cookie)).data.data.length,1);
   for(const path of ['/api/evidence?limit=101','/api/reports?offset=10001','/api/growth/events?limit=0']) assert.equal((await request(path,'GET',owner.cookie)).status,400);
   assert.equal((await request('/api/reports/'+reportId+'/revoke','POST',other.cookie,{})).status,404);
   assert.equal((await request('/api/reports/'+reportId+'/revoke','POST',owner.cookie,{})).status,200);assert.equal((await request(reportUrl)).status,404);assert.equal((await request('/api/reports/'+reportId+'/revoke','POST',owner.cookie,{})).status,200);
  });
  await t.test('B1/B5 server storage caps observations1000 reports200 events600',async()=>{
   const o=other.identity.tenant_id;
   const ob=await record(baseline,other.cookie),ol=await record(latest,other.cookie);
   await pool.query('INSERT INTO evidence_observation(tenant_id,evidence) SELECT $1,$2 FROM generate_series(1,998)',[o,baseline]);
   assert.equal((await request('/api/evidence','POST',other.cookie,baseline)).data.error.code,'history_limit');
   const ids=(await pool.query('SELECT id FROM evidence_observation WHERE tenant_id=$1 LIMIT 2',[o])).rows;
   await pool.query('UPDATE evidence_observation SET created_at=created_at WHERE id=$1',[ids[0]!.id]).then(()=>assert.fail('immutable observation'),()=>{});
   await pool.query('INSERT INTO evidence_report(tenant_id,token,idempotency_key,baseline_id,latest_id,snapshot) SELECT $1,gen_random_uuid()::text,gen_random_uuid()::text,$2,$3,$4 FROM generate_series(1,200)',[o,ids[0]!.id,ids[1]!.id,publicProjection(baseline,latest,'ratios')]);
   assert.equal((await request('/api/reports','POST',other.cookie,{baselineId:ob,latestId:ol,idempotencyKey:randomUUID()})).data.error.code,'history_limit');
   const validB=await record(baseline),validL=await record(latest); // owner remains below caps
   await pool.query('INSERT INTO evidence_event(tenant_id,report_id,kind,idempotency_key) SELECT $1,$2,\'copy\',gen_random_uuid()::text FROM generate_series(1,595)',[tenant,reportId]);
   assert.equal((await request('/api/reports','POST',owner.cookie,{baselineId:validB,latestId:validL,idempotencyKey:randomUUID()})).data.error.code,'history_limit');
   const activeReport=(await pool.query('SELECT id FROM evidence_report WHERE tenant_id=$1 AND revoked_at IS NULL LIMIT 1',[tenant])).rows[0].id;
   assert.equal((await request('/api/reports/'+activeReport+'/events','POST',owner.cookie,{kind:'copy',idempotencyKey:randomUUID()})).data.error.code,'history_limit');
   assert.equal((await request('/api/evidence?limit=100','GET',other.cookie)).data.data.observations.length,100);
   assert.equal((await request('/api/reports?limit=100','GET',other.cookie)).data.data.length,100);
  });
 } finally {await new Promise<void>((r,j)=>app.server.close(e=>e?j(e):r()));await pool.end();}
});
