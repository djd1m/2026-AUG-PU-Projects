// из N5: projects/05-podcast-clips-opus/tests/health.test.ts — здоровье требует расширения pgvector
import { expect, it, vi } from 'vitest';
const { query, runtime } = vi.hoisted(() => {
  const query = vi.fn();
  return { query, runtime: vi.fn(() => ({ pool: { query } })) };
});
vi.mock('../apps/web/src/server/runtime', () => ({ getRuntime: runtime }));
import { GET } from '../apps/web/src/app/health/route';
it('health: 200 при БД с pgvector, 503 без расширения и при отказе БД', async () => {
  query.mockResolvedValueOnce({ rowCount: 1, rows: [{ extversion: '0.8.1' }] }); expect((await GET()).status).toBe(200);
  query.mockResolvedValueOnce({ rowCount: 0, rows: [] }); expect((await GET()).status).toBe(503);
  query.mockRejectedValueOnce(new Error('offline')); expect((await GET()).status).toBe(503);
});
