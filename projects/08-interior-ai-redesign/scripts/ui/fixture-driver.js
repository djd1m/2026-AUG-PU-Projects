// LOCAL SOFTWARE FIXTURE ONLY. Never GPU/geometry/latency acceptance evidence.
import pg from 'pg';
import {randomUUID} from 'node:crypto';
import {writeFile,mkdir} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import sharp from 'sharp';
import {createJobs} from '../../web/jobs.js';
import {createPayments} from '../../web/payments.js';
import {driveFixturePayment} from './payment-ready.js';
import {prepareArtifacts,canonical,sha,artifactRead} from '../../web/generation.js';
import {migrate} from '../migrate.js';
const marker='N8_F04B_OWNED_LOCAL_SOFTWARE_FIXTURE';
const source='7f99c245a59407eb84b106414ccc0e789f689300';
export async function ownedPool(env=process.env) {
  const url=new URL(env.DATABASE_URL),schema=env.UI_SCHEMA;
  if(!['postgres:','postgresql:'].includes(url.protocol)||env.UI_FIXTURE_OWNER!==marker||env.NODE_ENV!=='test'||env.PROVIDER_MODE!=='fixture'||
    !['localhost','127.0.0.1','[::1]','n8-ui-pg'].includes(url.hostname)||!/^\/n8_ui_[a-f0-9]{12}$/.test(url.pathname)||
    !/^n8_ui_[a-f0-9]{24}$/.test(schema??'')||url.password.length<24||
    url.searchParams.get('options')!==`-c search_path=${schema},public`)throw new Error('dedicated_owned_fixture_required');
  const pool=new pg.Pool({connectionString:url.href,max:2,options:`-c search_path=${schema},public`});
  try {
    const {rows:[v]}=await pool.query("SELECT current_setting('server_version_num')::int AS version,shobj_description(oid,'pg_database') AS marker FROM pg_database WHERE datname=current_database()");
    if(v.version<160000||v.version>=170000||v.marker!==marker)throw new Error('owned_pg16_marker_required');
    return pool;
  } catch(e){await pool.end();throw e;}
}
export function fixtureConfig(env=process.env) {
  const dir=resolve(env.STORAGE_DIR??'');
  if(!/^\/tmp\/n8-ui-[a-f0-9]{24}$/.test(dir))throw new Error('owned_private_storage_required');
  const origin=new URL(env.APP_ORIGIN);
  if(env.APP_ORIGIN!=='https://n8-ui.test'||origin.origin!==env.APP_ORIGIN)throw new Error('owned_https_origin_required');
  return {runtime:'test',providerMode:'fixture',origin:origin.origin,storageDir:dir,platformDailyLimit:200,accountDailyLimit:20,secureCookie:true};
}
export async function drive(pool,config,action,id) {
  if(action==='payment') {
    if(id)return driveFixturePayment(pool,config,id);
    await createPayments(pool,config).runOne();
    return {software_fixture:true};
  }
  const jobs=createJobs(pool,config),claim=await jobs.claim();
  if(!claim)throw new Error('no_claimable_job');
  if(action==='fail'){await jobs.fail(claim.job_id,claim.fence);return {job_id:claim.job_id,software_fixture:true};}
  if(!['complete','accepted-software'].includes(action))throw new Error('unknown_fixture_action');
  const upload=(await pool.query('SELECT private_key FROM upload WHERE id=$1',[claim.upload_id])).rows[0];
  const input=await artifactRead(config.storageDir,upload.private_key),key=randomUUID();
  const image=await sharp(input).modulate({saturation:0.7,brightness:1.1}).png().toBuffer();
  const mode=action==='accepted-software'?'controlnet':'fixture';
  const revisions={sd:'synthetic-ui-fixture',controlnet:'synthetic-ui-fixture',depth:'synthetic-ui-fixture'};
  const configBytes=Buffer.from(canonical({mode,style:claim.style,software_fixture:true,worker_source_revision:source}));
  await prepareArtifacts(config.storageDir);
  for(const [folder,bytes] of [['outputs',image],['depths',image],['configs',configBytes]])await writeFile(join(config.storageDir,folder,key),bytes);
  const e={artifact_key:key,input_sha:sha(input),output_sha:sha(image),depth_sha:sha(image),config_sha:sha(configBytes),model_revisions:revisions,
    seed:1,worker_source_revision:source,hardware:'SYNTHETIC SOFTWARE FIXTURE; NO GPU OR GEOMETRY PROOF',queue_ms:1,inference_ms:1,warm:false};
  if(!await jobs.complete(claim.job_id,claim.fence,{output_key:key,mode,evidence:e}))throw new Error('fixture_fence_expired');
  if(action==='accepted-software') {
    // Trusted local SQL seed tests the otherwise unreachable positive public software guard.
    // Does not call the operator quality gate or pretend the synthetic report passed it.
    const evidence=(await pool.query('SELECT evidence_sha FROM generation_evidence WHERE job_id=$1',[claim.job_id])).rows[0];
    const c=await pool.connect();
    try {await c.query('BEGIN');await c.query('SELECT id FROM account WHERE id=$1 FOR UPDATE',[claim.account_id]);await c.query('SELECT id FROM job WHERE id=$1 FOR UPDATE',[claim.job_id]);
      await c.query("INSERT INTO quality_review(id,job_id,actor,decision,output_sha,evidence_sha,corpus_sha,reason) VALUES($1,$2,'SYNTHETIC_UI_SOFTWARE_ONLY','accepted',$3,$4,$5,'Trusted local software fixture; NEVER geometry acceptance')",[randomUUID(),claim.job_id,e.output_sha,evidence.evidence_sha,sha('SYNTHETIC SOFTWARE ONLY')]);
      await c.query("UPDATE job SET quality='accepted' WHERE id=$1",[claim.job_id]);await c.query('COMMIT');
    }catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}
  }
  return {job_id:claim.job_id,software_fixture:true,geometry_proof:false};
}
async function main() {
  const config=fixtureConfig(),pool=await ownedPool();
  try {
    if(process.argv[2]==='init') {
      await pool.query(`CREATE SCHEMA ${process.env.UI_SCHEMA}`);
      await migrate(pool);
      await mkdir(config.storageDir,{mode:0o700});
      await writeFile(join(config.storageDir,'upload.png'),await sharp({create:{width:640,height:480,channels:3,background:'#bda98b'}}).png().toBuffer());
      console.log(JSON.stringify({schema:process.env.UI_SCHEMA,upload:join(config.storageDir,'upload.png'),software_fixture:true}));
    }else console.log(JSON.stringify(await drive(pool,config,process.argv[2],process.argv[3])));
  }finally{await pool.end();}
}
if(process.argv[1]&&resolve(process.argv[1])===resolve(new URL(import.meta.url).pathname))main().catch(()=>{console.error('owned_ui_fixture_failed');process.exitCode=1;});
