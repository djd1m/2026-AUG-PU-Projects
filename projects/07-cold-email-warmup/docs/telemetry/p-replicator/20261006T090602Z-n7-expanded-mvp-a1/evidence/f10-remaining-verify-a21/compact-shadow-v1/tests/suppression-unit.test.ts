import assert from 'node:assert/strict';
import { createHash,randomBytes } from 'node:crypto';
import { test } from 'node:test';
import { authenticateOperator,parseComplaint } from '../src/suppression/store.js';
import { validateFixture } from '../src/replies/fixture.js';
import { boundedOperation } from '../src/replies/adapter.js';
test('operator distinct hash auth, malformed secrets and complaint payload bounds',()=>{
 const secret=randomBytes(32).toString('base64'),digest=createHash('sha256').update(secret).digest();authenticateOperator('Bearer '+secret,digest);
 for(const candidate of [null,'','Bearer wrong',secret,'Basic '+secret,'Bearer '+secret+'\n']) assert.throws(()=>authenticateOperator(candidate,digest));assert.throws(()=>authenticateOperator('Bearer '+secret,null));
 const input={eventId:'event-1',tenantId:'00000000-0000-4000-8000-000000000001',mailboxId:'00000000-0000-4000-8000-000000000002',recipientAddress:'R@example.test'},key=randomBytes(32);
 assert.equal(parseComplaint(input,key).digest.length,64);
 for(const raw of [{...input,body:'forbidden'},{...input,eventId:'x'.repeat(129)},{...input,recipientDigest:'a'.repeat(64)},{...input,tenantId:'bad'},{...input,recipientAddress:'r@example.test\r\nsecret'}]) assert.throws(()=>parseComplaint(raw,key));
});
test('fixture header-only bounds and ordered source coverage; operation timeout',async()=>{
 assert.deepEqual(validateFixture({uidvalidity:'1',uidNext:1,headers:[]}).headers,[]);
 for(const fixture of [{uidvalidity:'0',uidNext:1,headers:[]},{uidvalidity:'1',uidNext:2,headers:[{uid:2,from:'r@example.test'}]},{uidvalidity:'1',uidNext:3,headers:[{uid:2,from:'r@example.test'},{uid:1,from:'r@example.test'}]},{uidvalidity:'1',uidNext:2,headers:[{uid:1,from:'r@example.test',body:'N7_BODY_CANARY_F04B'}]}]) assert.throws(()=>validateFixture(fixture));
 await assert.rejects(boundedOperation(()=>new Promise(()=>{}),5),/poll_timeout/);
});
