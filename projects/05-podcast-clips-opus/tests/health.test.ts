import { expect, it, vi } from 'vitest';
const { query, runtime } = vi.hoisted(() => {
  const query = vi.fn();
  return { query, runtime: vi.fn(() => ({ pool: { query } })) };
});
vi.mock('../apps/web/src/server/runtime', () => ({ getRuntime: runtime }));
import { GET } from '../apps/web/src/app/health/route';
it('health: 200 только при доступной базе и прочитанной конфигурации', async () => {
  query.mockResolvedValueOnce({ rows: [] }); expect((await GET()).status).toBe(200);
  query.mockRejectedValueOnce(new Error('offline')); expect((await GET()).status).toBe(503);
  runtime.mockImplementationOnce(() => { throw new Error('config'); }); expect((await GET()).status).toBe(503);
});
