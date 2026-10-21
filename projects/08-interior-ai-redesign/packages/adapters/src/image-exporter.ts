import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {dirname} from 'node:path';
import {readFile} from 'node:fs/promises';
import {DomainError} from '@n8/domain/common';
import {EXPORT_MAX_BYTES,type ExportStore,type ExportResult} from '@n8/domain/sharing';
import {assetPath,prepareAssetDirectory,writeUpload,verifyAssetFile,removeAssetFile,readPrivateAsset} from './assets.js';
import {createHash} from 'node:crypto';
const decoderDirectory=dirname(fileURLToPath(import.meta.url));
// Fixed child program: client input is only raster bytes. No SVG/PDF/URL decoder entry.
const decoder=String.raw`
const sharp=require('sharp'),fs=require('node:fs/promises'),crypto=require('node:crypto');
sharp.cache(false);sharp.concurrency(1);
process.once('message',async input=>{try{
 const bytes=await fs.readFile(input.originalPath);
 const png=bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
 const jpeg=bytes[0]===255&&bytes[1]===216&&bytes[2]===255;
 const webp=bytes.toString('ascii',0,4)==='RIFF'&&bytes.toString('ascii',8,12)==='WEBP';
 if(!png&&!jpeg&&!webp)throw Error('raster');
 const options={limitInputPixels:20000000,animated:false,failOn:'warning'};
 const metadata=await sharp(bytes,options).metadata();
 if(!['png','jpeg','webp'].includes(metadata.format)||metadata.pages>1||metadata.width<128||metadata.height<64||metadata.width>8192||metadata.height>8192)throw Error('dimensions');
 let pipeline=sharp(bytes,options).rotate().flatten({background:'#ffffff'}).toColourspace('srgb');
 if(input.watermarked){
 const mark=Buffer.from('<svg width="112" height="44" xmlns="http://www.w3.org/2000/svg"><rect width="112" height="44" fill="white"/><path d="M12 32V12h4l12 14V12h4v20h-4L16 18v14zm32-10c-8-9 12-17 18-7 2 3 0 5-2 7 11 13-24 17-16 0zm5-7v5h9v-5zm0 10v5h9v-5z" fill="black"/></svg>');
 pipeline=pipeline.composite([{input:mark,gravity:'southeast'}]);
 }
 const result=await pipeline.png({compressionLevel:6}).timeout({seconds:8}).toBuffer({resolveWithObject:true});
 if(result.data.length>10485760)throw Error('bytes');
 await fs.writeFile(input.normalizedPath,result.data,{flag:'wx',mode:0o600});
 process.send({ok:true,result:{bytes:result.data.length,hash:crypto.createHash('sha256').update(result.data).digest('hex'),width:result.info.width,height:result.info.height}});
}catch{process.send({ok:false});}});
`;
let active=false;
/** One supervised decoder; its native RSS and runtime are independently bounded. */
export async function normalizeExport(originalPath:string,normalizedPath:string,watermarked:boolean):Promise<ExportResult>{
 if(active)throw new DomainError(503,'EXPORT_BUSY','Обработчик занят; повторите позже');active=true;
 try{return await new Promise<ExportResult>((resolve,reject)=>{
  const child=spawn(process.execPath,['--max-old-space-size=256','-e',decoder],{cwd:decoderDirectory,stdio:['ignore','ignore','ignore','ipc'],env:{PATH:process.env.PATH,NODE_ENV:process.env.NODE_ENV}});
  let result:ExportResult|undefined,error:Error|undefined,finished=false;
  const stop=(failure?:Error,value?:ExportResult)=>{if(finished)return;finished=true;error=failure;result=value;clearTimeout(timer);clearInterval(memory);child.kill('SIGKILL');};
  const timer=setTimeout(()=>stop(new DomainError(422,'EXPORT_TIMEOUT','Обработка превысила 10 секунд')),10000);
  const memory=setInterval(()=>{if(child.pid)void readFile(`/proc/${child.pid}/status`,'utf8').then(text=>{if(Number(/^VmRSS:\s+(\d+)/m.exec(text)?.[1]??0)>512*1024)stop(new DomainError(422,'EXPORT_MEMORY','Превышен лимит памяти'));}).catch(()=>{});},25);
  child.on('message',(message:unknown)=>{const m=message as {ok?:boolean;result?:ExportResult};if(m.ok===true&&m.result)stop(undefined,m.result);else stop(new DomainError(422,'INVALID_EXPORT','Нужно растровое изображение до/после до 20 Мп'));});
  child.once('error',()=>stop(new DomainError(503,'EXPORT_UNAVAILABLE','Обработчик недоступен')));
  child.once('close',()=>{clearTimeout(timer);clearInterval(memory);if(error)reject(error);else if(result)resolve(result);else reject(new DomainError(422,'INVALID_EXPORT','Обработка прервана'));});
  child.send({originalPath,normalizedPath,watermarked});
 });}finally{active=false;}
}
export function createImageExporter(directory:string,repository:ExportStore){return async(request:Request,actorId:string,projectId:string,version:number,designId:string,requestId:string)=>{
 const mime=request.headers.get('content-type')?.split(';')[0].toLowerCase();if(!mime||!['image/png','image/jpeg','image/webp'].includes(mime))throw new DomainError(415,'RASTER_REQUIRED','Нужен PNG, JPEG или WebP');
 await prepareAssetDirectory(directory);const reserved=await repository.reserveExport(actorId,projectId,version,designId);
 try{
  await writeUpload(request,assetPath(directory,reserved.originalKey),EXPORT_MAX_BYTES);
  const result=await normalizeExport(assetPath(directory,reserved.originalKey),assetPath(directory,reserved.normalizedKey),reserved.watermarked);
  await verifyAssetFile(directory,reserved.normalizedKey,result.bytes,result.hash);
  await removeAssetFile(directory,reserved.originalKey); // Raw renderer upload must never become accessible.
  return await repository.finishExport(actorId,projectId,version,reserved,result,requestId);
 }catch(error){const cleaned=await Promise.allSettled([removeAssetFile(directory,reserved.originalKey),removeAssetFile(directory,reserved.normalizedKey),repository.releaseExport(actorId,projectId,reserved.id)]);if(cleaned.some(r=>r.status==='rejected'))console.error('Export cleanup incomplete; asset sweep required');throw error;}
};}
/** Read and hash the very bytes returned, avoiding verify/open races. */
export async function readExportImage(directory:string,asset:{normalized_key:string|null;original_hash:string|null;bytes:string|null}){
 if(!asset.normalized_key||!asset.original_hash)throw new DomainError(404,'NOT_FOUND','Изображение не найдено');
 const bytes=await readPrivateAsset(directory,asset.normalized_key);if(bytes.length!==Number(asset.bytes)||bytes.length>EXPORT_MAX_BYTES||createHash('sha256').update(bytes).digest('hex')!==asset.original_hash)throw new DomainError(404,'NOT_FOUND','Изображение не найдено');return bytes;
}
