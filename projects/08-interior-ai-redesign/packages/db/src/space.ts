import type { Pool, PoolClient } from 'pg';
import { createHash, randomUUID } from 'node:crypto';
import { DomainError, safeInteger } from '@n8/domain/common';
import { createManualShell, calibrateGlb, canonicalShellContent, validateReference, type ShellContent, type ShellRevision, type Reference, type GLBDescriptor } from '@n8/domain/space';
import { assertRevisionCapacity } from './bounds.js';
import { withTransaction, lockOwnedProject, bumpProject, validId } from './common.js';
export type UploadKind='reference'|'room_photo'|'glb';
export interface AssetRow {id:string;project_id:string;kind:UploadKind|'share_image';original_key:string;normalized_key:string|null;original_hash:string|null;mime:string;bytes:string|null;rights_confirmed:boolean;state:'pending'|'ready'|'rejected';stored_bytes:string;metadata:Record<string,unknown>;created_at:Date}
export interface ReadyAsset {id:string;projectId:string;kind:AssetRow['kind'];mime:string;bytes:number;rightsConfirmed:boolean;createdAt:string;metadata:Record<string,unknown>}
interface ShellRow {id:string;project_id:string;parent_id:string|null;mode:'manual'|'glb';source_asset_id:string|null;units:'m';geometry:ShellContent['geometry'];calibration:ShellContent['calibration'];floor_area_m2:string|null;floor_area_source:ShellContent['floorAreaSource'];confirmed_at:Date;hash:string;created_at:Date}
const fail404=()=>new DomainError(404,'NOT_FOUND','Не найдено');
function shellDto(r:ShellRow):ShellRevision {return {id:r.id,projectId:r.project_id,parentId:r.parent_id,mode:r.mode,sourceAssetId:r.source_asset_id,units:r.units,geometry:r.geometry,calibration:r.calibration,floorAreaM2:r.floor_area_m2,floorAreaSource:r.floor_area_source,confirmedAt:r.confirmed_at.toISOString(),hash:r.hash,createdAt:r.created_at.toISOString()};}
export function readyAssetDto(r:AssetRow):ReadyAsset {if(r.state!=='ready'||r.bytes===null)throw fail404();const metadata:Record<string,unknown>={};for(const key of ['width','height','vertexCount','triangleCount','nodeCount','surfaceIds'])if(r.metadata[key]!==undefined)metadata[key]=r.metadata[key];return {id:r.id,projectId:r.project_id,kind:r.kind,mime:r.kind==='glb'?'model/gltf-binary':'image/webp',bytes:safeInteger(r.bytes),rightsConfirmed:r.rights_confirmed,createdAt:r.created_at.toISOString(),metadata};}
async function accountLock(c:PoolClient,actorId:string){const a=await c.query("SELECT id FROM account WHERE id=$1 AND status='active' FOR UPDATE",[actorId]);if(!a.rowCount)throw fail404();}
export function createSpaceRepository(pool:Pool) {
 const ownedAsset=async(actorId:string,assetId:string,projectId?:string):Promise<AssetRow>=>{validId(assetId);const r=await pool.query<AssetRow>(`SELECT a.* FROM asset a JOIN project p ON p.id=a.project_id WHERE a.id=$1 AND p.account_id=$2 AND a.state='ready' AND ($3::uuid IS NULL OR p.id=$3)`,[assetId,actorId,projectId??null]);if(!r.rows[0])throw fail404();return r.rows[0];};
 return {
  ownedAsset,
  async deleteUnusedGlb(actorId:string,projectId:string,expectedVersion:number,assetId:string){validId(assetId);return withTransaction(pool,async c=>{await accountLock(c,actorId);await lockOwnedProject(c,actorId,projectId,expectedVersion);const row=(await c.query<AssetRow>("SELECT * FROM asset WHERE id=$1 AND project_id=$2 AND state='ready' AND kind='glb' FOR UPDATE",[assetId,projectId])).rows[0];if(!row)throw fail404();const used=await c.query('SELECT 1 FROM shell_revision WHERE source_asset_id=$1 UNION ALL SELECT 1 FROM reference WHERE asset_id=$1 LIMIT 1',[assetId]);if(used.rowCount)throw new DomainError(409,'ASSET_IN_USE','Скан используется в сохранённой основе. Его удаление нарушит историю проекта.');await c.query('DELETE FROM asset WHERE id=$1 AND project_id=$2',[assetId,projectId]);return{originalKey:row.original_key,normalizedKey:row.normalized_key,version:await bumpProject(c,actorId,projectId)};});},
  async listAssets(actorId:string,projectId:string,after?:string){const page=await pageOwned<AssetRow>(pool,actorId,projectId,'asset',after);return {...page,items:page.items.map(readyAssetDto)};},
  async listShells(actorId:string,projectId:string,after?:string){const page=await pageOwned<ShellRow>(pool,actorId,projectId,'shell_revision',after);return {...page,items:page.items.map(shellDto)};},
  async createShell(actorId:string,projectId:string,expectedVersion:number,input:unknown) {
   if(!input||typeof input!=='object'||Array.isArray(input))throw new DomainError(422,'INVALID_SPACE','Некорректная основа');
   const raw=input as Record<string,unknown>;
   if(Object.keys(raw).some(k=>!['mode','geometry','userConfirmed','sourceAssetId','calibration'].includes(k)))throw new DomainError(422,'INVALID_SPACE','Неизвестное поле основы');
   let content:ShellContent;
   if(raw.mode==='manual'){content=createManualShell(raw.geometry,raw.userConfirmed);if(raw.sourceAssetId!==undefined&&raw.sourceAssetId!==null){if(typeof raw.sourceAssetId!=='string')throw new DomainError(422,'INVALID_SPACE','Некорректный источник чертежа');const source=await ownedAsset(actorId,raw.sourceAssetId,projectId);if(!['reference','room_photo'].includes(source.kind)||!source.rights_confirmed)throw new DomainError(422,'INVALID_SPACE','Нужен проверенный чертёж-изображение');content.sourceAssetId=source.id;}}
   else if(raw.mode==='glb'&&typeof raw.sourceAssetId==='string') {
    const asset=await ownedAsset(actorId,raw.sourceAssetId,projectId);if(asset.kind!=='glb'||!asset.original_hash)throw new DomainError(422,'INVALID_SPACE','Нужен проверенный GLB');
    const descriptor:Omit<GLBDescriptor,'normalizationMatrix'>={assetId:asset.id,originalHash:asset.original_hash,vertexCount:safeInteger(asset.metadata.vertexCount),triangleCount:safeInteger(asset.metadata.triangleCount),nodeCount:safeInteger(asset.metadata.nodeCount),surfaceIds:Array.isArray(asset.metadata.surfaceIds)?asset.metadata.surfaceIds as string[]:[]};
    content=calibrateGlb(raw.calibration,descriptor);
   }else throw new DomainError(422,'INVALID_SPACE','Неизвестный режим основы');
   const hash=createHash('sha256').update(canonicalShellContent(content)).digest('hex');
   return withTransaction(pool,async c=>{await accountLock(c,actorId);const p=await lockOwnedProject(c,actorId,projectId,expectedVersion);await assertRevisionCapacity(c,actorId,projectId);
    if(content.sourceAssetId){const a=await c.query("SELECT id FROM asset WHERE id=$1 AND project_id=$2 AND kind=ANY($3::text[]) AND state='ready' AND rights_confirmed=true",[content.sourceAssetId,projectId,content.mode==='glb'?['glb']:['reference','room_photo']]);if(!a.rowCount)throw fail404();}
    const r=await c.query<ShellRow>(`INSERT INTO shell_revision(project_id,parent_id,mode,source_asset_id,geometry,calibration,floor_area_m2,floor_area_source,confirmed_at,hash) VALUES($1,$2,$3,$4,$5,$6,$7,$8,now(),$9) RETURNING *`,[projectId,p.current_shell_id,content.mode,content.sourceAssetId,JSON.stringify(content.geometry),JSON.stringify(content.calibration),content.floorAreaM2,content.floorAreaSource,hash]);
    await c.query('UPDATE project SET current_shell_id=$1,current_budget_id=NULL WHERE id=$2 AND account_id=$3',[r.rows[0]!.id,projectId,actorId]);const version=await bumpProject(c,actorId,projectId);return {shell:shellDto(r.rows[0]!),version};
   });
  },
  async reserveAsset(actorId:string,projectId:string,expectedVersion:number,kind:UploadKind,rightsConfirmed:boolean) {
   if(!['reference','room_photo','glb'].includes(kind)||rightsConfirmed!==true)throw new DomainError(422,'INVALID_ASSET','Выберите тип файла и подтвердите права');
   const reservationBytes=(kind==='glb'?25:30)*1024*1024;
   return withTransaction(pool,async c=>{await accountLock(c,actorId);await lockOwnedProject(c,actorId,projectId,expectedVersion);
    const quota=await c.query<{count:string;project_bytes:string;account_bytes:string}>(`SELECT (SELECT count(*) FROM asset WHERE project_id=$1) AS count,(SELECT COALESCE(sum(stored_bytes),0) FROM asset WHERE project_id=$1) AS project_bytes,(SELECT COALESCE(sum(a.stored_bytes),0) FROM asset a JOIN project p ON p.id=a.project_id WHERE p.account_id=$2) AS account_bytes`,[projectId,actorId]);const q=quota.rows[0]!;
    if(Number(q.count)>=64||Number(q.project_bytes)+reservationBytes>200*1024*1024||Number(q.account_bytes)+reservationBytes>1024*1024*1024)throw new DomainError(413,'ASSET_QUOTA','Лимит хранения исходников исчерпан');
    const id=randomUUID(),originalKey=randomUUID(),normalizedKey=kind==='glb'?null:randomUUID();
    await c.query(`INSERT INTO asset(id,project_id,kind,original_key,normalized_key,mime,rights_confirmed,stored_bytes) VALUES($1,$2,$3,$4,$5,$6,true,$7)`,[id,projectId,kind,originalKey,normalizedKey,kind==='glb'?'model/gltf-binary':'application/octet-stream',reservationBytes]);
    return {id,originalKey,normalizedKey,reservationBytes};
   });
  },
  async finishAsset(actorId:string,projectId:string,expectedVersion:number,id:string,result:{mime:string;originalHash:string;bytes:number;normalizedBytes:number;normalizedHash:string|null;metadata:Record<string,unknown>}) {
   return withTransaction(pool,async c=>{await accountLock(c,actorId);await lockOwnedProject(c,actorId,projectId,expectedVersion);
    const r=await c.query<AssetRow>(`UPDATE asset SET state='ready',mime=$1,original_hash=$2,bytes=$3,stored_bytes=$4,metadata=$5 WHERE id=$6 AND project_id=$7 AND state='pending' AND stored_bytes>=$4 RETURNING *`,[result.mime,result.originalHash,result.bytes,result.bytes+result.normalizedBytes,JSON.stringify({...result.metadata,normalizedHash:result.normalizedHash}),id,projectId]);if(!r.rows[0])throw new DomainError(409,'UPLOAD_RESERVATION_LOST','Резерв загрузки истёк');const version=await bumpProject(c,actorId,projectId);return {asset:readyAssetDto(r.rows[0]),version};
   });
  },
  async releaseReservation(actorId:string,projectId:string,id:string){await pool.query(`DELETE FROM asset a USING project p WHERE a.id=$1 AND a.project_id=p.id AND p.id=$2 AND p.account_id=$3 AND a.state='pending'`,[id,projectId,actorId]);},
  async createReference(actorId:string,projectId:string,expectedVersion:number,input:unknown) {
   const ref=validateReference(input);return withTransaction(pool,async c=>{await accountLock(c,actorId);await lockOwnedProject(c,actorId,projectId,expectedVersion);
    if(ref.assetId){const a=await c.query("SELECT id FROM asset WHERE id=$1 AND project_id=$2 AND state='ready' AND kind IN ('reference','room_photo') AND rights_confirmed=true",[ref.assetId,projectId]);if(!a.rowCount)throw fail404();}
    const count=await c.query<{n:string;total:string}>('SELECT count(*) FILTER (WHERE deleted_at IS NULL) n,count(*) total FROM reference WHERE project_id=$1',[projectId]);if(Number(count.rows[0]!.total)>=200)throw new DomainError(422,'REFERENCE_HISTORY_LIMIT','Достигнут предел истории референсов проекта');if(Number(count.rows[0]!.n)>=20)throw new DomainError(422,'REFERENCE_LIMIT','Не более 20 референсов');
    const r=await c.query(`INSERT INTO reference(project_id,asset_id,source_url,tags,note,observed_at,rights_confirmed) VALUES($1,$2,$3,$4,$5,now(),true) RETURNING *`,[projectId,ref.assetId,ref.sourceURL,JSON.stringify(ref.tags),ref.note]);const version=await bumpProject(c,actorId,projectId);return {reference:referenceDto(r.rows[0]),version};
   });
  },
  async removeReference(actorId:string,projectId:string,expectedVersion:number,id:string){validId(id);return withTransaction(pool,async c=>{await accountLock(c,actorId);await lockOwnedProject(c,actorId,projectId,expectedVersion);const row=await c.query('UPDATE reference SET deleted_at=now() WHERE id=$1 AND project_id=$2 AND deleted_at IS NULL RETURNING id',[id,projectId]);if(!row.rowCount)throw fail404();return{deletedReferenceId:id,version:await bumpProject(c,actorId,projectId)};});},
  async listReferences(actorId:string,projectId:string,after?:string){const page=await pageOwned<Record<string,unknown>&{id:string}>(pool,actorId,projectId,'reference',after);return {...page,items:page.items.map(referenceDto)};},
 };
}
function referenceDto(r:Record<string,unknown>):Reference {return {id:r.id as string,projectId:r.project_id as string,assetId:r.asset_id as string|null,sourceURL:r.source_url as string|null,tags:r.tags as Reference['tags'],note:r.note as string,rightsConfirmed:true,createdAt:(r.created_at as Date).toISOString(),observedAt:(r.observed_at as Date).toISOString()};}
export type SpaceRepository=ReturnType<typeof createSpaceRepository>;

