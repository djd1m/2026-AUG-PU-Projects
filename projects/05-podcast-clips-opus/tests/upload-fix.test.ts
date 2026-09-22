import { afterEach, expect, it, vi } from 'vitest';
import type Redis from 'ioredis';
import { createS3Client, completeMultipartUpload, headObject } from '../packages/s3/src';
import { loadS3Config } from '../packages/shared/src/config';
import { environment } from './fixtures/environment';
import { uploadParts } from '../apps/web/src/lib/upload-parts';
import { allowMutation } from '../apps/web/src/server/rate-limit';
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

it('RU-001: Complete has a minutes-scale command timeout, HEAD stays short', async () => {
  const ctx = { client: createS3Client(loadS3Config(environment())), bucket: 'n5-test' };
  const send = vi.fn().mockResolvedValueOnce({ Parts: [{ PartNumber: 1, ETag: 'a', Size: 24 }] })
    .mockResolvedValueOnce({}).mockResolvedValueOnce({ ContentLength: 24 });
  ctx.client.send = send as unknown as typeof ctx.client.send;
  await completeMultipartUpload(ctx, 'key', 'id', [{ part_number: 1, etag: 'a' }]);
  await headObject(ctx, 'key');
  expect(send.mock.calls[1]?.[1]?.requestTimeout).toBe(300_000);
  expect(send.mock.calls[2]?.[1]?.requestTimeout).toBe(5000);
  ctx.client.destroy();
});

it('RU-003: three PUTs run concurrently and completed parts are preserved', async () => {
  let active = 0, peak = 0;
  const fetcher = vi.fn(async () => {
    active++; peak = Math.max(peak, active);
    await new Promise((resolve) => setTimeout(resolve, 10)); active--;
    return new Response('', { headers: { etag: 'new' } });
  });
  vi.stubGlobal('fetch', fetcher);
  const parts = [2, 3, 4].map((part_number) => ({ part_number, url: `https://s3.invalid/${part_number}`, expires_at: '2099-01-01T00:00:00Z' }));
  const result = await uploadParts(new Blob(['1234']), { part_size: 1, parts, completed_parts: [{ part_number: 1, etag: 'old' }] });
  expect(peak).toBe(3);
  expect(result).toEqual([{ part_number: 1, etag: 'old' }, ...[2, 3, 4].map((part_number) => ({ part_number, etag: 'new' }))]);
});

it('RU-003: expired signatures refresh without re-uploading confirmed parts', async () => {
  const fetcher = vi.fn(async (_url: string) => new Response('', { headers: { etag: 'b' } })); vi.stubGlobal('fetch', fetcher);
  const expired = { part_number: 2, url: 'https://s3.invalid/expired', expires_at: '2020-01-01T00:00:00Z' };
  const refresh = vi.fn(async () => ({ part_size: 1, parts: [{ ...expired, url: 'https://s3.invalid/fresh?original-signature', expires_at: '2099-01-01T00:00:00Z' }],
    completed_parts: [{ part_number: 1, etag: 'a' }] }));
  expect(await uploadParts(new Blob(['12']), { part_size: 1, parts: [expired] }, undefined, refresh))
    .toEqual([{ part_number: 1, etag: 'a' }, { part_number: 2, etag: 'b' }]);
  expect(refresh).toHaveBeenCalledTimes(1); expect(fetcher).toHaveBeenCalledTimes(1);
  expect(fetcher.mock.calls[0]?.[0]).toBe('https://s3.invalid/fresh?original-signature');
});

it('RU-006: saturated anonymous prefix and account do not block another account behind NAT', async () => {
  const counts = new Map<string, number>();
  const redis = { status: 'ready', eval: vi.fn(async (_script, _n, key: string) => {
    const n = (counts.get(key) ?? 0) + 1; counts.set(key, n); return n;
  }) } as unknown as Redis;
  await Promise.all(Array.from({ length: 30 }, () => allowMutation(redis, '192.0.2.1', 'secret')));
  const answers = await Promise.all(Array.from({ length: 31 }, () => allowMutation(redis, '192.0.2.1', 'secret', 'account-a')));
  expect(answers.filter(Boolean)).toHaveLength(30);
  expect(await allowMutation(redis, '192.0.2.2', 'secret', 'account-b')).toBe(true);
  expect(await allowMutation(redis, '198.51.100.1', 'secret', 'account-a')).toBe(false);
});

