import { describe, expect, it } from 'vitest';
import { createServer } from 'node:http';
import { createS3Client, completeMultipartUpload, headObject } from '../packages/s3/src';
import { loadS3Config } from '../packages/shared/src/config';
import { environment } from './fixtures/environment';
// Исполняется в compose test: sandbox хоста запрещает даже bind(127.0.0.1).
// Это реальный HTTP/SDK, а не mock send; 24 байта специально склеиваются >5 секунд.
describe.skipIf(!process.env.DATABASE_URL)('RU-001 slow HTTP endpoint', () => {
  it('Complete survives 5 seconds while HEAD times out at 5 seconds', async () => {
    const timers: ReturnType<typeof setTimeout>[] = [];
    const server = createServer((req, res) => {
      res.setHeader('Content-Type', 'application/xml');
      if (req.method === 'GET') res.end('<ListPartsResult><IsTruncated>false</IsTruncated><Part><PartNumber>1</PartNumber><ETag>a</ETag><Size>24</Size></Part></ListPartsResult>');
      else timers.push(setTimeout(() => res.end(req.method === 'POST'
        ? '<CompleteMultipartUploadResult><Location>test</Location><Bucket>n5-test</Bucket><Key>key</Key><ETag>a</ETag></CompleteMultipartUploadResult>' : ''), 5500));
    });
    await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
    const address = server.address(); if (!address || typeof address === 'string') throw new Error('No port');
    const config = loadS3Config({ ...environment(), S3_ENDPOINT: `http://127.0.0.1:${address.port}` });
    const client = createS3Client(config); client.config.maxAttempts = async () => 1;
    const ctx = { client, bucket: 'n5-test' };
    try {
      const start = performance.now();
      await completeMultipartUpload(ctx, 'key', 'upload', [{ part_number: 1, etag: 'a' }]);
      const elapsed = performance.now() - start;
      console.log(JSON.stringify({ complete_elapsed_ms: elapsed })); expect(elapsed).toBeGreaterThan(5000);
      await expect(headObject(ctx, 'key')).rejects.toMatchObject({ name: 'TimeoutError' });
    } finally {
      for (const timer of timers) clearTimeout(timer);
      client.destroy(); server.closeAllConnections(); await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  }, 20000);
});