async function pageOwned<T extends {id:string}>(pool:Pool,actorId:string,projectId:string,table:'asset'|'shell_revision'|'reference',after?:string):Promise<{items:T[];nextCursor:string|null}> {
 validId(projectId);const p=await pool.query('SELECT id FROM project WHERE id=$1 AND account_id=$2',[projectId,actorId]);if(!p.rowCount)throw fail404();
 const filter=table==='asset'?" AND state='ready'":table==='reference'?" AND deleted_at IS NULL":"";const descending=table==='shell_revision';
 if(after!==undefined){validId(after);const cursor=await pool.query(`SELECT id FROM ${table} WHERE id=$1 AND project_id=$2${filter}`,[after,projectId]);if(!cursor.rowCount)throw fail404();}
 const rows=await pool.query<T>(`SELECT * FROM ${table} WHERE project_id=$1${filter} AND ($2::uuid IS NULL OR (created_at,id) ${descending?'<':'>'} (SELECT created_at,id FROM ${table} WHERE id=$2 AND project_id=$1)) ORDER BY created_at ${descending?'DESC':'ASC'},id ${descending?'DESC':'ASC'} LIMIT 51`,[projectId,after??null]);
 const items=rows.rows.slice(0,50);return {items,nextCursor:rows.rows.length>50?items[49]!.id:null};
}
