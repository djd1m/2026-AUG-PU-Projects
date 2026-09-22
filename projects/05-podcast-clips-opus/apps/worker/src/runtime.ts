import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { Worker, DelayedError, type Job } from 'bullmq';
import { createPool, type Attempt } from '@clipmaker/db';
import { createS3Client } from '@clipmaker/s3';
import { loadWorkerConfig, loadS3Config, loadSttConfig, loadLlmConfig, required, type Environment, type ServiceRole } from '@clipmaker/shared/config';
import { createQueues, getRedisConnection, DEFER_DELAY_MS, type AttemptJob } from '@clipmaker/queue';
import { checkFfprobe } from './media/probe.js';
import { s3Download } from './media/download.js';
import { probeSource, transcribeSource } from './workers/stt.js';
import { checkFfmpeg } from './stt/extract.js';
import { createTranscriber } from './stt/client.js';
import { retryProbe } from './retry.js';
import { createSelector } from './llm/provider.js';
import { createFakeSelector } from './llm/fake.js';
import { selectFragments } from './workers/select.js';
export async function startWorker(role: Exclude<ServiceRole, 'web'>, env: Environment) {
  const config = loadWorkerConfig(role, env);
  const connection = getRedisConnection(config);
  // Validate dependencies before opening sockets or registering signal handlers.
  const directory = role === 'worker-stt' ? required(env, 'N5_WORK_DIR', 'негде проверять оригинал') : null;
  const s3Config = role === 'worker-stt' ? loadS3Config(env) : null;
  const transcriber = role === 'worker-stt' ? createTranscriber(loadSttConfig(env)) : null;
  const llmConfig = role === 'worker-llm' ? loadLlmConfig(env) : null;
  const llmDirectory = role === 'worker-llm' ? required(env, 'N5_WORK_DIR', 'негде учитывать попытки модели') : null;
  if (llmDirectory) await mkdir(llmDirectory, { recursive: true });
  if (directory) { await checkFfprobe(); await checkFfmpeg(); await mkdir(directory, { recursive: true }); }
  const pool = createPool(config.databaseUrl);
  pool.on('error', () => console.error('Воркер: соединение БД потеряно'));
  const transport = createQueues(config);
  const storage = s3Config ? { client: createS3Client(s3Config), bucket: s3Config.bucket } : null;
  let worker: Worker<AttemptJob>;
  if (role === 'worker-stt' && directory && storage && transcriber && 'limits' in config) {
    worker = new Worker<AttemptJob>('stt', async (job: Job<AttemptJob>, token?: string) => {
      const row = await pool.query<Attempt>('SELECT * FROM job_attempt WHERE video_id=$1 AND fence=$2 AND stage=$3',
        [job.data.video_id, job.data.fence, 'stt']);
      const attempt = row.rows[0];
      if (!attempt) throw new Error('Попытка отсутствует в БД');
      let outcome: Awaited<ReturnType<typeof probeSource>>;
      try {
        outcome = await probeSource(attempt, { pool, limits: config.limits, directory, download: s3Download(storage),
          continueTranscription: (file, duration, current) => transcribeSource(file, duration, current,
            { pool, limits: config.limits, transcriber, spendPath: join(directory, 'model-spend.jsonl'), enqueue: transport.enqueue }) });
      } catch {
        const next = await retryProbe(pool, attempt);
        if (next) await transport.enqueue(next, 2000);
        throw new Error('Проверка оригинала не завершилась');
      }
      if (outcome === 'deferred' || outcome === 'transcribing') {
        // Feature 4 owns the transcribe continuation; keep its job pending, never claim STT success.
        // probeSource heartbeats this explicit handoff; a stopped worker still expires after 30 min.
        if (outcome === 'transcribing') {
          if (job.data.step !== 'transcribe') console.info(JSON.stringify({ event: 'awaiting_transcription_handler', video_id: attempt.video_id }));
          await job.updateData({ ...job.data, step: 'transcribe' });
        }
        await job.moveToDelayed(Date.now() + DEFER_DELAY_MS, token);
        throw new DelayedError();
      }
    }, { connection, concurrency: 2, maxStalledCount: 1 });
  } else if (role === 'worker-llm' && llmConfig && llmDirectory && 'limits' in config) {
    const selector = llmConfig.mode === 'fake' ? createFakeSelector() : createSelector(llmConfig);
    worker = new Worker<AttemptJob>('select', async (job: Job<AttemptJob>) => {
      const row = await pool.query<Attempt>('SELECT * FROM job_attempt WHERE video_id=$1 AND fence=$2 AND stage=$3',
        [job.data.video_id, job.data.fence, 'select']);
      const attempt = row.rows[0];
      if (!attempt) throw new Error('Попытка отсутствует в БД');
      await selectFragments(attempt, { pool, limits: config.limits, selector, model: llmConfig.model,
        spendPath: join(llmDirectory, 'model-spend.jsonl'), enqueue: transport.enqueue });
    }, { connection, concurrency: 2, maxStalledCount: 1 });
  } else {
    // Feature 6 consumer remains paused and cannot discard pending render work.
    const unavailable = async () => { throw new Error('Обработчик стадии ещё не установлен'); };
    worker = role === 'worker-video'
      ? new Worker<AttemptJob>('render', unavailable, { connection, concurrency: 1, autorun: false, maxStalledCount: 1 })
      : new Worker<AttemptJob>('select', unavailable, { connection, concurrency: 2, autorun: false, maxStalledCount: 1 });
    await worker.pause();
    void worker.run().catch(() => console.error('Воркер: обработчик остановлен'));
  }
  worker.on('error', () => console.error('Воркер: транспорт недоступен'));
  worker.on('failed', () => console.error('Воркер: попытка завершилась отказом'));
  let stopping: Promise<void> | undefined;
  const stop = () => stopping ??= (async () => {
    await worker.close(); await transport.close(); await pool.end(); storage?.client.destroy();
    process.removeListener('SIGINT', onSignal); process.removeListener('SIGTERM', onSignal);
  })();
  const onSignal = () => { void stop().catch(() => { process.exitCode = 1; }); };
  process.once('SIGINT', onSignal); process.once('SIGTERM', onSignal);
  return { worker, stop };
}
