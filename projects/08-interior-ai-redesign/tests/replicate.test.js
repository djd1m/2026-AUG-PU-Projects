import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { Readable } from 'node:stream';
import { createHash,randomUUID } from 'node:crypto';
import { REPLICATE_MODEL,REPLICATE_VERSION,REPLICATE_CONTRACT_SHA,ReplicateError,
  hashReplicateRequest,prepareReplicateRequest,createReplicateBudget,remainingReplicateBudget,createReplicateTransport,getSucceededOutput } from '../web/replicate.js';

const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const candidate=(image=Buffer.from('synthetic JPEG fixture'))=>({version:REPLICATE_VERSION,input:{
  image:`data:image/jpeg;base64,${image.toString('base64')}`,prompt:'server selected room style',
  a_prompt:'best quality, extremely detailed',n_prompt:'low quality',num_samples:'1',image_resolution:'512',
  detect_resolution:512,ddim_steps:30,scale:7.5,eta:0,seed:42}});
const config=()=>({model:REPLICATE_MODEL,version:REPLICATE_VERSION,contractSha:REPLICATE_CONTRACT_SHA,
  token:'offline-synthetic-token'});
const binding=c=>({model:REPLICATE_MODEL,version:REPLICATE_VERSION,spend_budget_id:randomUUID(),
  contract_sha:REPLICATE_CONTRACT_SHA,source_input_sha:'a'.repeat(64),
  transmitted_input_sha:hash(Buffer.from(c.input.image.slice(23),'base64')),request_sha:hashReplicateRequest(c),
  authorization_sha:'3'.repeat(64),privacy_acceptance_sha:'4'.repeat(64),license_acceptance_sha:'5'.repeat(64),
  safety_acceptance_sha:'6'.repeat(64),billing_acceptance_sha:'7'.repeat(64),
  transform:{original_width:640,original_height:480,canvas_width:512,canvas_height:512,
    content_rect:{x:0,y:64,width:512,height:384}}});
const provider=(status='starting',id='Prediction_1-abc')=>({id,model:REPLICATE_MODEL,version:REPLICATE_VERSION,status,
  output:status==='succeeded'?['https://replicate.delivery/depth.png','https://replicate.delivery/generated.png']:null,
  input:{image:'never echo input'},logs:'never echo logs',error:'never echo raw provider error',
  urls:{get:'https://hostile.invalid/get',cancel:'https://hostile.invalid/cancel'},metrics:{cost:9,warm:true}});
