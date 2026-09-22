import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { Pool } from 'pg';
import type { Attempt } from '../packages/db/src/attempts';
import { loadLimits } from '../packages/shared/src/config';
import { environment } from './fixtures/environment';
import { ProviderError } from '../apps/worker/src/stt/client';
const state = vi.hoisted(() => ({ charged: false, calls: 0, trace: [] as string[], failure: '' }));
vi.mock('@clipmaker/db', async importOriginal => {
  const original = await importOriginal<typeof import('../packages/db/src/index')>();
  return { ...original,
    getProbeSource: vi.fn(async () => ({ status: 'queued', object_key: 'source', actual_bytes: '100', duration_seconds: '120' })),
    acceptProbe: vi.fn(async () => { state.charged = true; state.trace.push('initial_charge'); return 'transcribing'; }),
    transcriptionDeadline: vi.fn(async () => Date.now() + 60_000),
    authorizeSttCall: vi.fn(async () => { state.trace.push('authorize'); return ++state.calls; }),
    acceptTranscript: vi.fn(async () => { state.trace.push('commit'); return { stage: 'select' }; }),
    failTranscription: vi.fn(async (_pool, _attempt, reason: string) => { state.failure = reason; return true; }),
  };
});
import { probeSource, transcribeSource } from '../apps/worker/src/workers/stt';
const dirs: string[] = [];
const attempt: Attempt = { video_id: 'video', fence: 1, stage: 'stt', series_no: 1, attempt_no: 1, clip_id: null, status: 'running' };
const pool = {} as Pool, limits = loadLimits(environment());
const valid = { language: 'ru', words: [{ word: 'Привет', start: 1, end: 2 }], segments: [] };
beforeEach(() => { state.charged = false; state.calls = 0; state.trace = []; state.failure = ''; });
afterEach(async () => { await Promise.all(dirs.splice(0).map(dir => rm(dir, { recursive: true, force: true }))); });
async function fixture() {
  const directory = await mkdtemp(join(tmpdir(), 'n5-stt-order-')); dirs.push(directory);
  const deps = { pool, limits, directory, spendPath: join(directory, 'model-spend.jsonl'),
    extract: async () => ({ path: 'audio', pauses: [] }),
    chunks: async function* () { const path = join(directory, 'chunk'); await writeFile(path, 'fake');
      yield { path, offsetSeconds: 0, durationSeconds: 120, hardCut: false, index: 0 }; },
    enqueue: vi.fn(async () => { state.trace.push('enqueue'); }),
    spend: vi.fn(async () => { state.trace.push('spend'); }),
    transcriber: { transcribe: vi.fn(async () => { state.trace.push('provider'); return valid; }) } };
  return deps;
}
describe('STT operation order with deterministic dependencies', () => {
  it('minutes committed BEFORE first provider call; transcript committed BEFORE enqueue', async () => {
    const deps = await fixture();
    deps.transcriber.transcribe.mockImplementation(async () => {
      expect(state.charged).toBe(true); state.trace.push('provider'); return valid;
    });
    await probeSource(attempt, { ...deps, available: async () => 300n, download: async () => {}, probe: async () => ({ durationSec: 120, hasAudio: true }),
      continueTranscription: (file, duration, current) => transcribeSource(file, duration, current, deps) });
    expect(state.trace).toEqual(['initial_charge', 'authorize', 'spend', 'provider', 'spend', 'commit', 'enqueue']);
  });
  it('retry authorizes again before calling provider; timeout also has spend outcome', async () => {
    const deps = await fixture();
    deps.transcriber.transcribe.mockRejectedValueOnce(new ProviderError(true, 'timeout'));
    await transcribeSource('source', 120, attempt, deps);
    expect(state.calls).toBe(2);
    expect(state.trace.slice(0, 7)).toEqual(['authorize', 'spend', 'spend', 'authorize', 'spend', 'provider', 'spend']);
    expect(deps.spend).toHaveBeenCalledWith(deps.spendPath, expect.objectContaining({ result: 'timeout', phase: 'outcome' }));
  });
  it('ADR-003 empty words stop the stage before select; no invented words', async () => {
    const deps = await fixture(); deps.transcriber.transcribe.mockResolvedValueOnce({ ...valid, words: [] });
    await expect(transcribeSource('source', 120, attempt, deps)).rejects.toThrow();
    expect(state.failure).toBe('no_timestamps'); expect(deps.enqueue).not.toHaveBeenCalled();
    expect(state.trace).not.toContain('commit');
  });
  it('all three failures logged and authorized; no select after retry exhaustion', async () => {
    const deps = await fixture(); deps.transcriber.transcribe.mockRejectedValue(new ProviderError(true, 'provider_error'));
    await expect(transcribeSource('source', 120, attempt, deps)).rejects.toThrow();
    expect(state.calls).toBe(3); expect(deps.spend).toHaveBeenCalledTimes(6);
    expect(state.failure).toBe('stt_failed'); expect(deps.enqueue).not.toHaveBeenCalled();
  });
  it('unwritable spend ledger fails closed before network call', async () => {
    const deps = await fixture(); deps.spend.mockRejectedValueOnce(new Error('disk full'));
    await expect(transcribeSource('source', 120, attempt, deps)).rejects.toThrow('disk full');
    expect(deps.transcriber.transcribe).not.toHaveBeenCalled();
  });
});
