import { open, mkdir, statfs, unlink, lstat, readFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import { join, isAbsolute } from 'node:path';
import { createHash } from 'node:crypto';
import { DomainError } from '@n8/domain/common';
import { parseAsset, type ParsedAsset } from './asset-parser.js';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function assetPath(directory:string,key:string):string {if(!isAbsolute(directory)||!UUID.test(key))throw new Error('Invalid private asset path');return join(directory,key);}
export async function removeAssetFile(directory:string,key:string){try{await unlink(assetPath(directory,key));}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;}}
export async function verifyAssetFile(directory:string,key:string,expectedBytes:number,expectedHash:string):Promise<void>{const file=await open(assetPath(directory,key),constants.O_RDONLY|constants.O_NOFOLLOW);try{const stat=await file.stat();if(!stat.isFile()||stat.size!==expectedBytes)throw new Error('Asset verification failed');const hash=createHash('sha256');for await(const chunk of file.createReadStream({autoClose:false}))hash.update(chunk);if(hash.digest('hex')!==expectedHash)throw new Error('Asset hash mismatch');}finally{await file.close();}}
export async function prepareAssetDirectory(directory:string){if(!isAbsolute(directory))throw new Error('Private asset directory must be absolute');await mkdir(directory,{recursive:true,mode:0o700});const stat=await lstat(directory);if(!stat.isDirectory()||stat.isSymbolicLink())throw new Error('Private asset directory invalid');const disk=await statfs(directory);if(disk.bavail*disk.bsize<512*1024*1024)throw new DomainError(503,'STORAGE_LOW','Недостаточно свободного места');}
/** Sole body reader: streams directly to an exclusive0600 random private file. */
export async function writeUpload(request:Request,path:string,maximum:number,deadlineMs=10000):Promise<number> {
 const declared=request.headers.get('content-length');if(declared!==null&&(!/^\d{1,12}$/.test(declared)||Number(declared)>maximum))throw new DomainError(413,'ASSET_TOO_LARGE','Файл превышает лимит');
 const reader=request.body?.getReader();if(!reader)throw new DomainError(422,'EMPTY_ASSET','Пустой файл');
 const file=await open(path,'wx',0o600);let size=0,timer:ReturnType<typeof setTimeout>|undefined;
 const timeout=new Promise<never>((_,reject)=>{timer=setTimeout(()=>{reject(new DomainError(408,'UPLOAD_TIMEOUT','Загрузка превысила 10 секунд'));void reader.cancel().catch(()=>{});},deadlineMs);});
 try{while(true){const chunk=await Promise.race([reader.read(),timeout]);if(chunk.done)break;size+=chunk.value.byteLength;if(size>maximum){void reader.cancel().catch(()=>{});throw new DomainError(413,'ASSET_TOO_LARGE','Файл превышает лимит');}await Promise.race([file.writeFile(chunk.value),timeout]);}if(!size||(declared!==null&&size!==Number(declared)))throw new DomainError(422,'TRUNCATED_ASSET','Файл пустой или оборван');await file.sync();return size;}finally{clearTimeout(timer);reader.releaseLock();await file.close();}
}
export interface AssetRepositoryPort {
 reserveAsset(actorId:string,projectId:string,version:number,kind:'reference'|'room_photo'|'glb',rights:boolean):Promise<{id:string;originalKey:string;normalizedKey:string|null;reservationBytes:number}>;
 finishAsset(actorId:string,projectId:string,version:number,id:string,result:ParsedAsset):Promise<unknown>;
 releaseReservation(actorId:string,projectId:string,id:string):Promise<void>;
}
export function createAssetUploader(directory:string,repository:AssetRepositoryPort) {return async(request:Request,actorId:string,projectId:string,version:number,kind:'reference'|'room_photo'|'glb',rights:boolean)=>{
 await prepareAssetDirectory(directory);const reserved=await repository.reserveAsset(actorId,projectId,version,kind,rights);
 try{await writeUpload(request,assetPath(directory,reserved.originalKey),(kind==='glb'?25:10)*1024*1024);
  const result=await parseAsset({originalPath:assetPath(directory,reserved.originalKey),normalizedPath:reserved.normalizedKey?assetPath(directory,reserved.normalizedKey):null,kind});
  await verifyAssetFile(directory,reserved.originalKey,result.bytes,result.originalHash);
  if(reserved.normalizedKey){if(!result.normalizedHash||!result.normalizedBytes)throw new Error('Normalized image missing');await verifyAssetFile(directory,reserved.normalizedKey,result.normalizedBytes,result.normalizedHash);}
  return await repository.finishAsset(actorId,projectId,version,reserved.id,result);
 }catch(error){const cleanup=await Promise.allSettled([removeAssetFile(directory,reserved.originalKey),...(reserved.normalizedKey?[removeAssetFile(directory,reserved.normalizedKey)]:[]),repository.releaseReservation(actorId,projectId,reserved.id)]);if(cleanup.some(r=>r.status==='rejected'))console.error('Asset cleanup incomplete; stale/orphan sweep required');throw error;}
};}
export async function readPrivateAsset(directory:string,key:string){const file=await open(assetPath(directory,key),constants.O_RDONLY|constants.O_NOFOLLOW);try{const stat=await file.stat();if(!stat.isFile()||stat.size>30*1024*1024)throw new Error('Invalid stored asset');return await readFile(file);}finally{await file.close();}}
