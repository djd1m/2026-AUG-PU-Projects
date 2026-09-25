import { afterEach, expect, it, vi } from 'vitest';
import { mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { Attempt, Pool } from '../packages/db/src';
const db = vi.hoisted(() => ({ getRenderInput: vi.fn(), setRenderDeferred: vi.fn(), retryRender: vi.fn(), publishRenderResult: vi.fn() }));
vi.mock('@clipmaker/db', () => db);
import { handleRenderJob } from '../apps/worker/src/workers/render';
const attempt: Attempt = { video_id: 'video', clip_id: 'clip', fence: 4, stage: 'render', series_no: 1, attempt_no: 1, status: 'running' };
let directory: string;
afterEach(async () => { if (directory) await rm(directory, { recursive: true, force: true }); vi.resetAllMocks(); vi.restoreAllMocks(); });
async function fixture(plan: unknown = 'free') {
  directory = await mkdtemp(join(tmpdir(), 'render-worker-'));
  db.getRenderInput.mockResolvedValue({ index: 1, object_key: 'source', actual_bytes: '10', plan,
    start_seconds: '0', end_seconds: '20', words: [], code: 'AB23456789' });
  db.setRenderDeferred.mockResolvedValue(true); db.retryRender.mockResolvedValue(null);
  db.publishRenderResult.mockImplementation(async (_pool, _attempt, _result, publish: () => Promise<void>) => { await publish(); return true; });
  return { pool: {} as Pool, directory, origin: 'https://clipmaker.aicoding.space',
    download: vi.fn(async (_key: string, path: string) => { await writeFile(path, 'source'); }),
    render: vi.fn(async (opts: { outputPath: string }) => { await writeFile(opts.outputPath, 'video'); return { duration_seconds: 20, packshot: null, music: null as import('../apps/worker/src/render/music').MusicMix | null }; }),
    thumbnail: vi.fn(async (_path: string, output: string) => { await writeFile(output, 'thumb'); }),
    storage: { delete: vi.fn(async () => {}), put: vi.fn(async () => 5) },
    enqueue: vi.fn(async () => {}), available: vi.fn(async () => 30n) };
}
it('disk reserve before S3 GET; deferred heartbeat and zero download/render calls', async () => {
  const deps = await fixture(); deps.available.mockResolvedValue(29n);
  expect(await handleRenderJob(attempt, deps)).toBe('deferred');
  expect(deps.download).not.toHaveBeenCalled(); expect(deps.render).not.toHaveBeenCalled();
  expect(db.setRenderDeferred).toHaveBeenCalledWith(deps.pool, attempt, true);
  expect(await readdir(directory)).toEqual([]);
});
it.each(['free', 'paid'])('DB plan %s controls filter and canonical key, not job payload', async plan => {
  const deps = await fixture(plan);
  expect(await handleRenderJob({ ...attempt, watermark: false } as Attempt, deps)).toBe('done');
  expect(deps.render).toHaveBeenCalledWith(expect.objectContaining({ watermark: plan !== 'paid', code: 'AB23456789' }));
  expect(deps.storage.put.mock.calls[0]).toEqual(expect.arrayContaining([`clips/${plan}/video/clip.mp4`]));
  expect(await readdir(directory)).toEqual([]);
});
it('failure cleans working directory and schedules only DB-issued retry', async () => {
  const deps = await fixture(); deps.render.mockRejectedValue(new Error('ffmpeg died'));
  db.retryRender.mockResolvedValue({ ...attempt, fence: 5, attempt_no: 2 });
  expect(await handleRenderJob(attempt, deps)).toBe('failed');
  expect(await readdir(directory)).toEqual([]); expect(deps.storage.put).not.toHaveBeenCalled();
  expect(deps.enqueue).toHaveBeenCalledWith(expect.objectContaining({ fence: 5 }), 2000);
});
it('stale input does not download or publish', async () => {
  const deps = await fixture(); db.getRenderInput.mockResolvedValue(null);
  expect(await handleRenderJob(attempt, deps)).toBe('stale'); expect(deps.download).not.toHaveBeenCalled();
});
it('RD-002 worker logs attempt identity and sanitized non-ffmpeg failure before retry', async () => {
  const deps = await fixture(), log = vi.spyOn(console, 'error').mockImplementation(() => {});
  deps.storage.put.mockRejectedValue(new Error('S3 denied https://example.invalid/?X-Amz-Signature=PRIVATE_SIGNATURE'));
  db.retryRender.mockImplementation(async () => {
    expect(log).toHaveBeenCalledTimes(1);
    return { ...attempt, fence: 5, attempt_no: 2 };
  });
  deps.enqueue.mockRejectedValue(new Error('Redis offline redis://user:PRIVATE_PASSWORD@example.invalid'));
  expect(await handleRenderJob(attempt, deps)).toBe('failed');
  expect(JSON.parse(log.mock.calls[0]![0] as string)).toMatchObject({ event: 'render_attempt_failed',
    video_id: 'video', clip_id: 'clip', fence: 4, message: 'S3 denied [redacted-url]' });
  expect(log).toHaveBeenCalledTimes(2);
  expect(JSON.stringify(log.mock.calls)).not.toMatch(/PRIVATE_|https:\/\/|redis:\/\//);
});

it('SL-008 real geometry failure is classified before ffmpeg and never enqueued', async () => {
  const { renderClip } = await import('../apps/worker/src/render/ffmpeg');
  const exec = await import('../apps/worker/src/render/exec');
  const encoding = vi.spyOn(exec, 'execFFmpeg');
  const deps = await fixture();
  deps.origin = 'https://clipmkr.ru';
  db.getRenderInput.mockResolvedValue({ index: 1, object_key: 'source', actual_bytes: '10', plan: 'free',
    start_seconds: '0', end_seconds: '20', words: [], code: 'W'.repeat(10) });
  expect(await handleRenderJob(attempt, { ...deps, render: renderClip })).toBe('failed');
  expect(db.retryRender).toHaveBeenCalledWith(deps.pool, attempt, 'watermark_geometry');
  expect(encoding).not.toHaveBeenCalled();
  expect(deps.enqueue).not.toHaveBeenCalled();
  expect(deps.thumbnail).not.toHaveBeenCalled(); expect(deps.storage.put).not.toHaveBeenCalled();
  expect(await readdir(directory)).toEqual([]);
});

it('music contract comes from rendered fact, off hash stays equal to main', async () => {
  const { readFile } = await import('node:fs/promises');
  const baseline = JSON.parse(await readFile('tests/fixtures/music-bed/baseline.json', 'utf8')).contract;
  const deps = await fixture();
  db.getRenderInput.mockResolvedValue({ ...(await db.getRenderInput()), music: true });
  expect(await handleRenderJob(attempt, deps)).toBe('done');
  const calls = () => deps.storage.put.mock.calls as unknown as [string, string, string, string][];
  expect(calls()[0]![3]).toBe(baseline);
  deps.render.mockImplementation(async opts => { await writeFile(opts.outputPath, 'video'); return { duration_seconds: 20, packshot: null, music: { track: 'id:sha256', gain_db: -23 } }; });
  expect(await handleRenderJob(attempt, deps)).toBe('done');
  expect(calls()[2]![3]).not.toBe(baseline);
  expect(deps.render).toHaveBeenCalledWith(expect.objectContaining({ music: true }));
});

it('rerender uses v2 keys, forwards selection, persists actual mixed track and provides deletion callback', async () => {
  const deps = await fixture();
  db.getRenderInput.mockResolvedValue({ ...(await db.getRenderInput()), render_version: 2, music_track_id: 'holizna-bubbles', music: false });
  deps.render.mockImplementation(async opts => { await writeFile(opts.outputPath, 'video'); return { duration_seconds: 20, packshot: null, music: { track: 'holizna-bubbles:sha256', gain_db: -23 } }; });
  expect(await handleRenderJob({ ...attempt, rerender: true }, deps)).toBe('done');
  expect(deps.render).toHaveBeenCalledWith(expect.objectContaining({ music: false, musicTrackId: 'holizna-bubbles' }));
  expect(deps.storage.put.mock.calls[0]).toContain('clips/free/video/clip-v2.mp4');
  expect(deps.storage.put.mock.calls[1]).toContain('thumbs/video/clip-v2.jpg');
  expect(db.publishRenderResult.mock.calls[0]![2]).toMatchObject({ rendered_music_track_id: 'holizna-bubbles' });
  await db.publishRenderResult.mock.calls[0]![4]('actual-old-key');
  expect(deps.storage.delete).toHaveBeenCalledWith('actual-old-key');
});

it('attempt heartbeat precedes source download and publishes skip reason', async () => {
  const deps = await fixture();
  deps.download.mockImplementation(async (_key, path) => {
    expect(db.setRenderDeferred).toHaveBeenCalledWith(deps.pool, attempt, false);
    await writeFile(path, 'source');
  });
  deps.render.mockImplementation(async opts => { await writeFile(opts.outputPath, 'video'); return {
    duration_seconds: 20, packshot: null, music: null, music_skip_reason: 'speech_too_quiet' as const }; });
  expect(await handleRenderJob(attempt, deps)).toBe('done');
  expect(db.publishRenderResult).toHaveBeenCalledWith(deps.pool, attempt,
    expect.objectContaining({ music_skip_reason: 'speech_too_quiet', rendered_music_track_id: 'none' }), expect.any(Function), expect.any(Function));
});
