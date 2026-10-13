import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { validateHostedOutput,hostedCompletionMatches,hostedWorkerBinding } from '../web/replicate-evidence.js';
import { validateOutput } from '../web/jobs.js';
import { canonical,sha } from '../web/generation.js';
import { fixtureOutput } from './job-fixtures.js';
import { hostedOutput,hostedRows,refreshConfig,provenanceFields,evidenceConfig } from './replicate-evidence-fixtures.js';
const invalid=o=>assert.throws(()=>validateHostedOutput(o),/Invalid hosted/);

test('hosted v1 truthfully validates synthetic software evidence and preserves I3 safe config',()=>{
  const output=hostedOutput(),v=validateOutput(output,'production');
  assert.equal(v.mode,'replicate');assert.equal(v.evidence.config_sha,output.evidence.config_sha);
  assert.equal(sha(canonical(Object.fromEntries(provenanceFields.map(k=>[k,v.evidence[k]])))),v.evidence.config_sha);
  for(const k of ['hardware','warm','inference_ms','billing_actual_microusd'])assert.equal(v.evidence[k],null);
  assert.equal(v.evidence.metric_sources.queue_ms,'database_timestamps');
  assert.equal(v.evidence.metric_sources.local_elapsed_ms,'worker_monotonic');
  output.evidence.transform.content_rect.y=0;output.evidence.metric_sources.queue_ms='fake';
  assert.equal(v.evidence.transform.content_rect.y,64);assert.equal(v.evidence.metric_sources.queue_ms,'database_timestamps');
  assert.ok(Object.isFrozen(v.evidence));assert.ok(Object.isFrozen(v.evidence.transform.content_rect));
  assert.deepEqual(validateOutput(fixtureOutput(),'test'),fixtureOutput().evidence.model_revisions);
});
test('every hosted field is required; unknown, mixed local and sensitive payloads are closed',()=>{
  for(const k of Object.keys(hostedOutput())) {const o=hostedOutput();delete o[k];invalid(o);}
  for(const k of Object.keys(hostedOutput().evidence)) {const o=hostedOutput();delete o.evidence[k];invalid(o);}
  for(const k of ['model_revisions','manifest_sha','url','token','raw_response','data_uri','predict_time']) {
    const o=hostedOutput();o.evidence[k]='https://replicate.delivery/private';invalid(o);
  }
  for(const k of ['url','toJSON','cleanup','raw_body']) {const o=hostedOutput();o[k]='secret';invalid(o);}
  for(const payload of ['https://replicate.delivery/private','data:image/jpeg;base64,secret','Bearer secret'])
    for(const k of ['prediction_id','job_id','worker_source_revision','input_sha','style']) {
      const o=hostedOutput();o.evidence[k]=payload;invalid(o);
    }
});
test('provider scalar claims and fake metric sources are rejected, including zero/false substitutes',()=>{
  for(const [k,values] of Object.entries({hardware:['GPU',0],warm:[false,true],inference_ms:[0,123],billing_actual_microusd:[0,123]}))
    for(const value of values){const o=hostedOutput();o.evidence[k]=value;invalid(o);}
  for(const k of Object.keys(hostedOutput().evidence.metric_sources)) {
    const o=hostedOutput();delete o.evidence.metric_sources[k];invalid(o);
    for(const source of ['provider','caller','warm_measurement',undefined]) {
      const o=hostedOutput();o.evidence.metric_sources[k]=source;invalid(o);
    }
  }
  for(const k of ['queue_ms','local_elapsed_ms','seed'])for(const value of [null,-1,1.5,NaN,Infinity,'0']) {
    const o=hostedOutput();o.evidence[k]=value;invalid(o);
  }
});
test('hashes, pin, identities, truthful timestamp ordering and exact I3 transform fail closed',()=>{
  for(const k of ['input_sha','output_sha','depth_sha','config_sha','request_sha','transmitted_input_sha'])
    for(const value of ['0'.repeat(63),'0'.repeat(64)+'\n',null,123]) {const o=hostedOutput();o.evidence[k]=value;invalid(o);}
  for(const patch of [{schema_version:2},{evidence_version:0},{provider:'other'},{quality:'accepted'},
    {version:'8'.repeat(64)},{contract_sha:'8'.repeat(64)},{model:'other/model'},
    {input_sha:'8'.repeat(64)},{artifact_key:randomUUID()},{seed:2147483648},
    {queue_ms:1},{local_elapsed_ms:180001},{artifacts_verified_at:'2026-10-03T11:00:00.000Z'},
    {local_started_at:'2026-10-03T11:00:00.000Z'},{job_created_at:'2026-10-03T12:00:00Z'}]) {
    const o=hostedOutput();Object.assign(o.evidence,patch);invalid(o);
  }
  const o=hostedOutput();o.evidence.transform.content_rect.y=0;invalid(refreshConfig(o));
  const t=hostedOutput();t.evidence.transform.url='https://replicate.delivery';invalid(refreshConfig(t));
  const c=hostedOutput();c.evidence.config_sha='8'.repeat(64);invalid(c);
});
test('descriptors/prototypes/symbols never execute caller accessors or serializers',()=>{
  for(const target of ['output','evidence','transform','sources']) {
    const o=hostedOutput(),value=target==='output'?o:target==='evidence'?o.evidence:
      target==='transform'?o.evidence.transform:o.evidence.metric_sources;
    const key=Object.keys(value)[0];Object.defineProperty(value,key,{get(){throw new Error('getter executed');},enumerable:true});invalid(o);
  }
  for(const value of [[],new Date(),Object.create(hostedOutput().evidence),Object.assign(Object.create(null),hostedOutput().evidence)]) {
    const o=hostedOutput();o.evidence=value;invalid(o);
  }
  const o=hostedOutput();o.evidence[Symbol('private')]='secret';invalid(o);
});
test('independent server settings and complete immutable DB conjunction reject every mismatch',()=>{
  const output=hostedOutput(),e=validateHostedOutput(output).evidence;
  const matches=({j,s,ticket,input,now})=>hostedCompletionMatches(j,s,ticket,input,e,now);
  assert.equal(matches(hostedRows(output)),true);assert.equal(hostedWorkerBinding(e,evidenceConfig),true);
  for(const config of [{...evidenceConfig,seed:43},{...evidenceConfig,sourceRevision:'8'.repeat(40)},{}])
    assert.equal(hostedWorkerBinding(e,config),false);
  for(const [key,value] of [['state','preflight'],['state','ambiguous'],['provider_status','processing'],['provider_status','failed'],
    ['prediction_id','wrong'],['prediction_id',null],['cleanup_state','needed'],['cleanup_state','claimed'],['cleanup_state','done'],
    ['cleanup_state','unresolved'],['identity_conflict_at',new Date()],['id',randomUUID()],['model','other/model'],
    ['version','8'.repeat(64)],['contract_sha','8'.repeat(64)],['request_sha','8'.repeat(64)],
    ['source_input_sha','8'.repeat(64)],['transmitted_input_sha','8'.repeat(64)],['attempt_number',2],
    ['job_id',randomUUID()],['submission_fence',2],['attempt_deadline',new Date('2026-10-03T12:03:01Z')],['submitting_at',null],['observed_at',null]]) {
    const rows=hostedRows(output);rows.s[key]=value;assert.equal(matches(rows),false,key);
  }
  for(const [key,value] of [['mode','fixture'],['style','minimal'],['id',randomUUID()],['first_ticket_id',randomUUID()]]) {
    const rows=hostedRows(output);rows.j[key]=value;assert.equal(matches(rows),false,key);
  }
  for(const patch of [{id:randomUUID()},{superseded:true},{consumed_at:null},{job_id:randomUUID()},{attempt_number:2}]) {
    const rows=hostedRows(output);Object.assign(rows.ticket,patch);assert.equal(matches(rows),false);
  }
  for(const patch of [{deleted_at:new Date()},{account_id:randomUUID()},{sha256:'8'.repeat(64)},{width:641},{height:481}]) {
    const rows=hostedRows(output);Object.assign(rows.input,patch);assert.equal(matches(rows),false);
  }
  const rows=hostedRows(output);rows.s.transform=structuredClone(rows.s.transform);rows.s.transform.content_rect.y=0;
  assert.equal(matches(rows),false);
});
