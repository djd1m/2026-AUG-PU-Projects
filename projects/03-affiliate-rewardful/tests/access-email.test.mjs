import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { accessFixture,accessOrigin,accessPassword } from './helpers/access-fixture.mjs';
import { code } from './helpers/core-fixture.mjs';

test('activation chooses password after email proof and creates exactly one account and organization',async t=>{
  const x=await accessFixture(t),email=`${randomUUID()}@example.test`;
  await assert.rejects(x.f.app.access.register({email,name:'Attacker',password:accessPassword},accessOrigin,'peer'),code('VALIDATION'));
  await x.f.app.access.register({email,name:'Owner'},accessOrigin,'peer');
  assert.equal((await x.f.sql('SELECT * FROM accounts')).rowCount,0);
  assert.equal((await x.f.sql('SELECT * FROM user_sessions')).rowCount,0);
  const token=x.tokenFor(email,'register');assert.ok(token);
  assert.ok(!JSON.stringify((await x.f.sql('SELECT * FROM email_flows')).rows).includes(token));
  const result=await Promise.allSettled([1,2].map(()=>x.f.app.access.activate({token,password:accessPassword})));
  assert.equal(result.filter(r=>r.status==='fulfilled').length,1);
  assert.deepEqual(result.find(r=>r.status==='fulfilled').value,{completed:true,loginRequired:true});
  assert.equal((await x.f.sql('SELECT * FROM accounts')).rowCount,1);
  assert.equal((await x.f.sql("SELECT * FROM tenants WHERE mode='real'")).rowCount,1);
  assert.equal((await x.f.sql('SELECT * FROM user_sessions')).rowCount,0);
  const user=await x.f.app.identity.login({email,password:accessPassword});assert.equal((await x.f.app.identity.me(user.token)).emailVerified,true);
});
test('legacy reset preserves memberships and revokes cookie agent connector and cached task authority',async t=>{
  const x=await accessFixture(t),email=`${randomUUID()}@example.test`;
  const user=await x.f.app.identity.register({email,password:accessPassword,name:'Existing'});
  const me=await x.f.app.identity.me(user.token);assert.equal(me.emailVerified,false);
  const agent=await x.f.app.identity.mintAgent(user.token,user.membershipId,{actions:['dashboard','registry.prepare','registry.read'],expiresInSeconds:3600});
  const task=await x.f.app.executeAgent(agent.token,'task.create',{kind:'registry',input:{period:'2026-08'}},'before-reset');
  await x.f.app.executeReal(user.token,user.membershipId,'program.save',{kind:'cash',bps:2000,windowDays:30,holdDays:30,recurring:true},'terms');
  await x.f.app.referrals.configure(user.token,user.membershipId,{landingUrl:'https://merchant.example/signup',returnUrl:'https://merchant.example/done'});
  const connector=await x.f.app.referrals.rotate(user.token,user.membershipId);
  await x.f.app.access.forgot({email},accessOrigin,'peer');
  await x.f.app.access.reset({token:x.tokenFor(email,'reset'),password:'New credential after reset 63!'});
  await assert.rejects(x.f.app.identity.me(user.token),code('UNAUTHENTICATED'));
  await assert.rejects(x.f.app.authenticateAgent(agent.token),code('UNAUTHENTICATED'));
  await assert.rejects(x.f.app.executeAgent(agent.token,'task.create',{kind:'registry',input:{period:'2026-08'}},'before-reset'),code('UNAUTHENTICATED'));
  await assert.rejects(x.f.app.referrals.bind(connector.token,{customerId:randomUUID(),email:'customer@example.test',emailVerified:true}),code('UNAUTHENTICATED'));
  const login=await x.f.app.identity.login({email,password:'New credential after reset 63!'}),after=await x.f.app.identity.me(login.token);
  assert.deepEqual(after.memberships,me.memberships);assert.equal(after.emailVerified,true);assert.ok(task.id);
  for(const table of ['user_sessions','agent_credentials','referral_credentials'])assert.ok((await x.f.sql(`SELECT * FROM ${table} WHERE revoked_at IS NOT NULL`)).rowCount>0);
});
test('email proofs reject wrong purpose supersession version replay expiry and occupied registration',async t=>{
  const x=await accessFixture(t),user=await x.register();x.advance(61000);
  await x.f.app.access.forgot({email:user.email},accessOrigin,'peer');const first=x.tokenFor(user.email,'reset');
  await assert.rejects(x.f.app.access.activate({token:first,password:accessPassword}),code('TOKEN_INVALID'));
  x.advance(61000);await x.f.app.access.forgot({email:user.email},accessOrigin,'peer');
  await assert.rejects(x.f.app.access.reset({token:first,password:accessPassword}),code('TOKEN_INVALID'));
  const next=x.tokenFor(user.email,'reset');await x.f.sql('UPDATE accounts SET version=version+1 WHERE email=$1',[user.email]);
  await assert.rejects(x.f.app.access.reset({token:next,password:accessPassword}),code('TOKEN_INVALID'));
  x.advance(3600001);await assert.rejects(x.f.app.access.reset({token:next,password:accessPassword}),code('TOKEN_INVALID'));
  const email=`${randomUUID()}@example.test`;await x.f.app.access.register({email,name:'Pending'},accessOrigin,'new-peer');
  await x.f.app.identity.register({email,password:'Other existing credential 67!',name:'Winner'});
  await assert.rejects(x.f.app.access.activate({token:x.tokenFor(email,'register'),password:accessPassword}),code('ACCOUNT_COLLISION'));
  assert.ok(await x.f.app.identity.login({email,password:'Other existing credential 67!'}));
});
test('mail responses are uniform for unknown known ineligible and outage while quotas persist',async t=>{
  const x=await accessFixture(t),user=await x.register();x.advance(61000);
  const unknown=await x.f.app.access.forgot({email:'unknown@example.test'},accessOrigin,'unknown-peer');
  const known=await x.f.app.access.forgot({email:user.email},accessOrigin,'known-peer');assert.deepEqual(known,unknown);
  x.advance(61000);x.faults.mail=true;assert.deepEqual(await x.f.app.access.forgot({email:user.email},accessOrigin,'third-peer'),unknown);
  assert.ok(!known.message.includes('письмо отправлено'));
  await assert.rejects(x.f.app.access.forgot({email:user.email},accessOrigin,'fourth-peer'),code('ACCESS_RATE_LIMIT'));
  await x.f.restart();await assert.rejects(x.f.app.access.forgot({email:user.email},accessOrigin,'fifth-peer'),code('ACCESS_RATE_LIMIT'));
  x.config.mail.enabled=false;await x.f.restart();
  for(const email of [user.email,'unknown@example.test'])await assert.rejects(x.f.app.access.forgot({email},accessOrigin,'peer'),code('MAIL_UNCONFIGURED'));
});
test('reset token expiring while waiting for account lock cannot change password or consume proof',async t=>{
  const x=await accessFixture(t),user=await x.register();x.advance(61000);
  await x.f.app.access.forgot({email:user.email},accessOrigin,'peer');const token=x.tokenFor(user.email,'reset');
  await x.f.sql('UPDATE email_flows SET expires_at=$1 WHERE purpose=$2',[new Date(x.now()+1000),'reset']);
  const pool=new pg.Pool(x.f.database),client=await pool.connect();
  try {
    await client.query('BEGIN');await client.query('SELECT id FROM accounts WHERE email=$1 FOR UPDATE',[user.email]);
    const pending=assert.rejects(x.f.app.access.reset({token,password:'Must not become credential 83!'}),code('TOKEN_INVALID'));
    await new Promise(r=>setTimeout(r,100));x.advance(2000);await client.query('COMMIT');await pending;
    assert.equal((await x.f.sql("SELECT used_at FROM email_flows WHERE purpose='reset'")).rows[0].used_at,null);
    assert.ok(await x.f.app.identity.login({email:user.email,password:accessPassword}));
  } finally {client.release();await pool.end();}
});
