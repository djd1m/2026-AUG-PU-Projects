import { NextRequest } from 'next/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { firstTouchReferral, readReferralCookie, REFERRAL_TTL_SECONDS } from '@/lib/referral-cookie';
import { middleware, config } from '@/middleware';

const REF = 'Abcdef_12345';
afterEach(() => vi.unstubAllEnvs());

describe('REF-02 SC-US-011-1: first touch on the actual landing response', () => {
  it('valid first touch sets 30-day HttpOnly Secure Lax cookie and prevents public caching', () => {
    vi.stubEnv('NODE_ENV', 'production');
    const response = middleware(new NextRequest(`https://site.test/?ref=${REF}`));
    expect(response.cookies.get('n6b_ref')).toMatchObject({ value: REF, httpOnly: true, secure: true,
      sameSite: 'lax', path: '/', maxAge: 2592000 });
    expect(REFERRAL_TTL_SECONDS).toBe(2592000);
    expect(response.headers.get('set-cookie')).toContain('HttpOnly');
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(config.matcher).toEqual(['/']);
  });
  it('fixed first-touch guard: repeated landing never overwrites or renews a cookie', () => {
    const response = middleware(new NextRequest(`https://site.test/?ref=${REF}`, {
      headers: { cookie: 'n6b_ref=Another_1234' },
    }));
    expect(firstTouchReferral(REF, 'Another_1234')).toBeNull();
    expect(response.headers.get('set-cookie')).toBeNull();
    expect(firstTouchReferral(REF, '')).toBeNull();
    expect(firstTouchReferral(REF, 'invalid-existing')).toBeNull();
  });
  it.each([null, '', 'short', 'Abcdef_12345x', '../evil.test', 'https://evil', 'Abcdef_1234!'])
    ('invalid ref %s never sets a cookie', (ref) => {
      expect(firstTouchReferral(ref, undefined)).toBeNull();
      const response = middleware(new NextRequest(`https://site.test/?ref=${encodeURIComponent(ref ?? '')}`));
      expect(response.headers.get('set-cookie')).toBeNull();
    });
  it('development omits Secure; cookie reader ignores body/query and rejects encoded garbage', () => {
    vi.stubEnv('NODE_ENV', 'development');
    expect(middleware(new NextRequest(`http://site.test/?ref=${REF}`)).cookies.get('n6b_ref')?.secure).toBe(false);
    expect(readReferralCookie(new Request(`https://site.test/?ref=${REF}`))).toBeNull();
    expect(readReferralCookie(new Request('https://site.test', { headers: { cookie: `other=x; n6b_ref=${REF}` } }))).toBe(REF);
    expect(readReferralCookie(new Request('https://site.test', { headers: { cookie: 'n6b_ref=%2Fevil' } }))).toBeNull();
  });
});
