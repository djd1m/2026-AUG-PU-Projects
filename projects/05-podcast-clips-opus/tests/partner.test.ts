import { describe, it, expect, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import type { Pool } from 'pg';
import { fetchRequestHandler } from '@trpc/server/adapters/fetch';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { PartnerService, replacementAllowed, type Attribution } from '../apps/web/src/server/partner';
import { appRouter } from '../apps/web/src/server/trpc';
import { referralCookie, readReferral } from '../apps/web/src/lib/partner-referral';
import { PartnerSummary } from '../apps/web/src/app/dashboard/PartnerPanel';
const secret = 'test-referral-secret';
const account = randomUUID(), codeId = randomUUID(), prefix = '192.0.2.0/24';
const row: Attribution = { id: randomUUID(), partner_code_id: codeId, source: 'cookie', status: 'pending', replaced_source: null, reject_reason: null };
function db(options: { existing?: Attribution; count?: number; missing?: boolean; self?: boolean; blocked?: boolean; broken?: boolean } = {}) {
  const query = vi.fn(async (sql: string, values: unknown[] = []) => {
    if (options.broken && sql.includes('INSERT INTO attribution')) throw new Error('database unavailable');
    if (sql.includes('FROM partner_code c JOIN partner p') && sql.includes('FOR NO KEY UPDATE')) return { rowCount: 1,
      rows: options.missing ? [] : [{ id: codeId, account_id: options.self ? account : randomUUID(), status: options.blocked ? 'blocked' : 'active' }] };
    if (sql.includes('SELECT count(DISTINCT account_id)')) return { rowCount: 1, rows: [{ count: String(options.count ?? 1) }] };
    if (sql.includes('SELECT * FROM attribution')) return { rowCount: options.existing ? 1 : 0, rows: options.existing ? [options.existing] : [] };
    if (sql.includes('INSERT INTO attribution') && options.existing) return { rowCount: 0, rows: [] };
    if (sql.includes('RETURNING *')) return { rowCount: 1, rows: [{ ...row, source: values[2], status: values[3], reject_reason: values[4], replaced_source: options.existing?.source ?? null }] };
    return { rowCount: 1, rows: [{ id: account }] };
  });
  const release = vi.fn(), connect = vi.fn(async () => ({ query, release }));
  return { query, connect, release, pool: { query, connect } as unknown as Pool };
}
async function rpc(service: PartnerService, method: string, input: unknown, referral = '') {
  const mutation = method === 'code.apply';
  const req = new Request(`https://app.example/api/trpc/${method}${mutation ? '' : '?input=' + encodeURIComponent(JSON.stringify(input))}`, {
    method: mutation ? 'POST' : 'GET', ...(mutation ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) } : {}),
  });
  return fetchRequestHandler({ endpoint: '/api/trpc', req, router: appRouter,
    createContext: () => ({ account, requestId: 'test', idempotencyKey: null, video: { create: vi.fn() }, partners: service, ipPrefix: prefix, referralCookie: referral }) });
}
describe('partner ADR-007 isolated behavior (SQL effects require integration)', () => {
  it('cookie to explicit returns 200 and replaced_source', async () => {
    const fake = db({ existing: row });
    const response = await rpc(new PartnerService(fake.pool, secret), 'code.apply', { code: 'CODE123' });
    expect(response.status).toBe(200);
    expect((await response.json()).result.data.data).toMatchObject({ source: 'explicit', replaced_source: 'cookie' });
  });
  it('explicit to any returns 409', async () => {
    for (const source of ['explicit', 'guest_link', 'cookie'] as const) {
      const existing = { ...row, source: 'explicit' as const };
      expect(replacementAllowed(existing, source)).toBe(false);
      const response = await rpc(new PartnerService(db({ existing }).pool, secret), 'code.apply', { code: 'CODE123' }, source === 'explicit' ? '' : referralCookie('', 'CODE123', source, false, secret)!);
      expect(response.status).toBe(409);
    }
  });
  it('guest_link to cookie returns 409', async () => {
    const existing = { ...row, source: 'guest_link' as const };
    expect(replacementAllowed(existing, 'cookie')).toBe(false);
    expect((await rpc(new PartnerService(db({ existing }).pool, secret), 'code.apply', { code: 'CODE123' }, referralCookie('', 'CODE123', 'cookie', false, secret)!)).status).toBe(409);
  });
  it('invalid code returns 422 without cookie fallback or attribution writes', async () => {
    const fake = db({ missing: true, existing: row });
    const response = await rpc(new PartnerService(fake.pool, secret), 'code.apply', { code: 'INVALID' });
    expect(response.status).toBe(422);
    expect(fake.query.mock.calls.some(([sql]) => /INSERT INTO attribution|UPDATE attribution/.test(sql))).toBe(false);
    expect(fake.query.mock.calls.at(-1)?.[0]).toBe('ROLLBACK');
  });
  it('50th success blocks future applications and commits attribution', async () => {
    const fake = db({ count: 50 });
    expect((await rpc(new PartnerService(fake.pool, secret), 'code.apply', { code: 'CODE123' })).status).toBe(200);
    expect(fake.query.mock.calls.some(([sql]) => sql.includes("SET status='blocked'"))).toBe(true);
    expect(fake.query.mock.calls.at(-1)?.[0]).toBe('COMMIT');
    expect(fake.query.mock.calls.some(([sql]) => sql.includes('INSERT INTO attribution'))).toBe(true);
  });
  it('self referral is rejected and recorded', async () => {
    const fake = db({ self: true });
    const result = await new PartnerService(fake.pool, secret).apply(account, { code: 'CODE123' }, prefix);
    expect(result).toMatchObject({ status: 'rejected', reject_reason: 'self_referral' });
  });
  it('foreign partner code returns 403', async () => {
    const fake = db(); fake.query.mockResolvedValue({ rowCount: 0, rows: [] });
    expect((await rpc(new PartnerService(fake.pool, secret), 'partner.dashboard', { code_id: randomUUID() })).status).toBe(403);
    expect(fake.query).toHaveBeenCalledTimes(1);
  });
  it('rejected cannot be resurrected; equal sources conflict', () => {
    expect(replacementAllowed({ ...row, status: 'rejected' }, 'explicit')).toBe(false);
    expect(replacementAllowed(row, 'cookie')).toBe(false);
    expect(replacementAllowed({ ...row, source: 'guest_link' }, 'guest_link')).toBe(false);
    expect(replacementAllowed(row, 'guest_link')).toBe(true);
    expect(replacementAllowed({ ...row, source: 'guest_link' }, 'explicit')).toBe(true);
  });
  it('bad shape fails before connection; blocked code cannot produce another event', async () => {
    const fake = db({ blocked: true }), service = new PartnerService(fake.pool, secret);
    for (const input of [{ code: '' }, { code: 'CODE123', source: 'unknown' }, { code: 'CODE123', account_id: account }]) {
      await expect(service.apply(account, input, prefix)).rejects.toMatchObject({ status: 422 });
    }
    expect(fake.connect).not.toHaveBeenCalled();
    await expect(service.apply(account, { code: 'CODE123' }, prefix)).rejects.toMatchObject({ status: 422 });
    expect(fake.query.mock.calls.some(([sql]) => sql.includes('INTO growth_event'))).toBe(false);
  });
  it('unexpected database failure rolls back audit and releases connection', async () => {
    const fake = db({ broken: true });
    await expect(new PartnerService(fake.pool, secret).apply(account, { code: 'CODE123' }, prefix)).rejects.toThrow('database unavailable');
    expect(fake.query.mock.calls.at(-1)?.[0]).toBe('ROLLBACK'); expect(fake.release).toHaveBeenCalledOnce();
  });
});
it('passive referral preserves stronger source and ignores self visits', () => {
  const guest = referralCookie('', 'CODE123', 'guest_link', false, secret)!;
  expect(readReferral(guest, secret)).toEqual({ code: 'CODE123', source: 'guest_link' });
  expect(referralCookie(guest, 'OTHER12', 'cookie', false, secret)).toBeNull();
  expect(referralCookie('', 'CODE123', 'cookie', true, secret)).toBeNull();
  expect(readReferral('__Host-n5_referral=unknown:CODE123', secret)).toBeNull();
});
it('dashboard renders five counters, blocked explanation and attribution status without identity leakage', () => {
  const html = renderToStaticMarkup(createElement(PartnerSummary, { data: { codes: [{ id: codeId, code: 'CODE123', status: 'blocked', blocked_reason: 'antifraud_ip_burst', unblocked_at: null, unblock_reason: null }],
    counters: { visits: 10, registrations: 3, uploaded: 2, shared: 1, guests: 1 },
    statuses: [{ partner_code_id: codeId, source: 'explicit', status: 'rejected', count: 1 }] } }));
  expect(html.match(/<dt>/g)).toHaveLength(5); expect(html).toContain('Код заблокирован'); expect(html).toContain('Отклонены');
  expect(html).not.toContain(account);
});
it('RT-001 body source cannot forge provenance, signed evidence alone selects guest_link', async () => {
  const f = db(), service = new PartnerService(f.pool, secret);
  for (const source of ['explicit', 'guest_link', 'cookie']) {
    expect((await rpc(service, 'code.apply', { code: 'CODE123', source })).status).toBe(422);
  }
  expect(f.connect).not.toHaveBeenCalled();
  const cookie = referralCookie('', 'CODE123', 'guest_link', false, secret)!;
  expect((await rpc(service, 'code.apply', {}, cookie)).status).toBe(200);
  expect(f.query.mock.calls.some(([sql]) => sql.includes("VALUES('guest_registered'"))).toBe(true);
  expect(await service.apply(account, { code: 'OTHER12' }, prefix, cookie)).toMatchObject({ source: 'explicit' });
  expect(await service.apply(account, { code: 'CODE123' }, prefix, cookie)).toMatchObject({ source: 'guest_link' });
  expect(await service.apply(account, {}, prefix, '__Host-n5_referral=guest_link:CODE123')).toBeNull();
  expect(await service.apply(account, { code: 'CODE123' }, prefix)).toMatchObject({ source: 'explicit' });
});
it('RT-001 invalid explicit code never falls back to signed evidence; skip has no database effects', async () => {
  const f = db(), service = new PartnerService(f.pool, secret);
  const cookie = referralCookie('', 'CODE123', 'guest_link', false, secret)!;
  await expect(service.apply(account, { code: '!' }, prefix, cookie)).rejects.toMatchObject({ status: 422 });
  expect(await service.apply(account, { discard_referral: true }, prefix, cookie)).toBeNull();
  expect(f.connect).not.toHaveBeenCalled();
});
it('RT-001 referral signature binds source, code and deadline; legacy/duplicate/expired cookies fail closed', () => {
  const now = Date.now(), cookie = referralCookie('', 'CODE123', 'cookie', false, secret, now)!;
  expect(cookie).toContain('; HttpOnly; Secure;');
  expect(readReferral(cookie, secret, now)).toEqual({ code: 'CODE123', source: 'cookie' });
  for (const invalid of [cookie.replace('cookie:','guest_link:'), cookie.replace('CODE123','OTHER12'),
    cookie.replace(/:\d{10}:/, ':9999999999:'), `${cookie}; ${cookie}`, '__Host-n5_referral=guest_link:CODE123']) {
    expect(readReferral(invalid, secret, now)).toBeNull();
  }
  expect(readReferral(cookie, 'wrong-key', now)).toBeNull();
  expect(readReferral(cookie, secret, now + 14 * 86400_000)).toBeNull();
  expect(readReferral(cookie, secret, now - 86400_000)).toBeNull();
});
it('RT-002 rejected repeated attempts cannot move the blocking counter', async () => {
  const f = db({ existing: { ...row, source: 'explicit' } }), service = new PartnerService(f.pool, secret);
  for (let i = 0; i < 50; i++) await expect(service.apply(account, { code: 'CODE123' }, prefix)).rejects.toMatchObject({ status: 409 });
  expect(f.query.mock.calls.some(([sql]) => sql.includes('INTO growth_event') || sql.includes("SET status='blocked'"))).toBe(false);
});
it.each(['cookie', 'guest_link'] as const)('RT-003 self referral preserves existing %s attribution', async source => {
  const f = db({ self: true, existing: { ...row, source, status: 'activated' } });
  await expect(new PartnerService(f.pool, secret).apply(account, { code: 'CODE123' }, prefix)).rejects.toMatchObject({ status: 409 });
  expect(f.query.mock.calls.some(([sql]) => /INSERT INTO attribution|UPDATE attribution|INTO growth_event/.test(sql))).toBe(false);
});
it('RT-002 burst window is sampled after the code lock, including successes committed while waiting', async () => {
  const f = db(), original = f.query.getMockImplementation()!;
  let now = new Date('2026-09-23T00:00:00Z');
  const serialized = new Date(now.getTime() + 5000);
  f.query.mockImplementation(async (sql, values) => {
    if (sql.includes('FOR NO KEY UPDATE OF c')) now = serialized;
    return original(sql, values);
  });
  await new PartnerService(f.pool, secret, () => now).apply(account, { code: 'CODE123' }, prefix);
  expect(f.query.mock.calls.find(([sql]) => sql.includes("VALUES('code_applied'"))?.[1]?.[4]).toEqual(serialized);
});
it('RT-009 partner_deleted is terminal for every source and returns 409', async () => {
  for (const source of ['cookie', 'guest_link', 'explicit'] as const) {
    const existing: Attribution = { ...row, source, status: 'partner_deleted', partner_code_id: null };
    expect(replacementAllowed(existing, 'explicit')).toBe(false);
    const f = db({ existing });
    expect((await rpc(new PartnerService(f.pool, secret), 'code.apply', { code: 'CODE123' })).status).toBe(409);
    expect(f.query.mock.calls.some(([sql]) => /INSERT INTO attribution|UPDATE attribution|INTO growth_event/.test(sql))).toBe(false);
  }
});
it('RT-002 dashboard shows Moscow unblock date and escaped reason only for active codes', async () => {
  const { readFileSync } = await import('node:fs');
  const data = { codes: [{ id: codeId, code: 'CODE123', status: 'active' as 'active' | 'blocked', blocked_reason: null,
    unblocked_at: '2026-09-23T22:30:00.000Z', unblock_reason: '<script>alert(1)</script>' }],
  counters: { visits: 0, registrations: 0, uploaded: 0, shared: 0, guests: 0 }, statuses: [] };
  const html = renderToStaticMarkup(createElement(PartnerSummary, { data }));
  expect(html).toContain('Код разблокирован 24.09.2026: &lt;script&gt;alert(1)&lt;/script&gt;');
  expect(html).not.toContain('<script>');
  data.codes[0]!.status = 'blocked';
  expect(renderToStaticMarkup(createElement(PartnerSummary, { data }))).not.toContain('Код разблокирован');
  expect(readFileSync('apps/web/src/app/dashboard/PartnerPanel.tsx', 'utf8')).not.toContain('dangerouslySetInnerHTML');
});
