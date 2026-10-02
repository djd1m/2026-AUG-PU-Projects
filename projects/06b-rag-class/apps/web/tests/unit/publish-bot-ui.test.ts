import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { submitPublication } from '@/app/cabinet/publish-bot';

const data = { id: 'bot', public_id: 'immutable_12', published: true, contact: 'owner@example.test',
  allowed_origins: [], demo_enabled: false, embed_code: '<script src="https://cabinet.test/w.js" data-bot="immutable_12" async></script>' };
const reply = (status: number, body: unknown) => vi.fn(async () => Response.json(body, { status })) as unknown as typeof fetch;

describe('PUB-06/07 cabinet publication client (actual browser gate pending)', () => {
  it('PATCH same-origin confirms explicit domains; blank list is submitted as empty', async () => {
    const request = reply(200, { data });
    expect(await submitPublication('bot', data.contact, '', request)).toEqual({ ok: true, data });
    expect(request).toHaveBeenCalledWith('/api/bots/bot/publish', expect.objectContaining({ method: 'PATCH',
      credentials: 'same-origin', body: JSON.stringify({ contact: data.contact, allowed_origins: [] }) }));
    await submitPublication('bot', data.contact, ' https://one.test/path\r\n\nhttp://two.test:8080 ', request);
    expect(request).toHaveBeenLastCalledWith('/api/bots/bot/publish', expect.objectContaining({
      body: JSON.stringify({ contact: data.contact, allowed_origins: ['https://one.test/path', 'http://two.test:8080'] }) }));
  });
  it('invalid/error/malformed/network responses do not report saved publication', async () => {
    expect(await submitPublication('bot', '', '', reply(422, { error: { message: 'Укажите контакт' } }))).toEqual({ ok: false, message: 'Укажите контакт' });
    for (const request of [reply(503, {}), reply(200, { data: { ...data, published: false } }),
      reply(200, { data: { ...data, contact: '' } }), reply(200, { data: { ...data, embed_code: null } }),
      reply(200, { data: { ...data, allowed_origins: null } }),
      vi.fn(async () => new Response('<html>')) as unknown as typeof fetch,
      vi.fn(async () => { throw new Error('network'); }) as unknown as typeof fetch]) {
      expect((await submitPublication('bot', data.contact, '', request)).ok).toBe(false);
    }
  });
  it('labels, pending/recovery and text-only code; sandbox links to the real publication form', () => {
    const ui = readFileSync('apps/web/src/app/cabinet/publish-bot.tsx', 'utf8');
    expect(ui).toContain('htmlFor={`contact-${initial.id}`}'); expect(ui).toContain('htmlFor={`origins-${initial.id}`}');
    expect(ui).toContain('disabled={pending}'); expect(ui).toContain('if (pending) return');
    expect(ui).toContain('aria-live="polite"'); expect(ui).toContain('role="alert"');
    expect(ui).toContain('value={embedCode} readOnly'); expect(ui).not.toContain('dangerouslySetInnerHTML');
    expect(ui).toContain('setEmbedCode(null)'); expect(ui).toContain('Добавьте домен');
    const sandbox = readFileSync('apps/web/src/app/cabinet/sandbox.tsx', 'utf8');
    expect(sandbox).toContain('href={`#publish-${botId}`}');
    expect(sandbox).toContain('<button type="button" disabled>Поделиться демо-страницей</button>');
  });
});
