import { it, expect, vi } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, openSync, readFileSync, closeSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { PoolClient, Pool } from 'pg';
import { createClipLink, clipCodeLength } from '../packages/db/src/clip-link';
import { createClipFileHandler } from '../apps/web/src/server/clip-file';
it('И-2 generator defaults to ten, flag enables six, collisions retry and invalid flags fail closed', async () => {
  const query = vi.fn().mockResolvedValueOnce({ rowCount: 0 }).mockResolvedValue({ rowCount: 1 });
  try {
    vi.stubEnv('N5_SHORT_CODE_LENGTH', '6');
    await createClipLink({ query } as unknown as PoolClient, 'clip');
    expect(query).toHaveBeenCalledTimes(2);
    for (const call of query.mock.calls) expect(call[1][1]).toMatch(/^[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{6}$/);
    vi.stubEnv('N5_SHORT_CODE_LENGTH', undefined);
    await createClipLink({ query } as unknown as PoolClient, 'clip');
    expect(query.mock.calls.at(-1)![1][1]).toHaveLength(10);
    for (const value of ['', '4', '7', ' 6', 'six']) expect(() => clipCodeLength(value)).toThrow('N5_SHORT_CODE_LENGTH');
  } finally { vi.unstubAllEnvs(); }
});
it.each(['file', 'thumbnail'] as const)('RT-007 %s limiter rejects before query/sign/stream including signed guest tickets', async kind => {
  const query = vi.fn(), sign = vi.fn(), stream = vi.fn(), allowRead = vi.fn().mockResolvedValue(false);
  const handler = createClipFileHandler({ pool: { query } as unknown as Pool, auth: { authenticate: vi.fn() }, sign, stream,
    trustedProxyHops: 1, allowRead, guestSecret: 'test' }, kind);
  const response = await handler(new Request(`https://app.example/api/clips/id/${kind}?g=${'a'.repeat(32)}&sig=x&until=1`, {
    headers: { 'x-forwarded-for': '192.0.2.5, 127.0.0.1' },
  }), '11111111-1111-4111-8111-111111111111');
  expect(response.status).toBe(429);
  expect(allowRead).toHaveBeenCalledWith('192.0.2.5', undefined);
  expect(query).not.toHaveBeenCalled(); expect(sign).not.toHaveBeenCalled(); expect(stream).not.toHaveBeenCalled();
});
it.each(['0', '1'])('RT-011 absent DATABASE_URL warns with exact skipped count; acceptance=%s', acceptance => {
  const env: NodeJS.ProcessEnv = { ...process.env, N5_ACCEPTANCE: acceptance };
  delete env.DATABASE_URL; delete env.REDIS_URL; delete env.S3_ENDPOINT;
  const dir = mkdtempSync(join(tmpdir(), 'n5-skip-')), file = join(dir, 'out'), fd = openSync(file, 'w');
  try {
    const result = spawnSync(process.execPath, ['scripts/test.mjs', 'tests/short-link.integration.test.ts', '--reporter=dot'],
      { env, stdio: ['ignore', fd, fd], timeout: 25000 });
    expect(result.error).toBeUndefined();
    expect(result.status).toBe(acceptance === '1' ? 1 : 0);
    const output = readFileSync(file, 'utf8');
    expect(output).toMatch(/WARNING: ПРОПУЩЕНО 9 тестов; отсутствуют DATABASE_URL/);
    if (acceptance === '1') expect(output).toContain('N5_ACCEPTANCE=1: приёмка запрещает любые пропуски');
  } finally { closeSync(fd); rmSync(dir, { recursive: true, force: true }); }
}, 30000);
