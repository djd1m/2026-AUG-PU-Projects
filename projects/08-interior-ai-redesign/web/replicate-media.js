import { randomUUID } from 'node:crypto';
import dns from 'node:dns/promises';
import https from 'node:https';
import net from 'node:net';
import { constants } from 'node:fs';
import { open, lstat, realpath, unlink } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import sharp from 'sharp';
import { imageType, MAX_BYTES, MAX_PIXELS } from './media.js';
import { artifactRead, sha, canonical } from './generation.js';
import { validatePreparedBinding } from './provider-submissions.js';
import { prepareReplicateRequest, hashReplicateRequest, getSucceededOutput,
  remainingReplicateBudget, ReplicateError, REPLICATE_MODEL, REPLICATE_VERSION,
  REPLICATE_CONTRACT_SHA } from './replicate.js';

const inputs = new WeakMap(), preparedInputs = new WeakMap();
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}(?![\s\S])/i;
const DIGEST = /^[a-f0-9]{64}(?![\s\S])/;
const FORMATS = {'image/jpeg':'jpeg','image/png':'png','image/webp':'webp'};
const deny = () => { throw new ReplicateError('provider_output_denied'); };
const safe = error => error instanceof ReplicateError ? error : new ReplicateError('provider_output_denied');
const freezeTransform = t => Object.freeze({...t, content_rect:Object.freeze({...t.content_rect})});
function rectangle(width, height) {
  const scale = 512 / Math.max(width, height);
  const w = Math.max(1, Math.round(width * scale)), h = Math.max(1, Math.round(height * scale));
  return {x:Math.floor((512-w)/2), y:Math.floor((512-h)/2), width:w, height:h};
}
function singleFramePng(bytes) {
  // Sharp can report APNG as a PNG without pages. Reject all animation chunks.
  // Walk only chunk headers, never compressed pixel data; MAX_BYTES bounds work.
  for (let offset = 8; offset < bytes.length;) {
    if (bytes.length - offset < 12) deny();
    const length = bytes.readUInt32BE(offset);
    if (length > bytes.length - offset - 12) deny();
    const type = bytes.toString('ascii', offset + 4, offset + 8);
    if (type === 'acTL' || type === 'fcTL' || type === 'fdAT') deny();
    if (type === 'IEND') { if (length !== 0) deny(); return; }
    offset += length + 12;
  }
  deny(); // Missing IEND or truncated final chunk.
}
async function metadata(bytes, mime, check = () => {}) {
  check();
  if (!Buffer.isBuffer(bytes) || !bytes.length || bytes.length > MAX_BYTES || !FORMATS[mime] || imageType(bytes) !== mime) deny();
  if (mime === 'image/png') singleFramePng(bytes);
  const m = await sharp(bytes, {limitInputPixels:MAX_PIXELS, failOn:'warning'}).metadata();
  check();
  if (m.format !== FORMATS[mime] || !m.width || !m.height || m.width*m.height > MAX_PIXELS || (m.pages ?? 1) !== 1) deny();
  return m;
}
// Only I4's owner-scoped, nondeleted DB row is admissible. This module cannot prove DB ownership.
export async function prepareReplicateInput({storageDir, upload, accountId, signal}) {
  try {
    const check = () => { if (signal?.aborted) throw new ReplicateError('provider_aborted'); };
    check(); upload = upload && {...upload};
    if (!UUID.test(accountId) || !upload || upload.account_id !== accountId || upload.deleted_at ||
      typeof upload.private_key !== 'string' || !UUID.test(upload.private_key) || !DIGEST.test(upload.sha256)) deny();
    const source = await artifactRead(storageDir, upload.private_key); check();
    if (sha(source) !== upload.sha256) deny();
    const m = await metadata(source, upload.mime, check);
    if (upload.width !== m.width || upload.height !== m.height) deny();
    const transform = freezeTransform({original_width:m.width, original_height:m.height,
      canvas_width:512, canvas_height:512, content_rect:rectangle(m.width,m.height)});
    const r = transform.content_rect;
    // Persisted uploads are already orientation-normalized. Preserve their exact pixel axes.
    const canvas = await sharp(source, {limitInputPixels:MAX_PIXELS, failOn:'warning'})
      .resize(r.width,r.height,{fit:'fill',kernel:'lanczos3'}).flatten({background:'#000000'})
      .extend({left:r.x,top:r.y,right:512-r.x-r.width,bottom:512-r.y-r.height,background:'#000000'})
      .removeAlpha().raw().toBuffer(); check();
    let jpeg, quality;
    for (quality of [85,80,75]) {
      check(); jpeg = await sharp(canvas,{raw:{width:512,height:512,channels:3}})
        .jpeg({quality, chromaSubsampling:'4:2:0', progressive:false, mozjpeg:false}).toBuffer(); check();
      if (jpeg.length <= 262144) break;
    }
    if (!jpeg || jpeg.length > 262144) deny();
    const encoded = await metadata(jpeg,'image/jpeg',check);
    if (encoded.width !== 512 || encoded.height !== 512 || encoded.exif || encoded.icc || encoded.xmp) deny();
    // Force a complete decode, rather than treating header metadata as byte validity.
    await sharp(jpeg,{limitInputPixels:MAX_PIXELS,failOn:'warning'}).raw().toBuffer(); check();
    const handle = Object.freeze({source_input_sha:sha(source), transmitted_input_sha:sha(jpeg), transform, quality});
    inputs.set(handle,{jpeg}); return handle;
  } catch (error) { throw safe(error); }
}
// Internal worker accessor: deliberately nonserializable; cloning loses private bytes.
export function getPrivateReplicateInput(handle) {
  const data = inputs.get(handle); if (!data) deny();
  return Object.freeze(Object.defineProperties({}, {
    image:{value:`data:image/jpeg;base64,${data.jpeg.toString('base64')}`},
    transform:{value:handle.transform}, source_input_sha:{value:handle.source_input_sha},
    transmitted_input_sha:{value:handle.transmitted_input_sha}
  }));
}
export function prepareReplicateMediaRequest(input, settings, binding, {budget} = {}) {
  try {
    remainingReplicateBudget(budget);
    const privateInput = getPrivateReplicateInput(input);
    const candidate = {version:REPLICATE_VERSION,input:{...settings,image:privateInput.image}};
    const b = validatePreparedBinding(binding);
    if (b.source_input_sha !== input.source_input_sha || b.transmitted_input_sha !== input.transmitted_input_sha ||
      canonical(b.transform) !== canonical(input.transform) || b.request_sha !== hashReplicateRequest(candidate)) deny();
    const prepared = prepareReplicateRequest(candidate,b);
    Object.freeze(b.transform.content_rect); Object.freeze(b.transform); Object.freeze(b);
    preparedInputs.set(prepared,{input,binding:b,budget}); return prepared;
  } catch (error) { throw safe(error); }
}

