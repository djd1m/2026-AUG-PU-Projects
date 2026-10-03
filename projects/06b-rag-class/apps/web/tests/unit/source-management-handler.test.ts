import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { Pool } from '@n6b/db';
const store = vi.hoisted(() => ({ deleteSource: vi.fn(), recrawlSource: vi.fn(), readBotStats: vi.fn() }));
vi.mock('@n6b/db', async (original) => ({ ...await original<typeof import('@n6b/db')>(), ...store }));
import { createSourceManagementHandler } from '@/server/source-management-handler';
import type { JobsDeps } from '@/server/jobs-handler';
const BASE = 'https://site.test';
const ID = '6f1c2d3e-4a5b-4c6d-8e7f-001122334455';
const pool = { connect: () => { throw new Error('pool must stay untouched'); } } as unknown as Pool;
const auth = vi.fn(async () => ID as string | null);
const log = vi.fn();
const deps: JobsDeps = { tenantPool: pool, authenticate: auth, publicBaseUrl: BASE, log };
const request = (method = 'DELETE', origin: string | null = BASE, cookie = true) => new Request(`${BASE}/api/x`, {
  method, headers: { ...(origin ? { origin } : {}), ...(cookie ? { cookie: `n6b_session=${'a'.repeat(43)}` } : {}) } });
beforeEach(() => { vi.clearAllMocks(); auth.mockResolvedValue(ID); });
describe('SRC-01/02/04 tenant source routes', () => {
  it('rejects cross/missing Origin before session/effects; GET accepts missing Origin', async () => {
    for (const action of ['delete', 'recrawl'] as const) for (const origin of [null, 'https://evil.test']) {
      expect((await createSourceManagementHandler(action, deps)(request('POST', origin), ID)).status).toBe(403);
    }
    expect(auth).not.toHaveBeenCalled();
    expect(store.deleteSource).not.toHaveBeenCalled(); expect(store.recrawlSource).not.toHaveBeenCalled();
    store.readBotStats.mockResolvedValue({ questions_7d: 0, dont_know_7d: 0 });
    expect((await createSourceManagementHandler('stats', deps)(request('GET', null), ID)).status).toBe(200);
  });
  it('all actions require valid session/id before DB effects', async () => {
    for (const action of ['delete', 'recrawl', 'stats'] as const) {
      const handle = createSourceManagementHandler(action, deps);
      expect((await handle(request('GET', BASE, false), ID)).status).toBe(401);
      expect((await handle(request(), 'bad-id')).status).toBe(404);
      auth.mockResolvedValueOnce(null);
      expect((await handle(request(), ID)).status).toBe(401);
    }
    for (const fn of Object.values(store)) expect(fn).not.toHaveBeenCalled();
  });
  it('204 has no body; conflict is exact; missing/foreign return 404', async () => {
    const handle = createSourceManagementHandler('delete', deps);
    store.deleteSource.mockResolvedValueOnce('deleted').mockResolvedValueOnce('source-busy').mockResolvedValueOnce('not-found');
    const deleted = await handle(request(), ID); expect(deleted.status).toBe(204); expect(await deleted.text()).toBe('');
    const busy = await handle(request(), ID); expect(busy.status).toBe(409);
    expect(await busy.json()).toEqual({ error: { code: 'source_busy', message: 'дождитесь окончания индексации' } });
    expect((await handle(request(), ID)).status).toBe(404);
    expect(store.deleteSource).toHaveBeenCalledWith(pool, ID, ID);
  });
  it('202 returns only job handle before work; stats returns exactly two numbers', async () => {
    store.recrawlSource.mockResolvedValueOnce({ jobId: ID, sourceId: ID, created: true }).mockResolvedValueOnce(null);
    const recrawl = createSourceManagementHandler('recrawl', deps);
    const response = await recrawl(request('POST'), ID); expect(response.status).toBe(202);
    expect(await response.json()).toEqual({ data: { job_id: ID } });
    expect((await recrawl(request('POST'), ID)).status).toBe(404);
    store.readBotStats.mockResolvedValueOnce({ questions_7d: 5, dont_know_7d: 3 }).mockResolvedValueOnce(null);
    const stats = createSourceManagementHandler('stats', deps);
    const reply = await stats(request('GET'), ID); expect(reply.headers.get('cache-control')).toBe('no-store');
    expect(await reply.json()).toEqual({ data: { questions_7d: 5, dont_know_7d: 3 } });
    expect((await stats(request('GET'), ID)).status).toBe(404);
  });
  it('database error returns safe 503 and logs class only', async () => {
    store.deleteSource.mockRejectedValueOnce(new Error('secret question password'));
    expect((await createSourceManagementHandler('delete', deps)(request(), ID)).status).toBe(503);
    expect(log).toHaveBeenCalledWith('source-management: Error');
  });
});
