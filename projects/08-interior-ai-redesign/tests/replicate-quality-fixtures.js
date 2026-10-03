// SOFTWARE TEST ONLY. Synthetic 8px images, times, identities and corpus proofs
// exercise software gates. No actual geometry measurement or project acceptance.
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import sharp from 'sharp';
import { canonical, sha } from '../web/generation.js';
import { hostedConfig } from '../web/replicate-quality.js';
import { hostedOutput, refreshConfig } from './replicate-evidence-fixtures.js';
sharp.concurrency(1);
export function hostedReport(e) {
  const pairs=[];
  for(let room=0;room<12;room++)for(const style of ['warm','minimal','afrohemian']) {
    const target=room===0&&style===e.style,proof=structuredClone(e);
    if(!target) {
      Object.assign(proof,{job_id:randomUUID(),submission_id:randomUUID(),prediction_id:'SOFTWARE_TEST_ONLY_'+room+'_'+style,
        artifact_key:randomUUID(),style,input_sha:room===0?e.input_sha:sha('SOFTWARE TEST ONLY input '+room),
        request_sha:sha('SOFTWARE TEST ONLY request '+room+style),output_sha:sha('SOFTWARE TEST ONLY output '+room+style),
        depth_sha:sha('SOFTWARE TEST ONLY depth '+room+style)});
      proof.source_input_sha=proof.input_sha;proof.output_key=proof.artifact_key;refreshConfig({evidence:proof});
    }
    pairs.push({room_id:'SOFTWARE_TEST_ONLY_room_'+room,style,license_sha:sha('SOFTWARE TEST ONLY license '+room),
      annotations_sha:sha('SOFTWARE TEST ONLY annotation '+room),measurement_source_sha:sha('SOFTWARE TEST ONLY measurement '+room+style),
      ...Object.fromEntries(['mode','provider','model','version','contract_sha','worker_source_revision','input_sha','transmitted_input_sha',
        'raw_provider_depth_sha','raw_provider_output_sha','depth_sha','output_sha','config_sha','request_sha'].map(k=>[k,proof[k]])),
      evidence_sha:sha(canonical(proof)),evidence:proof,config:hostedConfig(proof),
      added_openings:0,removed_openings:0,anchor_displacements:[0,0.01,0.02]});
  }
  return {kind:'measured-hosted-corpus-v1',synthetic:false,measurement_claim:'measured-nonsynthetic',
    reviewer:'SOFTWARE_TEST_ONLY_reviewer',measured_at:'2026-10-03T12:00:00.000Z',
    measurement_source_sha:sha('SOFTWARE TEST ONLY source declaration'),
    attestation:{reviewer:'SOFTWARE_TEST_ONLY_independent',attested_at:'2026-10-03T12:01:00.000Z',
      source_sha:sha('SOFTWARE TEST ONLY attestation'),statement:'independently-reviewed-measurements'},pairs};
}
export async function persistHostedFixture(dir,f) {
  const e=f.output.evidence;refreshConfig(f.output);
  const canonicalEvidence={...e,output_key:f.output.output_key},configBytes=Buffer.from(canonical(hostedConfig(e)));
  for(const folder of ['outputs','depths','configs'])await mkdir(join(dir,folder),{recursive:true});
  await writeFile(join(dir,f.uploadId),f.input);await writeFile(join(dir,'outputs',f.output.output_key),f.image);
  await writeFile(join(dir,'depths',f.output.output_key),f.depth);await writeFile(join(dir,'configs',f.output.output_key),configBytes);
  f.row={...canonicalEvidence,canonical_evidence:canonicalEvidence,evidence_sha:sha(canonical(canonicalEvidence)),
    model_revisions:null,account_id:f.account,status:'succeeded',quality:'unverified',deleted_at:null,upload_deleted:null,
    upload_sha:e.input_sha,input_key:f.uploadId,job_mode:'replicate',reserved:true};
  f.report=hostedReport(canonicalEvidence);f.reportBytes=Buffer.from(canonical(f.report));f.reportSha=sha(f.reportBytes);
  f.reportPath=join(dir,'SOFTWARE_TEST_ONLY_report_'+f.output.output_key+'.json');await writeFile(f.reportPath,f.reportBytes);
  f.args={jobId:e.job_id,decision:'accepted',reason:'SOFTWARE TEST ONLY synthetic declarations, no actual measurement claim',
    reportPath:f.reportPath,reportSha:f.reportSha};return f;
}
export async function replicateQualityFixture(dir) {
  const input=await sharp({create:{width:8,height:8,channels:3,background:'#aabbcc'}}).webp().toBuffer();
  const image=await sharp({create:{width:8,height:8,channels:3,background:'#ddeeff'}}).png().toBuffer();
  const depth=await sharp({create:{width:8,height:8,channels:3,background:'#777777'}}).png().toBuffer();
  const output=hostedOutput({prediction_id:'SOFTWARE_TEST_ONLY_prediction'});
  Object.assign(output.evidence,{input_sha:sha(input),source_input_sha:sha(input),output_sha:sha(image),depth_sha:sha(depth),
    transform:{original_width:8,original_height:8,canvas_width:512,canvas_height:512,content_rect:{x:0,y:0,width:512,height:512}}});
  return persistHostedFixture(dir,{output,input,image,depth,uploadId:randomUUID(),account:randomUUID()});
}
