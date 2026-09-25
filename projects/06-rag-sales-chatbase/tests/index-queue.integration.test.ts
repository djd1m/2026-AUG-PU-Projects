// Транспорт задач индексации на НАСТОЯЩЕМ Redis: одна идентичность `index:<id>:<generation>` — одно живое
// задание при конкурентной постановке (сторож + «Повторить» + автоповтор не размножают работу).
import { afterAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { createIndexQueue, jobId } from '../packages/queue/src/index';

const redisUrl = process.env.REDIS_URL;
describe.skipIf(!redisUrl)('Redis: очередь индексации', () => {
  const queue = createIndexQueue({ redisUrl: redisUrl ?? 'redis://:x@invalid:6379' });
  afterAll(async () => { await queue.queue.obliterate({ force: true }); await queue.close(); });
  it('10 одновременных постановок одной идентичности → одно задание; новая generation — второе', async () => {
    const message = { index_job_id: randomUUID(), generation: 0 };
    await Promise.all(Array.from({ length: 10 }, () => queue.enqueue(message)));
    const waiting = await queue.queue.getJobs(['waiting', 'delayed', 'active']);
    expect(waiting.filter((j) => j.data.index_job_id === message.index_job_id)).toHaveLength(1);
    expect(waiting.find((j) => j.data.index_job_id === message.index_job_id)!.id).toBe(jobId(message));
    await queue.enqueue({ ...message, generation: 1 });
    expect((await queue.queue.getJobs(['waiting'])).filter((j) => j.data.index_job_id === message.index_job_id)).toHaveLength(2);
  });
});
