import { it, expect } from 'vitest';
import { execFile as execFileCb } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFFmpeg, generateThumbnail } from '../apps/worker/src/render/exec';
import { renderClip } from '../apps/worker/src/render/ffmpeg';
const execFile = promisify(execFileCb);
it.each(['0x224466', 'white', 'black'])('real ffmpeg (%s): center crop, ASS highlighting, Cyrillic/address pixels and JPEG thumbnail', async color => {
  const dir = await mkdtemp(join(tmpdir(), 'n5-real-render-'));
  // Keep the passing output for visual inspection; report path is printed to the receipt.
  const input = join(dir, 'source.mp4'), output = join(dir, 'clip.mp4');
  await execFFmpeg(['-y', '-f', 'lavfi', '-i', `color=c=${color}:s=640x360:r=5:d=20`, '-f', 'lavfi', '-i', 'sine=frequency=440:duration=20',
    '-c:v', 'libx264', '-threads', '1', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', input]);
  await renderClip({ inputPath: input, outputPath: output, startTime: 0, endTime: 20, format: 'portrait',
    words: [{ word: 'Привет', start: 0, end: 10 }, { word: 'мир', start: 10, end: 20 }],
    watermark: true, origin: 'https://clipmkr.ru', code: 'WWWWWW' });
  await generateThumbnail(output, join(dir, 'thumb.jpg'), 5);
  expect((await readFile(join(dir, 'thumb.jpg'))).subarray(0, 2)).toEqual(Buffer.from([0xff, 0xd8]));
  const probe = JSON.parse((await execFile('ffprobe', ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', output])).stdout);
  expect(probe.streams[0]).toMatchObject({ width: 1080, height: 1920 }); expect(Number(probe.format.duration)).toBeCloseTo(20, 1);
  expect(probe.streams.some((s: { codec_type: string }) => s.codec_type === 'audio')).toBe(true);
  await execFFmpeg(['-y', '-ss', '1', '-i', output, '-vframes', '1', join(dir, 'frame.png')]);
  // Inspect prefix and chip independently in the encoded frame (same baseline).
  for (const [name, crop] of [['prefix', 'crop=555:84:78:1589'], ['chip', 'crop=272:84:633:1589']]) {
    const path = join(dir, `${name}.raw`);
    await execFFmpeg(['-y', '-ss', '1', '-i', output, '-vf', `${crop},format=gray`, '-vframes', '1', '-f', 'rawvideo', path]);
    const pixels = await readFile(path);
    expect(pixels.filter(p => p > 220).length).toBeGreaterThan(100);
    // Relative text/background contrast in the same region, independent of source brightness.
    // Percentiles ignore codec noise and antialiased glyph edges; both tones need substantial area.
    const sorted = [...pixels].sort((a, b) => a - b);
    if (color === 'white' && name === 'prefix') {
      // White source + white glyphs cannot darken this area without the plate.
      // black@0.60 gives about 102; tolerate encoding noise, but reject no plate (~255).
      expect(sorted[Math.floor(sorted.length * 0.5)], 'RV-6 plate darkens the white source').toBeLessThan(140);
    }
    const luminance = (value: number) => {
      const srgb = value / 255;
      return srgb <= 0.04045 ? srgb / 12.92 : ((srgb + 0.055) / 1.055) ** 2.4;
    };
    const dark = luminance(sorted[Math.floor(sorted.length * 0.10)]!);
    const light = luminance(sorted[Math.floor(sorted.length * 0.95)]!);
    expect((light + 0.05) / (dark + 0.05), `${color} ${name} contrast`).toBeGreaterThanOrEqual(4.5);
  }
  expect((await readdir(dir)).filter(p => p.startsWith('render-'))).toEqual([]);
  console.info(`REAL_RENDER_ARTIFACT=${dir}`);
}, 90_000);
it('ffmpeg timeout kills the child and waits for close before returning', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'n5-timeout-'));
  try {
    await expect(execFFmpeg(['-f', 'lavfi', '-i', 'testsrc2=s=640x360', '-f', 'null', '-'], 100)).rejects.toMatchObject({ reason: 'ffmpeg_timeout' });
    await expect(renderClip({ inputPath: join(dir, 'absent.mp4'), outputPath: join(dir, 'out.mp4'), startTime: 0, endTime: 20,
      format: 'portrait', words: [], watermark: false, origin: 'https://clipmkr.ru', code: 'WWWWWW' })).rejects.toThrow();
    expect((await readdir(dir)).filter(p => p.startsWith('render-'))).toEqual([]);
  } finally { await rm(dir, { recursive: true, force: true }); }
}, 15_000);
