// Synthetic software evidence only: hashes/times are literals, no vendor measurement.
import { randomUUID } from 'node:crypto';
import { canonical,sha } from '../web/generation.js';
import { REPLICATE_MODEL,REPLICATE_VERSION,REPLICATE_CONTRACT_SHA } from '../web/replicate.js';
export const evidenceConfig={runtime:'test',platformDailyLimit:200,accountDailyLimit:20,seed:42,sourceRevision:'9'.repeat(40)};
export const transform={original_width:640,original_height:480,canvas_width:512,canvas_height:512,
  content_rect:{x:0,y:64,width:512,height:384}};
export const provenanceFields=['schema_version','mode','provider','quality','submission_id','prediction_id','model','version',
  'contract_sha','request_sha','source_input_sha','transmitted_input_sha','transform',
  'raw_provider_depth_sha','raw_provider_output_sha','depth_sha','output_sha'];
export function refreshConfig(output) {
  output.evidence.config_sha=sha(canonical(Object.fromEntries(provenanceFields.map(k=>[k,output.evidence[k]]))));
  return output;
}
export function hostedOutput({job_id=randomUUID(),submission_id=randomUUID(),prediction_id='prediction_1',
  request_sha='c'.repeat(64),created_at=new Date('2026-10-03T12:00:00Z'),
  consumed_at=created_at,verified_at=new Date(+consumed_at+1000),local_started_at=consumed_at}={}) {
  const key=randomUUID();
  return refreshConfig({output_key:key,mode:'replicate',quality:'unverified',evidence:{
    schema_version:1,evidence_version:1,mode:'replicate',provider:'replicate',quality:'unverified',
    job_id,submission_id,prediction_id,model:REPLICATE_MODEL,version:REPLICATE_VERSION,contract_sha:REPLICATE_CONTRACT_SHA,
    request_sha,source_input_sha:'a'.repeat(64),input_sha:'a'.repeat(64),transmitted_input_sha:'b'.repeat(64),
    transform:structuredClone(transform),raw_provider_depth_sha:'d'.repeat(64),raw_provider_output_sha:'e'.repeat(64),
    depth_sha:'f'.repeat(64),output_sha:'0'.repeat(64),config_sha:null,artifact_key:key,
    hardware:null,warm:null,inference_ms:null,billing_actual_microusd:null,seed:42,style:'warm',
    worker_source_revision:evidenceConfig.sourceRevision,queue_ms:+consumed_at-+created_at,local_elapsed_ms:1000,
    metric_sources:{queue_ms:'database_timestamps',local_elapsed_ms:'worker_monotonic',hardware:null,warm:null,
      inference_ms:null,billing_actual_microusd:null},job_created_at:created_at.toISOString(),
    attempt_started_at:consumed_at.toISOString(),local_started_at:local_started_at.toISOString(),
    artifacts_verified_at:verified_at.toISOString()}});
}
export function hostedRows(output=hostedOutput()) {
  const e=output.evidence,account=randomUUID(),upload=randomUUID(),ticket=randomUUID();
  const j={id:e.job_id,account_id:account,upload_id:upload,style:e.style,mode:null,fence:1,attempts:1,
    first_ticket_id:ticket,created_at:new Date(e.job_created_at),attempt_deadline:new Date(Date.parse(e.attempt_started_at)+180000)};
  const s={id:e.submission_id,job_id:j.id,provider:'replicate',state:'terminal',provider_status:'succeeded',
    prediction_id:e.prediction_id,cleanup_state:'none',identity_conflict_at:null,submission_fence:1,attempt_number:1,
    attempt_ticket_id:ticket,attempt_deadline:j.attempt_deadline,submitting_at:new Date(e.attempt_started_at),
    observed_at:new Date(e.artifacts_verified_at),...Object.fromEntries(['model','version','contract_sha','request_sha',
      'source_input_sha','transmitted_input_sha','transform'].map(k=>[k,e[k]]))};
  return {j,s,ticket:{id:ticket,job_id:j.id,attempt_number:1,consumed_at:new Date(e.attempt_started_at),superseded:false},
    input:{id:upload,account_id:account,sha256:e.input_sha,width:640,height:480,deleted_at:null},
    now:new Date(e.artifacts_verified_at)};
}
