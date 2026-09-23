import { it, expect, vi } from 'vitest';
import type { Pool } from 'pg';
import { PartnerService } from '../apps/web/src/server/partner';
import { referralCookie } from '../apps/web/src/lib/partner-referral';
const setup = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock('../apps/web/src/server/upload-runtime', () => ({ getUploadRuntime: setup.get }));
vi.mock('../apps/web/src/server/screen-runtime', () => ({ getScreenRuntime: vi.fn() }));
vi.mock('../apps/web/src/server/runtime', () => ({ getRuntime: vi.fn() }));
import { POST } from '../apps/web/src/app/api/trpc/[trpc]/route';
it('RT-001 actual POST propagates signed cookie, rejects body provenance and clears HttpOnly on apply/skip', async () => {
  const secret = 'test-secret', account = '11111111-1111-4111-8111-111111111111';
  const query = vi.fn(async (sql: string, values: unknown[] = []) => {
    if (sql.includes('FOR NO KEY UPDATE OF c')) return { rows: [{ id: 'code-id', account_id: 'owner', status: 'active' }], rowCount: 1 };
    if (sql.includes('SELECT * FROM attribution')) return { rows: [], rowCount: 0 };
    if (sql.includes('RETURNING *')) return { rows: [{ source: values[2], status: 'pending' }], rowCount: 1 };
    if (sql.includes('SELECT count(*)')) return { rows: [{ count: '1' }], rowCount: 1 };
    return { rows: [{ id: account }], rowCount: 1 };
  });
  const pool = { connect: async () => ({ query, release: vi.fn() }) } as unknown as Pool;
  setup.get.mockReturnValue({ partners: new PartnerService(pool, secret), video: {}, publicOrigin: 'https://app.example', trustedProxyHops: 1,
    auth: { authenticate: async () => ({ account_id: account }) }, allowMutation: async () => true });
  const cookie = referralCookie('', 'CODE123', 'guest_link', false, secret)!;
  const request = (body: unknown) => new Request('https://app.example/api/trpc/code.apply', { method: 'POST',
    headers: { 'content-type': 'application/json', origin: 'https://app.example', 'x-forwarded-for': '192.0.2.1, 127.0.0.1',
      cookie: `__Host-n5_session=${'a'.repeat(43)}; ${cookie.split(';')[0]}` }, body: JSON.stringify(body) });
  expect((await POST(request({ code: 'CODE123', source: 'guest_link' }))).status).toBe(422);
  expect(query).not.toHaveBeenCalled();
  const response = await POST(request({}));
  expect(response.status).toBe(200);
  expect((await response.json()).result.data.data).toMatchObject({ source: 'guest_link' });
  expect(response.headers.get('set-cookie')).toContain('HttpOnly');
  expect(response.headers.get('set-cookie')).toContain('Max-Age=0');
  query.mockClear();
  const skip = await POST(request({ discard_referral: true }));
  expect(skip.status).toBe(200); expect(skip.headers.get('set-cookie')).toContain('Max-Age=0');
  expect(query).not.toHaveBeenCalled();
});
