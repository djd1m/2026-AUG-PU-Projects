import { constants } from 'node:fs';
import { open, readFile, type FileHandle } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { OnboardingError, type EnrollmentEvidence } from '../packages/db/src/onboarding-contract';
import { decodeBootstrap, requireUuid } from '../packages/db/src/onboarding-codecs';
import { safeDatabaseError } from '../packages/db/src/onboarding-repository';
import { hashIdentity, normalizeIdentity, createGrantToken, hashGrantToken } from '../apps/web/src/lib/onboarding/identity';
import { validEvidence } from '../apps/web/src/lib/onboarding/partner';
import { isUtcInstant } from '../apps/web/src/lib/onboarding/policy';
export type BootstrapInput = {request_id:string;identity:string;external_actor_ref:string;evidence:EnrollmentEvidence;expires_at:string} &
 ({mode:'create';name:string;public_slug:string}|{mode:'reissue';program_id:string;previous_grant_id:string});
export interface BootstrapResult {program_id:string;grant_id:string;replayed:boolean}
function validated(value:unknown):BootstrapInput {
  if(!value||typeof value!=='object'||Array.isArray(value))throw new OnboardingError('invalid_input');
  const x=value as Record<string,unknown>;
  const keys=['request_id','identity','external_actor_ref','evidence','expires_at','mode',...(x.mode==='create'?['name','public_slug']:['program_id','previous_grant_id'])];
  if(Object.keys(x).some(k=>!keys.includes(k))||keys.some(k=>!(k in x)))throw new OnboardingError('invalid_input');
  requireUuid(x.request_id);normalizeIdentity(x.identity);
  if(!isUtcInstant(x.expires_at)||typeof x.external_actor_ref!=='string'||x.external_actor_ref.length<1||x.external_actor_ref.length>256||/[\x00-\x1f\x7f]/.test(x.external_actor_ref))throw new OnboardingError('invalid_input');
  const evidence=x.evidence as EnrollmentEvidence;
  if(!evidence||!validEvidence(evidence.identity)||!validEvidence(evidence.authority))throw new OnboardingError('invalid_input');
  if(x.mode==='create'){
    if(typeof x.name!=='string'||x.name.length<1||x.name.length>120||typeof x.public_slug!=='string'||!/^[a-z0-9][a-z0-9-]{1,62}[a-z0-9]$/.test(x.public_slug))throw new OnboardingError('invalid_input');
  }else if(x.mode==='reissue'){requireUuid(x.program_id);requireUuid(x.previous_grant_id);}else throw new OnboardingError('invalid_input');
  return x as BootstrapInput;
}
export async function bootstrapPilotOwner(options:{pool:pg.Pool;input:unknown;identitySecret:Buffer;outputPath:string}):Promise<BootstrapResult> {
  const input=validated(options.input),identityHash=hashIdentity(input.identity,options.identitySecret);
  // Explicit canonical field order: retry equivalence never depends on JSON key order or raw spelling.
  const common={request_id:input.request_id,mode:input.mode,external_actor_ref:input.external_actor_ref,
    evidence:{identity:{reference:input.evidence.identity.reference,sha256:input.evidence.identity.sha256},authority:{reference:input.evidence.authority.reference,sha256:input.evidence.authority.sha256}},expires_at:input.expires_at};
  const payload=input.mode==='create'?{...common,name:input.name,public_slug:input.public_slug}:{...common,program_id:input.program_id,previous_grant_id:input.previous_grant_id};
  const encoded=JSON.stringify(payload),inputHash=createHash('sha256').update('n3a:bootstrap:v1:').update(encoded).update(identityHash).digest();
  const client=await options.pool.connect();let file:FileHandle|undefined;let committed=false;
  try {
    await client.query('BEGIN');
    const ready=await client.query<{result:unknown}>('SELECT n3a.bootstrap_prepare($1,$2) AS result',[encoded,inputHash]);
    if(ready.rows[0]?.result!==null){const result=decodeBootstrap(ready.rows[0]?.result);await client.query('COMMIT');committed=true;return result;}
    // Receipt replay was resolved before touching the handoff destination. Exclusive + NOFOLLOW avoids replacement.
    file=await open(options.outputPath,constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|constants.O_NOFOLLOW,0o600);
    const token=createGrantToken();
    const applied=await client.query<{result:unknown}>('SELECT n3a.bootstrap_apply($1,$2,$3,$4) AS result',[encoded,inputHash,identityHash,hashGrantToken(token)]);
    const result=decodeBootstrap(applied.rows[0]?.result);
    await client.query('COMMIT');committed=true;
    try {await file.writeFile(JSON.stringify({...result,grant_token:token})+'\n');await file.sync();}
    catch {throw new Error('bootstrap_delivery_failed_after_commit_reissue_required');}
    return result;
  }catch(error){if(!committed)await client.query('ROLLBACK').catch(()=>undefined);
    if(committed)throw new Error('bootstrap_delivery_failed_after_commit_reissue_required');
    throw safeDatabaseError(error);
  }finally{await file?.close().catch(()=>undefined);client.release();}
}
async function main(){
  const inputPath=process.argv[2],outputPath=process.argv[3],url=process.env.DATABASE_URL_MIGRATE,secret=process.env.IDENTITY_SECRET;
  if(!inputPath||!outputPath||!url||!secret||Buffer.from(secret,'base64url').toString('base64url')!==secret||Buffer.from(secret,'base64url').length<32||new URL(url).username!=='n3a_migrator')throw new OnboardingError('invalid_input');
  const pool=new pg.Pool({connectionString:url,max:1,connectionTimeoutMillis:1000,statement_timeout:5000,lock_timeout:1000});
  try {const result=await bootstrapPilotOwner({pool,input:JSON.parse(await readFile(inputPath,'utf8')),identitySecret:Buffer.from(secret,'base64url'),outputPath});console.log(JSON.stringify(result));}
  finally{await pool.end();}
}
if(process.argv[1]===fileURLToPath(import.meta.url))main().catch(error=>{console.error(error instanceof Error&&error.message==='bootstrap_delivery_failed_after_commit_reissue_required'?error.message:'bootstrap_failed');process.exitCode=1;});
