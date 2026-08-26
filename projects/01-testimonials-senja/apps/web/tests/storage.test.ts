// Интеграция с объектным хранилищем (Architecture §5) на ЖИВОМ MinIO — не на моке:
// проверяется, что байты доезжают неизменными и ключ действительно адресует объект.
//
// Без S3_ENDPOINT набор пропускается: у слоя есть предусловие, и молча «зеленеть»
// без него он не должен. Как поднять MinIO — см. docker-compose.yml.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { CreateBucketCommand, GetObjectCommand, S3Client } from '@aws-sdk/client-s3';

const ENDPOINT = process.env.S3_ENDPOINT;
const suite = ENDPOINT ? describe : describe.skip;

let uploadVideo: typeof import('../src/lib/storage')['uploadVideo'];
let VIDEO_BUCKET: string;
let client: S3Client;

suite('storage — живой MinIO', () => {
  beforeAll(async () => {
    const mod = await import('../src/lib/storage');
    uploadVideo = mod.uploadVideo;
    VIDEO_BUCKET = mod.VIDEO_BUCKET;
    client = mod.s3Client();
    try {
      await client.send(new CreateBucketCommand({ Bucket: VIDEO_BUCKET }));
    } catch {
      // Бакет уже есть — это норма при повторном прогоне.
    }
  });

  afterAll(() => {
    client?.destroy();
  });

  it('видео доезжает побайтово и отдаётся обратно по ключу', async () => {
    const bytes = new Uint8Array(4096).map((_, i) => i % 251);
    bytes.set([0x1a, 0x45, 0xdf, 0xa3], 0);

    const key = await uploadVideo('11111111-1111-1111-1111-111111111111', bytes, 'video/webm');
    expect(key).toMatch(/^11111111-1111-1111-1111-111111111111\/[0-9a-f-]{36}\.webm$/);

    const got = await client.send(new GetObjectCommand({ Bucket: VIDEO_BUCKET, Key: key }));
    const back = new Uint8Array(await got.Body!.transformToByteArray());

    expect(back.byteLength).toBe(bytes.byteLength);
    expect(Buffer.from(back).equals(Buffer.from(bytes))).toBe(true);
    expect(got.ContentType).toBe('video/webm');
  });

  it('два видео одного проекта не перезаписывают друг друга', async () => {
    const project = '22222222-2222-2222-2222-222222222222';
    const a = await uploadVideo(project, new Uint8Array([1, 2, 3, 4]), 'video/mp4');
    const b = await uploadVideo(project, new Uint8Array([5, 6, 7, 8]), 'video/mp4');
    expect(a).not.toBe(b);

    const got = await client.send(new GetObjectCommand({ Bucket: VIDEO_BUCKET, Key: a }));
    expect(Array.from(await got.Body!.transformToByteArray())).toEqual([1, 2, 3, 4]);
  });

  it('сбой хранилища приходит как StorageError, а не как сырая ошибка SDK', async () => {
    const { StorageError, resetS3Client } = await import('../src/lib/storage');
    const saved = process.env.S3_ENDPOINT;
    process.env.S3_ENDPOINT = 'http://127.0.0.1:1'; // порт, где никто не слушает
    resetS3Client();
    try {
      await expect(uploadVideo('p', new Uint8Array([1]), 'video/mp4')).rejects.toBeInstanceOf(StorageError);
    } finally {
      process.env.S3_ENDPOINT = saved;
      resetS3Client();
    }
  });
});
