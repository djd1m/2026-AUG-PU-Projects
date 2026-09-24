import { afterEach, expect, it, vi } from 'vitest';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import * as loudness from '../apps/worker/src/render/loudness';
import * as exec from '../apps/worker/src/render/exec';
import * as probe from '../apps/worker/src/render/probe';
import { renderClip } from '../apps/worker/src/render/ffmpeg';
import { resetStingerCache } from '../apps/worker/src/render/packshot';
import { MUSIC_TRACKS } from '../apps/worker/src/render/music';
import { RENDER_FONT_SHA256 } from '../apps/worker/src/render/watermark';
const db = vi.hoisted(() => ({ getRenderInput: vi.fn(), setRenderDeferred: vi.fn(), retryRender: vi.fn(), publishRenderResult: vi.fn() }));
vi.mock('@clipmaker/db', () => db);
import { handleRenderJob } from '../apps/worker/src/workers/render';
afterEach(() => { vi.restoreAllMocks(); resetStingerCache(); });
it('actual teaser bytes bind contract; absent equals baseline and music-only fixtures', async () => {
  vi.spyOn(probe, 'probeDuration').mockResolvedValue(20);
  vi.spyOn(probe, 'probeVideoStream').mockResolvedValue(null);
  vi.spyOn(loudness, 'measureLoudness').mockImplementation(async p => p.includes('komiku') ? -15 : -20);
  vi.spyOn(loudness, 'measureFullLoudness').mockRejectedValue(new exec.FFmpegError('ffmpeg_failed'));
  let fileBytes = Buffer.alloc(0);
  vi.spyOn(exec, 'execFFmpeg').mockImplementation(async args => {
    const path = args[args.indexOf('-filter_complex') + 1]!.match(/textfile='([^']+)'/)?.[1];
    if (path) fileBytes = await readFile(path);
    await writeFile(args.at(-1)!, 'video');
  });
  const directory = await mkdtemp('/tmp/teaser-contract-');
  const input = { index: 1, object_key: 'source', actual_bytes: '10', plan: 'free', start_seconds: '0', end_seconds: '20',
    words: [], code: 'AB23456789', music: false, teaser: false, title: '  Заголовок\r\n клипа  ' };
  db.getRenderInput.mockResolvedValue(input); db.setRenderDeferred.mockResolvedValue(true);
  db.publishRenderResult.mockImplementation(async (_p, _a, _r, publish) => { await publish(); return true; });
  db.retryRender.mockClear();
  const hashes: string[] = [], origin = 'https://clipmaker.aicoding.space';
  const deps = { pool: {} as never, directory, origin, download: async (_k: string, p: string) => { await writeFile(p, 'source'); },
    render: async (opts: Parameters<typeof renderClip>[0]) => renderClip({ ...opts, code: 'WWWWWW', origin: 'https://clipmkr.ru' }),
    thumbnail: async (_p: string, o: string) => { await writeFile(o, 'thumb'); },
    storage: { put: async (_k: string, _p: string, _t: string, c: string) => { hashes.push(c); return 5; } }, enqueue: async () => {}, available: async () => 30n };
  const attempt = { video_id: 'video', clip_id: 'clip', fence: 4, stage: 'render' as const, series_no: 1, attempt_no: 1, status: 'running' as const };
  try {
    expect(await handleRenderJob(attempt, deps)).toBe('done');
    expect(hashes[0]).toBe(JSON.parse(await readFile('tests/fixtures/music-bed/baseline.json', 'utf8')).contract);
    input.music = true;
    expect(await handleRenderJob(attempt, deps)).toBe('done');
    expect(hashes[2]).toBe(JSON.parse(await readFile('tests/fixtures/pack-shot/music-only.json', 'utf8')).contract);
    input.teaser = true;
    expect(await handleRenderJob(attempt, deps)).toBe('done');
    expect(fileBytes.toString('utf8')).toBe('Заголовок клипа');
    const expected = createHash('sha256').update(JSON.stringify({ renderer: 'render-and-watermark-v1',
      video: 'video', clip: 'clip', source: 'source', sourceBytes: '10', start: '0', end: '20', words: [], watermark: true,
      origin, code: input.code, font: RENDER_FONT_SHA256,
      teaser: { text_sha256: createHash('sha256').update(fileBytes).digest('hex'), lines: 1, font_size: 84, version: 'v1' },
      music: `${MUSIC_TRACKS[0].id}:${MUSIC_TRACKS[0].sha256}`, margin: 18, gain_db: -23 })).digest('hex');
    expect(hashes[4]).toBe(expected); expect(hashes[4]).not.toBe(hashes[2]);
    input.title = 'Другой заголовок';
    expect(await handleRenderJob(attempt, deps)).toBe('done'); expect(hashes[6]).not.toBe(hashes[4]);
    input.title = '😀';
    expect(await handleRenderJob(attempt, deps)).toBe('done'); expect(hashes[8]).toBe(hashes[2]);
    expect(db.retryRender).not.toHaveBeenCalled();
  } finally { await rm(directory, { recursive: true, force: true }); }
});
