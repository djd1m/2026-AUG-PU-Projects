import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { Readable } from 'node:stream';
import { readConfig } from '../web/config.js';
import { Capacity, RateLimiter, credentials, readBody, readJson, requireOrigin, requireUuid } from '../web/boundaries.js';

const errorStatus = status => error => error.status === status;
const validEnv = () => ({NODE_ENV:'test',DATABASE_URL:`postgresql://roomkind:${randomBytes(24).toString('hex')}@localhost/roomkind`,SESSION_SECRET:randomBytes(32).toString('hex'),APP_ORIGIN:'http://127.0.0.1:18088',STORAGE_DIR:'/tmp/n8-unit-private',PROVIDER_MODE:'disabled',WORKER_MODE:'disabled',PLATFORM_DAILY_LIMIT:'200',ACCOUNT_DAILY_LIMIT:'20'});
function request(bytes,headers={}) { const req = Readable.from([Buffer.from(bytes)]); req.headers=headers; return req; }

test('AUTH-01 canonical email and all password edges, including Unicode',() => {
  for (const length of [12,128]) assert.equal(credentials({email:'  Alice@Example.com ',password:'я'.repeat(length)}).email,'alice@example.com');
  for (const password of ['a'.repeat(11),'a'.repeat(129),null,12]) assert.throws(() => credentials({email:'a@example.com',password}),errorStatus(400));
  for (const body of [null,[],{}, {email:'a@b',password:'a'.repeat(12)}, {email:'a b@example.com',password:'a'.repeat(12)}]) assert.throws(() => credentials(body),errorStatus(400));
});
test('AUTH-03 exact Origin denies missing, null, foreign, prefixes',() => {
  for (const origin of [undefined,'null','http://evil.test','http://127.0.0.1:18088.evil','http://127.0.0.1:18088/']) assert.throws(() => requireOrigin({headers:{origin}},'http://127.0.0.1:18088'),errorStatus(403));
  assert.doesNotThrow(() => requireOrigin({headers:{origin:'http://127.0.0.1:18088'}},'http://127.0.0.1:18088'));
});
test('SEC-02 UUID path traversal/URL/malformed boundaries',() => {
  assert.equal(requireUuid(randomUUID()).length,36);
  for (const id of ['../secret','https://example.com/photo','',randomUUID()+'/../x','%2e%2e',null]) assert.throws(() => requireUuid(id),errorStatus(400));
});
test('AUTH-03 JSON 16KiB and streamed body boundaries',async () => {
  const json = JSON.stringify({value:'x'.repeat(16372)}); assert.equal(Buffer.byteLength(json),16384);
  assert.equal((await readJson(request(json,{'content-type':'application/json'}))).value.length,16372);
  await assert.rejects(readJson(request(json+' ',{'content-type':'application/json'})),errorStatus(413));
  await assert.rejects(readJson(request('{',{'content-type':'application/json'})),errorStatus(400));
  await assert.rejects(readJson(request('{}',{'content-type':'text/plain'})),errorStatus(415));
  await assert.rejects(readBody(request('x',{'content-length':'16385'}),16384),errorStatus(413));
  await assert.rejects(readBody(request('x',{'content-encoding':'gzip'}),16384),errorStatus(415));
});
test('AUTH-03/SEC-02 exact rate edges, expiry and distinct NAT account keys',() => {
  for (const [limit,window] of [[5,3600000],[10,900000],[50,900000],[120,60000]]) {
    const rate = new RateLimiter();
    for (let count=0;count<limit;count++) rate.take('one',limit,window,0);
    assert.throws(() => rate.take('one',limit,window,window-1),errorStatus(429));
    assert.doesNotThrow(() => rate.take('one',limit,window,window));
    assert.doesNotThrow(() => rate.take('other-email-same-ip',limit,window,0));
  }
});
test('capacity rejects parallel overflow without holding a DB connection or queuing',async () => {
  const capacity = new Capacity(2); let release;
  const blocked = new Promise(resolve => { release=resolve; });
  const work = [capacity.run(() => blocked),capacity.run(() => blocked)];
  await assert.rejects(capacity.run(() => Promise.resolve()),errorStatus(503));
  assert.equal(capacity.active,2); release(); await Promise.all(work); assert.equal(capacity.active,0);
  await assert.rejects(capacity.run(() => { throw new Error('failed'); })); assert.equal(capacity.active,0);
});
test('SEC-01 missing and unsafe config fails closed; local/nonlocal cookie policy',() => {
  for (const name of ['NODE_ENV','DATABASE_URL','SESSION_SECRET','APP_ORIGIN','STORAGE_DIR','PROVIDER_MODE','WORKER_MODE']) {
    const env=validEnv(); delete env[name]; assert.throws(() => readConfig(env),/Invalid server configuration/);
  }
  for (const patch of [{SESSION_SECRET:'default'},{DATABASE_URL:'postgresql://postgres:postgres@localhost/db'},{STORAGE_DIR:'web/public'},{STORAGE_DIR:'/'},{PROVIDER_MODE:'fixture'},{WORKER_MODE:'fixture'},{APP_ORIGIN:'http://evil.test'},{APP_ORIGIN:'http://localhost/path'},{PORT:'0'}]) assert.throws(() => readConfig({...validEnv(),...patch}));
  assert.equal(readConfig(validEnv()).secureCookie,false);
  assert.equal(readConfig({...validEnv(),APP_ORIGIN:'https://roomkind.example',NODE_ENV:'production'}).secureCookie,true);
});
