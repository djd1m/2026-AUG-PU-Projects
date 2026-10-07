import { createCipheriv, createDecipheriv, randomBytes, randomInt, createHmac, timingSafeEqual } from 'node:crypto';

const DATA_KEY_LEN = 32;
const NONCE_LEN = 12;
const TAG_LEN = 16;
const WRAPPED_KEY_LEN = DATA_KEY_LEN + TAG_LEN;

export function loadMasterKey(env: NodeJS.ProcessEnv = process.env): Buffer {
  const hex = env.MASTER_KEY;
  if (!hex || hex.length !== 64 || !/^[0-9a-fA-F]{64}$/.test(hex)) {
    throw new Error('MASTER_KEY: требуется 64 hex-символа (32 байта), ключ хранится ТОЛЬКО в env');
  }
  return Buffer.from(hex, 'hex');
}

export function generateMasterKeyHex(): string {
  return randomBytes(DATA_KEY_LEN).toString('hex');
}

export function encryptSecret(masterKey: Buffer, plaintext: string): Buffer {
  if (masterKey.length !== DATA_KEY_LEN) throw new Error('master key должен быть 32 байта');
  const dataKey = randomBytes(DATA_KEY_LEN);
  const nonceData = randomBytes(NONCE_LEN);
  const nonceWrap = randomBytes(NONCE_LEN);
  const wrap = createCipheriv('aes-256-gcm', masterKey, nonceWrap);
  const wrappedKey = Buffer.concat([wrap.update(dataKey), wrap.final(), wrap.getAuthTag()]);
  const cipher = createCipheriv('aes-256-gcm', dataKey, nonceData);
  const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final(), cipher.getAuthTag()]);
  dataKey.fill(0);
  return Buffer.concat([nonceData, nonceWrap, wrappedKey, ct]);
}

export function decryptSecret(masterKey: Buffer, envelope: Buffer): string {
  if (masterKey.length !== DATA_KEY_LEN) throw new Error('master key должен быть 32 байта');
  const nonceData = envelope.subarray(0, NONCE_LEN);
  const nonceWrap = envelope.subarray(NONCE_LEN, NONCE_LEN * 2);
  const wrappedKey = envelope.subarray(NONCE_LEN * 2, NONCE_LEN * 2 + WRAPPED_KEY_LEN);
  const ct = envelope.subarray(NONCE_LEN * 2 + WRAPPED_KEY_LEN);
  const unwrap = createDecipheriv('aes-256-gcm', masterKey, nonceWrap);
  unwrap.setAuthTag(wrappedKey.subarray(DATA_KEY_LEN));
  const dataKey = Buffer.concat([unwrap.update(wrappedKey.subarray(0, DATA_KEY_LEN)), unwrap.final()]);
  const decipher = createDecipheriv('aes-256-gcm', dataKey, nonceData);
  decipher.setAuthTag(ct.subarray(ct.length - TAG_LEN));
  const plain = Buffer.concat([decipher.update(ct.subarray(0, ct.length - TAG_LEN)), decipher.final()]);
  dataKey.fill(0);
  return plain.toString('utf8');
}

export function hmacSign(secret: Buffer, payload: Buffer | string): Buffer {
  return createHmac('sha256', secret).update(payload).digest();
}

export function safeEqual(a: Buffer | string, b: Buffer | string): boolean {
  const ba = Buffer.isBuffer(a) ? a : Buffer.from(a);
  const bb = Buffer.isBuffer(b) ? b : Buffer.from(b);
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}

export function randomIntInclusive(min: number, max: number): number {
  return randomInt(min, max + 1);
}

export function newIdHex(): string {
  return randomBytes(16).toString('hex');
}

export function uuid(): string {
  const b = randomBytes(16);
  b[6] = (b[6]! & 0x0f) | 0x40;
  b[8] = (b[8]! & 0x3f) | 0x80;
  const h = b.toString('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}
