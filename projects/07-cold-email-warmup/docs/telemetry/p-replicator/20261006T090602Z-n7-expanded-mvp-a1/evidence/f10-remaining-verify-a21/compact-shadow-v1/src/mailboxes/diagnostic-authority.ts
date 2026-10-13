import { createHash } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import { eligibilityTransaction } from '../consent/transaction.js';
import { HttpError } from '../errors.js';
import { normalizeHost } from './network.js';
export interface DiagnosticGrant {scope:'diagnostics';tenant:string;mailbox:string;smtpHost:string;smtpPort:465|587;imapHost:string;imapPort:993;configFingerprint:string;expiresAt:string}
export interface Authority {authority_revision:string;state:string;expires_at:Date|null;scope:DiagnosticGrant|null;config_fingerprint:string|null}
export function configFingerprint(allowlist:ReadonlyMap<string,number>){return createHash('sha256').update(JSON.stringify(['n7-diagnostics-v1',[...allowlist].sort()])).digest('hex');}
export function parseGrant(value:unknown):DiagnosticGrant{
 const v=value as DiagnosticGrant;if(!v||v.scope!=='diagnostics'||!['tenant','mailbox'].every(k=>/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(v[k as 'tenant']))))throw new HttpError(400,'invalid_diagnostic_grant');
 if(!/^[a-f0-9]{64}$/.test(v.configFingerprint)||![465,587].includes(v.smtpPort)||v.imapPort!==993||typeof v.expiresAt!=='string'||!Number.isFinite(Date.parse(v.expiresAt)))throw new HttpError(400,'invalid_diagnostic_grant');
 return {scope:'diagnostics',tenant:v.tenant,mailbox:v.mailbox,smtpHost:normalizeHost(v.smtpHost),smtpPort:v.smtpPort,imapHost:normalizeHost(v.imapHost),imapPort:993,configFingerprint:v.configFingerprint,expiresAt:new Date(v.expiresAt).toISOString()};
}
export async function authority(client:PoolClient):Promise<Authority>{const row=(await client.query<Authority>('SELECT * FROM diagnostic_authority WHERE id=1 FOR UPDATE')).rows[0];if(!row)throw new HttpError(503,'live_provider_disabled');return row;}
export function grantMatches(a:Authority,tenant:string,id:string,metadata:Record<string,unknown>,fingerprint:string,now:Date){
 const g=a.scope;return a.state==='active'&&a.expires_at!==null&&a.expires_at>now&&g?.scope==='diagnostics'&&g.tenant===tenant&&g.mailbox===id&&a.config_fingerprint===fingerprint&&g.configFingerprint===fingerprint&&g.smtpHost===metadata.smtpHost&&g.smtpPort===metadata.smtpPort&&g.imapHost===metadata.imapHost&&g.imapPort===metadata.imapPort;
}
export async function publishAuthority(pool:Pool,expectedRevision:string,grant:DiagnosticGrant|null){
 if(!/^(?:0|[1-9]\d{0,18})$/.test(expectedRevision))throw new HttpError(400,'invalid_revision');
 const parsed=grant===null?null:parseGrant(grant);
 return eligibilityTransaction(pool,async client=>{
  const current=await authority(client);if(current.authority_revision!==expectedRevision)throw new HttpError(409,'authority_changed');
  const now=(await client.query('SELECT clock_timestamp() AS now')).rows[0].now as Date;
  if(parsed&&new Date(parsed.expiresAt)<=now)throw new HttpError(400,'invalid_diagnostic_grant');
  const row=(await client.query(`UPDATE diagnostic_authority SET authority_revision=authority_revision+1,state=$1,expires_at=$2,scope=$3,config_fingerprint=$4 WHERE id=1 RETURNING authority_revision`,[parsed?'active':'revoked',parsed?.expiresAt??null,parsed,parsed?.configFingerprint??null])).rows[0];return row.authority_revision as string;
 });
}
export const diagnosticProjection=(fingerprint:string)=>`jsonb_build_object('state',CASE
 WHEN a.state IS DISTINCT FROM 'active' OR a.expires_at<=clock_timestamp() THEN 'disabled'
 WHEN m.diagnostic_attempt IS NULL AND m.diagnostic_result IS NULL AND m.diagnostic_revision>0 THEN 'stale'
 WHEN m.diagnostic_attempt IS NULL AND m.diagnostic_result IS NULL THEN 'never_run'
 WHEN m.diagnostic_attempt IS NULL THEN 'stale'
 WHEN m.diagnostic_result IS NULL THEN 'pending'
 WHEN a.config_fingerprint<>'${fingerprint}' OR a.scope->>'scope'<>'diagnostics'
 OR m.diagnostic_result->>'authorityRevision'<>a.authority_revision::text OR m.diagnostic_result->>'revision'<>m.diagnostic_revision::text
 OR m.diagnostic_result->>'attempt'<>m.diagnostic_attempt::text OR m.diagnostic_result->>'configFingerprint'<>a.config_fingerprint
 OR m.state NOT IN ('configured','verified_test')
 OR a.scope->>'tenant'<>m.tenant_id::text OR a.scope->>'mailbox'<>m.id::text
 OR a.scope->>'smtpHost'<>m.metadata->>'smtpHost' OR a.scope->>'smtpPort'<>m.metadata->>'smtpPort'
 OR a.scope->>'imapHost'<>m.metadata->>'imapHost' OR a.scope->>'imapPort'<>m.metadata->>'imapPort' THEN 'stale'
 ELSE 'current' END,'result',m.diagnostic_result) AS diagnostics`;
