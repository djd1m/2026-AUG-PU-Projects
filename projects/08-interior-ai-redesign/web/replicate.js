import https from 'node:https';
import { createHash } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { setTimeout as delay } from 'node:timers/promises';
import { validatePreparedBinding } from './provider-submissions.js';

export const REPLICATE_MODEL='jagilley/controlnet-depth2img';
export const REPLICATE_VERSION='922c7bb67b87ec32cbc2fd11b1d5f94f0ba4f5519c4dbd02856376444127cc60';
// SHA256 of canonical {model,version,input,output} from the accepted schema capture.
export const REPLICATE_CONTRACT_SHA='3d94bb6e59e6a90e24a0504abb4c06c055f7619372e2c36313f42de5d86e99bc';
const MAX_REQUEST=393216,MAX_RESPONSE=524288,MAX_IMAGE=262144;
const ID=/^[a-zA-Z0-9_-]{1,128}(?![\s\S])/,UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}(?![\s\S])/i;
const STATUSES=['starting','processing','succeeded','failed','canceled','aborted'];
const TERMINAL=['succeeded','failed','canceled','aborted'];
const CODES=['config_denied','provider_request_denied','provider_protocol','provider_output_denied',
  'provider_create_ambiguous','provider_authorization_denied','provider_authority_unavailable',
  'provider_deadline','provider_aborted','provider_unavailable','provider_rate_limited',
  'submission_no_replay','prediction_identity_conflict'];
const requests=new WeakMap(),budgets=new WeakMap(),outputs=new WeakMap();
export class ReplicateError extends Error {
  constructor(code) { super(CODES.includes(code)?code:'provider_protocol');this.name='ReplicateError';this.code=this.message; }
}
const deny=code=>{throw new ReplicateError(code);};
const safe=error=>error instanceof ReplicateError?error:new ReplicateError('provider_unavailable');
const timestamp=value=>{const time=new Date(value).getTime();if(!Number.isFinite(time))deny('provider_deadline');return new Date(time).toISOString();};
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const canonical=value=>value===null||typeof value!=='object'?JSON.stringify(value):
  Array.isArray(value)?'['+value.map(canonical).join(',')+']':
    '{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+canonical(value[k])).join(',')+'}';
