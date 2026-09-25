import { afterEach, expect, it, vi } from 'vitest';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import * as loudness from '../apps/worker/src/render/loudness';
import * as exec from '../apps/worker/src/render/exec';
import * as probe from '../apps/worker/src/render/probe';
import { renderClip } from '../apps/worker/src/render/ffmpeg';
import * as music from '../apps/worker/src/render/music';
import { TEST_MUSIC_TRACKS } from './fixtures/music-catalogue';
import * as pack from '../apps/worker/src/render/packshot';
import { resetStingerCache, STINGER_MARGIN_LU, FLASH_PEAK, FLASH_HALF_WIDTH_SECONDS } from '../apps/worker/src/render/packshot';
const EXPECTED_GAIN = Math.floor(Math.min(-16 - STINGER_MARGIN_LU + 13, -3 + 0.8) * 10) / 10;
import { RENDER_FONT_SHA256 } from '../apps/worker/src/render/watermark';
const db = vi.hoisted(() => ({ getRenderInput: vi.fn(), setRenderDeferred: vi.fn(), retryRender: vi.fn(), publishRenderResult: vi.fn() }));
vi.mock('@clipmaker/db', () => db);
import { handleRenderJob } from '../apps/worker/src/workers/render';
afterEach(() => { vi.restoreAllMocks(); resetStingerCache(); });
it('hash comes from actual packshot; absent equals HEAD music-only and includes all estimates', async () => {
  vi.spyOn(probe, 'probeDuration').mockResolvedValue(20);
  vi.spyOn(probe, 'probeVideoStream').mockResolvedValue(null);
  vi.spyOn(loudness, 'measureLoudness').mockImplementation(async path => path.includes('komiku') ? -15 : -20);
  const full = vi.spyOn(loudness, 'measureFullLoudness').mockRejectedValue(new exec.FFmpegError('ffmpeg_failed'));
  const encode = vi.spyOn(exec, 'execFFmpeg').mockImplementation(async args => { await writeFile(args.at(-1)!, 'video'); });
  const directory = await mkdtemp('/tmp/pack-contract-');
  const input = { index: 1, object_key: 'source', actual_bytes: '10', plan: 'free', start_seconds: '0', end_seconds: '20', words: [], code: 'AB23456789', music: true };
  db.getRenderInput.mockResolvedValue(input); db.setRenderDeferred.mockResolvedValue(true);
  db.publishRenderResult.mockImplementation(async (_p, _a, _r, publish) => { await publish(); return true; });
  const hashes: string[] = [];
  const origin = 'https://clipmaker.aicoding.space';
  const deps = { pool: {} as never, directory, origin, download: async (_k: string, p: string) => { await writeFile(p, 'source'); },
    // Baseline uses historical worker fixture geometry. A mock renderer transfers actual render outcome.
    render: async (opts: Parameters<typeof renderClip>[0]) => renderClip({ ...opts, code: 'WWWWWW', origin: 'https://clipmkr.ru' }),
    thumbnail: async (_p: string, o: string) => { await writeFile(o, 'thumb'); },
    storage: { delete: vi.fn(async () => {}), put: async (_k: string, _p: string, _t: string, c: string) => { hashes.push(c); return 5; } }, enqueue: async () => {}, available: async () => 30n };
  const attempt = { video_id: 'video', clip_id: 'clip', fence: 4, stage: 'render' as const, series_no: 1, attempt_no: 1, status: 'running' as const };
  try {
    expect(await handleRenderJob(attempt, deps)).toBe('done');
    expect(hashes[0]).toBe(JSON.parse(await readFile('tests/fixtures/pack-shot/music-only.json', 'utf8')).contract);
    const realSelectTrack = music.selectTrack;
    const selection = vi.spyOn(music, 'selectTrack').mockImplementation(index => realSelectTrack(index, TEST_MUSIC_TRACKS));
    input.index = 2;
    expect(await handleRenderJob(attempt, deps)).toBe('done');
    const selected = TEST_MUSIC_TRACKS[1];
    const args = encode.mock.calls.at(-1)![0];
    expect(args.flatMap((arg, i) => arg === '-i' ? [args[i + 1]] : []).slice(1)).toEqual([selected.path]);
    const selectedContract = createHash('sha256').update(JSON.stringify({ renderer: 'render-and-watermark-v1',
      video: 'video', clip: 'clip', source: 'source', sourceBytes: '10', start: '0', end: '20', words: [], watermark: true,
      origin, code: input.code, font: RENDER_FONT_SHA256, music: `${selected.id}:${selected.sha256}`, margin: 18, gain_db: -23 })).digest('hex');
    expect(hashes[2]).toBe(selectedContract);
    expect(hashes[2]).not.toBe(hashes[0]);
    selection.mockRestore();
    input.index = 1;
    hashes.splice(2);
    full.mockResolvedValueOnce({ integrated: -16, peak: -4 }).mockResolvedValue({ integrated: -13, peak: -0.8 });
    expect(await handleRenderJob(attempt, deps)).toBe('done');
    expect(hashes[2]).not.toBe(hashes[0]);
    const { MUSIC_TRACKS, STINGERS } = await import('../apps/worker/src/render/music');
    const expected = createHash('sha256').update(JSON.stringify({ renderer: 'render-and-watermark-v1',
      video: 'video', clip: 'clip', source: 'source', sourceBytes: '10', start: '0', end: '20', words: [], watermark: true,
      origin, code: input.code, font: RENDER_FONT_SHA256, music: `${MUSIC_TRACKS[0].id}:${MUSIC_TRACKS[0].sha256}`, margin: 18, gain_db: -23,
      packshot: { stinger: `${STINGERS[0].id}:${STINGERS[0].sha256}`, gain_db: EXPECTED_GAIN, margin: STINGER_MARGIN_LU, envelope: 'atrim=0:0.8,afade=t=out:st=0.6:d=0.2', flash: `v1:${FLASH_PEAK}:${FLASH_HALF_WIDTH_SECONDS}` } })).digest('hex');
    expect(hashes[2]).toBe(expected);
    // Keep measured gains identical: only the envelope changes render identity.
    full.mockResolvedValueOnce({ integrated: -16, peak: -4 });
    vi.spyOn(pack as { readonly STINGER_ENVELOPE: string }, 'STINGER_ENVELOPE', 'get').mockReturnValue('atrim=0:0.8,afade=t=out:st=0.5:d=0.3');
    expect(await handleRenderJob(attempt, deps)).toBe('done');
    expect(hashes[4]).not.toBe(hashes[2]);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
