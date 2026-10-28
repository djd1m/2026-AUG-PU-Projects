import { beforeEach, expect, it, vi } from 'vitest';
import { createPartnerLandingHandler } from '../apps/web/src/server/partner-landing';
import { readReferral, referralCookie } from '../apps/web/src/lib/partner-referral';
import { UploadError } from '../apps/web/src/server/upload-contract';
const secret = 'referral-test-secret';
const link = { id: 'code-id', code: 'BLOGGER1', account_id: 'owner' };
const deps = { links: { find: vi.fn(), recordView: vi.fn() }, auth: { authenticate: vi.fn() },
  trustedProxyHops: 1, referralSecret: secret, allowRead: vi.fn() };
const handler = createPartnerLandingHandler(deps);
const request = (cookie = '') => new Request('https://app.example/r/BLOGGER1?next=https://evil.test', {
  headers: { 'x-forwarded-for': '192.0.2.10, 127.0.0.1', cookie } });
beforeEach(() => { vi.resetAllMocks(); deps.links.find.mockResolvedValue(link); deps.allowRead.mockResolvedValue(true); });
it('fixed redirect, trusted prefix, signed first touch and no store', async () => {
  const response = await handler(request(), link.code);
  expect(response.status).toBe(302); expect(response.headers.get('location')).toBe('/');
  expect(response.headers.get('cache-control')).toBe('no-store');
  expect(readReferral(response.headers.get('set-cookie')!, secret)).toEqual({ code: link.code, source: 'cookie' });
  expect(deps.links.recordView).toHaveBeenCalledWith(link, null, '192.0.2.0/24');
});
it('self cannot receive cookie, and guest first touch stays intact', async () => {
  deps.auth.authenticate.mockResolvedValue({ account_id: 'owner' });
  expect((await handler(request('__Host-n5_session=' + 'x'.repeat(43)), link.code)).headers.get('set-cookie')).toBeNull();
  const guest = referralCookie('', 'GUEST123', 'guest_link', false, secret)!;
  expect((await handler(request(guest), link.code)).headers.get('set-cookie')).toBeNull();
});
it('unknown and blocked codes share 404 without recording or cookie', async () => {
  deps.links.find.mockRejectedValue(new UploadError('not_found', 'hidden', 404));
  const response = await handler(request(), 'UNKNOWN');
  expect(response.status).toBe(404); expect(response.headers.get('set-cookie')).toBeNull();
  expect(deps.links.recordView).not.toHaveBeenCalled();
});
it('rate refusal precedes lookup and recording; service error fails closed', async () => {
  deps.allowRead.mockResolvedValue(false);
  expect((await handler(request(), link.code)).status).toBe(429); expect(deps.links.find).not.toHaveBeenCalled();
  deps.allowRead.mockResolvedValue(true); deps.links.recordView.mockRejectedValue(new Error('offline'));
  const response = await handler(request(), link.code);
  expect(response.status).toBe(503); expect(response.headers.get('set-cookie')).toBeNull();
});
