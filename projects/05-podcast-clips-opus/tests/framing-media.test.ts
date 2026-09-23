import { expect, it } from 'vitest';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { renderClip } from '../apps/worker/src/render/ffmpeg';
import { panelWindow, getFramingFilter } from '../apps/worker/src/render/format';
import { probeVideoStream } from '../apps/worker/src/render/probe';
import { generateSubtitleFile } from '../apps/worker/src/render/subtitles';
const exec = promisify(execFile);

it('FR-1 real render: left red above right blue, ASS on final canvas, watermark pixels', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'n5-framing-'));
  try {
    const input = join(dir, 'source.mkv'), output = join(dir, 'clip.mp4');
    await exec('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i',
      'color=red:s=1920x1080:r=2:d=20,drawbox=x=960:y=0:w=960:h=1080:color=blue:t=fill',
      '-f', 'lavfi', '-i', 'sine=duration=20', '-c:v', 'ffv1', '-c:a', 'pcm_s16le', '-shortest', input]);
    expect(await probeVideoStream(input)).toEqual({ index: 0, width: 1920, height: 1080 });
    const words = [{ word: 'Привет', start: 0, end: 5 }];
    expect(generateSubtitleFile(words, 0, 20, 'portrait')).toContain('PlayResX: 1080\nPlayResY: 1920');
    await renderClip({ inputPath: input, outputPath: output, startTime: 0, endTime: 20, format: 'portrait',
      words, watermark: true, origin: 'https://clipmkr.ru', code: 'WWWWWW' });
    expect(await probeVideoStream(output)).toEqual({ index: 0, width: 1080, height: 1920 });
    const pixels = async (time: number, crop: string) => (await exec('ffmpeg', ['-v', 'error', '-ss', String(time),
      '-i', output, '-vf', crop, '-frames:v', '1', '-pix_fmt', 'rgb24', '-f', 'rawvideo', 'pipe:1'],
    { encoding: 'buffer', maxBuffer: 2_000_000 })).stdout;
    // FR-2: в исходнике НЕТ лиц, значит два этажа вслепую НЕ строятся (владелец 23.09.2026:
    // «на обоих должны быть люди полностью»). Получается обрезка центра: слева красное, справа
    // синее — ОДИНАКОВО сверху и снизу. Прежде тут стояли слепые этажи: красное над синим.
    for (const [x, red] of [[100, true], [980, false]] as const) {
      for (const y of [200, 1100]) {
        const p = await pixels(1, `crop=20:20:${x}:${y}`);
        for (let i = 0; i < p.length; i += 3) {
          if (red) { expect(p[i]).toBeGreaterThan(220); expect(p[i + 2]).toBeLessThan(30); }
          else { expect(p[i]).toBeLessThan(30); expect(p[i + 2]).toBeGreaterThan(220); }
        }
      }
    }
    // Сам граф двух этажей проверяется напрямую, с ЯВНОЙ раскладкой: это единственное
    // доказательство настоящим ffmpeg, что панели не перепутаны и не взяты из одной половины.
    const dual = join(dir, 'dual.mp4');
    const graph = getFramingFilter('portrait', { width: 1920, height: 1080 },
      { mode: 'dual', positions: [{ x: 0, y: 0.25 }, { x: 1, y: 0.25 }] });
    await exec('ffmpeg', ['-v', 'error', '-i', input, '-filter_complex', `[0:0]${graph}[v]`, '-map', '[v]',
      '-frames:v', '1', '-y', dual]);
    const dualPixel = async (y: number) => (await exec('ffmpeg', ['-v', 'error', '-i', dual, '-vf',
      `crop=20:20:530:${y}`, '-frames:v', '1', '-pix_fmt', 'rgb24', '-f', 'rawvideo', 'pipe:1'],
    { encoding: 'buffer', maxBuffer: 100_000 })).stdout;
    const top = await dualPixel(400), bottom = await dualPixel(1400);
    expect(top[0]).toBeGreaterThan(220); expect(top[2]).toBeLessThan(30);
    expect(bottom[0]).toBeLessThan(30); expect(bottom[2]).toBeGreaterThan(220);
    const bright = (p: Buffer) => {
      let count = 0;
      for (let i = 0; i < p.length; i += 3) if (p[i]! > 180 && p[i + 1]! > 180) count++;
      return count;
    };
    expect(bright(await pixels(1, 'crop=1080:220:0:1220'))).toBeGreaterThan(500);
    expect(bright(await pixels(8, 'crop=1080:220:0:1220'))).toBe(0);
    expect(bright(await pixels(8, 'crop=1080:300:0:1450'))).toBeGreaterThan(500);
    console.info('FR-1 pixels: red top / blue bottom at x=100,900; ASS visible at t=1, absent t=8; watermark visible');
  } finally { await rm(dir, { recursive: true, force: true }); }
}, 90_000);

it('FR-1 real odd source: exact window encodes as yuv420p without implicit crop rounding', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'n5-framing-odd-'));
  try {
    const source = { width: 1923, height: 1081 };
    const w = panelWindow(source, 1);
    // exact=1 prevents ffmpeg from concealing an odd-window defect by silently rounding.
    const output = join(dir, 'window.mp4');
    await exec('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'color=red:s=1923x1081,format=yuv444p',
      '-vf', `crop=${w.width}:${w.height}:${w.x}:${w.y}:exact=1`, '-frames:v', '1',
      '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-threads', '1', output]);
    expect(await probeVideoStream(output)).toMatchObject({ width: w.width, height: w.height });
  } finally { await rm(dir, { recursive: true, force: true }); }
}, 15_000);
