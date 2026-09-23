import { expect, it } from 'vitest';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import ts from 'typescript';
import { renderClip } from '../apps/worker/src/render/ffmpeg';
import { videoStreamIndex } from '../apps/worker/src/render/probe';

const exec = promisify(execFile);
it('RD-001 real MP3 without video renders 9:16 with burned subtitles, watermark and audio', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'render-audio-'));
  const input = join(directory, 'audio.mp3'), output = join(directory, 'clip.mp4');
  try {
    await exec('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=24', '-c:a', 'libmp3lame', input]);
    const probe = async (file: string) => JSON.parse((await exec('ffprobe', ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', file])).stdout);
    expect((await probe(input)).streams.map((s: { codec_type: string }) => s.codec_type)).toEqual(['audio']);
    expect(await videoStreamIndex(input)).toBeNull();
    await renderClip({ inputPath: input, outputPath: output, startTime: 2, endTime: 22, format: 'portrait',
      words: [{ word: 'Привет', start: 3, end: 5 }], watermark: true,
      origin: 'https://clipmaker.aicoding.space', code: 'WWWWWWWWWW' });
    const result = await probe(output);
    expect(result.streams.find((s: { codec_type: string }) => s.codec_type === 'video')).toMatchObject({ width: 1080, height: 1920 });
    expect(result.streams.some((s: { codec_type: string }) => s.codec_type === 'audio')).toBe(true);
    expect(Number(result.format.duration)).toBeCloseTo(20, 0);
    const pixels = async (time: number, crop: string) => (await exec('ffmpeg', ['-v', 'error', '-ss', String(time), '-i', output,
      '-frames:v', '1', '-vf', crop, '-f', 'rawvideo', '-pix_fmt', 'rgb24', 'pipe:1'],
    { encoding: 'buffer', maxBuffer: 2_000_000 })).stdout;
    const bright = (frame: Buffer) => {
      let count = 0;
      for (let i = 0; i < frame.length; i += 3) if (frame[i]! > 180 && frame[i + 1]! > 180) count++;
      return count;
    };
    // Same background, disjoint subtitle/mark regions; a missing ASS filter must fail.
    expect(bright(await pixels(2, 'crop=1080:220:0:1220'))).toBeGreaterThan(500);
    expect(bright(await pixels(6, 'crop=1080:220:0:1220'))).toBe(0);
    expect(bright(await pixels(6, 'crop=1080:300:0:1450'))).toBeGreaterThan(500);
  } finally { await rm(directory, { recursive: true, force: true }); }
}, 180_000);

it('RD-001 real video retains its picture; attached MP3 cover and M4A use the background', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'render-video-'));
  const input = join(directory, 'video.mp4'), output = join(directory, 'clip.mp4');
  try {
    await exec('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'color=c=blue:s=160x90:r=25:d=21',
      '-f', 'lavfi', '-i', 'sine=duration=21', '-c:v', 'libx264', '-c:a', 'aac', '-shortest', input]);
    expect(await videoStreamIndex(input)).toBe(0);
    await renderClip({ inputPath: input, outputPath: output, startTime: 1, endTime: 21, format: 'portrait',
      words: [], watermark: false, origin: 'https://clipmaker.aicoding.space', code: 'WWWWWWWWWW' });
    const frame = (await exec('ffmpeg', ['-v', 'error', '-i', output, '-frames:v', '1', '-vf', 'crop=2:2:0:0',
      '-f', 'rawvideo', '-pix_fmt', 'rgb24', 'pipe:1'], { encoding: 'buffer' })).stdout;
    expect(frame[2]).toBeGreaterThan(200); expect(frame[0]).toBeLessThan(30);
    const cover = join(directory, 'cover.jpg'), mp3 = join(directory, 'cover.mp3'), m4a = join(directory, 'audio.m4a');
    await exec('ffmpeg', ['-v', 'error', '-i', input, '-frames:v', '1', cover]);
    await exec('ffmpeg', ['-v', 'error', '-i', input, '-i', cover, '-map', '0:a:0', '-map', '1:v:0',
      '-c:a', 'libmp3lame', '-c:v', 'copy', '-disposition:v', 'attached_pic', mp3]);
    expect(await videoStreamIndex(mp3)).toBeNull();
    await exec('ffmpeg', ['-v', 'error', '-i', input, '-vn', '-c:a', 'copy', m4a]);
    expect(await videoStreamIndex(m4a)).toBeNull();
    await expect(videoStreamIndex(join(directory, 'missing'))).rejects.toThrow('Render probe failed');
    const abort = new AbortController(); abort.abort();
    await expect(videoStreamIndex(input, abort.signal)).rejects.toThrow();
  } finally { await rm(directory, { recursive: true, force: true }); }
}, 180_000);

it('RD-001 source guard: exactly one ffmpeg encoding pass per renderClip', async () => {
  const source = await readFile('apps/worker/src/render/ffmpeg.ts', 'utf8');
  const ast = ts.createSourceFile('ffmpeg.ts', source, ts.ScriptTarget.Latest, true);
  let calls = 0;
  const walk = (node: ts.Node) => {
    if (ts.isCallExpression(node) && node.expression.getText(ast) === 'execFFmpeg') calls++;
    ts.forEachChild(node, walk);
  };
  walk(ast);
  expect(calls).toBe(1);
  expect(source).not.toMatch(/\b(?:spawn|execFile|execSync)\s*\(/);
});