function closed(value,keys,code) {
  if(!value||Object.getPrototypeOf(value)!==Object.prototype||
    Reflect.ownKeys(value).length!==keys.length||keys.some(k=>!Object.hasOwn(value,k))||
    Object.values(Object.getOwnPropertyDescriptors(value)).some(d=>!Object.hasOwn(d,'value')))deny(code);
}
function candidateBytes(candidate) {
  closed(candidate,['version','input'],'provider_request_denied');
  if(candidate.version!==REPLICATE_VERSION)deny('provider_request_denied');
  const i=candidate.input;
  closed(i,['image','prompt','a_prompt','n_prompt','num_samples','image_resolution','detect_resolution',
    'ddim_steps','scale','eta','seed'],'provider_request_denied');
  for(const field of ['prompt','a_prompt','n_prompt'])
    if(typeof i[field]!=='string'||!i[field].trim()||Buffer.byteLength(i[field])>2048)deny('provider_request_denied');
  if(i.num_samples!=='1'||i.image_resolution!=='512'||i.detect_resolution!==512||i.ddim_steps!==30||
    i.scale!==7.5||i.eta!==0||!Number.isSafeInteger(i.seed)||i.seed<0||i.seed>2147483647)deny('provider_request_denied');
  if(typeof i.image!=='string'||i.image.length>349551||
    !/^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/.test(i.image))deny('provider_request_denied');
  const encoded=i.image.slice(23),image=Buffer.from(encoded,'base64');
  if(!image.length||image.length>MAX_IMAGE||image.toString('base64')!==encoded)deny('provider_request_denied');
  const bytes=Buffer.from(canonical(candidate));
  if(bytes.length>MAX_REQUEST)deny('provider_request_denied');
  return {bytes,imageSha:sha(image)};
}
// Server-only preparation: I3 supplies sanitized JPEG data URI; no decode/URL fetch here.
export function hashReplicateRequest(candidate) {
  try{return sha(candidateBytes(candidate).bytes);}catch(error){throw error instanceof ReplicateError?error:new ReplicateError('provider_request_denied');}
}
export function prepareReplicateRequest(candidate,binding) {
  try {
    const b=validatePreparedBinding(binding),{bytes,imageSha}=candidateBytes(candidate);
    if(Object.entries(b).some(([k,v])=>k.endsWith('_sha')&&(typeof v!=='string'||! /^[a-f0-9]{64}(?![\s\S])/.test(v)))||
      b.model!==REPLICATE_MODEL||b.version!==REPLICATE_VERSION||b.contract_sha!==REPLICATE_CONTRACT_SHA||
      b.request_sha!==sha(bytes)||b.transmitted_input_sha!==imageSha)deny('provider_request_denied');
    Object.freeze(b.transform.content_rect);Object.freeze(b.transform);Object.freeze(b);
    const handle=Object.freeze({request_sha:b.request_sha,version:b.version,contract_sha:b.contract_sha});
    requests.set(handle,{bytes,binding:b});return handle;
  } catch(error) {throw error instanceof ReplicateError?error:new ReplicateError('provider_request_denied');}
}
// Construct once from fresh trusted DB remaining time for the ORIGINAL deadline.
// Reuse the same budget throughout create/poll/import; never refresh it per poll.
export function createReplicateBudget(attemptDeadline,remainingMs,{now=()=>performance.now(),trustedRemaining}={}) {
  const deadline=new Date(attemptDeadline).getTime();
  if(!Number.isFinite(deadline)||!Number.isFinite(remainingMs)||remainingMs<=0||remainingMs>180000||
    typeof now!=='function'||(trustedRemaining!==undefined&&typeof trustedRemaining!=='function'))deny('provider_deadline');
  let start;try{start=now();}catch{deny('provider_deadline');}if(!Number.isFinite(start))deny('provider_deadline');
  let last=start,cap=remainingMs;
  const handle=Object.freeze({attempt_deadline:new Date(deadline).toISOString()});
  budgets.set(handle,()=>{
    let current;try{current=now();}catch{deny('provider_deadline');}if(!Number.isFinite(current)||current<last)deny('provider_deadline');last=current;
    let remaining=remainingMs-(current-start);
    if(trustedRemaining) {
      let trusted;try{trusted=trustedRemaining();}catch{deny('provider_deadline');}if(!Number.isFinite(trusted))deny('provider_deadline');
      remaining=Math.min(remaining,trusted);
    }
    cap=Math.min(cap,remaining);return Math.floor(cap);
  });return handle;
}
function remaining(budget,signal) {
  if(signal?.aborted)deny('provider_aborted');
  const read=budgets.get(budget);if(!read)deny('provider_deadline');
  const ms=read();if(ms<=0)deny('provider_deadline');return ms;
}
export function remainingReplicateBudget(budget,signal) {return remaining(budget,signal);}
function validateSubmission(s,claim,b,budget,creating=false) {
  if(!s||!UUID.test(s.id)||s.job_id!==claim?.job_id||s.provider!=='replicate'||s.identity_conflict_at||
    s.attempt_number!==claim.attempt||timestamp(s.attempt_deadline)!==budget?.attempt_deadline||
    new Date(claim.attempt_deadline).getTime()!==new Date(s.attempt_deadline).getTime()||
    !UUID.test(s.attempt_ticket_id)||Object.keys(b).some(k=>canonical(s[k])!==canonical(b[k]))||
    (creating&&(s.state!=='submitting'||s.prediction_id||s.submission_fence!==claim.fence)))deny('provider_authorization_denied');
}
function prediction(body,expectedId) {
  if(!body||typeof body!=='object'||!ID.test(body.id)||typeof body.id!=='string'||
    (expectedId!==undefined&&body.id!==expectedId)||body.version!==REPLICATE_VERSION||
    body.model!==REPLICATE_MODEL||!STATUSES.includes(body.status))deny('provider_protocol');
  let output;
  if(body.status==='succeeded') {
    if(!Array.isArray(body.output)||body.output.length!==2||body.output.some(uri=>{
      if(typeof uri!=='string'||uri.length>2048)return true;
      try {return new URL(uri).protocol!=='https:';}catch{return true;}
    }))deny('provider_output_denied');
    output=Object.freeze({depthUri:body.output[0],generatedUri:body.output[1]});
  }
  return {id:body.id,status:body.status,output};
}
// Output URLs are held out of enumerable return values, errors, JSON and artifacts.
// Internal I3 consumer only; this is not a browser/media authorization API.
export function getSucceededOutput(observation) {return outputs.get(observation)??null;}
function observation(s,p,status,cleanup=false) {
  if(!STATUSES.includes(status))deny('provider_protocol');
  const result=Object.freeze({submission_id:s.id,prediction_id:p.id,status,cleanup_required:cleanup,
    completion_authorized:false,output_available:!cleanup&&status==='succeeded'&&p.status===status});
  if(result.output_available)outputs.set(result,p.output);return result;
}
function retryAfter(headers) {
  const value=headers?.['retry-after'];
  if(typeof value!=='string'||!/^\d+(?:\.\d+)?$/.test(value))return 5000;
  return Math.min(5000,Math.max(0,Math.ceil(Number(value)*1000)));
}
export function createReplicateTransport(config,{request=https.request,sleep=(ms,signal)=>delay(ms,undefined,{signal})}={}) {
  closed(config,['model','version','contractSha','token'],'config_denied');
  if(config.model!==REPLICATE_MODEL||config.version!==REPLICATE_VERSION||config.contractSha!==REPLICATE_CONTRACT_SHA||
    typeof config.token!=='string'||! /^[\x21-\x7e]{1,512}(?![\s\S])/.test(config.token)||
    typeof request!=='function'||typeof sleep!=='function')deny('config_denied');
  // Snapshot secret/config; caller mutation cannot alter a later request.
  const token=config.token;
  async function http(method,path,body,{budget,signal,headers={}}) {
    const timeoutMs=Math.min(5000,remaining(budget,signal));
    return new Promise((resolve,reject)=>{
      let req,res,timer,done=false;
      const finish=(error,value)=>{
        if(done)return;done=true;clearTimeout(timer);signal?.removeEventListener('abort',abort);
        if(error){res?.destroy();req?.destroy();reject(safe(error));}else resolve(value);
      };
      const abort=()=>finish(new ReplicateError('provider_aborted'));
      timer=setTimeout(()=>finish(new ReplicateError('provider_unavailable')),timeoutMs);
      signal?.addEventListener('abort',abort,{once:true});
      try {
        req=request({protocol:'https:',hostname:'api.replicate.com',port:443,servername:'api.replicate.com',
          path,method,agent:false,rejectUnauthorized:true,minVersion:'TLSv1.2',timeout:timeoutMs,
          headers:{Authorization:`Bearer ${token}`,Accept:'application/json','Accept-Encoding':'identity',
            ...(body?{'Content-Type':'application/json','Content-Length':body.length}:{}),...headers}},response=>{
          res=response;res.on('error',error=>finish(error));res.on('aborted',()=>finish(new ReplicateError('provider_unavailable')));
          if(done){res.destroy();return;}
          const status=res.statusCode;
          if(status===429) {const error=new ReplicateError('provider_rate_limited');error.retryAfterMs=retryAfter(res.headers);finish(error);return;}
          if(status>=500&&status<=599){finish(new ReplicateError('provider_unavailable'));return;}
          if(status<200||status>299||!Number.isInteger(status)||
            (res.headers['content-encoding']!==undefined&&res.headers['content-encoding']!=='identity')||
            !/^application\/json(?:\s*;|$)/i.test(res.headers['content-type']??'')) {finish(new ReplicateError('provider_protocol'));return;}
          const length=res.headers['content-length'];
          if(length!==undefined&&(!/^\d+$/.test(String(length))||Number(length)>MAX_RESPONSE)) {
            finish(new ReplicateError('provider_protocol'));return;
          }
          const chunks=[];let size=0;
          res.on('data',chunk=>{
            if(done)return;
            if(!Buffer.isBuffer(chunk)){finish(new ReplicateError('provider_protocol'));return;}
            size+=chunk.length;if(size>MAX_RESPONSE){finish(new ReplicateError('provider_protocol'));return;}
            chunks.push(chunk);
          });
          res.on('end',()=>{
            if(done)return;
            try {if(length!==undefined&&size!==Number(length))deny('provider_protocol');finish(null,JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks,size))));}
            catch {finish(new ReplicateError('provider_protocol'));}
          });
          res.on('close',()=>{if(!done)finish(new ReplicateError('provider_unavailable'));});
        });
        req.on('error',error=>finish(error));req.on('timeout',()=>finish(new ReplicateError('provider_unavailable')));
        // The same checks apply to injected event transports and the real HTTPS boundary.
        remaining(budget,signal);req.end(body);
      } catch(error) {finish(error);}
    });
  }
  async function boundedWait(ms,budget,signal) {
    ms=Math.min(ms,remaining(budget,signal));
    await new Promise((resolve,reject)=>{
      let timer,done=false;
      const finish=error=>{if(done)return;done=true;clearTimeout(timer);signal?.removeEventListener('abort',abort);error?reject(safe(error)):resolve();};
      const abort=()=>finish(new ReplicateError('provider_aborted'));
      signal?.addEventListener('abort',abort,{once:true});
      timer=setTimeout(()=>finish(),ms);
      if(signal?.aborted){abort();return;}
      Promise.resolve().then(()=>sleep(ms,signal)).then(()=>finish(),error=>finish(error));
    });
    remaining(budget,signal);
  }
  const identity=(s,p)=>({request_sha:s.request_sha,prediction_id:p.id,version:REPLICATE_VERSION,status:p.status});
  async function observe(authority,s,p,cleanup=false,budget,signal) {
    let result;
    try {result=await authority.observe(s.job_id,identity(s,p));}
    catch {deny('provider_authority_unavailable');}
    if(budget){try{remaining(budget,signal);}catch{cleanup=true;}}
    return observation(s,p,result?.status,cleanup);
  }
  async function ambiguous(authority,jobId,requestSha) {
    try {await authority.markAmbiguous(jobId,requestSha);return true;}catch{return false;}
  }
  const adapter={
    async create({authority,claim,prepared,budget,signal,finalAuthorize}) {
      const data=requests.get(prepared);if(!data)deny('provider_request_denied');
      if(!authority||['authorize','bindPrediction','markAmbiguous','observe'].some(k=>typeof authority[k]!=='function')||
        typeof finalAuthorize!=='function')deny('config_denied');
      const {binding:b,bytes}=data;
      if(!claim||!UUID.test(claim.job_id)||!UUID.test(claim.account_id)||!Number.isSafeInteger(claim.fence)||
        claim.fence<1||![1,2].includes(claim.attempt))deny('provider_authorization_denied');
      claim=Object.freeze({job_id:claim.job_id,account_id:claim.account_id,fence:claim.fence,attempt:claim.attempt,
        attempt_deadline:timestamp(claim.attempt_deadline)});
      remaining(budget,signal);
      if(budget.attempt_deadline!==timestamp(claim?.attempt_deadline)||
        Math.floor(remaining(budget,signal)/1000-15)<5)deny('provider_deadline');
      let authorized;
      try {authorized=await authority.authorize(claim,b);}catch {deny('provider_authority_unavailable');}
      if(authorized?.authorized!==true)deny('submission_no_replay');
      let invoked=false,s=authorized.submission;
      try {
        validateSubmission(s,claim,b,budget,true);
        if(authorized.code!=='submission_authorized')deny('provider_authorization_denied');
        const allowed=await finalAuthorize(Object.freeze({submission_id:s.id,job_id:s.job_id,
          request_sha:b.request_sha,version:b.version,attempt_deadline:budget.attempt_deadline}));
        if(allowed!==true)deny('provider_authorization_denied');
        validateSubmission(s,claim,b,budget,true);
        const seconds=Math.floor(remaining(budget,signal)/1000-15);
        if(seconds<5)deny('provider_deadline');
        // Sole invocation: no asynchronous gap after the final abort/deadline check.
        invoked=true;
        const p=prediction(await http('POST','/v1/predictions',bytes,
          {budget,signal,headers:{'Cancel-After':`${seconds}s`}}));
        let bound;
        try {bound=await authority.bindPrediction(claim.job_id,{request_sha:b.request_sha,prediction_id:p.id,version:b.version});}
        catch {deny('provider_create_ambiguous');}
        if(bound?.recorded!==true||bound.prediction_id!==p.id||bound.submission_id!==s.id||bound.completion_authorized!==false||typeof bound.cleanup_required!=='boolean') {
          if(bound?.code==='prediction_identity_conflict')deny('prediction_identity_conflict');
          deny('provider_create_ambiguous');
        }
        // A late ID can still be bound after abort/deadline/lease loss for cleanup.
        let late=bound.cleanup_required===true;
        try {remaining(budget,signal);}catch {late=true;}
        return await observe(authority,s,p,late,budget,signal);
      } catch(error) {
        const recorded=await ambiguous(authority,claim.job_id,b.request_sha);
        if(error instanceof ReplicateError&&error.code==='prediction_identity_conflict')throw error;
        if(invoked)deny('provider_create_ambiguous');
        if(!recorded)deny('provider_authority_unavailable');
        throw error instanceof ReplicateError?error:new ReplicateError('provider_authorization_denied');
      }
    },
    // One GET; I4 may use this for one-action-per-maintenance-pass cleanup.
    async get({authority,submission,budget,signal}) {
      const s=submission;
      if(!s||s.provider!=='replicate'||s.model!==REPLICATE_MODEL||s.version!==REPLICATE_VERSION||
        s.contract_sha!==REPLICATE_CONTRACT_SHA||s.identity_conflict_at||typeof s.prediction_id!=='string'||
        !ID.test(s.prediction_id)||!UUID.test(s.id)||!UUID.test(s.job_id)||
        typeof s.request_sha!=='string'||! /^[a-f0-9]{64}(?![\s\S])/.test(s.request_sha)||
        timestamp(s.attempt_deadline)!==budget?.attempt_deadline||typeof authority?.observe!=='function')deny('provider_authorization_denied');
      const p=prediction(await http('GET',`/v1/predictions/${s.prediction_id}`,null,{budget,signal}),s.prediction_id);
      remaining(budget,signal);const result=await observe(authority,s,p,false,budget,signal);
      remaining(budget,signal);return result;
    },
    // Only the prediction polling loop; no job claim/heartbeat/release/scheduler.
    async poll(args) {
      let faults=0;
      for(;;) {
        let result,wait;
        try {result=await adapter.get(args);faults=0;}
        catch(error) {
          const e=safe(error);
          if(!['provider_unavailable','provider_rate_limited'].includes(e.code))throw e;
          faults++;if(faults>=3)throw e; // Third consecutive fault terminates; no fourth GET.
          wait=e.code==='provider_rate_limited'?e.retryAfterMs:[2000,4000,5000][faults-1];
        }
        if(result&&TERMINAL.includes(result.status))return result;
        await boundedWait(wait??2000,args.budget,args.signal);
      }
    },
    async cancel({authority,submission,budget,signal}) {
      // Same identity validation/observation as GET, fixed own path, never DELETE.
      const s=submission;
      if(!s||s.provider!=='replicate'||s.model!==REPLICATE_MODEL||s.version!==REPLICATE_VERSION||
        s.contract_sha!==REPLICATE_CONTRACT_SHA||s.identity_conflict_at||typeof s.prediction_id!=='string'||
        !ID.test(s.prediction_id)||!UUID.test(s.id)||!UUID.test(s.job_id)||
        typeof s.request_sha!=='string'||! /^[a-f0-9]{64}(?![\s\S])/.test(s.request_sha)||
        timestamp(s.attempt_deadline)!==budget?.attempt_deadline||typeof authority?.observe!=='function')deny('provider_authorization_denied');
      const p=prediction(await http('POST',`/v1/predictions/${s.prediction_id}/cancel`,null,{budget,signal}),s.prediction_id);
      // Cancellation is an observation, even if raced with success; never output eligibility.
      return observe(authority,s,p,true);
    },
  };
  return Object.freeze(adapter);
}
