import type { Pool } from 'pg';
import { HttpError } from '../errors.js';
import { parsePage,uid,validity,type HeaderInput } from './input.js';
export interface FixtureInput {uidvalidity:string;uidNext:number;headers:HeaderInput[];failed?:boolean}
export function validateFixture(raw:FixtureInput) {
 if(!raw || Object.keys(raw).some(k=>!['uidvalidity','uidNext','headers','failed'].includes(k)) || !Array.isArray(raw.headers) || raw.headers.length>10000 || (raw.failed!==undefined && typeof raw.failed!=='boolean')) throw new HttpError(400,'invalid_fixture');
 const v=validity(raw.uidvalidity),next=uid(raw.uidNext);let cursor=0;
 for(let offset=0;offset<raw.headers.length;offset+=100) {
  const headers=raw.headers.slice(offset,offset+100);
  for(const h of headers) {if(!h || h.uid<=cursor || h.uid>=next) throw new HttpError(400,'invalid_fixture');cursor=h.uid;}
  parsePage({runId:'00000000-0000-4000-8000-000000000001',attempt:1,uidvalidity:v,expectedCursor:offset?raw.headers[offset-1]!.uid:0,coveredThrough:cursor,kind:'scan',headers,startedAt:new Date(),completedAt:new Date()});
 }
 return {uidvalidity:v,uidNext:next,headers:raw.headers,failed:raw.failed??false};
}
// Trusted operator CLI/test helper only. There is deliberately no HTTP seed/update route.
export async function seedFixture(pool:Pool,tenant:string,mailbox:string,input:FixtureInput) {
 const f=validateFixture(input);
 const result=await pool.query(`INSERT INTO local_reply_fixture(tenant_id,mailbox_id,uidvalidity,uid_next,headers,failed)
  SELECT $1,$2,$3,$4,$5,$6 FROM mailbox WHERE tenant_id=$1 AND id=$2
  ON CONFLICT(mailbox_id) DO UPDATE SET uidvalidity=$3,uid_next=$4,headers=$5,failed=$6 RETURNING mailbox_id`,[tenant,mailbox,f.uidvalidity,f.uidNext,JSON.stringify(f.headers),f.failed]);
 if(!result.rowCount) throw new HttpError(400,'invalid_fixture');
}
