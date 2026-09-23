import { getQueueRuntime } from './queue-runtime';
import * as s3 from '@clipmaker/s3';
import { getRuntime } from './runtime';
import { allowMutation } from './rate-limit';
import { VideoService } from './video';
import { ShortLinkService } from './short-link';
import { ScreenService } from './screen';
import { GuestPackService } from './guest-pack';
import { PartnerService } from './partner';
function createUploadRuntime() {
  const runtime = getRuntime();
  const ctx = { client: s3.createS3Client(runtime.config.s3), bucket: runtime.config.s3.bucket };
  const queueRuntime = getQueueRuntime();
  const video = new VideoService(runtime.pool, runtime.config.limits, {
    initiate: (key) => s3.initiateMultipartUpload(ctx, key), sign: (key, id, count, now) => s3.signParts(ctx, key, id, count, now),
    list: (key, id) => s3.listUploadedParts(ctx, key, id),
    complete: (key, id, parts) => s3.completeMultipartUpload(ctx, key, id, parts),
    abort: (key, id) => s3.abortMultipartUpload(ctx, key, id), head: (key) => s3.headObject(ctx, key),
    bytes: (key) => s3.getObjectBytes(ctx, key, 'bytes=0-4095'), delete: (key) => s3.deleteObject(ctx, key),
  }, (videoId) => queueRuntime.enqueueInitial(videoId));
  return { video, partners: new PartnerService(runtime.pool), guests: new GuestPackService(runtime.pool), links: new ShortLinkService(runtime.pool), screen: new ScreenService(runtime.pool), retry: queueRuntime.retry, auth: runtime.auth, publicOrigin: runtime.config.publicOrigin,
    trustedProxyHops: runtime.config.trustedProxyHops,
    allowMutation: (ip: string, account?: string) => allowMutation(runtime.redis, ip, runtime.config.sessionSecret, account) };
}
const singleton = globalThis as typeof globalThis & { n5UploadRuntime?: ReturnType<typeof createUploadRuntime> };
export function getUploadRuntime() { return singleton.n5UploadRuntime ??= createUploadRuntime(); }
