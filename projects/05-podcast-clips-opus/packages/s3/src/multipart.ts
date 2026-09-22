// Адаптировано из .reference/jan-clone/packages/s3/src/multipart.ts.
import { CreateMultipartUploadCommand, CompleteMultipartUploadCommand, AbortMultipartUploadCommand,
  ListPartsCommand } from '@aws-sdk/client-s3';
import { MAX_UPLOAD_BYTES } from '@clipmaker/shared/upload';
import { FAST_REQUEST_TIMEOUT_MS, type StorageContext } from './client.js';
import { assertMultipartLifecycle } from './lifecycle.js';
export interface CompletedPart { part_number: number; etag: string }
export class UploadTooLarge extends Error {}
export function calculatePartSize(fileSize: number): number {
  if (!Number.isSafeInteger(fileSize) || fileSize <= 0 || fileSize > MAX_UPLOAD_BYTES) throw new Error('Непригодный размер файла');
  return Math.max(10 * 1024 * 1024, Math.ceil(fileSize / 100));
}
export async function initiateMultipartUpload(ctx: StorageContext, key: string): Promise<string> {
  await assertMultipartLifecycle(ctx);
  const result = await ctx.client.send(new CreateMultipartUploadCommand({ Bucket: ctx.bucket, Key: key,
    ContentType: 'application/octet-stream' }), { requestTimeout: FAST_REQUEST_TIMEOUT_MS });
  if (!result.UploadId) throw new Error('Хранилище не выдало идентификатор загрузки');
  return result.UploadId;
}
export async function listUploadedParts(ctx: StorageContext, key: string, uploadId: string): Promise<CompletedPart[]> {
  // Размеры сообщает S3, а не клиент. Проходим все страницы, сверяем ETag.
  const listed = new Map<number, { etag: string; size: number }>();
  let marker: string | undefined;
  let total = 0n;
  do {
    const result = await ctx.client.send(new ListPartsCommand({ Bucket: ctx.bucket, Key: key,
      UploadId: uploadId, PartNumberMarker: marker }), { requestTimeout: FAST_REQUEST_TIMEOUT_MS });
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
  return [...listed].map(([part_number, part]) => ({ part_number, etag: part.etag })).sort((a, b) => a.part_number - b.part_number);
}
// Склейка до 2 ГБ / 100 частей может занимать минуты. 5 минут на команду,
// включая до 3 попыток SDK и чтение тела после 200 headers; не SLA Cloud.ru.
export const COMPLETE_REQUEST_TIMEOUT_MS = 5 * 60_000;
export async function completeMultipartUpload(ctx: StorageContext, key: string, uploadId: string, parts: CompletedPart[]): Promise<void> {
  const sorted = [...parts].sort((a, b) => a.part_number - b.part_number);
  if (!sorted.length || sorted.some((p, i) => p.part_number !== i + 1 || !p.etag)) throw new Error('Непригодный список частей');
  const listed = new Map((await listUploadedParts(ctx, key, uploadId)).map((p) => [p.part_number, p]));
  if (listed.size !== sorted.length || sorted.some((p) => listed.get(p.part_number)?.etag !== p.etag)) {
    throw new Error('Список частей не совпадает с хранилищем');
  }
  await ctx.client.send(new CompleteMultipartUploadCommand({ Bucket: ctx.bucket, Key: key, UploadId: uploadId,
    MultipartUpload: { Parts: sorted.map((p) => ({ PartNumber: p.part_number, ETag: p.etag })) } }),
    { requestTimeout: COMPLETE_REQUEST_TIMEOUT_MS, abortSignal: AbortSignal.timeout(COMPLETE_REQUEST_TIMEOUT_MS) });
}
export async function abortMultipartUpload(ctx: StorageContext, key: string, uploadId: string): Promise<void> {
  try { await ctx.client.send(new AbortMultipartUploadCommand({ Bucket: ctx.bucket, Key: key, UploadId: uploadId }), { requestTimeout: FAST_REQUEST_TIMEOUT_MS }); }
  catch (error) { if (!(error instanceof Error && error.name === 'NoSuchUpload')) throw error; }
}
