import { createHash,timingSafeEqual } from 'node:crypto';
import type { Pool,PoolClient } from 'pg';
import type { Config } from '../config.js';
import { eligibilityTransaction } from '../consent/transaction.js';
import { HttpError } from '../errors.js';
import { normalizeHost } from './network.js';
export type TransportCapability='smtp_submit'|'imap_headers'|'imap_body';
export interface TransportGrant {scope:'transport';tenant:string;mailbox:string;capabilities:TransportCapability[];smtpHost:string;smtpPort:465|587;imapHost:string;imapPort:993;mailboxTransportRevision:string;configFingerprint:string;expiresAt:string}
export interface TransportSnapshot {tenant:string;mailbox:string;revision:string;mailboxRevision:string;credentialEnvelope:unknown;grant:TransportGrant}
export const transportFingerprint=(allowlist:ReadonlyMap<string,number>)=>createHash('sha256').update(JSON.stringify(['n7-transport-v1',[...allowlist].sort()])).digest('hex');
const uuid=(x:unknown)=>typeof x==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(x);
export function parseTransportGrant(raw:unknown):TransportGrant {
 const g=raw as TransportGrant;
 if(!g||Object.keys(g).some(k=>!['scope','tenant','mailbox','capabilities','smtpHost','smtpPort','imapHost','imapPort','mailboxTransportRevision','configFingerprint','expiresAt'].includes(k))||g.scope!=='transport'||!uuid(g.tenant)||!uuid(g.mailbox)||!Array.isArray(g.capabilities)||!g.capabilities.length||g.capabilities.length>3||new Set(g.capabilities).size!==g.capabilities.length||g.capabilities.some(c=>!['smtp_submit','imap_headers','imap_body'].includes(c))||![465,587].includes(g.smtpPort)||g.imapPort!==993||typeof g.mailboxTransportRevision!=='string'||!/^(0|[1-9]\d{0,18})$/.test(g.mailboxTransportRevision)||!/^[a-f0-9]{64}$/.test(g.configFingerprint)||typeof g.expiresAt!=='string'||!Number.isFinite(Date.parse(g.expiresAt)))throw new HttpError(400,'invalid_transport_grant');
 return {...g,smtpHost:normalizeHost(g.smtpHost),imapHost:normalizeHost(g.imapHost),expiresAt:new Date(g.expiresAt).toISOString()};
}
export function operatorCapability(config:Config,token:string) {
 const digest=createHash('sha256').update(token).digest();
 if(!config.operatorTokenDigest||!timingSafeEqual(digest,config.operatorTokenDigest))throw new HttpError(403,'operator_denied');
}
export async function publishTransportGrant(pool:Pool,config:Config,token:string,tenant:string,mailbox:string,expectedRevision:string,raw:unknown|null) {
 operatorCapability(config,token);
 if(!uuid(tenant)||!uuid(mailbox)||!/^(0|[1-9]\d{0,18})$/.test(expectedRevision))throw new HttpError(400,'invalid_transport_grant');
 let grant:TransportGrant|null=null,invalid=false;
 try{if(raw!==null)grant=parseTransportGrant(raw);}catch{invalid=true;}
 const revision=await eligibilityTransaction(pool,async c=>{
  const m=(await c.query('SELECT transport_revision,metadata FROM mailbox WHERE tenant_id=$1 AND id=$2 FOR UPDATE',[tenant,mailbox])).rows[0];if(!m)throw new HttpError(404,'not_found');
  const prior=(await c.query('SELECT revision FROM transport_grant WHERE tenant_id=$1 AND mailbox_id=$2 FOR UPDATE',[tenant,mailbox])).rows[0];
  if((prior?.revision??'0')!==expectedRevision)throw new HttpError(409,'authority_changed');
  const now=(await c.query('SELECT clock_timestamp() AS now')).rows[0].now as Date;
  if(grant&&(grant.tenant!==tenant||grant.mailbox!==mailbox||grant.mailboxTransportRevision!==m.transport_revision||grant.configFingerprint!==transportFingerprint(config.providerAllowlist)||new Date(grant.expiresAt)<=now||new Date(grant.expiresAt).getTime()-now.getTime()>86400000||grant.smtpHost!==m.metadata.smtpHost||grant.smtpPort!==m.metadata.smtpPort||grant.imapHost!==m.metadata.imapHost||grant.imapPort!==m.metadata.imapPort||!config.providerAllowlist.has(grant.smtpHost)||!config.providerAllowlist.has(grant.imapHost))){invalid=true;grant=null;}
  const revision=(BigInt(expectedRevision)+1n).toString();
  await c.query(`INSERT INTO transport_grant(tenant_id,mailbox_id,revision,state,scope) VALUES($1,$2,$3,$4,$5) ON CONFLICT(mailbox_id) DO UPDATE SET revision=$3,state=$4,scope=$5`,[tenant,mailbox,revision,grant?'active':'revoked',grant]);
  await c.query('UPDATE mailbox_poll SET scan_complete=false,poll_owner=NULL WHERE mailbox_id=$1',[mailbox]);
  await c.query("UPDATE send_job SET state='cancelled' WHERE (mailbox_id=$1 OR recipient_mailbox_id=$1) AND state IN ('queued','claimed')",[mailbox]);
  return revision;
 });
 if(invalid)throw new HttpError(400,'invalid_transport_grant');return revision;
}
export async function authorizeTransport(c:PoolClient,config:Config,tenant:string,mailbox:string,capability:TransportCapability):Promise<TransportSnapshot> {
 const r=(await c.query(`SELECT m.transport_revision,m.credential_envelope,m.metadata,m.state,g.revision,g.state AS grant_state,g.scope FROM mailbox m LEFT JOIN transport_grant g ON g.mailbox_id=m.id AND g.tenant_id=m.tenant_id WHERE m.tenant_id=$1 AND m.id=$2 FOR UPDATE OF m`,[tenant,mailbox])).rows[0];
 const now=(await c.query('SELECT clock_timestamp() AS now')).rows[0].now as Date;
 const g=r?.scope as TransportGrant|null;
 if(!r||r.state!=='verified_test'||!r.credential_envelope||r.grant_state!=='active'||!g||g.scope!=='transport'||g.tenant!==tenant||g.mailbox!==mailbox||!g.capabilities.includes(capability)||g.mailboxTransportRevision!==r.transport_revision||g.configFingerprint!==transportFingerprint(config.providerAllowlist)||new Date(g.expiresAt)<=now||g.smtpHost!==r.metadata.smtpHost||g.smtpPort!==r.metadata.smtpPort||g.imapHost!==r.metadata.imapHost||g.imapPort!==r.metadata.imapPort)throw new HttpError(503,'transport_denied');
 return {tenant,mailbox,revision:r.revision,mailboxRevision:r.transport_revision,credentialEnvelope:r.credential_envelope,grant:g};
}
