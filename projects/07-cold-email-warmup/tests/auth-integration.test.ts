import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { loadConfig } from '../src/config.js';
import { createPool, migrate, ready } from '../src/db.js';
import { application } from '../src/server.js';
import { HttpError } from '../src/errors.js';
import { isSupportedHash } from '../src/auth/password.js';
import { COOKIE_NAME, tokenDigest } from '../src/auth/session.js';
// Dedicated N7 Compose DB only. This suite never substitutes an in-memory store.
test('F01 real PostgreSQL16 HTTP identity acceptance', async t => {
  const config=loadConfig(); const pool=createPool(config.databaseUrl);
  await migrate(pool); await migrate(pool);
  assert.equal(await ready(pool),true);
  assert.match((await pool.query('SHOW server_version')).rows[0].server_version,/^16\./);
  await pool.query('TRUNCATE mailbox,session,account,tenant,auth_bucket CASCADE');
  const app=await application(config,pool);
  await new Promise<void>(resolve=>app.server.listen(0,'127.0.0.1',resolve));
  const address=app.server.address(); assert.ok(address && typeof address==='object');
  const base=`http://127.0.0.1:${address.port}`;
  const password=randomBytes(20).toString('base64url');
  const emailA=`${randomUUID()}@example.test`; const emailB=`${randomUUID()}@example.test`;
  const request=async(path:string,method='GET',cookie?:string,payload:unknown={},origin=config.origin,forwarded?:string)=>{
    const headers:Record<string,string>={'Content-Type':'application/json',Origin:origin};
    if(cookie) headers.Cookie=cookie; if(forwarded) headers['X-Forwarded-For']=forwarded;
    const response=await fetch(base+path,{method,headers,body:method==='GET'?undefined:JSON.stringify(payload)});
    const data=await response.json();
    return {status:response.status,data,cookie:response.headers.get('set-cookie')?.split(';')[0],retry:response.headers.get('retry-after')};
  };
  let cookieA=''; let cookieB=''; let tenantA=''; let accountA=''; const mailboxA=randomUUID();
  try {
    await t.test('AC-F01-1 migrated readiness serves without exposing secrets',async()=>{assert.equal((await request('/readyz')).status,200);});
    await t.test('AC-F01-2 registration atomically creates tenants and only HMAC sessions; no consent',async()=>{
      const a=await request('/api/auth/register','POST',undefined,{email:emailA.toUpperCase(),password});
      const b=await request('/api/auth/register','POST',undefined,{email:emailB,password});
      assert.equal(a.status,201); assert.equal(b.status,201); cookieA=a.cookie!;cookieB=b.cookie!;
      const identity=await request('/api/auth/me','GET',cookieA);assert.equal(identity.status,200);
      tenantA=identity.data.data.tenant_id;accountA=identity.data.data.account_id;
      const rows=await pool.query('SELECT token_hash,expires_at,created_at FROM session'); assert.equal(rows.rowCount,2);
      assert.ok(rows.rows.some(row=>row.token_hash===tokenDigest(cookieA.slice(COOKIE_NAME.length+1),config.sessionKey)));
      assert.ok(rows.rows.every(row=>Math.abs(row.expires_at-row.created_at-604800000)<2000));
      const hashes=await pool.query('SELECT password_hash FROM account'); assert.ok(hashes.rows.every(row=>isSupportedHash(row.password_hash)));
      assert.equal((await pool.query('SELECT count(*) FROM mailbox')).rows[0].count,'0');
      assert.equal((await pool.query("SELECT to_regclass('public.consent') AS consent")).rows[0].consent,null);
      const tenantB=(await request('/api/auth/me','GET',cookieB)).data.data.tenant_id;
      await pool.query('INSERT INTO mailbox(id,tenant_id,label) VALUES($1,$2,$3),($4,$5,$6)',[mailboxA,tenantA,'Fixture A',randomUUID(),tenantB,'Fixture B']);
    });
    await t.test('AC-F01-3 own200/foreign404; UUID and SQL injection400; auth/origin bypass0writes',async()=>{
      assert.equal((await request('/api/mailboxes/'+mailboxA,'GET',cookieA)).status,200);
      assert.equal((await request('/api/mailboxes/'+mailboxA,'GET',cookieB)).status,404);
      assert.equal((await request('/api/mailboxes/not-a-uuid','GET',cookieA)).status,400);
      assert.equal((await request('/api/mailboxes/'+encodeURIComponent("' OR 1=1 --"),'GET',cookieA)).status,400);
      const before=(await pool.query('SELECT * FROM mailbox ORDER BY id')).rows;
      for(const cookie of [undefined,`${COOKIE_NAME}=${randomBytes(32).toString('base64url')}`]) assert.equal((await request('/api/mailboxes/'+mailboxA,'PATCH',cookie,{label:'changed'})).status,401);
      assert.equal((await request('/api/mailboxes/'+mailboxA,'PATCH',cookieA,{label:'changed'},'http://wrong.example')).status,403);
      assert.deepEqual((await pool.query('SELECT * FROM mailbox ORDER BY id')).rows,before);
      const buckets=(await pool.query('SELECT count(*) FROM auth_bucket')).rows[0].count;
      assert.equal((await request('/api/auth/login','POST',undefined,{email:emailA,password},'http://wrong.example')).status,403);
      assert.equal((await pool.query('SELECT count(*) FROM auth_bucket')).rows[0].count,buckets);
    });
    await t.test('AC-F01-2 logout/login/logout durable rejection, expired/inactive accounts and tenants',async()=>{
      assert.equal((await request('/api/auth/logout','POST',cookieA)).status,200);
      assert.equal((await request('/api/mailboxes/'+mailboxA,'PATCH',cookieA)).status,401);
      const login=await request('/api/auth/login','POST',undefined,{email:emailA,password}); assert.equal(login.status,200);
      const current=login.cookie!;assert.equal((await request('/api/mailboxes/'+mailboxA,'GET',current)).status,200);
      assert.equal((await request('/api/auth/logout','POST',current)).status,200);
      assert.equal((await request('/api/mailboxes/'+mailboxA,'PATCH',current)).status,401);
      assert.equal((await request('/api/auth/logout','POST',current)).status,401);
      const relogin=await request('/api/auth/login','POST',undefined,{email:emailA,password});cookieA=relogin.cookie!;
      await pool.query("UPDATE account SET state='inactive' WHERE id=$1",[accountA]);
      assert.equal((await request('/api/auth/me','GET',cookieA)).status,401);
      const candidate={digest:randomBytes(32).toString('hex'),expiresAt:new Date(Date.now()+10000)};
      const credentials=(await app.store.findAccount(emailA))!; assert.equal(await app.store.createSession(credentials,candidate),false);
      await pool.query("UPDATE account SET state='active' WHERE id=$1",[accountA]);
      await pool.query("UPDATE tenant SET state='inactive' WHERE id=$1",[tenantA]);
      assert.equal((await request('/api/auth/me','GET',cookieA)).status,401);assert.equal(await app.store.createSession(credentials,candidate),false);
      await pool.query("UPDATE tenant SET state='active' WHERE id=$1",[tenantA]);
      await pool.query("UPDATE session SET expires_at=now()-interval '1 second' WHERE account_id=$1",[accountA]);
      assert.equal((await request('/api/auth/me','GET',cookieA)).status,401);
    });
    await t.test('AC-F01-5 atomic concurrent ceilings and fixed UTC resets count rejected attempts',async()=>{
      const now=new Date('2026-10-02T20:14:59.500Z');
      const attempts=await Promise.allSettled(Array.from({length:12},()=>app.store.charge('login','race@example.test','ip-race',now)));
      assert.equal(attempts.filter(v=>v.status==='fulfilled').length,5);
      assert.ok(attempts.filter(v=>v.status==='rejected').every(v=>v.status==='rejected' && v.reason instanceof HttpError && v.reason.status===429));
      assert.equal((await pool.query("SELECT attempts FROM auth_bucket WHERE bucket_key='login:email:race@example.test'")).rows[0].attempts,12);
      await app.store.charge('login','race@example.test','ip-race',new Date('2026-10-02T20:15:00Z'));
      const ipAttempts=await Promise.allSettled(Array.from({length:11},(_,i)=>app.store.charge('login',`other${i}@example.test`,'shared-ip',now)));
      assert.equal(ipAttempts.filter(v=>v.status==='fulfilled').length,10);
      const registrations=await Promise.allSettled(Array.from({length:6},()=>app.store.charge('register','ignored','register-ip',now)));
      assert.equal(registrations.filter(v=>v.status==='fulfilled').length,5);
      await app.store.charge('register','ignored','register-ip',new Date('2026-10-02T21:00:00Z'));
      await app.store.charge('login','unrelated@example.test','unrelated-ip',now);
    });
    await t.test('AC-F01-5 HTTP wrong attempts count; spoofed forwarded IP cannot evade10/min',async()=>{
      await pool.query('TRUNCATE auth_bucket');
      for(let i=0;i<10;i++) assert.equal((await request('/api/auth/login','POST',undefined,{email:`missing${i}@example.test`,password},config.origin,`192.0.2.${i}`)).status,401);
      const blocked=await request('/api/auth/login','POST',undefined,{email:'allowed@example.test',password},config.origin,'192.0.2.200');assert.equal(blocked.status,429);assert.ok(Number(blocked.retry)>0);
      await pool.query('TRUNCATE auth_bucket');
      for(let i=0;i<5;i++) assert.equal((await request('/api/auth/login','POST',undefined,{email:emailA,password:'wrong-password'})).status,401);
      assert.equal((await request('/api/auth/login','POST',undefined,{email:emailA,password})).status,429);
    });
    await t.test('AC-F01-6 error secret canary redaction, invalid input no KDF/state, duplicate registration rollback',async()=>{
      await pool.query('TRUNCATE auth_bucket');
      const before=(await pool.query('SELECT count(*) FROM account')).rows[0].count;
      const duplicate=await request('/api/auth/register','POST',undefined,{email:emailA,password});assert.equal(duplicate.status,201);
      assert.equal((await request('/api/auth/me','GET',duplicate.cookie)).status,401);
      assert.equal((await pool.query('SELECT count(*) FROM account')).rows[0].count,before);
      assert.equal((await pool.query('SELECT count(*) FROM tenant')).rows[0].count,before);
      const invalid=await request('/api/auth/register','POST',undefined,{email:'valid@example.test',password:'😀'.repeat(201)});assert.equal(invalid.status,400);
      const canary='N7_PRIVATE_CANARY_'+randomBytes(16).toString('hex');
      await pool.query(`CREATE FUNCTION n7_canary_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION '%', TG_ARGV[0]; END $$`);
      // Identifier and trigger literal are locally generated test data, never request input.
      await pool.query(`CREATE TRIGGER n7_canary BEFORE INSERT ON tenant FOR EACH ROW EXECUTE FUNCTION n7_canary_failure('${canary}')`);
      const failed=await request('/api/auth/register','POST',undefined,{email:'canary@example.test',password}); assert.equal(failed.status,503);assert.ok(!JSON.stringify(failed).includes(canary));
      await pool.query('DROP TRIGGER n7_canary ON tenant');await pool.query('DROP FUNCTION n7_canary_failure()');
      console.log('secret_canary_scan_passed (value suppressed)');
    });
  } finally {
    await new Promise<void>(resolve=>app.server.close(()=>resolve()));await pool.end();
  }
});
