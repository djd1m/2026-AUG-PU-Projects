// Adapted from jan-clone/workers/video-render.ts; job payload contains identity only.
import { Worker, DelayedError, type Job, type ConnectionOptions } from 'bullmq';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { stat } from 'node:fs/promises';
import { getRenderInput, setRenderDeferred, retryRender, publishRenderResult, type Pool, type Attempt } from '@clipmaker/db';
import { DEFER_DELAY_MS, type AttemptJob } from '@clipmaker/queue';
import { withSource, type Download, type freeBytes } from '../media/download.js';
import { renderClip } from '../render/ffmpeg.js';
import { generateThumbnail, FFmpegError, RENDER_JOB_TIMEOUT_MS } from '../render/exec.js';
import { watermarkRequired, RENDER_FONT_SHA256 } from '../render/watermark.js';
import type { RenderStorage } from '../render/storage.js';
export interface RenderDependencies {
  pool: Pool; directory: string; origin: string; download: Download; storage: RenderStorage;
  enqueue: (attempt: Attempt, delay?: number) => Promise<void>;
  available?: typeof freeBytes; render?: typeof renderClip; thumbnail?: typeof generateThumbnail;
}
export async function handleRenderJob(attempt: Attempt, deps: RenderDependencies): Promise<'done' | 'stale' | 'deferred' | 'failed'> {
  try {
    const input = await getRenderInput(deps.pool, attempt);
    if (!input) return 'stale';
    const signal = AbortSignal.timeout(RENDER_JOB_TIMEOUT_MS);
    // Authoritative account value, never job.data.watermark or clip.watermarked.
    const watermark = watermarkRequired(input.plan);
    const outcome = await withSource(deps.directory, input.object_key, BigInt(input.actual_bytes), deps.download, async source => {
      signal.throwIfAborted();
      if (!await setRenderDeferred(deps.pool, attempt, false)) return 'stale' as const;
      const output = join(dirname(source), 'clip.mp4'), thumb = join(dirname(source), 'thumb.jpg');
      await (deps.render ?? renderClip)({ inputPath: source, outputPath: output, startTime: Number(input.start_seconds),
        endTime: Number(input.end_seconds), format: 'portrait', words: input.words, watermark,
        origin: deps.origin, code: input.code, signal });
      await (deps.thumbnail ?? generateThumbnail)(output, thumb, (Number(input.end_seconds) - Number(input.start_seconds)) * 0.25);
      signal.throwIfAborted();
      const object_key = `clips/${watermark ? 'free' : 'paid'}/${attempt.video_id}/${attempt.clip_id}.mp4`;
      const thumbnail_key = `thumbs/${attempt.video_id}/${attempt.clip_id}.jpg`;
      const bytes = (await stat(output)).size;
      const contract = createHash('sha256').update(JSON.stringify({ renderer: 'render-and-watermark-v1',
        video: attempt.video_id, clip: attempt.clip_id, source: input.object_key, sourceBytes: input.actual_bytes,
        start: input.start_seconds, end: input.end_seconds, words: input.words, watermark, origin: deps.origin,
        code: input.code, font: RENDER_FONT_SHA256 })).digest('hex');
      const uploadSignal = AbortSignal.any([signal, AbortSignal.timeout(120_000)]);
      const accepted = await publishRenderResult(deps.pool, attempt, { object_key, thumbnail_key, bytes, watermarked: watermark }, async () => {
        const storedBytes = await deps.storage.put(object_key, output, 'video/mp4', contract, uploadSignal);
        await deps.storage.put(thumbnail_key, thumb, 'image/jpeg', contract, uploadSignal);
        return storedBytes;
      });
      return accepted ? 'done' as const : 'stale' as const;
    }, deps.available);
    if (outcome.deferred) return await setRenderDeferred(deps.pool, attempt, true) ? 'deferred' : 'stale';
    return outcome.value;
  } catch (error) {
    const next = await retryRender(deps.pool, attempt, error instanceof FFmpegError ? error.reason : 'ffmpeg_failed');
    if (next) {
      try { await deps.enqueue(next, 2000); }
      catch (error) { console.error('Попытка рендера сохранена; сторож восстановит доставку', error); }
    }
    return 'failed';
  }
}
export function createRenderWorker(connection: ConnectionOptions, deps: RenderDependencies): Worker<AttemptJob> {
  return new Worker<AttemptJob>('render', async (job: Job<AttemptJob>, token?: string) => {
    const row = await deps.pool.query<Attempt>(`SELECT * FROM job_attempt WHERE video_id=$1 AND fence=$2 AND stage='render'`,
      [job.data.video_id, job.data.fence]);
    const attempt = row.rows[0];
    if (!attempt) throw new Error('Попытка рендера отсутствует в БД');
    if (await handleRenderJob(attempt, deps) === 'deferred') {
      await job.moveToDelayed(Date.now() + DEFER_DELAY_MS, token);
      throw new DelayedError();
    }
  }, { connection, concurrency: 1, maxStalledCount: 1 });
}
