// Copy/adapt N1 validation.ts SHA256 52bfa7c785ad7cff2258ca223aa76d839c4bb8a68bb0bb10edaed4e8996c3c0f.
// Retains bounded email/case/edge normalization and distinct local dots. N3a adds ASCII v1 grammar.
import { createHmac, createHash, randomBytes } from 'node:crypto';
import { OnboardingError } from '../../../../../packages/db/src/onboarding-contract';
export const EMAIL_MAX = 254;
export function normalizeIdentity(value: unknown): string {
  if (typeof value !== 'string') throw new OnboardingError('invalid_input');
  const email = value.replace(/^[ \t\r\n]+|[ \t\r\n]+$/g, '');
  if (!email || email.length > EMAIL_MAX || /[^\x21-\x7e]/.test(email)) throw new OnboardingError('invalid_input');
  const parts = email.split('@');
  const local = parts[0] ?? ''; const domain = parts[1] ?? '';
  if (parts.length !== 2 || local.length > 64 || !/^[A-Za-z0-9.!#$%&'*+\/=?^_`{|}~-]+$/.test(local)
    || local.startsWith('.') || local.endsWith('.') || local.includes('..')) throw new OnboardingError('invalid_input');
  const labels = domain.split('.');
  if (labels.length < 2 || labels.some(label => !/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?$/.test(label))) throw new OnboardingError('invalid_input');
  return email.toLowerCase();
}
export function hashIdentity(value: unknown, secret: Buffer): Buffer {
  if (!Buffer.isBuffer(secret) || secret.length < 32) throw new OnboardingError('unavailable');
  return createHmac('sha256', secret).update('n3a:identity:email:v1:').update(normalizeIdentity(value)).digest();
}
export function hashGrantToken(value: unknown): Buffer {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(value) || Buffer.from(value, 'base64url').toString('base64url') !== value) throw new OnboardingError('enrollment_unavailable');
  return createHash('sha256').update('n3a:enrollment:v1:').update(value).digest();
}
export function createGrantToken(): string { return randomBytes(32).toString('base64url'); }
