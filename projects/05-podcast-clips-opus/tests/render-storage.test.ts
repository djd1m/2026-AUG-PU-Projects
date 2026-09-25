import { afterEach, expect, it, vi } from 'vitest';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { PutObjectCommand, HeadObjectCommand, type S3Client } from '@aws-sdk/client-s3';
import { renderStorage } from '../apps/worker/src/render/storage';
import { publishRenderResult } from '../packages/db/src/render';
import type { Attempt, Pool } from '../packages/db/src';
let directory: string;
afterEach(async () => { if (directory) await rm(directory, { recursive: true, force: true }); });
async function fixture() {
  directory = await mkdtemp(join(tmpdir(), 'render-s3-')); const file = join(directory, 'clip.mp4'); await writeFile(file, 'video');
  const objects = new Map<string, { contract: string; ContentLength: number; ContentType: string }>();
  const send = vi.fn(async (command: PutObjectCommand | HeadObjectCommand) => {
    const key = command.input.Key!;
    if (command instanceof PutObjectCommand) {
      expect(command.input.IfNoneMatch).toBe('*');
      if (objects.has(key)) throw { $metadata: { httpStatusCode: 412 } };
      objects.set(key, { contract: command.input.Metadata!['n5-render-contract']!, ContentLength: command.input.ContentLength!, ContentType: command.input.ContentType! });
      return {};
    }
    if (command instanceof HeadObjectCommand) {
      const stored = objects.get(key)!;
      return { ...stored, Metadata: { 'n5-render-contract': stored.contract } };
    }
    throw new Error('Delete/overwrite is forbidden');
  });
  return { file, objects, send, storage: renderStorage({ client: { send } as unknown as S3Client, bucket: 'private' }) };
}
it('S3 conditional publication: competing contracts never overwrite, matching retry adopts bytes', async () => {
  const f = await fixture(), signal = AbortSignal.timeout(5000);
  const results = await Promise.allSettled(['first', 'second'].map(contract => f.storage.put('clip', f.file, 'video/mp4', contract, signal)));
  expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1);
  const winner = f.objects.get('clip')!;
  expect(await f.storage.put('clip', f.file, 'video/mp4', winner.contract, signal)).toBe(5);
  expect(f.objects.get('clip')).toEqual(winner);
});
it('connection loss during publication cannot make an old attempt delete or overwrite adopted objects', async () => {
  const f = await fixture(), signal = AbortSignal.timeout(5000);
  const attempt: Attempt = { video_id: 'video', clip_id: 'clip', stage: 'render', fence: 1, attempt_no: 1, series_no: 1, status: 'running' };
  let connectionLost = false;
  const query = vi.fn(async (sql: string) => {
    if (connectionLost && !sql.startsWith('ROLLBACK')) throw new Error('connection lost');
    return { rowCount: 1, rows: [{ id: 'clip' }] };
  });
  const pool = { connect: async () => ({ query, release: vi.fn() }) } as unknown as Pool;
  await expect(publishRenderResult(pool, attempt, { object_key: 'clip', thumbnail_key: 'thumb', bytes: 5, watermarked: true, duration_seconds: 20 }, async () => {
    await f.storage.put('clip', f.file, 'video/mp4', 'same-contract', signal);
    connectionLost = true; // DB becomes unavailable while the publisher runs outside its transaction.
    expect(await f.storage.put('clip', f.file, 'video/mp4', 'same-contract', signal)).toBe(5); // next delivery adopted it
    await expect(f.storage.put('clip', f.file, 'video/mp4', 'old-contract', signal)).rejects.toThrow(/другому рендеру/);
    return 5;
  })).rejects.toThrow('connection lost');
  expect(f.objects.get('clip')?.contract).toBe('same-contract');
  expect(f.send.mock.calls.every(([command]) => command instanceof PutObjectCommand || command instanceof HeadObjectCommand)).toBe(true);
});

it('render storage deletes only the explicit key supplied after database publication', async () => {
  const { DeleteObjectCommand } = await import('@aws-sdk/client-s3');
  const send = vi.fn(async (_command: import('@aws-sdk/client-s3').DeleteObjectCommand) => ({}));
  const storage = renderStorage({ client: { send } as unknown as S3Client, bucket: 'private' });
  await storage.delete('clips/paid/video/clip-v2.mp4');
  expect(send.mock.calls[0]![0]).toBeInstanceOf(DeleteObjectCommand);
  expect(send.mock.calls[0]![0].input).toEqual({ Bucket: 'private', Key: 'clips/paid/video/clip-v2.mp4' });
});