// Conservative global-unicast policy. Transition/translation/special-purpose blocks are denied.
export function isGlobalAddress(address) {
  const family = net.isIP(address);
  if (family === 4) {
    const p = address.split('.').map(Number);
    return !(p[0] === 0 || p[0] === 10 || p[0] === 127 || p[0] >= 224 ||
      (p[0] === 100 && p[1] >= 64 && p[1] <= 127) || (p[0] === 169 && p[1] === 254) ||
      (p[0] === 172 && p[1] >= 16 && p[1] <= 31) || (p[0] === 192 && (p[1] === 168 ||
        (p[1] === 0 && (p[2] === 0 || p[2] === 2)) || (p[1] === 88 && p[2] === 99) ||
        (p[1] === 31 && p[2] === 196) || (p[1] === 52 && p[2] === 193) || (p[1] === 175 && p[2] === 48))) ||
      (p[0] === 198 && (p[1] === 18 || p[1] === 19 || (p[1] === 51 && p[2] === 100))) ||
      (p[0] === 203 && p[1] === 0 && p[2] === 113));
  }
  if (family !== 6 || address.includes('.') || address.includes('%')) return false;
  const halves = address.toLowerCase().split('::');
  const left = halves[0] ? halves[0].split(':') : [], right = halves[1] ? halves[1].split(':') : [];
  const words = halves.length === 2 ? [...left,...Array(8-left.length-right.length).fill('0'),...right] : left;
  const p = words.map(x=>parseInt(x,16));
  return p[0] >= 0x2000 && p[0] <= 0x3fff &&
    !(p[0] === 0x2001 && (p[1] < 0x200 || p[1] === 0xdb8)) && p[0] !== 0x2002 &&
    !(p[0] === 0x3fff && p[1] < 0x1000) &&
    !(p[0] === 0x2620 && p[1] === 0x4f && p[2] === 0x8000);
}
export function validateDeliveryUrl(value) {
  if (typeof value !== 'string' || value.length > 2048 || /[\s\\\x00-\x1f\x7f]/.test(value)) deny();
  let url; try { url = new URL(value); } catch { deny(); }
  const host = url.hostname;
  if (url.protocol !== 'https:' || url.username || url.password || url.hash || value.includes('#') ||
    (url.port && url.port !== '443') || net.isIP(host) ||
    !(host === 'replicate.delivery' || host.endsWith('.replicate.delivery')) ||
    !/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)*replicate\.delivery$/.test(host)) deny();
  // Percent-escaped authority and empty userinfo canonicalize away; reject them explicitly.
  const authority = value.match(/^https:\/\/([^/?#]+)/i)?.[1];
  if (!authority || /[%@]/.test(authority)) deny();
  return url;
}
async function resolveAll(host, {signal} = {}) {
  const resolver = new dns.Resolver({timeout:1000,tries:1});
  const cancel = () => resolver.cancel();
  signal?.addEventListener('abort',cancel,{once:true});
  try {
    if(signal?.aborted)deny();
    const result = await Promise.allSettled([resolver.resolve4(host),resolver.resolve6(host)]);
    const addresses = [];
    for (let i=0;i<result.length;i++) {
      const item = result[i];
      if (item.status === 'fulfilled') addresses.push(...item.value.map(address=>({address,family:i===0?4:6})));
      else if (!['ENODATA','ENOTFOUND'].includes(item.reason?.code)) deny();
    }
    return addresses;
  } finally {signal?.removeEventListener('abort',cancel);}
}
function checkDirectories(dir, folders = []) {
  return (async () => {
    for (const path of [dir,...folders.map(f=>join(dir,f))]) {
      if (typeof dir !== 'string' || resolve(path) !== path || await realpath(path) !== path) deny();
      const s = await lstat(path); if (!s.isDirectory() || s.isSymbolicLink()) deny();
    }
  })();
}
// DNS/HTTPS collaborators only; no decoder, filesystem, auth or byte-policy injection.
export function createReplicateMedia({storageDir}, {resolveAddresses=resolveAll,request=https.request} = {}) {
  if (typeof storageDir !== 'string' || resolve(storageDir) !== storageDir ||
    typeof resolveAddresses !== 'function' || typeof request !== 'function') deny();
  async function boundedDns(host,budget,signal) {
    const ms = Math.min(5000,remainingReplicateBudget(budget,signal));
    const addresses = await new Promise((resolve,reject) => {
      let done = false; const dnsAbort = new AbortController();
      const finish = (error,value) => {if(done)return;done=true;clearTimeout(timer);
        signal?.removeEventListener('abort',abort);dnsAbort.abort();error?reject(safe(error)):resolve(value);};
      const abort = () => finish(new ReplicateError('provider_aborted'));
      const timer = setTimeout(()=>finish(new ReplicateError('provider_deadline')),ms);
      signal?.addEventListener('abort',abort,{once:true});
      if (signal?.aborted) {abort();return;}
      Promise.resolve().then(()=>resolveAddresses(host,{signal:dnsAbort.signal})).then(v=>finish(null,v),e=>finish(e));
    });
    remainingReplicateBudget(budget,signal);
    if (!Array.isArray(addresses) || !addresses.length || addresses.length > 64 || addresses.some(a=>
      !a || net.isIP(a.address) !== a.family || !isGlobalAddress(a.address))) deny();
    return Object.freeze({...addresses[0]});
  }
  async function download(value,budget,signal) {
    const url = validateDeliveryUrl(value);
    const pinned = await boundedDns(url.hostname,budget,signal);
    const ms = Math.min(5000,remainingReplicateBudget(budget,signal));
    const result = await new Promise((resolve,reject) => {
      let req, response, timer, done = false;
      const finish = (error,value) => {
        if(done)return;done=true;clearTimeout(timer);signal?.removeEventListener('abort',abort);
        if(error){response?.destroy();req?.destroy();reject(safe(error));}else resolve(value);
      };
      const abort = () => finish(new ReplicateError('provider_aborted'));
      signal?.addEventListener('abort',abort,{once:true});
      timer = setTimeout(()=>finish(new ReplicateError('provider_deadline')),ms);
      try {
        remainingReplicateBudget(budget,signal);
        req = request({protocol:'https:',hostname:url.hostname,port:443,servername:url.hostname,
          method:'GET',path:url.pathname+url.search,agent:false,rejectUnauthorized:true,minVersion:'TLSv1.2',timeout:ms,
          headers:{Accept:'image/png, image/jpeg, image/webp','Accept-Encoding':'identity'},
          lookup:(host,options,callback)=>{
            if(host!==url.hostname)return callback(new ReplicateError('provider_output_denied'));
            callback(null,...(options?.all?[[pinned]]:[pinned.address,pinned.family]));
          }
        }, res => {
          response = res; res.on('error',e=>finish(e));
          if(done){res.destroy();return;}
          try {
            remainingReplicateBudget(budget,signal);
            const h = res.headers, mime = h['content-type']?.split(';')[0].trim().toLowerCase();
            const length = h['content-length'];
            if(res.statusCode!==200 || !FORMATS[mime] || (h['content-encoding'] && h['content-encoding']!=='identity') ||
              (length!==undefined && (typeof length!=='string' || !/^\d+$/.test(length) || Number(length)>MAX_BYTES))) deny();
            let count=0;const chunks=[];
            res.on('data',chunk=>{
              if(done)return;
              try {remainingReplicateBudget(budget,signal);count+=chunk.length;
                if(count>MAX_BYTES)deny();chunks.push(Buffer.from(chunk));}catch(e){finish(e);}
            });
            res.on('aborted',()=>finish(new ReplicateError('provider_output_denied')));
            res.on('end',()=>{
              if(done)return;
              try {remainingReplicateBudget(budget,signal);
                if(!count || (length!==undefined && count!==Number(length)))deny();
                finish(null,{bytes:Buffer.concat(chunks,count),mime});}catch(e){finish(e);}
            });
          } catch(e){finish(e);}
        });
        req.on('error',e=>finish(e));req.setTimeout(ms,()=>finish(new ReplicateError('provider_deadline')));
        remainingReplicateBudget(budget,signal); req.end();
      } catch(e){finish(e);}
    });
    remainingReplicateBudget(budget,signal); return result;
  }
  async function normalize(raw,transform,check) {
    const m = await metadata(raw.bytes,raw.mime,check);
    if(m.width!==512 || m.height!==512)deny();
    const r=transform.content_rect;
    check();const bytes=await sharp(raw.bytes,{limitInputPixels:MAX_PIXELS,failOn:'warning'})
      .extract({left:r.x,top:r.y,width:r.width,height:r.height})
      .resize(transform.original_width,transform.original_height,{fit:'fill',kernel:'lanczos3'})
      .png({compressionLevel:9,adaptiveFiltering:false,palette:false}).toBuffer();check();
    if(bytes.length>MAX_BYTES)deny();
    const m2=await metadata(bytes,'image/png',check);
    if(m2.width!==transform.original_width || m2.height!==transform.original_height || m2.exif || m2.icc || m2.xmp)deny();
    return {bytes,raw_sha:sha(raw.bytes),normalized_sha:sha(bytes)};
  }
  async function closeCreated(created) {
    await Promise.all(created.map(item=>item.file.close()));
  }
  async function discard(created) {
    try {
      for(const item of created) {
        await checkDirectories(storageDir,[item.folder]);
        const s=await lstat(item.path).catch(e=>{if(e.code==='ENOENT')return null;throw e;});
        if(s && s.isFile() && !s.isSymbolicLink() && s.dev===item.dev && s.ino===item.ino)await unlink(item.path);
      }
    } finally {await closeCreated(created);}
  }
  return Object.freeze({
    async importArtifacts({observation,prepared,submission,budget,signal}) {
      const created=[];const check=()=>remainingReplicateBudget(budget,signal);
      try {
        check(); const linked=preparedInputs.get(prepared), refs=getSucceededOutput(observation);
        if(!linked || linked.budget!==budget || !refs || observation.status!=='succeeded' || !observation.output_available || observation.cleanup_required ||
          !submission || observation.submission_id!==submission.id || observation.prediction_id!==submission.prediction_id ||
          submission.provider!=='replicate' || submission.provider_status!=='succeeded' || submission.identity_conflict_at ||
          !['known','terminal'].includes(submission.state) || !UUID.test(submission.id) ||
          new Date(submission.attempt_deadline).toISOString()!==budget.attempt_deadline)deny();
        const b=validatePreparedBinding(Object.fromEntries(Object.keys(linked.binding).map(k=>[k,submission[k]])));
        if(canonical(b)!==canonical(linked.binding) || b.model!==REPLICATE_MODEL || b.version!==REPLICATE_VERSION ||
          b.contract_sha!==REPLICATE_CONTRACT_SHA)deny();
        const transform=linked.input.transform;
        // Snapshot before the first await; caller mutations cannot change provenance/crop.
        const identity=Object.freeze({submission_id:submission.id,prediction_id:submission.prediction_id});
        const depth=await normalize(await download(refs.depthUri,budget,signal),transform,check);check();
        const output=await normalize(await download(refs.generatedUri,budget,signal),transform,check);check();
        const provenance=Object.freeze({schema_version:1,mode:'replicate',provider:'replicate',quality:'unverified',
          ...identity,model:b.model,version:b.version,contract_sha:b.contract_sha,request_sha:b.request_sha,
          source_input_sha:b.source_input_sha,transmitted_input_sha:b.transmitted_input_sha,transform,
          raw_provider_depth_sha:depth.raw_sha,raw_provider_output_sha:output.raw_sha,
          depth_sha:depth.normalized_sha,output_sha:output.normalized_sha});
        const config=Buffer.from(canonical(provenance));if(config.length>65536)deny();
        const key=randomUUID();
        for(const [folder,bytes] of [['outputs',output.bytes],['depths',depth.bytes],['configs',config]]) {
          check();await checkDirectories(storageDir,[folder]);check();
          const path=join(storageDir,folder,key);
          const file=await open(path,constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|constants.O_NOFOLLOW,0o600);
          // Keep the descriptor until cleanup/release, preventing inode reuse by a replacement.
          const item={path,folder,file};created.push(item);
          const s=await file.stat();Object.assign(item,{dev:s.dev,ino:s.ino});check();
          await checkDirectories(storageDir,[folder]);check();await file.writeFile(bytes);check();
          check();
        }
        check();
        const handback=Object.freeze({output_key:key,mode:'replicate',quality:'unverified',evidence:Object.freeze({
          ...provenance,input_sha:b.source_input_sha,config_sha:sha(config),artifact_key:key,
          hardware:null,warm:null,inference_ms:null,billing_actual_microusd:null})});
        let removed=false;
        // I4 must query DB after any uncertain completion commit BEFORE granting this callback.
        const cleanup=async confirmUnreferenced=>{
          if(removed)return;
          if(typeof confirmUnreferenced!=='function' || await confirmUnreferenced(key)!==true)deny();
          try {await discard(created);}finally {removed=true;}
        };
        const release=async()=>{if(removed)return;await closeCreated(created);removed=true;};
        check();return Object.freeze(Object.defineProperties({...handback},{cleanup:{value:cleanup},release:{value:release}}));
      } catch(error) {
        try {await discard(created);}catch {throw new ReplicateError('provider_output_denied');}
        throw safe(error);
      }
    }
  });
}
