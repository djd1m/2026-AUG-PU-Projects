import { createWriteStream } from 'node:fs';
import { mkdtemp, rm, statfs } from 'node:fs/promises';
import { join } from 'node:path';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { GetObjectCommand } from '@aws-sdk/client-s3';
import type { StorageContext } from '@clipmaker/s3';
export const DOWNLOAD_TIMEOUT_MS = 10 * 60_000;
export const freeBytes = async (directory: string): Promise<bigint> => {
  const stats = await statfs(directory, { bigint: true }); return stats.bavail * stats.bsize;
};
export type Download = (key: string, file: string, expectedBytes: bigint) => Promise<void>;
export function s3Download(ctx: StorageContext): Download {
  return async (key, file, expectedBytes) => {
    const signal = AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS);
    const response = await ctx.client.send(new GetObjectCommand({ Bucket: ctx.bucket, Key: key }), { abortSignal: signal });
    if (!(response.Body instanceof Readable)) throw new Error('S3 не вернул поток');
    let bytes = 0n;
    const bounded = new Transform({ transform(chunk: Buffer, _encoding, callback) {
      bytes += BigInt(chunk.length);
      callback(bytes > expectedBytes ? new Error('Размер объекта изменился') : null, chunk);
    } });
    await pipeline(response.Body, bounded, createWriteStream(file, { flags: 'wx', mode: 0o600 }), { signal });
    if (bytes !== expectedBytes) throw new Error('Объект скачан не полностью');
  };
}
// Budget concurrent downloads within this worker process, in addition to statfs.
let reserved = 0n;
let reservationTail = Promise.resolve();
async function reserve(directory: string, bytes: bigint, available: typeof freeBytes): Promise<(() => void) | null> {
  const previous = reservationTail;
  let unlock!: () => void;
  reservationTail = new Promise<void>(resolve => { unlock = resolve; });
  await previous;
  try {
    const required = 3n * bytes;
    if (await available(directory) - reserved < required) return null;
    reserved += required;
    return () => { reserved -= required; };
  } finally { unlock(); }
}
export async function withSource<T>(directory: string, key: string, bytes: bigint, download: Download,
  work: (file: string) => Promise<T>, available = freeBytes): Promise<{ deferred: true } | { deferred: false; value: T }> {
  if (bytes <= 0n) throw new Error('Неизвестен размер оригинала');
  const release = await reserve(directory, bytes, available);
  if (!release) return { deferred: true };
  let tmp: string | undefined;
  try {
    tmp = await mkdtemp(join(directory, 'probe-'));
    const file = join(tmp, 'source');
    await download(key, file, bytes);
    return { deferred: false, value: await work(file) };
  } finally {
    try { if (tmp) await rm(tmp, { recursive: true, force: true }); } finally { release(); }
  }
}
