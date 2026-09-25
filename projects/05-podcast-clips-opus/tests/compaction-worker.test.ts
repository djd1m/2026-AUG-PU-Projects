import { afterEach, expect, it, vi } from 'vitest';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { FFmpegError } from '../apps/worker/src/render/exec';
import * as envelope from '../apps/worker/src/render/envelope';
const db = vi.hoisted(() => ({ getRenderInput: vi.fn(), saveCutPlan: vi.fn(), saveLoudnessMedian: vi.fn(), setRenderDeferred: vi.fn(), retryRender: vi.fn(), publishRenderResult: vi.fn() }));
vi.mock('@clipmaker/db', () => db);
import { handleRenderJob } from '../apps/worker/src/workers/render';
const attempt = { video_id: 'video', clip_id: 'clip', fence: 4, stage: 'render' as const, series_no: 1, attempt_no: 1, status: 'running' as const };
let directory: string;
afterEach(async () => { if (directory) await rm(directory, { recursive: true, force: true }); vi.restoreAllMocks(); vi.resetAllMocks(); });
async function setup() {
  directory = await mkdtemp('/tmp/compaction-worker-');
  const input = { compact: true, cut_plan: null as [number, number][] | null, loudness_median_db: null as string | null,
    index: 1, object_key: 'source', actual_bytes: '10', plan: 'paid', start_seconds: '10', end_seconds: '40', words: [], code: 'ABCDEF' };
  db.getRenderInput.mockResolvedValue(input); db.setRenderDeferred.mockResolvedValue(true);
  db.saveLoudnessMedian.mockResolvedValue(-20);
  db.saveCutPlan.mockImplementation(async (_p, _a, plan) => { input.cut_plan = plan; return plan; });
  db.publishRenderResult.mockImplementation(async (_p, _a, _r, publish) => { await publish(); return true; });
  const deps = { pool: {} as never, directory, origin: 'https://clipmkr.ru', download: async (_k: string, p: string) => { await writeFile(p, 'source'); },
    render: vi.fn(async (o: { outputPath: string }) => { await writeFile(o.outputPath, 'video'); return { duration_seconds: 27.16, music: null, packshot: null }; }),
    thumbnail: vi.fn(async (_p: string, o: string, _t: number) => { await writeFile(o, 'thumb'); }),
    storage: { delete: vi.fn(async () => {}), put: vi.fn(async (_k: string, _p: string, _type: string, _contract: string) => 5) }, enqueue: vi.fn(async () => {}), available: async () => 30n };
  return { input, deps };
}
it('persist/reread wins over computed candidate; retry reads only DB plan; duration and contract', async () => {
  const { input, deps } = await setup();
  const measure = vi.spyOn(envelope, 'measureEnvelope').mockResolvedValue(Array(1500).fill(-20));
  const winner: [number, number][] = [[10, 20], [22, 40]];
  db.saveCutPlan.mockImplementation(async () => { input.cut_plan = winner; return winner; });
  expect(await handleRenderJob(attempt, deps)).toBe('done');
  expect(deps.render).toHaveBeenCalledWith(expect.objectContaining({ cutPlan: winner }));
  expect(deps.thumbnail.mock.calls[0]![2]).toBeCloseTo(27.92 * .25);
  expect(db.publishRenderResult.mock.calls[0]![2]).toMatchObject({ duration_seconds: 27.16 });
  const hash = deps.storage.put.mock.calls[0]![3];
  expect(await handleRenderJob(attempt, deps)).toBe('done');
  expect(measure).toHaveBeenCalledTimes(2); expect(db.saveCutPlan).toHaveBeenCalledTimes(1);
  expect(deps.storage.put.mock.calls[2]![3]).toBe(hash);
});
it('analysis error freezes one-piece fallback across retries', async () => {
  const { input, deps } = await setup();
  const measure = vi.spyOn(envelope, 'measureEnvelope').mockRejectedValue(new FFmpegError('ffmpeg_failed'));
  expect(await handleRenderJob(attempt, deps)).toBe('done');
  expect(input.cut_plan).toEqual([[10, 40]]);
  expect(await handleRenderJob(attempt, deps)).toBe('done'); expect(measure).toHaveBeenCalledTimes(1);
});
it('off never measures or saves; cancellation never freezes a fallback', async () => {
  const { input, deps } = await setup(); input.compact = false;
  const measure = vi.spyOn(envelope, 'measureEnvelope');
  expect(await handleRenderJob(attempt, deps)).toBe('done'); expect(measure).not.toHaveBeenCalled();
  input.compact = true;
  const controller = new AbortController(); vi.spyOn(AbortSignal, 'timeout').mockReturnValue(controller.signal);
  measure.mockImplementation(async () => { controller.abort(new Error('cancelled')); throw controller.signal.reason; });
  expect(await handleRenderJob(attempt, deps)).toBe('failed'); expect(db.saveCutPlan).not.toHaveBeenCalled();
});
it('uses rounded reread median, not the measured candidate', async () => {
  const { deps } = await setup();
  // Candidate median -20.006; DB winner -30 means -40 is not quiet.
  db.saveLoudnessMedian.mockResolvedValue(-30);
  vi.spyOn(envelope, 'measureEnvelope').mockResolvedValueOnce([-20.006]).mockResolvedValueOnce(Array.from({ length: 1500 }, (_, i) => i >= 200 && i < 250 ? -40 : -20));
  expect(await handleRenderJob(attempt, deps)).toBe('done');
  expect(db.saveLoudnessMedian.mock.calls[0]![2]).toBe(-20.006);
  expect(db.saveCutPlan.mock.calls[0]![2]).toEqual([[10, 40]]);
});
it('one-piece compact contract is byte-identical to compact=false', async () => {
  const { input, deps } = await setup(); input.cut_plan = [[10, 40]];
  expect(await handleRenderJob(attempt, deps)).toBe('done');
  input.compact = false;
  expect(await handleRenderJob(attempt, deps)).toBe('done');
  expect(deps.storage.put.mock.calls[0]![3]).toBe(deps.storage.put.mock.calls[2]![3]);
});

