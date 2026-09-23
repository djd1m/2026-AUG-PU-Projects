import { readFileSync } from 'node:fs';
import { expect, it, vi } from 'vitest';
import type { Pool } from 'pg';
import { ShortLinkService, type ShortLink } from '../apps/web/src/server/short-link';
import { createShortLinkHandler } from '../apps/web/src/server/short-link-handler';
import { UploadError } from '../apps/web/src/server/upload-contract';
import { appRouter } from '../apps/web/src/server/trpc';
const now = new Date('2026-09-22T21:00:00.000Z');
const row: ShortLink = { id: 'link', code: '23456789AB', account_id: 'owner', title: 'Момент <script>alert(1)</script>',
  status: 'done', thumbnail_key: 'private/thumb', expires_at: null, finished_at: now, plan: 'free' };
const request = () => new Request('https://app.example/c/23456789AB', { headers: { 'x-forwarded-for': '192.0.2.99, 127.0.0.1' } });
function setup(overrides: Partial<ShortLink> = {}) {
  const links = { find: vi.fn().mockResolvedValue({ ...row, ...overrides }), recordView: vi.fn().mockResolvedValue(undefined) };
  const preview = vi.fn().mockResolvedValue('https://storage.example/thumb?x=1&y=2');
  const auth = { authenticate: vi.fn().mockResolvedValue(null) };
  const allowRead = vi.fn().mockResolvedValue(true);
  return { links, preview, auth, allowRead,
    handle: createShortLinkHandler({ referralSecret: 'test-secret', links, preview, auth, allowRead, trustedProxyHops: 1, clock: () => now }) };
}
it('anonymous landing returns escaped preview and CTA, no redirect, no cache, mobile viewport', async () => {
  const deps = setup(); const response = await deps.handle(request(), row.code); const html = await response.text();
  expect(response.status).toBe(200); expect(response.headers.get('location')).toBeNull();
  expect(response.headers.get('cache-control')).toBe('no-store');
  expect(response.headers.get('content-type')).toContain('text/html');
  expect(html).toContain('КлипМейкер'); expect(html).toContain('Сделать свои клипы');
  expect(html).toContain('width=device-width'); expect(html).toContain('@media(max-width:600px)');
  expect(html).toContain('<img'); expect(html).toContain('x=1&amp;y=2');
  expect(html).not.toContain('<script>'); expect(html).not.toContain('<video');
  expect(html).not.toContain('private/thumb');
  expect(deps.auth.authenticate).not.toHaveBeenCalled();
  expect(deps.links.recordView).toHaveBeenCalledWith(expect.objectContaining({ id: 'link' }), null, '192.0.2.0/24');
});
it.each([
  { expires_at: new Date('2026-09-20'), thumbnail_key: null },
  { finished_at: new Date('2026-09-19T21:00:00Z') },
])('expired landing survives file removal or 72-hour boundary', async overrides => {
  const deps = setup(overrides); const response = await deps.handle(request(), row.code);
  expect(response.status).toBe(200); expect(await response.text()).toContain('Срок хранения клипа истёк');
  expect(deps.preview).not.toHaveBeenCalled(); expect(deps.links.recordView).toHaveBeenCalledOnce();
});
it('missing object keeps landing and explains unavailable preview', async () => {
  const deps = setup(); deps.preview.mockResolvedValue(null);
  const response = await deps.handle(request(), row.code);
  expect(response.status).toBe(200); expect(await response.text()).toContain('Превью этого клипа пока недоступно');
});
it('non-ready clip does not expose its preview', async () => {
  const deps = setup({ status: 'rendering' });
  expect((await deps.handle(request(), row.code)).status).toBe(200); expect(deps.preview).not.toHaveBeenCalled();
});
it('unknown and revoked use identical 404 handler response', async () => {
  const deps = setup(); deps.links.find.mockRejectedValue(new UploadError('not_found', 'Ссылка не найдена', 404));
  const one = await deps.handle(request(), row.code), two = await deps.handle(request(), 'ZZZZZZZZZZ');
  expect([one.status, two.status]).toEqual([404, 404]); expect(await one.text()).toBe(await two.text());
  expect(deps.preview).not.toHaveBeenCalled(); expect(deps.links.recordView).not.toHaveBeenCalled();
});
it('invalid trusted IP and rate refusal cannot write events', async () => {
  const deps = setup();
  expect((await deps.handle(new Request('https://app.example/c/x'), row.code)).status).toBe(503);
  deps.allowRead.mockResolvedValue(false);
  expect((await deps.handle(request(), row.code)).status).toBe(429);
  expect(deps.links.find).not.toHaveBeenCalled(); expect(deps.links.recordView).not.toHaveBeenCalled();
});
it('analytics failure is visible and never a false 200', async () => {
  const deps = setup(); deps.links.recordView.mockRejectedValue(new Error('database offline'));
  expect((await deps.handle(request(), row.code)).status).toBe(503);
});
it('owner self-visit never opens a transaction', async () => {
  const connect = vi.fn(); const links = new ShortLinkService({ connect } as unknown as Pool);
  await links.recordView(row, 'owner', '192.0.2.0/24'); expect(connect).not.toHaveBeenCalled();
});
it.each([0, 1])('conflict is normal; increment only if event inserted (%s)', async rowCount => {
  const query = vi.fn().mockImplementation(async (sql: string) => ({ rowCount: sql.includes('INSERT') ? rowCount : 1 }));
  const release = vi.fn(); const connect = vi.fn().mockResolvedValue({ query, release });
  const links = new ShortLinkService({ connect } as unknown as Pool, () => now);
  await links.recordView(row, null, '192.0.2.0/24');
  expect(query.mock.calls[0]?.[0]).toBe('BEGIN'); expect(query.mock.calls.at(-1)?.[0]).toBe('COMMIT');
  expect(query.mock.calls.filter(([sql]) => sql.includes('UPDATE'))).toHaveLength(rowCount);
  expect(query).toHaveBeenCalledWith(expect.stringContaining('ON CONFLICT DO NOTHING RETURNING id'), ['link', '192.0.2.0/24', '2026-09-23', null]);
  expect(release).toHaveBeenCalledOnce();
});
it('query filters revoked links, deleted videos and inactive accounts; malformed code never queries', async () => {
  const query = vi.fn().mockResolvedValue({ rows: [] });
  const links = new ShortLinkService({ query } as unknown as Pool);
  await expect(links.find("' OR TRUE")).rejects.toMatchObject({ status: 404 }); expect(query).not.toHaveBeenCalled();
  await expect(links.find(row.code)).rejects.toMatchObject({ status: 404 });
  expect(query).toHaveBeenCalledWith(expect.stringContaining('l.revoked_at IS NULL'), [row.code]);
  expect(query.mock.calls[0]?.[0]).toContain("a.status='active'"); expect(query.mock.calls[0]?.[0]).toContain('v.deleted_at IS NULL');
});
it('link.create is mutation using authenticated owner and validates clip UUID', async () => {
  const copy = vi.fn().mockResolvedValue({ code: row.code, url: `/c/${row.code}` });
  const caller = appRouter.createCaller({ account: 'owner', idempotencyKey: null, requestId: 'r', links: { copy }, video: { create: vi.fn() } });
  const clip = '00000000-0000-4000-8000-000000000001';
  expect((await caller.link.create({ clip_id: clip })).data).toEqual({ code: row.code, url: `/c/${row.code}` });
  expect(copy).toHaveBeenCalledWith('owner', clip);
  await expect(caller.link.create({ clip_id: 'bad' })).rejects.toThrow(); expect(copy).toHaveBeenCalledOnce();
  copy.mockRejectedValue(new UploadError('not_found', 'Ссылка не найдена', 404));
  await expect(caller.link.create({ clip_id: clip })).rejects.toMatchObject({ code: 'NOT_FOUND' });
});
it('copy button remains available after file expiry and uses canonical RPC', () => {
  const source = readFileSync('apps/web/src/app/clips/ClipCard.tsx', 'utf8');
  expect(source).toContain("'link.create'"); expect(source).toContain('navigator.clipboard.writeText(absolute)');
  expect(source).toContain('disabled={copying}'); expect(source).toContain('Скопируйте ссылку вручную');
});
it('И-1 lowercase and uppercase codes resolve to the same public page', async () => {
  const query = vi.fn(async (_sql: string, values: unknown[]) => ({ rows: values[0] === 'K7M2XQ9PRT' ? [row] : [] }));
  const links = new ShortLinkService({ query } as unknown as Pool);
  links.recordView = vi.fn();
  const handler = createShortLinkHandler({ links, auth: { authenticate: vi.fn() }, referralSecret: 'test-secret',
    trustedProxyHops: 1, allowRead: async () => true, preview: async () => null });
  const lower = await handler(request(), 'k7m2xq9prt'), upper = await handler(request(), 'K7M2XQ9PRT');
  expect(lower.status).toBe(200); expect(upper.status).toBe(200);
  expect(await lower.text()).toBe(await upper.text());
});
it('И-2 six-character links resolve alongside old ten-character links', async () => {
  const query = vi.fn().mockResolvedValue({ rows: [row] }), links = new ShortLinkService({ query } as unknown as Pool);
  for (const code of ['k7m2xq', 'K7M2XQ', 'K7M2XQ9PRT']) expect(await links.find(code)).toEqual(row);
  for (const code of ['K7M2X', 'K7M2XQ9', 'K7M2XQ9PRTW', '000000']) await expect(links.find(code)).rejects.toMatchObject({ status: 404 });
});
