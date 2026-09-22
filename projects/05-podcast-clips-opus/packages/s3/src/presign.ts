// Адаптировано из .reference/jan-clone/packages/s3/src/presign.ts.
import { GetObjectCommand, UploadPartCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { PRESIGNED_SECONDS } from '@clipmaker/shared/upload';
import type { StorageContext } from './client.js';
export interface SignedPart { part_number: number; url: string; expires_at: string }
export async function signParts(ctx: StorageContext, key: string, uploadId: string, count: number, now: Date): Promise<SignedPart[]> {
  return Promise.all(Array.from({ length: count }, async (_, i) => ({ part_number: i + 1,
    url: await getSignedUrl(ctx.client, new UploadPartCommand({ Bucket: ctx.bucket, Key: key,
      UploadId: uploadId, PartNumber: i + 1 }), { expiresIn: PRESIGNED_SECONDS, signingDate: now }),
    expires_at: new Date(now.getTime() + PRESIGNED_SECONDS * 1000).toISOString(),
  })));
}
export function generateDownloadUrl(ctx: StorageContext, key: string): Promise<string> {
  return getSignedUrl(ctx.client, new GetObjectCommand({ Bucket: ctx.bucket, Key: key }), { expiresIn: PRESIGNED_SECONDS });
}
