import {z} from 'zod';
import {DomainError} from '@n8/domain/common';
import {surfaceIds,type SceneProposal} from '@n8/domain/design';
import {PgDesigns,readShell} from '@n8/db/design';
import {createSpaceRepository} from '@n8/db/space';
import {readPrivateAsset,verifyAssetFile} from '@n8/adapters/assets';
import {withAssetParserSlot} from '@n8/adapters/asset-parser';
import {referenceColor,combineReferenceColors} from '@n8/adapters/reference-palette';
import {getBase,type Base} from './composition';
import {guardRequest,readJson,route,success} from './http';
const shape=z.object({referenceIds:z.array(z.string().uuid()).min(1).max(5)}).strict();
export function referenceDesignHandler(projectId:string,base?:Base){return route(async(request,requestId)=>{
 const b=base??getBase(),actor=await guardRequest(request,{access:'mutation',projectId,expectedVersion:true},b,requestId);
 const input=shape.safeParse(await readJson(request));if(!input.success||new Set(input.data.referenceIds).size!==input.data.referenceIds.length)throw new DomainError(422,'REFERENCE_REQUIRED','Выберите от 1 до 5 изображений референсов');
 const p=await b.projects.get(actor.accountId,projectId);if(p.version!==actor.expectedVersion)throw new DomainError(409,'VERSION_CONFLICT','Проект изменился; обновите страницу');
 const repository=createSpaceRepository(b.pool),designs=new PgDesigns(b.pool);
 const connection=await b.pool.connect();let shell;try{shell=await readShell(connection,projectId,p.currentShellId);}finally{connection.release();}
 const refs=await b.pool.query('SELECT id,asset_id FROM reference WHERE project_id=$1 AND id=ANY($2::uuid[])',[projectId,input.data.referenceIds]);
 if(refs.rows.length!==input.data.referenceIds.length)throw new DomainError(404,'NOT_FOUND','Референс не найден');
 if(refs.rows.some(r=>!r.asset_id))throw new DomainError(422,'REFERENCE_IMAGE_REQUIRED','Для применения референса загрузите его изображение в разделе 02. Одной ссылки Pinterest недостаточно.');
 const colors=await withAssetParserSlot(async()=>{const result:string[]=[];for(const id of input.data.referenceIds){const ref=refs.rows.find(r=>r.id===id)!;const asset=await repository.ownedAsset(actor.accountId,ref.asset_id,projectId);if(!asset.normalized_key||!asset.metadata.normalizedHash||!(Number(asset.stored_bytes)-Number(asset.bytes))||!asset.rights_confirmed||!['reference','room_photo'].includes(asset.kind))throw new DomainError(422,'REFERENCE_IMAGE_REQUIRED','Нужно готовое изображение референса');await verifyAssetFile(b.config.assetDir,asset.normalized_key,Number((Number(asset.stored_bytes)-Number(asset.bytes))),String(asset.metadata.normalizedHash));result.push(await referenceColor(await readPrivateAsset(b.config.assetDir,asset.normalized_key)));}return result;});
 const blended=combineReferenceColors(colors);
 const previous=p.currentDesignId?await designs.get(actor.accountId,projectId,p.currentDesignId):null;
 const scene:SceneProposal={shellId:shell.id,shellHash:shell.hash,objects:previous?.shellId===shell.id?previous.scene.objects:[],materials:surfaceIds(shell).slice(0,100).map(surfaceId=>({surfaceId,color:surfaceId==='ceiling'?'#ffffff':blended,materialCode:'custom'}))};
 const out=await designs.create(actor.accountId,projectId,actor.expectedVersion!,{scene,referenceIds:input.data.referenceIds,style:'По референсам · палитра изображений',changeReason:'Локальное извлечение доминирующих цветов из выбранных изображений; без AI и переноса мебели'});
 return success(out.design,requestId,201,out.version);
 });}
