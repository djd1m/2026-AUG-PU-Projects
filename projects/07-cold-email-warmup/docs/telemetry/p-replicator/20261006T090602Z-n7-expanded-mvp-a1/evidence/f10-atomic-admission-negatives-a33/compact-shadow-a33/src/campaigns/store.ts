import { createHmac,randomUUID } from 'node:crypto';
import type { Pool } from 'pg';
import type { Identity } from '../auth/store.js';
import { checkCapacity } from '../billing/plans.js';
import { HttpError } from '../errors.js';
import { eligibilityTransaction } from '../consent/transaction.js';
import { encryptCredentials,decryptCredentials,type Envelope,type Keyring } from '../mailboxes/crypto.js';
import { parseCampaign,render,type Step } from './input.js';
export function recipientDigest(address:string,key:Buffer) {return createHmac('sha256',key).update(address.trim().toLowerCase()).digest('hex');}
// Reuse F02 versioned AEAD with a separate purpose-prefixed AAD domain.
export function sealRecipient(address:string,tenant:string,id:string,ring:Keyring) {return encryptCredentials(address,`n7-enrollment-v1:${tenant}`,id,ring);}
export function openRecipient(envelope:Envelope,tenant:string,id:string,ring:Keyring) {return decryptCredentials<string>(envelope,`n7-enrollment-v1:${tenant}`,id,ring);}
export class CampaignStore {
 constructor(readonly pool:Pool,readonly ring:Keyring,readonly hashKey:Buffer) {}
 async read(tenant:string,id:string) {
  const row=(await this.pool.query('SELECT * FROM campaign WHERE tenant_id=$1 AND id=$2',[tenant,id])).rows[0];
  if(!row) throw new HttpError(404,'not_found');return row;
 }
 async list(tenant:string) {return (await this.pool.query('SELECT * FROM campaign WHERE tenant_id=$1 ORDER BY id',[tenant])).rows;}
 async preview(tenant:string,id:string) {
  const row=await this.read(tenant,id);const value=parseCampaign({steps:row.steps,recipients:row.recipients.map((address:string)=>({address,fields:row.personalization[address]??{}}))});
  return value.recipients.map(address=>({address,steps:value.steps.map(step=>render(step,value.personalization[address]!))}));
 }
 async start(identity:Identity,id:string,raw:Record<string,unknown>,now=new Date()) {
  return eligibilityTransaction(this.pool,async client=>{
   const row=(await client.query('SELECT * FROM campaign WHERE tenant_id=$1 AND id=$2 FOR UPDATE',[identity.tenant_id,id])).rows[0];
   if(!row) throw new HttpError(404,'not_found');
   const value=parseCampaign({steps:row.steps,recipients:row.recipients.map((address:string)=>({address,fields:row.personalization[address]??{}}))});
   if(!Array.isArray(raw.mailboxIds) || !raw.mailboxIds.length || raw.mailboxIds.length>100 || raw.mailboxIds.some(x=>typeof x!=='string' || !/^[0-9a-f-]{36}$/i.test(x))) throw new HttpError(400,'invalid_mailboxes');
   const ids=[...new Set(raw.mailboxIds as string[])].sort();
   for(const mailbox of ids) {
    const owned=(await client.query('SELECT id FROM mailbox WHERE tenant_id=$1 AND id=$2',[identity.tenant_id,mailbox])).rowCount;
    if(!owned) throw new HttpError(404,'not_found');
    const consent=await client.query(`SELECT id FROM consent WHERE tenant_id=$1 AND mailbox_id=$2 AND campaign_id=$3 AND scope='campaign' AND revoked_at IS NULL AND scope_version=$4 AND recipient_fingerprint=$5`,[identity.tenant_id,mailbox,id,row.content_version,row.recipient_fingerprint]);
    if(!consent.rowCount) throw new HttpError(409,'consent_required');
   }
   if(row.state!=='active') await checkCapacity(client,identity.tenant_id,'activeCampaigns');
   let created=0;let recipientIndex=0;
   for(const address of value.recipients) {
    const digest=recipientDigest(address,this.hashKey);const enrollment=randomUUID();
    await client.query(`INSERT INTO enrollment(id,tenant_id,campaign_id,campaign_version,recipient_envelope,recipient_hash,fields) VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(campaign_id,campaign_version,recipient_hash) DO NOTHING`,[enrollment,identity.tenant_id,id,row.content_version,sealRecipient(address,identity.tenant_id,enrollment,this.ring),digest,value.personalization[address]]);
    const existing=(await client.query('SELECT id,state FROM enrollment WHERE campaign_id=$1 AND campaign_version=$2 AND recipient_hash=$3',[id,row.content_version,digest])).rows[0];
    const suppressed=(await client.query('SELECT 1 FROM suppression WHERE tenant_id=$1 AND recipient_hash=$2',[identity.tenant_id,digest])).rowCount;
    if(existing.state!=='active' || suppressed) continue;
    let due=now.getTime();const mailbox=ids[recipientIndex++%ids.length]!;
    for(const [index,step] of value.steps.entries()) {
     if(index>0) due+=step.delayHours*3600000;
     const rendered=render(step as Step,value.personalization[address]!);
     created+=(await client.query(`INSERT INTO send_job(id,tenant_id,mailbox_id,scope,campaign_id,enrollment_id,campaign_version,step,state,due_at,payload) VALUES($1,$2,$3,'campaign',$4,$5,$6,$7,'queued',$8,$9) ON CONFLICT(campaign_id,enrollment_id,step) WHERE enrollment_id IS NOT NULL DO NOTHING`,[randomUUID(),identity.tenant_id,mailbox,id,existing.id,row.content_version,index,new Date(due),{subject:rendered.subject,body:rendered.body}])).rowCount??0;
    }
   }
   if(row.state==='paused') await client.query("UPDATE send_job j SET state='queued' WHERE j.tenant_id=$1 AND j.campaign_id=$2 AND j.campaign_version=$3 AND j.state='cancelled' AND j.mailbox_id=ANY($4::uuid[]) AND EXISTS(SELECT 1 FROM enrollment e WHERE e.id=j.enrollment_id AND e.state='active' AND NOT EXISTS(SELECT 1 FROM suppression x WHERE x.tenant_id=e.tenant_id AND x.recipient_hash=e.recipient_hash))",[identity.tenant_id,id,row.content_version,ids]);
   await client.query("UPDATE campaign SET state='active' WHERE tenant_id=$1 AND id=$2",[identity.tenant_id,id]);return {created,state:'active'};
  });
 }
 async pause(tenant:string,id:string) {
  return eligibilityTransaction(this.pool,async client=>{
   if(!(await client.query("UPDATE campaign SET state='paused' WHERE tenant_id=$1 AND id=$2 RETURNING id",[tenant,id])).rowCount) throw new HttpError(404,'not_found');
   await client.query("UPDATE send_job SET state='cancelled' WHERE tenant_id=$1 AND campaign_id=$2 AND state IN ('queued','claimed')",[tenant,id]);return {state:'paused'};
  });
 }
}
