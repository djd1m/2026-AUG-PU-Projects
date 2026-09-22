// Адаптировано из .reference/jan-clone/packages/s3/src/presign.ts.
import { GetObjectCommand, UploadPartCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { PRESIGNED_SECONDS } from '@clipmaker/shared/upload';
import { publicSigningClient, type StorageContext } from './client.js';
export interface SignedPart { part_number: number; url: string; expires_at: string }
export async function signParts(ctx: StorageContext, key: string, uploadId: string, count: number | number[], now: Date): Promise<SignedPart[]> {
  const numbers = typeof count === 'number' ? Array.from({ length: count }, (_, i) => i + 1) : count;
  return Promise.all(numbers.map(async (part_number) => ({ part_number,
    url: await getSignedUrl(publicSigningClient(ctx), new UploadPartCommand({ Bucket: ctx.bucket, Key: key,
      UploadId: uploadId, PartNumber: part_number }), { expiresIn: PRESIGNED_SECONDS, signingDate: now }),
    expires_at: new Date(now.getTime() + PRESIGNED_SECONDS * 1000).toISOString(),
  })));
}
export function generateDownloadUrl(ctx: StorageContext, key: string, filename?: string): Promise<string> {
  const disposition = filename ? `attachment; filename="clip.mp4"; filename*=UTF-8''${encodeURIComponent(filename).replace(/['()*]/g, c => '%' + c.charCodeAt(0).toString(16))}` : undefined;
  return getSignedUrl(publicSigningClient(ctx), new GetObjectCommand({ Bucket: ctx.bucket, Key: key,
    ...(disposition ? { ResponseContentDisposition: disposition } : {}) }), { expiresIn: PRESIGNED_SECONDS });
}
