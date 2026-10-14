import {sharingPage} from './common.js';
import {randomUUID} from 'node:crypto';
import type {Pool} from 'pg';
import {DomainError} from '@n8/domain/common';
import {needsWatermark,provenance,type ExportReservation,type ExportResult,type ExportPreview} from '@n8/domain/sharing';
import {withTransaction,lockOwnedProject,bumpProject,validId} from '../common.js';
import {createSpaceRepository,type AssetRow} from '../space.js';
import {accountLock,currentDesign,exportAccess} from './common.js';
import {recordGrowth} from './growth.js';
export function exportRepository(pool:Pool){return {
 async reserveExport(actorId:string,projectId:string,version:number,designId:string):Promise<ExportReservation>{validId(designId);return withTransaction(pool,async c=>{
  const a=await accountLock(c,actorId);const p=await lockOwnedProject(c,actorId,projectId,version);const hash=await currentDesign(c,projectId,designId,p.current_design_id);
  // Same Account→Project serialization and retained-byte accounting as the Space uploader.
  const q=(await c.query<{count:string;project_bytes:string;account_bytes:string}>(`SELECT (SELECT count(*) FROM asset WHERE project_id=$1) count,(SELECT COALESCE(sum(stored_bytes),0) FROM asset WHERE project_id=$1) project_bytes,(SELECT COALESCE(sum(a.stored_bytes),0) FROM asset a JOIN project p ON p.id=a.project_id WHERE p.account_id=$2) account_bytes`,[projectId,actorId])).rows[0]!;
  const reservation=20*1024*1024;if(Number(q.count)>=64||Number(q.project_bytes)+reservation>200*1024*1024||Number(q.account_bytes)+reservation>1024*1024*1024)throw new DomainError(413,'ASSET_QUOTA','Лимит хранения исчерпан');
  const result={id:randomUUID(),originalKey:randomUUID(),normalizedKey:randomUUID(),watermarked:needsWatermark(a.paid_export,a.billing_hold),designId,designHash:hash};
  await c.query(`INSERT INTO asset(id,project_id,kind,original_key,normalized_key,mime,rights_confirmed,stored_bytes,metadata) VALUES($1,$2,'share_image',$3,$4,'image/png',true,$5,$6)`,[result.id,projectId,result.originalKey,result.normalizedKey,reservation,{designId,designHash:hash,watermarked:result.watermarked}]);return result;
 });},
 async finishExport(actorId:string,projectId:string,version:number,reserved:ExportReservation,result:ExportResult,requestId:string):Promise<{asset:ExportPreview;version:number}>{return withTransaction(pool,async c=>{
  const account=await accountLock(c,actorId);const p=await lockOwnedProject(c,actorId,projectId,version);const hash=await currentDesign(c,projectId,reserved.designId,p.current_design_id);
  if(hash!==reserved.designHash)throw new DomainError(409,'DESIGN_CHANGED','Вариант изменился');
  if(!reserved.watermarked&&needsWatermark(account.paid_export,account.billing_hold))throw new DomainError(409,'EXPORT_ENTITLEMENT_CHANGED','Право экспорта изменилось; повторите с водяным знаком');
  if(!Number.isSafeInteger(result.bytes)||result.bytes<1||result.bytes>10*1024*1024)throw new DomainError(413,'ASSET_TOO_LARGE','Изображение превышает лимит');
  const metadata=provenance({schemaVersion:1,designId:reserved.designId,designHash:hash,normalizedHash:result.hash,watermarked:reserved.watermarked,width:result.width,height:result.height});
  const row=(await c.query<AssetRow>(`UPDATE asset SET state='ready',original_key=normalized_key,original_hash=$1,bytes=$2,stored_bytes=$2,metadata=$3 WHERE id=$4 AND project_id=$5 AND state='pending' AND kind='share_image' AND original_key=$6 AND normalized_key=$7 AND metadata=$8 AND stored_bytes>=$2 RETURNING *`,[result.hash,result.bytes,metadata,reserved.id,projectId,reserved.originalKey,reserved.normalizedKey,{designId:reserved.designId,designHash:hash,watermarked:reserved.watermarked}])).rows[0];if(!row)throw new DomainError(409,'UPLOAD_RESERVATION_LOST','Резерв истёк');
  await recordGrowth(c,{kind:'export_created',eventKey:row.id,requestId,accountId:actorId,projectId});return {asset:{id:row.id,designId:reserved.designId,imageURL:`/api/projects/${projectId}/exports/${row.id}`,watermarked:metadata.watermarked,width:metadata.width,height:metadata.height},version:await bumpProject(c,actorId,projectId)};
 });},
 releaseExport:(actorId:string,projectId:string,id:string)=>createSpaceRepository(pool).releaseReservation(actorId,projectId,id),
 async assertExportAccess(actorId:string,assetId:string,projectId?:string){validId(assetId);if(projectId)validId(projectId);return exportAccess(pool,actorId,assetId,projectId);},
 async listExports(actorId:string,projectId:string,after?:string){const page=await sharingPage<{id:string;metadata:unknown}>(pool,actorId,projectId,'asset',after);return {...page,items:page.items.map(row=>{const m=provenance(row.metadata);return{id:row.id,designId:m.designId,imageURL:`/api/projects/${projectId}/exports/${row.id}`,watermarked:m.watermarked,width:m.width,height:m.height};})};},
};}
