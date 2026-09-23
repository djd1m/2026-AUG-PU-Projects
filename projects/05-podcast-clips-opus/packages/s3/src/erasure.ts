import { ListObjectsV2Command, ListMultipartUploadsCommand, GetBucketVersioningCommand } from '@aws-sdk/client-s3';
import { FAST_REQUEST_TIMEOUT_MS, type StorageContext } from './client.js';
import { abortMultipartUpload } from './multipart.js';
import { deleteObject } from './operations.js';

// Fail closed: a delete marker would conceal retained versions, not erase data.
export async function erasePrefix(ctx: StorageContext, prefix: string): Promise<void> {
  if (!prefix.endsWith('/') || !/^(videos|clips\/free|clips\/paid|thumbs)\/[a-f0-9-]{36}\/$/.test(prefix)) throw new Error('Непригодный префикс удаления');
  const options = { requestTimeout: FAST_REQUEST_TIMEOUT_MS, abortSignal: AbortSignal.timeout(60_000) };
  const versioning = await ctx.client.send(new GetBucketVersioningCommand({ Bucket: ctx.bucket }), options);
  if (versioning.Status) throw new Error('Для удаления требуется бакет без версионирования');
  let keyMarker: string | undefined, uploadIdMarker: string | undefined;
  do {
    const page = await ctx.client.send(new ListMultipartUploadsCommand({ Bucket: ctx.bucket, Prefix: prefix, KeyMarker: keyMarker, UploadIdMarker: uploadIdMarker }), options);
    for (const upload of page.Uploads ?? []) {
      if (!upload.Key?.startsWith(prefix) || !upload.UploadId) throw new Error('Непригодный список multipart');
      await abortMultipartUpload(ctx, upload.Key, upload.UploadId);
    }
    if (page.IsTruncated && (!page.NextKeyMarker || page.NextKeyMarker === keyMarker && page.NextUploadIdMarker === uploadIdMarker)) throw new Error('Непригодная пагинация multipart');
    keyMarker = page.IsTruncated ? page.NextKeyMarker : undefined;
    uploadIdMarker = page.NextUploadIdMarker;
  } while (keyMarker);
  // Re-read the first page after deletion: never skip a key as the collection shrinks.
  for (;;) {
    const page = await ctx.client.send(new ListObjectsV2Command({ Bucket: ctx.bucket, Prefix: prefix, MaxKeys: 100 }), options);
    if (!page.Contents?.length) {
      if (page.IsTruncated) throw new Error('Пустая незавершённая страница объектов');
      return;
    }
    for (const object of page.Contents) {
      if (!object.Key?.startsWith(prefix)) throw new Error('Непригодный ключ объекта');
      await deleteObject(ctx, object.Key);
    }
  }
}
