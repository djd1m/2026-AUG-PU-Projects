import {DomainError} from '@n8/domain/common';
import type {ReferenceImage} from '@n8/domain/design';
import {createSpaceRepository} from '@n8/db/space';
import {readPrivateAsset,verifyAssetFile} from '@n8/adapters/assets';
import {withAssetParserSlot} from '@n8/adapters/asset-parser';
import {referenceThumbnail} from '@n8/adapters/reference-thumbnail';
import type {Base} from './composition';
export async function prepareReferenceImages(base:Base,actorId:string,projectId:string,ids:string[]):Promise<ReferenceImage[]>{
 if(ids.length<1||ids.length>5||new Set(ids).size!==ids.length)throw new DomainError(422,'REFERENCE_REQUIRED','Выберите от 1 до 5 референсов');
 const refs=await base.pool.query('SELECT id,asset_id FROM reference WHERE project_id=$1 AND id=ANY($2::uuid[]) AND deleted_at IS NULL',[projectId,ids]);if(refs.rows.length!==ids.length)throw new DomainError(404,'NOT_FOUND','Референс не найден');
 const repository=createSpaceRepository(base.pool);
 return withAssetParserSlot(async()=>{const images:ReferenceImage[]=[];for(const id of ids){const ref=refs.rows.find(r=>r.id===id);if(!ref?.asset_id)throw new DomainError(422,'REFERENCE_IMAGE_REQUIRED','Для референса нужно изображение');const a=await repository.ownedAsset(actorId,ref.asset_id,projectId);const size=Number(a.stored_bytes)-Number(a.bytes);if(!a.normalized_key||!a.metadata.normalizedHash||!a.rights_confirmed||!size||!['reference','room_photo'].includes(a.kind))throw new DomainError(422,'REFERENCE_IMAGE_REQUIRED','Нужно готовое изображение референса');await verifyAssetFile(base.config.assetDir,a.normalized_key,size,String(a.metadata.normalizedHash));images.push({id,dataUrl:await referenceThumbnail(await readPrivateAsset(base.config.assetDir,a.normalized_key))});}return images;});
}
