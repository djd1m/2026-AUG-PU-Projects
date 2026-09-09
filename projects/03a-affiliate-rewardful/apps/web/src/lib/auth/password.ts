// Adapted from N1 password.ts; native wrapper retained, bounds/options are N3a-owned.
import { hash, verify, type Options } from '@node-rs/argon2';
import { randomBytes } from 'node:crypto';
import { KdfAdmission, processKdfAdmission } from './kdf-admission';

// Native const enums cannot be imported with isolatedModules: V0x13 is numeric 1.
export const ARGON_OPTIONS = { algorithm: 2, version: 1, memoryCost: 65_536,
  timeCost: 3, parallelism: 1, outputLen: 32 } as const satisfies Options;
export interface KdfAdapter {
  hash(password: string): Promise<string>;
  verify(stored: string, password: string): Promise<boolean>;
}
export const nativeKdf: KdfAdapter = {
  hash: (password) => hash(password, { ...ARGON_OPTIONS, salt: randomBytes(16) }),
  // Do not pass AbortSignal: dropping a JS result must not mask native completion.
  verify: (stored, password) => verify(stored, password, ARGON_OPTIONS),
};
export function isValidPassword(value: unknown): value is string {
  if (typeof value !== 'string' || value.length > 400 || Buffer.byteLength(value, 'utf8') > 800) return false;
  const points = Array.from(value).length;
  return points >= 8 && points <= 200;
}
export function isSupportedPasswordHash(value: unknown): value is string {
  if (typeof value !== 'string' || value.length > 200) return false;
  const matched = /^\$argon2id\$v=19\$m=65536,t=3,p=1\$([A-Za-z0-9+/]{22,86})\$([A-Za-z0-9+/]{43})$/.exec(value);
  if (!matched) return false;
  const salt = Buffer.from(matched[1]!, 'base64');
  const output = Buffer.from(matched[2]!, 'base64');
  return salt.length >= 16 && salt.length <= 64 && output.length === 32 &&
    salt.toString('base64').replace(/=+$/, '') === matched[1] &&
    output.toString('base64').replace(/=+$/, '') === matched[2];
}
export class PasswordService {
  private dummyPromise: Promise<string> | undefined;
  constructor(readonly admission: KdfAdmission = processKdfAdmission, private readonly adapter: KdfAdapter = nativeKdf) {}
  hashPassword(value: unknown, signal?: AbortSignal): Promise<string> {
    if (!isValidPassword(value)) return Promise.reject(new Error('invalid_input'));
    return this.admission.run(() => this.adapter.hash(value), signal);
  }
  async verifyPassword(stored: unknown, value: unknown, signal?: AbortSignal): Promise<boolean> {
    if (!isValidPassword(value) || !isSupportedPasswordHash(stored)) return false;
    return this.admission.run(() => this.verifyAdmitted(stored, value), signal);
  }
  /** Internal: credential workflow already owns admission; never nest queue acquisition. */
  async verifyAdmitted(stored: string, password: string): Promise<boolean> {
    try { return await this.adapter.verify(stored, password); }
    catch { console.error('password_verification_failed'); return false; }
  }
  initialize(): Promise<string> {
    // N1 dummy warm-up pattern; strong random bytes replace its Math.random seed.
    this.dummyPromise ??= this.hashPassword(randomBytes(32).toString('base64url'));
    return this.dummyPromise;
  }
}
export const processPasswordService = new PasswordService();
export const hashPassword = (value: unknown, signal?: AbortSignal): Promise<string> => processPasswordService.hashPassword(value, signal);
export const verifyPassword = (stored: unknown, value: unknown, signal?: AbortSignal): Promise<boolean> => processPasswordService.verifyPassword(stored, value, signal);
