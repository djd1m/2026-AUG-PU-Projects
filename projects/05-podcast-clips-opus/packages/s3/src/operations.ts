// Адаптировано из .reference/jan-clone/packages/s3/src/operations.ts. Повторы выполняет SDK.
import { HeadObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import type { StorageContext } from './client.js';
export async function headObject(ctx: StorageContext, key: string): Promise<bigint> {
  const result = await ctx.client.send(new HeadObjectCommand({ Bucket: ctx.bucket, Key: key }));
  if (!Number.isSafeInteger(result.ContentLength) || result.ContentLength! < 0) throw new Error('Хранилище не сообщило размер файла');
  return BigInt(result.ContentLength!);
}
export async function getObjectBytes(ctx: StorageContext, key: string, range = 'bytes=0-4095'): Promise<Uint8Array> {
  const result = await ctx.client.send(new GetObjectCommand({ Bucket: ctx.bucket, Key: key, Range: range }));
  if (!result.Body) throw new Error('Хранилище не вернуло байты файла');
  return result.Body.transformToByteArray();
}
export async function deleteObject(ctx: StorageContext, key: string): Promise<void> {
  await ctx.client.send(new DeleteObjectCommand({ Bucket: ctx.bucket, Key: key }));
}