it('RU-009: initiation refuses missing, disabled or filtered abort lifecycle', async () => {
  const { initiateMultipartUpload } = await import('../packages/s3/src');
  const ctx = { client: createS3Client(loadS3Config(environment())), bucket: 'n5-test' };
  const send = vi.fn(); ctx.client.send = send as unknown as typeof ctx.client.send;
  const rule = { Status: 'Enabled', Filter: { Prefix: '' }, AbortIncompleteMultipartUpload: { DaysAfterInitiation: 1 } };
  for (const rules of [[], [{ ...rule, Status: 'Disabled' }], [{ ...rule, Filter: { Prefix: 'other/' } }],
    [{ ...rule, Filter: { Tag: { Key: 'x', Value: 'y' } } }], [{ ...rule, AbortIncompleteMultipartUpload: { DaysAfterInitiation: 7 } }]]) {
    send.mockReset().mockResolvedValueOnce({ Rules: rules }).mockResolvedValueOnce({ UploadId: 'must-not-create' });
    await expect(initiateMultipartUpload(ctx, 'key')).rejects.toThrow(); expect(send).toHaveBeenCalledTimes(1);
  }
  send.mockReset().mockResolvedValueOnce({ Rules: [rule] }).mockResolvedValueOnce({ UploadId: 'id' });
  expect(await initiateMultipartUpload(ctx, 'key')).toBe('id');
  expect(send.mock.calls[0]?.[0].constructor.name).toBe('GetBucketLifecycleConfigurationCommand');
  expect(send.mock.calls[1]?.[0].constructor.name).toBe('CreateMultipartUploadCommand'); ctx.client.destroy();
});

it('RU-003: persistent 403 has a bounded retry and abort does not refresh', async () => {
  const part = { part_number: 1, url: 'https://s3.invalid/original', expires_at: '2099-01-01T00:00:00Z' };
  const upload = { part_size: 1, parts: [part] };
  const refresh = vi.fn(async () => upload);
  vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 403 })));
  await expect(uploadParts(new Blob(['1']), upload, undefined, refresh)).rejects.toThrow('Не удалось обновить');
  expect(refresh).toHaveBeenCalledTimes(2);
  refresh.mockClear();
  await expect(uploadParts(new Blob(['1']), upload, AbortSignal.abort(), refresh)).rejects.toThrow();
  expect(refresh).not.toHaveBeenCalled();
});

it('RU-001: deadline covers a stalled Complete body after HTTP 200 headers', async () => {
  const { Readable } = await import('node:stream');
  const ctx = { client: createS3Client(loadS3Config(environment())), bucket: 'n5-test' };
  ctx.client.config.maxAttempts = async () => 1;
  const controller = new AbortController();
  vi.spyOn(AbortSignal, 'timeout').mockReturnValue(controller.signal);
  let bodyStarted!: () => void;
  const started = new Promise<void>((resolve) => { bodyStarted = resolve; });
  const stalled = new Readable({ read() { bodyStarted(); } });
  stalled.on('error', () => {});
  vi.spyOn(ctx.client.config.requestHandler, 'handle').mockImplementation(async (request, options) => {
    if (request.method === 'GET') return { response: { statusCode: 200, headers: { 'content-type': 'application/xml' },
      body: Readable.from([Buffer.from('<ListPartsResult><IsTruncated>false</IsTruncated><Part><PartNumber>1</PartNumber><ETag>a</ETag><Size>24</Size></Part></ListPartsResult>')]) } };
    // Сервер уже дал заголовки 200; тело остаётся открытым.
    (options as { abortSignal?: AbortSignal } | undefined)?.abortSignal?.addEventListener('abort', () => stalled.destroy(new Error('body deadline')), { once: true });
    return { response: { statusCode: 200, headers: { 'content-type': 'application/xml' }, body: stalled } };
  });
  const result = completeMultipartUpload(ctx, 'key', 'id', [{ part_number: 1, etag: 'a' }]);
  const observed = result.then(() => 'unexpected success', (error: Error) => error.message);
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([started, observed.then((message) => { throw new Error(message); })]); controller.abort();
    const answer = await Promise.race([observed, new Promise<string>((resolve) => { timer = setTimeout(() => resolve('deadline ignored'), 150); })]);
    expect(answer).toContain('body deadline');
    expect(AbortSignal.timeout).toHaveBeenCalledWith(300_000);
  } finally { clearTimeout(timer); stalled.destroy(new Error('test cleanup')); await observed; ctx.client.destroy(); }
});

it('RU-008: abort failure still deletes and preserves the file rejection', async () => {
  const { VideoService } = await import('../apps/web/src/server/video');
  const { loadLimits } = await import('../packages/shared/src/config');
  const id = 'a65e5f33-3194-46c3-8c18-1d3a42bfe158';
  const pool = { query: vi.fn(async () => ({ rows: [{ id, account_id: 'account', status: 'failed',
    failure_reason: 'not_media', upload_id: 'upload', object_key: 'key' }] })) };
  const abort = vi.fn(async () => { throw new Error('offline'); }), remove = vi.fn(async () => {});
  const log = vi.spyOn(console, 'error').mockImplementation(() => {});
  const storage = { abort, delete: remove } as unknown as import('../apps/web/src/server/video').UploadStorage;
  const run = new VideoService(pool as unknown as import('pg').Pool, loadLimits(environment()), storage, async () => {});
  await expect(run.complete('account', { video_id: id, parts: [{ part_number: 1, etag: 'a' }] }))
    .rejects.toMatchObject({ status: 422, details: { reason: 'not_media' } });
  expect(remove).toHaveBeenCalledWith('key'); expect(log).toHaveBeenCalledTimes(1);
});