it('DB median write failure retries without persisting a fallback plan', async () => {
  const { input, deps } = await setup();
  vi.spyOn(envelope, 'measureEnvelope').mockResolvedValue([-20]);
  db.saveLoudnessMedian.mockRejectedValue(new Error('Postgres unavailable'));
  const next = { ...attempt, fence: 5, attempt_no: 2 };
  db.retryRender.mockResolvedValue(next);
  expect(await handleRenderJob(attempt, deps)).toBe('failed');
  expect(input.cut_plan).toBeNull(); expect(db.saveCutPlan).not.toHaveBeenCalled();
  expect(deps.render).not.toHaveBeenCalled();
  expect(db.retryRender).toHaveBeenCalledWith(deps.pool, attempt, 'ffmpeg_failed');
  expect(deps.enqueue).toHaveBeenCalledWith(next, 2000);
});
it.each([{ values: [] }, { values: [NaN] }, { values: [Infinity] }])('invalid envelope %j persists a singleton', async ({ values }) => {
  const { input, deps } = await setup();
  vi.spyOn(envelope, 'measureEnvelope').mockResolvedValue(values);
  expect(await handleRenderJob(attempt, deps)).toBe('done');
  expect(input.cut_plan).toEqual([[10, 40]]);
});
it.each([
  {}, [], [[10]], [[10, 20, 30]], [['10', 40]], [[10, NaN]], [[10, Infinity]],
  [[9, 40]], [[10, 41]], [[20, 10]], [[10, 10]], [[10, 25], [20, 40]], [[30, 40], [10, 20]],
].map(value => ({ value })))('rejects invalid persisted cut_plan %j before rendering', async ({ value }) => {
  const { input, deps } = await setup(); input.cut_plan = value as typeof input.cut_plan;
  const log = vi.spyOn(console, 'error').mockImplementation(() => {});
  expect(await handleRenderJob(attempt, deps)).toBe('failed');
  expect(deps.render).not.toHaveBeenCalled(); expect(db.saveCutPlan).not.toHaveBeenCalled();
  expect(log).toHaveBeenCalledWith(expect.stringContaining('Непригодный cut_plan'));
});
