import { afterEach, expect, it, vi } from 'vitest';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import * as loudness from '../apps/worker/src/render/loudness';
import * as exec from '../apps/worker/src/render/exec';
import * as probe from '../apps/worker/src/render/probe';
import * as faces from '../apps/worker/src/render/faces';
import { renderClip } from '../apps/worker/src/render/ffmpeg';
import { STINGERS, MUSIC_TRACKS } from '../apps/worker/src/render/music';
import { preparePackshot, resetStingerCache, buildFlashFilter, STINGER_MARGIN_LU } from '../apps/worker/src/render/packshot';
// Моки: речь −16 LUFS, сэмпл −13 LUFS с пиком −0,8 dBTP → усиление = min(−16 − M + 13, −3 + 0,8).
const EXPECTED_GAIN = Math.floor(Math.min(-16 - STINGER_MARGIN_LU + 13, -3 + 0.8) * 10) / 10;
const options = { inputPath: '/tmp/input.wav', outputPath: '/tmp/output.mp4', startTime: 2, endTime: 22,
  format: 'portrait' as const, words: [{ word: 'Привет', start: 3, end: 4 }], watermark: true,
  origin: 'https://clipmkr.ru', code: 'WWWWWW', music: true, clipIndex: 1 };
afterEach(() => { vi.restoreAllMocks(); resetStingerCache(); });
function setup() {
  vi.spyOn(probe, 'probeDuration').mockResolvedValue(20);
  vi.spyOn(probe, 'probeVideoStream').mockResolvedValue(null);
  vi.spyOn(faces, 'detectFaces').mockResolvedValue(null);
  const band = vi.spyOn(loudness, 'measureLoudness').mockResolvedValueOnce(-20).mockResolvedValueOnce(-15);
  const full = vi.spyOn(loudness, 'measureFullLoudness').mockResolvedValueOnce({ integrated: -16, peak: -4 })
    .mockResolvedValue({ integrated: -13, peak: -0.8 });
  const encode = vi.spyOn(exec, 'execFFmpeg').mockResolvedValue();
  return { full, band, encode };
}
it.each([null, { index: 2, width: 1920, height: 1080 }])('third input, one mix, flash ordering and fractional clock %j', async video => {
  const { encode, band, full } = setup(); vi.mocked(probe.probeVideoStream).mockResolvedValue(video);
  const result = await renderClip({ ...options, endTime: 24.47 });
  expect(result.packshot?.gain_db).toBe(EXPECTED_GAIN);
  expect(result.music).toEqual({ track: `${MUSIC_TRACKS[0].id}:${MUSIC_TRACKS[0].sha256}`, gain_db: -23 });
  expect(band).toHaveBeenCalledTimes(2); expect(full).toHaveBeenCalledTimes(2);
  const args = encode.mock.calls[0]![0], graph = args[args.indexOf('-filter_complex') + 1]!;
  expect(encode).toHaveBeenCalledTimes(1); expect(args.filter(x => x === '-i')).toHaveLength(3);
  expect(args.slice(args.indexOf(STINGERS[0].path) - 3, args.indexOf(STINGERS[0].path) + 2))
    .toEqual(['-i', MUSIC_TRACKS[0].path, '-i', STINGERS[0].path, '-filter_complex']);
  expect(graph.match(/amix=/g)).toHaveLength(1);
  expect(graph).toContain('amix=inputs=3:duration=first:normalize=0');
  expect(graph.match(/aformat=/g)).toHaveLength(3);
  expect(graph).toContain('adelay=21670:all=1');
  expect(graph).toContain(buildFlashFilter(21670));
  expect(graph.indexOf('ass=')).toBeLessThan(graph.indexOf('eq=brightness'));
  expect(graph.indexOf('eq=brightness')).toBeLessThan(graph.indexOf('drawbox='));
  expect(graph.split('[video]')[0]).not.toMatch(/\b(?:tpad|concat|loop|setpts)\b/);
});
it.each(['ffmpeg_failed', 'ffmpeg_timeout'] as const)('music-only baseline survives sample %s', async reason => {
  const { full, encode } = setup();
  full.mockReset().mockResolvedValueOnce({ integrated: -16, peak: -4 }).mockRejectedValueOnce(new exec.FFmpegError(reason));
  const log = vi.spyOn(console, 'info');
  const result = await renderClip(options);
  expect(result.music?.gain_db).toBe(-23); expect(result.packshot).toBeNull();
  expect(log).toHaveBeenCalledWith(JSON.stringify({ event: 'packshot_skipped', reason: 'measure_failed' }));
  const args = encode.mock.calls[0]![0].map(s => s.replace(/\/tmp\/render-[^/]+/g, '<TEMP>').replaceAll(process.cwd() + '/', '<ROOT>/'));
  const baseline = JSON.parse(await readFile('tests/fixtures/pack-shot/music-only.json', 'utf8'));
  expect(JSON.stringify(args)).toBe(JSON.stringify(baseline.args));
});
it('successful finite sample is cached, speech full is not; reset discards it', async () => {
  const full = vi.spyOn(loudness, 'measureFullLoudness').mockResolvedValue({ integrated: -16, peak: -4 });
  await preparePackshot('input', 2, 20); await preparePackshot('input', 2, 20);
  expect(full).toHaveBeenCalledTimes(3);
  expect(full.mock.calls.filter(c => c[0] === STINGERS[0].path)).toHaveLength(1);
  resetStingerCache(); await preparePackshot('input', 2, 20); expect(full).toHaveBeenCalledTimes(5);
});
it.each(['ffmpeg_failed', 'ffmpeg_timeout', 'invalid', 'abort'])('sample cache does not retain %s', async reason => {
  const controller = new AbortController();
  const full = vi.spyOn(loudness, 'measureFullLoudness').mockResolvedValueOnce({ integrated: -16, peak: -4 })
    .mockImplementationOnce(async () => {
      if (reason === 'invalid') return { integrated: NaN, peak: NaN };
      if (reason === 'abort') controller.abort(new Error('cancelled'));
      throw new exec.FFmpegError(reason === 'ffmpeg_timeout' ? 'ffmpeg_timeout' : 'ffmpeg_failed');
    }).mockResolvedValue({ integrated: -16, peak: -4 });
  if (reason === 'abort') await expect(preparePackshot('input', 0, 20, controller.signal)).rejects.toThrow('cancelled');
  else expect(await preparePackshot('input', 0, 20)).toBeNull();
  expect(await preparePackshot('input', 0, 20)).not.toBeNull(); expect(full).toHaveBeenCalledTimes(4);
});
it('gain respects full-band loudness, sample peak and amplification ceiling', async () => {
  const full = vi.spyOn(loudness, 'measureFullLoudness');
  for (const [speech, sample, peak, expected] of [[-16, -13, -0.8, EXPECTED_GAIN], [-20, -15, -10, -5 - STINGER_MARGIN_LU], [-10, -30, -1, -2], [-10, -50, -40, null]]) {
    resetStingerCache(); full.mockReset().mockResolvedValueOnce({ integrated: speech!, peak: -4 })
      .mockResolvedValueOnce({ integrated: sample!, peak: peak! });
    const result = await preparePackshot('input', 0, 20);
    expect(result?.gain_db ?? null).toBe(expected);
  }
});
it('catalogue pins bytes and enough duration', async () => {
  const sample = STINGERS[0];
  expect(createHash('sha256').update(await readFile(sample.path)).digest('hex')).toBe(sample.sha256);
  const { stdout } = await promisify(execFile)('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'json', sample.path]);
  expect(Number(JSON.parse(stdout).format.duration)).toBeGreaterThanOrEqual(0.8);
});
it('true peak parser uses only final summary and rejects missing/invalid peak', () => {
  expect(loudness.parseTruePeak('Peak: 20 dBFS\nSummary:\n True peak:\n Peak: -0.8 dBFS')).toBe(-0.8);
  for (const bad of ['', 'Peak: -1 dBFS', 'Summary:\n Peak: rubbish dBFS', 'Summary:\n Peak: -inf dBFS']) {
    expect(Number.isFinite(loudness.parseTruePeak(bad))).toBe(false);
  }
});
