import { measureFullLoudness, type FullLoudness } from './loudness.js';
import { FFmpegError } from './exec.js';
import { MUSIC_MAX_GAIN_DB, STINGERS } from './music.js';

export const STINGER_SECONDS = 0.8;
// 24.09.2026: владелец — «удар слишком тихий, я не понял даже где он» при 6 LU и низкочастотном сэмпле.
// Акцент на уровне речи; от перегрузки защищает пиковый потолок −3 − P. Вспышка — оценки, не измерения.
export const STINGER_MARGIN_LU = 0;
export const FLASH_PEAK = 0.35;
export const FLASH_HALF_WIDTH_SECONDS = 0.25;
export const STINGER_ENVELOPE = `atrim=0:${STINGER_SECONDS},afade=t=out:st=0.6:d=0.2`;
export interface PackshotMix { stinger: string; gain_db: number }
export interface PreparedPackshot extends PackshotMix { t0_ms: number }
let sampleMeasurement: FullLoudness | undefined;
export function resetStingerCache(): void { sampleMeasurement = undefined; }
export const FLASH_SHAPE_VERSION = 'v1';
export function buildFlashFilter(t0Ms: number): string {
  const t0 = t0Ms / 1000, peak = (t0Ms + 50) / 1000;
  return `eq=brightness='${FLASH_PEAK}*if(lt(t,${t0}),0,if(lt(t,${peak}),(t-${t0})/0.05,max(0,1-(t-${peak})/${2 * FLASH_HALF_WIDTH_SECONDS})))':eval=frame`;
}
export function buildStingerAudioGraph(packshot: PreparedPackshot): string {
  return `[2:a:0]${STINGER_ENVELOPE},volume=${packshot.gain_db}dB,`
    + `aformat=sample_rates=44100:channel_layouts=stereo,adelay=${packshot.t0_ms}:all=1[stinger];`;
}
export async function preparePackshot(input: string, start: number, duration: number, signal?: AbortSignal): Promise<PreparedPackshot | null> {
  const skip = (reason: string) => { console.info(JSON.stringify({ event: 'packshot_skipped', reason })); return null; };
  const stinger = STINGERS[0];
  let speech: FullLoudness, sample: FullLoudness;
  try {
    signal?.throwIfAborted();
    speech = await measureFullLoudness(input, start, duration, signal);
    sample = sampleMeasurement ?? await measureFullLoudness(stinger.path, 0, STINGER_SECONDS, signal, STINGER_ENVELOPE);
    signal?.throwIfAborted();
    // Cache only successful finite measurements, never an in-flight promise or failure.
    if (Number.isFinite(sample.integrated) && Number.isFinite(sample.peak)) sampleMeasurement = sample;
  } catch (error) {
    signal?.throwIfAborted();
    if (error instanceof FFmpegError && (error.reason === 'ffmpeg_failed' || error.reason === 'ffmpeg_timeout')) return skip('measure_failed');
    throw error;
  }
  if (!Number.isFinite(speech.integrated) || speech.integrated <= -60) return skip('speech_too_quiet');
  if (!Number.isFinite(sample.integrated) || sample.integrated <= -60 || !Number.isFinite(sample.peak)) return skip('stinger_invalid');
  const gain = Math.min(speech.integrated - STINGER_MARGIN_LU - sample.integrated, -3 - sample.peak);
  if (gain > MUSIC_MAX_GAIN_DB) return skip('gain_out_of_range');
  // Round down: rounding must not exceed either measured ceiling.
  const gainDb = Math.floor(gain * 10) / 10;
  const t0_ms = Math.round((duration - STINGER_SECONDS) * 1000);
  console.info(JSON.stringify({ event: 'packshot_mix', t0: t0_ms / 1000, gain_db: gainDb }));
  return { stinger: `${stinger.id}:${stinger.sha256}`, gain_db: gainDb, t0_ms };
}
