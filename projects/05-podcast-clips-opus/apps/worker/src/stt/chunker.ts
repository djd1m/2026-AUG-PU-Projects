// Adapted from jan-clone/apps/worker/lib/audio-chunker.ts (180s MP3 chunks).
import { stat } from 'node:fs/promises';
import { join } from 'node:path';
import { STT_CHUNK_SECONDS, STT_MAX_BYTES, STT_OVERLAP_SECONDS } from '@clipmaker/shared/transcript';
import { runFfmpeg, type ExtractedAudio } from './extract.js';
export interface AudioChunk { path: string; offsetSeconds: number; durationSeconds: number; hardCut: boolean; index: number }
export function chunkBoundaries(duration: number, pauses: number[]) {
  if (!Number.isFinite(duration) || duration <= 0 || duration > 5400) throw new Error('Непригодная длительность');
  const chunks: Omit<AudioChunk, 'path'>[] = [];
  let offset = 0;
  while (offset < duration) {
    const target = offset + STT_CHUNK_SECONDS;
    const candidates = pauses.filter(p => Number.isFinite(p) && p >= target - 20 && p <= target + 20 && p < duration);
    const pause = candidates.sort((a, b) => Math.abs(a - target) - Math.abs(b - target))[0];
    const end = target >= duration ? duration : pause ?? target;
    chunks.push({ offsetSeconds: offset, durationSeconds: end - offset, hardCut: end < duration && pause === undefined, index: chunks.length });
    if (end === duration) break;
    offset = end - STT_OVERLAP_SECONDS;
  }
  return chunks;
}
export async function* splitAudio(audio: ExtractedAudio, directory: string, duration: number, signal: AbortSignal): AsyncGenerator<AudioChunk> {
  for (const chunk of chunkBoundaries(duration, audio.pauses)) {
    const path = join(directory, `chunk_${chunk.index}.mp3`);
    await runFfmpeg(['-y', '-ss', String(chunk.offsetSeconds), '-protocol_whitelist', 'file', '-i', audio.path, '-t', String(chunk.durationSeconds),
      '-vn', '-ac', '1', '-ar', '16000', '-acodec', 'libmp3lame', '-b:a', '64k', path], signal);
    const size = (await stat(path)).size;
    if (size <= 0 || size > STT_MAX_BYTES) throw new Error('Чанк превышает лимит поставщика');
    yield { ...chunk, path };
  }
}
