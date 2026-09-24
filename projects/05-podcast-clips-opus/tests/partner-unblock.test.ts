import { expect, it, vi } from 'vitest';
import { mkdtempSync, openSync, closeSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import type { Pool } from 'pg';
import { unblockPartnerCode, main } from '../packages/db/scripts/partner-code-unblock.mjs';
const now = new Date('2026-09-24T12:00:00Z');
it('RT-002 unblock reason validates before SQL, trims and accepts 500 characters', async () => {
  const query = vi.fn(async () => ({ rowCount: 1, rows: [{ code: 'CODE123' }] }));
  const pool = { query } as unknown as Pool;
  for (const reason of [undefined, '', ' \n\t ', 'x'.repeat(501)]) {
    await expect(unblockPartnerCode(pool, 'CODE123', reason as string, now)).rejects.toThrow('Причина');
  }
  expect(query).not.toHaveBeenCalled();
  await unblockPartnerCode(pool, 'CODE123', '  Проверено  ', now);
  expect(query).toHaveBeenCalledWith(expect.stringContaining("WHERE code=$1 AND status='blocked' RETURNING"), ['CODE123', 'Проверено', now]);
  await unblockPartnerCode(pool, 'CODE123', 'я'.repeat(500), now);
  await unblockPartnerCode(pool, 'CODE123', '😀'.repeat(500), now);
});
it('RT-002 unblock missing or active code fails after a single atomic statement', async () => {
  const query = vi.fn(async () => ({ rowCount: 0, rows: [] }));
  await expect(unblockPartnerCode({ query } as unknown as Pool, 'CODE123', 'Причина', now)).rejects.toThrow('Код не найден или не заблокирован');
  expect(query).toHaveBeenCalledTimes(1);
});
it('RT-002 operator CLI without DATABASE_URL exits 2; invalid arguments exit 1', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'n5-unblock-cli-'));
  const path = join(directory, 'output.txt'), fd = openSync(path, 'w');
  try {
    const result = spawnSync(process.execPath, ['packages/db/scripts/partner-code-unblock.mjs', 'CODE123', 'Причина'],
      { stdio: ['ignore', fd, fd], timeout: 15000, env: { ...process.env, DATABASE_URL: '' } });
    expect(result.status).toBe(2);
    expect(readFileSync(path, 'utf8')).toContain('проверка НЕ ВЫПОЛНЕНА');
  } finally { closeSync(fd); rmSync(directory, { recursive: true, force: true }); }
  const log = vi.spyOn(console, 'error').mockImplementation(() => {});
  try {
    for (const args of [['CODE123'], ['CODE123', ''], ['CODE123', '   '], ['CODE123', 'x'.repeat(501)]]) {
      expect(await main(args, { DATABASE_URL: 'postgresql://unused:unused@127.0.0.1:1/unused_test' })).toBe(1);
    }
  } finally { log.mockRestore(); }
});
