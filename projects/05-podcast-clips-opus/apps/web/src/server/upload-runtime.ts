import { Queue } from 'bullmq';
import * as s3 from '@clipmaker/s3';
import { getRuntime } from './runtime';
import { allowMutation } from './rate-limit';
import { VideoService } from './video';
function createUploadRuntime() {
  const runtime = getRuntime();
  const ctx = { client: s3.createS3Client(runtime.config.s3), bucket: runtime.config.s3.bucket };
  const url = new URL(runtime.config.redisUrl);
  const queue = new Queue('stt', { connection: { host: url.hostname, port: Number(url.port || 6379),
    username: url.username ? decodeURIComponent(url.username) : undefined,
    password: url.password ? decodeURIComponent(url.password) : undefined, db: Number(url.pathname.slice(1) || 0),
    ...(url.protocol === 'rediss:' ? { tls: {} } : {}), maxRetriesPerRequest: 1, enableOfflineQueue: false,
    connectTimeout: 2000 } });
  queue.on('error', () => console.error('Постановка задания недоступна: повторите завершение загрузки'));
  const video = new VideoService(runtime.pool, runtime.config.limits, {
    initiate: (key) => s3.initiateMultipartUpload(ctx, key), sign: (key, id, count, now) => s3.signParts(ctx, key, id, count, now),
    complete: (key, id, parts) => s3.completeMultipartUpload(ctx, key, id, parts),
    abort: (key, id) => s3.abortMultipartUpload(ctx, key, id), head: (key) => s3.headObject(ctx, key),
    bytes: (key) => s3.getObjectBytes(ctx, key, 'bytes=0-4095'), delete: (key) => s3.deleteObject(ctx, key),
  }, async (videoId, fence) => {
    await queue.add('stt', { video_id: videoId, fence, stage: 'stt' }, { jobId: `stt:${videoId}:${fence}` });
  });
  return { video, auth: runtime.auth, publicOrigin: runtime.config.publicOrigin,
    trustedProxyHops: runtime.config.trustedProxyHops,
    allowMutation: (ip: string) => allowMutation(runtime.redis, ip, runtime.config.sessionSecret) };
}
const singleton = globalThis as typeof globalThis & { n5UploadRuntime?: ReturnType<typeof createUploadRuntime> };
export function getUploadRuntime() { return singleton.n5UploadRuntime ??= createUploadRuntime(); }
