import { randomBytes } from 'node:crypto';
import { argon2id } from 'hash-wasm';
import { hmacSign, safeEqual } from '@grelka/secrets';

export interface ArgonParams {
  iterations: number;
  memorySize: number;
  hashLength: number;
  parallelism: number;
}

export const DEFAULT_PARAMS: ArgonParams = { iterations: 3, memorySize: 19456, hashLength: 32, parallelism: 1 };

export async function hashPassword(password: string, saltHex?: string, p: ArgonParams = DEFAULT_PARAMS): Promise<string> {
  const salt = saltHex ? Buffer.from(saltHex, 'hex') : randomBytes(16);
  const hash = await argon2id({ password, salt, ...p, outputType: 'binary' });
  return `a2id$${p.iterations}$${p.memorySize}$${p.hashLength}$${p.parallelism}$${salt.toString('hex')}$${Buffer.from(hash).toString('hex')}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split('$');
  if (parts.length !== 7 || parts[0] !== 'a2id') return false;
  const [, iters, mem, len, par, saltHex, hashHex] = parts as [string, string, string, string, string, string, string];
  const recomputed = await argon2id({
    password,
    salt: Buffer.from(saltHex!, 'hex'),
    iterations: Number(iters),
    memorySize: Number(mem),
    hashLength: Number(len),
    parallelism: Number(par),
    outputType: 'binary',
  });
  return safeEqual(Buffer.from(recomputed).toString('hex'), hashHex!);
}
