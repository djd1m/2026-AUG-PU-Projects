import { createHash, randomUUID } from 'node:crypto';
import type { Pool,PoolClient } from 'pg';
import type { Identity } from '../auth/store.js';
import { HttpError } from '../errors.js';
import { decryptCredentials, type Keyring } from '../mailboxes/crypto.js';
import { boundedText,email,type MailboxInput } from '../mailboxes/input.js';
import { eligibilityTransaction } from './transaction.js';
export const POOL_DISCLOSURE_VERSION=1;
export const POOL_DISCLOSURE={version:1,peerVisible:['senderAddress','routingHeaders','testBody'],headers:['From','To','Subject','Message-ID'],testBody:'This is a consented N7 warmup test message.'};
function campaignInput(raw:Record<string,unknown>) {
  const content=boundedText(raw.content,20000);
  if(!Array.isArray(raw.recipients) || !raw.recipients.length || raw.recipients.length>1000) throw new HttpError(400,'invalid_recipients');
  const recipients=[...new Set(raw.recipients.map(email))].sort();
  return {content,recipients,fingerprint:createHash('sha256').update(JSON.stringify(recipients)).digest('hex')};
}
async function ownMailbox(client:PoolClient,identity:Identity,id:string) {
  const mailbox=(await client.query('SELECT * FROM mailbox WHERE tenant_id=$1 AND id=$2 FOR UPDATE',[identity.tenant_id,id])).rows[0];
  if(!mailbox) throw new HttpError(404,'not_found'); return mailbox;
}
export class ConsentStore {
  constructor(readonly pool:Pool,readonly ring:Keyring) {}
  async campaign(identity:Identity,raw:Record<string,unknown>,id?:string) {
    return eligibilityTransaction(this.pool,async client=>{
      const prior=id?(await client.query('SELECT * FROM campaign WHERE tenant_id=$1 AND id=$2 FOR UPDATE',[identity.tenant_id,id])).rows[0]:null;
      if(id && !prior) throw new HttpError(404,'not_found');
      const value=campaignInput(raw); const campaign=id??randomUUID();
      if(prior) {
        const changed=prior.content!==value.content || prior.recipient_fingerprint!==value.fingerprint;
        await client.query('UPDATE campaign SET content=$3,recipients=$4,recipient_fingerprint=$5,content_version=content_version+$6 WHERE tenant_id=$1 AND id=$2',[identity.tenant_id,id,value.content,JSON.stringify(value.recipients),value.fingerprint,changed?1:0]);
        if(changed) {
          await client.query('UPDATE consent SET revoked_at=now() WHERE tenant_id=$1 AND campaign_id=$2 AND revoked_at IS NULL',[identity.tenant_id,id]);
          await client.query("UPDATE send_job SET state='cancelled' WHERE tenant_id=$1 AND campaign_id=$2 AND state IN ('queued','claimed')",[identity.tenant_id,id]);
        }
      } else await client.query('INSERT INTO campaign(id,tenant_id,content,recipients,recipient_fingerprint) VALUES($1,$2,$3,$4,$5)',[campaign,identity.tenant_id,value.content,JSON.stringify(value.recipients),value.fingerprint]);
      return (await client.query('SELECT * FROM campaign WHERE tenant_id=$1 AND id=$2',[identity.tenant_id,campaign])).rows[0];
    });
  }
  async list(identity:Identity,id:string) {
    if(!(await this.pool.query('SELECT id FROM mailbox WHERE tenant_id=$1 AND id=$2',[identity.tenant_id,id])).rowCount) throw new HttpError(404,'not_found');
    return (await this.pool.query('SELECT * FROM consent WHERE tenant_id=$1 AND mailbox_id=$2 ORDER BY granted_at',[identity.tenant_id,id])).rows;
  }
  async act(identity:Identity,id:string,raw:Record<string,unknown>) {
    return eligibilityTransaction(this.pool,async client=>{
      const mailbox=await ownMailbox(client,identity,id);
      if(!['pool','campaign'].includes(raw.scope as string) || !['grant','revoke'].includes(raw.action as string)) throw new HttpError(400,'invalid_consent');
      const scope=raw.scope as string; let campaign=null;
      if(scope==='campaign') {
        campaign=(await client.query('SELECT * FROM campaign WHERE tenant_id=$1 AND id=$2 FOR UPDATE',[identity.tenant_id,typeof raw.campaignId==='string' && /^[0-9a-f-]{36}$/i.test(raw.campaignId)?raw.campaignId:null])).rows[0];
        if(!campaign) throw new HttpError(404,'not_found');
      }
      const campaignId=campaign?.id??null;
      if(raw.action==='grant') {
        if(raw.affirmative!==true || raw.scopeVersion!==(campaign?.content_version??POOL_DISCLOSURE_VERSION) || (campaign && raw.recipientFingerprint!==campaign.recipient_fingerprint)) throw new HttpError(400,'consent_snapshot_mismatch');
        if(!mailbox.credential_envelope) throw new HttpError(409,'mailbox_unconfigured');
      }
      await client.query('UPDATE consent SET revoked_at=now() WHERE tenant_id=$1 AND mailbox_id=$2 AND scope=$3 AND campaign_id IS NOT DISTINCT FROM $4::uuid AND revoked_at IS NULL',[identity.tenant_id,id,scope,campaignId]);
      if(scope==='pool') await client.query('DELETE FROM pool_member WHERE tenant_id=$1 AND mailbox_id=$2',[identity.tenant_id,id]);
      await client.query(`UPDATE send_job SET state='cancelled' WHERE state IN ('queued','claimed') AND
        ((tenant_id=$1 AND mailbox_id=$2 AND scope=$3 AND campaign_id IS NOT DISTINCT FROM $4::uuid) OR ($3='pool' AND scope='pool' AND recipient_mailbox_id=$2))`,[identity.tenant_id,id,scope,campaignId]);
      if(raw.action==='revoke') return {revoked:true};
      const consent=randomUUID();
      const disclosure=scope==='pool'?{...POOL_DISCLOSURE,senderAddress:decryptCredentials<MailboxInput>(mailbox.credential_envelope,identity.tenant_id,id,this.ring).senderAddress}:null;
      await client.query('INSERT INTO consent(id,tenant_id,mailbox_id,actor_id,scope,scope_version,campaign_id,recipient_fingerprint,disclosure) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)',[consent,identity.tenant_id,id,identity.account_id,scope,raw.scopeVersion,campaignId,campaign?.recipient_fingerprint??null,disclosure]);
      if(scope==='pool') await client.query('INSERT INTO pool_member(tenant_id,mailbox_id,consent_id) VALUES($1,$2,$3)',[identity.tenant_id,id,consent]);
      return {id:consent,scope,scopeVersion:raw.scopeVersion,disclosure};
    });
  }
  async current(identity:Identity,id:string,scope:'pool'|'campaign',campaignId?:string):Promise<boolean> {
    // Authority predicate only; verified_test never means real transport eligibility (F03).
    return (await this.pool.query(`SELECT c.id FROM consent c JOIN mailbox m ON m.id=c.mailbox_id
      LEFT JOIN campaign p ON p.id=c.campaign_id AND p.tenant_id=c.tenant_id
      WHERE c.tenant_id=$1 AND c.mailbox_id=$2 AND c.scope=$3 AND c.revoked_at IS NULL
      AND c.campaign_id IS NOT DISTINCT FROM $4::uuid AND
      ((c.scope='pool' AND c.scope_version=$5) OR (c.scope='campaign' AND c.scope_version=p.content_version AND c.recipient_fingerprint=p.recipient_fingerprint))`,[identity.tenant_id,id,scope,campaignId??null,POOL_DISCLOSURE_VERSION])).rowCount===1;
  }
}
