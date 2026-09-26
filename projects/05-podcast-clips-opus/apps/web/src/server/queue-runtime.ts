import * as s3 from '@clipmaker/s3';
import { createQueues } from '@clipmaker/queue';
import { ensureInitialAttempt } from '@clipmaker/db';
import { getRuntime } from './runtime';
import { startWatchdog, watchdogTick } from './watchdog';
import { ClipMusicService } from './clip-music';
import { VideoRetryService } from './video-retry';
import { VideoCtaService } from './video-cta';
function createQueueRuntime() {
  const runtime = getRuntime();
  const transport = createQueues(runtime.config);
  return { ...transport,
    music: new ClipMusicService(runtime.pool, runtime.config.limits, job => transport.enqueue(job)),
    cta: new VideoCtaService(runtime.pool, runtime.config.limits, job => transport.enqueue(job)),
    retry: new VideoRetryService(runtime.pool, runtime.config.limits, job => transport.enqueue(job)),
    async enqueueInitial(videoId: string) {
      const attempt = await ensureInitialAttempt(runtime.pool, videoId);
      if (attempt && ['running', 'deferred'].includes(attempt.status)) await transport.enqueue(attempt);
    },
  };
}
const singleton = globalThis as typeof globalThis & {
  n5Queues?: ReturnType<typeof createQueueRuntime>; n5WatchdogStop?: () => void;
};
export const getQueueRuntime = () => singleton.n5Queues ??= createQueueRuntime();
export function startQueueWatchdog() {
  if (singleton.n5WatchdogStop) return;
  const runtime = getRuntime(), transport = getQueueRuntime();
  const ctx = { client: s3.createS3Client(runtime.config.s3), bucket: runtime.config.s3.bucket };
  singleton.n5WatchdogStop = startWatchdog(() => watchdogTick(runtime.pool, (job, delay) => transport.enqueue(job, delay), new Date(), 100, {
    delete: key => s3.deleteObject(ctx, key), erasePrefix: prefix => s3.erasePrefix(ctx, prefix), eraseClipPrefix: prefix => s3.eraseClipPrefix(ctx, prefix),
  }));
}
