import { describe, it, expect, vi } from 'vitest';
import { createS3Client, erasePrefix, type StorageContext } from '../packages/s3/src';
import { loadS3Config } from '../packages/shared/src/config';
import { environment } from './fixtures/environment';
const prefix = 'videos/11111111-1111-4111-8111-111111111111/';
describe('S3 physical erasure', () => {
  it('objects physically removed, unknown multipart aborted, listing paginated', async () => {
    const objects = new Set([prefix + 'source.mp4', prefix + 'orphan.mp4']);
    const aborts: string[] = [], deletes: string[] = [];
    const ctx: StorageContext = { client: createS3Client(loadS3Config(environment())), bucket: 'test' };
    ctx.client.send = vi.fn(async (command: { constructor: { name: string }; input: { Key?: string; KeyMarker?: string; UploadId?: string } }) => {
      switch (command.constructor.name) {
        case 'GetBucketVersioningCommand': return {};
        case 'ListMultipartUploadsCommand': return command.input.KeyMarker
          ? { Uploads: [{ Key: prefix + 'unknown', UploadId: 'u2' }] }
          : { IsTruncated: true, NextKeyMarker: prefix + 'known', NextUploadIdMarker: 'u1', Uploads: [{ Key: prefix + 'known', UploadId: 'u1' }] };
        case 'AbortMultipartUploadCommand': aborts.push(command.input.UploadId!); return {};
        case 'ListObjectsV2Command': return { Contents: [...objects].slice(0, 1).map(Key => ({ Key })) };
        case 'DeleteObjectCommand': deletes.push(command.input.Key!); objects.delete(command.input.Key!); return {};
        default: throw new Error(command.constructor.name);
      }
    }) as unknown as typeof ctx.client.send;
    try {
      await erasePrefix(ctx, prefix);
      expect(objects.size).toBe(0); expect(aborts).toEqual(['u1', 'u2']); expect(deletes).toHaveLength(2);
    } finally { ctx.client.destroy(); }
  });
  it('versioning and S3 failures never report erasure complete', async () => {
    const ctx = { client: createS3Client(loadS3Config(environment())), bucket: 'test' };
    const send = vi.fn().mockResolvedValue({ Status: 'Enabled' });
    ctx.client.send = send as unknown as typeof ctx.client.send;
    await expect(erasePrefix(ctx, prefix)).rejects.toThrow('версионирования');
    send.mockRejectedValue(new Error('storage unavailable'));
    await expect(erasePrefix(ctx, prefix)).rejects.toThrow('storage unavailable');
    await expect(erasePrefix(ctx, '')).rejects.toThrow('префикс');
    ctx.client.destroy();
  });
});
