import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { parseKeyring, type Keyring } from './mailboxes/crypto.js';
import { normalizeHost } from './mailboxes/network.js';
export interface Config { pollMode?:'disabled'|'local_test'; operatorTokenDigest?:Buffer|null; dispatchMode:'disabled'|'local_test'; databaseUrl: string; recipientHashKey: Buffer; sessionKey: Buffer; origin: string; port: number; secureCookie: boolean; credentialKeyring:Keyring; providerAllowlist:ReadonlyMap<string,number> }
export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  if (env.SAFETY_POLICY_VERSION !== 'n7-safety-v1') throw new Error('invalid_safety_policy');
  const encoded = env.SESSION_HMAC_KEY_FILE ? readFileSync(env.SESSION_HMAC_KEY_FILE, 'utf8').trim() : env.SESSION_HMAC_KEY;
  if (!encoded || !/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)) throw new Error('invalid_session_key');
  const sessionKey = Buffer.from(encoded, 'base64');
  if (sessionKey.length < 32 || sessionKey.toString('base64') !== encoded) throw new Error('invalid_session_key');
  const databaseUrl = env.DATABASE_URL ?? (env.DATABASE_PASSWORD_FILE ? `postgresql://${encodeURIComponent(env.DATABASE_USER ?? 'n7')}:{password}@${env.DATABASE_HOST ?? 'db'}:5432/${env.DATABASE_NAME ?? 'n7'}`.replace('{password}', encodeURIComponent(readFileSync(env.DATABASE_PASSWORD_FILE, 'utf8').trim())) : undefined);
  if (!databaseUrl || !/^postgres(?:ql)?:\/\//.test(databaseUrl)) throw new Error('invalid_database_config');
  const origin = env.APP_ORIGIN;
  if (!origin) throw new Error('invalid_origin');
  const url = new URL(origin);
  if (url.origin !== origin || !['http:', 'https:'].includes(url.protocol)) throw new Error('invalid_origin');
  if (url.protocol === 'http:' && !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)) throw new Error('insecure_origin');
  const port = Number(env.PORT ?? '3000');
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('invalid_port');
  let credentialKeyring:Keyring;
  try {
    if(!env.CREDENTIAL_KEYRING_FILE) throw new Error();
    credentialKeyring=parseKeyring(readFileSync(env.CREDENTIAL_KEYRING_FILE,'utf8'),sessionKey);
  } catch { throw new Error('invalid_credential_keyring'); }
  let recipientHashKey:Buffer;
  try {
    if(!env.RECIPIENT_HASH_KEY_FILE) throw new Error();
    const encodedHash=readFileSync(env.RECIPIENT_HASH_KEY_FILE,'utf8').trim();
    recipientHashKey=Buffer.from(encodedHash,'base64');
    if(recipientHashKey.length<32 || recipientHashKey.toString('base64')!==encodedHash || recipientHashKey.equals(sessionKey) || [...credentialKeyring.keys.values()].some(k=>k.equals(recipientHashKey))) throw new Error();
  } catch {throw new Error('invalid_recipient_hash_key');}
  const providerAllowlist=new Map<string,number>();
  try {
    const raw=JSON.parse(env.MAIL_PROVIDER_ALLOWLIST ?? '') as Record<string,number>;
    if(!raw || typeof raw!=='object' || Array.isArray(raw)) throw new Error();
    for(const [host,cap] of Object.entries(raw)) {
      const normalized=normalizeHost(host);
      if(!Number.isInteger(cap) || cap<1 || cap>30 || providerAllowlist.has(normalized)) throw new Error();
      providerAllowlist.set(normalized,cap);
    }
    if(!providerAllowlist.size || providerAllowlist.size>100) throw new Error();
  } catch { throw new Error('invalid_provider_allowlist'); }
  const dispatchMode=env.DISPATCH_MODE ?? 'disabled';
  if(dispatchMode!=='disabled' && dispatchMode!=='local_test') throw new Error('invalid_dispatch_mode');
  const pollMode=env.POLL_MODE ?? 'disabled';
  if(pollMode!=='disabled' && pollMode!=='local_test') throw new Error('invalid_poll_mode');
  let operatorTokenDigest:Buffer|null=null;
  if(env.OPERATOR_TOKEN_FILE) {
    try {
      const token=readFileSync(env.OPERATOR_TOKEN_FILE,'utf8').trim(),bytes=Buffer.from(token,'base64');
      if(token.length>249 || bytes.length<32 || bytes.toString('base64')!==token || bytes.equals(sessionKey) || bytes.equals(recipientHashKey) || [...credentialKeyring.keys.values()].some(k=>k.equals(bytes))) throw new Error();
      operatorTokenDigest=createHash('sha256').update(token).digest();
    } catch {throw new Error('invalid_operator_token');}
  }
  return { pollMode,operatorTokenDigest,dispatchMode, databaseUrl, recipientHashKey, sessionKey, credentialKeyring, providerAllowlist, origin, port, secureCookie: url.protocol === 'https:' };
}
