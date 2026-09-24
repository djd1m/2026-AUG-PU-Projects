import { expect, it } from 'vitest';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, rm } from 'node:fs/promises';
import { buildCutPlan, buildCompactionGraph, mapTime, planDuration } from '../apps/worker/src/render/compaction';
import { measureEnvelope, envelopeMedian } from '../apps/worker/src/render/envelope';
import { probeDuration } from '../apps/worker/src/render/probe';
import { escapeFFmpegPath } from '../apps/worker/src/render/escape';
import { SUBTITLE_FONTS } from '../apps/worker/src/render/watermark';
const exec = promisify(execFile);
it('real VFR: 5 joins, K within 10 ms by 1 ms samples, final A/V marker within a frame', async () => {
  const dir = await mkdtemp('/tmp/compact-media-');
  try {
    const input = `${dir}/in.mkv`, output = `${dir}/out.mkv`;
    const pauses = [4, 8, 12, 16, 20];
    const silence = pauses.map(t => `between(t,${t},${t + .5})`).join('+');
    await exec('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', "color=black:s=64x64:r=25:d=32,drawbox=c=white:t=fill:enable='between(t,28,28.08)',select='not(eq(mod(n,7),1))'",
      '-f', 'lavfi', '-i', `aevalsrc=if(${silence.replaceAll(',', '\\,')}\\,0\\,if(between(t\\,28\\,28.08)\\,0.9\\,0.2)*sin(2*PI*1000*t)):s=16000:d=32`,
      '-vsync', 'vfr', '-c:v', 'ffv1', '-c:a', 'pcm_s16le', input]);
    const env = await measureEnvelope(input), median = envelopeMedian(env);
    const plan = buildCutPlan(env, median, 0, 32), duration = planDuration(plan);
    expect(plan).toHaveLength(6);
    await exec('ffmpeg', ['-v', 'error', '-y', '-i', input, '-filter_complex_threads', '1', '-filter_complex', buildCompactionGraph(plan, 0, 0),
      '-map', '[vc]', '-map', '[ac]', '-t', String(duration), '-c:v', 'ffv1', '-c:a', 'pcm_s16le', output]);
    expect(await probeDuration(output)).toBeCloseTo(duration, 1);
    const audio = (await exec('ffmpeg', ['-v', 'error', '-i', output, '-map', '0:a', '-ac', '1', '-ar', '16000', '-f', 'f32le', '-'],
      { encoding: 'buffer', maxBuffer: 4_000_000 })).stdout;
    const rms: number[] = [];
    for (let i = 0; i + 64 <= audio.length; i += 64) {
      let sum = 0; for (let j = 0; j < 16; j++) sum += audio.readFloatLE(i + j * 4) ** 2;
      rms.push(Math.sqrt(sum / 16));
    }
    const gaps: number[] = []; let count = 0;
    for (const v of rms) { if (v < .001) count++; else { if (count > 10) gaps.push(count / 1000); count = 0; } }
    expect(gaps).toHaveLength(5);
    for (const gap of gaps) expect(Math.abs(gap - .05)).toBeLessThanOrEqual(.010001);
    const video = (await exec('ffmpeg', ['-v', 'error', '-i', output, '-map', '0:v', '-vf', 'scale=1:1', '-pix_fmt', 'gray', '-f', 'rawvideo', '-'],
      { encoding: 'buffer', maxBuffer: 10000 })).stdout;
    const markerVideo = video.findIndex(v => v > 200) / 25;
    const markerAudio = rms.findIndex(v => v > .5) / 1000;
    expect(markerVideo).toBeGreaterThan(20); expect(Math.abs(markerVideo - markerAudio)).toBeLessThanOrEqual(.04);
    expect(markerAudio).toBeCloseTo(mapTime(plan, 28), 2);
    console.log({ gaps, markerVideo, markerAudio, duration });
  } finally { await rm(dir, { recursive: true, force: true }); }
}, 60000);

it('real ASS pixels appear at remapped word time, not the old source clock', async () => {
  const { generateSubtitleFile } = await import('../apps/worker/src/render/subtitles');
  const { writeFile } = await import('node:fs/promises');
  const dir = await mkdtemp('/tmp/compact-ass-');
  try {
    const plan: [number, number][] = [[10, 20], [22, 40]];
    const words = [{ word: 'HELLO', start: mapTime(plan, 34), end: mapTime(plan, 34.5) }];
    const ass = `${dir}/words.ass`;
    await writeFile(ass, generateSubtitleFile(words, 0, planDuration(plan), 'portrait')!);
    const energy = async (t: number) => {
      const b = (await exec('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'color=black:s=360x640:r=25',
        '-vf', `setpts=PTS+${t}/TB,ass='${escapeFFmpegPath(ass)}':fontsdir='${escapeFFmpegPath(SUBTITLE_FONTS)}'`, '-frames:v', '1', '-pix_fmt', 'gray', '-f', 'rawvideo', '-'],
        { encoding: 'buffer', maxBuffer: 1_000_000 })).stdout;
      return b.reduce((sum, n) => sum + n, 0);
    };
    const mapped = mapTime(plan, 34);
    expect(await energy(mapped - .04)).toBe(0);
    expect(await energy(mapped + .04)).toBeGreaterThan(1000);
    expect(await energy(24.04)).toBe(0);
  } finally { await rm(dir, { recursive: true, force: true }); }
}, 30000);

it('real audio-only mp3 compacts through renderClip and returns format duration', async () => {
  const { renderClip } = await import('../apps/worker/src/render/ffmpeg');
  const dir = await mkdtemp('/tmp/compact-mp3-');
  try {
    const input = `${dir}/in.mp3`, output = `${dir}/out.mp4`;
    await exec('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=26', '-c:a', 'libmp3lame', input]);
    const plan: [number, number][] = [[2, 12], [13, 26]];
    const result = await renderClip({ inputPath: input, outputPath: output, startTime: 2, endTime: 26, cutPlan: plan,
      format: 'portrait', words: [], watermark: false, origin: 'https://clipmkr.ru', code: 'ABCDEF' });
    const measured = await probeDuration(output);
    expect(result.duration_seconds).toBe(measured); expect(Math.abs(measured - planDuration(plan))).toBeLessThanOrEqual(.05);
  } finally { await rm(dir, { recursive: true, force: true }); }
}, 90000);
