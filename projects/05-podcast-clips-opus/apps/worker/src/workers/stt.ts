import { acceptProbe, deferProbe, failProbe, getProbeSource, auditAttempt, heartbeatTranscription, type Attempt, type Pool } from '@clipmaker/db';
import type { Limits } from '@clipmaker/shared/config';
import type { VideoFailureReason } from '@clipmaker/shared/enums';
import { withSource, type Download, freeBytes } from '../media/download.js';
import { probeFile, ProbeError, PROBE_TIMEOUT_MS, type ProbeResult } from '../media/probe.js';
import { dirname, join } from 'node:path';
import { rm } from 'node:fs/promises';
import { acceptTranscript, authorizeSttCall, failTranscription, transcriptionDeadline } from '@clipmaker/db';
import { parseTranscript, TranscriptError, STT_MAX_ATTEMPTS, type TranscriptResult } from '@clipmaker/shared/transcript';
import { extractAudio } from '../stt/extract.js';
import { splitAudio } from '../stt/chunker.js';
import { ProviderError, type Transcriber } from '../stt/client.js';
import { mergeWords, TranscriptMergeError } from '../stt/merge.js';
import { recordModelSpend, type SpendEvent } from '../stt/spend.js';
export function fileFailure(probe: ProbeResult): VideoFailureReason | null {
  if (!probe.hasAudio) return 'no_audio';
  if (probe.durationSec < 120) return 'too_short';
  if (probe.durationSec > 5400) return 'too_long';
  return null;
}

