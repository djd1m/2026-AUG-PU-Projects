import { beforeEach, describe, it, expect, vi } from 'vitest';
import type { Attempt } from '../packages/db/src/attempts';
import type { Pool } from 'pg';
import { loadLimits } from '../packages/shared/src/config';
import { selectFragments } from '../apps/worker/src/workers/select';
import { createFakeSelector, type FakeCase } from '../apps/worker/src/llm/fake';
import { environment } from './fixtures/environment';
import { failSelection } from '@clipmaker/db';
const state = vi.hoisted(() => ({ trace: [] as string[], failure: '', refused: false }));
vi.mock('@clipmaker/db', () => ({
  authorizeSelection: vi.fn(async () => { state.trace.push('quota'); return state.refused ? null : {
    duration: 360, transcript: { language: 'ru', segments: [], words: Array.from({ length: 360 }, (_, i) => ({ word: 'слово', start: i, end: i + 1 })) },
  }; }),
  acceptSelection: vi.fn(async () => { state.trace.push('commit'); return [{ stage: 'render' }]; }),
  failSelection: vi.fn(async (_pool, _attempt, reason) => { state.failure = reason; }),
}));
const attempt: Attempt = { video_id: 'video', stage: 'select', clip_id: null, series_no: 1, fence: 1, attempt_no: 1, status: 'running' };
function fixture(scenario: FakeCase = 'valid') {
  const fake = createFakeSelector(scenario);
  return { pool: {} as Pool, limits: loadLimits(environment()), model: 'anthropic/claude-sonnet-5', spendPath: '/unused',
    selector: { select: vi.fn(async (...args: Parameters<typeof fake.select>) => { state.trace.push('call'); return fake.select(...args); }) },
    spend: vi.fn(async (_path, event) => { state.trace.push(event.phase); }),
    enqueue: vi.fn(async () => { state.trace.push('enqueue'); }),
  };
}
describe('SelectFragments order and attempt accounting', () => {
  beforeEach(() => { vi.clearAllMocks(); state.trace = []; state.failure = ''; state.refused = false; });
  it('user_llm consumed BEFORE model, one call per video and commit BEFORE enqueue', async () => {
    const deps = fixture(); await selectFragments(attempt, deps);
    expect(state.trace).toEqual(['quota', 'attempt', 'call', 'outcome', 'commit', 'enqueue']);
    expect(deps.selector.select).toHaveBeenCalledTimes(1);
  });
  it('refusal makes no paid attempt', async () => {
    state.refused = true; const deps = fixture(); await selectFragments(attempt, deps);
    expect(deps.selector.select).not.toHaveBeenCalled(); expect(deps.spend).not.toHaveBeenCalled();
  });
  it.each(['5xx', 'timeout'] as const)('counts attempts including %s, no silent retry', async scenario => {
    const deps = fixture(scenario); await expect(selectFragments(attempt, deps)).rejects.toThrow();
    expect(deps.spend.mock.calls.map(c => c[1].phase)).toEqual(['attempt', 'outcome']);
    expect(state.trace.indexOf('attempt')).toBeLessThan(state.trace.indexOf('call'));
    expect(deps.selector.select).toHaveBeenCalledTimes(1); expect(deps.enqueue).not.toHaveBeenCalled();
  });
  it('empty selection is a named failure, never rendering with zero cards', async () => {
    const deps = fixture('empty'); await selectFragments(attempt, deps);
    expect(state.failure).toBe('no_fragments'); expect(state.trace).not.toContain('commit');
  });
  it('RV-5 database failure preserves the ledger outcome and original provider error', async () => {
    const deps = fixture('5xx'), original = new Error('provider unavailable');
    deps.selector.select.mockImplementationOnce(async () => { state.trace.push('call'); throw original; });
    vi.mocked(failSelection).mockImplementationOnce(async () => { state.trace.push('db-down'); throw new Error('db down'); });
    await expect(selectFragments(attempt, deps)).rejects.toBe(original);
    expect(state.trace).toEqual(['quota', 'attempt', 'call', 'outcome', 'db-down']);
    expect(deps.spend).toHaveBeenLastCalledWith(deps.spendPath, expect.objectContaining({ phase: 'outcome', result: 'provider_error' }));
  });
  it('RV-5 spend ledger unavailable blocks network, closes failure and preserves the original error', async () => {
    const deps = fixture(), original = new Error('attempt disk full');
    deps.spend.mockRejectedValue(new Error('outcome disk full')).mockRejectedValueOnce(original);
    await expect(selectFragments(attempt, deps)).rejects.toBe(original);
    expect(deps.selector.select).not.toHaveBeenCalled();
    expect(deps.spend.mock.calls.map(c => c[1].phase)).toEqual(['attempt', 'outcome']);
    expect(failSelection).toHaveBeenCalledWith(deps.pool, attempt, 'stalled');
    expect(state.failure).toBe('stalled');
    expect(deps.enqueue).not.toHaveBeenCalled();
  });
  it.each([false, true])('RV-5 outcome ledger failure still attempts database closure (database down: %s)', async databaseDown => {
    const deps = fixture(), original = new Error('provider unavailable');
    deps.selector.select.mockRejectedValueOnce(original);
    deps.spend.mockResolvedValueOnce(undefined).mockRejectedValue(new Error('outcome disk full'));
    if (databaseDown) vi.mocked(failSelection).mockRejectedValueOnce(new Error('db down'));
    await expect(selectFragments(attempt, deps)).rejects.toBe(original);
    expect(deps.spend.mock.calls.map(c => c[1].phase)).toEqual(['attempt', 'outcome']);
    expect(failSelection).toHaveBeenCalledWith(deps.pool, attempt, 'stalled');
    if (!databaseDown) expect(state.failure).toBe('stalled');
    expect(deps.enqueue).not.toHaveBeenCalled();
  });
  it('Redis publish failure preserves successful commit for watchdog', async () => {
    const deps = fixture(); deps.enqueue.mockRejectedValue(new Error('redis down'));
    await expect(selectFragments(attempt, deps)).resolves.toBeUndefined(); expect(state.failure).toBe(''); expect(state.trace).toContain('commit');
  });
});
