import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { readdirSync, statSync, writeFileSync } from 'node:fs';
import { Readable } from 'node:stream';
import { randomUUID, createHash } from 'node:crypto';
import { mkdtemp, mkdir, writeFile, readFile, rm, symlink, chmod, stat, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { deflateSync } from 'node:zlib';
import sharp from 'sharp';
import { prepareReplicateInput, getPrivateReplicateInput, prepareReplicateMediaRequest,
  createReplicateMedia, validateDeliveryUrl, isGlobalAddress } from '../web/replicate-media.js';
import { createReplicateBudget, createReplicateTransport, hashReplicateRequest,
  REPLICATE_MODEL, REPLICATE_VERSION, REPLICATE_CONTRACT_SHA } from '../web/replicate.js';

sharp.concurrency(1);
const hash=b=>createHash('sha256').update(b).digest('hex');
const settings={prompt:'fixed synthetic test room style',a_prompt:'detailed',n_prompt:'low quality',
  num_samples:'1',image_resolution:'512',detect_resolution:512,ddim_steps:30,scale:7.5,eta:0,seed:42};
const rejects=p=>assert.rejects(p,e=>e.code==='provider_output_denied' && e.message===e.code && !e.cause);
function network(actions) {
  const calls=[];
  return {calls,request(options,respond) {
    const call={options,destroyed:false};calls.push(call);
    const req=new EventEmitter();req.destroy=()=>{call.destroyed=true;};
    req.setTimeout=(ms,cb)=>{call.timeout=ms;call.onTimeout=cb;return req;};
    req.end=()=>queueMicrotask(()=>{
      const action=actions.shift();assert.ok(action,'unexpected request');
      if(action.hang)return;
      if(action.error){req.emit('error',new Error('private URI/token details'));return;}
      const res=new Readable({read(){}});call.res=res;
      res.statusCode=action.status??200;res.headers={'content-type':'image/png',...action.headers};
      respond(res);if(res.destroyed)return;
      action.beforeBody?.();
      if(action.reset){res.emit('aborted');res.destroy();return;}
      for(const b of action.chunks??[action.bytes])res.push(b);
      res.push(null);
    });return req;
  }};
}
async function fixture(t,width=128,height=64) {
  const dir=await mkdtemp(join(tmpdir(),'n8-i3-'));t.after(()=>rm(dir,{recursive:true,force:true}));
  for(const folder of ['outputs','depths','configs'])await mkdir(join(dir,folder),{mode:0o700});
  const pixels=Buffer.alloc(width*height*3);
  for(let y=0;y<height;y++)for(let x=0;x<width;x++) {
    const i=(y*width+x)*3;pixels[i]=x<width/2?220:20;pixels[i+1]=y<height/2?70:170;pixels[i+2]=x<width/2?20:220;
  }
  const source=await sharp(pixels,{raw:{width,height,channels:3}}).png().toBuffer();
  const upload={account_id:randomUUID(),private_key:randomUUID(),sha256:hash(source),width,height,mime:'image/png',deleted_at:null};
  await writeFile(join(dir,upload.private_key),source,{mode:0o600});
  const args={storageDir:dir,upload,accountId:upload.account_id};
  return {dir,source,upload,args};
}
async function ready(t,width=128,height=64,urls=['https://replicate.delivery/depth','https://cdn.replicate.delivery/result'],trustedHook=()=>{}) {
  const f=await fixture(t,width,height),input=await prepareReplicateInput(f.args),privateInput=getPrivateReplicateInput(input);
  const c={version:REPLICATE_VERSION,input:{...settings,image:privateInput.image}};
  const b={model:REPLICATE_MODEL,version:REPLICATE_VERSION,spend_budget_id:randomUUID(),
    contract_sha:REPLICATE_CONTRACT_SHA,source_input_sha:input.source_input_sha,transmitted_input_sha:input.transmitted_input_sha,
    request_sha:hashReplicateRequest(c),authorization_sha:'3'.repeat(64),privacy_acceptance_sha:'4'.repeat(64),
    license_acceptance_sha:'5'.repeat(64),safety_acceptance_sha:'6'.repeat(64),billing_acceptance_sha:'7'.repeat(64),transform:input.transform};
  let time=0, cap=180000;
  const budget=createReplicateBudget('2026-10-03T12:03:00Z',180000,{now:()=>time,trustedRemaining:()=>{trustedHook(f);return cap;}});
  const prepared=prepareReplicateMediaRequest(input,settings,b,{budget});
  const submission={...structuredClone(b),id:randomUUID(),job_id:randomUUID(),provider:'replicate',state:'known',
    attempt_number:1,attempt_ticket_id:randomUUID(),attempt_deadline:budget.attempt_deadline,prediction_id:'Synthetic_prediction',provider_status:'succeeded'};
  const provider={id:submission.prediction_id,model:REPLICATE_MODEL,version:REPLICATE_VERSION,status:'succeeded',output:urls};
  const api=network([{status:200,headers:{'content-type':'application/json'},bytes:Buffer.from(JSON.stringify(provider))}]);
  const transport=createReplicateTransport({model:REPLICATE_MODEL,version:REPLICATE_VERSION,contractSha:REPLICATE_CONTRACT_SHA,
    token:'offline-fake-token'}, {request:api.request});
  const authority={async observe(){return {status:'succeeded'};}};
  const observation=await transport.get({authority,submission,budget});
  const rect=input.transform.content_rect;
  // Provider fixture: black letterbox, red left content, blue right content; distinct green depth.
  const canvas=Buffer.alloc(512*512*3),depthCanvas=Buffer.alloc(512*512*3);
  for(let y=rect.y;y<rect.y+rect.height;y++)for(let x=rect.x;x<rect.x+rect.width;x++) {
    const i=(y*512+x)*3;canvas[i]=x-rect.x<rect.width/2?255:0;canvas[i+2]=x-rect.x<rect.width/2?0:255;
    depthCanvas[i+1]=180;
  }
  const output=await sharp(canvas,{raw:{width:512,height:512,channels:3}}).png().toBuffer();
  const depth=await sharp(depthCanvas,{raw:{width:512,height:512,channels:3}}).png().toBuffer();
  const args={observation,submission,prepared,budget};
  const downloads=network([{bytes:depth},{bytes:output}]);let resolutions=0;
  const resolveAddresses=async()=>{resolutions++;return [{address:'8.8.8.8',family:4},{address:'2606:4700:4700::1111',family:6}];};
  const media=createReplicateMedia({storageDir:f.dir},{request:downloads.request,resolveAddresses});
  return {...f,input,b,prepared,submission,observation,budget,args,media,depth,output,calls:downloads.calls,
    advance:ms=>{time+=ms;},cap:ms=>{cap=ms;},resolutions:()=>resolutions};
}
async function noArtifacts(dir) {
  for(const folder of ['outputs','depths','configs'])assert.deepEqual(await readdir(join(dir,folder)),[]);
}
function withCodecHook(hook,run) {
  const original=sharp.prototype.toBuffer;
  sharp.prototype.toBuffer=async function(...args){const result=await original.apply(this,args);return hook(this,result);};
  return Promise.resolve().then(run).finally(()=>{sharp.prototype.toBuffer=original;});
}

function pngChunk(type,data=Buffer.alloc(0)) {
  const body=Buffer.concat([Buffer.from(type),data]);let crc=0xffffffff;
  for(const byte of body) {crc^=byte;for(let bit=0;bit<8;bit++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}
  const chunk=Buffer.alloc(data.length+12);chunk.writeUInt32BE(data.length);body.copy(chunk,4);
  chunk.writeUInt32BE((crc^0xffffffff)>>>0,chunk.length-4);return chunk;
}
function pngFixture(animated=true,plays=2,stored=false) {
  const header=Buffer.alloc(13);header.writeUInt32BE(512);header.writeUInt32BE(512,4);header[8]=8;header[9]=2;
  const rows=color=>{const b=Buffer.alloc(512*(1+512*3));
    for(let y=0;y<512;y++)for(let x=0;x<512;x++)b[y*1537+1+x*3+color]=255;
    if(stored)Buffer.from('acTLfcTLfdAT').copy(b,1);
    return deflateSync(b,stored?{level:0}:{});};
  const control=seq=>{const b=Buffer.alloc(26);b.writeUInt32BE(seq);b.writeUInt32BE(512,4);b.writeUInt32BE(512,8);
    b.writeUInt16BE(1,20);b.writeUInt16BE(10,22);return pngChunk('fcTL',b);};
  const chunks=[pngChunk('IHDR',header)];
  if(animated) {const b=Buffer.alloc(8);b.writeUInt32BE(plays);chunks.push(pngChunk('acTL',b),control(0));}
  chunks.push(pngChunk('IDAT',rows(0)));
  if(animated&&plays===2) {const seq=Buffer.alloc(4);seq.writeUInt32BE(2);chunks.push(control(1),pngChunk('fdAT',Buffer.concat([seq,rows(2)])));}
  return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),...chunks,pngChunk('IEND')]);
}
test('CRC-correct APNG is denied by shared input preparation',async t=>{
  const f=await fixture(t),bytes=pngFixture();
  assert.equal(bytes.length,4061);assert.equal(hash(bytes),'031839f815d9d497abec27a167b236c92816a8ceb6aac41303b387e364d154f5');
  // Real Sharp sees only a static PNG here: this is the reviewed metadata gap.
  const m=await sharp(bytes).metadata();assert.equal(m.width,512);assert.equal(m.height,512);assert.equal(m.pages,undefined);
  await writeFile(join(f.dir,f.upload.private_key),bytes);
  await rejects(prepareReplicateInput({...f.args,upload:{...f.upload,sha256:hash(bytes),width:512,height:512}}));
  await noArtifacts(f.dir);
});
test('CRC-correct APNG depth is denied before second download and leaves zero artifacts',async t=>{
  const e=await ready(t),n=network([{bytes:pngFixture()},{bytes:e.output}]);
  const m=createReplicateMedia({storageDir:e.dir},{request:n.request,resolveAddresses:async()=>[{address:'8.8.8.8',family:4}]});
  await rejects(m.importArtifacts(e.args).then(async result=>{await result.cleanup(async()=>true);return result;}));
  assert.equal(n.calls.length,1);await noArtifacts(e.dir);
});
test('PNG chunk bounds and stray animation chunks fail closed in input and depth',async t=>{
  const e=await ready(t),staticPng=pngFixture(false),prefix=staticPng.subarray(0,-12);
  const oversized=Buffer.from(staticPng);oversized.writeUInt32BE(0xffffffff,33);
  const cases=[['one-frame APNG',pngFixture(true,1)],['stray fcTL',pngChunk('fcTL',Buffer.alloc(26))],
    ['stray fdAT',pngChunk('fdAT',Buffer.alloc(4))],['short acTL',pngChunk('acTL',Buffer.alloc(1))],
    ['late acTL',pngChunk('acTL',Buffer.alloc(8))],['truncated header',Buffer.from([0,0,0])],
    ['missing CRC',pngChunk('tEXt',Buffer.from('x')).subarray(0,-1)],['oversized length',oversized],
    ['missing IEND',prefix],['nonempty IEND',pngChunk('IEND',Buffer.from('x'))]];
  for(const [label,value] of cases)await t.test(label,async()=>{
    const complete=['one-frame APNG','oversized length','missing IEND'].includes(label);
    const bytes=complete?value:Buffer.concat([prefix,value,pngChunk('IEND')]);
    await writeFile(join(e.dir,e.upload.private_key),bytes);
    await rejects(prepareReplicateInput({storageDir:e.dir,accountId:e.upload.account_id,
      upload:{...e.upload,sha256:hash(bytes),width:512,height:512}}));
    const n=network([{bytes},{bytes:e.output}]);
    const m=createReplicateMedia({storageDir:e.dir},{request:n.request,resolveAddresses:async()=>[{address:'8.8.8.8',family:4}]});
    await rejects(m.importArtifacts(e.args));assert.equal(n.calls.length,1);await noArtifacts(e.dir);
  });
});
test('static PNG accepts animation names inside compressed pixels without substring scanning',async t=>{
  const e=await ready(t),bytes=pngFixture(false,2,true);
  for(const name of ['acTL','fcTL','fdAT'])assert.ok(bytes.includes(Buffer.from(name)));
  await writeFile(join(e.dir,e.upload.private_key),bytes);
  const input=await prepareReplicateInput({storageDir:e.dir,accountId:e.upload.account_id,
    upload:{...e.upload,sha256:hash(bytes),width:512,height:512}});assert.equal(input.source_input_sha,hash(bytes));
  const n=network([{bytes},{bytes:e.output}]);
  const m=createReplicateMedia({storageDir:e.dir},{request:n.request,resolveAddresses:async()=>[{address:'8.8.8.8',family:4}]});
  const result=await m.importArtifacts(e.args);assert.equal(n.calls.length,2);assert.equal(result.evidence.raw_provider_depth_sha,hash(bytes));
  await result.cleanup(async()=>true);await noArtifacts(e.dir);
});