function fakeTransport(actions=[]) {
  const calls=[];
  function request(options,respond) {
    const call={options,body:null,destroyed:false};calls.push(call);
    const req=new EventEmitter();req.destroy=()=>{call.destroyed=true;};
    req.end=body=>{
      call.body=body&&Buffer.from(body);const action=actions.shift()??{body:provider()};
      queueMicrotask(()=>{
        if(action.error){req.emit('error',new Error(action.error));return;}
        if(action.timeout){req.emit('timeout');return;}
        if(action.hang)return;
        const res=new Readable({read(){}});call.response=res;
        res.statusCode=action.status??201;
        res.headers={'content-type':'application/json',...action.headers};respond(res);
        if(res.destroyed)return;
        action.beforeBody?.();
        if(action.reset){res.emit('aborted');res.destroy();return;}
        const chunks=action.chunks??[Buffer.from(action.raw??JSON.stringify(action.body??provider()))];
        for(const chunk of chunks)res.push(chunk);res.push(null);
      });
    };return req;
  }
  return {request,calls};
}
function setup(actions,overrides={}) {
  let time=0,trusted=180000;
  const claim={job_id:randomUUID(),account_id:randomUUID(),fence:7,attempt:1,
    attempt_deadline:new Date('2026-10-03T12:03:00Z')};
  const c=candidate(),b=binding(c),prepared=prepareReplicateRequest(c,b);
  const s={...structuredClone(b),id:randomUUID(),job_id:claim.job_id,provider:'replicate',
    submission_fence:claim.fence,attempt_number:1,attempt_ticket_id:randomUUID(),
    attempt_deadline:claim.attempt_deadline,state:'preflight',prediction_id:null,provider_status:null};
  const stats={authorize:0,bind:0,ambiguous:0,observe:0,final:0,reservation:0};
  const authority={
    async authorize(_claim,preparedBinding) {
      stats.authorize++;assert.equal(preparedBinding.request_sha,s.request_sha);
      if(s.state!=='preflight')return {authorized:false,code:'submission_no_replay',submission:s};
      s.state='submitting';stats.reservation=300000;
      return {authorized:true,code:'submission_authorized',submission:s};
    },
    async bindPrediction(jobId,{prediction_id,request_sha,version}) {
      stats.bind++;assert.equal(jobId,claim.job_id);assert.equal(request_sha,s.request_sha);assert.equal(version,REPLICATE_VERSION);
      if(s.prediction_id&&s.prediction_id!==prediction_id){s.identity_conflict_at=new Date();return {recorded:false,code:'prediction_identity_conflict'};}
      s.prediction_id=prediction_id;s.state='known';
      return {recorded:true,submission_id:s.id,prediction_id,cleanup_required:false,completion_authorized:false};
    },
    async markAmbiguous() {stats.ambiguous++;if(s.state==='submitting'&&!s.prediction_id)s.state='ambiguous';return {changed:true,state:s.state};},
    async observe(_jobId,observation) {
      stats.observe++;assert.equal(observation.prediction_id,s.prediction_id);
      const old=s.provider_status;
      if(!['succeeded','failed','canceled','aborted'].includes(old)&&!(old==='processing'&&observation.status==='starting'))
        s.provider_status=observation.status;
      return {changed:old!==s.provider_status,status:s.provider_status};
    },...overrides};
  const f=fakeTransport(actions),waits=[];
  const transport=createReplicateTransport(config(),{request:f.request,sleep:async(ms,signal)=>{
    waits.push(ms);time+=ms;if(signal?.aborted)throw new Error('abort');
  }});
  const budget=createReplicateBudget(claim.attempt_deadline,180000,{now:()=>time,trustedRemaining:()=>trusted});
  const args={authority,claim,prepared,budget,finalAuthorize:async()=>{stats.final++;return true;}};
  return {c,b,s,prepared,claim,stats,authority,transport,budget,args,calls:f.calls,waits,
    advance:ms=>{time+=ms;},setTrusted:ms=>{trusted=ms;},getArgs:()=>({authority,submission:s,budget})};
}
const rejects=async(p,code)=>assert.rejects(p,error=>error instanceof ReplicateError&&error.code===code&&error.message===code&&error.cause===undefined);
const noSend=e=>{assert.equal(e.calls.length,0);assert.equal(e.stats.bind,0);};

