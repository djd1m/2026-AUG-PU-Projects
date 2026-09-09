import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { accessFixture,accessOrigin,accessPassword } from './helpers/access-fixture.mjs';
import { code } from './helpers/core-fixture.mjs';

test('sticky verification policy protects user agent and connector authority across mail outage and restart',async t=>{
  const x=await accessFixture(t),email=`${randomUUID()}@example.test`;
  const legacy=await x.f.app.identity.register({email,password:accessPassword,name:'Legacy'});
  const agent=await x.f.app.identity.mintAgent(legacy.token,legacy.membershipId,{actions:['dashboard'],expiresInSeconds:3600});
  await x.f.app.executeReal(legacy.token,legacy.membershipId,'program.save',{kind:'cash',bps:2000,windowDays:30,holdDays:30,recurring:true},'terms');
  await x.f.app.referrals.configure(legacy.token,legacy.membershipId,{landingUrl:'https://merchant.example/start',returnUrl:'https://merchant.example/end'});
  const connector=await x.f.app.referrals.rotate(legacy.token,legacy.membershipId);
  x.config.verificationRequired=true;await x.f.restart();
  const assertLocked=async()=>{
    await assert.rejects(x.f.app.executeReal(legacy.token,legacy.membershipId,'dashboard'),code('EMAIL_VERIFICATION_REQUIRED'));
    await assert.rejects(x.f.app.authenticateAgent(agent.token),code('EMAIL_VERIFICATION_REQUIRED'));
    await assert.rejects(x.f.app.referrals.bind(connector.token,{customerId:randomUUID(),email:'customer@example.test',emailVerified:true}),code('EMAIL_VERIFICATION_REQUIRED'));
    const me=await x.f.app.identity.me(legacy.token);assert.equal(me.emailVerified,false);assert.equal(me.verificationRequired,true);
    assert.ok(await x.f.app.identity.login({email,password:accessPassword}));
  };
  await assertLocked();x.config.verificationRequired=false;x.config.mail.enabled=false;await x.f.restart();await assertLocked();
  assert.deepEqual(await x.f.app.access.status(),{mailConfigured:false,yandexConfigured:true,verificationRequired:true});
  x.config.mail.enabled=true;await x.f.restart();await x.f.app.access.forgot({email},accessOrigin,'peer');
  await x.f.app.access.reset({token:x.tokenFor(email,'reset'),password:accessPassword});
  const login=await x.f.app.identity.login({email,password:accessPassword});
  assert.equal((await x.f.app.executeReal(login.token,legacy.membershipId,'dashboard')).simulated,false);
});
test('mail admission enforces literal hourly quota cooldown concurrent scopes and bounded token capacity',async t=>{
  const x=await accessFixture(t),email='same@example.test';
  const attempts=await Promise.allSettled(Array.from({length:8},(_,i)=>x.f.app.access.register({email,name:'One'},accessOrigin,`peer-${i}`)));
  assert.equal(attempts.filter(r=>r.status==='fulfilled').length,1);assert.equal(x.messages.length,1);
  x.advance(3600001);
  for(let i=0;i<5;i++){await x.f.app.access.forgot({email:'quota@example.test'},accessOrigin,'quota-peer');x.advance(61000);}
  await assert.rejects(x.f.app.access.forgot({email:'quota@example.test'},accessOrigin,'fresh-peer'),code('ACCESS_RATE_LIMIT'));
  for(let i=0;i<30;i++)await x.f.app.access.forgot({email:`peer-${i}@example.test`},accessOrigin,'shared-peer');
  await assert.rejects(x.f.app.access.forgot({email:'overflow@example.test'},accessOrigin,'shared-peer'),code('ACCESS_RATE_LIMIT'));
  await x.f.sql('DELETE FROM email_flows');
  await x.f.sql(`INSERT INTO email_flows(email,purpose,token_hash,name,issued_at,expires_at)
    SELECT 'capacity-'||i||'@example.test','register',md5('capacity-'||i),'Pending',$1,$2 FROM generate_series(1,10000) AS i`,[new Date(x.now()),new Date(x.now()+86400000)]);
  const before=x.messages.length;await x.f.app.access.register({email:'full@example.test',name:'No capacity'},accessOrigin,'capacity-peer');
  assert.equal(x.messages.length,before);assert.equal((await x.f.sql('SELECT count(*)::int AS n FROM email_flows')).rows[0].n,10000);
});
test('stalled mail releases SQL pool for unrelated tenant activity',async t=>{
  let release,entered;const waiting=new Promise(r=>{release=r;}),begun=new Promise(r=>{entered=r;});
  const x=await accessFixture(t,{accessFetch:async()=>{entered();await waiting;return Response.json({id:'delivered'});}});
  const pending=x.f.app.access.register({email:'slow@example.test',name:'Slow'},accessOrigin,'peer');await begun;
  const start=Date.now();
  const results=await Promise.all(Array.from({length:8},()=>x.f.call('dashboard')));
  assert.equal(results.length,8);assert.ok(Date.now()-start<2000);release();await pending;
  assert.equal((await x.f.sql('SELECT * FROM accounts')).rowCount,0);
});
test('account-first credential resolution cannot deadlock revocation behind a held account lock',async t=>{
  const x=await accessFixture(t),user=await x.register();
  const agent=await x.f.app.identity.mintAgent(user.token,user.membershipId,{actions:['dashboard'],expiresInSeconds:3600});
  const pool=new pg.Pool(x.f.database),client=await pool.connect();
  try {
    for(const [table,operation] of [['user_sessions',()=>x.f.app.identity.me(user.token)],['agent_credentials',()=>x.f.app.authenticateAgent(agent.token)]]) {
      await client.query('BEGIN');await client.query('SELECT id FROM accounts WHERE email=$1 FOR UPDATE',[user.email]);
      const pending=operation().then(()=>({code:'UNEXPECTED_SUCCESS'}),error=>error);
      await new Promise(r=>setTimeout(r,100));
      await client.query(`UPDATE ${table} SET revoked_at=$1`,[new Date(x.now())]);await client.query('COMMIT');
      assert.equal((await pending).code,'UNAUTHENTICATED');
    }
  } finally {await client.query('ROLLBACK').catch(()=>{});client.release();await pool.end();}
});
test('unverified invite acceptance cannot consume invitation or mutate membership under sticky policy',async t=>{
  const x=await accessFixture(t),owner=await x.register();
  const invitee=await x.f.app.identity.register({email:`${randomUUID()}@example.test`,password:accessPassword,name:'Unverified'});
  const invitation=await x.f.app.identity.invite(owner.token,owner.membershipId,{role:'partner'});
  const before=(await x.f.sql('SELECT id,state FROM tenants ORDER BY id')).rows;
  x.config.verificationRequired=true;await x.f.restart();
  await assert.rejects(x.f.app.identity.acceptInvite(invitee.token,{invitation:invitation.invitation,name:'Attempt'}),code('EMAIL_VERIFICATION_REQUIRED'));
  assert.equal((await x.f.sql('SELECT accepted_by FROM invitations')).rows[0].accepted_by,null);
  assert.equal((await x.f.sql('SELECT * FROM memberships')).rowCount,2);
  assert.deepEqual((await x.f.sql('SELECT id,state FROM tenants ORDER BY id')).rows,before);
});
test('concurrent password changes acquire account update lock before resolving the source session',async t=>{
  const x=await accessFixture(t),user=await x.register(),pool=new pg.Pool(x.f.database),client=await pool.connect();
  try {
    await client.query('BEGIN');await client.query('SELECT id FROM accounts WHERE email=$1 FOR SHARE',[user.email]);
    const change=password=>x.f.app.identity.changePassword(user.token,{currentPassword:accessPassword,newPassword:password}).then(value=>({value}),error=>({error}));
    const one=change('First new secure password 13!');await new Promise(r=>setTimeout(r,30));
    const two=change('Second new secure password 14!');await new Promise(r=>setTimeout(r,150));await client.query('COMMIT');
    const results=await Promise.all([one,two]);assert.equal(results.filter(r=>r.value).length,1);
    assert.equal(results.find(r=>r.error).error.code,'UNAUTHENTICATED');
  } finally {await client.query('ROLLBACK').catch(()=>{});client.release();await pool.end();}
});
