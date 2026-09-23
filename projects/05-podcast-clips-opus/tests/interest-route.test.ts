import { beforeEach, it, expect, vi } from 'vitest';
const deps = vi.hoisted(() => ({
  auth: { authenticate: vi.fn() }, interest: { create: vi.fn() }, video: { create: vi.fn() },
  publicOrigin: 'https://app.example', trustedProxyHops: 1, allowMutation: vi.fn(),
}));
vi.mock('../apps/web/src/server/upload-runtime', () => ({ getUploadRuntime: () => deps }));
import { POST } from '../apps/web/src/app/api/trpc/[trpc]/route';
import { UploadError } from '../apps/web/src/server/upload-contract';
function request(origin = 'https://app.example') {
  return new Request('https://app.example/api/trpc/interest.create', { method: 'POST', headers: {
    'Content-Type': 'application/json', cookie: '__Host-n5_session=' + 'x'.repeat(43),
    'x-forwarded-for': '192.0.2.9, 127.0.0.1', origin,
  }, body: JSON.stringify({ source_screen: 'clip_card' }) });
}
beforeEach(() => {
  vi.clearAllMocks(); deps.auth.authenticate.mockResolvedValue({ account_id: 'session-owner' });
  deps.allowMutation.mockResolvedValue(true); deps.interest.create.mockResolvedValue({ recorded: true });
});
it('canonical interest.create uses session identity and no-store', async () => {
  const response = await POST(request()); expect(response.status).toBe(202);
  expect((await response.json()).result.data.data).toEqual({ recorded: true });
  expect(deps.interest.create).toHaveBeenCalledWith('session-owner', { source_screen: 'clip_card' });
  expect(response.headers.get('cache-control')).toContain('no-store');
});
it('anonymous and foreign-origin presses cannot record interest', async () => {
  expect((await POST(request('https://other.invalid'))).status).toBe(403);
  deps.auth.authenticate.mockResolvedValue(null);
  expect((await POST(request())).status).toBe(401); expect(deps.interest.create).not.toHaveBeenCalled();
});
it('rate limiting precedes body and database; validation failures remain 422', async () => {
  deps.allowMutation.mockResolvedValue(false); const req = request(), read = vi.spyOn(req.body!, 'getReader');
  expect((await POST(req)).status).toBe(429); expect(read).not.toHaveBeenCalled(); expect(deps.interest.create).not.toHaveBeenCalled();
  deps.allowMutation.mockResolvedValue(true);
  deps.interest.create.mockRejectedValue(new UploadError('invalid', 'Проверьте контакт и источник интереса', 422));
  expect((await POST(request())).status).toBe(422);
});
