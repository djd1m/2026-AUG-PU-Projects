import { randomUUID } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import { eligibilityTransaction } from '../consent/transaction.js';
import { HttpError } from '../errors.js';
export const ACTIVE_LIMIT=30, LEASE_SECONDS=120;
export const capacityProjection=`json_build_object('state',CASE WHEN l.state='active' AND l.expires_at>clock_timestamp() THEN 'active' WHEN l.mailbox_id IS NOT NULL THEN 'waiting_capacity' ELSE 'inactive' END,'expiresAt',CASE WHEN l.state='active' AND l.expires_at>clock_timestamp() THEN l.expires_at ELSE NULL END) AS capacity`;
export function capacityAction(raw:Record<string,unknown>) {
 if(Object.keys(raw).length!==1 || typeof raw.action!=='string' || !['activate','renew','deactivate'].includes(String(raw.action))) throw new HttpError(400,'invalid_input');
 return raw.action as 'activate'|'renew'|'deactivate';
}
export function mailboxPageInput(url:string) {
 const params=new URL(url,'http://local').searchParams, limit=params.get('limit'),after=params.get('after');
 if(params.getAll('limit').length>1 || params.getAll('after').length>1 || (limit!==null && !/^(?:[1-9]|[1-9][0-9]|100)$/.test(limit)) || (after!==null && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(after))) throw new HttpError(400,'invalid_input');
 return {limit:limit===null?25:Number(limit),after:after??undefined};
}
export async function releaseCapacity(client:PoolClient,id:string) {
 await client.query('DELETE FROM capacity_lease WHERE mailbox_id=$1',[id]);
}
export class CapacityStore {
 constructor(readonly pool:Pool) {}
 async act(tenant:string,id:string,action:'activate'|'renew'|'deactivate') {
  return eligibilityTransaction(this.pool,async client=>{
   const capacity=(await client.query('SELECT active_limit FROM installation_capacity WHERE id=1 FOR UPDATE')).rows[0];
   if(!capacity || capacity.active_limit!==30) throw new HttpError(503,'service_unavailable');
   const mailbox=(await client.query('SELECT state,credential_envelope FROM mailbox WHERE tenant_id=$1 AND id=$2 FOR UPDATE',[tenant,id])).rows[0];
   if(!mailbox) throw new HttpError(404,'not_found');
   const now=(await client.query('SELECT clock_timestamp() AS now')).rows[0].now as Date;
   if(action==='deactivate') {
    await releaseCapacity(client,id);
    await client.query("UPDATE send_job SET state='queued',reserved_day=NULL,lease_owner=NULL,lease_until=NULL WHERE (mailbox_id=$1 OR recipient_mailbox_id=$1) AND state='claimed'",[id]);
    return {state:'inactive',expiresAt:null};
   }
   if(mailbox.state!=='verified_test' || !mailbox.credential_envelope) throw new HttpError(409,'mailbox_changed');
   const lease=(await client.query('SELECT state,expires_at FROM capacity_lease WHERE tenant_id=$1 AND mailbox_id=$2',[tenant,id])).rows[0];
   const active=lease?.state==='active' && lease.expires_at>now;
   if(action==='renew' && !active) throw new HttpError(409,'capacity_lease_expired');
   await client.query("UPDATE capacity_lease SET state='waiting_capacity',expires_at=NULL WHERE state='active' AND expires_at<=$1",[now]);
   const count=Number((await client.query("SELECT count(*) FROM capacity_lease WHERE state='active' AND expires_at>$1",[now])).rows[0].count);
   const state=active || count<ACTIVE_LIMIT?'active':'waiting_capacity';
   const expiresAt=state==='active'?new Date(now.getTime()+LEASE_SECONDS*1000):null;
   await client.query(`INSERT INTO capacity_lease(id,tenant_id,mailbox_id,state,expires_at) VALUES($1,$2,$3,$4,$5)
    ON CONFLICT(mailbox_id) DO UPDATE SET state=EXCLUDED.state,expires_at=EXCLUDED.expires_at`,[randomUUID(),tenant,id,state,expiresAt]);
   return {state,expiresAt};
  });
 }
}
