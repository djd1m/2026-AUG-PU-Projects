import { expect, it } from 'vitest';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const exec = promisify(execFile);
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { buildFilterChain } from '../apps/worker/src/render/ffmpeg';
import { buildTeaserFilter } from '../apps/worker/src/render/teaser';
import { watermarkGeometry } from '../apps/worker/src/render/watermark';
const version = (await exec('ffmpeg', ['-version'], { encoding: 'utf8' })).stdout.match(/ffmpeg version (\d+)\.(\d+)/);
const supported = !!version && (Number(version[1]) > 6 || Number(version[1]) === 6 && Number(version[2]) >= 1);
if (!supported) console.error('НЕ ВЫПОЛНЕН: ffmpeg < 6.1 — teaser media; требуется полный прогон в образе 8.1');
it.skipIf(!supported)('real teaser window and opaque watermark pixels with compression tolerance', async () => {
  const dir = await mkdtemp('/tmp/teaser-media-');
  const mean = (b: Buffer) => { expect(b.length).toBeGreaterThan(0); return b.reduce((s, v) => s + v, 0) / b.length; };
  const origin = 'https://clipmkr.ru', code = 'WWWWWW';
  try {
    const text = `${dir}/teaser.txt`; await writeFile(text, 'Очень важный заголовок\nВторая строка', { mode: 0o600 });
    for (const on of [false, true]) {
      const filter = buildFilterChain('portrait', null, true, origin, code, undefined, undefined, undefined, undefined,
        on ? buildTeaserFilter(text, 84) : undefined);
      await exec('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'color=c=white:s=1080x1920:r=25:d=4',
        '-vf', filter, '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '23', '-pix_fmt', 'yuv420p', `${dir}/${on}.mp4`], { timeout: 120000 });
    }
    async function frame(on: boolean, t: number, crop: string) {
      return (await exec('ffmpeg', ['-v', 'error', '-ss', String(t), '-i', `${dir}/${on}.mp4`, '-frames:v', '1',
        '-vf', crop, '-pix_fmt', 'gray', '-f', 'rawvideo', '-'], { encoding: 'buffer', maxBuffer: 4_000_000 })).stdout;
    }
    const delta = async (t: number, crop: string) => Math.abs(mean(await frame(true, t, crop)) - mean(await frame(false, t, crop)));
    const early = await delta(1, 'crop=1080:640:0:100'), late = await delta(3, 'crop=1080:640:0:100');
    const g = watermarkGeometry(1080, 1920, origin, code);
    const mark = await delta(1, `crop=${g.chipWidth}:${g.chipHeight}:${g.left + g.paddingX + g.prefixWidth}:${g.y + g.paddingY}`);
    console.log(JSON.stringify({ event: 'teaser_pixel_delta', early, late, watermark: mark }));
    expect(early).toBeGreaterThan(5); expect(late).toBeLessThan(1); expect(mark).toBeLessThan(1);
  } finally { await rm(dir, { recursive: true, force: true }); }
}, 180000);
