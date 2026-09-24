import { afterAll, beforeAll, expect, it, vi } from 'vitest';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildMusicAudioGraph, MUSIC_TRACKS, selectTrack, MUSIC_MARGIN_LU, prepareMusic } from '../apps/worker/src/render/music';
import { measureLoudness, parseIntegratedLoudness } from '../apps/worker/src/render/loudness';
import { renderClip } from '../apps/worker/src/render/ffmpeg';
const exec = promisify(execFile), duration = 20;
let dir: string, speech: string;
const track = MUSIC_TRACKS[0].path;
async function ff(args: string[]) { return exec('ffmpeg', ['-nostdin', '-hide_banner', '-y', ...args], { maxBuffer: 2_000_000 }); }
async function level(path: string, filter = 'anull') {
  return parseIntegratedLoudness((await ff(['-i', path, '-vn', '-af', `${filter},ebur128`, '-f', 'null', '-'])).stderr);
}
async function mix(name: string, gain: number, input = speech, selectedPath = track) {
  const output = join(dir, name + '.wav');
  await ff(['-i', input, '-i', selectedPath, '-filter_complex', buildMusicAudioGraph(gain, duration), '-map', '[aout]', '-t', String(duration), '-ac', '2', output]);
  return output;
}
beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'music-media-')); speech = join(dir, 'speech.wav');
  await ff(['-f', 'lavfi', '-i', `sine=frequency=1000:duration=${duration}`, '-af', 'volume=0.5', '-ac', '2', speech]);
});
afterAll(async () => { if (dir) await rm(dir, { recursive: true, force: true }); });
it('G1 silent music preserves speech within 0.1 LU', async () => {
  const base = await level(speech), mixed = await level(await mix('silent-bed', -Infinity));
  console.log(JSON.stringify({ guard: 'G1', base, mixed }));
  expect(Math.abs(mixed - base)).toBeLessThanOrEqual(0.1);
});
it.each([1, 5])('G2 real bed through production graph respects measured speech minus margin, clip %s', async clipIndex => {
  const track = selectTrack(clipIndex - 1);
  const s = await measureLoudness(speech, 0, duration), t = await measureLoudness(track.path, 0, duration);
  const chosen = await prepareMusic(speech, 0, duration, track); expect(chosen).not.toBeNull();
  expect(t).toBeGreaterThan(s - MUSIC_MARGIN_LU + 0.5);
  const silence = join(dir, 'silence.wav');
  await ff(['-f', 'lavfi', '-i', `anullsrc=r=44100:cl=stereo`, '-t', String(duration), silence]);
  const bed = await measureLoudness(await mix('bed-only', chosen!.gain_db, silence, chosen!.path), 0, duration);
  console.log(JSON.stringify({ guard: 'G2', speech_lufs: s, track_lufs: t, gain_db: chosen!.gain_db, bed_lufs: bed }));
  expect(bed).toBeLessThanOrEqual(s - MUSIC_MARGIN_LU + 0.5);
});
it.each([1, 5])('G3 encoded mix true peak stays below -1 dBTP, clip %s', async clipIndex => {
  // Short periodic louder bursts provide crest factor, unlike a steady sine.
  const input = join(dir, 'crest.wav');
  await ff(['-f', 'lavfi', '-i', `aevalsrc=0.20*sin(2*PI*1000*t)*(1+2*lt(mod(t\\,1)\\,0.025)):s=44100:d=${duration}`, '-ac', '2', input]);
  const chosen = await prepareMusic(input, 0, duration, selectTrack(clipIndex - 1)); expect(chosen).not.toBeNull();
  const output = join(dir, 'peak.mp4');
  const logMix = vi.spyOn(console, 'info');
  const result = await renderClip({ clipIndex, inputPath: input, outputPath: output, startTime: 0, endTime: duration,
    format: 'portrait', words: [], watermark: false, music: true, origin: 'https://clipmkr.ru', code: 'WWWWWW' });
  expect(result.music?.track).toBe(chosen!.track);
  expect(logMix).toHaveBeenCalledWith(expect.stringContaining('music_mix'));
  logMix.mockRestore();
  const log = (await ff(['-i', output, '-af', 'ebur128=peak=true', '-f', 'null', '-'])).stderr;
  const peak = Number(log.slice(log.lastIndexOf('Summary:')).match(/Peak:\s*([-\d.]+)\s+dBFS/)?.[1]);
  console.log(JSON.stringify({ guard: 'G3', speech_lufs: await measureLoudness(input, 0, duration), gain_db: chosen!.gain_db, peak_dbtp: peak }));
  expect(Number.isFinite(peak)).toBe(true); expect(peak).toBeLessThanOrEqual(-1);
}, 180_000);
it('real render music true mixes and adds out-of-tone energy', async () => {
  const off = join(dir, 'off.mp4'), on = join(dir, 'on.mp4');
  const opts = { inputPath: speech, startTime: 0, endTime: duration, format: 'portrait' as const,
    words: [], watermark: false, origin: 'https://clipmkr.ru', code: 'WWWWWW' };
  const log = vi.spyOn(console, 'info');
  try {
    expect((await renderClip({ ...opts, outputPath: off })).music).toBeNull();
    expect((await renderClip({ ...opts, outputPath: on, music: true })).music).not.toBeNull();
    expect(log).toHaveBeenCalledWith(expect.stringContaining('music_mix'));
    expect(log.mock.calls.some(args => String(args[0]).includes('music_skipped'))).toBe(false);
    const filter = 'lowpass=f=300';
    const before = await level(off, filter), after = await level(on, filter);
    console.log(JSON.stringify({ guard: 'real-render', off_band_lufs: before, on_band_lufs: after }));
    expect(after - before).toBeGreaterThan(3);
    const data = JSON.parse((await exec('ffprobe', ['-v', 'error', '-show_format', '-of', 'json', on])).stdout);
    expect(Number(data.format.duration)).toBeCloseTo(duration, 0);
  } finally { log.mockRestore(); }
}, 180_000);

it('real video input renders music with video and audio streams at clip duration', async () => {
  const input = join(dir, 'source-video.mp4'), output = join(dir, 'music-video.mp4');
  await ff(['-f', 'lavfi', '-i', `testsrc=size=320x180:rate=25:duration=${duration + 2}`,
    '-f', 'lavfi', '-i', `sine=frequency=1000:duration=${duration + 2}`,
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', input]);
  const log = vi.spyOn(console, 'info');
  try {
    const result = await renderClip({ inputPath: input, outputPath: output, startTime: 2, endTime: duration + 2,
      format: 'portrait', words: [], watermark: false, music: true, origin: 'https://clipmkr.ru', code: 'WWWWWW' });
    expect(result.music).not.toBeNull();
    expect(log).toHaveBeenCalledWith(expect.stringContaining('"event":"music_mix"'));
    const data = JSON.parse((await exec('ffprobe', ['-v', 'error', '-show_format', '-show_streams', '-of', 'json', output])).stdout);
    expect(Number(data.format.duration)).toBeCloseTo(duration, 1);
    expect(data.streams).toEqual(expect.arrayContaining([
      expect.objectContaining({ codec_type: 'video', width: 1080, height: 1920 }),
      expect.objectContaining({ codec_type: 'audio' }),
    ]));
  } finally { log.mockRestore(); }
}, 180_000);
