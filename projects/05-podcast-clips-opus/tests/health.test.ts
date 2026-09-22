import { expect, it, vi } from 'vitest';
const { query, runtime } = vi.hoisted(() => {
  const query = vi.fn();
  return { query, runtime: vi.fn(() => ({ pool: { query } })) };
});
vi.mock('../apps/web/src/server/runtime', () => ({ getRuntime: runtime }));
import { GET } from '../apps/web/src/app/health/route';
it('health: при корректной конфигурации 200 с доступной БД, 503 при отказе БД', async () => {
  query.mockResolvedValueOnce({ rows: [] }); expect((await GET()).status).toBe(200);
  query.mockRejectedValueOnce(new Error('offline')); expect((await GET()).status).toBe(503);
});
