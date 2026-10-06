import { randomUUID } from 'node:crypto';
import type { Pool } from 'pg';
import { HttpError } from '../errors.js';
import { eligibilityTransaction } from '../consent/transaction.js';
import { decryptCredentials, type Envelope, type Keyring } from './crypto.js';
import { parseMailbox, type MailboxInput } from './input.js';
import { authority,configFingerprint,grantMatches } from './diagnostic-authority.js';
import { admitDiagnostic,diagnose, type DiagnosticResults } from './diagnostics.js';
import { productionChannel,type ChannelFactory } from './diagnostic-channel.js';
interface Snapshot {credential_envelope:Envelope;metadata:Record<string,unknown>;diagnostic_revision:string;state:string;diagnostic_attempt:string}
export class DiagnosticStore {
 readonly fingerprint:string;
 constructor(readonly pool:Pool,readonly ring:Keyring,readonly allowlist:ReadonlyMap<string,number>,private factory:ChannelFactory=productionChannel,private mode:'live_provider'|'protocol_fixture'='live_provider'){this.fingerprint=configFingerprint(allowlist);}
 async run(tenant:string,id:string,signal:AbortSignal){
  // Ownership before admission or authority; unavailable grant never decrypts or resolves.
  if(!(await this.pool.query('SELECT id FROM mailbox WHERE tenant_id=$1 AND id=$2',[tenant,id])).rowCount)throw new HttpError(404,'not_found');
  let release:()=>void;try{release=admitDiagnostic(id);}catch{throw new HttpError(429,'diagnostic_busy');}
  let input:MailboxInput|undefined;let owned:{revision:string;attempt:string}|undefined;
  try{
   const snapshot=await eligibilityTransaction(this.pool,async client=>{
    const grant=await authority(client);
    const row=(await client.query<Snapshot>('SELECT credential_envelope,metadata,diagnostic_revision,state,diagnostic_attempt FROM mailbox WHERE tenant_id=$1 AND id=$2 FOR UPDATE',[tenant,id])).rows[0];if(!row)throw new HttpError(404,'not_found');
    const now=(await client.query('SELECT clock_timestamp() AS now')).rows[0].now as Date;
    if(!grantMatches(grant,tenant,id,row.metadata,this.fingerprint,now))throw new HttpError(503,'live_provider_disabled');
    if(!['configured','verified_test'].includes(row.state))throw new HttpError(409,'mailbox_changed');
    const attempt=randomUUID();const revision=(await client.query('UPDATE mailbox SET diagnostic_revision=diagnostic_revision+1,diagnostic_attempt=$3,diagnostic_result=NULL WHERE tenant_id=$1 AND id=$2 RETURNING diagnostic_revision',[tenant,id,attempt])).rows[0].diagnostic_revision as string;
    return {...row,diagnostic_revision:revision,diagnostic_attempt:attempt,authorityRevision:grant.authority_revision};
   });
   owned={revision:snapshot.diagnostic_revision,attempt:snapshot.diagnostic_attempt};
   const decoded=decryptCredentials<MailboxInput>(snapshot.credential_envelope,tenant,id,this.ring);
   input=parseMailbox({...decoded,requiredTLS:true});
   const outcomes=await diagnose(input,this.allowlist,signal,this.factory);
   if(signal.aborted)throw new HttpError(409,'diagnostic_cancelled');
   await this.finish(tenant,id,snapshot,outcomes,signal);
   return outcomes;
  }catch(error){
   if(owned)await eligibilityTransaction(this.pool,async client=>{await client.query('UPDATE mailbox SET diagnostic_attempt=NULL WHERE tenant_id=$1 AND id=$2 AND diagnostic_revision=$3 AND diagnostic_attempt=$4',[tenant,id,owned!.revision,owned!.attempt]);});
   throw error;
  }finally{input=undefined;release();}
 }
 private async finish(tenant:string,id:string,snapshot:Snapshot&{authorityRevision:string},outcomes:DiagnosticResults,signal:AbortSignal){
  const checkCancelled=()=>{if(signal.aborted)throw new HttpError(409,'diagnostic_cancelled');};
  return eligibilityTransaction(this.pool,async client=>{
   checkCancelled(); // The FIRST global lock may have waited after protocol completion.
   const grant=await authority(client);const row=(await client.query<Snapshot>('SELECT metadata,diagnostic_revision,diagnostic_attempt,state FROM mailbox WHERE tenant_id=$1 AND id=$2 FOR UPDATE',[tenant,id])).rows[0];
   if(!row)throw new HttpError(404,'not_found');const now=(await client.query('SELECT clock_timestamp() AS now')).rows[0].now as Date;
   if(!grantMatches(grant,tenant,id,row.metadata,this.fingerprint,now)||grant.authority_revision!==snapshot.authorityRevision)throw new HttpError(503,'live_provider_disabled');
   if(row.diagnostic_revision!==snapshot.diagnostic_revision||row.diagnostic_attempt!==snapshot.diagnostic_attempt||!['configured','verified_test'].includes(row.state))throw new HttpError(409,'mailbox_changed');
   const result={smtp:outcomes.smtp,imap:outcomes.imap,evidenceMode:this.mode,checkedAt:now.toISOString(),revision:snapshot.diagnostic_revision,attempt:snapshot.diagnostic_attempt,authorityRevision:snapshot.authorityRevision,configFingerprint:this.fingerprint};
   await client.query('UPDATE mailbox SET diagnostic_result=$3 WHERE tenant_id=$1 AND id=$2',[tenant,id,result]);
   checkCancelled(); // Roll back if cancellation arrived during awaited persistence.
  },checkCancelled);
 }
}
