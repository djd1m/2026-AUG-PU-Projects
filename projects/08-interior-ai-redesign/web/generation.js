import { createHash, randomUUID } from 'node:crypto';
import { constants } from 'node:fs';
import { open, realpath, mkdir, unlink } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { spawn } from 'node:child_process';
import sharp from 'sharp';
import { HttpError, requireUuid } from './boundaries.js';
import { MAX_BYTES, MAX_PIXELS } from './media.js';

export const sha = bytes => createHash('sha256').update(bytes).digest('hex');
export function canonical(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return '['+value.map(canonical).join(',')+']';
  return '{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+canonical(value[k])).join(',')+'}';
}
export async function boundedRead(path, limit=MAX_BYTES) {
  if (await realpath(path) !== resolve(path)) throw new Error('Artifact symlink denied');
  const file=await open(path,constants.O_RDONLY|constants.O_NOFOLLOW|constants.O_NONBLOCK);
  try {
    const stat=await file.stat();
    if (!stat.isFile() || stat.size<1 || stat.size>limit) throw new Error('Artifact size/type denied');
    // A concurrent growth cannot allocate an unbounded readFile buffer.
    const buffer=Buffer.alloc(stat.size+1);const {bytesRead}=await file.read(buffer,0,buffer.length,0);
    if (bytesRead!==stat.size || (await file.stat()).size!==stat.size) throw new Error('Artifact changed');
    return buffer.subarray(0,bytesRead);
  } finally { await file.close(); }
}
export async function artifactRead(dir,key,limit=MAX_BYTES) {
  return boundedRead(join(dir,requireUuid(key)),limit);
}
export async function prepareArtifacts(dir) {
  for (const folder of ['outputs','depths','configs']) {
    const path=join(dir,folder);await mkdir(path,{recursive:true,mode:0o700});
    if (await realpath(path)!==resolve(path)) throw new Error('Artifact directory symlink denied');
  }
}
export async function discardArtifacts(dir,key) {
  requireUuid(key);
  for (const folder of ['outputs','depths','configs']) {
    await unlink(join(dir,folder,key)).catch(e=>{if(e.code!=='ENOENT') throw e;});
  }
}
// One engine, one outstanding request. stdout is protocol-only, stderr is drained
// with a hard total cap, never logged (libraries may include local sensitive paths).
export class Engine {
  constructor(command,args,env=process.env) { this.command=command;this.args=args;this.env=env;this.child=null;this.pending=null;this.processes=new Map(); }
  start() {
    if(this.child) return;
    const child=spawn(this.command,this.args,{env:this.env,stdio:['pipe','pipe','pipe']});
    this.child=child;let buffer=Buffer.alloc(0),stderr=0,failed=false;
    let terminated;this.processes.set(child,new Promise(resolve=>{terminated=resolve;}));
    const fail=()=>{if(failed)return;failed=true;this.terminate(child,'engine_protocol_or_exit');};
    child.on('error',fail);child.on('exit',fail);child.stdin.on('error',fail);
    child.once('close',()=>{fail();this.processes.delete(child);terminated();});
    child.stderr.on('data',chunk=>{stderr+=chunk.length;if(stderr>65536)fail();});
    child.stdout.on('data',chunk=>{
      if(failed)return;
      buffer=Buffer.concat([buffer,chunk]);if(buffer.length>16384){fail();return;}
      const index=buffer.indexOf(10);if(index<0)return;
      const line=buffer.subarray(0,index);buffer=buffer.subarray(index+1);
      try {
        const result=JSON.parse(line);const p=this.pending;
        if(!p || p.child!==child || buffer.length || result.id!==p.id || result.version!==1 || typeof result.ok!=='boolean') throw new Error();
        this.pending=null;
        if(result.ok) p.resolve(result);else p.reject(new Error(/^[-a-z0-9_]{1,100}$/.test(result.error)?result.error:'engine_failed'));
      } catch {fail();}
    });
  }
  async request(body,{signal,timeoutMs=180000}={}) {
    if(this.pending)throw new Error('engine_busy');
    if(!Number.isInteger(timeoutMs)||timeoutMs<1||timeoutMs>180000)throw new Error('engine_deadline');
    if(signal?.aborted)throw new Error('engine_cancelled');
    this.start();const child=this.child;const id=randomUUID();const line=JSON.stringify({version:1,id,...body})+'\n';
    if(Buffer.byteLength(line)>8192){await this.stop();throw new Error('engine_request_limit');}
    let timer,abort;
    try {return await new Promise((resolve,reject)=>{
      this.pending={id,child,resolve,reject};abort=()=>{this.terminate(child);};
      signal?.addEventListener('abort',abort,{once:true});timer=setTimeout(abort,timeoutMs);
      child.stdin.write(line);
    });} finally {clearTimeout(timer);signal?.removeEventListener('abort',abort);}
  }
  terminate(child,error='engine_cancelled') {
    if(this.child===child)this.child=null;
    if(this.pending?.child===child){this.pending.reject(new Error(error));this.pending=null;}
    child.kill('SIGKILL');
    return this.processes.get(child)??Promise.resolve();
  }
  async stop() {
    await Promise.all([...this.processes.keys()].map(child=>this.terminate(child)));
  }
}
export async function verifyArtifacts(dir,key,inputKey,expected,configBytes) {
  const [input,output,depth,config]=await Promise.all([
    artifactRead(dir,inputKey),artifactRead(join(dir,'outputs'),key),
    artifactRead(join(dir,'depths'),key),artifactRead(join(dir,'configs'),key,65536)]);
  const hashes={input_sha:sha(input),output_sha:sha(output),depth_sha:sha(depth),config_sha:sha(config)};
  if(Object.entries(hashes).some(([k,v])=>v!==expected[k]) || !config.equals(configBytes))throw new Error('artifact_hash_mismatch');
  const metadata=await Promise.all([input,output,depth].map(b=>sharp(b,{limitInputPixels:MAX_PIXELS,failOn:'warning'}).metadata()));
  const [i,o,d]=metadata;
  if(!i.width||!i.height||o.format!=='png'||d.format!=='png'||o.width!==i.width||o.height!==i.height||d.width!==i.width||d.height!==i.height || metadata.some(m=>(m.pages??1)!==1))throw new Error('artifact_geometry_or_format');
  return hashes;
}
export async function runClaim(pool,jobs,engine,config,claim,{signal,heartbeatMs=10000}={}) {
  const key=randomUUID();const abort=new AbortController();let timer,heartbeatError;
  const cancel=()=>abort.abort();signal?.addEventListener('abort',cancel,{once:true});if(signal?.aborted)cancel();
  try {
    const input=(await pool.query('SELECT private_key,sha256 FROM upload WHERE id=$1 AND account_id=$2 AND deleted_at IS NULL',[claim.upload_id,claim.account_id])).rows[0];
    if(!input)throw new Error('input_missing');
    const bytes=await artifactRead(config.storageDir,input.private_key);if(sha(bytes)!==input.sha256)throw new Error('input_hash_mismatch');
    const job=(await pool.query('SELECT created_at FROM job WHERE id=$1',[claim.job_id])).rows[0];
    const queueMs=Math.max(0,Date.now()-job.created_at.getTime());
    const generation={version:1,mode:config.workerMode,style:claim.style,seed:config.seed,steps:30,strength:0.55,
      guidance_scale:7.5,controlnet_conditioning_scale:1,manifest_sha:config.manifestSha,model_revisions:config.modelRevisions,
      worker_source_revision:config.sourceRevision};
    const configBytes=Buffer.from(canonical(generation));
    const beat=async()=>{try{if(!await jobs.heartbeat(claim.job_id,claim.fence))cancel();}
      catch(e){heartbeatError=e;cancel();}
      if(!abort.signal.aborted)timer=setTimeout(beat,heartbeatMs);};
    timer=setTimeout(beat,heartbeatMs);
    const remaining=Math.min(180000,new Date(claim.attempt_deadline)-Date.now(),new Date(claim.hard_deadline)-Date.now());
    const response=await engine.request({input_key:input.private_key,output_key:key,config:generation},
      {signal:abort.signal,timeoutMs:Math.floor(remaining)});
    if(abort.signal.aborted||heartbeatError)throw new Error('lease_lost');
    const hashes=await verifyArtifacts(config.storageDir,key,input.private_key,response.hashes,configBytes);
    if(typeof response.warm!=='boolean'||!Number.isSafeInteger(response.inference_ms)||response.inference_ms<0 || typeof response.hardware!=='string')throw new Error('engine_evidence_invalid');
    const output={output_key:key,mode:config.workerMode,evidence:{...hashes,model_revisions:config.modelRevisions,seed:config.seed,
      worker_source_revision:config.sourceRevision,hardware:response.hardware,queue_ms:queueMs,
      inference_ms:response.inference_ms,warm:response.warm,artifact_key:key,manifest_sha:config.manifestSha}};
    if(!await jobs.complete(claim.job_id,claim.fence,output))throw new Error('stale_fence');
    return true;
  } catch(error) {
    await engine.stop();await discardArtifacts(config.storageDir,key);
    await jobs.fail(claim.job_id,claim.fence,{retryable:false});
    throw error;
  } finally {clearTimeout(timer);abort.abort();signal?.removeEventListener('abort',cancel);}
}
export function createResults(pool,dir) {
  return {async read(accountId,id) {
    requireUuid(id);
    const sql=`SELECT j.output_key,e.output_sha FROM job j JOIN generation_evidence e ON e.job_id=j.id
      JOIN upload u ON u.id=j.upload_id WHERE j.id=$1 AND j.account_id=$2 AND j.deleted_at IS NULL
      AND u.deleted_at IS NULL AND j.status='succeeded' AND j.quality<>'rejected'`;
    const row=(await pool.query(sql,[id,accountId])).rows[0];if(!row)throw new HttpError(404,'not_found');
    let data;try{data=await artifactRead(join(dir,'outputs'),row.output_key);if(sha(data)!==row.output_sha)throw new Error();}
    catch{throw new HttpError(404,'not_found');}
    const final=(await pool.query(sql,[id,accountId])).rows[0];
    if(!final||canonical(final)!==canonical(row))throw new HttpError(404,'not_found');
    return {data,mime:'image/png'};
  }};
}
