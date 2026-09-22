import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Worker, QueueEvents, DelayedError } from 'bullmq';
import { randomUUID } from 'node:crypto';
import { createQueues, getRedisConnection, jobId, type AttemptJob } from '../packages/queue/src';
const redisUrl = process.env.REDIS_URL;
// Test profile Redis only; randomized video IDs, clean only jobs created by this suite.
describe.skipIf(!redisUrl || !process.env.DATABASE_URL?.endsWith('_test'))('BullMQ transport on Redis 7', () => {
  let transport: ReturnType<typeof createQueues>, events: QueueEvents;
  const ids: string[] = [];
  const job = (): AttemptJob => ({video_id:randomUUID(),stage:'stt',fence:1,series_no:1,clip_id:null});
  beforeAll(async () => {
    transport = createQueues({redisUrl:redisUrl!});
    await Promise.all(Object.values(transport.queues).map(q=>q.waitUntilReady()));
    events = new QueueEvents('stt',{connection:getRedisConnection({redisUrl:redisUrl!})}); await events.waitUntilReady();
  });
  afterAll(async () => {
    if (transport) { for (const id of ids) { const j=await transport.queues.stt.getJob(id); if(j) await j.remove(); } await transport.close(); }
    await events?.close();
  });
  it('parallel enqueue deduplicates exact stage:video:fence and preserves default options', async () => {
    const data=job(),id=jobId(data); ids.push(id);
    await Promise.all(Array.from({length:10},()=>transport.enqueue(data)));
    const stored=await transport.queues.stt.getJob(id);
    expect(stored?.id).toBe(id); expect(stored?.opts).toMatchObject({attempts:1,removeOnComplete:1000,removeOnFail:5000});
    expect((await transport.queues.stt.getJobs(['waiting'])).filter(j=>j.id===id)).toHaveLength(1);
    await stored!.remove();
  });
  it('active no_disk deferral reuses job/fence; retained completed job can be restored', async () => {
    const data=job(),id=jobId(data); ids.push(id); let calls=0;
    const worker=new Worker<AttemptJob>('stt',async(j,token)=>{
      if(j.id!==id) throw new Error('Isolate queue test from live workers');
      calls++;
      if(calls===1) { await j.moveToDelayed(Date.now()+200,token); throw new DelayedError(); }
      return 'done';
    },{connection:getRedisConnection({redisUrl:redisUrl!}),concurrency:1});
    try {
      await worker.waitUntilReady(); await transport.enqueue(data);
      const stored=(await transport.queues.stt.getJob(id))!;
      await stored.waitUntilFinished(events,5000); expect(calls).toBe(2);
      await worker.pause(); await transport.enqueue(data);
      expect(await stored.getState()).toBe('waiting');
      await worker.resume(); await stored.waitUntilFinished(events,5000); await worker.pause();
      await transport.enqueue(data,300_000);
      expect(await (await transport.queues.stt.getJob(id))!.getState()).toBe('delayed');
    } finally { await worker.close(); }
  });
});
