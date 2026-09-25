// Ключи квоты (ADR-008, донор N4 keys.ts): какие scope списывает каждый вызов, с какими ключами,
// периодами и пределами. Unit: без БД. Атомарность — tests/quota.concurrency.test.ts.
import { describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { loadCeilings } from '../packages/rag/src/config';
import { moscowDay, moscowMonth } from '../packages/rag/src/period';
import { ceiling, indexEmbedCharges, planTier, previewAnswerCharges, previewCreateCharges, previewEmbedCharges, visitorAnswerCharges } from '../packages/db/src/ceilings';
import { environment } from './fixtures/environment';

const ceilings = loadCeilings(environment());
const now = new Date('2026-09-30T21:30:00Z'); // 00:30 МСК 1 октября: сутки и месяц — по Москве, не по UTC
const visitor = () => ({ visitorSession: randomUUID(), ipPrefix: '203.0.113.0/24', botId: randomUUID(), plan: 'free', now });

describe('Ответ посетителю: ПЯТЬ scope, от узкого к широкому', () => {
  it('visitor → ip → bot_day → bot_month → global; сутки и месяц по Europe/Moscow', () => {
    const input = visitor();
    const charges = visitorAnswerCharges(ceilings, input);
    expect(charges.map((c) => [c.scope, c.scopeKey, c.period, c.n, c.limit])).toEqual([
      ['visitor_answers', input.visitorSession, '2026-10-01', 1, 20],
      ['ip_answers', '203.0.113.0/24', '2026-10-01', 1, 60],
      ['bot_day_answers', input.botId, '2026-10-01', 1, 50],
      ['bot_month_answers', input.botId, '2026-10', 1, 300],
      ['global_answers', 'all', '2026-10-01', 1, 3000],
    ]);
    expect([moscowDay(now), moscowMonth(now)]).toEqual(['2026-10-01', '2026-10']);
  });
  it('план — строгое равенство: nobadge/studio → платные пределы; NOBADGE, « nobadge», null, мусор → free', () => {
    expect(visitorAnswerCharges(ceilings, { ...visitor(), plan: 'studio' }).slice(2, 4).map((c) => c.limit)).toEqual([300, 3000]);
    for (const plan of ['NOBADGE', ' nobadge', 'nobadge ', null, undefined, '', 'paid', ['nobadge'], {}]) {
      expect(planTier(plan), JSON.stringify(plan)).toBe('free');
    }
    expect([planTier('nobadge'), planTier('studio'), planTier('free')]).toEqual(['paid', 'paid', 'free']);
  });
  it('ключи проверяются: полный IP вместо префикса, не-UUID сессии/бота — отказ', () => {
    expect(() => visitorAnswerCharges(ceilings, { ...visitor(), ipPrefix: '203.0.113.7' })).toThrow('префикс IP');
    expect(() => visitorAnswerCharges(ceilings, { ...visitor(), visitorSession: 'x' })).toThrow('сессия посетителя');
    expect(() => visitorAnswerCharges(ceilings, { ...visitor(), botId: 'bot' })).toThrow('бот');
    expect(visitorAnswerCharges(ceilings, { ...visitor(), ipPrefix: '2001:db8:1::/48' })[1]!.scopeKey).toBe('2001:db8:1::/48');
  });
});

describe('Предпросмотр: создание и ответы — РАЗНЫЕ счётчики (A-N6-020, SC-US-002-3)', () => {
  const browserSession = 'b'.repeat(24);
  it('создание списывает :create, ip_previews, previews — и НИ ОДНОГО ответа', () => {
    const charges = previewCreateCharges(ceilings, { browserSession, ipPrefix: '198.51.100.0/24', now });
    expect(charges.map((c) => [c.scope, c.scopeKey, c.limit])).toEqual([
      ['preview_session', `${browserSession}:create`, 1], ['ip_previews', '198.51.100.0/24', 3], ['global_previews', 'previews', 200]]);
    expect(charges.some((c) => c.scopeKey.endsWith(':answers') || c.scopeKey === 'preview_answers')).toBe(false);
  });
  it('ответ списывает :answers и preview_answers', () => {
    expect(previewAnswerCharges(ceilings, { browserSession, now }).map((c) => [c.scope, c.scopeKey, c.limit])).toEqual([
      ['preview_session', `${browserSession}:answers`, 10], ['global_previews', 'preview_answers', 1000]]);
  });
  it('сессия браузера с «:» или короткая — отказ (вид предела в ключе нельзя подделать)', () => {
    expect(() => previewAnswerCharges(ceilings, { browserSession: `${'a'.repeat(20)}:create`, now })).toThrow('сессия браузера');
    expect(() => previewAnswerCharges(ceilings, { browserSession: 'short', now })).toThrow('сессия браузера');
  });
});

describe('Эмбеддинги: токены пачки ДО отправки', () => {
  it('индексация: account_embed_tokens → global_embed_tokens; предпросмотр — только global', () => {
    const accountId = randomUUID();
    expect(indexEmbedCharges(ceilings, { accountId, tokens: 3000, now }).map((c) => [c.scope, c.scopeKey, c.n, c.limit])).toEqual([
      ['account_embed_tokens', accountId, 3000, 2000000], ['global_embed_tokens', 'all', 3000, 20000000]]);
    expect(previewEmbedCharges(ceilings, { tokens: 500, now }).map((c) => [c.scope, c.n])).toEqual([['global_embed_tokens', 500]]);
  });
  it('незагруженный предел — отказ, а не «без ограничений»', () => {
    expect(() => ceiling({}, 'global_answers')).toThrow('не загружен');
    expect(() => ceiling({ global_answers: 0 }, 'global_answers')).toThrow('не загружен');
  });
});
