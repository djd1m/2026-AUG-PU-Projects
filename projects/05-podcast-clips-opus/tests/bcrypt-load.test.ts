import { expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { stat } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';
import bcrypt from 'bcrypt';
import { AuthService, BCRYPT_COST, type AuthStore } from '../apps/web/src/server/auth';
import { subprocess } from './fixtures/subprocess';

it('RV-008: 12 реальных входов <= 3000 мс, fs во время нагрузки <= 1000 мс, libuv=8', async () => {
  if (process.env.N5_LOAD_CHILD !== '1') {
    const web = readFileSync('docker-compose.yml', 'utf8').split('  web:')[1]!.split('  worker-stt:')[0]!;
    const threads = /UV_THREADPOOL_SIZE:\s*"(\d+)"/.exec(web)?.[1];
    expect(threads, 'Размер libuv явно задан в compose web').toBe('8');
    const result = subprocess(['node_modules/vitest/vitest.mjs', 'run', 'tests/bcrypt-load.test.ts'],
      { ...process.env, UV_THREADPOOL_SIZE: threads, N5_LOAD_CHILD: '1' });
    console.log(result.output);
    expect(result.status, result.output).toBe(0);
    return;
  }
  const password = 'concurrent-login-password';
  const hash = await bcrypt.hash(password, BCRYPT_COST);
  const store: AuthStore = {
    findAccount: async () => ({ id: 'load-account', password_hash: hash, status: 'active' }),
    register: async () => {}, createSession: async () => true, revoke: async () => {}, findSession: async () => null,
  };
  const auth = new AuthService(store, 'load-test-secret');
  const start = performance.now();
  const logins = Array.from({ length: 12 }, () => auth.login('load@example.org', password, '192.0.2.0/24'));
  // Продолжения findAccount успевают поставить bcrypt в общий libuv-пул.
  await new Promise<void>((resolve) => setImmediate(resolve));
  const fsStart = performance.now();
  await stat('apps/web/src/server/auth.ts');
  const fsMs = performance.now() - fsStart;
  const results = await Promise.all(logins);
  const elapsed = performance.now() - start;
  console.log(JSON.stringify({ logins: 12, threads: process.env.UV_THREADPOOL_SIZE, elapsed_ms: elapsed, fs_ms: fsMs }));
  expect(results.every(Boolean)).toBe(true);
  expect(elapsed).toBeLessThanOrEqual(3000);
  expect(fsMs).toBeLessThanOrEqual(1000);
});
