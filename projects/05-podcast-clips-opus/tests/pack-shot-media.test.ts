import { afterAll, beforeAll, expect, it, vi } from 'vitest';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { buildMusicAudioGraph, MUSIC_TRACKS, STINGERS, prepareMusic } from '../apps/worker/src/render/music';
import { preparePackshot, resetStingerCache } from '../apps/worker/src/render/packshot';
import * as pack from '../apps/worker/src/render/packshot';
import * as faces from '../apps/worker/src/render/faces';
import { measureFullLoudness, parseIntegratedLoudness, parseTruePeak } from '../apps/worker/src/render/loudness';
import { renderClip } from '../apps/worker/src/render/ffmpeg';
import { watermarkGeometry, FONT_FILE } from '../apps/worker/src/render/watermark';
const exec = promisify(execFile), duration = 20, t0 = 19.2;
let dir: string, speech: string;
async function ff(args: string[]) { return exec('ffmpeg', ['-nostdin', '-hide_banner', '-y', ...args], { maxBuffer: 4_000_000 }); }
async function measure(path: string, start = 0, length = duration, filter = 'anull') {
  const log = (await ff(['-ss', String(start), '-t', String(length), '-i', path, '-vn', '-af', `${filter},ebur128=peak=true`, '-f', 'null', '-'])).stderr;
  return { integrated: parseIntegratedLoudness(log), peak: parseTruePeak(log) };
}
beforeAll(async () => {
  dir = await mkdtemp('/tmp/pack-media-'); speech = join(dir, 'speech.wav');
  await ff(['-f', 'lavfi', '-i', `aevalsrc=0.20*sin(2*PI*1000*t)*(1+2*lt(mod(t\\,1)\\,0.025)):s=44100:d=22`, '-ac', '2', speech]);
});
afterAll(async () => { vi.restoreAllMocks(); resetStingerCache(); if (dir) await rm(dir, { recursive: true, force: true }); });
it('audio placement, full-band level and float/AAC peaks through production graph', async () => {
  const music = await prepareMusic(speech, 0, duration), accent = await preparePackshot(speech, 0, duration);
  expect(music).not.toBeNull(); expect(accent).not.toBeNull();
  const silence = join(dir, 'silence.wav');
  await ff(['-f', 'lavfi', '-i', 'anullsrc=r=44100:cl=stereo', '-t', '20', silence]);
  async function mix(name: string, input: string, gain: number, stinger: typeof accent) {
    const out = join(dir, name + '.wav');
    await ff(['-i', input, '-i', MUSIC_TRACKS[0].path, '-i', STINGERS[0].path,
      '-filter_complex', buildMusicAudioGraph(gain, duration, stinger), '-map', '[aout]', '-t', '20', '-c:a', 'pcm_f32le', out]);
    return out;
  }
  const on = await mix('on', speech, music!.gain_db, accent), off = await mix('off', speech, music!.gain_db, null);
  const isolated = await mix('isolated', silence, -Infinity, accent);
  const s = await measureFullLoudness(speech, 0, duration), sample = await measure(isolated, t0, 0.8);
  const endOn = await measure(on, t0, 0.8, 'lowpass=f=300'), endOff = await measure(off, t0, 0.8, 'lowpass=f=300');
  const earlyOn = await measure(on, 0, 0.8, 'lowpass=f=300'), earlyOff = await measure(off, 0, 0.8, 'lowpass=f=300');
  const float = await measure(on);
  const mp4 = join(dir, 'encoded.mp4');
  await ff(['-i', on, '-c:a', 'aac', '-b:a', '128k', mp4]);
  const encoded = await measure(mp4);
  console.log(JSON.stringify({ guard: 'pack-audio', speech: s, gain: accent!.gain_db, isolated: sample,
    endOn, endOff, earlyOn, earlyOff, float, encoded }));
  expect.soft(sample.integrated).toBeLessThanOrEqual(s.integrated - 6 + 0.5);
  expect.soft(endOn.integrated - endOff.integrated).toBeGreaterThan(3);
  expect.soft(Math.abs(earlyOn.integrated - earlyOff.integrated)).toBeLessThanOrEqual(0.5);
  expect.soft(float.peak).toBeLessThanOrEqual(-1); expect.soft(encoded.peak).toBeLessThanOrEqual(-1);
}, 180_000);
async function frame(path: string, time: number, crop?: string): Promise<Buffer> {
  const { stdout } = await exec('ffmpeg', ['-v', 'error', '-ss', String(time), '-i', path, '-frames:v', '1',
    '-vf', crop ?? 'scale=108:192', '-pix_fmt', 'gray', '-f', 'rawvideo', '-'], { encoding: 'buffer', maxBuffer: 4_000_000 });
  return stdout;
}
const mean = (b: Buffer) => b.reduce((sum, value) => sum + value, 0) / b.length;
function difference(a: Buffer, b: Buffer) { expect(a.length).toBe(b.length); expect(a.length).toBeGreaterThan(0); return a.reduce((sum, v, i) => sum + Math.abs(v - b[i]!), 0) / a.length; }
it('video duration/content, flash timing and opaque watermark pixels', async () => {
  const source = join(dir, 'source.mp4');
  // Moving test source and a changing frame counter make an inserted/frozen frame observable.
  await ff(['-f', 'lavfi', '-i', 'testsrc=size=320x180:rate=25:duration=22', '-i', speech,
    '-vf', `drawtext=fontfile=${FONT_FILE}:text='%{n}':x=160:y=90:fontsize=30:fontcolor=white`,
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', source]);
  vi.spyOn(faces, 'detectFaces').mockResolvedValue(null);
  const opts = { inputPath: source, startTime: 2, endTime: 22, format: 'portrait' as const,
    words: [{ word: 'Проверка', start: 20, end: 22 }], watermark: true, music: true, origin: 'https://clipmkr.ru', code: 'WWWWWW' };
  const off = join(dir, 'off.mp4'), on = join(dir, 'on.mp4');
  const disabled = vi.spyOn(pack, 'preparePackshot').mockResolvedValue(null);
  try { expect((await renderClip({ ...opts, outputPath: off })).music).not.toBeNull(); }
  finally { disabled.mockRestore(); }
  expect((await renderClip({ ...opts, outputPath: on })).packshot).not.toBeNull();
  const probe = async (path: string) => JSON.parse((await exec('ffprobe', ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', path])).stdout);
  const a = await probe(off), b = await probe(on);
  expect(Math.abs(Number(a.format.duration) - Number(b.format.duration))).toBeLessThanOrEqual(0.04);
  expect(Math.abs(Number(a.streams[0].nb_frames) - Number(b.streams[0].nb_frames))).toBeLessThanOrEqual(1);
  const early = difference(await frame(off, t0 - 1), await frame(on, t0 - 1));
  const before = difference(await frame(off, t0 - 0.5), await frame(on, t0 - 0.5));
  const peakBase = mean(await frame(off, t0 + 0.05)), peak = mean(await frame(on, t0 + 0.05));
  const g = watermarkGeometry(1080, 1920, opts.origin, opts.code);
  // Crop exactly the opaque inverse code chip; not the translucent surrounding plate.
  const crop = `crop=${g.chipWidth}:${g.chipHeight}:${g.left + g.paddingX + g.prefixWidth}:${g.y + g.paddingY}`;
  const chip = difference(await frame(off, t0 + 0.05, crop), await frame(on, t0 + 0.05, crop));
  const peakAudio = await measure(on);
  console.log(JSON.stringify({ guard: 'pack-video', duration: b.format.duration, frames: b.streams[0].nb_frames,
    earlyDifference: early, beforeDifference: before, peakBase, peak, chipDifference: chip, peakAudio }));
  expect(early).toBeLessThan(2); expect(before).toBeLessThan(2);
  expect(peak - peakBase).toBeGreaterThan(20); expect(chip).toBeLessThan(3);
  expect(peakAudio.peak).toBeLessThanOrEqual(-1);
  const graphSource = await readFile('apps/worker/src/render/packshot.ts', 'utf8');
  expect(graphSource).not.toMatch(/\b(?:tpad|concat|loop|setpts)\b/);
}, 240_000);
