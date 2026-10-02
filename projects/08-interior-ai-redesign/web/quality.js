import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { transaction } from './db.js';
import { HttpError, requireUuid } from './boundaries.js';
import { createJobs, STYLES, validateOutput } from './jobs.js';
import { artifactRead, boundedRead, canonical, sha } from './generation.js';

const SHA=/^[a-f0-9]{64}$/;
const ID=/^[A-Za-z0-9_.:@-]{1,128}$/;
// Software tests use synthetic reports to exercise the real branch. They do not
// attest that the declared measurements happened; independent operator evidence
// and licensed real corpus provisioning are mandatory before actual acceptance.
export function validateCorpus(report,evidence,expectedSha,reportBytes,targetStyle) {
  if(!SHA.test(expectedSha??'')||sha(reportBytes)!==expectedSha)throw new Error('corpus_hash_mismatch');
  if(report?.kind!=='measured-gpu-corpus-v1'||report.synthetic!==false||!ID.test(report.reviewer??'')||
     !Array.isArray(report.pairs)||report.pairs.length<36||report.pairs.length>1000 ||
     !report.measured_at || !Number.isFinite(Date.parse(report.measured_at)))throw new Error('real_corpus_required');
  const rooms=new Map();const seen=new Set();let matching=false;
  for(const pair of report.pairs) {
    if(!ID.test(pair.room_id??'')||!STYLES.includes(pair.style)||!SHA.test(pair.license_sha??'')||
      !SHA.test(pair.annotations_sha??'')||!SHA.test(pair.input_sha??'')||!SHA.test(pair.output_sha??'')||
      !SHA.test(pair.evidence_sha??'')||pair.mode!=='controlnet'||pair.added_openings!==0||pair.removed_openings!==0||
      !Array.isArray(pair.anchor_displacements)||!pair.anchor_displacements.length||pair.anchor_displacements.length>1000||
      pair.anchor_displacements.some(v=>typeof v!=='number'||!Number.isFinite(v)||v<0||v>0.02)||
      !SHA.test(pair.config_sha??'')||canonical(pair.model_revisions)!==canonical(evidence.model_revisions)||
      pair.worker_source_revision!==evidence.worker_source_revision||pair.hardware!==evidence.hardware)throw new Error('corpus_threshold_or_binding');
    const key=pair.room_id+':'+pair.style;if(seen.has(key))throw new Error('duplicate_corpus_pair');seen.add(key);
    const room=rooms.get(pair.room_id)??{input:pair.input_sha,styles:new Set()};
    if(room.input!==pair.input_sha)throw new Error('corpus_room_binding');
    room.styles.add(pair.style);rooms.set(pair.room_id,room);
    if(pair.output_sha===evidence.output_sha&&pair.input_sha===evidence.input_sha&&pair.config_sha===evidence.config_sha&&pair.evidence_sha===sha(canonical(evidence))&&(!targetStyle||pair.style===targetStyle))matching=true;
  }
  if([...rooms.values()].filter(r=>r.styles.size>=3).length<12||new Set([...rooms.values()].map(r=>r.input)).size<12||!matching)throw new Error('corpus_coverage_or_output');
}
export function validateEvidence(row) {
  const e=row.canonical_evidence;
  if(!e||sha(canonical(e))!==row.evidence_sha||e.job_id!==row.job_id||e.output_key!==row.output_key||e.mode!==row.mode)throw new Error('evidence_binding');
  for(const k of ['input_sha','output_sha','depth_sha','config_sha','seed','mode','worker_source_revision','hardware','queue_ms','inference_ms','warm','model_revisions']) {
    if(canonical(e[k])!==canonical(k==='seed'||k==='queue_ms'||k==='inference_ms'?Number(row[k]):row[k]))throw new Error('evidence_row_mismatch');
  }
  validateOutput({output_key:row.output_key,mode:row.mode,evidence:e},'development');
  return e;
}
export function requireRealQuality(mode) {
  if(mode==='fixture')throw new Error('fixture_quality_forbidden');
  if(!['fixture','controlnet'].includes(mode))throw new Error('quality_mode_invalid');
}
const SELECT=`SELECT e.*,j.output_key,j.account_id,j.status,j.quality,j.deleted_at,j.style,
  u.deleted_at AS upload_deleted,u.sha256 AS upload_sha,u.private_key AS input_key FROM job j JOIN generation_evidence e ON e.job_id=j.id
  JOIN upload u ON u.id=j.upload_id WHERE j.id=$1`;
