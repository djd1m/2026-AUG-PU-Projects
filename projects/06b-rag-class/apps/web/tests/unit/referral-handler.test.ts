import { beforeEach, describe, expect, it, vi } from 'vitest';
import { recordBadgeRemovalIntent, recordReferralClick, type Pool } from '@n6b/db';
import { AuthService, type AuthStore } from '@/server/auth';
import { createAuthHandler } from '@/server/auth-handler';
import { createBadgeRemovalHandler, createReferralClickHandler } from '@/server/referral-handler';
import { submitBadgeRemoval } from '@/app/cabinet/badge-removal';

vi.mock('@n6b/db', async (original) => ({ ...await original<object>(), recordReferralClick: vi.fn(),
  recordBadgeRemovalIntent: vi.fn() }));
const BASE = 'https://site.test';
const REF = 'Abcdef_12345';
const at = new Date('2041-01-01T21:00:00Z');
const deps = { servicePool: {} as Pool, publicBaseUrl: BASE, visitorSecret: 'secret', now: () => at, log: vi.fn() };
beforeEach(() => vi.resetAllMocks());

describe('REF-01: public click HTTP boundary', () => {
  it('fixed local 302, trusted last-hop IP; account/day/visitor/next supplied by client are ignored', async () => {
    vi.mocked(recordReferralClick).mockResolvedValue(true);
    const response = await createReferralClickHandler(deps)(new Request(`${BASE}/?next=https://evil&day=2000&account=x`,
      { headers: { 'x-forwarded-for': '192.0.2.1, 203.0.113.99' } }), REF);
    expect(recordReferralClick).toHaveBeenCalledWith(deps.servicePool, REF, 'secret', '203.0.113.99', at);
    expect(response.status).toBe(302);
    expect(response.headers.get('location')).toBe(`${BASE}/?ref=${REF}&utm_source=badge`);
    expect(response.headers.get('cache-control')).toBe('no-store');
  });
  it('unknown/invalid IDs redirect without ref; invalid IDs never query the DB', async () => {
    vi.mocked(recordReferralClick).mockResolvedValue(false);
    for (const id of [REF, 'bad', '//evil.test']) {
      const response = await createReferralClickHandler(deps)(new Request(BASE), id);
      expect(response.status).toBe(302);
      expect(response.headers.get('location')).toBe(`${BASE}/`);
    }
    expect(recordReferralClick).toHaveBeenCalledTimes(1);
  });
  it('no trusted IP permits a known-bot redirect without fabricating an IP; DB failures return 503', async () => {
    vi.mocked(recordReferralClick).mockResolvedValue(true);
    expect((await createReferralClickHandler(deps)(new Request(BASE), REF)).status).toBe(302);
    expect(recordReferralClick).toHaveBeenCalledWith(deps.servicePool, REF, 'secret', null, at);
    vi.mocked(recordReferralClick).mockRejectedValue(new Error('private database details'));
    const response = await createReferralClickHandler(deps)(new Request(BASE), REF);
    expect(response.status).toBe(503);
    expect(JSON.stringify(await response.json())).not.toContain('private database');
  });
});

describe('REF-03: referral from cookie only, behind existing auth guards', () => {
  it('register forwards only cookie; login never changes referral; forged body cannot select an account or family', async () => {
    const store = { register: vi.fn(async () => true), findAccount: vi.fn(async () => null),
      createSession: vi.fn(), deleteSession: vi.fn(), findSession: vi.fn() } as unknown as AuthStore;
    const auth = new AuthService(store, { hash: async () => 'hash', compare: async () => false }, 'session-secret');
    const settings = { auth, publicBaseUrl: BASE, visitorSecret: 'secret', authLimitPerHour: 10, production: true,
      reserve: vi.fn(async () => ({ ok: true as const })) };
    const request = (cookie?: string) => new Request(BASE, { method: 'POST', headers: { origin: BASE,
      'x-forwarded-for': '203.0.113.1', 'content-type': 'application/json', ...(cookie ? { cookie } : {}) },
      body: JSON.stringify({ email: 'a@example.test', password: 'correct horse 1', ref: 'Forged_12345',
        referred_by_bot_id: 'forged', actingStudioId: 'forged' }) });
    expect((await createAuthHandler('register', settings)(request(`n6b_ref=${REF}`))).status).toBe(201);
    expect(store.register).toHaveBeenLastCalledWith('a@example.test', 'hash', 'owner', expect.any(Object), REF);
    expect((await createAuthHandler('register', settings)(request())).status).toBe(201);
    expect(store.register).toHaveBeenLastCalledWith('a@example.test', 'hash', 'owner', expect.any(Object), null);
    await createAuthHandler('login', settings)(request(`n6b_ref=${REF}`));
    expect(store.register).toHaveBeenCalledTimes(2);
  });
});

describe('REF-05 SC-US-010-1: authenticated same-origin intent', () => {
  const token = 'a'.repeat(43);
  const request = (origin: string | null = BASE, cookie = `n6b_session=${token}`) => new Request(BASE,
    { method: 'POST', headers: { ...(origin ? { origin } : {}), cookie, 'content-type': 'application/json' },
      body: JSON.stringify({ account_id: 'forged', plan: 'start', badge_removal: 'active', day: '2000-01-01' }) });
  it('origin and session guards run before recording; account comes from authentication only', async () => {
    const authenticate = vi.fn(async () => 'trusted-account');
    const handler = createBadgeRemovalHandler({ ...deps, authenticate });
    for (const origin of [null, 'https://evil.test']) expect((await handler(request(origin))).status).toBe(403);
    expect(authenticate).not.toHaveBeenCalled();
    expect((await handler(request(BASE, ''))).status).toBe(401);
    expect(recordBadgeRemovalIntent).not.toHaveBeenCalled();
    vi.mocked(recordBadgeRemovalIntent).mockResolvedValue(false);
    const response = await handler(request());
    expect(recordBadgeRemovalIntent).toHaveBeenCalledWith(deps.servicePool, 'trusted-account', at);
    expect(await response.json()).toEqual({ data: { recorded: false, message: 'Скоро: ~990 ₽/мес, оставьте заявку' } });
    expect(response.headers.get('cache-control')).toBe('no-store');
  });
  it('expired sessions and vanished accounts return 401; storage failure returns 503', async () => {
    const authenticate = vi.fn(async (): Promise<string | null> => null);
    const handler = createBadgeRemovalHandler({ ...deps, authenticate });
    expect((await handler(request())).status).toBe(401);
    authenticate.mockResolvedValue('trusted-account');
    vi.mocked(recordBadgeRemovalIntent).mockResolvedValue(null);
    expect((await handler(request())).status).toBe(401);
    vi.mocked(recordBadgeRemovalIntent).mockRejectedValue(new Error('private'));
    expect((await handler(request())).status).toBe(503);
  });
  it('cabinet sends same-origin POST and reports failed submissions honestly', async () => {
    const fetcher = vi.fn(async () => Response.json({ data: { recorded: true } })) as unknown as typeof fetch;
    expect(await submitBadgeRemoval(fetcher)).toBe(true);
    expect(fetcher).toHaveBeenCalledWith('/api/account/badge-removal-intent', { method: 'POST', credentials: 'same-origin' });
    expect(await submitBadgeRemoval(vi.fn(async () => new Response(null, { status: 503 })))).toBe(false);
    expect(await submitBadgeRemoval(vi.fn(async () => { throw new Error('offline'); }))).toBe(false);
  });
});
