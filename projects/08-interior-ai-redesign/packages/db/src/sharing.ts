import {sharingPage} from './sharing/common.js';
import {randomBytes} from 'node:crypto';
import type {Pool} from 'pg';
import {DomainError} from '@n8/domain/common';
import {parsePublish,publicShare,SHARE_TTL_MS} from '@n8/domain/sharing';
import {withTransaction,lockOwnedProject,bumpProject,validId} from './common.js';
import type {AssetRow} from './space.js';
import {accountLock,currentDesign,verifyExport,notFound,tokenHash,designHash} from './sharing/common.js';
import {exportRepository} from './sharing/exports.js';
import {recordGrowth} from './sharing/growth.js';
export {recordGrowth,growthReport} from './sharing/growth.js';
export function createSharingRepository(pool:Pool){return {
 ...exportRepository(pool),
 async publish(actorId:string,projectId:string,version:number,input:unknown,requestId:string){const data=parsePublish(input);return withTransaction(pool,async c=>{
  const a=await accountLock(c,actorId);const p=await lockOwnedProject(c,actorId,projectId,version);const hash=await currentDesign(c,projectId,data.designId,p.current_design_id);
  const row=(await c.query<AssetRow>('SELECT * FROM asset WHERE id=$1 AND project_id=$2',[data.assetId,projectId])).rows[0];if(!row)throw notFound();const meta=verifyExport(row,a.paid_export,a.billing_hold);if(meta.designId!==data.designId||meta.designHash!==hash)throw notFound();
  const count=await c.query<{n:string}>('SELECT count(*) n FROM share_link WHERE project_id=$1',[projectId]);if(Number(count.rows[0]!.n)>=100)throw new DomainError(422,'SHARE_LIMIT','Не более 100 ссылок на проект');
  const token=randomBytes(32).toString('base64url');const saved=(await c.query<{id:string;expires_at:Date}>(`INSERT INTO share_link(project_id,design_id,asset_id,token_hash,caption,expires_at) VALUES($1,$2,$3,$4,$5,now()+$6::bigint*interval '1 millisecond') RETURNING id,expires_at`,[projectId,data.designId,data.assetId,tokenHash(token),data.caption,SHARE_TTL_MS])).rows[0]!;
  await recordGrowth(c,{kind:'share_created',eventKey:saved.id,requestId,accountId:actorId,projectId});return {share:{id:saved.id,url:`/s/${token}`,expiresAt:saved.expires_at.toISOString()},version:await bumpProject(c,actorId,projectId)};
 });},
 async revoke(actorId:string,projectId:string,version:number,id:string){validId(id);return withTransaction(pool,async c=>{await accountLock(c,actorId);await lockOwnedProject(c,actorId,projectId,version);const row=await c.query('UPDATE share_link SET revoked_at=COALESCE(revoked_at,now()) WHERE id=$1 AND project_id=$2 RETURNING id',[id,projectId]);if(!row.rowCount)throw notFound();return {version:await bumpProject(c,actorId,projectId)};});},
 async listShares(actorId:string,projectId:string,after?:string){const page=await sharingPage<{id:string;caption:string;expires_at:Date;revoked_at:Date|null}>(pool,actorId,projectId,'share_link',after);return {...page,items:page.items.map(r=>({id:r.id,caption:r.caption,expiresAt:r.expires_at.toISOString(),revokedAt:r.revoked_at?.toISOString()??null}))};},
 async resolve(token:string,requestId?:string){if(!/^[A-Za-z0-9_-]{43}$/.test(token))throw notFound();
  const row=(await pool.query<AssetRow&{caption:string;share_id:string;paid_export:boolean;billing_hold:boolean;design_id:string;design_content:Record<string,unknown>}>(`SELECT a.*,s.caption,s.id share_id,s.design_id,to_jsonb(d) design_content,u.paid_export,u.billing_hold FROM share_link s JOIN project p ON p.id=s.project_id JOIN account u ON u.id=p.account_id JOIN asset a ON a.id=s.asset_id AND a.project_id=p.id JOIN design_revision d ON d.id=s.design_id AND d.project_id=p.id WHERE s.token_hash=$1 AND s.revoked_at IS NULL AND s.expires_at>now() AND p.state='active' AND u.status='active'`,[tokenHash(token)])).rows[0];
  if(!row)throw notFound();const meta=verifyExport(row,row.paid_export,row.billing_hold);if(meta.designId!==row.design_id||meta.designHash!==designHash(row.design_content))throw notFound();
  if(requestId)await recordGrowth(pool,{kind:'share_viewed',eventKey:`${row.share_id}:${requestId}`,requestId});return {view:publicShare(row.caption,token),asset:row};
 },
 async firstDesignViewed(actorId:string,projectId:string,designId:string,requestId:string){validId(designId);return withTransaction(pool,async c=>{await accountLock(c,actorId);const p=await lockOwnedProject(c,actorId,projectId);await currentDesign(c,projectId,designId,p.current_design_id);return recordGrowth(c,{kind:'first_design_viewed',eventKey:projectId,requestId,accountId:actorId,projectId});});},
 async newProjectFromShare(actorId:string,projectId:string,requestId:string){return withTransaction(pool,async c=>{await accountLock(c,actorId);await lockOwnedProject(c,actorId,projectId);return recordGrowth(c,{kind:'new_project_from_share',eventKey:projectId,requestId,accountId:actorId,projectId});});}
};}
export type SharingRepository=ReturnType<typeof createSharingRepository>;
