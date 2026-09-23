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
const account = randomUUID(), codeId = randomUUID(), prefix = '192.0.2.0/24';
const row: Attribution = { id: randomUUID(), partner_code_id: codeId, source: 'cookie', status: 'pending', replaced_source: null, reject_reason: null };
function db(options: { existing?: Attribution; count?: number; missing?: boolean; self?: boolean; blocked?: boolean; broken?: boolean } = {}) {
  const query = vi.fn(async (sql: string, values: unknown[] = []) => {
    if (options.broken && sql.includes('INSERT INTO attribution')) throw new Error('database unavailable');
    if (sql.includes('FROM partner_code c JOIN partner p') && sql.includes('FOR NO KEY UPDATE')) return { rowCount: 1,
      rows: options.missing ? [] : [{ id: codeId, account_id: options.self ? account : randomUUID(), status: options.blocked ? 'blocked' : 'active' }] };
    if (sql.includes('SELECT count(*)')) return { rowCount: 1, rows: [{ count: String(options.count ?? 1) }] };
    if (sql.includes('SELECT * FROM attribution')) return { rowCount: options.existing ? 1 : 0, rows: options.existing ? [options.existing] : [] };
    if (sql.includes('INSERT INTO attribution') && options.existing) return { rowCount: 0, rows: [] };
    if (sql.includes('RETURNING *')) return { rowCount: 1, rows: [{ ...row, source: values[2], status: values[3], reject_reason: values[4], replaced_source: options.existing?.source ?? null }] };
    return { rowCount: 1, rows: [{ id: account }] };
  });
  const release = vi.fn(), connect = vi.fn(async () => ({ query, release }));
  return { query, connect, release, pool: { query, connect } as unknown as Pool };
}
async function rpc(service: PartnerService, method: string, input: unknown) {
  const mutation = method === 'code.apply';
  const req = new Request(`https://app.example/api/trpc/${method}${mutation ? '' : '?input=' + encodeURIComponent(JSON.stringify(input))}`, {
    method: mutation ? 'POST' : 'GET', ...(mutation ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) } : {}),
  });
  return fetchRequestHandler({ endpoint: '/api/trpc', req, router: appRouter,
    createContext: () => ({ account, requestId: 'test', idempotencyKey: null, video: { create: vi.fn() }, partners: service, ipPrefix: prefix }) });
}
describe('partner ADR-007 isolated behavior (SQL effects require integration)', () => {
  it('cookie to explicit returns 200 and replaced_source', async () => {
    const fake = db({ existing: row });
    const response = await rpc(new PartnerService(fake.pool), 'code.apply', { code: 'CODE123', source: 'explicit' });
    expect(response.status).toBe(200);
    expect((await response.json()).result.data.data).toMatchObject({ source: 'explicit', replaced_source: 'cookie' });
  });
  it('explicit to any returns 409', async () => {
    for (const source of ['explicit', 'guest_link', 'cookie'] as const) {
      const existing = { ...row, source: 'explicit' as const };
      expect(replacementAllowed(existing, source)).toBe(false);
      const response = await rpc(new PartnerService(db({ existing }).pool), 'code.apply', { code: 'CODE123', source });
      expect(response.status).toBe(409);
    }
  });
  it('guest_link to cookie returns 409', async () => {
    const existing = { ...row, source: 'guest_link' as const };
    expect(replacementAllowed(existing, 'cookie')).toBe(false);
    expect((await rpc(new PartnerService(db({ existing }).pool), 'code.apply', { code: 'CODE123', source: 'cookie' })).status).toBe(409);
  });
  it('invalid code returns 422 without cookie fallback or attribution writes', async () => {
    const fake = db({ missing: true, existing: row });
    const response = await rpc(new PartnerService(fake.pool), 'code.apply', { code: 'INVALID', source: 'explicit' });
    expect(response.status).toBe(422);
    expect(fake.query.mock.calls.some(([sql]) => /INSERT INTO attribution|UPDATE attribution/.test(sql))).toBe(false);
    expect(fake.query.mock.calls.at(-1)?.[0]).toBe('ROLLBACK');
  });
  it('50 attempts block code and commit refusal audit', async () => {
    const fake = db({ count: 50 });
    expect((await rpc(new PartnerService(fake.pool), 'code.apply', { code: 'CODE123' })).status).toBe(422);
    expect(fake.query.mock.calls.some(([sql]) => sql.includes("SET status='blocked'"))).toBe(true);
    expect(fake.query.mock.calls.at(-1)?.[0]).toBe('COMMIT');
    expect(fake.query.mock.calls.some(([sql]) => sql.includes('INSERT INTO attribution'))).toBe(false);
  });
  it('self referral is rejected and recorded', async () => {
    const fake = db({ self: true });
    const result = await new PartnerService(fake.pool).apply(account, { code: 'CODE123' }, prefix);
    expect(result).toMatchObject({ status: 'rejected', reject_reason: 'self_referral' });
  });
  it('foreign partner code returns 403', async () => {
    const fake = db(); fake.query.mockResolvedValue({ rowCount: 0, rows: [] });
    expect((await rpc(new PartnerService(fake.pool), 'partner.dashboard', { code_id: randomUUID() })).status).toBe(403);
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
    const fake = db({ blocked: true }), service = new PartnerService(fake.pool);
    for (const input of [{ code: '' }, { code: 'CODE123', source: 'unknown' }, { code: 'CODE123', account_id: account }]) {
      await expect(service.apply(account, input, prefix)).rejects.toMatchObject({ status: 422 });
    }
    expect(fake.connect).not.toHaveBeenCalled();
    await expect(service.apply(account, { code: 'CODE123' }, prefix)).rejects.toMatchObject({ status: 422 });
    expect(fake.query.mock.calls.some(([sql]) => sql.includes('INTO growth_event'))).toBe(false);
  });
  it('unexpected database failure rolls back audit and releases connection', async () => {
    const fake = db({ broken: true });
    await expect(new PartnerService(fake.pool).apply(account, { code: 'CODE123' }, prefix)).rejects.toThrow('database unavailable');
    expect(fake.query.mock.calls.at(-1)?.[0]).toBe('ROLLBACK'); expect(fake.release).toHaveBeenCalledOnce();
  });
});
it('passive referral preserves stronger source and ignores self visits', () => {
  const guest = referralCookie('', 'CODE123', 'guest_link', false)!;
  expect(readReferral(guest)).toEqual({ code: 'CODE123', source: 'guest_link' });
  expect(referralCookie(guest, 'OTHER12', 'cookie', false)).toBeNull();
  expect(referralCookie('', 'CODE123', 'cookie', true)).toBeNull();
  expect(readReferral('__Host-n5_referral=unknown:CODE123')).toBeNull();
});
it('dashboard renders five counters, blocked explanation and attribution status without identity leakage', () => {
  const html = renderToStaticMarkup(createElement(PartnerSummary, { data: { codes: [{ id: codeId, code: 'CODE123', status: 'blocked', blocked_reason: 'antifraud_ip_burst' }],
    counters: { visits: 10, registrations: 3, uploaded: 2, shared: 1, guests: 1 },
    statuses: [{ partner_code_id: codeId, source: 'explicit', status: 'rejected', count: 1 }] } }));
  expect(html.match(/<dt>/g)).toHaveLength(5); expect(html).toContain('Код заблокирован'); expect(html).toContain('Отклонены');
  expect(html).not.toContain(account);
});
