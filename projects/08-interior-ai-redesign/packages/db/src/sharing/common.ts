import {validId} from '../common.js';
import {createHash} from 'node:crypto';
import type {PoolClient,Pool} from 'pg';
import {canonical,DomainError} from '@n8/domain/common';
import {needsWatermark,provenance} from '@n8/domain/sharing';
import type {AssetRow} from '../space.js';
export const notFound=()=>new DomainError(404,'NOT_FOUND','Не найдено');
export const tokenHash=(token:string)=>createHash('sha256').update(token).digest('hex');
export async function accountLock(c:PoolClient,actorId:string){const row=(await c.query<{paid_export:boolean;billing_hold:boolean}>("SELECT paid_export,billing_hold FROM account WHERE id=$1 AND status='active' FOR UPDATE",[actorId])).rows[0];if(!row)throw notFound();return row;}
export function designHash(row:Record<string,unknown>):string {const {state:_state,approved_at:_approved,created_at:_created,...immutable}=row;return createHash('sha256').update(canonical(immutable)).digest('hex');}
export async function currentDesign(c:PoolClient,projectId:string,designId:string,currentId:string|null){if(designId!==currentId)throw new DomainError(409,'DESIGN_CHANGED','Выберите текущий вариант');const row=(await c.query('SELECT * FROM design_revision WHERE id=$1 AND project_id=$2',[designId,projectId])).rows[0];if(!row)throw notFound();return designHash(row);}
export function verifyExport(row:AssetRow,paid:boolean,hold:boolean){if(row.kind!=='share_image'||row.state!=='ready'||row.mime!=='image/png'||row.original_key!==row.normalized_key||!row.rights_confirmed)throw notFound();const meta=provenance(row.metadata);if(meta.normalizedHash!==row.original_hash||Number(row.bytes)!==Number(row.stored_bytes))throw notFound();if(!meta.watermarked&&needsWatermark(paid,hold))throw notFound();return meta;}
export async function exportAccess(pool:Pool,actorId:string,assetId:string,projectId?:string){const row=(await pool.query<AssetRow&{paid_export:boolean;billing_hold:boolean;design_content:Record<string,unknown>}>(`SELECT a.*,u.paid_export,u.billing_hold,to_jsonb(d) design_content FROM asset a JOIN project p ON p.id=a.project_id JOIN account u ON u.id=p.account_id JOIN design_revision d ON d.id::text=a.metadata->>'designId' AND d.project_id=p.id WHERE a.id=$1 AND p.account_id=$2 AND p.state='active' AND u.status='active' AND ($3::uuid IS NULL OR p.id=$3)`,[assetId,actorId,projectId??null])).rows[0];if(!row)throw notFound();const meta=verifyExport(row,row.paid_export,row.billing_hold);if(meta.designHash!==designHash(row.design_content))throw notFound();return row;}

/** Reuse owned tuple pagination from SPACE; preserve all rows across bounded pages. */
export async function sharingPage<T extends {id:string}>(pool:import('pg').Pool,actorId:string,projectId:string,table:'asset'|'share_link',after?:string){
 validId(projectId);if(after)validId(after);
 if(!(await pool.query('SELECT id FROM project WHERE id=$1 AND account_id=$2',[projectId,actorId])).rowCount)throw notFound();
 const filter=table==='asset'?" AND kind='share_image' AND state='ready'":'';
 if(after&&!(await pool.query(`SELECT id FROM ${table} WHERE id=$1 AND project_id=$2${filter}`,[after,projectId])).rowCount)throw notFound();
 const rows=await pool.query<T>(`SELECT * FROM ${table} WHERE project_id=$1${filter} AND ($2::uuid IS NULL OR (created_at,id)<(SELECT created_at,id FROM ${table} WHERE id=$2 AND project_id=$1)) ORDER BY created_at DESC,id DESC LIMIT 51`,[projectId,after??null]);
 const items=rows.rows.slice(0,50);return {items,nextCursor:rows.rows.length>50?items[49]!.id:null};
}
