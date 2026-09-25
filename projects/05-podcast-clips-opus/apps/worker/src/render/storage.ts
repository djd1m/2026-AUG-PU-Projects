import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { PutObjectCommand, HeadObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import type { StorageContext } from '@clipmaker/s3';
export interface RenderStorage {
  delete(key: string): Promise<void>;
  put(key: string, path: string, contentType: string, contract: string, signal: AbortSignal): Promise<number>;
}
export function renderStorage(ctx: StorageContext): RenderStorage {
  return {
    async delete(key) { await ctx.client.send(new DeleteObjectCommand({ Bucket: ctx.bucket, Key: key })); },
    async put(key, path, contentType, contract, signal) {
      const size = (await stat(path)).size, body = createReadStream(path);
      try {
        // Storage enforces immutability even if PostgreSQL loses its transaction lock.
        await ctx.client.send(new PutObjectCommand({ Bucket: ctx.bucket, Key: key, Body: body, ContentLength: size,
          ContentType: contentType, IfNoneMatch: '*', Metadata: { 'n5-render-contract': contract } }), { abortSignal: signal });
        return size;
      } catch (error) {
        const status = (error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode;
        if (status !== 412) throw error;
        // A lost DB acknowledgement may leave a fully uploaded object. Adopt only the
        // exact same render contract; a different source/font/plan/origin is a refusal.
        const existing = await ctx.client.send(new HeadObjectCommand({ Bucket: ctx.bucket, Key: key }), { abortSignal: signal });
        if (existing.Metadata?.['n5-render-contract'] !== contract || existing.ContentType !== contentType ||
          !Number.isSafeInteger(existing.ContentLength) || existing.ContentLength! <= 0) {
          throw new Error('Канонический объект принадлежит другому рендеру');
        }
        return existing.ContentLength!;
      } finally { body.destroy(); }
    },
  };
}
