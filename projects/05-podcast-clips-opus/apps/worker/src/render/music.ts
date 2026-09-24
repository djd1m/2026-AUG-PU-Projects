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
  { id: 'komiku-the-journey-begins',
    sha256: '3a7298ca305fda5f4b77dc14df1b6b0d9c7c3294dec806ca29539ea7e8ff9a67',
    path: resolve('apps/worker/assets/music/komiku-the-journey-begins.mp3') },
  { id: 'komiku-road-1-fight',
    sha256: '5115398ad1370cfa862306cc3b59a22a5f537e8a9d2a1a57761bb0aa110f6040',
    path: resolve('apps/worker/assets/music/komiku-road-1-fight.mp3') },
  { id: 'komiku-little-town-before-big-city',
    sha256: 'b6ba5a7e386cbb7fefd2cb8051eff7b9c847a0672e92c27b22585393a3d6edc8',
    path: resolve('apps/worker/assets/music/komiku-little-town-before-big-city.mp3') },
  { id: 'komiku-road-3-fight',
    sha256: 'b956814f178b345a009cccf8e311339074f8167a276c085cb2b8d2e71479358b',
    path: resolve('apps/worker/assets/music/komiku-road-3-fight.mp3') },
  { id: 'komiku-road-4-chill',
    sha256: 'eaecda0bc1a72bd38dee47e3e40c27b6627b10f5d328781199a4c7fb2d305ae3',
    path: resolve('apps/worker/assets/music/komiku-road-4-chill.mp3') },
  { id: 'komiku-cliff-road-fight',
    sha256: 'e2cde1c16d953533e6307d9feac4878b0a29d66d1febbf4bcf04cc8698936d17',
    path: resolve('apps/worker/assets/music/komiku-cliff-road-fight.mp3') },
  { id: 'komiku-pop-city',
    sha256: '8bde21764ab786c422759fd88bb490c6986ac37860366afcc98f9cbeff1fe0d8',
    path: resolve('apps/worker/assets/music/komiku-pop-city.mp3') },
  { id: 'komiku-dance-with-two-or-more',
    sha256: '905eae2cb2d0b80ec063795455e667e08a06b95a5b39c43ef2862d6a567b8ae1',
    path: resolve('apps/worker/assets/music/komiku-dance-with-two-or-more.mp3') },
  { id: 'komiku-to-fight-a-spell-by-dancing',
    sha256: '53542983e293c3b3474ded04c98ba5b7f03653e407e73418069c0d5224d73fc8',
    path: resolve('apps/worker/assets/music/komiku-to-fight-a-spell-by-dancing.mp3') },
  { id: 'komiku-we-have-to-dance-together',
    sha256: '78400352ff85490fb1f971956933c26907a481892850a7fe2d07e795366283e8',
    path: resolve('apps/worker/assets/music/komiku-we-have-to-dance-together.mp3') }
] as const;
export type MusicTrack = (typeof MUSIC_TRACKS)[number];
// Zero-based selector; database clip indices are converted at the render boundary.
export function selectTrack(index: unknown): MusicTrack {
  if (typeof index !== 'number' || !Number.isSafeInteger(index)) return MUSIC_TRACKS[0];
  return MUSIC_TRACKS[((index % MUSIC_TRACKS.length) + MUSIC_TRACKS.length) % MUSIC_TRACKS.length]!;
}
export const STINGERS = [{ id: 'kenney-explosion-crunch-002',
  sha256: 'be2b8ddc62e4a24c91e2e77793de98549ce216faf2f323a917e7d6f34321ff97',
  path: resolve('apps/worker/assets/sfx/kenney-explosion-crunch-002.ogg') }] as const;
export interface MusicMix { track: string; gain_db: number }
export interface RenderOutcome { music: MusicMix | null; packshot: PackshotMix | null }
export function buildMusicAudioGraph(gainDb: number, duration: number, packshot?: PreparedPackshot | null): string {
  return '[0:a:0]aformat=sample_rates=44100:channel_layouts=stereo[speech];'
    + `[1:a:0]atrim=0:${duration},asetpts=PTS-STARTPTS,volume=${gainDb}dB,`
    + `afade=t=in:d=0.5,afade=t=out:st=${duration - 1}:d=1,`
    + 'aformat=sample_rates=44100:channel_layouts=stereo[bed];'
    + (packshot ? buildStingerAudioGraph(packshot) + '[speech][bed][stinger]amix=inputs=3:duration=first:normalize=0[aout]'
      : '[speech][bed]amix=inputs=2:duration=first:normalize=0[aout]');
}
export async function prepareMusic(input: string, start: number, duration: number, track: MusicTrack, signal?: AbortSignal): Promise<(MusicMix & { path: string }) | null> {
  const skip = (reason: string) => { console.info(JSON.stringify({ event: 'music_skipped', reason })); return null; };
  let speech: number, bed: number;
  try {
    speech = await measureLoudness(input, start, duration, signal);
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
