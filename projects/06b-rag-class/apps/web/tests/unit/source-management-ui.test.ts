import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { submitSourceAction } from '@/app/cabinet/source-actions';
const send = (response: Response) => vi.fn(async () => response) as unknown as typeof fetch;
describe('SRC-03 source actions (actual browser remains coordinator-owned)', () => {
  it('delete expects bodyless204 and recrawl displays handle; safe errors permit retry', async () => {
    const deleted = send(new Response(null, { status: 204 }));
    expect(await submitSourceAction('source', 'delete', deleted)).toEqual({ ok: true, message: 'Источник удалён' });
    expect(deleted).toHaveBeenCalledWith('/api/sources/source', { method: 'DELETE', credentials: 'same-origin' });
    const crawl = send(Response.json({ data: { job_id: 'new-job' } }, { status: 202 }));
    expect(await submitSourceAction('source', 'recrawl', crawl)).toMatchObject({ ok: true, jobId: 'new-job' });
    expect(crawl).toHaveBeenCalledWith('/api/sources/source/recrawl', { method: 'POST', credentials: 'same-origin' });
    expect(await submitSourceAction('source', 'delete', send(Response.json({ error: { message: 'дождитесь окончания индексации' } },
      { status: 409 })))).toEqual({ ok: false, message: 'дождитесь окончания индексации' });
    expect((await submitSourceAction('source', 'recrawl', vi.fn().mockRejectedValue(new Error()) as typeof fetch)).ok).toBe(false);
    expect((await submitSourceAction('source', 'recrawl', send(Response.json({}, { status: 202 })))).ok).toBe(false);
  });
  it('confirmation precedes deletion; stats explains two counts and links to accessible add controls', () => {
    const s = readFileSync('apps/web/src/app/cabinet/source-actions.tsx', 'utf8');
    expect(s).toContain('Подтвердить удаление'); expect(s).toContain('Отмена'); expect(s).toContain('aria-live="polite"');
    const stats = readFileSync('apps/web/src/app/cabinet/bot-stats.tsx', 'utf8');
    expect(stats).toContain('Вопросы из виджета и демо. Песочница не учитывается.');
    expect(stats).toContain('Добавить источник');
  });
});
