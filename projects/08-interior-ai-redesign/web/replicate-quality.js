import { canonical, sha } from './generation.js';
import { validateHostedOutput } from './replicate-evidence.js';

export const REAL_MODE_SQL="('controlnet','replicate')";
export const supportedRealMode=mode=>mode==='controlnet'||mode==='replicate';
const SHA=/^[a-f0-9]{64}(?![\s\S])/;
const ID=/^[A-Za-z0-9_.:@-]{1,128}(?![\s\S])/;
const PROVENANCE=['schema_version','mode','provider','quality','submission_id','prediction_id','model','version',
  'contract_sha','request_sha','source_input_sha','transmitted_input_sha','transform',
  'raw_provider_depth_sha','raw_provider_output_sha','depth_sha','output_sha'];
const fail=code=>{throw new Error(code);};
function closed(value,keys) {
  if(!value||Object.getPrototypeOf(value)!==Object.prototype||Reflect.ownKeys(value).length!==keys.length||
    keys.some(k=>!Object.hasOwn(value,k))||Object.values(Object.getOwnPropertyDescriptors(value)).some(d=>!Object.hasOwn(d,'value')))
    fail('hosted_unknown_fields');
}
const digest=x=>typeof x==='string'&&SHA.test(x);
const identity=x=>typeof x==='string'&&ID.test(x);
const time=x=>typeof x==='string'&&Number.isFinite(Date.parse(x))&&new Date(x).toISOString()===x;
// Only DB completion's documented output_key enrichment is removed. The accepted
// I5a closed validator retains every other field, pin, null metric and config hash.
export function validateHostedCanonical(e) {
  if(!e||!Object.hasOwn(e,'output_key')||e.output_key!==e.artifact_key)fail('evidence_binding');
  const {output_key,...original}=e;
  validateHostedOutput({output_key,mode:'replicate',quality:'unverified',evidence:original});
  return e;
}
export function validateHostedRow(row) {
  const e=validateHostedCanonical(row.canonical_evidence);
  if(sha(canonical(e))!==row.evidence_sha||e.job_id!==row.job_id||e.output_key!==row.output_key||
    row.mode!=='replicate'||e.style!==row.style||row.job_mode!==row.mode||
    row.model_revisions!==null)fail('evidence_binding');
  for(const k of ['input_sha','output_sha','depth_sha','config_sha','seed','mode','worker_source_revision','hardware','queue_ms','inference_ms','warm']) {
    // PG integer/bigint strings may be normalized; SQL NULL must stay NULL.
    const v=['seed','queue_ms'].includes(k)&&row[k]!==null&&row[k]!==undefined?Number(row[k]):row[k];
    if(canonical(e[k])!==canonical(v))fail('evidence_row_mismatch');
  }
  return e;
}
export function hostedConfig(e) {return Object.fromEntries(PROVENANCE.map(k=>[k,e[k]]));}
export function validateHostedConfig(config,e) {
  closed(config,PROVENANCE);
  if(canonical(config)!==canonical(hostedConfig(e))||sha(canonical(config))!==e.config_sha)fail('config_evidence_binding');
}
// Operator trust boundary: hashes bind declarations, not the truth of measured
// geometry. Independent licensed measurements must be retained by the operator.
// SOFTWARE TEST ONLY fixtures may exercise this shape but establish no quality.
export function validateHostedCorpus(report,e,expectedSha,bytes,targetStyle) {
  if(!digest(expectedSha)||sha(bytes)!==expectedSha)fail('corpus_hash_mismatch');
  closed(report,['kind','synthetic','measurement_claim','reviewer','measured_at','measurement_source_sha','attestation','pairs']);
  if(report.kind!=='measured-hosted-corpus-v1'||report.synthetic!==false||report.measurement_claim!=='measured-nonsynthetic'||
    !identity(report.reviewer)||!time(report.measured_at)||!digest(report.measurement_source_sha)||
    !Array.isArray(report.pairs)||report.pairs.length<36||report.pairs.length>1000)fail('real_corpus_required');
  closed(report.attestation,['reviewer','attested_at','source_sha','statement']);
  const a=report.attestation;
  if(!identity(a.reviewer)||a.reviewer===report.reviewer||!time(a.attested_at)||Date.parse(a.attested_at)<Date.parse(report.measured_at)||
    !digest(a.source_sha)||a.statement!=='independently-reviewed-measurements')fail('independent_attestation_required');
  const rooms=new Map(),inputs=new Map(),seen=new Set();let matching=false;
  for(const p of report.pairs) {
    closed(p,['room_id','style','license_sha','annotations_sha','measurement_source_sha','mode','provider','model','version',
      'contract_sha','worker_source_revision','input_sha','transmitted_input_sha','raw_provider_depth_sha','raw_provider_output_sha',
      'depth_sha','output_sha','config_sha','request_sha','evidence_sha','evidence','config',
      'added_openings','removed_openings','anchor_displacements']);
    if(!identity(p.room_id)||!['warm','minimal','afrohemian','playful'].includes(p.style)||
      ['license_sha','annotations_sha','measurement_source_sha','input_sha','transmitted_input_sha','raw_provider_depth_sha',
        'raw_provider_output_sha','depth_sha','output_sha','config_sha','request_sha','evidence_sha'].some(k=>!digest(p[k]))||
      p.added_openings!==0||p.removed_openings!==0||!Array.isArray(p.anchor_displacements)||
      !p.anchor_displacements.length||p.anchor_displacements.length>1000||
      p.anchor_displacements.some(v=>typeof v!=='number'||!Number.isFinite(v)||v<0||v>0.02))fail('corpus_threshold_or_binding');
    const proof=validateHostedCanonical(p.evidence);validateHostedConfig(p.config,proof);
    if(sha(canonical(proof))!==p.evidence_sha||p.style!==proof.style||
      ['mode','provider','model','version','contract_sha','worker_source_revision'].some(k=>p[k]!==e[k])||
      ['mode','provider','model','version','contract_sha','worker_source_revision','input_sha','transmitted_input_sha',
        'raw_provider_depth_sha','raw_provider_output_sha','depth_sha','output_sha','config_sha','request_sha'].some(k=>p[k]!==proof[k]))
      fail('corpus_threshold_or_binding');
    const key=p.room_id+':'+p.style;if(seen.has(key))fail('duplicate_corpus_pair');seen.add(key);
    if(inputs.has(p.input_sha)&&inputs.get(p.input_sha)!==p.room_id)fail('corpus_input_alias');
    inputs.set(p.input_sha,p.room_id);
    const room=rooms.get(p.room_id)??{input:p.input_sha,styles:new Set()};
    if(room.input!==p.input_sha)fail('corpus_room_binding');room.styles.add(p.style);rooms.set(p.room_id,room);
    if(p.evidence_sha===sha(canonical(e))&&canonical(proof)===canonical(e)&&p.style===targetStyle)matching=true;
  }
  const styles=['warm','minimal','afrohemian','playful'];
  const grid=styles.some(omitted=>{
    const selected=styles.filter(s=>s!==omitted);
    return [...rooms.values()].filter(r=>selected.every(s=>r.styles.has(s))).length>=12;
  });
  if(!grid||!matching)fail('corpus_coverage_or_output');
}
