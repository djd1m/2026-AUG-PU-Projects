import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { HttpError } from '../errors.js';
export interface Keyring { activeVersion: string; keys: ReadonlyMap<string, Buffer> }
export interface Envelope { version: string; nonce: string; tag: string; ciphertext: string }
const versionPattern = /^[A-Za-z0-9_-]{1,32}$/;
export function parseKeyring(encoded: string, sessionKey: Buffer): Keyring {
  try {
    const raw = JSON.parse(encoded) as {activeVersion: string; keys: Record<string,string>};
    if (!raw || !versionPattern.test(raw.activeVersion) || !raw.keys || typeof raw.keys !== 'object' || Array.isArray(raw.keys)) throw new Error();
    const keys = new Map<string,Buffer>();
    for (const [version, value] of Object.entries(raw.keys)) {
      if (!versionPattern.test(version) || typeof value !== 'string') throw new Error();
      const key = Buffer.from(value, 'base64');
      if (key.length !== 32 || key.toString('base64') !== value || key.equals(sessionKey) || [...keys.values()].some(k=>k.equals(key))) throw new Error();
      keys.set(version, key);
    }
    if (!keys.has(raw.activeVersion) || keys.size > 32) throw new Error();
    return {activeVersion: raw.activeVersion, keys};
  } catch { throw new Error('invalid_credential_keyring'); }
}
function aad(tenant: string, mailbox: string, version: string) { return Buffer.from(JSON.stringify(['n7-mailbox-v1',tenant,mailbox,version])); }
export function encryptCredentials(value: unknown, tenant: string, mailbox: string, ring: Keyring): Envelope {
  const version = ring.activeVersion; const key = ring.keys.get(version);
  if (!key) throw new HttpError(503, 'credential_unavailable');
  const nonce = randomBytes(12); const cipher = createCipheriv('aes-256-gcm', key, nonce);
  cipher.setAAD(aad(tenant, mailbox, version));
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(value),'utf8'),cipher.final()]);
  return {version,nonce:nonce.toString('base64'),tag:cipher.getAuthTag().toString('base64'),ciphertext:ciphertext.toString('base64')};
}
export function decryptCredentials<T>(envelope: Envelope, tenant: string, mailbox: string, ring: Keyring): T {
  try {
    const key = ring.keys.get(envelope.version); if (!key) throw new Error();
    const decode = (value: string, size?: number) => {
      const data = Buffer.from(value,'base64');
      if (data.toString('base64') !== value || (size !== undefined && data.length !== size)) throw new Error();
      return data;
    };
    const decipher = createDecipheriv('aes-256-gcm',key,decode(envelope.nonce,12));
    decipher.setAAD(aad(tenant,mailbox,envelope.version)); decipher.setAuthTag(decode(envelope.tag,16));
    return JSON.parse(Buffer.concat([decipher.update(decode(envelope.ciphertext)),decipher.final()]).toString('utf8')) as T;
  } catch { throw new HttpError(503,'credential_unavailable'); }
}
