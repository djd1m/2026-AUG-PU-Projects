import { DomainError } from '@n8/domain/common';
import { createSpaceRepository, type UploadKind } from '@n8/db/space';
import { createAssetUploader, readPrivateAsset, assetPath, removeAssetFile } from '@n8/adapters/assets';
import { recognizeDrawing } from '@n8/adapters/floorplan';
import { getBase, type Base } from './composition';
import { guardRequest, readJson, route, success, RateLimitError } from './http';
export function createSpaceHandlers(base:Base,options:{recognize?:typeof recognizeDrawing}={}) {
 if(options.recognize&&process.env.NODE_ENV!=='test')throw Error('Recognition test injection forbidden');
 const recognize=options.recognize??recognizeDrawing;
 const repository=createSpaceRepository(base.pool);const upload=createAssetUploader(base.config.assetDir,repository);
 return {
  shells:(request:Request,projectId:string)=>route(async(req,requestId)=>{
   const actor=await guardRequest(req,{access:req.method==='GET'?'read':'mutation',projectId,expectedVersion:req.method!=='GET'},base,requestId);
   if(req.method==='GET')return success(await repository.listShells(actor.accountId,projectId,new URL(req.url).searchParams.get('after')??undefined),requestId);
   const result=await repository.createShell(actor.accountId,projectId,actor.expectedVersion!,await readJson(req));return success(result.shell,requestId,201,result.version);
  })(request),
  assets:(request:Request,projectId:string)=>route(async(req,requestId)=>{
   const actor=await guardRequest(req,{access:req.method==='GET'?'read':'mutation',projectId,expectedVersion:req.method!=='GET'},base,requestId);
   if(req.method==='GET')return success(await repository.listAssets(actor.accountId,projectId,new URL(req.url).searchParams.get('after')??undefined),requestId);
   const kind=req.headers.get('x-asset-kind');if(kind!=='reference'&&kind!=='room_photo'&&kind!=='glb')throw new DomainError(422,'INVALID_ASSET_KIND','Ожидается reference, room_photo или glb');
   if(req.headers.get('x-rights-confirmed')!=='true')throw new DomainError(422,'RIGHTS_REQUIRED','Подтвердите права на файл');
   const result=await upload(req,actor.accountId,projectId,actor.expectedVersion!,kind as UploadKind,true) as {asset:unknown;version:number};return success(result.asset,requestId,201,result.version);
  })(request),
  drawing:(request:Request,projectId:string)=>route(async(req,requestId)=>{
   const actor=await guardRequest(req,{access:'mutation',projectId,expectedVersion:true},base,requestId);
   const current=await base.projects.get(actor.accountId,projectId);if(current.version!==actor.expectedVersion)throw new DomainError(409,'VERSION_CONFLICT','Проект изменился; обновите данные перед распознаванием');
   const rate=await base.rate.hit(base.hashSubject('drawing:'+actor.accountId),'mutation',5);if(!rate.allowed)throw new RateLimitError(rate.retryAfter);
   const body=await readJson(req);if(!body||typeof body!=='object'||Array.isArray(body)||Object.keys(body).some(k=>k!=='assetId')||typeof(body as {assetId?:unknown}).assetId!=='string')throw new DomainError(422,'INVALID_DRAWING','Выберите загруженный чертёж');
   const asset=await repository.ownedAsset(actor.accountId,(body as {assetId:string}).assetId,projectId);
   if(!['reference','room_photo'].includes(asset.kind)||!asset.original_hash||!asset.rights_confirmed)throw new DomainError(422,'DRAWING_IMAGE_REQUIRED','Для распознавания нужен JPG, PNG или WebP с размерами');
   return success(await recognize(assetPath(base.config.assetDir,asset.original_key),asset.original_hash,asset.id),requestId,200,current.version);
  })(request),
  references:(request:Request,projectId:string)=>route(async(req,requestId)=>{
   const actor=await guardRequest(req,{access:req.method==='GET'?'read':'mutation',projectId,expectedVersion:req.method!=='GET'},base,requestId);
   if(req.method==='GET')return success(await repository.listReferences(actor.accountId,projectId,new URL(req.url).searchParams.get('after')??undefined),requestId);
   const input=await readJson(req);if(input&&typeof input==='object'&&'importPinterest' in input)throw new DomainError(409,'CAPABILITY_DISABLED','Импорт Pinterest отключён; сохраните ссылку или загрузите изображение');
   const result=await repository.createReference(actor.accountId,projectId,actor.expectedVersion!,input);return success(result.reference,requestId,201,result.version);
  })(request),
  reference:(request:Request,projectId:string,id:string)=>route(async(req,requestId)=>{
   const actor=await guardRequest(req,{access:'mutation',projectId,expectedVersion:true},base,requestId);
   const result=await repository.removeReference(actor.accountId,projectId,actor.expectedVersion!,id);
   return success({deletedReferenceId:result.deletedReferenceId},requestId,200,result.version);
  })(request),
  asset:(request:Request,assetId:string)=>route(async(req,requestId)=>{
   const actor=await guardRequest(req,{access:req.method==='DELETE'?'mutation':'read',expectedVersion:req.method==='DELETE'},base,requestId);const asset=await repository.ownedAsset(actor.accountId,assetId);
   if(req.method==='DELETE'){const deleted=await repository.deleteUnusedGlb(actor.accountId,asset.project_id,actor.expectedVersion!,assetId);try{await removeAssetFile(base.config.assetDir,deleted.originalKey);if(deleted.normalizedKey)await removeAssetFile(base.config.assetDir,deleted.normalizedKey);}catch{console.error(JSON.stringify({code:'ASSET_CLEANUP_PENDING'}));}return success({deletedAssetId:assetId},requestId,200,deleted.version);}
   // Prepared exports use a dedicated entitlement-aware endpoint; never expose originals here.
   if(asset.kind==='share_image')throw new DomainError(404,'NOT_FOUND','Файл не найден');
   const original=new URL(req.url).searchParams.get('original')==='1';const key=original||asset.kind==='glb'?asset.original_key:asset.normalized_key;
   if(!key)throw new DomainError(404,'NOT_FOUND','Файл не найден');
   const mime=original?asset.mime:asset.kind==='glb'?'model/gltf-binary':'image/webp';if(!['image/jpeg','image/png','image/webp','model/gltf-binary'].includes(mime))throw new DomainError(415,'INVALID_ASSET','Неподдерживаемый формат');
   return new Response(new Uint8Array(await readPrivateAsset(base.config.assetDir,key)),{headers:{'Content-Type':mime,'X-Content-Type-Options':'nosniff','Cache-Control':'private, no-store','Content-Disposition':`inline; filename="asset.${mime==='model/gltf-binary'?'glb':mime.split('/')[1]}"`}});
  })(request),
 };
}
let singleton:ReturnType<typeof createSpaceHandlers>|undefined;
export function getSpace(){return singleton??=createSpaceHandlers(getBase());}
