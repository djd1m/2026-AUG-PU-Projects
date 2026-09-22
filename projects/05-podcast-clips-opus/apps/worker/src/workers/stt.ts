import { acceptProbe, deferProbe, failProbe, getProbeSource, auditAttempt, heartbeatTranscription, type Attempt, type Pool } from '@clipmaker/db';
import type { Limits } from '@clipmaker/shared/config';
import type { VideoFailureReason } from '@clipmaker/shared/enums';
import { withSource, type Download, freeBytes } from '../media/download.js';
import { probeFile, ProbeError, type ProbeResult } from '../media/probe.js';
export function fileFailure(probe: ProbeResult): VideoFailureReason | null {
  if (!probe.hasAudio) return 'no_audio';
  if (probe.durationSec < 120) return 'too_short';
  if (probe.durationSec > 5400) return 'too_long';
  return null;
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