export interface TranscriptionDependencies {
  pool: Pool; limits: Limits; transcriber: Transcriber; spendPath: string;
  enqueue: (attempt: Attempt) => Promise<void>;
  extract?: typeof extractAudio; chunks?: typeof splitAudio; spend?: typeof recordModelSpend;
  probeAudio?: typeof probeFile;
  clock?: () => Date;
}
// Adapted from jan-clone/workers/stt.ts: offset merge + atomic save then enqueue.
// Probe owns initial quota and the source file; this stage measures only its extracted MP3.
export async function transcribeSource(file: string, duration: number, attempt: Attempt, deps: TranscriptionDependencies): Promise<void> {
  const clock = deps.clock ?? (() => new Date());
  const deadline = await transcriptionDeadline(deps.pool, attempt);
  if (deadline === null) return;
  if (deadline <= clock().getTime()) { await failTranscription(deps.pool, attempt, 'stalled', clock()); return; }
  const signal = AbortSignal.timeout(Math.max(1, deadline - clock().getTime()));
  let next: Attempt | null = null;
  try {
    const audio = await (deps.extract ?? extractAudio)(file, join(dirname(file), 'audio.mp3'), duration, signal);
    signal.throwIfAborted();
    let audioDuration: number;
    try {
      const measured = await (deps.probeAudio ?? probeFile)(audio.path, Math.max(1, Math.min(PROBE_TIMEOUT_MS, deadline - clock().getTime())));
      if (!measured.hasAudio || !Number.isFinite(measured.durationSec) || measured.durationSec <= 0) throw new Error('Непригодная длительность MP3');
      audioDuration = measured.durationSec;
    } catch (cause) {
      // An extracted-file fault must not reach probeSource's source rejection/refund path.
      throw new Error('Не удалось измерить извлечённый MP3', { cause });
    }
    signal.throwIfAborted();
    const results: { result: TranscriptResult; offsetSeconds: number; durationSeconds: number }[] = [];
    for await (const chunk of (deps.chunks ?? splitAudio)(audio, dirname(file), duration, signal)) {
      if (chunk.hardCut) console.warn(JSON.stringify({ event: 'stt_hard_cut', video_id: attempt.video_id, chunk_index: chunk.index, offset_seconds: chunk.offsetSeconds }));
      try {
        let previousCall = 0;
        for (;;) {
          signal.throwIfAborted();
          const call = await authorizeSttCall(deps.pool, attempt, deps.limits, chunk.index, chunk.durationSeconds, clock(), previousCall);
          if (call === null) return;
          const event: SpendEvent = { video_id: attempt.video_id, fence: attempt.fence, stage: 'stt', chunk_index: chunk.index,
            attempt: call, unit: 'minutes', quantity: Math.ceil(chunk.durationSeconds / 60), result: 'started', phase: 'attempt' };
          const spend = deps.spend ?? recordModelSpend;
          await spend(deps.spendPath, event);
          let result: TranscriptResult;
          try {
            result = parseTranscript(await deps.transcriber.transcribe(chunk.path, chunk.durationSeconds, signal), chunk.durationSeconds);
          } catch (error) {
            await spend(deps.spendPath, { ...event, phase: 'outcome', result: error instanceof TranscriptError ? 'no_timestamps' : error instanceof ProviderError ? error.outcome : 'provider_error' });
            if (error instanceof ProviderError && error.retryable && call < STT_MAX_ATTEMPTS && !signal.aborted) { previousCall = call; continue; }
            throw error;
          }
          await spend(deps.spendPath, { ...event, phase: 'outcome', result: 'success' });
          results.push({ result, offsetSeconds: chunk.offsetSeconds, durationSeconds: chunk.durationSeconds });
          break;
        }
      } finally { await rm(chunk.path, { force: true }); }
    }
    const transcript = mergeWords(results, duration, audioDuration, issue => console.warn(JSON.stringify({
      event: 'stt_timestamp_clamped', video_id: attempt.video_id, fence: attempt.fence, audio_duration_seconds: audioDuration, ...issue })));
    next = await acceptTranscript(deps.pool, attempt, transcript, results.length, clock());
  } catch (error) {
    if (error instanceof TranscriptMergeError) console.error(JSON.stringify({ event: 'stt_merge_failed',
      video_id: attempt.video_id, fence: attempt.fence, video_duration_seconds: duration, ...error.timingIssue }));
    await failTranscription(deps.pool, attempt, signal.aborted ? 'stalled' : error instanceof TranscriptError ? 'no_timestamps' : 'stt_failed', clock());
    throw error;
  }
  // Commit returned before publishing. Watchdog republishes a lost enqueue.
  if (next) await deps.enqueue(next);
}
export interface ProbeDependencies {
  pool: Pool; limits: Limits; directory: string; download: Download;
  probe?: typeof probeFile; available?: typeof freeBytes; clock?: () => Date;
  // Feature 4 implements this; initial handoff shares the existing downloaded file.
  continueTranscription?: (file: string, durationSec: number, attempt: Attempt) => Promise<void>;
}
export async function probeSource(attempt: Attempt, deps: ProbeDependencies): Promise<'transcribing' | 'continued' | 'failed' | 'deferred' | 'stale'> {
  const now = deps.clock ?? (() => new Date());
  const row = await getProbeSource(deps.pool, attempt);
  if (!row) { auditAttempt('stale_attempt_result', attempt); return 'stale'; }
  // A crash after quota commit must not charge or download a second time.
  if (row.status === 'transcribing' && !deps.continueTranscription) {
    return await heartbeatTranscription(deps.pool, attempt, now()) ? 'transcribing' : 'stale';
  }
  try {
    const result = await withSource(deps.directory, row.object_key, BigInt(row.actual_bytes), deps.download, async file => {
      if (row.status === 'transcribing') {
        // Recovery after process restart: persisted charge is reused, never charged again.
        await deps.continueTranscription!(file, Number(row.duration_seconds), attempt);
        return 'continued' as const;
      }
      const measured = await (deps.probe ?? probeFile)(file);
      const failure = fileFailure(measured);
      if (failure) {
        return await failProbe(deps.pool, attempt, deps.limits, failure, now()) ? 'failed' as const : 'stale' as const;
      }
      const accepted = await acceptProbe(deps.pool, attempt, deps.limits, measured.durationSec, now());
      if (accepted === 'transcribing' && deps.continueTranscription) {
        await deps.continueTranscription(file, measured.durationSec, attempt);
        return 'continued' as const;
      }
      return accepted;
    }, deps.available);
    if (!result.deferred) return result.value;
    return await deferProbe(deps.pool, attempt, now()) ? 'deferred' : 'stale';
  } catch (error) {
    if (!(error instanceof ProbeError)) throw error;
    return await failProbe(deps.pool, attempt, deps.limits, error.reason, now()) ? 'failed' : 'stale';
  }
}
