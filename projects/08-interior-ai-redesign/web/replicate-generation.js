import { performance } from 'node:perf_hooks';
import { createProviderSubmissions } from './provider-submissions.js';
import { createReplicateBudget, remainingReplicateBudget, createReplicateTransport,
  hashReplicateRequest, REPLICATE_VERSION } from './replicate.js';
import { prepareReplicateInput, getPrivateReplicateInput, prepareReplicateMediaRequest,
  createReplicateMedia } from './replicate-media.js';
import { replicateSettings, replicateTransportConfig } from './replicate-worker-config.js';
import { canonical, verifyArtifacts } from './generation.js';

const provenanceFields=['schema_version','mode','provider','quality','submission_id','prediction_id','model','version',
  'contract_sha','request_sha','source_input_sha','transmitted_input_sha','transform',
  'raw_provider_depth_sha','raw_provider_output_sha','depth_sha','output_sha'];
const safeCodes=new Set(['replicate_config_denied','replicate_worker_failed','replicate_binding_mismatch',
  'replicate_completion_denied','replicate_completion_uncertain','lease_lost','provider_deadline','provider_aborted',
  'provider_request_denied','provider_protocol','provider_output_denied','provider_create_ambiguous',
  'provider_authorization_denied','provider_authority_unavailable','provider_unavailable','provider_rate_limited',
  'submission_no_replay','prediction_identity_conflict']);