// All requests are EventEmitter/Readable fakes. No server, DNS, provider, credentials or sockets.
test('missing hosted authorization makes zero creates',async t=>{
  for(const [label,change] of [
    ['absent',()=>undefined],['empty',()=>({})],['model',c=>({...c,model:'other/model'})],
    ['version',c=>({...c,version:'f'.repeat(64)})],['digest',c=>({...c,contractSha:'f'.repeat(64)})],
    ['missing token',c=>{delete c.token;return c;}],['empty token',c=>({...c,token:''})],
    ['whitespace token',c=>({...c,token:'bad token'})],['newline token',c=>({...c,token:'bad\r\ntoken'})],
    ['token too long',c=>({...c,token:'a'.repeat(513)})],['origin override',c=>({...c,origin:'https://hostile.invalid'})],
    ['TLS override',c=>({...c,rejectUnauthorized:false})],['response limit override',c=>({...c,maxResponse:99999999})]]) {
    await t.test(label,()=>{
      const f=fakeTransport();assert.throws(()=>createReplicateTransport(change(config()),{request:f.request}),e=>e.code==='config_denied');
      assert.equal(f.calls.length,0);
    });
  }
});
test('prepared request is closed, bounded, pinned and cryptographically bound',async t=>{
  for(const [label,change] of [
    ['version',c=>{c.version='a'.repeat(64);}],['extra top field',c=>{c.webhook='https://hostile.invalid';}],
    ['unknown input',c=>{c.input.strength=0.5;}],['URL image',c=>{c.input.image='https://hostile.invalid/private.jpg';}],
    ['PNG not prepared JPEG',c=>{c.input.image='data:image/png;base64,YQ==';}],['noncanonical base64',c=>{c.input.image='data:image/jpeg;base64,YR==';}],
    ['empty image',c=>{c.input.image='data:image/jpeg;base64,';}],['oversize image',c=>{c.input.image='data:image/jpeg;base64,'+Buffer.alloc(262145).toString('base64');}],
    ['oversize JSON',c=>{c.input.prompt='x'.repeat(393217);}],['prompt bytes',c=>{c.input.prompt='я'.repeat(1025);}],
    ['empty prompt',c=>{c.input.prompt=' ';}],['samples',c=>{c.input.num_samples='4';}],['resolution',c=>{c.input.image_resolution=512;}],
    ['detect',c=>{c.input.detect_resolution=1024;}],['steps',c=>{c.input.ddim_steps=31;}],['scale',c=>{c.input.scale=8;}],
    ['eta',c=>{c.input.eta=1;}],['random seed',c=>{c.input.seed=-1;}],['seed fraction',c=>{c.input.seed=0.5;}],
    ['large seed',c=>{c.input.seed=2147483648;}],['getter',c=>{Object.defineProperty(c.input,'prompt',{get(){throw new Error('private');}});} ]]) {
    await t.test(label,()=>{
      const c=candidate(),b=binding(c);change(c);
      assert.throws(()=>prepareReplicateRequest(c,b),e=>e.code==='provider_request_denied');
    });
  }
  for(const field of ['request_sha','transmitted_input_sha','contract_sha','version','source_input_sha']) {
    await t.test(`bad ${field}`,()=>{
      const c=candidate(),b=binding(c);b[field]=field==='source_input_sha'?'not-digest':'f'.repeat(64);
      assert.throws(()=>prepareReplicateRequest(c,b),e=>e.code==='provider_request_denied');
    });
  }
  const c=candidate(Buffer.alloc(262144)),b=binding(c),handle=prepareReplicateRequest(c,b);
  assert.ok(Object.isFrozen(handle));assert.ok(JSON.stringify(handle).length<300);
  assert.equal(hashReplicateRequest({input:c.input,version:c.version}),b.request_sha);
});
test('async create/get/cancel use exact fixed paths, TLS and header flags',async()=>{
  const e=setup([{body:provider('starting')},{body:provider('processing')},{body:provider('canceled')}]);
  const original=e.c.input.prompt;e.c.input.prompt='mutated after preparation';e.b.request_sha='f'.repeat(64);
  const result=await e.transport.create(e.args);assert.equal(result.status,'starting');assert.equal(result.completion_authorized,false);
  await e.transport.get(e.getArgs());await e.transport.cancel(e.getArgs());
  assert.deepEqual(e.calls.map(c=>[c.options.method,c.options.path]),[
    ['POST','/v1/predictions'],['GET','/v1/predictions/Prediction_1-abc'],['POST','/v1/predictions/Prediction_1-abc/cancel']]);
  assert.equal(JSON.parse(e.calls[0].body).input.prompt,original);
  assert.deepEqual(Object.keys(JSON.parse(e.calls[0].body)).sort(),['input','version']);
  for(const c of e.calls) {
    const o=c.options;assert.equal(o.hostname,'api.replicate.com');assert.equal(o.protocol,'https:');assert.equal(o.port,443);
    assert.equal(o.servername,'api.replicate.com');assert.equal(o.rejectUnauthorized,true);assert.equal(o.minVersion,'TLSv1.2');
    assert.equal(o.agent,false);assert.equal(o.timeout,5000);assert.equal(o.headers['Accept-Encoding'],'identity');
    assert.ok(o.headers.Authorization===`Bearer ${config().token}`);assert.equal(o.headers.Prefer,undefined);
    assert.equal(o.headers['Idempotency-Key'],undefined);assert.equal(o.headers['Cancel-After'],c===e.calls[0]?'165s':undefined);
  }
  assert.equal(e.stats.authorize,1);assert.equal(e.stats.final,1);assert.equal(e.stats.bind,1);
  assert.equal(e.stats.reservation,300000);
  assert.equal(JSON.stringify(result).includes(config().token),false);
});
test('durable authority denial and throw cause zero POST',async t=>{
  for(const mode of ['false','throw','truthy','missing final callback','throwing final callback'])await t.test(mode,async()=>{
    const e=setup();
    if(mode==='false')e.authority.authorize=async()=>({authorized:false});
    if(mode==='throw')e.authority.authorize=async()=>{throw new Error('uncertain commit private diagnostic');};
    if(mode==='truthy')e.authority.authorize=async()=>({authorized:1});
    if(mode==='missing final callback')delete e.args.finalAuthorize;
    if(mode==='throwing final callback')e.args.finalAuthorize=async()=>{throw new Error('private diagnostic');};
    await rejects(e.transport.create(e.args),mode==='throw'?'provider_authority_unavailable':
      mode==='missing final callback'?'config_denied':mode==='throwing final callback'?'provider_authorization_denied':'submission_no_replay');
    noSend(e);
  });
});
test('lost create response never creates twice',async()=>{
  const e=setup([{error:'accepted remotely; response lost; private diagnostic'}]);
  await rejects(e.transport.create(e.args),'provider_create_ambiguous');
  // A new transport object/caller sees the same durable authority; never uses a local replay cache.
  const second=createReplicateTransport(config(),{request:()=>{assert.fail('second caller sent POST');}});
  await rejects(second.create(e.args),'submission_no_replay');
  assert.equal(e.calls.length,1);assert.equal(e.s.state,'ambiguous');assert.equal(e.stats.reservation,300000);
  assert.equal(e.stats.authorize,2);
});
test('crash after committed submitting before invocation remains no-replay to another caller',async()=>{
  const e=setup();await e.authority.authorize(e.claim,e.b);
  await rejects(e.transport.create(e.args),'submission_no_replay');noSend(e);assert.equal(e.s.state,'submitting');
});
test('every bad POST class is one-shot and keeps conservative reservation',async t=>{
  for(const [label,action] of [
    ...[400,401,403,404,422,429,500,502,503].map(status=>[`HTTP ${status}`,{status,raw:'private diagnostic'}]),
    ['reset',{reset:true}],['timeout',{timeout:true}],['socket error',{error:'private diagnostic'}],
    ['malformed',{raw:'not JSON private diagnostic'}],['lost ID',{body:{...provider(),id:undefined}}],
    ['invalid ID',{body:provider('starting','../private')}],['oversized ID',{body:provider('starting','a'.repeat(129))}],
    ['unicode ID',{body:provider('starting','я')}],['wrong model',{body:{...provider(),model:'other/model'}}],
    ['wrong version',{body:{...provider(),version:'f'.repeat(64)}}],['unknown status',{body:provider('unknown')}],
    ['redirect',{status:302,headers:{location:'https://hostile.invalid'}}],
    ['header oversize',{headers:{'content-length':'524289'}}],['stream oversize',{chunks:[Buffer.alloc(262144),Buffer.alloc(262145)]}],
    ['encoded response',{headers:{'content-encoding':'gzip'}}],['wrong MIME',{headers:{'content-type':'text/plain'}}],
    ['length mismatch',{headers:{'content-length':'100'}}],['wrong output count',{body:{...provider('succeeded'),output:['https://replicate.delivery/x']}}],
    ['wrong output slots',{body:{...provider('succeeded'),output:[123,'https://replicate.delivery/x']}}]]) {
    await t.test(label,async()=>{
      const e=setup([action]);await rejects(e.transport.create(e.args),'provider_create_ambiguous');
      await rejects(e.transport.create(e.args),'submission_no_replay');assert.equal(e.calls.length,1);
      assert.equal(e.stats.reservation,300000);assert.equal(e.s.state,'ambiguous');assert.equal(e.stats.bind,0);
    });
  }
});
test('returned authorization must match immutable request, version, claim and prepared binding',async t=>{
  for(const [label,change] of [
    ['request',s=>{s.request_sha='f'.repeat(64);}],['version',s=>{s.version='f'.repeat(64);}],
    ['contract',s=>{s.contract_sha='f'.repeat(64);}],['model',s=>{s.model='other/model';}],
    ['transform',s=>{s.transform.content_rect.x=1;}],['job',s=>{s.job_id=randomUUID();}],
    ['attempt',s=>{s.attempt_number=2;}],['fence',s=>{s.submission_fence=8;}],['deadline',s=>{s.attempt_deadline=new Date('2026-10-03T12:04:00Z');}],
    ['state',s=>{s.state='known';}],['identity already known',s=>{s.prediction_id='alreadyKnown';}],
    ['quarantine',s=>{s.identity_conflict_at=new Date();}],['bad submission ID',s=>{s.id='private arbitrary';}],
    ['bad ticket',s=>{s.attempt_ticket_id='bad';}],['acceptance',s=>{s.privacy_acceptance_sha='f'.repeat(64);} ]]) {
    await t.test(label,async()=>{
      const e=setup(),authorize=e.authority.authorize;
      e.authority.authorize=async(...args)=>{const result=await authorize(...args);change(e.s);return result;};
      await rejects(e.transport.create(e.args),'provider_authorization_denied');noSend(e);
    });
  }
});
test('final abort, deadline and revocation prevent invocation after committed authorization',async t=>{
  for(const mode of ['abort','deadline','revoked','final clock throw','final binding mutation','claim mutation'])await t.test(mode,async()=>{
    const e=setup(),controller=new AbortController();e.args.signal=controller.signal;
    e.args.finalAuthorize=async()=>{
      if(mode==='abort')controller.abort();if(mode==='deadline')e.advance(160001);
      if(mode==='final clock throw')e.setTrusted(NaN);
      if(mode==='final binding mutation')e.s.request_sha='f'.repeat(64);
      if(mode==='claim mutation'){e.claim.job_id=randomUUID();return false;}
      return mode!=='revoked';
    };
    await rejects(e.transport.create(e.args),mode==='abort'?'provider_aborted':
      ['deadline','final clock throw'].includes(mode)?'provider_deadline':'provider_authorization_denied');
    noSend(e);assert.equal(e.s.state,'ambiguous');assert.equal(e.stats.reservation,300000);
  });
  const e=setup();e.advance(160001);await rejects(e.transport.create(e.args),'provider_deadline');noSend(e);assert.equal(e.stats.authorize,0);
  const control=setup();control.advance(160000);await control.transport.create(control.args);
  assert.equal(control.calls[0].options.headers['Cancel-After'],'5s');
});
test('late valid ID is bound for cleanup after abort/deadline and never grants output',async t=>{
  for(const mode of ['abort','deadline','lease expired'])await t.test(mode,async()=>{
    const controller=new AbortController(),action={body:provider('succeeded')};
    const e=setup([action]);e.args.signal=controller.signal;
    // At bind time the HTTP has finished; the ID must survive a lost completion lease.
    const bind=e.authority.bindPrediction;
    e.authority.bindPrediction=async(...args)=>{
      if(mode==='abort')controller.abort();if(mode==='deadline')e.advance(180001);
      const result=await bind(...args);return {...result,cleanup_required:mode==='lease expired'};
    };
    const result=await e.transport.create(e.args);assert.equal(e.stats.bind,1);assert.equal(e.s.prediction_id,'Prediction_1-abc');
    assert.equal(result.cleanup_required,true);assert.equal(result.completion_authorized,false);assert.equal(getSucceededOutput(result),null);
  });
});
test('lost ID commit and identity conflict never replay or overwrite/publish',async t=>{
  await t.test('lost ID commit',async()=>{
    const e=setup();e.authority.bindPrediction=async()=>{throw new Error('commit outcome unknown private');};
    await rejects(e.transport.create(e.args),'provider_create_ambiguous');await rejects(e.transport.create(e.args),'submission_no_replay');
    assert.equal(e.calls.length,1);assert.equal(e.s.state,'ambiguous');
  });
  await t.test('durably bound but commit acknowledgement lost',async()=>{
    const e=setup(),bind=e.authority.bindPrediction;
    e.authority.bindPrediction=async(...args)=>{await bind(...args);throw new Error('ack lost private');};
    await rejects(e.transport.create(e.args),'provider_create_ambiguous');await rejects(e.transport.create(e.args),'submission_no_replay');
    assert.equal(e.calls.length,1);assert.equal(e.s.state,'known');assert.equal(e.s.prediction_id,'Prediction_1-abc');
  });
  await t.test('identity conflict quarantined',async()=>{
    const e=setup();e.authority.bindPrediction=async()=>{e.s.identity_conflict_at=new Date();return {recorded:false,code:'prediction_identity_conflict'};};
    await rejects(e.transport.create(e.args),'prediction_identity_conflict');assert.equal(e.calls.length,1);assert.equal(e.stats.observe,0);
    await rejects(e.transport.create(e.args),'submission_no_replay');
  });
});
test('provider bodies and unknown metrics cannot leak or become measurements',async()=>{
  const e=setup([{body:provider('processing')},{body:provider('succeeded')}]);
  const first=await e.transport.create(e.args);assert.equal(getSucceededOutput(first),null);
  const final=await e.transport.get(e.getArgs()),serialized=JSON.stringify(final);
  for(const forbidden of [config().token,'https:','input','logs','error','metrics','cost','warm','urls'])assert.equal(serialized.includes(forbidden),false);
  assert.deepEqual(getSucceededOutput(final),{depthUri:'https://replicate.delivery/depth.png',generatedUri:'https://replicate.delivery/generated.png'});
  assert.equal(final.completion_authorized,false);assert.equal(Object.isFrozen(final),true);
  assert.equal(getSucceededOutput({...final}),null);
});
test('GET validates identity and status, rejects redirects and bounds streamed responses',async t=>{
  for(const [label,action,code] of [
    ['identity',{body:provider('succeeded','anotherPrediction')},'provider_protocol'],
    ['status',{body:provider('surprise')},'provider_protocol'],['model',{body:{...provider(),model:'other/model'}},'provider_protocol'],
    ['version',{body:{...provider(),version:'f'.repeat(64)}},'provider_protocol'],
    ['redirect',{status:307,headers:{location:'https://hostile.invalid'}},'provider_protocol'],
    ['body oversize',{chunks:[Buffer.alloc(524289)]},'provider_protocol'],['header oversize',{headers:{'content-length':'524289'}},'provider_protocol'],
    ['succeeded missing depth',{body:{...provider('succeeded'),output:[]}},'provider_output_denied'],
    ['succeeded extra output',{body:{...provider('succeeded'),output:['https://x.test/1','https://x.test/2','https://x.test/3']}},'provider_output_denied'],
    ['succeeded raw invalid URI',{body:{...provider('succeeded'),output:['no URI','https://x.test/2']}},'provider_output_denied'],
    ['succeeded HTTP URI',{body:{...provider('succeeded'),output:['http://x.test/1','https://x.test/2']}},'provider_output_denied'],
    ['succeeded long URI',{body:{...provider('succeeded'),output:['https://x.test/'+'x'.repeat(2048),'https://x.test/2']}},'provider_output_denied'] ]) {
    await t.test(label,async()=>{
      const e=setup([{body:provider()},action]);await e.transport.create(e.args);
      await rejects(e.transport.get(e.getArgs()),code);assert.equal(e.calls.length,2);assert.equal(e.stats.observe,1);
    });
  }
});
test('bounded GET retries handle 429, faults, fixed deadline and abort',async t=>{
  await t.test('429 Retry-After is at most five seconds',async()=>{
    const e=setup([{body:provider()},{status:429,headers:{'retry-after':'999'}},{body:provider('succeeded')}]);
    await e.transport.create(e.args);assert.equal((await e.transport.poll(e.getArgs())).status,'succeeded');
    assert.deepEqual(e.waits,[5000]);assert.equal(e.calls.length,3);
  });
  await t.test('429 fractional Retry-After',async()=>{
    const e=setup([{body:provider()},{status:429,headers:{'retry-after':'0.25'}},{body:provider('succeeded')}]);
    await e.transport.create(e.args);await e.transport.poll(e.getArgs());assert.deepEqual(e.waits,[250]);
  });
  await t.test('transient faults stop at three consecutive failures',async()=>{
    const e=setup([{body:provider()},{error:'socket reset'},{status:503},{timeout:true},{body:provider('succeeded')}]);
    await e.transport.create(e.args);await rejects(e.transport.poll(e.getArgs()),'provider_unavailable');
    assert.deepEqual(e.waits,[2000,4000]);assert.equal(e.calls.length,4);assert.equal(e.calls.filter(c=>c.options.path==='/v1/predictions').length,1);
  });
  await t.test('success resets consecutive fault count; ordinary interval is two seconds',async()=>{
    const e=setup([{body:provider()},{status:500},{body:provider('processing')},{error:'socket reset'},{body:provider('succeeded')}]);
    await e.transport.create(e.args);await e.transport.poll(e.getArgs());assert.deepEqual(e.waits,[2000,2000,2000]);
  });
  await t.test('wait is capped at original remaining deadline',async()=>{
    const e=setup([{body:provider()},{status:429,headers:{'retry-after':'999'}}]);await e.transport.create(e.args);e.advance(178500);
    await rejects(e.transport.poll(e.getArgs()),'provider_deadline');assert.deepEqual(e.waits,[1500]);assert.equal(e.calls.length,2);
    assert.equal(e.calls[1].options.timeout,1500);
  });
  await t.test('abort during retry wait prevents another GET',async()=>{
    const e=setup([{body:provider()},{status:500}]),controller=new AbortController();await e.transport.create(e.args);
    const transport=createReplicateTransport(config(),{request:(o,cb)=>{
      e.calls.push({options:o});const r=new EventEmitter();r.destroy=()=>{};r.end=()=>queueMicrotask(()=>r.emit('error',new Error('reset')));return r;
    },sleep:async()=>{controller.abort();}});
    await rejects(transport.poll({...e.getArgs(),signal:controller.signal}),'provider_aborted');assert.equal(e.calls.length,2);
  });
  await t.test('total HTTP timer caps a stalled injected stream',async()=>{
    const e=setup([{body:provider()},{hang:true}]);await e.transport.create(e.args);
    const budget=createReplicateBudget(e.s.attempt_deadline,15);
    await rejects(e.transport.get({...e.getArgs(),budget}),'provider_unavailable');assert.equal(e.calls.length,2);assert.equal(e.calls[1].destroyed,true);
  });
});
test('budgets cannot reset, increase, run backwards or hide invalid trusted values',async()=>{
  for(const value of [0,-1,180001,Infinity,NaN])assert.throws(()=>createReplicateBudget(new Date(),value),e=>e.code==='provider_deadline');
  const e=setup();e.setTrusted(1000);await rejects(e.transport.create(e.args),'provider_deadline');e.setTrusted(180000);
  await rejects(e.transport.create(e.args),'provider_deadline');noSend(e);
  const back=setup();back.advance(-1);await rejects(back.transport.create(back.args),'provider_deadline');noSend(back);
});
test('cancellation is safe observation without replay, completion or refund authority',async()=>{
  const e=setup([{body:provider('succeeded')},{body:provider('processing')},{body:provider('canceled')},{error:'cancel acknowledgement lost'}]);
  await e.transport.create(e.args);
  const get=await e.transport.get(e.getArgs());assert.equal(get.status,'succeeded');assert.equal(getSucceededOutput(get),null);
  const cancel=await e.transport.cancel(e.getArgs());assert.equal(cancel.status,'succeeded');assert.equal(getSucceededOutput(cancel),null);
  await rejects(e.transport.cancel(e.getArgs()),'provider_unavailable');assert.equal(e.calls.length,4);
  await rejects(e.transport.create(e.args),'submission_no_replay');assert.equal(e.stats.reservation,300000);
  const bad={...e.s,prediction_id:'../../bad'};
  await rejects(e.transport.cancel({...e.getArgs(),submission:bad}),'provider_authorization_denied');assert.equal(e.calls.length,4);
});
test('hosted mode remains disabled without activation evidence',async()=>{
  assert.equal(REPLICATE_MODEL,'jagilley/controlnet-depth2img');
  assert.equal(REPLICATE_VERSION,'922c7bb67b87ec32cbc2fd11b1d5f94f0ba4f5519c4dbd02856376444127cc60');
  assert.equal(REPLICATE_CONTRACT_SHA,'3d94bb6e59e6a90e24a0504abb4c06c055f7619372e2c36313f42de5d86e99bc');
  const e=setup(),withoutAuthorization={...e.b};delete withoutAuthorization.billing_acceptance_sha;
  assert.throws(()=>prepareReplicateRequest(e.c,withoutAuthorization),error=>error.code==='provider_request_denied');
  await rejects(e.transport.create({...e.args,prepared:{...e.prepared}}),'provider_request_denied');noSend(e);
});
test('maximum prepared JPEG and prompts stay below literal request limit; response limit is inclusive',async()=>{
  const e=setup([{body:provider()}]);const c=candidate(Buffer.alloc(262144));
  for(const name of ['prompt','a_prompt','n_prompt'])c.input[name]='x'.repeat(2048);
  const b={...e.b,transmitted_input_sha:hash(Buffer.alloc(262144)),request_sha:hashReplicateRequest(c)};
  Object.assign(e.s,b);e.args.prepared=prepareReplicateRequest(c,b);
  await e.transport.create(e.args);assert.ok(e.calls[0].body.length<=393216);assert.equal(e.calls[0].options.headers['Content-Length'],e.calls[0].body.length);
  const body=JSON.stringify(provider('succeeded')),padded=body+' '.repeat(524288-Buffer.byteLength(body));
  const f=fakeTransport([{raw:padded,headers:{'content-length':'524288'}}]);
  const adapter=createReplicateTransport(config(),{request:f.request});
  assert.equal((await adapter.get(e.getArgs())).status,'succeeded');assert.equal(f.calls.length,1);
});
test('trailing newline token and IDs fail closed before transport or identity binding',async()=>{
  const f=fakeTransport();assert.throws(()=>createReplicateTransport({...config(),token:config().token+'\n'},{request:f.request}),e=>e.code==='config_denied');
  const e=setup([{body:provider('starting','Prediction_1-abc\n')}]);
  await rejects(e.transport.create(e.args),'provider_create_ambiguous');assert.equal(e.stats.bind,0);assert.equal(e.calls.length,1);
  e.s.prediction_id='Prediction_1-abc\n';await rejects(e.transport.get(e.getArgs()),'provider_authorization_denied');assert.equal(e.calls.length,1);
});
test('all provider terminal statuses are observations without local job completion',async t=>{
  for(const status of ['starting','processing','succeeded','failed','canceled','aborted'])await t.test(status,async()=>{
    const e=setup([{body:provider(status)}]);const result=await e.transport.create(e.args);
    assert.equal(result.status,status);assert.equal(result.completion_authorized,false);
    assert.equal(getSucceededOutput(result)!==null,status==='succeeded');
  });
});
test('abort in flight is ambiguous, attempts no retry and exposes no raw error',async()=>{
  const controller=new AbortController(),e=setup([{hang:true}]);e.args.signal=controller.signal;
  const pending=e.transport.create(e.args);await new Promise(resolve=>setImmediate(resolve));controller.abort();
  await rejects(pending,'provider_create_ambiguous');await rejects(e.transport.create({...e.args,signal:undefined}),'submission_no_replay');
  assert.equal(e.calls.length,1);assert.equal(e.calls[0].destroyed,true);assert.equal(e.stats.bind,0);
});
test('invalid UTF8 response fails closed and does not bind an ID',async()=>{
  const p=provider();p.logs='replace marker';const bytes=Buffer.from(JSON.stringify(p));
  const index=bytes.indexOf('replace marker');bytes[index]=0xff;
  const e=setup([{chunks:[bytes]}]);await rejects(e.transport.create(e.args),'provider_create_ambiguous');assert.equal(e.stats.bind,0);
});
test('injected sleepers remain abortable and capped at the original deadline',async()=>{
  const e=setup();await e.transport.create(e.args);
  const f=fakeTransport([{body:provider('processing')}]);
  const adapter=createReplicateTransport(config(),{request:f.request,sleep:()=>new Promise(()=>{})});
  const budget=createReplicateBudget(e.s.attempt_deadline,20);
  await rejects(adapter.poll({...e.getArgs(),budget}),'provider_deadline');assert.equal(f.calls.length,1);
  const controller=new AbortController(),g=fakeTransport([{body:provider('processing')}]);
  const abortable=createReplicateTransport(config(),{request:g.request,sleep:()=>new Promise(()=>{})});
  const pending=abortable.poll({...e.getArgs(),signal:controller.signal});
  await new Promise(resolve=>setImmediate(resolve));controller.abort();await rejects(pending,'provider_aborted');assert.equal(g.calls.length,1);
});
test('observation crossing the deadline cannot make private output eligible',async()=>{
  const e=setup([{body:provider('succeeded')}]),observe=e.authority.observe;
  e.authority.observe=async(...args)=>{const result=await observe(...args);e.advance(180001);return result;};
  const late=await e.transport.create(e.args);assert.equal(late.cleanup_required,true);assert.equal(getSucceededOutput(late),null);
  const g=setup([{body:provider()},{body:provider('succeeded')}]);await g.transport.create(g.args);
  const original=g.authority.observe;g.authority.observe=async(...args)=>{const result=await original(...args);g.advance(180001);return result;};
  await rejects(g.transport.get(g.getArgs()),'provider_deadline');assert.equal(g.s.provider_status,'succeeded');
});
test('I3 remaining-budget accessor shares the fixed cap and abort signal',()=>{
  const e=setup();assert.equal(remainingReplicateBudget(e.budget),180000);e.advance(1000);
  assert.equal(remainingReplicateBudget(e.budget),179000);e.setTrusted(9000);
  assert.equal(remainingReplicateBudget(e.budget),9000);e.setTrusted(180000);
  assert.equal(remainingReplicateBudget(e.budget),9000);
  assert.throws(()=>remainingReplicateBudget({...e.budget}),error=>error.code==='provider_deadline');
  const controller=new AbortController();controller.abort();
  assert.throws(()=>remainingReplicateBudget(e.budget,controller.signal),error=>error.code==='provider_aborted');
});
