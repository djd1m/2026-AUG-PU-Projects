import { canonical, sha } from './generation.js';
import { REPLICATE_MODEL, REPLICATE_VERSION, REPLICATE_CONTRACT_SHA } from './replicate.js';

const SHA=/^[a-f0-9]{64}(?![\s\S])/;
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}(?![\s\S])/;
const PROVENANCE=['schema_version','mode','provider','quality','submission_id','prediction_id','model','version',
  'contract_sha','request_sha','source_input_sha','transmitted_input_sha','transform',
  'raw_provider_depth_sha','raw_provider_output_sha','depth_sha','output_sha'];
const FIELDS=[...PROVENANCE,'input_sha','config_sha','artifact_key','hardware','warm','inference_ms','billing_actual_microusd',
  'evidence_version','job_id','seed','style','worker_source_revision','queue_ms','local_elapsed_ms','metric_sources',
  'job_created_at','attempt_started_at','local_started_at','artifacts_verified_at'];
const SOURCES={queue_ms:'database_timestamps',local_elapsed_ms:'worker_monotonic',
  hardware:null,warm:null,inference_ms:null,billing_actual_microusd:null};
const deny=()=>{throw new Error('Invalid hosted generation evidence');};
function closed(value,keys) {
  if(!value || Object.getPrototypeOf(value)!==Object.prototype || Reflect.ownKeys(value).length!==keys.length ||
    keys.some(k=>!Object.hasOwn(value,k)) ||
    Object.values(Object.getOwnPropertyDescriptors(value)).some(d=>!Object.hasOwn(d,'value')))deny();
}
const digest=x=>{if(typeof x!=='string'||!SHA.test(x))deny();};
const uuid=x=>{if(typeof x!=='string'||!UUID.test(x))deny();};
const integer=(x,max=Number.MAX_SAFE_INTEGER)=>{if(!Number.isSafeInteger(x)||x<0||x>max)deny();};
function timestamp(x) {
  if(typeof x!=='string'||!Number.isFinite(Date.parse(x))||new Date(x).toISOString()!==x)deny();
  return Date.parse(x);
}
function transform(value) {
  closed(value,['original_width','original_height','canvas_width','canvas_height','content_rect']);
  closed(value.content_rect,['x','y','width','height']);
  const {original_width:w,original_height:h,content_rect:r}=value;
  for(const n of [w,h,r.width,r.height]) {integer(n,20000000);if(n===0)deny();}
  for(const n of [r.x,r.y])integer(n,512);
  const scale=512/Math.max(w,h),width=Math.max(1,Math.round(w*scale)),height=Math.max(1,Math.round(h*scale));
  if(w*h>20000000||value.canvas_width!==512||value.canvas_height!==512||
    r.width!==width||r.height!==height||r.x!==Math.floor((512-width)/2)||r.y!==Math.floor((512-height)/2))deny();
  return {...value,content_rect:{...r}};
}
// Internal DB completion contract, not an artifact reader or provider authority.
// I4b must verify private bytes and reconstruct the pinned request before calling.
export function validateHostedOutput(output) {
  closed(output,['output_key','mode','quality','evidence']);
  const e=output.evidence;closed(e,FIELDS);uuid(output.output_key);uuid(e.artifact_key);uuid(e.job_id);uuid(e.submission_id);
  if(output.mode!=='replicate'||output.quality!=='unverified'||e.mode!=='replicate'||e.provider!=='replicate'||
    e.quality!=='unverified'||e.schema_version!==1||e.evidence_version!==1||e.artifact_key!==output.output_key||
    e.model!==REPLICATE_MODEL||e.version!==REPLICATE_VERSION||e.contract_sha!==REPLICATE_CONTRACT_SHA||
    typeof e.prediction_id!=='string'||!/^[a-zA-Z0-9_-]{1,128}(?![\s\S])/.test(e.prediction_id)||
    !['warm','minimal','afrohemian','playful'].includes(e.style)||
    typeof e.worker_source_revision!=='string'||!/^[a-f0-9]{40,64}(?![\s\S])/.test(e.worker_source_revision))deny();
  for(const k of ['contract_sha','request_sha','source_input_sha','transmitted_input_sha','raw_provider_depth_sha',
    'raw_provider_output_sha','depth_sha','output_sha','input_sha','config_sha'])digest(e[k]);
  if(e.input_sha!==e.source_input_sha)deny();
  integer(e.seed,2147483647);integer(e.queue_ms,360000);integer(e.local_elapsed_ms,180000);
  for(const k of ['hardware','warm','inference_ms','billing_actual_microusd'])if(e[k]!==null)deny();
  closed(e.metric_sources,Object.keys(SOURCES));
  for(const [k,v] of Object.entries(SOURCES))if(e.metric_sources[k]!==v)deny();
  const created=timestamp(e.job_created_at),attempt=timestamp(e.attempt_started_at),
    started=timestamp(e.local_started_at),verified=timestamp(e.artifacts_verified_at);
  if(attempt<created||started<attempt||verified<started||verified-attempt>=180000||e.queue_ms!==attempt-created)deny();
  const copied={...e,transform:transform(e.transform),metric_sources:{...SOURCES}};
  // Exactly the unchanged I3 safe-config provenance, without worker fields.
  const provenance=Object.fromEntries(PROVENANCE.map(k=>[k,copied[k]]));
  if(sha(canonical(provenance))!==copied.config_sha)deny();
  Object.freeze(copied.transform.content_rect);Object.freeze(copied.transform);Object.freeze(copied.metric_sources);
  return Object.freeze({mode:'replicate',output_key:output.output_key,evidence:Object.freeze(copied)});
}
export function hostedWorkerBinding(e,config) {
  // Server settings are independent of caller-supplied evidence. No defaults.
  return e.seed===config.seed && e.worker_source_revision===config.sourceRevision;
}
export function hostedCompletionMatches(j,s,ticket,input,e,now) {
  if(!s||s.job_id!==j.id||s.provider!=='replicate'||!['known','terminal'].includes(s.state)||s.provider_status!=='succeeded'||
    !s.prediction_id||s.identity_conflict_at||s.cleanup_state!=='none'||j.mode!==null||e.job_id!==j.id||
    e.submission_id!==s.id||e.prediction_id!==s.prediction_id||e.style!==j.style||
    j.fence<s.submission_fence||j.attempts!==s.attempt_number||
    j.attempt_deadline?.getTime()!==s.attempt_deadline.getTime()||now>=s.attempt_deadline||
    !s.submitting_at||!s.observed_at||s.submitting_at>now||s.observed_at>now||
    !ticket||ticket.id!==s.attempt_ticket_id||ticket.job_id!==j.id||ticket.attempt_number!==s.attempt_number||!ticket.consumed_at||ticket.superseded||
    (s.attempt_number===1&&j.first_ticket_id!==ticket.id)||
    !input||input.account_id!==j.account_id||input.deleted_at||input.sha256!==e.input_sha||
    input.width!==e.transform.original_width||input.height!==e.transform.original_height||
    e.job_created_at!==j.created_at.toISOString()||e.attempt_started_at!==ticket.consumed_at.toISOString()||
    Date.parse(e.local_started_at)<s.submitting_at.getTime()||Date.parse(e.artifacts_verified_at)<s.observed_at.getTime()||Date.parse(e.artifacts_verified_at)>now.getTime())return false;
  for(const k of ['model','version','contract_sha','request_sha','source_input_sha','transmitted_input_sha'])
    if(e[k]!==s[k])return false;
  for(const k of ['original_width','original_height','canvas_width','canvas_height'])if(e.transform[k]!==s.transform[k])return false;
  for(const k of ['x','y','width','height'])if(e.transform.content_rect[k]!==s.transform.content_rect[k])return false;
  return true;
}
