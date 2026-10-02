import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes,randomUUID } from 'node:crypto';
import pg from 'pg';
import { createPool,transaction } from '../web/db.js';
import { migrate } from '../scripts/migrate.js';
import { createAttribution,TRACKING_TTL } from '../web/attribution.js';
import { createPartners } from '../web/partners.js';
import { createPayments } from '../web/payments.js';
import { createApp } from '../web/app.js';
import { tokenHash } from '../web/auth.js';

test('F03b isolated real PostgreSQL consent, partner registry and verified first-conversion aggregates',async t=>{
  if(!process.env.TEST_DATABASE_URL||process.env.N8_TEST_DB_OWNERSHIP!=='n8-f03b')throw new Error('Dedicated F03b PostgreSQL URL and ownership assertion required');
  const db=new URL(process.env.TEST_DATABASE_URL);
  if(!['localhost','127.0.0.1','[::1]','db'].includes(db.hostname))throw new Error('Dedicated local/internal database required');
  const admin=new pg.Pool({connectionString:db.href,max:2,connectionTimeoutMillis:2000});
  const schema='f03b_'+randomBytes(8).toString('hex');let pool,server;
  const config={secret:randomBytes(32).toString('hex'),secureCookie:false,runtime:'test',providerMode:'fixture',origin:'http://localhost:18088',platformDailyLimit:200,accountDailyLimit:20,storageDir:'/tmp/n8-f03b-http-private'};
  try {
    assert.match((await admin.query('SHOW server_version')).rows[0].server_version,/^16\./);
    await admin.query(`CREATE SCHEMA ${schema}`);db.searchParams.set('options',`-c search_path=${schema}`);
    pool=createPool(db.href);await migrate(pool);await migrate(pool);
    const attribution=createAttribution(pool,config),partners=createPartners(pool),payments=createPayments(pool,config);
    const row=async(table,id)=>(await pool.query(`SELECT * FROM ${table} WHERE id=$1`,[id])).rows[0];
    const count=async(table)=>(await pool.query(`SELECT count(*)::int AS n FROM ${table}`)).rows[0].n;
    async function owner(){const id=randomUUID();await pool.query('INSERT INTO account(id,email,password_hash) VALUES($1,$2,$3)',[id,id+'@example.test','unused']);return id;}
    const aOwner=await owner(),bOwner=await owner(),a=await partners.create(aOwner),b=await partners.create(bOwner);
    const body=(key=randomUUID(),code)=>({package:'ROOM20',idempotency_key:key,...(code?{partner_code:code}:{})});
    const cookie=r=>r.setCookie.split(';')[0];
    async function intent(id,code,header){const r=await payments.create(id,body(randomUUID(),code),{cookieHeader:header});await payments.runOne();return row('payment_intent',r.payment_id);}
    async function success(p) {
      const x=JSON.parse(p.provider_body),remote={id:p.provider_id,status:'succeeded',paid:true,amount:x.amount,metadata:x.metadata,recipient:{account_id:'fixture'}};
      await pool.query("UPDATE payment_fixture_object SET body=$2 WHERE kind='payment' AND id=$1",[p.provider_id,JSON.stringify(remote)]);
      return payments.notify({event:'payment.succeeded',object:{id:p.provider_id}});
    }
    async function refund(p){const id=randomUUID();await pool.query("INSERT INTO payment_fixture_object(kind,id,body) VALUES('refund',$1,$2)",
      [id,JSON.stringify({id,payment_id:p.provider_id,status:'succeeded',amount:{value:'1.00',currency:'RUB'}})]);return payments.notify({event:'refund.succeeded',object:{id}});}
    const totals=async(p,n)=>assert.deepEqual(await partners.aggregate(p.id),{first_conversions:n,amount_minor:String(n*90000),currency:'RUB'});

    await t.test('PARTNER-01 duplicate409 existing owner immutable binding, missing owner, inactive and self',async()=>{
      await assert.rejects(partners.create(bOwner,a.code),e=>e.status===409);
      await assert.rejects(partners.create(randomUUID()),e=>e.status===404);
      await assert.rejects(pool.query('INSERT INTO partner(id,code,active) VALUES($1,$2,true)',[randomUUID(),'ownerless_code']));
      await assert.rejects(pool.query('UPDATE partner SET account_id=$2 WHERE id=$1',[a.id,bOwner]));
      await assert.rejects(pool.query('UPDATE partner SET code=$2 WHERE id=$1',[a.id,'changed_code']));
      await assert.rejects(payments.create(aOwner,body(randomUUID(),a.code)),e=>e.status===422);
      await partners.activate(b.id,false);await assert.rejects(attribution.update(await owner(),{action:'manual',partner_code:b.code}),e=>e.status===422);await partners.activate(b.id,true);
    });
    await t.test('ATTR-01 cookie consent proof, denied/blocked/tampered/cross-account, expiry and manual',async()=>{
      const id=await owner();assert.equal((await attribution.state(id)).state.tracking_opt_in,false);
      await assert.rejects(attribution.update(id,{action:'capture',partner_code:a.code}),e=>e.status===403);
      let r=await attribution.update(id,{action:'accept',partner_code:a.code});let h=cookie(r);
      const s=await attribution.update(id,{action:'capture',partner_code:b.code},h);assert.equal(s.state.partner_code,a.code);assert.equal(s.setCookie,null);
      assert.equal((await intent(id,undefined,h)).partner_id,a.id);
      const original=(await pool.query('SELECT * FROM attribution WHERE account_id=$1',[id])).rows[0];
      const other=await owner();await pool.query("INSERT INTO tracking_consent(account_id,opted_in) VALUES($1,true)",[other]);
      await pool.query("INSERT INTO attribution(account_id,partner_id,source,cookie_consent_at,expires_at,cookie_hash) VALUES($1,$2,'cookie',$3,$4,$5)",[other,a.id,original.cookie_consent_at,original.expires_at,original.cookie_hash]);
      assert.equal((await intent(other,undefined,h)).partner_id,null);
      assert.equal((await intent(id)).partner_id,null);assert.equal((await attribution.state(id)).state.source,null);
      r=await attribution.update(id,{action:'capture',partner_code:a.code});h=cookie(r);
      const tampered='roomkind_attribution='+randomBytes(32).toString('base64url');assert.equal((await intent(id,undefined,tampered)).partner_id,null);
      r=await attribution.update(id,{action:'capture',partner_code:a.code});h=cookie(r);
      await pool.query("UPDATE attribution SET expires_at=clock_timestamp()-interval '1 second' WHERE account_id=$1",[id]);
      assert.equal((await intent(id,undefined,h)).partner_id,null);
      assert.equal((await pool.query('SELECT * FROM attribution WHERE account_id=$1',[id])).rowCount,0);
      assert.equal(TRACKING_TTL,2592000);
      r=await attribution.update(id,{action:'accept',partner_code:a.code});const denied=await attribution.update(id,{action:'deny'},cookie(r));
      assert.equal(denied.state.tracking_opt_in,false);assert.equal(denied.state.source,null);assert.match(denied.setCookie,/Max-Age=0/);
      assert.equal((await intent(id,b.code)).partner_id,b.id);
    });
    await t.test('ATTR-02 manual override invalid input effects0 immutable snapshot and simultaneous create/deny',async()=>{
      const id=await owner(),r=await attribution.update(id,{action:'accept',partner_code:a.code});
      await assert.rejects(attribution.update(id,{action:'manual',partner_code:'unknowncode'},cookie(r)),e=>e.status===422);
      assert.equal((await attribution.state(id,cookie(r))).state.partner_code,a.code);
      const p=await intent(id,b.code,cookie(r));assert.equal(p.partner_id,b.id);
      await attribution.update(id,{action:'manual',partner_code:a.code});assert.equal((await row('payment_intent',p.id)).partner_id,b.id);
      await assert.rejects(pool.query('UPDATE payment_intent SET partner_id=$2 WHERE id=$1',[p.id,a.id]));
      const v=await payments.create(id,body('same'));await attribution.update(id,{action:'manual',partner_code:b.code});
      assert.deepEqual(await payments.create(id,body('same')),v);
      const consent=await owner(),accepted=await attribution.update(consent,{action:'accept',partner_code:a.code});
      let pending;await transaction(pool,async c=>{
        await c.query('SELECT id FROM account WHERE id=$1 FOR UPDATE',[consent]);
        const denied=attribution.update(consent,{action:'deny'},cookie(accepted));
        const create=payments.create(consent,body('race'),{cookieHeader:cookie(accepted)});
        // Release before awaiting competing account locks; resolve outside this transaction.
        pending=[denied,create];
      });
      const [,created]=await Promise.all(pending);const snapshot=await row('payment_intent',created.payment_id);
      assert.ok(snapshot.partner_id===null||snapshot.partner_id===a.id);
      assert.equal((await attribution.state(consent)).state.source,null);
      assert.equal((await intent(consent)).partner_id,null);
    });
    await t.test('PARTNER-02 two partner totals exclude replay repeat hold review refunds and inactive rows',async()=>{
      const x=await owner(),y=await owner(),p=await intent(x,a.code);await success(p);
      await Promise.all(Array.from({length:10},()=>payments.notify({event:'payment.succeeded',object:{id:p.provider_id}})));
      await totals(a,1);await totals(b,0);
      const repeat=await intent(x,b.code);await success(repeat);await totals(a,1);await totals(b,0);
      const pb=await intent(y,b.code);await success(pb);await totals(b,1);
      const held=await owner();await pool.query('UPDATE account SET billing_hold=true WHERE id=$1',[held]);await success(await intent(held,a.code));await totals(a,1);
      const review=await intent(await owner(),a.code);await pool.query("UPDATE payment_intent SET status='review' WHERE id=$1",[review.id]);await success(review);await totals(a,1);
      await partners.activate(a.id,false);await totals(a,0);await partners.activate(a.id,true);await totals(a,1);
      await refund(p);await totals(a,0);await totals(b,1);await success(repeat);await totals(b,1);
      assert.equal((await row('account',x)).first_paid_payment_id,p.id);
      assert.equal((await pool.query('SELECT valid FROM first_conversion WHERE account_id=$1',[x])).rows[0].valid,false);
      const noPartner=await owner(),first=await intent(noPartner),later=await intent(noPartner,b.code);await success(first);await success(later);await refund(first);await totals(b,1);
      assert.equal((await row('account',noPartner)).first_paid_payment_id,first.id);
      assert.equal(await count('first_conversion'),2);
      assert.equal((await pool.query("SELECT count(*)::int AS n FROM information_schema.tables WHERE table_schema=$1 AND table_name ~ '(commission|payout|reward)'",[schema])).rows[0].n,0);
    });
    await t.test('ATTR-03 differently attributed concurrent successes select exactly one permanent winner',async()=>{
      const id=await owner(),p=await intent(id,a.code),q=await intent(id,b.code);
      await Promise.all([success(p),success(q)]);
      const account=await row('account',id),conversions=(await pool.query('SELECT * FROM first_conversion WHERE account_id=$1',[id])).rows;
      assert.equal(conversions.length,1);assert.equal(conversions[0].payment_intent_id,account.first_paid_payment_id);
      await refund(account.first_paid_payment_id===p.id?p:q);
      assert.equal((await row('account',id)).first_paid_payment_id,account.first_paid_payment_id);
      assert.equal((await pool.query('SELECT valid FROM first_conversion WHERE account_id=$1',[id])).rows[0].valid,false);
    });
    await t.test('HTTP exact Origin/authenticated bounded attribution; no public mint/edit/aggregate and essential session intact',async()=>{
      const id=await owner(),other=await owner(),token=randomBytes(32).toString('base64url');
      await pool.query("INSERT INTO session(token_hash,account_id,expires_at) VALUES($1,$2,clock_timestamp()+interval '1 day')",[tokenHash(token,config.secret),id]);
      server=createApp(pool,config);await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
      const base='http://127.0.0.1:'+server.address().port,essential='roomkind_session='+token;
      const request=(method,path,body,origin=config.origin,cookies=essential)=>fetch(base+path,{method,headers:{...(origin?{Origin:origin}:{}),Cookie:cookies,'Content-Type':'application/json'},...(body===undefined?{}:{body:typeof body==='string'?body:JSON.stringify(body)})});
      assert.equal((await request('GET','/api/attribution',undefined,config.origin,'')).status,401);
      for(const origin of [null,'null','https://foreign.test'])assert.equal((await request('GET','/api/attribution',undefined,origin)).status,403);
      assert.equal((await request('POST','/api/attribution',{action:'accept'},null)).status,403);
      assert.equal((await request('POST','/api/attribution',{action:'accept',account_id:other})).status,400);
      assert.equal((await request('POST','/api/attribution','x'.repeat(16385))).status,413);
      for(const path of ['/api/partners','/api/partners/'+a.id,'/api/partners/aggregate'])assert.equal((await request('POST',path,{})).status,404);
      const accepted=await request('POST','/api/attribution',{action:'accept',partner_code:a.code});assert.equal(accepted.status,200);
      const track=accepted.headers.get('set-cookie');assert.match(track,/HttpOnly; SameSite=Lax; Max-Age=2592000/);assert.doesNotMatch(track,/roomkind_session/);
      const json=await accepted.json();assert.deepEqual(Object.keys(json).sort(),['expires_at','partner_code','source','tracking_opt_in']);
      const denied=await request('POST','/api/attribution',{action:'deny'},config.origin,essential+'; '+track.split(';')[0]);assert.equal(denied.status,200);
      assert.match(denied.headers.get('set-cookie'),/Max-Age=0/);assert.doesNotMatch(denied.headers.get('set-cookie'),/roomkind_session/);
      assert.equal((await request('GET','/api/me')).status,200);
      const s=(await pool.query('SELECT * FROM session WHERE token_hash=$1',[tokenHash(token,config.secret)])).rows[0];assert.equal(s.revoked_at,null);
      const manual=await request('POST','/api/payments',body('http-manual',b.code));assert.equal(manual.status,202);assert.equal(manual.headers.get('set-cookie'),null);
    });
  }finally {
    if(server)await new Promise(resolve=>{server.close(resolve);server.closeAllConnections();});
    await pool?.end();await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);await admin.end();
  }
});