test('real sanitized JPEG preserves dimensions, deterministic aspect, hashes and removes EXIF',async t=>{
  for(const [w,h,rect] of [[128,64,{x:0,y:128,width:512,height:256}], [64,128,{x:128,y:0,width:256,height:512}],
    [79,79,{x:0,y:0,width:512,height:512}], [1,1000,{x:255,y:0,width:1,height:512}]]) {
    await t.test(`${w}x${h}`,async t=>{
      const f=await fixture(t,w,h);
      const withExif=await sharp(f.source).jpeg().withMetadata({orientation:1,exif:{IFD0:{Artist:'private synthetic fixture'}}}).toBuffer();
      f.upload.mime='image/jpeg';f.upload.sha256=hash(withExif);await writeFile(join(f.dir,f.upload.private_key),withExif);
      assert.ok((await sharp(withExif).metadata()).exif);
      const input=await prepareReplicateInput(f.args),again=await prepareReplicateInput(f.args);
      assert.deepEqual(input.transform.content_rect,rect);assert.equal(input.transform.original_width,w);assert.equal(input.transform.original_height,h);
      assert.equal(input.transmitted_input_sha,again.transmitted_input_sha);assert.equal(input.source_input_sha,hash(withExif));
      const privateInput=getPrivateReplicateInput(input),jpeg=Buffer.from(privateInput.image.slice(23),'base64');
      assert.deepEqual([...jpeg.subarray(0,3)],[255,216,255]);assert.ok(jpeg.length<=262144);
      assert.equal(hash(jpeg),input.transmitted_input_sha);assert.notEqual(input.source_input_sha,input.transmitted_input_sha);
      const m=await sharp(jpeg).metadata();assert.equal(m.format,'jpeg');assert.equal(m.width,512);assert.equal(m.height,512);
      assert.equal(m.exif,undefined);assert.equal(m.icc,undefined);assert.equal(m.xmp,undefined);
      const raw=await sharp(jpeg).removeAlpha().raw().toBuffer();assert.equal(raw.length,786432);
      if(rect.y>0)assert.ok(raw.subarray(0,3).every(v=>v<5));
      assert.equal(JSON.stringify(privateInput),'{}');assert.ok(!JSON.stringify(input).includes('base64'));
      assert.ok(Object.isFrozen(input.transform.content_rect));assert.throws(()=>getPrivateReplicateInput({...input}));
    });
  }
});
test('owned upload key, hash, MIME and filesystem boundaries fail closed',async t=>{
  const f=await fixture(t);
  for(const [label,change] of [
    ['owner',u=>{u.account_id=randomUUID();}],['deleted',u=>{u.deleted_at=new Date();}],['traversal',u=>{u.private_key='../x';}],
    ['absolute',u=>{u.private_key='/tmp/x';}],['newline key',u=>{u.private_key+='\n';}],['forged hash',u=>{u.sha256='f'.repeat(64);}],
    ['MIME mismatch',u=>{u.mime='image/jpeg';}],['dims mismatch',u=>{u.width++;}]]) {
    await t.test(label,async()=>{const upload={...f.upload};change(upload);await rejects(prepareReplicateInput({...f.args,upload}));});
  }
  const key=randomUUID();await symlink(join(f.dir,f.upload.private_key),join(f.dir,key));
  await rejects(prepareReplicateInput({...f.args,upload:{...f.upload,private_key:key}}));
  const alias=join(f.dir,'alias');await symlink(f.dir,alias);
  await rejects(prepareReplicateInput({...f.args,storageDir:alias}));
  const directoryKey=randomUUID();await mkdir(join(f.dir,directoryKey));
  await rejects(prepareReplicateInput({...f.args,upload:{...f.upload,private_key:directoryKey}}));
  const huge=Buffer.alloc(10485761);await writeFile(join(f.dir,f.upload.private_key),huge);
  await rejects(prepareReplicateInput({...f.args,upload:{...f.upload,sha256:hash(huge)}}));
});
test('malformed, truncated, animated and over-20MP uploads are rejected by real sharp',async t=>{
  const f=await fixture(t);
  const frames=Buffer.concat([Buffer.alloc(8*8*3,99),Buffer.alloc(8*8*3,199)]);
  const animated=await sharp(frames,{raw:{width:8,height:16,channels:3,pageHeight:8}}).webp({loop:0}).toBuffer();
  assert.equal((await sharp(animated,{animated:true}).metadata()).pages,2);
  const tooBig=await sharp({create:{width:5000,height:4001,channels:3,background:'red'}}).png().toBuffer();
  const boundary=await sharp({create:{width:5000,height:4000,channels:3,background:'red'}}).png().toBuffer();
  for(const [bytes,mime,w,h] of [[Buffer.from([255,216,255,0]),'image/jpeg',1,1],
    [f.source.subarray(0,Math.floor(f.source.length/2)),'image/png',128,64],[animated,'image/webp',8,8],
    [tooBig,'image/png',5000,4001]]) {
    await writeFile(join(f.dir,f.upload.private_key),bytes);
    await rejects(prepareReplicateInput({...f.args,upload:{...f.upload,sha256:hash(bytes),mime,width:w,height:h}}));
  }
  await writeFile(join(f.dir,f.upload.private_key),boundary);
  const accepted=await prepareReplicateInput({...f.args,upload:{...f.upload,sha256:hash(boundary),width:5000,height:4000}});
  assert.equal(accepted.transform.original_width*accepted.transform.original_height,20000000);
});
test('JPEG fallback uses only 85, 80, 75 and literal 262144-byte bound',async t=>{
  const f=await fixture(t);let qualities=[];
  await withCodecHook((instance,result)=>{
    if(instance.options.formatOut==='jpeg') {
      qualities.push(instance.options.jpegQuality);
      return Buffer.concat([result,Buffer.alloc((qualities.length<3?262145:262144)-result.length)]);
    }return result;
  },async()=>{
    const input=await prepareReplicateInput(f.args);assert.equal(input.quality,75);
    assert.equal(Buffer.from(getPrivateReplicateInput(input).image.slice(23),'base64').length,262144);
  });assert.deepEqual(qualities,[85,80,75]);
  qualities=[];
  await withCodecHook((instance,result)=>{
    if(instance.options.formatOut==='jpeg'){qualities.push(instance.options.jpegQuality);return Buffer.concat([result,Buffer.alloc(262145-result.length)]);}return result;
  },()=>rejects(prepareReplicateInput(f.args)));assert.deepEqual(qualities,[85,80,75]);
});

