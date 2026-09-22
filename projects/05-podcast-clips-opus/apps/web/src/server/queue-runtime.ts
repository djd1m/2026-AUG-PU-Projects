import { createQueues } from '@clipmaker/queue';
import { ensureInitialAttempt } from '@clipmaker/db';
import { getRuntime } from './runtime';
import { startWatchdog, watchdogTick } from './watchdog';
import { VideoRetryService } from './video-retry';
function createQueueRuntime() {
  const runtime = getRuntime();
  const transport = createQueues(runtime.config);
  return { ...transport,
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
  singleton.n5WatchdogStop = startWatchdog(() => watchdogTick(runtime.pool, (job, delay) => transport.enqueue(job, delay)));
}
