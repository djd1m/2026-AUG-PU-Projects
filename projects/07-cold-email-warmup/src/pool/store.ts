import { randomUUID } from 'node:crypto';
import type { Pool } from 'pg';
import { eligibilityTransaction } from '../consent/transaction.js';
import { poolEligible } from '../dispatch/eligibility.js';
const payload={subject:'N7 consented warmup test',body:'This is a consented N7 warmup test message.'};
export class PoolStore {
 constructor(readonly pool:Pool) {}
 async aggregate(now=new Date()) {
  const rows=(await this.pool.query(`SELECT count(*)::integer AS count,count(DISTINCT m.tenant_id)::integer AS tenants FROM mailbox m WHERE ${poolEligible}`,[now])).rows[0];
  return {count:rows.count,status:rows.tenants<2?'waiting':'ready'};
 }
 async tick(clock?:Date|(()=>Date),sender?:string,guard?:(client:import('pg').PoolClient)=>Promise<void>) {
  return eligibilityTransaction(this.pool,async client=>{
   await guard?.(client);
   const now=typeof clock==='function'?clock():clock??(await client.query('SELECT clock_timestamp() AS now')).rows[0].now as Date;
   const eligible=(await client.query(`SELECT m.id,m.tenant_id FROM mailbox m WHERE ${poolEligible} ORDER BY m.id LIMIT 30`,[now])).rows;
   if(new Set(eligible.map(m=>m.tenant_id)).size<2) return {status:'waiting',created:0};
   let created=0;const day=now.toISOString().slice(0,10);
   await client.query("UPDATE send_job SET state='cancelled',outcome='expired_pool_day' WHERE scope='pool' AND kind='initial' AND state IN ('queued','claimed') AND right(pair_key,10)<>$1",[day]);
   // One deterministic pair per bounded tick. Replay advances neither thread nor quota.
   const capacity=(await client.query(`SELECT m.id FROM mailbox m WHERE ${poolEligible} AND (SELECT count(*) FROM send_job q WHERE q.mailbox_id=m.id AND q.reserved_day=$2::date AND q.state IN ('claimed','submitting','submitted','unknown'))<LEAST(m.daily_limit,m.provider_limit,30) ORDER BY m.id`,[now,day])).rows;
   const available=eligible.filter(m=>capacity.some(c=>c.id===m.id));
   const awaiting=(await client.query("SELECT recipient_mailbox_id FROM send_job j WHERE scope='pool' AND kind='initial' AND state='submitted' AND NOT EXISTS(SELECT 1 FROM send_job r WHERE r.parent_id=j.id AND r.kind='reply') ORDER BY due_at,id LIMIT 30")).rows;
   const a=sender?available.find(m=>m.id===sender):available.find(m=>awaiting.some(j=>j.recipient_mailbox_id===m.id))??available[0];
   if(!a)return {status:'waiting',created:0};
   const movable=(await client.query("SELECT 1 FROM send_job WHERE mailbox_id=$1 AND scope='pool' AND state IN ('queued','claimed') LIMIT 1",[a.id])).rowCount;
   const replyDue=(await client.query("SELECT 1 FROM send_job j WHERE j.scope='pool' AND j.kind='initial' AND j.state='submitted' AND j.recipient_mailbox_id=$1 AND NOT EXISTS(SELECT 1 FROM send_job r WHERE r.parent_id=j.id AND r.kind='reply') LIMIT 1",[a.id])).rowCount;
   if(!movable&&!replyDue){
    const meta=(await client.query('SELECT pool_peer_after FROM runtime_mailbox WHERE mailbox_id=$1',[a.id])).rows[0];
    const peers=available.filter(m=>m.tenant_id!==a.tenant_id);
    const ordered=[...peers.filter(m=>!meta?.pool_peer_after||m.id>meta.pool_peer_after),...peers.filter(m=>meta?.pool_peer_after&&m.id<=meta.pool_peer_after)];
    for(const b of ordered){
     const pair=[a.id,b.id].sort().join(':')+':'+day;
     const inserted=(await client.query(`INSERT INTO send_job(id,tenant_id,mailbox_id,recipient_mailbox_id,scope,state,pair_key,due_at,payload) VALUES($1,$2,$3,$4,'pool','queued',$5,$6,$7) ON CONFLICT(pair_key) WHERE scope='pool' AND kind='initial' DO NOTHING`,[randomUUID(),a.tenant_id,a.id,b.id,pair,now,payload])).rowCount??0;
     await client.query(`INSERT INTO runtime_mailbox(tenant_id,mailbox_id,pool_peer_after,pool_day,pool_round_started_at) VALUES($1,$2,$3,$4,$5) ON CONFLICT(mailbox_id) DO UPDATE SET pool_peer_after=$3,pool_day=$4,pool_round_started_at=$5`,[a.tenant_id,a.id,b.id,day,now]);
     created+=inserted;if(inserted)break;
    }
   }
   const parents=(await client.query(`SELECT j.* FROM send_job j JOIN mailbox m ON m.id=j.recipient_mailbox_id WHERE j.scope='pool' AND j.kind='initial' AND j.state='submitted' AND ${poolEligible} AND EXISTS(SELECT 1 FROM mailbox m WHERE m.id=j.mailbox_id AND ${poolEligible}) ORDER BY j.due_at,j.id LIMIT 30`,[now])).rows;
   for(const parent of parents) {
    const sender=eligible.find(m=>m.id===parent.recipient_mailbox_id);if(!sender || sender.id!==a.id || created || (await client.query("SELECT 1 FROM send_job WHERE mailbox_id=$1 AND scope='pool' AND state IN ('queued','claimed') LIMIT 1",[sender.id])).rowCount) continue;
    created+=(await client.query(`INSERT INTO send_job(id,tenant_id,mailbox_id,recipient_mailbox_id,scope,state,kind,parent_id,pair_key,due_at,payload) VALUES($1,$2,$3,$4,'pool','queued','reply',$5,$6,$7,$8) ON CONFLICT(parent_id) WHERE kind='reply' DO NOTHING`,[randomUUID(),sender.tenant_id,sender.id,parent.mailbox_id,parent.id,parent.pair_key,now,{subject:'Re: '+payload.subject,body:'This is the single consented N7 warmup test reply.'}])).rowCount??0;
   }
   return {status:'ready',created};
  });
 }
}
