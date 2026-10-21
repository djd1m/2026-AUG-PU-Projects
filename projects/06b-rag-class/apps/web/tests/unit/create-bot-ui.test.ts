import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { submitCreateBot } from '@/app/cabinet/create-bot';
const reply = (status: number, body: unknown) => vi.fn(async () => Response.json(body, { status })) as unknown as typeof fetch;
describe('SC-US-002-1 cabinet UI fixtures (browser E2E отдельно)', () => {
  it('имя + site_url, same-origin; 202 с job_id даёт сообщение об индексации', async () => {
    const request = reply(202, { data: { bot_id: 'b', public_id: 'p', job_id: 'j' } });
    expect(await submitCreateBot('Бот', 'https://example.test', request)).toEqual({ ok: true, message: 'Бот создан. Индексация сайта выполняется.' });
    expect(request).toHaveBeenCalledWith('/api/bots', expect.objectContaining({ credentials: 'same-origin',
      body: JSON.stringify({ name: 'Бот', site_url: 'https://example.test' }) }));
  });
  it('422, 503 и отсутствующий job_id не показывают успех', async () => {
    expect(await submitCreateBot('Бот', 'http://127.0.0.1', reply(422, { error: { message: 'Адрес запрещён' } })))
      .toEqual({ ok: false, message: 'Адрес запрещён' });
    for (const response of [reply(503, {}), reply(202, { data: {} }), reply(201, {})]) {
      expect((await submitCreateBot('Бот', 'https://example.test', response)).ok).toBe(false);
    }
  });
  it('сеть и HTML вместо JSON дают понятный отказ', async () => {
    const down = vi.fn(async () => { throw new Error('network'); }) as unknown as typeof fetch;
    expect((await submitCreateBot('Бот', 'https://example.test', down)).ok).toBe(false);
    const html = vi.fn(async () => new Response('<html>')) as unknown as typeof fetch;
    expect((await submitCreateBot('Бот', 'https://example.test', html)).ok).toBe(false);
  });
  it('форма: подписи полей, required, выключение при pending, сообщение aria-live', () => {
    const code = readFileSync('apps/web/src/app/cabinet/create-bot.tsx', 'utf8');
    expect(code).toContain('<label>Имя бота'); expect(code).toContain('<label>Адрес сайта');
    expect(code).toContain('disabled={pending}'); expect(code).toContain('aria-live="polite"');
    expect(code).toContain('if (pending) return');
  });
});
