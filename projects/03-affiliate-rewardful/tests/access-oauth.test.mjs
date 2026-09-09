import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { accessFixture,accessOrigin,accessPassword } from './helpers/access-fixture.mjs';
import { code } from './helpers/core-fixture.mjs';

test('Yandex state is bound to browser host expiry and one-use claim before provider IO',async t=>{
  const x=await accessFixture(t),flow=await x.flow(),providerCode=x.codeFor();
  await assert.rejects(x.f.app.access.oauth.callback({...flow,browser:'x'.repeat(43),code:providerCode}),code('OAUTH_STATE'));
  await assert.rejects(x.f.app.access.oauth.callback({...flow,host:'n3-b.212.192.0.33.sslip.io',code:providerCode}),code('OAUTH_STATE'));
  assert.equal(x.calls.length,0);
  const results=await Promise.allSettled([1,2].map(()=>x.f.app.access.oauth.callback({...flow,code:providerCode})));
  assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(x.calls.length,2);
  const cancelled=await x.flow();assert.equal((await x.f.app.access.oauth.callback({...cancelled,error:'access_denied'})).error,'YANDEX_CANCELLED');
  await assert.rejects(x.f.app.access.oauth.callback({...cancelled,code:x.codeFor()}),code('TOKEN_INVALID'));
  const expired=await x.flow();x.advance(600001);await assert.rejects(x.f.app.access.oauth.callback({...expired,code:x.codeFor()}),code('TOKEN_INVALID'));
  await assert.rejects(x.f.app.access.oauth.start(null,{intent:'login'},'https://attacker.example','peer'),code('ORIGIN_DENIED'));
});
test('external identity first-login race creates one org and never autolinks occupied emails including passwordless',async t=>{
  const x=await accessFixture(t),external=randomUUID(),email=`${randomUUID()}@example.test`;
  const a=await x.flow(),b=await x.flow();
  const logins=await Promise.all([a,b].map(flow=>x.f.app.access.oauth.callback({...flow,code:x.codeFor(external,email)})));
  assert.equal((await x.f.sql('SELECT * FROM accounts')).rowCount,1);
  assert.equal((await x.f.sql('SELECT * FROM memberships')).rowCount,1);
  const ma=await x.f.app.identity.me(logins[0].token),mb=await x.f.app.identity.me(logins[1].token);
  assert.deepEqual(ma.memberships,mb.memberships);assert.equal(ma.emailVerified,false);assert.equal(ma.hasPassword,false);
  await assert.rejects(x.f.app.identity.login({email,password:accessPassword}),code('LOGIN_FAILED'));
  const collision=await x.flow();await assert.rejects(x.f.app.access.oauth.callback({...collision,code:x.codeFor(randomUUID(),email)}),code('ACCOUNT_COLLISION'));
  const local=await x.register(),localFlow=await x.flow();
  await assert.rejects(x.f.app.access.oauth.callback({...localFlow,code:x.codeFor(randomUUID(),local.email)}),code('ACCOUNT_COLLISION'));
  const changed=await x.flow(),again=await x.f.app.access.oauth.callback({...changed,code:x.codeFor(external,'changed@example.test')});
  assert.equal((await x.f.app.identity.me(again.token)).email,email);
});
test('SSO-only contact requires same session and email proof before password recovery and safe unlink',async t=>{
  const x=await accessFixture(t),email=`${randomUUID()}@example.test`,flow=await x.flow();
  const sso=await x.f.app.access.oauth.callback({...flow,code:x.codeFor(randomUUID(),email)});
  await x.f.app.access.forgot({email},accessOrigin,'peer');assert.equal(x.tokenFor(email,'reset'),null);
  await assert.rejects(x.f.app.access.oauth.unlink(sso.token,{currentPassword:accessPassword}),code('LOGIN_FAILED'));
  x.advance(61000);await x.f.app.access.contact(sso.token,accessOrigin,'peer');const contact=x.tokenFor(email,'contact');assert.ok(contact);
  const other=await x.register();await assert.rejects(x.f.app.access.verifyContact(other.token,{token:contact}),code('TOKEN_INVALID'));
  await assert.rejects(x.f.app.access.reset({token:contact,password:accessPassword}),code('TOKEN_INVALID'));
  await x.f.app.access.verifyContact(sso.token,{token:contact});assert.equal((await x.f.app.identity.me(sso.token)).emailVerified,true);
  x.advance(61000);await x.f.app.access.forgot({email},accessOrigin,'peer');await x.f.app.access.reset({token:x.tokenFor(email,'reset'),password:accessPassword});
  await assert.rejects(x.f.app.identity.me(sso.token),code('UNAUTHENTICATED'));
  const login=await x.f.app.identity.login({email,password:accessPassword});await x.f.app.access.oauth.unlink(login.token,{currentPassword:accessPassword});
  await assert.rejects(x.f.app.identity.me(login.token),code('UNAUTHENTICATED'));
  const next=await x.f.app.identity.login({email,password:accessPassword});assert.equal((await x.f.app.identity.me(next.token)).yandexLinked,false);
});
test('explicit Yandex linking requires independent current password and rejects revoked session during provider wait',async t=>{
  const x=await accessFixture(t),user=await x.register();
  await assert.rejects(x.f.app.access.oauth.start(user.token,{intent:'link',currentPassword:'Wrong proof sufficiently long!'},accessOrigin,'peer'),code('LOGIN_FAILED'));
  const flow=await x.flow({plain:user.token,intent:'link',currentPassword:accessPassword});
  const done=await x.f.app.access.oauth.callback({...flow,session:user.token,code:x.codeFor()});assert.equal(done.linked,true);
  assert.equal((await x.f.app.identity.me(user.token)).yandexLinked,true);
  const other=await x.register(),pending=await x.flow({plain:other.token,intent:'link',currentPassword:accessPassword});
  let entered,release;const started=new Promise(r=>{entered=r;});const wait=new Promise(r=>{release=r;});x.faults.profile=()=>{entered();return wait;};
  const result=assert.rejects(x.f.app.access.oauth.callback({...pending,session:other.token,code:x.codeFor()}),code('UNAUTHENTICATED'));
  await started;await x.f.app.identity.logout(other.token);release();await result;
  assert.equal((await x.f.sql('SELECT count(*)::int AS n FROM sso_identities')).rows[0].n,1);
});
test('OAuth login rechecks external binding after account lock so concurrent unlink cannot authorize stale identity',async t=>{
  const x=await accessFixture(t),external=randomUUID(),email=`${randomUUID()}@example.test`;
  await x.f.app.access.oauth.callback({...await x.flow(),code:x.codeFor(external,email)});
  const flow=await x.flow(),pool=new pg.Pool(x.f.database),client=await pool.connect();
  try {
    await client.query('BEGIN');const account=(await client.query('SELECT id FROM accounts WHERE email=$1 FOR UPDATE',[email])).rows[0];
    const pending=assert.rejects(x.f.app.access.oauth.callback({...flow,code:x.codeFor(external,email)}),code('IDENTITY_CHANGED'));
    await new Promise(r=>setTimeout(r,100));
    await client.query('DELETE FROM sso_identities WHERE account_id=$1',[account.id]);await client.query('COMMIT');await pending;
    assert.equal((await x.f.sql('SELECT * FROM user_sessions')).rowCount,1);
  } finally {client.release();await pool.end();}
});
