import { randomUUID } from 'node:crypto';
import type { Pool } from 'pg';
import { checkCapacity } from '../billing/plans.js';
import { HttpError } from '../errors.js';
import { eligibilityTransaction } from '../consent/transaction.js';
import { encryptCredentials, decryptCredentials, type Envelope, type Keyring } from './crypto.js';
import { maskEmail, parseMailbox, dailyLimit, type MailboxInput } from './input.js';
import { resolveEndpoint, type Resolver } from './network.js';
import { localTestAdapter, verifyTest, type TestAdapter } from './provider.js';
export async function cancelMailbox(client:import('pg').PoolClient,id:string) {
  await client.query("UPDATE consent SET revoked_at=now() WHERE mailbox_id=$1 AND revoked_at IS NULL",[id]);
  await client.query('DELETE FROM pool_member WHERE mailbox_id=$1',[id]);
  await client.query("UPDATE send_job SET state='cancelled' WHERE (mailbox_id=$1 OR recipient_mailbox_id=$1) AND state IN ('queued','claimed')",[id]);
}
export class MailboxStore {
  constructor(readonly pool:Pool, readonly ring:Keyring, readonly allowlist:ReadonlyMap<string,number>, readonly resolver?:Resolver, readonly adapter:TestAdapter=localTestAdapter) {}
  async read(tenant:string,id:string) {
    const row=(await this.pool.query('SELECT id,label,state,metadata,daily_limit,provider_limit,LEAST(daily_limit,provider_limit,30) AS effective_limit FROM mailbox WHERE tenant_id=$1 AND id=$2',[tenant,id])).rows[0];
    if(!row) throw new HttpError(404,'not_found'); return row;
  }
  async list(tenant:string) { return (await this.pool.query('SELECT id,label,state,metadata,daily_limit,provider_limit,LEAST(daily_limit,provider_limit,30) AS effective_limit FROM mailbox WHERE tenant_id=$1 ORDER BY created_at,id',[tenant])).rows; }
  async save(tenant:string,raw:Record<string,unknown>,id?:string) {
    // Foreign resource identity must precede user validation/DNS; repeated under lock below.
    if(id) await eligibilityTransaction(this.pool,async client=>{ if(!(await client.query('SELECT id FROM mailbox WHERE tenant_id=$1 AND id=$2',[tenant,id])).rowCount) throw new HttpError(404,'not_found'); });
    const input=parseMailbox(raw);
    await resolveEndpoint(input.smtpHost,input.smtpPort,this.allowlist,this.resolver);
    await resolveEndpoint(input.imapHost,input.imapPort,this.allowlist,this.resolver);
    const mailbox=id??randomUUID(); const encrypted=encryptCredentials(input,tenant,mailbox,this.ring);
    const metadata={senderAddress:maskEmail(input.senderAddress),smtpHost:input.smtpHost,smtpPort:input.smtpPort,imapHost:input.imapHost,imapPort:993,requiredTLS:true,smtpUsername:'***',imapUsername:'***'};
    const cap=Math.min(this.allowlist.get(input.smtpHost)!,this.allowlist.get(input.imapHost)!,30);
    await eligibilityTransaction(this.pool,async client=>{
      if(id) {
        if(!(await client.query('SELECT id FROM mailbox WHERE tenant_id=$1 AND id=$2 FOR UPDATE',[tenant,id])).rowCount) throw new HttpError(404,'not_found');
        await cancelMailbox(client,id);
        await client.query("UPDATE mailbox SET label=$3,state='configured',credential_envelope=$4,metadata=$5,daily_limit=$6,provider_limit=$7 WHERE tenant_id=$1 AND id=$2",[tenant,id,input.label,encrypted,metadata,input.dailyLimit,cap]);
      } else { await checkCapacity(client,tenant,'mailboxes'); await client.query("INSERT INTO mailbox(id,tenant_id,label,state,credential_envelope,metadata,daily_limit,provider_limit) VALUES($1,$2,$3,'configured',$4,$5,$6,$7)",[mailbox,tenant,input.label,encrypted,metadata,input.dailyLimit,cap]); }
    });
    return this.read(tenant,mailbox);
  }
  async change(tenant:string,id:string,input:Record<string,unknown>) {
    await eligibilityTransaction(this.pool,async client=>{
      if(!(await client.query('SELECT id FROM mailbox WHERE tenant_id=$1 AND id=$2 FOR UPDATE',[tenant,id])).rowCount) throw new HttpError(404,'not_found');
      if(input.dailyLimit!==undefined) await client.query('UPDATE mailbox SET daily_limit=$3 WHERE tenant_id=$1 AND id=$2',[tenant,id,dailyLimit(input.dailyLimit)]);
      if(input.state!==undefined) {
        if(input.state!=='paused' && input.state!=='quarantined') throw new HttpError(400,'invalid_state');
        await cancelMailbox(client,id); await client.query('UPDATE mailbox SET state=$3 WHERE tenant_id=$1 AND id=$2',[tenant,id,input.state]);
      }
      if(input.dailyLimit===undefined && input.state===undefined) throw new HttpError(400,'invalid_input');
    }); return this.read(tenant,id);
  }
  async verify(tenant:string,id:string) {
    const row=await eligibilityTransaction(this.pool,async client=>(await client.query<{credential_envelope:Envelope;state:string}>('SELECT credential_envelope,state FROM mailbox WHERE tenant_id=$1 AND id=$2',[tenant,id])).rows[0]);
    if(!row) throw new HttpError(404,'not_found');
    const input=decryptCredentials<MailboxInput>(row.credential_envelope,tenant,id,this.ring);
    const state=await verifyTest(input,input,this.allowlist,this.adapter,this.resolver);
    await eligibilityTransaction(this.pool,async client=>{
      const current=(await client.query('SELECT credential_envelope,state FROM mailbox WHERE tenant_id=$1 AND id=$2 FOR UPDATE',[tenant,id])).rows[0];
      if(!current) throw new HttpError(404,'not_found');
      if(JSON.stringify(current.credential_envelope)!==JSON.stringify(row.credential_envelope) || !['configured','verified_test'].includes(current.state)) throw new HttpError(409,'mailbox_changed');
      await client.query('UPDATE mailbox SET state=$3 WHERE tenant_id=$1 AND id=$2',[tenant,id,state]);
    }); return this.read(tenant,id);
  }
}