test('hostile delivery URLs and image bombs never publish',async t=>{
  for(const value of ['http://replicate.delivery/x','https://evilreplicate.delivery/x','https://replicate.delivery.evil/x',
    'https://replicate.delivery:444/x','https://u:p@replicate.delivery/x','https://@replicate.delivery/x',
    'https://replicate.delivery/x#fragment','https://replicate.delivery/x#','https://127.0.0.1/x','https://[::1]/x',
    'https://2130706433/x','https://0x7f000001/x','https://replicate.delivery./x','https://.replicate.delivery/x',
    'https://bad..replicate.delivery/x','https://%72eplicate.delivery/x','https://replicate.delivery\\@evil/x',
    ' https://replicate.delivery/x','https://replicate.delivery/x\n','https://replicate.delivery/'+ 'x'.repeat(2022)]) {
    await t.test(value.slice(0,75),()=>assert.throws(()=>validateDeliveryUrl(value),e=>e.code==='provider_output_denied'));
  }
  for(const value of ['https://replicate.delivery/x','HTTPS://CDN.Replicate.Delivery:443/x?signature=test','https://a.b.replicate.delivery/x'])
    assert.equal(validateDeliveryUrl(value).protocol,'https:');
  assert.equal(validateDeliveryUrl('https://replicate.delivery/'+ 'x'.repeat(2021)).href.length,2048);
});
test('global address policy excludes IPv4 and IPv6 special-purpose ranges',async t=>{
  for(const ip of ['0.0.0.0','0.255.255.255','10.1.2.3','100.64.0.1','100.127.255.254','127.0.0.1','169.254.3.4',
    '172.16.0.0','172.31.255.255','192.0.0.8','192.0.0.9','192.0.2.1','192.31.196.1','192.52.193.1','192.175.48.1','192.88.99.1','192.168.1.2',
    '198.18.0.1','198.19.255.255','198.51.100.2','203.0.113.3','224.1.2.3','239.255.255.255','240.0.0.1','255.255.255.255',
    '::','::1','::ffff:8.8.8.8','::ffff:808:808','::8.8.8.8','::808:808','64:ff9b::808:808','64:ff9b:1::1',
    '100::1','2001::1','2001:2::1','2001:20::1','2001:db8::1','2002:0808:0808::1','3fff::1',
    'fc00::1','fdff::1','fe80::1','fec0::1','ff02::1','2606:4700::1%eth0','2620:4f:8000::1','bad']) {
    await t.test(ip,()=>assert.equal(isGlobalAddress(ip),false));
  }
  for(const ip of ['8.8.8.8','1.1.1.1','100.63.255.255','100.128.0.0','172.15.255.255','172.32.0.0',
    '2606:4700:4700::1111','2001:4860:4860::8888','2a00:1450:4001::1'])assert.equal(isGlobalAddress(ip),true,ip);
});
test('DNS validates all answers, pins lookup and original TLS hostname, never sends auth',async t=>{
  const e=await ready(t);const result=await e.media.importArtifacts(e.args);
  assert.equal(e.resolutions(),2);assert.equal(e.calls.length,2);
  for(const call of e.calls) {
    const o=call.options;assert.equal(o.protocol,'https:');assert.equal(o.port,443);assert.equal(o.servername,o.hostname);
    assert.equal(o.rejectUnauthorized,true);assert.equal(o.minVersion,'TLSv1.2');assert.equal(o.agent,false);
    assert.equal(call.timeout,5000);assert.equal(o.method,'GET');assert.deepEqual(Object.keys(o.headers),['Accept','Accept-Encoding']);assert.equal(o.headers['Accept-Encoding'],'identity');
    assert.ok(!JSON.stringify(o).includes('token'));
    o.lookup(o.hostname,{},(err,ip,family)=>{assert.equal(err,null);assert.equal(ip,'8.8.8.8');assert.equal(family,4);});
    o.lookup(o.hostname,{all:true},(err,addresses)=>assert.deepEqual(addresses,[{address:'8.8.8.8',family:4}]));
    o.lookup('evil.invalid',{},err=>assert.equal(err.code,'provider_output_denied'));
  }
  assert.equal(e.resolutions(),2);await result.cleanup(async()=>true);
  for(const addresses of [[{address:'8.8.8.8',family:4},{address:'127.0.0.1',family:4}],
    [{address:'2606:4700::1111',family:6},{address:'::ffff:7f00:1',family:6}],[],[{address:'8.8.8.8',family:6}]]) {
    const n=network([{bytes:e.depth},{bytes:e.output}]),m=createReplicateMedia({storageDir:e.dir},{request:n.request,resolveAddresses:async()=>addresses});
    let failure;const result=await m.importArtifacts(e.args).catch(error=>{failure=error;});await result?.release();
    assert.equal(n.calls.length,0,'nonglobal DNS must prevent every HTTPS connection');
    assert.equal(failure?.code,'provider_output_denied');await noArtifacts(e.dir);
  }
});
test('DNS stalls, abort and per-request timers stay within original budget',async t=>{
  const e=await ready(t);const n=network([]);
  const m=createReplicateMedia({storageDir:e.dir},{request:n.request,resolveAddresses:()=>new Promise(()=>{})});
  e.cap(35);
  await assert.rejects(m.importArtifacts(e.args),{code:'provider_deadline'});assert.equal(n.calls.length,0);
  const controller=new AbortController();const p=m.importArtifacts({...e.args,signal:controller.signal});controller.abort();
  await assert.rejects(p,{code:'provider_aborted'});assert.equal(n.calls.length,0);
  const h=network([{hang:true}]);const mh=createReplicateMedia({storageDir:e.dir},{request:h.request,
    resolveAddresses:async()=>[{address:'8.8.8.8',family:4}]});
  await assert.rejects(mh.importArtifacts(e.args),{code:'provider_deadline'});
  assert.equal(h.calls.length,1);assert.ok(h.calls[0].timeout<=40);assert.equal(h.calls[0].destroyed,true);
  await noArtifacts(e.dir);
});
test('streams reject redirect, declared and actual overflow, encoding, magic, decode and canvas attacks',async t=>{
  const e=await ready(t);
  const wrongCanvas=await sharp({create:{width:513,height:512,channels:3,background:'red'}}).png().toBuffer();
  const huge=await sharp({create:{width:5000,height:4001,channels:3,background:'red'}}).png().toBuffer();
  const animated=await sharp(Buffer.concat([Buffer.alloc(8*8*3,30),Buffer.alloc(8*8*3,230)]),
    {raw:{width:8,height:16,channels:3,pageHeight:8}}).webp().toBuffer();
  assert.equal((await sharp(animated,{animated:true}).metadata()).pages,2);
  for(const [label,action] of [
    ['redirect',{status:302,headers:{location:'https://replicate.delivery/other'},bytes:e.depth}],
    ['declared overflow',{headers:{'content-length':'10485761'},bytes:e.depth}],
    ['absent overflow',{chunks:[Buffer.alloc(10485760),Buffer.alloc(1)]}],
    ['lying length',{headers:{'content-length':'10485760'},chunks:[Buffer.alloc(10485760),Buffer.alloc(1)]}],
    ['length mismatch',{headers:{'content-length':'1'},bytes:e.depth}],['bad length',{headers:{'content-length':'-1'},bytes:e.depth}],
    ['gzip',{headers:{'content-encoding':'gzip'},bytes:e.depth}],['br',{headers:{'content-encoding':'br'},bytes:e.depth}],
    ['mime',{headers:{'content-type':'text/plain'},bytes:e.depth}],['magic',{headers:{'content-type':'image/jpeg'},bytes:e.depth}],
    ['truncated',{bytes:e.depth.subarray(0,40)}],['wrong canvas',{bytes:wrongCanvas}],['pixels',{bytes:huge}],
    ['animated',{headers:{'content-type':'image/webp'},bytes:animated}],['empty',{bytes:Buffer.alloc(0)}],
    ['reset',{reset:true}],['network',{error:true}]]) {
    await t.test(label,async()=>{
      const n=network([action]),m=createReplicateMedia({storageDir:e.dir},{request:n.request,
        resolveAddresses:async()=>[{address:'8.8.8.8',family:4}]});
      await rejects(m.importArtifacts(e.args));assert.equal(n.calls.length,1);await noArtifacts(e.dir);
    });
  }
  // Literal inclusive streaming limit: trailing bytes after a real PNG, still a decoded single image.
  const bytes=Buffer.concat([e.depth,Buffer.alloc(10485760-e.depth.length)]);
  const n=network([{bytes,headers:{'content-length':'10485760','content-encoding':'identity'}},{bytes:e.output}]);
  const m=createReplicateMedia({storageDir:e.dir},{request:n.request,resolveAddresses:async()=>[{address:'8.8.8.8',family:4}]});
  const result=await m.importArtifacts(e.args);assert.equal(result.evidence.raw_provider_depth_sha,hash(bytes));await result.cleanup(async()=>true);
});
test('exact crop and original-size PNG pixels, distinct hashes, safe config and 0600 files',async t=>{
  for(const [w,h] of [[128,64],[64,128],[79,79]])await t.test(`${w}x${h}`,async t=>{
    const e=await ready(t,w,h),r=await e.media.importArtifacts(e.args);assert.ok(Object.isFrozen(r));assert.ok(Object.isFrozen(r.evidence));
    assert.match(r.output_key,/^[a-f0-9-]{36}$/);assert.equal(r.evidence.raw_provider_depth_sha,hash(e.depth));
    assert.equal(r.evidence.raw_provider_output_sha,hash(e.output));assert.notEqual(r.evidence.output_sha,r.evidence.raw_provider_output_sha);
    for(const [folder,digest] of [['outputs',r.evidence.output_sha],['depths',r.evidence.depth_sha],['configs',r.evidence.config_sha]]) {
      const path=join(e.dir,folder,r.output_key),b=await readFile(path);assert.equal(hash(b),digest);assert.ok(b.length<=10485760);
      assert.equal((await stat(path)).mode&0o777,0o600);
      if(folder!=='configs') {
        const meta=await sharp(b).metadata();assert.equal(meta.format,'png');assert.equal(meta.width,w);assert.equal(meta.height,h);
        assert.equal(meta.exif,undefined);assert.equal(meta.icc,undefined);const pixels=await sharp(b).removeAlpha().raw().toBuffer();
        const p=(x,y)=>[...pixels.subarray((y*w+x)*3,(y*w+x)*3+3)];
        if(folder==='outputs'){assert.deepEqual(p(0,0),[255,0,0]);assert.deepEqual(p(w-1,h-1),[0,0,255]);
          assert.deepEqual(p(Math.floor(w/4),Math.floor(h/2)),[255,0,0]);assert.deepEqual(p(Math.floor(w*3/4),Math.floor(h/2)),[0,0,255]);}
        else {assert.deepEqual(p(0,0),[0,180,0]);assert.deepEqual(p(w-1,h-1),[0,180,0]);}
      } else {
        const config=JSON.parse(b);assert.equal(config.quality,'unverified');assert.deepEqual(config.transform,e.input.transform);
        assert.equal(config.version,REPLICATE_VERSION);assert.equal(config.source_input_sha,e.upload.sha256);
        assert.ok(!b.toString().match(/https:|data:|token|rawresponse/i));
        assert.deepEqual(Object.keys(config).sort(),['schema_version','mode','provider','quality','submission_id','prediction_id','model','version',
          'contract_sha','request_sha','source_input_sha','transmitted_input_sha','transform','raw_provider_depth_sha',
          'raw_provider_output_sha','depth_sha','output_sha'].sort());
      }
    }
    assert.ok(!JSON.stringify(r).match(/https:|data:|token/));assert.equal(r.evidence.warm,null);
    await rejects(r.cleanup());await rejects(r.cleanup(async()=>false));
    assert.equal((await readdir(join(e.dir,'outputs'))).length,1);
    let queried;await r.cleanup(async key=>{queried=key;return true;});assert.equal(queried,r.output_key);await noArtifacts(e.dir);
    await r.cleanup(async()=>{throw new Error('idempotent cleanup should not query again');});
  });
});
test('binding and observation forgery or partial output makes zero delivery requests',async t=>{
  const e=await ready(t);
  for(const [label,change] of [
    ['cloned observation',a=>{a.observation={...a.observation};}],['browser URL',a=>{a.observation='https://replicate.delivery/x';}],
    ['cloned prepared',a=>{a.prepared={...a.prepared};}],['source',a=>{a.submission.source_input_sha='f'.repeat(64);}],
    ['transmitted',a=>{a.submission.transmitted_input_sha='f'.repeat(64);}],['request',a=>{a.submission.request_sha='f'.repeat(64);}],
    ['transform',a=>{a.submission.transform.content_rect.y++;}],['version',a=>{a.submission.version='f'.repeat(64);}],
    ['contract',a=>{a.submission.contract_sha='f'.repeat(64);}],['status',a=>{a.submission.provider_status='processing';}],
    ['quarantined',a=>{a.submission.identity_conflict_at=new Date();}],['prediction',a=>{a.submission.prediction_id='other';}],
    ['submission id',a=>{a.submission.id=randomUUID();}],['deadline',a=>{a.submission.attempt_deadline='2026-10-03T12:04:00Z';}],
    ['renewed budget',a=>{a.budget=createReplicateBudget(e.budget.attempt_deadline,180000);}]]) {
    await t.test(label,async()=>{const args={...e.args,submission:structuredClone(e.submission)};change(args);
      await rejects(e.media.importArtifacts(args));assert.equal(e.calls.length,0);await noArtifacts(e.dir);});
  }
  const api=network([{headers:{'content-type':'application/json'},bytes:Buffer.from(JSON.stringify({id:e.submission.prediction_id,
    model:REPLICATE_MODEL,version:REPLICATE_VERSION,status:'processing',output:['https://replicate.delivery/partial']}))}]);
  const transport=createReplicateTransport({model:REPLICATE_MODEL,version:REPLICATE_VERSION,contractSha:REPLICATE_CONTRACT_SHA,token:'fake'},
    {request:api.request});
  const processing=await transport.get({authority:{async observe(){return {status:'processing'};}},submission:e.submission,budget:e.budget});
  await rejects(e.media.importArtifacts({...e.args,observation:processing}));assert.equal(e.calls.length,0);
  const b={...e.b,source_input_sha:'f'.repeat(64)};assert.throws(()=>prepareReplicateMediaRequest(e.input,settings,b,{budget:e.budget}));
});
test('abort/deadline before and after DNS, streaming, and real output decode prevents writes',async t=>{
  const e=await ready(t);
  const aborted=new AbortController();aborted.abort();await assert.rejects(e.media.importArtifacts({...e.args,signal:aborted.signal}),{code:'provider_aborted'});
  e.cap(0);await assert.rejects(e.media.importArtifacts(e.args),{code:'provider_deadline'});assert.equal(e.calls.length,0);
  for(const stage of ['DNS','stream','decode'])await t.test(stage,async t=>{
    const f=await ready(t),controller=new AbortController();const actions=[{bytes:f.depth},{bytes:f.output}];
    if(stage==='stream')actions[0].beforeBody=()=>controller.abort();
    const n=network(actions),m=createReplicateMedia({storageDir:f.dir},{request:n.request,resolveAddresses:async()=>{
      if(stage==='DNS')controller.abort();return [{address:'8.8.8.8',family:4}];}});
    if(stage==='decode')await withCodecHook((instance,value)=>{
      if(instance.options.formatOut==='png')controller.abort();return value;
    },()=>assert.rejects(m.importArtifacts({...f.args,signal:controller.signal}),{code:'provider_aborted'}));
    else await assert.rejects(m.importArtifacts({...f.args,signal:controller.signal}),{code:'provider_aborted'});
    assert.equal(n.calls.length,stage==='DNS'?0:1);await noArtifacts(f.dir);
  });
  const f=await ready(t);let encodes=0;
  await withCodecHook((instance,value)=>{if(instance.options.formatOut==='png' && ++encodes===2)f.advance(180000);return value;},
    ()=>assert.rejects(f.media.importArtifacts(f.args),{code:'provider_deadline'}));
  assert.equal(encodes,2);assert.equal(f.calls.length,2);await noArtifacts(f.dir);
});
test('exclusive writes, symlink directories and partial failure never remove preexisting winner files',async t=>{
  const e=await ready(t);
  const winner=randomUUID();await writeFile(join(e.dir,'outputs',winner),'winner',{mode:0o600});
  await rm(join(e.dir,'depths'),{recursive:true});await symlink(join(e.dir,'outputs'),join(e.dir,'depths'));
  await rejects(e.media.importArtifacts(e.args));assert.equal(await readFile(join(e.dir,'outputs',winner),'utf8'),'winner');
  assert.deepEqual(await readdir(join(e.dir,'outputs')),[winner]);assert.deepEqual(await readdir(join(e.dir,'configs')),[]);
  await rm(join(e.dir,'depths'));await mkdir(join(e.dir,'depths'));
  const n=network([{bytes:e.depth},{bytes:e.output}]);
  const m=createReplicateMedia({storageDir:e.dir},{request:n.request,resolveAddresses:async()=>[{address:'8.8.8.8',family:4}]});
  const result=await m.importArtifacts(e.args);
  // A concurrently replaced inode at our key must survive cleanup just like another winner.
  const own=join(e.dir,'outputs',result.output_key);await rm(own);await writeFile(own,'replacement',{mode:0o600});
  await result.cleanup(async()=>true);assert.equal(await readFile(own,'utf8'),'replacement');
  assert.equal(await readFile(join(e.dir,'outputs',winner),'utf8'),'winner');
  assert.deepEqual(await readdir(join(e.dir,'depths')),[]);assert.deepEqual(await readdir(join(e.dir,'configs')),[]);
});

