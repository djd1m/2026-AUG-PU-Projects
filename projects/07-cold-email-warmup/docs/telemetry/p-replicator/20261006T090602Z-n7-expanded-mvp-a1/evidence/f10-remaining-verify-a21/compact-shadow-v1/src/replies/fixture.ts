import { randomUUID } from 'node:crypto';
import type { Pool,PoolClient } from 'pg';
import { eligibilityTransaction } from '../consent/transaction.js';
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
 const result=await eligibilityTransaction(pool,c=>c.query(`INSERT INTO local_reply_fixture(tenant_id,mailbox_id,uidvalidity,uid_next,headers,failed,generation)
  SELECT $1,$2,$3,$4,$5,$6,$7 FROM mailbox WHERE tenant_id=$1 AND id=$2
  ON CONFLICT(mailbox_id) DO UPDATE SET uidvalidity=$3,uid_next=$4,headers=$5,failed=$6,generation=$7 RETURNING mailbox_id`,[tenant,mailbox,f.uidvalidity,f.uidNext,JSON.stringify(f.headers),f.failed,randomUUID()]));
 if(!result.rowCount) throw new HttpError(400,'invalid_fixture');
}

// Observe BEFORE each adapter operation; apply this fence inside the mutation transaction.
export async function claimPoll(pool:Pool,tenant:string,mailbox:string) {
 const owner=randomUUID();
 await eligibilityTransaction(pool,async c=>{
  const r=await c.query(`INSERT INTO mailbox_poll(mailbox_id,scan_complete,poll_owner)
   SELECT id,false,$3 FROM mailbox WHERE tenant_id=$1 AND id=$2
   ON CONFLICT(mailbox_id) DO UPDATE SET poll_owner=$3`,[tenant,mailbox,owner]);
  if(!r.rowCount) throw new HttpError(404,'not_found');
 });
 return owner;
}
export async function observePoll(pool:Pool,tenant:string,mailbox:string,owner:string) {
 return eligibilityTransaction(pool,async c=>{
  const row=await pollSource(c,tenant,mailbox);
  if(!row || row.poll_owner!==owner) throw new HttpError(409,'stale_poll_owner');
  const generation=row.generation as string|null;
  return async(client:PoolClient)=>{
   const current=await pollSource(client,tenant,mailbox);
   if(!current || current.poll_owner!==owner || current.generation!==generation) throw new HttpError(409,'stale_poll_owner');
  };
 });
}
async function pollSource(c:PoolClient,tenant:string,mailbox:string) {
 return (await c.query(`SELECT p.poll_owner,f.generation FROM mailbox m
  JOIN mailbox_poll p ON p.mailbox_id=m.id LEFT JOIN local_reply_fixture f ON f.mailbox_id=m.id AND f.tenant_id=m.tenant_id
  WHERE m.tenant_id=$1 AND m.id=$2`,[tenant,mailbox])).rows[0];
}
