import { Queue, type ConnectionOptions } from 'bullmq';
import type { JobStage } from '@clipmaker/shared/enums';
import { DEFAULT_JOB_OPTIONS, QUEUE_NAMES } from './constants.js';
export interface AttemptJob { video_id: string; stage: JobStage; fence: number; series_no: number; clip_id: string | null; step?: 'probe' | 'transcribe' }
export function getRedisConnection(config: { redisUrl: string }, worker = true): ConnectionOptions {
  let url: URL;
  try { url = new URL(config.redisUrl); } catch { throw new Error('REDIS_URL непригоден: очередь недоступна'); }
  if (!['redis:', 'rediss:'].includes(url.protocol) || !url.hostname || !url.password ||
    !/^\/(\d+)?$/.test(url.pathname || '/') || url.search || url.hash) {
    throw new Error('REDIS_URL: нужен адрес Redis с обязательным паролем и номером базы');
  }
  return { host: url.hostname, port: Number(url.port || 6379),
    username: url.username ? decodeURIComponent(url.username) : undefined, password: decodeURIComponent(url.password),
    db: Number(url.pathname.slice(1) || 0), ...(url.protocol === 'rediss:' ? { tls: {} } : {}),
    maxRetriesPerRequest: worker ? null : 1, enableOfflineQueue: worker, connectTimeout: 2000 };
}
export function jobId(job: Pick<AttemptJob, 'stage' | 'video_id' | 'fence'>): string {
  if (!QUEUE_NAMES.includes(job.stage) || !/^[a-f0-9-]{36}$/i.test(job.video_id) || !Number.isSafeInteger(job.fence) || job.fence < 1) {
    throw new Error('Непригодная идентичность задания');
  }
  return `${job.stage}:${job.video_id}:${job.fence}`;
}
export function createQueues(config: { redisUrl: string }) {
  const connection = getRedisConnection(config, false);
  const queues = Object.fromEntries(QUEUE_NAMES.map(stage => {
    const queue = new Queue<AttemptJob>(stage, { connection, defaultJobOptions: DEFAULT_JOB_OPTIONS });
    queue.on('error', () => console.error('Транспорт заданий временно недоступен'));
    return [stage, queue];
  })) as Record<JobStage, Queue<AttemptJob>>;
  return {
    queues,
    async enqueue(job: AttemptJob, delay = 0) {
      const queue = queues[job.stage], id = jobId(job);
      const old = await queue.getJob(id);
      if (old) {
        const state = await old.getState();
        if (state !== 'failed' && state !== 'completed') return;
        if (delay === 0) { await old.retry(state); return; }
        // retry() discards delay; remove only a terminal job, then restore the same identity.
        await old.remove();
      }
      await queue.add(job.stage, job, { jobId: id, delay });
    },
    async close() { await Promise.all(Object.values(queues).map(q => q.close())); },
  };
}
