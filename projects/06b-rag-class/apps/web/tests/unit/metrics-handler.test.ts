import { beforeEach, describe, expect, it, vi } from 'vitest';
import { acquireMetricBatch, isMetricOperator, type MetricBatch, type Pool } from '@n6b/db';
import { createMetricVerifyHandler, metricCursor, readMetricCursor } from '@/server/metrics-handler';

vi.mock('@n6b/db', async (original) => ({ ...await original<typeof import('@n6b/db')>(),
  acquireMetricBatch: vi.fn(), isMetricOperator: vi.fn() }));
const BASE = 'https://widget.example';
const ACTOR = '00000000-0000-0000-0000-000000000001';
const ID = '00000000-0000-0000-0000-000000000002';
const TOKEN = 'a'.repeat(43);
const SECRET = 'test-only-secret';
function fixture() {
  const batch: MetricBatch = { rows: [], nextId: ID, deadline: Date.now() + 60_000,
    authorized: vi.fn(async () => true), markVerified: vi.fn(async () => true), finish: vi.fn(async () => undefined) };
  const callbacks: Array<() => Promise<void>> = [];
  const deps = { servicePool: {} as Pool, publicBaseUrl: BASE, cursorSecret: SECRET,
    authenticate: vi.fn(async () => ACTOR), after: vi.fn((cb: () => Promise<void>) => { callbacks.push(cb); }),
    fetchPage: vi.fn(async () => { throw new Error('no outbound expected'); }), log: vi.fn() };
  vi.mocked(acquireMetricBatch).mockResolvedValue({ kind: 'ready', batch });
  return { batch, deps, callbacks, handler: createMetricVerifyHandler(deps) };
}
function request(origin: string | null = BASE, cookie = `n6b_session=${TOKEN}`) {
  return new Request(`${BASE}/admin/metrics/verify`, { method: 'POST',
    headers: { ...(origin ? { origin } : {}), cookie }, body: JSON.stringify({ account_id: ACTOR, operator: true }) });
}
beforeEach(() => { vi.clearAllMocks(); vi.mocked(isMetricOperator).mockResolvedValue(true); });

describe('MET-01 session/operator gates and MET-04 scheduling', () => {
  it('anonymous and ordinary accounts return 404, ignoring forged body authority', async () => {
    const f = fixture();
    expect((await f.handler(request(BASE, ''))).status).toBe(404);
    vi.mocked(isMetricOperator).mockResolvedValue(false);
    expect((await f.handler(request())).status).toBe(404);
    expect(f.deps.after).not.toHaveBeenCalled();
    expect(acquireMetricBatch).not.toHaveBeenCalled();
    expect(f.deps.fetchPage).not.toHaveBeenCalled();
  });
  it.each([null, 'https://foreign.example', `${BASE}/`, 'null'])('operator foreign/missing origin %s is 403 before outbound', async (origin) => {
    const f = fixture();
    expect((await f.handler(request(origin))).status).toBe(403);
    expect(acquireMetricBatch).not.toHaveBeenCalled();
    expect(f.deps.fetchPage).not.toHaveBeenCalled();
  });
  it('acquires before 202, defers work and emits an actor-bound cursor/no-store', async () => {
    const f = fixture();
    const response = await f.handler(request());
    expect(response.status).toBe(202);
    expect(response.headers.get('cache-control')).toContain('no-store');
    expect(response.headers.get('set-cookie')).toContain(metricCursor(ID, ACTOR, SECRET));
    expect(f.callbacks).toHaveLength(1);
    expect(f.batch.finish).not.toHaveBeenCalled();
    expect(await response.json()).toMatchObject({ data: { started: true, selected: 0 } });
    await f.callbacks[0]!();
    expect(f.batch.finish).toHaveBeenCalledWith(true);
  });
  it('busy does not schedule or move the cursor', async () => {
    const f = fixture();
    vi.mocked(acquireMetricBatch).mockResolvedValue({ kind: 'busy' });
    const response = await f.handler(request());
    expect(response.status).toBe(409);
    expect(response.headers.get('set-cookie')).toBeNull();
    expect(f.deps.after).not.toHaveBeenCalled();
  });
  it('scheduler throw rolls back the acquired lease before returning failure', async () => {
    const f = fixture();
    f.deps.after.mockImplementation(() => { throw new Error('scheduler unavailable'); });
    expect((await f.handler(request())).status).toBe(503);
    expect(f.batch.finish).toHaveBeenCalledExactlyOnceWith(false);
  });
  it('accepts only server-issued cursor bound to the authenticated actor', async () => {
    const cursor = metricCursor(ID, ACTOR, SECRET);
    expect(readMetricCursor(cursor, ACTOR, SECRET)).toBe(ID);
    for (const raw of [ID, cursor + 'x', cursor.replace(ID, ACTOR), 'x'.repeat(101)]) {
      expect(readMetricCursor(raw, ACTOR, SECRET)).toBeNull();
    }
    expect(readMetricCursor(cursor, ID, SECRET)).toBeNull();
    const f = fixture();
    await f.handler(request(BASE, `n6b_session=${TOKEN}; n6b_metric_cursor=${cursor}`));
    expect(acquireMetricBatch).toHaveBeenCalledWith(f.deps.servicePool, ACTOR, ID, expect.any(Function));
  });
});