const fail=code=>{throw new Error(code);};
function safe(error) {return new Error(safeCodes.has(error?.message)?error.message:'replicate_worker_failed');}
function matches(context,binding,claim) {
  const s=context.submission;
  if(!s||!s.prediction_id||!['known','terminal'].includes(s.state)||s.cleanup_state!=='none'||s.identity_conflict_at||
    s.job_id!==claim.job_id||s.provider!=='replicate'||s.attempt_number!==claim.attempt||s.submission_fence>claim.fence||
    new Date(s.attempt_deadline).getTime()!==new Date(claim.attempt_deadline).getTime()||
    context.consumed_ticket?.id!==s.attempt_ticket_id||
    Object.keys(binding).some(k=>canonical(s[k])!==canonical(binding[k])))fail('replicate_binding_mismatch');
}
// One query checks job/output AND immutable evidence references, including another
// winner. Absence of the owned job or any query error is uncertainty, never deletion.
async function references(pool,claim,key) {
  try {
    const row=(await pool.query(`SELECT j.status,j.output_key,
      EXISTS(SELECT 1 FROM job WHERE output_key=$3::uuid) OR
      EXISTS(SELECT 1 FROM generation_evidence WHERE canonical_evidence->>'output_key'=(($3::uuid)::text)
        OR canonical_evidence->>'artifact_key'=(($3::uuid)::text)) AS referenced,
      EXISTS(SELECT 1 FROM generation_evidence WHERE job_id=j.id) AS has_evidence
      FROM job j WHERE j.id=$1 AND j.account_id=$2`,[claim.job_id,claim.account_id,key])).rows[0];
    if(!row||typeof row.referenced!=='boolean'||typeof row.has_evidence!=='boolean')return null;
    return {referenced:row.referenced,winner:row.status==='succeeded'||row.has_evidence};
  }catch{return null;}
}
export async function runReplicateClaim(pool,jobs,config,claim,options={}) {
  const {signal,transportOptions,mediaOptions}=options;
  // Boundary injection and shortened clocks/heartbeats exist only in explicit tests.
  if(config.runtime!=='test'&&Object.keys(options).some(k=>k!=='signal'))fail('replicate_config_denied');
  const now=options.now??(()=>performance.now()),wallNow=options.wallNow??(()=>Date.now());
  const heartbeatMs=options.heartbeatMs??10000;
  if(!Number.isFinite(heartbeatMs)||heartbeatMs<1)fail('replicate_config_denied');
  const abort=new AbortController();const cancel=()=>abort.abort();
  signal?.addEventListener('abort',cancel,{once:true});if(signal?.aborted)cancel();
  let timer,deadlineTimer,beatPromise,result,completionAttempted=false,leaseLost=false;
  const check=budget=>{if(leaseLost)fail('lease_lost');remainingReplicateBudget(budget,abort.signal);};
  try {
    const transport=createReplicateTransport(replicateTransportConfig(config),transportOptions);
    const media=createReplicateMedia(config,mediaOptions);
    const authority=options.authority??createProviderSubmissions(pool,config);
    const contextStart=now();
    let context=await authority.workerContext(claim);
    const contextElapsed=now()-contextStart;
    if(!Number.isFinite(contextElapsed)||contextElapsed<0||!Number.isFinite(context.remaining_ms)||
      context.remaining_ms<=0||context.remaining_ms>180000)fail('provider_deadline');
    // Commit/lock waits cannot add time to the original DB allowance.
    const budget=createReplicateBudget(context.claim.attempt_deadline,context.remaining_ms-contextElapsed,{now});
    check(budget);deadlineTimer=setTimeout(cancel,remainingReplicateBudget(budget,abort.signal));
    const beat=()=>{beatPromise=(async()=>{
      try{if(await jobs.heartbeat(claim.job_id,claim.fence)!==true){leaseLost=true;cancel();}}
      catch{leaseLost=true;cancel();}
      if(!abort.signal.aborted)timer=setTimeout(beat,heartbeatMs);
    })();};timer=setTimeout(beat,heartbeatMs);
    // A durable submitting/ambiguous row with no identity is never replayed.
    if(context.submission&&!context.submission.prediction_id)fail('submission_no_replay');
    const input=await prepareReplicateInput({storageDir:config.storageDir,upload:context.input,
      accountId:context.claim.account_id,signal:abort.signal});check(budget);
    const fixedStyle=context.style;
    const settings=replicateSettings(config,fixedStyle);
    const candidate={version:REPLICATE_VERSION,input:{...settings,image:getPrivateReplicateInput(input).image}};
    const binding={...config.replicate,source_input_sha:input.source_input_sha,
      transmitted_input_sha:input.transmitted_input_sha,transform:input.transform,request_sha:hashReplicateRequest(candidate)};
    const prepared=prepareReplicateMediaRequest(input,settings,binding,{budget});
    let observation;
    if(context.submission) {
      matches(context,binding,claim); // Mandatory before ANY recovery GET.
    } else {
      observation=await transport.create({authority,claim,prepared,budget,signal:abort.signal,
        finalAuthorize:check=>authority.finalAuthorize(claim,check)});
      check(budget);
      // authorize may replace the UTC ticket. Never use the pre-send timestamp.
      context=await authority.workerContext(claim);matches(context,binding,claim);
      if(context.style!==fixedStyle)fail('replicate_binding_mismatch');
    }
    check(budget);
    const localStart=now(),localStartedAt=new Date(wallNow());
    if(!context.submission.submitting_at||localStartedAt<new Date(context.submission.submitting_at))fail('replicate_binding_mismatch');
    if(!observation||['starting','processing'].includes(observation.status)) {
      observation=await transport.poll({authority,submission:context.submission,budget,signal:abort.signal});
    }
    check(budget);
    if(observation.status!=='succeeded'||observation.cleanup_required||!observation.output_available)fail('provider_output_denied');
    context=await authority.workerContext(claim);matches(context,binding,claim);
      if(context.style!==fixedStyle)fail('replicate_binding_mismatch');check(budget);
    result=await media.importArtifacts({observation,prepared,submission:context.submission,budget,signal:abort.signal});
    check(budget);
    const configBytes=Buffer.from(canonical(Object.fromEntries(provenanceFields.map(k=>[k,result.evidence[k]]))));
    await verifyArtifacts(config.storageDir,result.output_key,context.input.private_key,result.evidence,configBytes);check(budget);
    const verifiedAt=new Date(wallNow()),elapsed=Math.floor(now()-localStart);
    const created=new Date(context.job_created_at),consumed=new Date(context.consumed_ticket?.consumed_at);
    if(!Number.isSafeInteger(elapsed)||elapsed<0||elapsed>180000||!Number.isFinite(+created)||!Number.isFinite(+consumed)||
      consumed<created||verifiedAt<localStartedAt||verifiedAt<new Date(context.submission.observed_at))fail('replicate_binding_mismatch');
    // Preserve original opaque result; completion receives a NEW closed object.
    const output={output_key:result.output_key,mode:'replicate',quality:'unverified',evidence:{...result.evidence,
      evidence_version:1,job_id:claim.job_id,seed:config.seed,style:context.style,worker_source_revision:config.sourceRevision,
      queue_ms:+consumed-+created,local_elapsed_ms:elapsed,metric_sources:{queue_ms:'database_timestamps',
        local_elapsed_ms:'worker_monotonic',hardware:null,warm:null,inference_ms:null,billing_actual_microusd:null},
      job_created_at:created.toISOString(),attempt_started_at:consumed.toISOString(),
      local_started_at:localStartedAt.toISOString(),artifacts_verified_at:verifiedAt.toISOString()}};
    check(budget);completionAttempted=true;
    let attached=false;try{attached=await jobs.complete(claim.job_id,claim.fence,output);}catch{/* Resolve uncertain commit below. */}
    if(attached===true){await result.release();result=null;return true;}
    const ref=await references(pool,claim,result.output_key);
    if(ref?.referenced||ref?.winner){await result.release();result=null;return false;}
    if(!ref)fail('replicate_completion_uncertain');
    // Recheck immediately inside the key-bound deletion capability.
    await result.cleanup(async key=>{const latest=await references(pool,claim,key);return latest!==null&&!latest.referenced&&!latest.winner;});
    result=null;await jobs.fail(claim.job_id,claim.fence,{retryable:false}).catch(()=>{});
    fail('replicate_completion_denied');
  }catch(error) {
    if(!completionAttempted)await jobs.fail(claim.job_id,claim.fence,{retryable:false}).catch(()=>{});
    throw leaseLost?new Error('lease_lost'):safe(error);
  }finally {
    clearTimeout(timer);clearTimeout(deadlineTimer);cancel();signal?.removeEventListener('abort',cancel);
    await beatPromise;
    // Earlier failure or unknown commit: preserve files and relinquish descriptors.
    if(result)await result.release().catch(()=>{});
  }
}