function available(row) {return row&&row.status==='succeeded'&&!row.deleted_at&&!row.upload_deleted;}
export function createQuality(pool,config,{operatorIdentity}={}) {
  if(!ID.test(operatorIdentity??''))throw new Error('Server-only QUALITY_OPERATOR_ID required');
  const jobs=createJobs(pool,config);
  return {async review({jobId,decision,reason,reportPath,reportSha}) {
    requireUuid(jobId);
    if(!['accepted','rejected'].includes(decision)||typeof reason!=='string'||reason.length<1||reason.length>500)throw new Error('invalid_review');
    const row=(await pool.query(SELECT,[jobId])).rows[0];if(!available(row))throw new HttpError(404,'not_found');
    const e=validateEvidence(row);let corpusSha=null;
    if(decision==='accepted') {
      requireRealQuality(row.mode);
      if(row.quality!=='unverified')throw new Error('quality_transition_forbidden');
      if(e.artifact_key!==row.output_key||!SHA.test(e.manifest_sha??'')||Object.values(e.model_revisions).some(v=>!/^[a-f0-9]{40}$/.test(v)))throw new Error('real_provenance_required');
      const [input,output,depth,configBytes,reportBytes]=await Promise.all([
        artifactRead(config.storageDir,(await pool.query('SELECT private_key FROM upload WHERE id=(SELECT upload_id FROM job WHERE id=$1)',[jobId])).rows[0].private_key),
        artifactRead(join(config.storageDir,'outputs'),row.output_key),artifactRead(join(config.storageDir,'depths'),row.output_key),
        artifactRead(join(config.storageDir,'configs'),row.output_key,65536),boundedRead(reportPath,4*1024*1024)]);
      if([sha(input),sha(output),sha(depth),sha(configBytes)].some((h,i)=>h!==[e.input_sha,e.output_sha,e.depth_sha,e.config_sha][i])||row.upload_sha!==e.input_sha)throw new Error('quality_actual_bytes_mismatch');
      const g=JSON.parse(configBytes);
      if(g.mode!==row.mode||g.manifest_sha!==e.manifest_sha||g.seed!==e.seed||g.style!==row.style||
        g.worker_source_revision!==e.worker_source_revision||canonical(g.model_revisions)!==canonical(e.model_revisions))throw new Error('config_evidence_binding');
      validateCorpus(JSON.parse(reportBytes),e,reportSha,reportBytes,row.style);corpusSha=reportSha;
    }
    // No filesystem/hash/network operations under the ordered SQL locks.
    return transaction(pool,async c=>{
      const account=(await c.query('SELECT billing_hold FROM account WHERE id=$1 FOR UPDATE',[row.account_id])).rows[0];
      await c.query('SELECT id FROM job WHERE id=$1 FOR UPDATE',[jobId]);
      const final=(await c.query(SELECT,[jobId])).rows[0];
      if(!available(final)||final.account_id!==row.account_id||final.output_key!==row.output_key||final.evidence_sha!==row.evidence_sha||
        final.upload_sha!==row.upload_sha||final.quality!==row.quality)throw new Error('quality_state_changed');
      if(decision==='accepted') {
        requireRealQuality(final.mode);
        if(account.billing_hold||final.quality!=='unverified'||final.mode!==row.mode)throw new Error('quality_transition_forbidden');
      }
      if(final.quality==='rejected')throw new Error('quality_transition_forbidden');
      await c.query(`INSERT INTO quality_review(id,job_id,actor,decision,output_sha,evidence_sha,corpus_sha,reason)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8)`,[randomUUID(),jobId,operatorIdentity,decision,e.output_sha,row.evidence_sha,corpusSha,reason]);
      await c.query('UPDATE job SET quality=$2 WHERE id=$1',[jobId,decision]);
      if(decision==='rejected') {
        const j=(await c.query('SELECT * FROM job WHERE id=$1',[jobId])).rows[0];
        await jobs.releaseRejected(c,j,(await c.query('SELECT clock_timestamp() AS now')).rows[0].now);
      }
      return {job_id:jobId,quality:decision};
    });
  }};
}
// F04 must call this guard at final publication/export authorization. No public
// sharing route exists yet. Reads remain independently guarded by byte hashes.
export async function qualityEligible(pool,jobId,dir) {
  requireUuid(jobId);
  const row=(await pool.query(`${SELECT} AND j.mode='controlnet' AND j.quality='accepted'
    AND NOT EXISTS(SELECT 1 FROM account a WHERE a.id=j.account_id AND a.billing_hold)
    AND EXISTS(SELECT 1 FROM quality_review q WHERE q.job_id=j.id AND q.decision='accepted'
      AND q.output_sha=e.output_sha AND q.evidence_sha=e.evidence_sha AND q.corpus_sha IS NOT NULL)`,[jobId])).rows[0];
  if(!available(row))return false;
  try {
    const e=validateEvidence(row);
    if(!dir||e.artifact_key!==row.output_key||row.upload_sha!==e.input_sha)return false;
    const bytes=await Promise.all([artifactRead(dir,row.input_key),artifactRead(join(dir,'outputs'),row.output_key),
      artifactRead(join(dir,'depths'),row.output_key),artifactRead(join(dir,'configs'),row.output_key,65536)]);
    if(bytes.some((b,i)=>sha(b)!==[e.input_sha,e.output_sha,e.depth_sha,e.config_sha][i]))return false;
    const final=(await pool.query(`${SELECT} AND j.mode='controlnet' AND j.quality='accepted'
      AND NOT EXISTS(SELECT 1 FROM account a WHERE a.id=j.account_id AND a.billing_hold)
      AND EXISTS(SELECT 1 FROM quality_review q WHERE q.job_id=j.id AND q.decision='accepted'
        AND q.output_sha=e.output_sha AND q.evidence_sha=e.evidence_sha AND q.corpus_sha IS NOT NULL)`,[jobId])).rows[0];
    return available(final)&&final.evidence_sha===row.evidence_sha&&final.output_key===row.output_key;
  }catch{return false;}
}
