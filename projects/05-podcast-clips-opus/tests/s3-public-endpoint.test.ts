import { createHash, createHmac } from 'node:crypto';
import { Readable } from 'node:stream';
import { describe, expect, it } from 'vitest';
import { loadS3Config, loadWebConfig } from '../packages/shared/src/config';
import { createS3Client, signParts, generateDownloadUrl, initiateMultipartUpload, completeMultipartUpload,
  headObject, getObjectBytes, deleteObject, abortMultipartUpload } from '../packages/s3/src';
import { environment } from './fixtures/environment';

// Независимая проверка SigV4: обнаруживает замену хоста ПОСЛЕ подписи.
function signature(url: URL, method: string, secret: string) {
  const encode = (s: string) => encodeURIComponent(s).replace(/[!'()*]/g, c => '%' + c.charCodeAt(0).toString(16).toUpperCase());
  const hash = (s: string) => createHash('sha256').update(s).digest('hex');
  const hmac = (key: string | Buffer, s: string) => createHmac('sha256', key).update(s).digest();
  const query = [...url.searchParams].filter(([k]) => k !== 'X-Amz-Signature')
    .map(([k, v]) => `${encode(k)}=${encode(v)}`).sort().join('&');
  const [, day, region, service, terminal] = url.searchParams.get('X-Amz-Credential')!.split('/');
  const scope = [day, region, service, terminal].join('/');
  const canonical = [method, url.pathname, query, `host:${url.host}\n`, 'host', 'UNSIGNED-PAYLOAD'].join('\n');
  const key = hmac(hmac(hmac(hmac(`AWS4${secret}`, day!), region!), service!), terminal!);
  return hmac(key, ['AWS4-HMAC-SHA256', url.searchParams.get('X-Amz-Date'), scope, hash(canonical)].join('\n')).toString('hex');
}

describe('PE-001: публичный адрес подписи и внутренний транспорт', () => {
  it.each(['true', 'false'])('Публичные PUT и GET подписаны публичным хостом; pathStyle=%s', async (style) => {
    const env: NodeJS.ProcessEnv = { ...environment(), S3_FORCE_PATH_STYLE: style };
    const client = createS3Client(loadWebConfig(env).s3), ctx = { client, bucket: 'n5-test' };
    try {
      const parts = await signParts(ctx, 'videos/a/source.mp4', 'upload', [1, 3], new Date('2026-09-22T00:00:00Z'));
      const download = await generateDownloadUrl(ctx, 'clips/a.mp4', 'Мой клип.mp4');
      for (const [method, signed] of [...parts.map(p => ['PUT', p.url]), ['GET', download]]) {
        const url = new URL(signed!);
        expect(url.protocol).toBe('https:');
        expect(url.hostname).toBe(style === 'true' ? 'storage.test.invalid' : 'n5-test.storage.test.invalid');
        expect(url.searchParams.get('X-Amz-SignedHeaders')).toBe('host');
        expect(url.searchParams.get('X-Amz-Expires')).toBe('900');
        expect(signature(url, method!, env.S3_SECRET_KEY!)).toBe(url.searchParams.get('X-Amz-Signature'));
      }
    } finally { client.destroy(); }
  });

  it('Серверные операции сериализуются на внутренний адрес', async () => {
    const client = createS3Client(loadWebConfig(environment()).s3), ctx = { client, bucket: 'n5-test' };
    const requests: Array<{ hostname: string; protocol: string; method: string; query: Record<string, unknown> }> = [];
    client.config.requestHandler = {
      handle: async (request) => {
        requests.push(request);
        const body = request.method === 'GET' && request.query.uploadId
          ? '<ListPartsResult><IsTruncated>false</IsTruncated><Part><PartNumber>1</PartNumber><ETag>part</ETag><Size>1</Size></Part></ListPartsResult>'
          : request.method === 'POST' && 'uploads' in request.query
            ? '<InitiateMultipartUploadResult><UploadId>upload</UploadId></InitiateMultipartUploadResult>'
            : request.method === 'POST' ? '<CompleteMultipartUploadResult/>' : 'x';
        return { response: { statusCode: 200, headers: { 'content-length': '1' }, body: Readable.from([Buffer.from(body)]) } };
      },
    };
    try {
      await initiateMultipartUpload(ctx, 'key');
      await headObject(ctx, 'key'); await getObjectBytes(ctx, 'key');
      await completeMultipartUpload(ctx, 'key', 'upload', [{ part_number: 1, etag: 'part' }]);
      await deleteObject(ctx, 'key'); await abortMultipartUpload(ctx, 'key', 'upload');
      expect(requests).toHaveLength(7);
      for (const r of requests) expect([r.protocol, r.hostname]).toEqual(['http:', 'minio']);
    } finally { client.destroy(); }
  });

  it('Воркеры не требуют публичный endpoint; подписание без него отказывает', async () => {
    const env = environment(); delete env.S3_PUBLIC_ENDPOINT;
    const client = createS3Client(loadS3Config(env));
    try {
      await expect(signParts({ client, bucket: 'n5-test' }, 'key', 'u', 1, new Date())).rejects.toThrow('S3_PUBLIC_ENDPOINT');
    } finally { client.destroy(); }
  });

  it.each(['development', 'test'])('HTTP разрешён явно для %s', async (mode) => {
    const client = createS3Client(loadWebConfig({ ...environment(), NODE_ENV: mode, S3_PUBLIC_ENDPOINT: 'http://storage.test.invalid' }).s3);
    try { expect(new URL(await generateDownloadUrl({ client, bucket: 'n5-test' }, 'key')).protocol).toBe('http:'); }
    finally { client.destroy(); }
  });
});
