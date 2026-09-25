import { expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import type { Pool } from 'pg';
import { loadLimits } from '../packages/shared/src/config';
import { environment } from './fixtures/environment';
import { quotaMessages } from '../apps/web/src/lib/limits-contract';
import { quotaError } from '../apps/web/src/server/upload-contract';
import { failureMessages } from '../apps/web/src/lib/screen-contract';
import { remainingLimits } from '../apps/web/src/server/limits';
import { InterestService } from '../apps/web/src/server/interest';
import { LimitsPanel } from '../apps/web/src/app/dashboard/LimitsPanel';
import { ProInterest } from '../apps/web/src/app/dashboard/ProInterest';
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
const now = new Date('2026-09-23T20:59:59Z');
const limits = loadLimits(environment());

it('personal refusal names the exhausted key and the actual Moscow reset', () => {
  for (const [scope, text] of [['user_uploads', 'Загрузки'], ['user_minutes', 'Минуты'], ['user_llm', 'Обработки']] as const) {
    const error = quotaError(scope, now);
    expect(error.message).toContain(text + ' на сегодня исчерпаны');
    expect(error.message).toContain('24.09.2026, 00:00 МСК');
    expect(error.details).toEqual({ scope, resets_at: '2026-09-23T21:00:00.000Z' });
    expect(failureMessages[`refused_${scope}`]).toBe(quotaMessages[scope]);
  }
});
it('refunds have no sixth text and use the upload refusal', () => {
  expect(Object.keys(quotaMessages).sort()).toEqual(['global_llm', 'global_minutes', 'user_llm', 'user_minutes', 'user_rerenders', 'user_uploads']);
  expect(quotaError('user_upload_refunds', now)).toEqual(quotaError('user_uploads', now));
  expect(quotaError('user_upload_refunds', now).details.scope).toBe('user_uploads');
});
it('global refusal hides named global ceilings on both request and progress surfaces', () => {
  for (const scope of ['global_minutes', 'global_llm'] as const) {
    expect(quotaError(scope, now).message).toBe('Сервис перегружен, попробуйте позже. Лимиты обновятся 24.09.2026, 00:00 МСК');
    expect(failureMessages[`refused_${scope}`]).toBe('Сервис перегружен, попробуйте позже');
    expect(quotaError(scope, now).details.scope).toBe(scope); // machine contract retained
  }
});
it('remaining values use configured limits, never used counts, and clamp to zero', async () => {
  const query = vi.fn().mockResolvedValue({ rows: [{ scope: 'user_uploads', used: 1 }, { scope: 'user_minutes', used: 12 }, { scope: 'user_llm', used: 3 }] });
  const remaining = await remainingLimits({ query } as unknown as Pool, limits, 'session-owner', now);
  expect(remaining).toEqual({ uploads: 1, minutes: 78, selections: 0, resets_at: '2026-09-23T21:00:00.000Z' });
  expect(query.mock.calls[0]?.[1]).toEqual(['session-owner', '2026-09-23']);
  const html = renderToStaticMarkup(createElement(LimitsPanel, { remaining }));
  expect(html).toContain('Осталось на сегодня'); expect(html).toContain('78');
  expect(html).not.toMatch(/global_|user_upload_refunds|600|возвратов/);
});
it('absent counters start full; midnight changes both query day and reset; storage errors are not full quota', async () => {
  const query = vi.fn().mockResolvedValue({ rows: [] });
  expect(await remainingLimits({ query } as unknown as Pool, { ...limits, N5_LIMIT_USER_MINUTES: 42 }, 'a', new Date('2026-09-23T21:00:00Z')))
    .toEqual({ uploads: 2, minutes: 42, selections: 2, resets_at: '2026-09-24T21:00:00.000Z' });
  expect(query.mock.calls[0]?.[1]).toEqual(['a', '2026-09-24']);
  query.mockRejectedValue(new Error('offline'));
  await expect(remainingLimits({ query } as unknown as Pool, limits, 'a', now)).rejects.toThrow('offline');
});
it('interest UI offers no deadline, paid launch promise or payment form', () => {
  const html = renderToStaticMarkup(createElement(ProInterest, { source: 'clip_card' }));
  expect(html).toContain('Сейчас доступен только бесплатный тариф'); expect(html).toContain('Нужен тариф побольше');
  expect(html).not.toMatch(/скоро|запустим|откроется|через\s+\d|\d{1,2}[./]\d{1,2}|<form|<input|оплат|checkout|payment/i);
  const guest = readFileSync('apps/web/src/server/guest-page.ts', 'utf8');
  expect(guest).toContain("source_screen:'guest_page'");
  expect(guest).toContain('Сейчас доступен только бесплатный тариф');
  expect(guest).not.toMatch(/скоро|запустим|откроется|оплат|checkout|payment/i);
});
it('ADR-005 production route registry contains no payment or webhook handler', () => {
  function routes(dir: string): string[] {
    return readdirSync(dir, { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? routes(join(dir, entry.name))
      : /^(route|page)\.(ts|tsx|js|jsx)$/.test(entry.name) ? [join(dir, entry.name)] : []);
  }
  expect(routes('apps/web/src/app').filter(path => /yookassa|webhooks|payments|checkout|billing/i.test(path))).toEqual([]);
  const config = readFileSync('apps/web/next.config.ts', 'utf8');
  expect(config).not.toMatch(/yookassa|webhooks|checkout/i);
});
it('invalid interest input is rejected before a database connection', async () => {
  const connect = vi.fn(); const service = new InterestService({ connect } as unknown as Pool);
  for (const input of [{ source_screen: 'other' }, { source_screen: 'clip_card', account_id: 'foreign' },
    { source_screen: 'guest_page', contact: 'not-an-email' }, { source_screen: 'clip_card', contact: 'a'.repeat(255) + '@example.test' }]) {
    await expect(service.create('owner', input)).rejects.toMatchObject({ status: 422 });
  }
  expect(connect).not.toHaveBeenCalled();
});
it('interest atomically records existing event and rolls back if event storage fails', async () => {
  const query = vi.fn(async (sql: string) => {
    if (sql.startsWith('SELECT email')) return { rows: [{ email: 'owner@example.test' }] };
    if (sql.includes('growth_event')) throw new Error('event failed');
    return { rows: [] };
  });
  const release = vi.fn(), connect = vi.fn(async () => ({ query, release }));
  await expect(new InterestService({ connect } as unknown as Pool, () => now).create('owner', { source_screen: 'clip_card' })).rejects.toThrow('event failed');
  const calls = query.mock.calls.map(c => c[0]);
  expect(calls).toContain('ROLLBACK'); expect(calls).not.toContain('COMMIT'); expect(release).toHaveBeenCalledOnce();
});
