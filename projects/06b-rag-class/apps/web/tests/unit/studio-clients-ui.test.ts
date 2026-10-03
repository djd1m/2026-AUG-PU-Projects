import { describe, expect, it, vi } from 'vitest';
import { submitStudioClient } from '@/app/cabinet/studio-clients';
import { submitCreateBot } from '@/app/cabinet/create-bot';

const reply = (status: number, body: unknown) => vi.fn(async () => Response.json(body, { status })) as unknown as typeof fetch;
describe('STU-03 selected account UI requests (actual browser gate pending)', () => {
  it('creation sends only same-origin session and handles cap without showing success', async () => {
    const fetcher = reply(201, { data: { account_id: 'child' } });
    expect(await submitStudioClient(fetcher)).toEqual({ accountId: 'child', message: 'Клиент создан.' });
    expect(fetcher).toHaveBeenCalledWith('/api/studio/clients', { method: 'POST', credentials: 'same-origin' });
    expect(await submitStudioClient(reply(409, { error: { message: 'предел 5 клиентов в MVP' } })))
      .toEqual({ message: 'предел 5 клиентов в MVP' });
    expect((await submitStudioClient(reply(201, { data: {} }))).accountId).toBeUndefined();
  });
  it('selected target is a selector in bot creation; PDF-only creation succeeds without a site', async () => {
    const fetcher = reply(201, { data: { bot_id: 'bot' } });
    expect(await submitCreateBot('PDF бот', '', fetcher, 'child')).toEqual({ ok: true,
      message: 'Бот создан. Добавьте PDF или адрес сайта.' });
    expect(fetcher).toHaveBeenCalledWith('/api/bots', expect.objectContaining({
      body: JSON.stringify({ name: 'PDF бот', account_id: 'child' }), credentials: 'same-origin' }));
  });
});
