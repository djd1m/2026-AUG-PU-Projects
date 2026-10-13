import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes,randomUUID } from 'node:crypto';
import { jobInput,budgetLimits,validateOutput,createJobs } from '../web/jobs.js';
import { readConfig } from '../web/config.js';
const input=()=>({upload_id:randomUUID(),style:'warm',idempotency_key:'test-key'});
const env=()=>({NODE_ENV:'test',DATABASE_URL:`postgresql://roomkind:${randomBytes(24).toString('hex')}@localhost/roomkind`,SESSION_SECRET:randomBytes(32).toString('hex'),APP_ORIGIN:'http://localhost:18088',STORAGE_DIR:'/tmp/n8-jobs-unit',PROVIDER_MODE:'disabled',WORKER_MODE:'disabled',PLATFORM_DAILY_LIMIT:'200',ACCOUNT_DAILY_LIMIT:'20'});
import { fixtureOutput } from './job-fixtures.js';
test('JOB-01 style/key/UUID boundaries and canonical body hash',()=>{
  const a=input();const parsed=jobInput(a);
  assert.throws(()=>jobInput({...a,upload_id:a.upload_id.toUpperCase()}));
  assert.equal(jobInput({style:a.style,idempotency_key:a.idempotency_key,upload_id:a.upload_id}).hash,parsed.hash);
  assert.equal(jobInput({...a,idempotency_key:'different'}).hash,parsed.hash);
  for(const style of ['warm','minimal','afrohemian','playful']) assert.equal(jobInput({...a,style}).style,style);
  for(const body of [null,[],{}, {...a,style:'unknown'},{...a,idempotency_key:''},{...a,idempotency_key:'x'.repeat(129)},{...a,idempotency_key:"';DROP TABLE job"},{...a,upload_id:'../secret'},{...a,now:'caller-clock'}]) assert.throws(()=>jobInput(body));
  assert.doesNotThrow(()=>jobInput({...a,idempotency_key:'x'.repeat(128)}));
});
test('PERF-01/SEC-01 required positive integer lower-only budget config',()=>{
  assert.doesNotThrow(()=>budgetLimits({platformDailyLimit:200,accountDailyLimit:20}));
  assert.doesNotThrow(()=>budgetLimits({platformDailyLimit:1,accountDailyLimit:1}));
  for(const name of ['PLATFORM_DAILY_LIMIT','ACCOUNT_DAILY_LIMIT']) {
    for(const value of [undefined,'','0','-1','1.5','NaN','Infinity',' 1','01','1e1']) {
      const e=env(); if(value===undefined) delete e[name];else e[name]=value;
      assert.throws(()=>readConfig(e));
    }
  }
  for(const patch of [{PLATFORM_DAILY_LIMIT:'201'},{ACCOUNT_DAILY_LIMIT:'21'},{PLATFORM_DAILY_LIMIT:'1',ACCOUNT_DAILY_LIMIT:'2'}]) assert.throws(()=>readConfig({...env(),...patch}));
  assert.equal(readConfig(env()).platformDailyLimit,200);
});
test('Output contract requires complete evidence and refuses production fixture',()=>{
  assert.doesNotThrow(()=>validateOutput(fixtureOutput(),'test'));
  assert.throws(()=>validateOutput(fixtureOutput(),'production'));
  for(const field of Object.keys(fixtureOutput().evidence)) {
    const o=fixtureOutput();delete o.evidence[field];assert.throws(()=>validateOutput(o,'test'),field);
  }
  for(const field of ['queue_ms','inference_ms','seed']) {const o=fixtureOutput();o.evidence[field]=-1;assert.throws(()=>validateOutput(o,'test'));}
});
test('Trusted clock injection is restricted to explicit test runtime',()=>{
  const config={platformDailyLimit:200,accountDailyLimit:20},trustedClock=()=>new Date();
  assert.doesNotThrow(()=>createJobs({}, {...config,runtime:'test'},{trustedClock}));
  for(const runtime of ['production','development',undefined]) {
    assert.throws(()=>createJobs({}, {...config,runtime},{trustedClock}),/Test clock requires test runtime/);
    assert.doesNotThrow(()=>createJobs({}, {...config,runtime}));
  }
  for(const trustedClock of [null,false,123,'clock',{}]) assert.throws(()=>createJobs({}, {...config,runtime:'test'},{trustedClock}));
});
test('Provenance rejects unsupported shapes and serializes a detached canonical revision object',()=>{
  const expected={sd:'sd-revision',controlnet:'controlnet-revision',depth:'depth-revision'};
  for(const revisions of [Object.assign([],expected),Object.assign(new Date(),expected),
    Object.assign(new Map(),expected),Object.create(expected),Object.assign(new (class Revisions {})(),expected),null,'revisions',123]) {
    const output=fixtureOutput();output.evidence.model_revisions=revisions;
    assert.throws(()=>validateOutput(output,'test'),/Incomplete generation evidence/);
  }
  for(const revisions of [{...expected},Object.assign(Object.create(null),expected),
    {...expected,toJSON(){throw new Error('Untrusted serializer executed');}}]) {
    const output=fixtureOutput();output.evidence.model_revisions=revisions;
    const canonical=validateOutput(output,'test');revisions.sd='changed-after-validation';
    assert.deepEqual(JSON.parse(JSON.stringify(canonical)),expected);
    assert.equal(Object.getPrototypeOf(canonical),Object.prototype);
  }
  for(const key of Object.keys(expected)) for(const value of [undefined,'','x'.repeat(201),123]) {
    const output=fixtureOutput();output.evidence.model_revisions={...expected,[key]:value};
    assert.throws(()=>validateOutput(output,'test'),/Incomplete generation evidence/);
  }
});
