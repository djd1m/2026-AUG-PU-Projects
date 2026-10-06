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
 async tick(clock?:Date|(()=>Date)) {
  return eligibilityTransaction(this.pool,async client=>{
   const now=typeof clock==='function'?clock():clock??(await client.query('SELECT clock_timestamp() AS now')).rows[0].now as Date;
   const eligible=(await client.query(`SELECT m.id,m.tenant_id FROM mailbox m WHERE ${poolEligible} ORDER BY m.id LIMIT 1000`,[now])).rows;
   if(new Set(eligible.map(m=>m.tenant_id)).size<2) return {status:'waiting',created:0};
   let created=0;const day=now.toISOString().slice(0,10);
   // One deterministic pair per bounded tick. Replay advances neither thread nor quota.
   const capacity=(await client.query(`SELECT m.id FROM mailbox m WHERE ${poolEligible} AND (SELECT count(*) FROM send_job q WHERE q.mailbox_id=m.id AND q.reserved_day=$2::date AND q.state IN ('claimed','submitting','submitted','unknown'))<LEAST(m.daily_limit,m.provider_limit,30) ORDER BY m.id`,[now,day])).rows;
   const available=eligible.filter(m=>capacity.some(c=>c.id===m.id));
   const a=available[0];const b=a?available.find(m=>m.tenant_id!==a.tenant_id):undefined;
   if(!a || !b) return {status:'waiting',created:0};
   const pair=[a.id,b.id].sort().join(':')+':'+day;
   created+=(await client.query(`INSERT INTO send_job(id,tenant_id,mailbox_id,recipient_mailbox_id,scope,state,pair_key,due_at,payload) VALUES($1,$2,$3,$4,'pool','queued',$5,$6,$7) ON CONFLICT(pair_key) WHERE scope='pool' AND kind='initial' DO NOTHING`,[randomUUID(),a.tenant_id,a.id,b.id,pair,now,payload])).rowCount??0;
   const parents=(await client.query(`SELECT j.* FROM send_job j JOIN mailbox m ON m.id=j.recipient_mailbox_id WHERE j.scope='pool' AND j.kind='initial' AND j.state='submitted' AND ${poolEligible} AND EXISTS(SELECT 1 FROM mailbox m WHERE m.id=j.mailbox_id AND ${poolEligible}) ORDER BY j.id LIMIT 100`,[now])).rows;
   for(const parent of parents) {
    const sender=eligible.find(m=>m.id===parent.recipient_mailbox_id);if(!sender) continue;
    created+=(await client.query(`INSERT INTO send_job(id,tenant_id,mailbox_id,recipient_mailbox_id,scope,state,kind,parent_id,pair_key,due_at,payload) VALUES($1,$2,$3,$4,'pool','queued','reply',$5,$6,$7,$8) ON CONFLICT(parent_id) WHERE kind='reply' DO NOTHING`,[randomUUID(),sender.tenant_id,sender.id,parent.mailbox_id,parent.id,parent.pair_key,now,{subject:'Re: '+payload.subject,body:'This is the single consented N7 warmup test reply.'}])).rowCount??0;
   }
   return {status:'ready',created};
  });
 }
}
