import { beforeEach, it, expect, vi } from 'vitest';
const deps = vi.hoisted(() => ({
  auth: { authenticate: vi.fn() }, partners: { apply: vi.fn(), dashboard: vi.fn() },
  video: { create: vi.fn() }, publicOrigin: 'https://app.example', trustedProxyHops: 1, allowMutation: vi.fn(),
}));
vi.mock('../apps/web/src/server/upload-runtime', () => ({ getUploadRuntime: () => deps }));
vi.mock('../apps/web/src/server/screen-runtime', () => ({ getScreenRuntime: () => ({ ...deps,
  config: { publicOrigin: deps.publicOrigin, trustedProxyHops: 1, sessionSecret: 'test' }, redis: {} }) }));
vi.mock('../apps/web/src/server/rate-limit', () => ({ allowRead: async () => true }));
import { POST, GET } from '../apps/web/src/app/api/trpc/[trpc]/route';
import { UploadError } from '../apps/web/src/server/upload-contract';
function request() {
  return new Request('https://app.example/api/trpc/code.apply', { method: 'POST', headers: {
    'Content-Type': 'application/json', cookie: '__Host-n5_session=' + 'x'.repeat(43),
    'x-forwarded-for': '192.0.2.9, 127.0.0.1', origin: 'https://app.example',
  }, body: JSON.stringify({ code: 'CODE123' }) });
}
beforeEach(() => {
  vi.clearAllMocks(); deps.auth.authenticate.mockResolvedValue({ account_id: 'session-account' });
  deps.allowMutation.mockResolvedValue(true); deps.partners.apply.mockResolvedValue({ source: 'explicit', replaced_source: 'cookie' });
});
it('canonical code.apply HTTP route returns 200, real session identity and server-derived prefix', async () => {
  const response = await POST(request()); expect(response.status).toBe(200);
  expect((await response.json()).result.data.data).toMatchObject({ replaced_source: 'cookie' });
  expect(deps.partners.apply).toHaveBeenCalledWith('session-account', { code: 'CODE123' }, '192.0.2.0/24', '__Host-n5_session=' + 'x'.repeat(43));
  expect(response.headers.get('cache-control')).toContain('no-store');
});
it('code.apply refusal stays 422, never mapped to accepted', async () => {
  deps.partners.apply.mockRejectedValue(new UploadError('invalid', 'Недействительный код', 422));
  expect((await POST(request())).status).toBe(422);
});
it('rate refusal happens before reading body or applying code', async () => {
  deps.allowMutation.mockResolvedValue(false); const req = request(), reader = vi.spyOn(req.body!, 'getReader');
  expect((await POST(req)).status).toBe(429); expect(reader).not.toHaveBeenCalled(); expect(deps.partners.apply).not.toHaveBeenCalled();
});
it('unauthenticated request cannot apply code', async () => {
  deps.auth.authenticate.mockResolvedValue(null);
  expect((await POST(request())).status).toBe(401); expect(deps.partners.apply).not.toHaveBeenCalled();
});
it('dashboard GET preserves authorized session and foreign-code 403', async () => {
  deps.partners.dashboard.mockRejectedValue(new UploadError('invalid', 'Нет доступа', 403));
  const req = new Request('https://app.example/api/trpc/partner.dashboard?input=%7B%7D', { headers: request().headers });
  expect((await GET(req)).status).toBe(403); expect(deps.partners.dashboard).toHaveBeenCalledWith('session-account', undefined);
});
