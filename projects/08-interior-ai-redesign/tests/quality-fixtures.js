// SYNTHETIC SOFTWARE TESTS ONLY: these exercise otherwise-valid real-branch
// validation; every image/report/measurement below is invented test data.
// NEVER operator/GPU/GEOM-02 acceptance evidence, even when mode says controlnet.
import { randomUUID } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import sharp from 'sharp';
import { canonical, prepareArtifacts, sha } from '../web/generation.js';

export async function qualityFixture(dir,mode='controlnet') {
  await prepareArtifacts(dir);
  const key=randomUUID(),jobId=randomUUID(),uploadId=randomUUID(),owner=randomUUID();
  const image=await sharp({create:{width:8,height:8,channels:3,background:'#abd'}}).png().toBuffer();
  const models={sd:'1'.repeat(40),controlnet:'2'.repeat(40),depth:'3'.repeat(40)};
  const config={mode,seed:1,style:'warm',manifest_sha:sha('SYNTHETIC MODEL MANIFEST'),model_revisions:models,worker_source_revision:'4'.repeat(40)};
  const configBytes=Buffer.from(canonical(config));
  const e={job_id:jobId,output_key:key,mode,input_sha:sha(image),output_sha:sha(image),depth_sha:sha(image),config_sha:sha(configBytes),
    model_revisions:models,seed:1,worker_source_revision:config.worker_source_revision,hardware:'SYNTHETIC SOFTWARE TEST ONLY, NO GPU',
    queue_ms:1,inference_ms:1,warm:false,artifact_key:key,manifest_sha:config.manifest_sha};
  const row={...e,canonical_evidence:e,evidence_sha:sha(canonical(e)),account_id:owner,upload_id:uploadId,status:'succeeded',quality:'unverified',
    deleted_at:null,upload_deleted:null,upload_sha:e.input_sha,input_key:uploadId,style:'warm',reserved:true};
  await writeFile(join(dir,uploadId),image);
  for(const [folder,bytes] of [['outputs',image],['depths',image],['configs',configBytes]])await writeFile(join(dir,folder,key),bytes);
  const pairs=[];
  for(let room=0;room<12;room++)for(const style of ['warm','minimal','afrohemian'])pairs.push({
    room_id:'synthetic_room_'+room,style,input_sha:room===0?e.input_sha:sha('synthetic input '+room),
    output_sha:room===0&&style==='warm'?e.output_sha:sha('synthetic output '+room+style),
    evidence_sha:room===0&&style==='warm'?row.evidence_sha:sha('synthetic evidence '+room+style),config_sha:e.config_sha,
    model_revisions:models,worker_source_revision:e.worker_source_revision,hardware:e.hardware,mode:'controlnet',
    license_sha:sha('SYNTHETIC LICENSE'),annotations_sha:sha('SYNTHETIC ANCHORS'),added_openings:0,removed_openings:0,anchor_displacements:[0.01]});
  const report={kind:'measured-gpu-corpus-v1',synthetic:false,reviewer:'SYNTHETIC_SOFTWARE_TEST_ONLY',measured_at:'2026-10-02T12:00:00Z',pairs};
  const reportBytes=Buffer.from(canonical(report));const reportPath=join(dir,'synthetic-report.json');await writeFile(reportPath,reportBytes);
  return {row,image,report,reportBytes,reportPath,reportSha:sha(reportBytes),uploadId};
}
