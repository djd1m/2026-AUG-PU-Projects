import { buildCompactionGraph, mapTime, planDuration, type Segment } from './compaction.js';
import { prepareTeaser } from './teaser.js';
import { preparePackshot, buildFlashFilter } from './packshot.js';
// Adapted from jan-clone buildFilterChain/renderClip. Filter ordering is a security invariant.
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type { TranscriptWord } from '@clipmaker/shared/transcript';
import { getScaleFilter, getFramingFilter, FORMAT_DIMENSIONS, type ClipFormat, type SourceDimensions } from './format.js';
import { escapeFFmpegPath } from './escape.js';
import { generateSubtitleFile } from './subtitles.js';
import { buildWatermarkDrawtext, watermarkGeometry, SUBTITLE_FONTS } from './watermark.js';
import { execFFmpeg, FFMPEG_TIMEOUT_MS } from './exec.js';
import { probeVideoStream, probeDuration } from './probe.js';
import { detectFaces } from './faces.js';
import { planFraming, planFollow, type FramingPlan, type FollowSegment } from './framing-plan.js';
import { panelWindow, singleWindow, getFollowFilter, type FramingPositions } from './format.js';
import { prepareMusic, buildMusicAudioGraph, selectTrack, resolveMusicTrack, STINGERS, type RenderOutcome } from './music.js';
export { buildMusicAudioGraph } from './music.js';
export function buildFilterChain(format: ClipFormat, assFilePath: string | null,
  watermark: boolean, origin: string, code: string, source?: SourceDimensions,
  plan?: FramingPositions, follow?: FollowSegment[], flash?: string, teaser?: string): string {
  const filters: string[] = [];
  const { width, height } = FORMAT_DIMENSIONS[format];
  // Следование за лицом важнее неподвижного плана: оно и есть неподвижный план, когда лицо одно.
  filters.push(source && follow?.length ? getFollowFilter(format, source, follow)
    : source ? getFramingFilter(format, source, plan) : getScaleFilter(format));
  if (assFilePath !== null) filters.push(`ass='${escapeFFmpegPath(assFilePath)}':fontsdir='${escapeFFmpegPath(SUBTITLE_FONTS)}'`);
  if (teaser) filters.push(teaser);
  if (flash) filters.push(flash);
  if (watermark) filters.push(buildWatermarkDrawtext(width, height, origin, code));
  return filters.join(',');
}
export interface RenderOptions {
  musicTrackId?: string | null;
  cutPlan?: Segment[];
  inputPath: string; outputPath: string; startTime: number; endTime: number;
  format: ClipFormat; words: TranscriptWord[]; watermark: boolean; origin: string; code: string; signal?: AbortSignal; music?: boolean; clipIndex?: number; teaser?: boolean; title?: string;
}
export async function renderClip(options: RenderOptions): Promise<RenderOutcome> {
  const sourceDuration = options.endTime - options.startTime;
  const cuts = options.cutPlan && options.cutPlan.length > 1 ? options.cutPlan : null;
  const duration = cuts ? planDuration(cuts) : sourceDuration;
  if (!Number.isFinite(options.startTime) || options.startTime < 0 || !Number.isFinite(sourceDuration) || sourceDuration < 20 || sourceDuration > 75) {
    throw new Error('Длительность клипа вне канона');
  }
  const temp = await mkdtemp(join(dirname(options.outputPath), 'render-'));
  try {
    const words = cuts ? options.words.filter(w => w.start >= options.startTime && w.end <= options.endTime)
      .map(w => ({ ...w, start: mapTime(cuts, w.start), end: mapTime(cuts, w.end) })).filter(w => w.end > w.start) : options.words;
    const subtitles = generateSubtitleFile(words, cuts ? 0 : options.startTime, cuts ? duration : options.endTime, options.format);
    const ass = subtitles ? join(temp, 'subtitles.ass') : null;
    if (ass) await writeFile(ass, subtitles!, { mode: 0o600 });
    const { width, height } = FORMAT_DIMENSIONS[options.format];
    // Keep permanent watermark geometry failures ahead of probing/retryable media errors.
    if (options.watermark) watermarkGeometry(width, height, options.origin, options.code);
    const video = await probeVideoStream(options.inputPath, options.signal);
    if (options.music && options.clipIndex !== undefined && !Number.isSafeInteger(options.clipIndex)) {
      console.info(JSON.stringify({ event: 'music_track_fallback' }));
    }
    const teaser = options.teaser ? await prepareTeaser(options.title ?? '', width, temp) : null;
    const trackIndex = typeof options.clipIndex === 'number' ? options.clipIndex - 1 : undefined;
    const track = options.musicTrackId == null
      ? (options.music ? selectTrack(trackIndex) : null)
      : resolveMusicTrack(options.musicTrackId, !!options.music, trackIndex);
    let musicSkipReason: import('./music.js').MusicSkipReason | null = null;
    const music = track ? await prepareMusic(options.inputPath, options.startTime, duration,
      track, options.signal, sourceDuration, reason => { musicSkipReason = reason; }) : null;
    const packshot = music ? await preparePackshot(options.inputPath, options.startTime, duration, options.signal, sourceDuration) : null;
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
          follow = planFollow(cuts ? { ...report, samples: report.samples.map(sample => ({ ...sample, t: mapTime(cuts, sample.t) })) } : report,
            video, singleWindow(video, 0.5), cuts ? 0 : options.startTime);
        }
        console.info(JSON.stringify({ event: 'framing_plan', mode: plan.mode, reason: plan.reason,
          samples: report.samples.length, shots: follow?.length ?? 0 }));
      }
    }
    const vf = buildFilterChain(options.format, ass, options.watermark, options.origin, options.code,
      video ?? undefined, plan, follow, packshot ? buildFlashFilter(packshot.t0_ms) : undefined, teaser?.filter);
    const source = video === null ? `color=c=0x181818:s=${width}x${height}:r=25:d=${duration},` : cuts ? '[vc]' : `[0:${video.index}]`;
    const compactionGraph = cuts ? buildCompactionGraph(cuts, options.startTime, video?.index ?? null) + ';' : '';
    await execFFmpeg(['-y', '-protocol_whitelist', 'file', '-ss', String(options.startTime), '-t', String(sourceDuration),
      '-i', options.inputPath, ...(music ? ['-i', music.path] : []), ...(packshot ? ['-i', STINGERS[0].path] : []),
      '-filter_complex', `${compactionGraph}${source}${vf}[video]${music ? ';' + buildMusicAudioGraph(music.gain_db, duration, packshot, cuts ? '[ac]' : '[0:a:0]') : ''}`,
      '-map', '[video]', '-map', music ? '[aout]' : cuts ? '[ac]' : '0:a:0',
      '-t', String(duration), '-c:v', 'libx264', '-preset', 'fast', '-crf', '23',
      '-profile:v', 'high', '-level', '4.1', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '128k',
      '-ar', '44100', '-ac', '2', '-movflags', '+faststart', options.outputPath], FFMPEG_TIMEOUT_MS, options.signal);
    return { music_skip_reason: musicSkipReason, duration_seconds: await probeDuration(options.outputPath, options.signal), teaser: teaser?.result ?? null, music: music ? { track: music.track, gain_db: music.gain_db } : null,
      packshot: packshot ? { stinger: packshot.stinger, gain_db: packshot.gain_db } : null };
  } finally { await rm(temp, { recursive: true, force: true }); }
}
