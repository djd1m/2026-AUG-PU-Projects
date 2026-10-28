import { describe, it, expect, vi, afterEach } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { takeFragmentToken, validPassword, supportRequest, SupportError } from '../apps/web/src/lib/support-client';
import { RecoveryForm } from '../apps/web/src/app/support/RecoveryForm';
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
afterEach(() => vi.unstubAllGlobals());
describe('support recovery boundaries', () => {
  it('removes fragment synchronously before returning token and ignores query tokens', () => {
    const replaceState = vi.fn();
    const token = 'A'.repeat(43);
    expect(takeFragmentToken({ hash: '#token=' + token, pathname: '/reset', search: '' }, { replaceState })).toBe(token);
    expect(replaceState).toHaveBeenCalledWith(null, '', '/reset');
    expect(takeFragmentToken({ hash: '', pathname: '/reset', search: '?token=' + token }, { replaceState })).toBe('');
    for (const bad of ['A'.repeat(42), 'A'.repeat(44), '<script>', '%']) expect(takeFragmentToken({ hash: '#token=' + bad, pathname: '/reset', search: '' }, { replaceState })).toBe('');
  });
  it('enforces literal 8-character and 72 UTF-8 byte boundaries', () => {
    expect(validPassword('a'.repeat(7))).toBe(false); expect(validPassword('a'.repeat(8))).toBe(true);
    expect(validPassword('a'.repeat(72))).toBe(true); expect(validPassword('a'.repeat(73))).toBe(false);
    expect(validPassword('я'.repeat(36))).toBe(true); expect(validPassword('я'.repeat(37))).toBe(false);
    expect(validPassword('🔒'.repeat(18))).toBe(true); expect(validPassword('🔒'.repeat(19))).toBe(false);
  });
  it('renders labelled recovery forms, honest disabled mail and no GET consumption', () => {
    for (const mode of ['verify', 'forgot', 'reset'] as const) {
      const html = renderToStaticMarkup(createElement(RecoveryForm, { mode, mailAvailable: false }));
      expect(html).toContain('disabled'); expect(html).not.toContain('token=');
      expect(html).toContain('Войти');
      if (mode === 'forgot') { expect(html).toContain('type="email"'); expect(html).toContain('Отправка писем сейчас недоступна'); }
      if (mode === 'reset') { expect(html).toContain('name="repeat"'); expect(html).toContain('72 байт'); expect(html).toContain('не подтверждает почту'); }
      if (mode === 'verify') expect(html).toContain('затем снова откройте ссылку');
    }
  });
  it('sends POST bodies with cookie authority and returns new structured errors', async () => {
    const fetch = vi.fn().mockResolvedValue({ ok: false, status: 401, json: async () => ({ error: { code: 'unauthorized', message: 'safe' } }) });
    vi.stubGlobal('fetch', fetch);
    await expect(supportRequest('/api/auth/email/confirm', { token: 'A'.repeat(43) })).rejects.toMatchObject({ status: 401, code: 'unauthorized' });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch.mock.calls[0]![1]).toMatchObject({ method: 'POST', credentials: 'same-origin', cache: 'no-store', body: JSON.stringify({ token: 'A'.repeat(43) }) });
  });
  it('sanitizes network errors without echoing URLs or tokens', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('https://private/#token=secret')));
    try { await supportRequest('/api/auth/reset', {}); } catch (error) { expect(error).toBeInstanceOf(SupportError); expect(String(error)).not.toContain('secret'); }
  });
});
