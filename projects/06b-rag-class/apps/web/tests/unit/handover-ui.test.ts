import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { submitIssueHandover } from '@/app/cabinet/studio-clients';
import { submitHandover } from '@/app/handover/[token]/handover-form';
const reply = (status: number, body: unknown) => vi.fn(async () => Response.json(body, { status })) as unknown as typeof fetch;
describe('HAN-01/02 accessible handover form requests (runtime UI pending)', () => {
  it('SC-US-014-1 issue is bodyless and failure never shows link', async () => {
    const f = reply(201, { data: { link: 'https://site/handover/token', expires_at: '2030-01-01' } });
    expect(await submitIssueHandover('child', f)).toEqual({ link: 'https://site/handover/token', expiresAt: '2030-01-01', message: 'Ссылка создана.' });
    expect(f).toHaveBeenCalledWith('/api/studio/clients/child/handover', { method: 'POST', credentials: 'same-origin' });
    expect((await submitIssueHandover('child', reply(403, { error: { message: 'Запрещено' } }))).link).toBeUndefined();
  });
  it('SC-US-014-2 both access branches submitted as boolean; errors retry without success', async () => {
    for (const keep of [false, true]) {
      const f = reply(200, { data: { ok: true } });
      expect((await submitHandover('token', 'client@site.test', 'password-long', keep, f)).ok).toBe(true);
      expect(f).toHaveBeenCalledWith('/api/handover/token', expect.objectContaining({ body: JSON.stringify({
        email: 'client@site.test', password: 'password-long', keep_studio_access: keep }) }));
    }
    for (const status of [404, 409, 410, 503]) expect(await submitHandover('token', 'x', 'p', false,
      reply(status, { error: { message: 'Ошибка' } }))).toEqual({ ok: false, message: 'Ошибка' });
  });
  it('HAN-02 checkbox defaults unchecked, labelled fields and live status; no external assets', () => {
    const s = readFileSync('apps/web/src/app/handover/[token]/handover-form.tsx', 'utf8');
    expect(s).toContain('type="checkbox" name="keep_studio_access"'); expect(s).not.toMatch(/defaultChecked|checked=\{true\}/);
    expect(s).toContain('htmlFor="handover-email"'); expect(s).toContain('htmlFor="handover-password"');
    expect(s).toContain('aria-live="polite"');
    const page = readFileSync('apps/web/src/app/handover/[token]/page.tsx', 'utf8');
    expect(page).toContain("dynamic = 'force-dynamic'"); expect(page).toContain('index: false, follow: false');
  });
});
