import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { validatePreparedBinding,createProviderSubmissions,ProviderSubmissionError } from '../web/provider-submissions.js';
const binding=()=>({model:'jagilley/controlnet-depth2img',version:'1'.repeat(64),spend_budget_id:randomUUID(),
  contract_sha:'2'.repeat(64),source_input_sha:'a'.repeat(64),transmitted_input_sha:'b'.repeat(64),request_sha:'c'.repeat(64),
  authorization_sha:'3'.repeat(64),privacy_acceptance_sha:'4'.repeat(64),license_acceptance_sha:'5'.repeat(64),
  safety_acceptance_sha:'6'.repeat(64),billing_acceptance_sha:'7'.repeat(64),
  transform:{original_width:640,original_height:480,canvas_width:512,canvas_height:512,content_rect:{x:0,y:64,width:512,height:384}}});
const invalid=e=>e instanceof ProviderSubmissionError&&e.code==='invalid_submission'&&e.message==='invalid_submission';
test('prepared binding accepts only hashes and closed numeric image transform',()=>{
  const b=binding(),copy=validatePreparedBinding(b);assert.deepEqual(copy,b);
  b.transform.content_rect.x=1;assert.equal(copy.transform.content_rect.x,0);
  for(const change of [b=>{delete b.privacy_acceptance_sha;},b=>{b.token='synthetic-secret';},
    b=>{b.request_body='synthetic-body';},b=>{b.source_input_sha='not-a-digest';},
    b=>{b.model='https://example.test/model';},b=>{b.version='';},b=>{b.spend_budget_id='bad';},
    b=>{b.transform.input='synthetic-body';},b=>{b.transform.content_rect.url='https://example.test';},
    b=>{b.transform.original_width=20000001;},b=>{b.transform.original_height=0;},
    b=>{b.transform.canvas_width=1024;},b=>{b.transform.content_rect.x=-1;},
    b=>{b.transform.content_rect.height=513;},b=>{b.transform.content_rect.y=1.5;},
    b=>{b.transform.content_rect.width=0;},b=>{b.transform.toJSON=()=>({input:'synthetic-body'});}]) {
    const bad=binding();change(bad);assert.throws(()=>validatePreparedBinding(bad),invalid);
  }
});
test('authority rejects absent/invalid limits and non-test trusted clock before SQL',()=>{
  for(const config of [undefined,{}, {platformDailyLimit:201,accountDailyLimit:20},
    {platformDailyLimit:200,accountDailyLimit:0},{platformDailyLimit:1,accountDailyLimit:2}])
    assert.throws(()=>createProviderSubmissions(null,config),e=>e.code==='invalid_submission_config');
  assert.throws(()=>createProviderSubmissions(null,{runtime:'production',platformDailyLimit:200,accountDailyLimit:20},
    {trustedClock:()=>new Date()}),e=>e.code==='invalid_submission_config');
});