test('exclusive collision after first write preserves preexisting depth winner and removes only own output',async t=>{
  let collisionKey;
  const e=await ready(t,128,64,undefined,f=>{
    const names=readdirSync(join(f.dir,'outputs'));
    if(names.length && !collisionKey) {
      collisionKey=names[0];writeFileSync(join(f.dir,'depths',collisionKey),'preexisting winner',{flag:'wx',mode:0o600});
    }
  });
  await rejects(e.media.importArtifacts(e.args));assert.ok(collisionKey);
  assert.deepEqual(await readdir(join(e.dir,'outputs')),[]);
  assert.equal(await readFile(join(e.dir,'depths',collisionKey),'utf8'),'preexisting winner');
  assert.deepEqual(await readdir(join(e.dir,'configs')),[]);
});
test('deadline at opened file and after first write cleans partial artifacts',async t=>{
  for(const afterWrite of [false,true])await t.test(afterWrite?'after write':'before write',async t=>{
    let e,triggered=false;
    e=await ready(t,128,64,undefined,f=>{
      const names=readdirSync(join(f.dir,'outputs'));
      if(e && names.length && (!afterWrite || statSync(join(f.dir,'outputs',names[0])).size>0)) {triggered=true;e.advance(180000);}
    });
    await assert.rejects(e.media.importArtifacts(e.args),{code:'provider_deadline'});assert.equal(triggered,true);await noArtifacts(e.dir);
  });
});
test('valid JPEG and WebP canvases strip provider metadata and final PNG overflow fails before files',async t=>{
  const e=await ready(t);
  const jpeg=await sharp(e.depth).jpeg().withMetadata({exif:{IFD0:{Artist:'private provider fixture'}}}).toBuffer();
  const webp=await sharp(e.output).webp().withMetadata().toBuffer();
  const n=network([{bytes:jpeg,headers:{'content-type':'image/jpeg'}},{bytes:webp,headers:{'content-type':'image/webp'}}]);
  const m=createReplicateMedia({storageDir:e.dir},{request:n.request,resolveAddresses:async()=>[{address:'2606:4700::1111',family:6}]});
  const result=await m.importArtifacts(e.args);assert.equal(result.evidence.raw_provider_depth_sha,hash(jpeg));
  const png=await sharp(await readFile(join(e.dir,'outputs',result.output_key))).metadata();assert.equal(png.exif,undefined);assert.equal(png.icc,undefined);
  await result.release();await result.cleanup(async()=>{throw new Error('released capability must not delete');});
  assert.equal((await readdir(join(e.dir,'outputs'))).length,1);
  const f=await ready(t);
  await withCodecHook((instance,value)=>instance.options.formatOut==='png'?Buffer.concat([value,Buffer.alloc(10485761-value.length)]):value,
    ()=>rejects(f.media.importArtifacts(f.args)));await noArtifacts(f.dir);
});
