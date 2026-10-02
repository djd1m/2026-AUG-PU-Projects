import assert from 'node:assert/strict';
import { mkdtempSync,writeFileSync,rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { test } from 'node:test';
import { randomBytes } from 'node:crypto';
import { loadConfig } from '../src/config.js';
import { HttpError } from '../src/errors.js';
import { isSupportedHash, isValidPassword, KdfAdmission, PasswordService } from '../src/auth/password.js';
import { COOKIE_NAME, newSession, readToken, sessionCookie, tokenDigest } from '../src/auth/session.js';
test('AC-F01-4 Unicode/password byte boundaries reject before invoking KDF', async () => {
  let calls = 0;
  const passwords = new PasswordService(new KdfAdmission(), {hash:async () => { calls++; return ''; },verify:async () => {calls++; return true;}});
  for (const value of ['a'.repeat(7), 'a'.repeat(201), '😀'.repeat(201), 'x'.repeat(801), null]) {
    assert.equal(isValidPassword(value), false); await assert.rejects(passwords.hash(value), HttpError);
  }
  assert.equal(calls, 0);
  for (const value of ['a'.repeat(8), 'a'.repeat(200), '😀'.repeat(200)]) assert.equal(isValidPassword(value), true);
});
test('AC-F01-4 exact PHC params/salt/output reject adversarial stored costs', () => {
  const salt = Buffer.alloc(16, 1).toString('base64').replace(/=+$/, '');
  const output = Buffer.alloc(32, 2).toString('base64').replace(/=+$/, '');
  const hash = `$argon2id$v=19$m=65536,t=3,p=1$${salt}$${output}`;
  assert.ok(isSupportedHash(hash));
  for (const invalid of [hash.replace('65536','65537'),hash.replace('t=3','t=4'),hash.replace('p=1','p=2'),hash.replace('v=19','v=16'),hash.replace('argon2id','argon2i'),hash.replace(salt,Buffer.alloc(32).toString('base64').replace(/=+$/,'')),hash+'=']) assert.equal(isSupportedHash(invalid),false);
});
test('AC-F01-4 two active KDFs: no queue, unrelated free slot, release on rejection', async () => {
  const admission = new KdfAdmission(); const releases: (()=>void)[] = [];
  const task = () => new Promise<void>(resolve => releases.push(resolve));
  const first = admission.run(task); const second = admission.run(task);
  assert.equal(admission.activeCount, 2);
  await assert.rejects(admission.run(task), (e:unknown) => e instanceof HttpError && e.status === 503 && e.retryAfter === 1);
  assert.equal(releases.length,2); releases[0]!(); await first;
  assert.equal(await admission.run(async () => 'unrelated'), 'unrelated');
  releases[1]!(); await second;
  await assert.rejects(admission.run(async () => {throw new Error('fixture');}));
  assert.equal(admission.activeCount,0);
});
test('AC-F01-2 opaque canonical cookie and absolute7day HMAC session', () => {
  const key = randomBytes(32); const session = newSession(key);
  assert.equal(session.token.length,43); assert.equal(session.digest.length,64);
  assert.equal(session.digest,tokenDigest(session.token,key));
  assert.notEqual(session.digest,tokenDigest(session.token,randomBytes(32)));
  assert.ok(Math.abs(session.expiresAt.getTime()-Date.now()-604800000)<1000);
  assert.equal(readToken(`${COOKIE_NAME}=${session.token}`),session.token);
  for(const cookie of ['',`${COOKIE_NAME}=forged`,`${COOKIE_NAME}=${session.token}; ${COOKIE_NAME}=${session.token}`]) assert.equal(readToken(cookie),null);
  assert.match(sessionCookie(session.token,true),/HttpOnly; SameSite=Lax; Max-Age=604800; Secure$/);
  assert.match(sessionCookie('',false,true),/Max-Age=0$/);
});
test('AC-F01-1 safety config fails closed without external runtime key/policy', () => {
  const dir=mkdtempSync(tmpdir()+'/n7-config-'); const keyfile=dir+'/keyring';
  writeFileSync(keyfile,JSON.stringify({activeVersion:'v1',keys:{v1:randomBytes(32).toString('base64')}}),{mode:0o600});
  const hashfile=dir+'/recipient';writeFileSync(hashfile,randomBytes(32).toString('base64'),{mode:0o600});
  const env = {RECIPIENT_HASH_KEY_FILE:hashfile,CREDENTIAL_KEYRING_FILE:keyfile,MAIL_PROVIDER_ALLOWLIST:'{"smtp.example.com":30}',SAFETY_POLICY_VERSION:'n7-safety-v1',SESSION_HMAC_KEY:randomBytes(32).toString('base64'),DATABASE_URL:'postgresql://fixture',APP_ORIGIN:'http://127.0.0.1:18701'};
  assert.equal(loadConfig(env).secureCookie,false);
  assert.equal(loadConfig(env).dispatchMode,'disabled');assert.equal(loadConfig({...env,DISPATCH_MODE:'local_test'}).dispatchMode,'local_test');
  for(const mode of ['', 'live', 'smtp', 'LOCAL_TEST']) assert.throws(()=>loadConfig({...env,DISPATCH_MODE:mode}),/invalid_dispatch_mode/);
  for(const change of [{RECIPIENT_HASH_KEY_FILE:''},{RECIPIENT_HASH_KEY_FILE:dir+'/absent'},{SAFETY_POLICY_VERSION:''},{SESSION_HMAC_KEY:''},{SESSION_HMAC_KEY:Buffer.alloc(16).toString('base64')},{APP_ORIGIN:'http://public.example'},{PORT:'0'},{CREDENTIAL_KEYRING_FILE:''},{CREDENTIAL_KEYRING_FILE:dir+'/absent'},{MAIL_PROVIDER_ALLOWLIST:''},{MAIL_PROVIDER_ALLOWLIST:'{"smtp.example.com":31}'}]) assert.throws(()=>loadConfig({...env,...change}));
  for(const encoded of [Buffer.alloc(16).toString('base64'),env.SESSION_HMAC_KEY,'invalid']) {writeFileSync(hashfile,encoded);assert.throws(()=>loadConfig(env),/invalid_recipient_hash_key/);}
  rmSync(dir,{recursive:true});
});
