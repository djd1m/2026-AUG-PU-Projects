import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import type { Pool } from 'pg';
import { ErasureService } from '../apps/web/src/server/erasure';
import { eraseAccount, retentionTick } from '../apps/web/src/server/retention';
import { signErasureReceipt, readErasureReceipt } from '../apps/web/src/server/erasure-receipt';
import { AccountDeletion } from '../apps/web/src/app/dashboard/AccountDeletion';
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
const account = '11111111-1111-4111-8111-111111111111';
function fixture() {
  const commands: string[] = [];
  const query = vi.fn(async (sql: string) => {
    commands.push(sql);
    if (sql.includes('pg_try_advisory_lock')) return { rows: [{ locked: true }], rowCount: 1 };
    if (sql.startsWith('SELECT status FROM account')) return { rows: [{ status: 'active' }], rowCount: 1 };
    if (sql.startsWith('SELECT id FROM account')) return { rows: [{ id: account }], rowCount: 1 };
    return { rows: [], rowCount: 0 };
  });
  const release = vi.fn();
  const pool = { query, connect: async () => ({ query, release }) } as unknown as Pool;
  const storage = { delete: vi.fn(async () => {}), erasePrefix: vi.fn(async () => {}) };
  return { pool, query, commands, storage };
}
describe('retention and erasure guards', () => {
  it('confirmation required before state changes', async () => {
    const f = fixture(), service = new ErasureService(f.pool);
    for (const confirm of [false, undefined, 'true', 1, null]) {
      await expect(service.request(account, { confirm })).rejects.toMatchObject({ status: 422 });
    }
    expect(f.query).not.toHaveBeenCalled();
    expect(await service.request(account, { confirm: true })).toMatchObject({ accepted: true });
  });
  it('revokes guests before any storage deletion and completion follows objects', async () => {
    const f = fixture(), now = new Date();
    await new ErasureService(f.pool, () => now).request(account, { confirm: true });
    f.storage.erasePrefix.mockImplementation(async () => {
      expect(f.commands.some(s => s.startsWith('UPDATE guest_pack SET revoked_at'))).toBe(true);
      expect(f.commands.some(s => s.startsWith('UPDATE account SET status=\'deleted\''))).toBe(false);
    });
    await eraseAccount(f.pool, f.storage, account, now);
    expect(f.storage.erasePrefix).toHaveBeenCalledWith(`videos/${account}/`);
    expect(f.commands.some(s => s.includes("status='erasing',deletion_requested_at"))).toBe(true);
    expect(f.commands.some(s => s.includes("status='deleted'"))).toBe(true);
  });
  it('storage failure preserves database rows for retry', async () => {
    const f = fixture(); f.storage.erasePrefix.mockRejectedValue(new Error('storage unavailable'));
    await expect(eraseAccount(f.pool, f.storage, account, new Date())).rejects.toThrow('storage unavailable');
    expect(f.commands.some(s => /DELETE FROM/.test(s))).toBe(false);
    expect(f.commands.some(s => s.includes("status='deleted'"))).toBe(false);
  });
  it('free clips older than three days are removed before row markers', async () => {
    const f = fixture();
    f.query.mockImplementation(async sql => {
      f.commands.push(sql);
      if (sql.includes('pg_try_advisory_lock')) return { rows: [{ locked: true }], rowCount: 1 };
      if (sql.startsWith('SELECT c.id,c.object_key')) return { rows: [{ id: account, object_key: 'clip', thumbnail_key: 'thumb' }], rowCount: 1 };
      return { rows: [], rowCount: 0 };
    });
    await retentionTick(f.pool, f.storage, new Date('2026-09-24T12:00:00Z'));
    expect(f.storage.delete.mock.calls).toEqual([['clip'], ['thumb']]);
    expect(f.query).toHaveBeenCalledWith(expect.stringContaining("a.plan <> 'paid'"), [new Date('2026-09-21T12:00:00Z'), 100]);
    expect(f.commands.some(s => s.startsWith('UPDATE clip SET object_key=NULL'))).toBe(true);
  });
  it('expired guest packs are revoked using existing fourteen-day expiry', async () => {
    const f = fixture(); await retentionTick(f.pool, f.storage);
    expect(f.commands.some(s => s.startsWith('UPDATE guest_pack SET revoked_at=$1') && s.includes('expires_at<=$1'))).toBe(true);
    const sql = readFileSync('packages/db/migrations/001_init.sql', 'utf8');
    expect(sql).toContain("expires_at = sent_at + interval '336 hours'");
  });
  it('growth events survive clip deletion with SET NULL', () => {
    const sql = readFileSync('packages/db/migrations/001_init.sql', 'utf8').split('CREATE TABLE growth_event')[1]!.split('CREATE TABLE attribution')[0]!;
    expect(sql).toContain('clip_id uuid REFERENCES clip(id) ON DELETE SET NULL');
  });
  it('irreversibility and external copies disclosed BEFORE confirmation', () => {
    const html = renderToStaticMarkup(createElement(AccountDeletion));
    expect(html).toContain('Удаление необратимо');
    expect(html).toContain('уже скачанные или опубликованные в чужих лентах');
    expect(html.indexOf('Удаление необратимо')).toBeLessThan(html.indexOf('type="checkbox"'));
    expect(html).toMatch(/<button disabled=""/);
  });
  it('receipt is status-only, expiring, signed and tamper resistant', () => {
    const now = Date.now(), token = signErasureReceipt(account, 'secret', now);
    expect(readErasureReceipt(token, 'secret', now)).toBe(account);
    expect(readErasureReceipt(token, 'other', now)).toBeNull();
    expect(readErasureReceipt(token.replace('11111111', '22222222'), 'secret', now)).toBeNull();
    expect(readErasureReceipt(token, 'secret', now + 8 * 86400_000)).toBeNull();
  });
});
