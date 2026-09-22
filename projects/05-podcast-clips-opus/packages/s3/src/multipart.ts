// Адаптировано из .reference/jan-clone/packages/s3/src/multipart.ts.
import { CreateMultipartUploadCommand, CompleteMultipartUploadCommand, AbortMultipartUploadCommand,
  ListPartsCommand } from '@aws-sdk/client-s3';
import { MAX_UPLOAD_BYTES } from '@clipmaker/shared/upload';
import type { StorageContext } from './client.js';
export interface CompletedPart { part_number: number; etag: string }
export class UploadTooLarge extends Error {}
export function calculatePartSize(fileSize: number): number {
  if (!Number.isSafeInteger(fileSize) || fileSize <= 0 || fileSize > MAX_UPLOAD_BYTES) throw new Error('Непригодный размер файла');
  return Math.max(10 * 1024 * 1024, Math.ceil(fileSize / 100));
}
export async function initiateMultipartUpload(ctx: StorageContext, key: string): Promise<string> {
  const result = await ctx.client.send(new CreateMultipartUploadCommand({ Bucket: ctx.bucket, Key: key,
    ContentType: 'application/octet-stream' }));
  if (!result.UploadId) throw new Error('Хранилище не выдало идентификатор загрузки');
  return result.UploadId;
}
export async function completeMultipartUpload(ctx: StorageContext, key: string, uploadId: string, parts: CompletedPart[]): Promise<void> {
  const sorted = [...parts].sort((a, b) => a.part_number - b.part_number);
  if (!sorted.length || sorted.some((p, i) => p.part_number !== i + 1 || !p.etag)) throw new Error('Непригодный список частей');
  // Размеры сообщает S3, а не клиент. Проходим все страницы, сверяем ETag.
  const listed = new Map<number, { etag: string; size: number }>();
  let marker: string | undefined;
  let total = 0n;
  do {
    const result = await ctx.client.send(new ListPartsCommand({ Bucket: ctx.bucket, Key: key,
      UploadId: uploadId, PartNumberMarker: marker }));
    for (const p of result.Parts ?? []) {
      if (!p.PartNumber || !p.ETag || !Number.isSafeInteger(p.Size) || p.Size! < 0) throw new Error('Хранилище не сообщило размер части');
      listed.set(p.PartNumber, { etag: p.ETag, size: p.Size! });
      total += BigInt(p.Size!);
      if (total > BigInt(MAX_UPLOAD_BYTES)) throw new UploadTooLarge('Файл больше 2 000 000 000 байт');
    }
    const next = result.IsTruncated ? result.NextPartNumberMarker : undefined;
    if (result.IsTruncated && (!next || next === marker)) throw new Error('Непригодная страница частей');
    marker = next;
  } while (marker);
  if (listed.size !== sorted.length || sorted.some((p) => listed.get(p.part_number)?.etag !== p.etag)) {
    throw new Error('Список частей не совпадает с хранилищем');
  }
  await ctx.client.send(new CompleteMultipartUploadCommand({ Bucket: ctx.bucket, Key: key, UploadId: uploadId,
    MultipartUpload: { Parts: sorted.map((p) => ({ PartNumber: p.part_number, ETag: p.etag })) } }));
}
export async function abortMultipartUpload(ctx: StorageContext, key: string, uploadId: string): Promise<void> {
  try { await ctx.client.send(new AbortMultipartUploadCommand({ Bucket: ctx.bucket, Key: key, UploadId: uploadId })); }
  catch (error) { if (!(error instanceof Error && error.name === 'NoSuchUpload')) throw error; }
}
