// Adapted from jan-clone buildFilterChain/renderClip. Filter ordering is a security invariant.
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type { TranscriptWord } from '@clipmaker/shared/transcript';
import { getScaleFilter, FORMAT_DIMENSIONS, type ClipFormat } from './format.js';
import { escapeFFmpegPath } from './escape.js';
import { generateSubtitleFile } from './subtitles.js';
import { buildWatermarkDrawtext, SUBTITLE_FONTS } from './watermark.js';
import { execFFmpeg, FFMPEG_TIMEOUT_MS } from './exec.js';
export function buildFilterChain(format: ClipFormat, assFilePath: string | null,
  watermark: boolean, origin: string, code: string): string {
  const filters: string[] = [];
  const { width, height } = FORMAT_DIMENSIONS[format];
  filters.push(getScaleFilter(format));
  if (assFilePath !== null) filters.push(`ass='${escapeFFmpegPath(assFilePath)}':fontsdir='${escapeFFmpegPath(SUBTITLE_FONTS)}'`);
  if (watermark) filters.push(buildWatermarkDrawtext(width, height, origin, code));
  return filters.join(',');
}
export interface RenderOptions {
  inputPath: string; outputPath: string; startTime: number; endTime: number;
  format: ClipFormat; words: TranscriptWord[]; watermark: boolean; origin: string; code: string; signal?: AbortSignal;
}
export async function renderClip(options: RenderOptions): Promise<void> {
  const duration = options.endTime - options.startTime;
  if (!Number.isFinite(options.startTime) || options.startTime < 0 || !Number.isFinite(duration) || duration < 20 || duration > 75) {
    throw new Error('Длительность клипа вне канона');
  }
  const temp = await mkdtemp(join(dirname(options.outputPath), 'render-'));
  try {
    const subtitles = generateSubtitleFile(options.words, options.startTime, options.endTime, options.format);
    const ass = subtitles ? join(temp, 'subtitles.ass') : null;
    if (ass) await writeFile(ass, subtitles!, { mode: 0o600 });
    const vf = buildFilterChain(options.format, ass, options.watermark, options.origin, options.code);
    await execFFmpeg(['-y', '-protocol_whitelist', 'file', '-ss', String(options.startTime), '-t', String(duration),
      '-i', options.inputPath, '-vf', vf, '-c:v', 'libx264', '-preset', 'fast', '-crf', '23',
      '-profile:v', 'high', '-level', '4.1', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '128k',
      '-ar', '44100', '-ac', '2', '-movflags', '+faststart', options.outputPath], FFMPEG_TIMEOUT_MS, options.signal);
  } finally { await rm(temp, { recursive: true, force: true }); }
}
