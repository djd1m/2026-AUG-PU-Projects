import { buildStingerAudioGraph, type PackshotMix, type PreparedPackshot } from './packshot.js';
import { resolve } from 'node:path';
import { measureLoudness } from './loudness.js';
import { FFmpegError } from './exec.js';

// Решение владельца 24.09.2026 (OWN-009, В-8): прослушаны 7 клипов записи 88 мин — «нормально».
export const MUSIC_MARGIN_LU = 18;
export const MUSIC_MAX_GAIN_DB = 12;
export const MUSIC_TRACKS = [
  { id: 'komiku-everything-is-groovy',
    sha256: '8ee1e5f475d0aeae548dc15d97fa967f0e5d5db72d8a7f605fecb2f5dd7f2f8d',
    path: resolve('apps/worker/assets/music/komiku-everything-is-groovy.mp3') },
  { id: 'holizna-bubbles',
    sha256: '73efb557d8cfcca0f5cf3b435d3a0157bf9a702115b55266b8a2529f3997b542',
    path: resolve('apps/worker/assets/music/holizna-bubbles.mp3') },
  { id: 'holizna-tranquil-mindscape',
    sha256: '488d9693c13e44c5213c0647ee89ea91b21e17d9ac602225a78ee089720134c0',
    path: resolve('apps/worker/assets/music/holizna-tranquil-mindscape.mp3') },
  { id: 'holizna-walking-away',
    sha256: 'fd8a618a4076b76f02f69414d6beb4ad7ddf3b8c26164085bd6dc1a9fd2f7610',
    path: resolve('apps/worker/assets/music/holizna-walking-away.mp3') },
  { id: 'holizna-doodles',
    sha256: '84db72387b14fa51294ba76a0bb3f72f39172527e5eb7964da8567596561ae72',
    path: resolve('apps/worker/assets/music/holizna-doodles.mp3') },
  { id: 'holizna-one-good-day',
    sha256: 'dd6f973da34bad28bc16b794601b952bd1506472ed7fb979b3e41369bd831427',
    path: resolve('apps/worker/assets/music/holizna-one-good-day.mp3') },
  { id: 'holizna-warm-fuzz',
    sha256: '974ffd083b09aecbe60412f3376db07fb241adbbb0abf89698a22229a2de02c6',
    path: resolve('apps/worker/assets/music/holizna-warm-fuzz.mp3') },
  { id: 'holizna-roof-tops',
    sha256: 'f6e619fbfdc0898c409494d5c810d34d9cd29be2b75bb2d8c197e1edb37155b5',
    path: resolve('apps/worker/assets/music/holizna-roof-tops.mp3') },
  { id: 'holizna-ocean-memory',
    sha256: '6121e8621b6d7894ba413b502092e7a57c74772021a5220f1dee354d7d496276',
    path: resolve('apps/worker/assets/music/holizna-ocean-memory.mp3') }
] as const;
export interface MusicTrack { readonly id: string; readonly sha256: string; readonly path: string }
// Zero-based selector; database clip indices are converted at the render boundary.
export function selectTrack(index: unknown, catalogue: readonly [MusicTrack, ...MusicTrack[]] = MUSIC_TRACKS): MusicTrack {
  if (typeof index !== 'number' || !Number.isSafeInteger(index)) return catalogue[0];
  return catalogue[((index % catalogue.length) + catalogue.length) % catalogue.length]!;
}
export const STINGERS = [{ id: 'kenney-explosion-crunch-002',
  sha256: 'be2b8ddc62e4a24c91e2e77793de98549ce216faf2f323a917e7d6f34321ff97',
  path: resolve('apps/worker/assets/sfx/kenney-explosion-crunch-002.ogg') }] as const;
export interface MusicMix { track: string; gain_db: number }
export interface RenderOutcome { duration_seconds: number; teaser?: import('./teaser.js').TeaserResult | null; music: MusicMix | null; packshot: PackshotMix | null }
export function buildMusicAudioGraph(gainDb: number, duration: number, packshot?: PreparedPackshot | null, speechLabel = '[0:a:0]'): string {
  return speechLabel + 'aformat=sample_rates=44100:channel_layouts=stereo[speech];'
    + `[1:a:0]atrim=0:${duration},asetpts=PTS-STARTPTS,volume=${gainDb}dB,`
    + `afade=t=in:d=0.5,afade=t=out:st=${duration - 1}:d=1,`
    + 'aformat=sample_rates=44100:channel_layouts=stereo[bed];'
    + (packshot ? buildStingerAudioGraph(packshot) + '[speech][bed][stinger]amix=inputs=3:duration=first:normalize=0[aout]'
      : '[speech][bed]amix=inputs=2:duration=first:normalize=0[aout]');
}
export async function prepareMusic(input: string, start: number, duration: number, track: MusicTrack, signal?: AbortSignal, sourceDuration = duration): Promise<(MusicMix & { path: string }) | null> {
  const skip = (reason: string) => { console.info(JSON.stringify({ event: 'music_skipped', reason })); return null; };
  let speech: number, bed: number;
  try {
    speech = await measureLoudness(input, start, sourceDuration, signal);
    bed = await measureLoudness(track.path, 0, duration, signal);
  } catch (error) {
    signal?.throwIfAborted();
    if (error instanceof FFmpegError && (error.reason === 'ffmpeg_failed' || error.reason === 'ffmpeg_timeout')) return skip('measure_failed');
    throw error;
  }
  if (!Number.isFinite(speech) || speech <= -60) return skip('speech_too_quiet');
  if (!Number.isFinite(bed) || bed <= -60) return skip('track_too_quiet');
  const gain = speech - MUSIC_MARGIN_LU - bed;
  if (gain > MUSIC_MAX_GAIN_DB) return skip('gain_out_of_range');
  const roundedGain = Math.round(gain * 10) / 10;
  console.info(JSON.stringify({ event: 'music_mix', speech_lufs: speech, track_lufs: bed, gain_db: roundedGain }));
  return { track: `${track.id}:${track.sha256}`, path: track.path, gain_db: roundedGain };
}
