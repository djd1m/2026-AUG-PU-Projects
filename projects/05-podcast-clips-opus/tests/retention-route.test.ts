import { describe, it, expect, vi } from 'vitest';
import { fetchRequestHandler } from '@trpc/server/adapters/fetch';
import { appRouter } from '../apps/web/src/server/trpc';
import { ErasureService } from '../apps/web/src/server/erasure';
import type { Pool } from 'pg';
import { erasureCookie } from '../apps/web/src/server/erasure-receipt';
const account = '11111111-1111-4111-8111-111111111111';
describe('canonical account.delete', () => {
  it('422 without confirmation; accepted deadline; repeat conflict', async () => {
    let status = 'active';
    const query = vi.fn(async (sql: string) => {
      if (sql.startsWith('SELECT status')) return { rows: [{ status }], rowCount: 1 };
      if (sql.startsWith("UPDATE account SET status='erasing'")) status = 'erasing';
      return { rows: [], rowCount: 0 };
    });
    const pool = { connect: async () => ({ query, release() {} }) } as unknown as Pool;
    const erasure = new ErasureService(pool, () => new Date('2026-09-24T12:00:00Z'));
    const request = (input: unknown) => fetchRequestHandler({ endpoint: '/api/trpc', router: appRouter,
      req: new Request('https://test.invalid/api/trpc/account.delete', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) }),
      createContext: () => ({ account, erasure, requestId: 'test', idempotencyKey: null, video: { create: vi.fn() } }),
    });
    expect((await request({})).status).toBe(422); expect(query).not.toHaveBeenCalled();
    const accepted = await request({ confirm: true }); expect(accepted.status).toBe(200);
    expect((await accepted.json()).result.data.data).toEqual({ accepted: true, erase_deadline: '2026-09-27T12:00:00.000Z' });
    expect((await request({ confirm: true })).status).toBe(409);
  });
  it('receipt cookie is secure and inaccessible to scripts', () => {
    expect(erasureCookie(account, 'secret')).toMatch(/; Path=\/; HttpOnly; Secure; SameSite=Lax; Max-Age=604800$/);
  });
});
