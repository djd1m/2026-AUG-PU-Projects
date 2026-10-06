// Adapted N3a password.ts + kdf-admission.ts; see reuse-implementation.md.
import { randomBytes } from 'node:crypto';
import { hash, verify } from '@node-rs/argon2';
import { HttpError } from '../errors.js';
export const ARGON_OPTIONS = { algorithm: 2, version: 1, memoryCost: 65536, timeCost: 3, parallelism: 1, outputLen: 32 } as const;
export function isValidPassword(value: unknown): value is string {
  if (typeof value !== 'string' || value.length > 400 || Buffer.byteLength(value, 'utf8') > 800) return false;
  const count = Array.from(value).length;
  return count >= 8 && count <= 200;
}
export function isSupportedHash(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const match = /^\$argon2id\$v=19\$m=65536,t=3,p=1\$([A-Za-z0-9+/]{22})\$([A-Za-z0-9+/]{43})$/.exec(value);
  return !!match && [match[1]!, match[2]!].every((v, i) => {
    const bytes = Buffer.from(v, 'base64');
    return bytes.length === (i === 0 ? 16 : 32) && bytes.toString('base64').replace(/=+$/, '') === v;
  });
}
export class KdfAdmission {
  private active = 0;
  get activeCount() { return this.active; }
  async run<T>(task: () => Promise<T>): Promise<T> {
    if (this.active >= 2) throw new HttpError(503, 'kdf_busy', 1);
    this.active++;
    try { return await task(); } finally { this.active--; }
  }
}
export const processKdfAdmission = new KdfAdmission();
export interface KdfAdapter { hash(value: string): Promise<string>; verify(stored: string, value: string): Promise<boolean> }
export const nativeKdf: KdfAdapter = {
  hash: value => hash(value, { ...ARGON_OPTIONS, salt: randomBytes(16) }),
  verify: (stored, value) => verify(stored, value, ARGON_OPTIONS),
};
export class PasswordService {
  constructor(readonly admission = processKdfAdmission, private readonly adapter = nativeKdf) {}
  async hash(value: unknown): Promise<string> {
    if (!isValidPassword(value)) throw new HttpError(400, 'invalid_input');
    return this.admission.run(() => this.adapter.hash(value));
  }
  async verify(stored: unknown, value: unknown): Promise<boolean> {
    if (!isValidPassword(value)) throw new HttpError(400, 'invalid_input');
    if (!isSupportedHash(stored)) return false;
    return this.admission.run(() => this.adapter.verify(stored, value));
  }
}
