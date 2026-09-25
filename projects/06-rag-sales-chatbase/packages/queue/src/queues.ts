// из N5: projects/05-podcast-clips-opus/packages/queue/src/queues.ts — адаптировано: одна очередь `index`
// вместо стадий; идентичность задания `index:<index_job_id>:<generation>` (у N5 `stage:video_id:fence`),
// где generation — current_fence задачи в момент постановки; getRedisConnection и enqueue — без изменений
// по смыслу (терминальное задание той же идентичности перезапускается, живое — не дублируется).
import { Queue, type ConnectionOptions } from 'bullmq';
import { DEFAULT_JOB_OPTIONS, INDEX_QUEUE } from './constants.js';

// Сообщение транспорта. Источник истины — строка index_job; сообщение лишь будит воркер.
export interface IndexMessage { index_job_id: string; generation: number }

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

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function jobId(message: IndexMessage): string {
  if (!UUID.test(message.index_job_id) || !Number.isSafeInteger(message.generation) || message.generation < 0) {
    throw new Error('Непригодная идентичность задания индексации');
  }
  return `${INDEX_QUEUE}:${message.index_job_id.toLowerCase()}:${message.generation}`;
}

export function createIndexQueue(config: { redisUrl: string }) {
  const queue = new Queue<IndexMessage>(INDEX_QUEUE, { connection: getRedisConnection(config, false), defaultJobOptions: DEFAULT_JOB_OPTIONS });
  queue.on('error', () => console.error('Транспорт заданий индексации временно недоступен'));
  return {
    queue,
    async enqueue(message: IndexMessage): Promise<void> {
      const id = jobId(message);
      const old = await queue.getJob(id);
      if (old) {
        const state = await old.getState();
        if (state !== 'failed' && state !== 'completed') return; // живое задание той же идентичности уже везёт сообщение
        await old.retry(state);
        return;
      }
      await queue.add(INDEX_QUEUE, message, { jobId: id });
    },
    async close(): Promise<void> { await queue.close(); },
  };
}
export type IndexQueue = ReturnType<typeof createIndexQueue>;
