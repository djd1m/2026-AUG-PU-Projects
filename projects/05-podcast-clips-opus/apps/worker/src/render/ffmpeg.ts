// Adapted from jan-clone buildFilterChain/renderClip. Filter ordering is a security invariant.
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type { TranscriptWord } from '@clipmaker/shared/transcript';
import { getScaleFilter, getFramingFilter, FORMAT_DIMENSIONS, type ClipFormat, type SourceDimensions } from './format.js';
import { escapeFFmpegPath } from './escape.js';
import { generateSubtitleFile } from './subtitles.js';
import { buildWatermarkDrawtext, watermarkGeometry, SUBTITLE_FONTS } from './watermark.js';
import { execFFmpeg, FFMPEG_TIMEOUT_MS } from './exec.js';
import { probeVideoStream } from './probe.js';
import { detectFaces } from './faces.js';
import { planFraming, planFollow, type FramingPlan, type FollowSegment } from './framing-plan.js';
import { panelWindow, singleWindow, getFollowFilter, type FramingPositions } from './format.js';
export function buildFilterChain(format: ClipFormat, assFilePath: string | null,
  watermark: boolean, origin: string, code: string, source?: SourceDimensions,
  plan?: FramingPositions, follow?: FollowSegment[]): string {
  const filters: string[] = [];
  const { width, height } = FORMAT_DIMENSIONS[format];
  // Следование за лицом важнее неподвижного плана: оно и есть неподвижный план, когда лицо одно.
  filters.push(source && follow?.length ? getFollowFilter(format, source, follow)
    : source ? getFramingFilter(format, source, plan) : getScaleFilter(format));
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
    const { width, height } = FORMAT_DIMENSIONS[options.format];
    // Keep permanent watermark geometry failures ahead of probing/retryable media errors.
    if (options.watermark) watermarkGeometry(width, height, options.origin, options.code);
    const video = await probeVideoStream(options.inputPath, options.signal);
    // Кадрирование по лицам: где люди на самом деле, а не «по половинам кадра».
    // Отказ детектора НЕ валит рендер — план просто остаётся пустым, и кадрирование прежнее.
    let plan: FramingPlan | undefined;
    let follow: FollowSegment[] | undefined;
    if (video) {
      const report = await detectFaces(options.inputPath, options.startTime, options.endTime, options.signal);
      if (report) {
        plan = planFraming(report, video, panelWindow(video, 0));
        // Два этажа остаются неподвижными: переезжающие панели читались бы как рябь.
        // Во всех прочих случаях кадр СЛЕДУЕТ за лицом.
        if (plan.mode !== 'dual') {
          follow = planFollow(report, video, singleWindow(video, 0.5), options.startTime);
        }
        console.info(JSON.stringify({ event: 'framing_plan', mode: plan.mode, reason: plan.reason,
          samples: report.samples.length, shots: follow?.length ?? 0 }));
      }
    }
    const vf = buildFilterChain(options.format, ass, options.watermark, options.origin, options.code,
      video ?? undefined, plan, follow);
    const source = video === null ? `color=c=0x181818:s=${width}x${height}:r=25:d=${duration},` : `[0:${video.index}]`;
    await execFFmpeg(['-y', '-protocol_whitelist', 'file', '-ss', String(options.startTime), '-t', String(duration),
      '-i', options.inputPath, '-filter_complex', `${source}${vf}[video]`, '-map', '[video]', '-map', '0:a:0',
      '-t', String(duration), '-c:v', 'libx264', '-preset', 'fast', '-crf', '23',
      '-profile:v', 'high', '-level', '4.1', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '128k',
      '-ar', '44100', '-ac', '2', '-movflags', '+faststart', options.outputPath], FFMPEG_TIMEOUT_MS, options.signal);
  } finally { await rm(temp, { recursive: true, force: true }); }
}
