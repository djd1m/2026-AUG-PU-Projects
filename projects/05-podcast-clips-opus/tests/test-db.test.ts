import { beforeEach, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
const { query, end, createPool } = vi.hoisted(() => ({ query: vi.fn(), end: vi.fn(), createPool: vi.fn() }));
vi.mock('pg', () => ({ Pool: class { constructor(options: unknown) { createPool(options); } query = query; end = end; } }));
import { ensureTestDatabase } from '../scripts/test-db.mjs';
beforeEach(() => { vi.clearAllMocks(); end.mockResolvedValue(undefined); });
it('RV-009: новая БД создаётся до тестов; соединение закрывается', async () => {
  query.mockResolvedValueOnce({ rowCount: 0 }).mockResolvedValueOnce({});
  await ensureTestDatabase('postgresql://n5@db:5432/n5_test');
  expect(createPool.mock.calls[0]![0].connectionString).toBe('postgresql://n5@db:5432/postgres');
  expect(query).toHaveBeenNthCalledWith(2, 'CREATE DATABASE "n5_test"');
  expect(end).toHaveBeenCalledOnce();
  const compose = readFileSync('docker-compose.yml', 'utf8').split('\n  test:')[1]!;
  expect(compose).toContain('node scripts/test-db.mjs && npm test -- --run');
});
it('Существующая БД не пересоздаётся; гонка создания допустима', async () => {
  query.mockResolvedValueOnce({ rowCount: 1 });
  await ensureTestDatabase('postgresql://n5@db:5432/n5_test');
  expect(query).toHaveBeenCalledTimes(1);
  query.mockResolvedValueOnce({ rowCount: 0 }).mockRejectedValueOnce({ code: '42P04' });
  await expect(ensureTestDatabase('postgresql://n5@db:5432/n5_test')).resolves.toBeUndefined();
});
it('Отсутствие права создания не маскируется', async () => {
  query.mockResolvedValueOnce({ rowCount: 0 }).mockRejectedValueOnce({ code: '42501' });
  await expect(ensureTestDatabase('postgresql://n5@db:5432/n5_test')).rejects.toMatchObject({ code: '42501' });
  expect(end).toHaveBeenCalledOnce();
});
it.each([undefined, 'postgresql://n5@db/n5', 'postgresql://n5@db/x%22_test', 'mysql://n5@db/n5_test'])('Непригодная или продуктовая БД %s не затрагивается', async (url) => {
  await expect(ensureTestDatabase(url)).rejects.toThrow();
  expect(createPool).not.toHaveBeenCalled();
});
