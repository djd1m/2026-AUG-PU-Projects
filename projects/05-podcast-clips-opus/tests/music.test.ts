import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import * as loudness from '../apps/worker/src/render/loudness';
import * as exec from '../apps/worker/src/render/exec';
import * as probe from '../apps/worker/src/render/probe';
import * as faces from '../apps/worker/src/render/faces';
import { renderClip } from '../apps/worker/src/render/ffmpeg';
import { resetStingerCache } from '../apps/worker/src/render/packshot';
import { MUSIC_TRACKS, selectTrack, prepareMusic } from '../apps/worker/src/render/music';
import { createVideoSchema } from '../apps/web/src/server/upload-contract';
const options = { inputPath: '/tmp/input.wav', outputPath: '/tmp/output.mp4', startTime: 2, endTime: 22,
  format: 'portrait' as const, words: [{ word: 'Привет', start: 3, end: 4 }], watermark: true,
  origin: 'https://clipmkr.ru', code: 'WWWWWW', clipIndex: 1 };
beforeEach(() => {
  // Эти тесты — про музыку без пэк-шота.
  resetStingerCache();
  vi.spyOn(loudness, 'measureFullLoudness').mockRejectedValue(new exec.FFmpegError('ffmpeg_failed'));
});
afterEach(() => vi.restoreAllMocks());
it('parser uses final Summary from real silence/sine logs, never frame I', async () => {
  const silence = await readFile('tests/fixtures/music-bed/silence-ffmpeg4.txt', 'utf8');
  const sine = await readFile('tests/fixtures/music-bed/sine-ffmpeg4.txt', 'utf8');
  expect(sine).toMatch(/t:.*I:/);
  expect(loudness.parseIntegratedLoudness(silence)).toBe(-70);
  expect(loudness.parseIntegratedLoudness(sine)).toBeCloseTo(-21.1, 0);
  for (const bad of ['', 'I: -12.0 LUFS', 'Summary:\n I: rubbish LUFS', 'Summary:\n I: -inf LUFS']) {
    expect(Number.isFinite(loudness.parseIntegratedLoudness(bad))).toBe(false);
  }
  expect(loudness.parseIntegratedLoudness('Summary:\n I: -10 LUFS\nSummary:\n I: -25 LUFS')).toBe(-25);
});
it('catalogue bytes and duration are pinned without reading README', async () => {
  expect(MUSIC_TRACKS).toHaveLength(11);
  expect(MUSIC_TRACKS.map(t => t.id)).toEqual([
    'komiku-everything-is-groovy', 'komiku-the-journey-begins', 'komiku-road-1-fight',
    'komiku-little-town-before-big-city', 'komiku-road-3-fight', 'komiku-road-4-chill',
    'komiku-cliff-road-fight', 'komiku-pop-city', 'komiku-dance-with-two-or-more',
    'komiku-to-fight-a-spell-by-dancing', 'komiku-we-have-to-dance-together',
  ]);
  for (const track of MUSIC_TRACKS) {
    expect(createHash('sha256').update(await readFile(track.path)).digest('hex')).toBe(track.sha256);
    const { stdout } = await promisify(execFile)('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'json', track.path]);
    expect(Number(JSON.parse(stdout).format.duration)).toBeGreaterThanOrEqual(75);
  }
});
it('off arguments equal main fixture byte for byte', async () => {
  vi.spyOn(probe, 'probeDuration').mockResolvedValue(20);
  vi.spyOn(probe, 'probeVideoStream').mockResolvedValue(null);
  const measure = vi.spyOn(loudness, 'measureLoudness');
  const encode = vi.spyOn(exec, 'execFFmpeg').mockResolvedValue();
  expect(await renderClip({ ...options, music: false })).toEqual({ duration_seconds: 20, teaser: null, music: null, packshot: null });
  const args = encode.mock.calls[0]![0].map(s => s.replace(/\/tmp\/render-[^/]+/g, '<TEMP>').replaceAll(process.cwd() + '/', '<ROOT>/'));
  expect(args).toEqual(JSON.parse(await readFile('tests/fixtures/music-bed/baseline.json', 'utf8')).args);
  expect(measure).not.toHaveBeenCalled();
});
it.each([null, { index: 2, width: 1920, height: 1080 }])('mix graph is attached in video branch %j', async video => {
  vi.spyOn(probe, 'probeDuration').mockResolvedValue(20);
  vi.spyOn(probe, 'probeVideoStream').mockResolvedValue(video);
  vi.spyOn(faces, 'detectFaces').mockResolvedValue(null);
  vi.spyOn(loudness, 'measureLoudness').mockResolvedValueOnce(-20).mockResolvedValueOnce(-15);
  const encode = vi.spyOn(exec, 'execFFmpeg').mockResolvedValue();
  const result = await renderClip({ ...options, music: true });
  expect(result.music?.gain_db).toBe(-23);
  const args = encode.mock.calls[0]![0];
  expect(args.filter(a => a === '-i')).toHaveLength(2);
  expect(args.slice(args.indexOf(MUSIC_TRACKS[0].path) - 1, args.indexOf(MUSIC_TRACKS[0].path) + 2)).toEqual(['-i', MUSIC_TRACKS[0].path, '-filter_complex']);
  expect(args[args.indexOf('-filter_complex') + 1]).toContain('[video];[0:a:0]');
  expect(args).toContain('[aout]'); expect(args).not.toContain('0:a:0');
});
it.each([NaN, -Infinity, -70, -60])('quiet/invalid speech %s skips, rendering succeeds', async value => {
  vi.spyOn(probe, 'probeDuration').mockResolvedValue(20);
  vi.spyOn(probe, 'probeVideoStream').mockResolvedValue(null);
  vi.spyOn(loudness, 'measureLoudness').mockResolvedValueOnce(value).mockResolvedValueOnce(-15);
  vi.spyOn(exec, 'execFFmpeg').mockResolvedValue();
  const log = vi.spyOn(console, 'info').mockImplementation(() => {});
  expect(await renderClip({ ...options, music: true })).toEqual({ duration_seconds: 20, teaser: null, music: null, packshot: null });
  expect(log).toHaveBeenCalledWith(expect.stringContaining('music_skipped'));
});
it.each([-60, NaN])('invalid track %s skips', async value => {
  vi.spyOn(loudness, 'measureLoudness').mockResolvedValueOnce(-20).mockResolvedValueOnce(value);
  expect(await prepareMusic('input', 0, 20, MUSIC_TRACKS[0])).toBeNull();
});
it('gain ceiling skips rather than amplifying beyond 12 dB', async () => {
  vi.spyOn(loudness, 'measureLoudness').mockResolvedValueOnce(-10).mockResolvedValueOnce(-50);
  const log = vi.spyOn(console, 'info').mockImplementation(() => {});
  expect(await prepareMusic('input', 0, 20, MUSIC_TRACKS[0])).toBeNull();
  expect(log).toHaveBeenCalledWith(JSON.stringify({ event: 'music_skipped', reason: 'gain_out_of_range' }));
});
it.each(['ffmpeg_failed', 'ffmpeg_timeout'] as const)('measurement %s skips music; external cancellation propagates', async reason => {
  vi.spyOn(probe, 'probeDuration').mockResolvedValue(20);
  vi.spyOn(probe, 'probeVideoStream').mockResolvedValue(null);
  const measure = vi.spyOn(loudness, 'measureLoudness').mockRejectedValue(new exec.FFmpegError(reason));
  const encode = vi.spyOn(exec, 'execFFmpeg').mockResolvedValue();
  const log = vi.spyOn(console, 'info').mockImplementation(() => {});
  expect(await renderClip({ ...options, music: true })).toEqual({ duration_seconds: 20, teaser: null, music: null, packshot: null });
  expect(log).toHaveBeenCalledWith(JSON.stringify({ event: 'music_skipped', reason: 'measure_failed' }));
  expect(encode).toHaveBeenCalledTimes(1);
  const controller = new AbortController();
  measure.mockImplementation(async () => { controller.abort(new Error('cancelled')); throw new exec.FFmpegError(reason); });
  const signal = controller.signal;
  await expect(renderClip({ ...options, music: true, signal })).rejects.toThrow('cancelled');
  expect(encode).toHaveBeenCalledTimes(1);
});
it('geometry and probe precede measurements', async () => {
  const measure = vi.spyOn(loudness, 'measureLoudness');
  const check = vi.spyOn(probe, 'probeVideoStream').mockRejectedValue(new Error('probe failed'));
  await expect(renderClip({ ...options, music: true, code: 'W'.repeat(10) })).rejects.toThrow();
  expect(check).not.toHaveBeenCalled(); expect(measure).not.toHaveBeenCalled();
  await expect(renderClip({ ...options, music: true })).rejects.toThrow('probe failed');
  expect(measure).not.toHaveBeenCalled();
});
it('real measurement errors/abort/timeout remain typed and bounded', async () => {
  await expect(loudness.measureLoudness('/no-such-music', 0, 20)).rejects.toMatchObject({ reason: 'ffmpeg_failed' });
  await expect(loudness.execLoudness([], AbortSignal.abort(new Error('cancelled')))).rejects.toThrow('cancelled');
  await expect(loudness.execLoudness(['-re', '-f', 'lavfi', '-i', 'anullsrc', '-f', 'null', '-'], undefined, 10)).rejects.toMatchObject({ reason: 'ffmpeg_timeout' });
});
it('strict upload schema accepts optional boolean only', () => {
  const input = { declared_bytes: 10, filename: 'a.mp3', source: 'upload' };
  expect(createVideoSchema.parse(input).music).toBeUndefined();
  expect(createVideoSchema.parse({ ...input, music: true }).music).toBe(true);
  for (const extra of [{ music: 'true' }, { music: null }, { extra: true }]) expect(createVideoSchema.safeParse({ ...input, ...extra }).success).toBe(false);
});

it('gain rounds to tenths before filter and returned contract', async () => {
  vi.spyOn(probe, 'probeDuration').mockResolvedValue(20);
  vi.spyOn(probe, 'probeVideoStream').mockResolvedValue(null);
  vi.spyOn(loudness, 'measureLoudness').mockResolvedValueOnce(-16.3).mockResolvedValueOnce(-28.2);
  const encode = vi.spyOn(exec, 'execFFmpeg').mockResolvedValue();
  const result = await renderClip({ ...options, music: true });
  expect(result.music?.gain_db).toBe(-6.1);
  expect(JSON.stringify(result.music)).toContain('"gain_db":-6.1}');
  const args = encode.mock.calls[0]![0];
  expect(args[args.indexOf('-filter_complex') + 1]).toContain('volume=-6.1dB,');
});
it('measurement default timeout is two minutes and external abort kills running process', async () => {
  const timer = vi.spyOn(globalThis, 'setTimeout');
  const controller = new AbortController();
  const pending = loudness.execLoudness(['-re', '-f', 'lavfi', '-i', 'anullsrc', '-f', 'null', '-'], controller.signal);
  const rejected = expect(pending).rejects.toThrow('cancelled');
  try {
    expect(timer).toHaveBeenCalledWith(expect.any(Function), 120_000);
  } finally {
    controller.abort(new Error('cancelled'));
    await rejected;
  }
});

it('selection cycles deterministically over the ordered catalogue twice', () => {
  for (let index = 0; index < 22; index++) {
    expect(selectTrack(index)).toBe(MUSIC_TRACKS[index % 11]);
    expect(selectTrack(index)).toBe(selectTrack(index));
  }
  expect(selectTrack(-1)).toBe(MUSIC_TRACKS[10]);
  for (const invalid of [1.5, '3', Infinity, NaN, undefined, null, -Infinity, Number.MAX_SAFE_INTEGER + 1]) {
    expect(selectTrack(invalid)).toBe(MUSIC_TRACKS[0]);
  }
});
it.each([2, 5, 13])('selected track drives measurement, ffmpeg input and identity for clip %s', async clipIndex => {
  vi.spyOn(probe, 'probeDuration').mockResolvedValue(20);
  vi.spyOn(probe, 'probeVideoStream').mockResolvedValue(null);
  const measure = vi.spyOn(loudness, 'measureLoudness').mockResolvedValueOnce(-20).mockResolvedValueOnce(-15);
  const encode = vi.spyOn(exec, 'execFFmpeg').mockResolvedValue();
  const result = await renderClip({ ...options, music: true, clipIndex });
  const track = MUSIC_TRACKS[(clipIndex - 1) % 11]!;
  expect(measure).toHaveBeenNthCalledWith(2, track.path, 0, 20, undefined);
  const args = encode.mock.calls[0]![0];
  const inputs = args.flatMap((arg, i) => arg === '-i' ? [args[i + 1]] : []);
  expect(inputs).toEqual([options.inputPath, track.path]);
  expect(result.music).toEqual({ track: `${track.id}:${track.sha256}`, gain_db: -23 });
});
