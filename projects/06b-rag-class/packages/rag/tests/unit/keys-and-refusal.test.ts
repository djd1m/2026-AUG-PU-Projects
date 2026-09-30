import { describe, expect, it } from 'vitest';
import {
  answerKeys, ConfigError, embedKeys, isKnownScope, keySetViolation, type Limits, LIMIT_VARIABLES, limitsFrom, moscowDay,
  moscowHour, type QuotaKey, sandboxKeys, visitorKey,
} from '@n6b/db';
import { quotaRefusal, secondsToMoscowMidnight, visitorLimitText } from '../../src/refusal';
import { providerRefusal } from '../../src/refusal';
import { ProviderUnavailableError } from '../../src/provider/port';

const OWNER: Limits = { answerVisitorDay: 30, answerBotDay: 300, answerGlobalDay: 3000, sandboxAccountDay: 100,
  sandboxGlobalDay: 2000, embedTokensAccountDay: 2_000_000, embedTokensGlobalDay: 20_000_000 };
const VALUES = Object.fromEntries(Object.entries(LIMIT_VARIABLES).map(([f, n]) => [n, OWNER[f as keyof Limits]]));
const BOT = '6f1c2d3e-4a5b-4c6d-8e7f-001122334455';
const ACC = 'a1b2c3d4-e5f6-4a7b-8c9d-aabbccddeeff';
const SECRET = 'v'.repeat(48);

describe('пределы из конфигурации (T-1, SC-US-016-2)', () => {
  it('числа владельца (OWN-06B-004, OWN-06B-008) читаются все семь', () => {
    expect(limitsFrom(VALUES)).toEqual(OWNER);
  });

  it.each(Object.values(LIMIT_VARIABLES))('%s: отсутствует, 0, дробное, строка → ConfigError с именем', (name) => {
    for (const bad of [undefined, 0, -1, 1.5, '30', Number.NaN, 2 ** 31]) {
      const values = { ...VALUES, [name]: bad } as Record<string, number>;
      if (bad === undefined) delete values[name];
      let error: unknown;
      try { limitsFrom(values); } catch (e) { error = e; }
      expect(error, `${name}=${String(bad)}`).toBeInstanceOf(ConfigError);
      expect((error as ConfigError).variable).toBe(name);
    }
  });

  it('персональный > общего → отказ (каждая пара)', () => {
    for (const [p, t] of [['LIMIT_ANSWER_VISITOR_DAY', 'LIMIT_ANSWER_BOT_DAY'], ['LIMIT_ANSWER_BOT_DAY',
      'LIMIT_ANSWER_GLOBAL_DAY'], ['LIMIT_SANDBOX_ACCOUNT_DAY', 'LIMIT_SANDBOX_GLOBAL_DAY'],
    ['LIMIT_EMBED_TOKENS_ACCOUNT_DAY', 'LIMIT_EMBED_TOKENS_GLOBAL_DAY']] as const) {
      expect(() => limitsFrom({ ...VALUES, [p]: (VALUES[t] as number) + 1 }), p).toThrow(ConfigError);
    }
  });
});

describe('ключи попытки: фиксированный порядок «частный → общий», каждая переменная берётся (S-11)', () => {
  it('ответ посетителю: visitor → bot → global с числами 30/300/3000', () => {
    const vkey = visitorKey(SECRET, '203.0.113.7', BOT);
    expect(answerKeys(OWNER, vkey, BOT)).toEqual([
      { scope: `answer:visitor:${vkey}`, limit: 30 }, { scope: `answer:bot:${BOT}`, limit: 300 },
      { scope: 'answer:global', limit: 3000 }]);
  });

  it('песочница: аккаунт → все аккаунты (оба ключа, 100 и 2000; SC-US-016-4)', () => {
    expect(sandboxKeys(OWNER, ACC)).toEqual([{ scope: `answer:sandbox:${ACC}`, limit: 100 },
      { scope: 'answer:sandbox:global', limit: 2000 }]);
  });

  it('эмбеддинги: n = токены на оба ключа; непригодная оценка — отказ', () => {
    expect(embedKeys(OWNER, ACC, 300)).toEqual([{ scope: `embed:account:${ACC}`, limit: 2_000_000, n: 300 },
      { scope: 'embed:global', limit: 20_000_000, n: 300 }]);
    for (const bad of [0, -5, 1.5, Number.NaN]) expect(() => embedKeys(OWNER, ACC, bad)).toThrow(/токенов/);
  });

  it('непригодные идентификаторы → исключение, а не ключ «на всех»', () => {
    expect(() => answerKeys(OWNER, 'nope', BOT)).toThrow();
    expect(() => answerKeys(OWNER, visitorKey(SECRET, '1.1.1.1', BOT), '')).toThrow();
    expect(() => sandboxKeys(OWNER, 'x')).toThrow();
  });

  it('каждый построенный ключ — из закрытого списка форм (сброс оператором его примет)', () => {
    const all = [...answerKeys(OWNER, visitorKey(SECRET, '::1', BOT), BOT), ...sandboxKeys(OWNER, ACC),
      ...embedKeys(OWNER, ACC, 1)];
    for (const k of all) expect(isKnownScope(k.scope), k.scope).toBe(true);
    for (const bad of ['answer:%', 'answer:*', 'answer:visitor:', '', 'embed:global ', 'auth:addr:x:2026-09-30T14']) {
      expect(isKnownScope(bad), bad).toBe(false);
    }
  });
});

describe('обязательный набор ключей по виду вызова (08_review.md F-1, keySetViolation)', () => {
  const vkey = visitorKey(SECRET, '203.0.113.7', BOT);
  const visitorSet = answerKeys(OWNER, vkey, BOT);
  const sandboxSet = sandboxKeys(OWNER, ACC);
  const embedSet = embedKeys(OWNER, ACC, 300);

  it('наборы, которые строят answerKeys/sandboxKeys/embedKeys, пригодны', () => {
    expect(keySetViolation('embed_question', visitorSet, OWNER)).toBeNull();
    expect(keySetViolation('embed_question', sandboxSet, OWNER)).toBeNull();
    expect(keySetViolation('embed_index', embedSet, OWNER)).toBeNull();
  });

  it.each<[string, 'embed_question' | 'embed_index', readonly QuotaKey[]]>([
    ['произвольный ключ с огромным пределом', 'embed_question', [{ scope: 'x', limit: 1e9 }]],
    ['пропущен answer:global', 'embed_question', visitorSet.slice(0, 2)],
    ['пропущен answer:sandbox:global', 'embed_question', sandboxSet.slice(0, 1)],
    ['пропущен embed:global', 'embed_index', embedSet.slice(0, 1)],
    ['общий ключ не последним', 'embed_question', [visitorSet[2]!, visitorSet[0]!, visitorSet[1]!]],
    ['общий ключ с подменённым пределом', 'embed_question', [...visitorSet.slice(0, 2), { scope: 'answer:global', limit: 1e9 }]],
    ['личный ключ с подменённым пределом', 'embed_question', [{ ...sandboxSet[0]!, limit: 2000 }, sandboxSet[1]!]],
    ['лишний неизвестный ключ', 'embed_question', [...sandboxSet, { scope: 'test:extra', limit: 5 }]],
    ['ключ входа вместо ответа', 'embed_question', [{ scope: `auth:addr:${'a'.repeat(32)}:2026-09-30T14`, limit: 10 }]],
    ['набор песочницы для батча', 'embed_index', sandboxSet],
    ['набор батча для ответа', 'embed_question', embedSet],
    ['n батча различается', 'embed_index', [embedSet[0]!, { ...embedSet[1]!, n: 1 }]],
    ['n батча отсутствует', 'embed_index', embedSet.map(({ scope, limit }) => ({ scope, limit }))],
    ['попытка ответа резервирует 5', 'embed_question', sandboxSet.map((k) => ({ ...k, n: 5 }))],
    ['пустой набор', 'embed_question', []],
  ])('%s → отказ', (_, kind, keys) => {
    expect(keySetViolation(kind, keys, OWNER)).not.toBeNull();
  });
});

describe('ключ посетителя (N5 #20): /24 + bot_id, IP не хранится', () => {
  it('соседи по /24 делят ключ; другой /24 или другой бот — другой ключ', () => {
    const k = visitorKey(SECRET, '203.0.113.7', BOT);
    expect(visitorKey(SECRET, '203.0.113.200', BOT)).toBe(k);
    expect(visitorKey(SECRET, '203.0.114.7', BOT)).not.toBe(k);
    expect(visitorKey(SECRET, '203.0.113.7', ACC)).not.toBe(k);
    expect(visitorKey(SECRET, '::ffff:203.0.113.9', BOT)).toBe(k);
    expect(k).toMatch(/^[0-9a-f]{32}$/);
    expect(k).not.toContain('203');
  });
  it('F-6 (08_review.md): IPv4-mapped IPv6 в любой записи — ключ того же IPv4 /24, не общий /64 нулей', () => {
    const k = visitorKey(SECRET, '1.2.3.4', BOT);
    for (const mapped of ['::ffff:1.2.3.4', '::ffff:102:304', '::FFFF:0102:0304', '0:0:0:0:0:ffff:102:304',
      '0000:0000:0000:0000:0000:ffff:1.2.3.99']) {
      expect(visitorKey(SECRET, mapped, BOT), mapped).toBe(k);
    }
    // Разные IPv4 в hex-записи — разные ключи (до правки оба падали в 0:0:0:0::/64 и делили предел 30).
    expect(visitorKey(SECRET, '::ffff:102:304', BOT)).not.toBe(visitorKey(SECRET, '::ffff:506:708', BOT));
    // Не-mapped соседи остаются IPv6: ::1 и ::ffff:0:102:304 (другая группа) — не IPv4.
    expect(visitorKey(SECRET, '::1', BOT)).not.toBe(k);
    expect(visitorKey(SECRET, '::ffff:0:102:304', BOT)).not.toBe(k);
  });
  it('IPv6: один /64 — один ключ', () => {
    expect(visitorKey(SECRET, '2001:db8:1:2::1', BOT)).toBe(visitorKey(SECRET, '2001:db8:1:2:ffff::9', BOT));
    expect(visitorKey(SECRET, '2001:db8:1:3::1', BOT)).not.toBe(visitorKey(SECRET, '2001:db8:1:2::1', BOT));
  });
});

describe('сутки и час по Москве (T-2, M-9, M-12)', () => {
  it('20:59:59Z — ещё 30.09 МСК, 21:00:00Z — уже 01.10', () => {
    expect(moscowDay(new Date('2026-09-30T20:59:59Z'))).toBe('2026-09-30');
    expect(moscowDay(new Date('2026-09-30T21:00:00Z'))).toBe('2026-10-01');
  });
  it('ключ часа несёт дату: тот же час завтра — другой ключ', () => {
    expect(moscowHour(new Date('2026-09-30T11:10:00Z'))).toBe('2026-09-30T14');
    expect(moscowHour(new Date('2026-10-01T11:10:00Z'))).toBe('2026-10-01T14');
  });
  it('Retry-After — секунды до полуночи МСК', () => {
    expect(secondsToMoscowMidnight(new Date('2026-09-30T20:59:00Z'))).toBe(60);
    expect(secondsToMoscowMidnight(new Date('2026-09-30T21:00:00Z'))).toBe(86_400);
  });
});

describe('отказ при исчерпании (01_plan.md §4, OWN-06B-009)', () => {
  const CONTACT = 'owner@example.test';
  it('посетителю — ОДИН текст и один код на личный, ботовый и общий предел', () => {
    const vkey = visitorKey(SECRET, '203.0.113.7', BOT);
    const texts = [`answer:visitor:${vkey}`, `answer:bot:${BOT}`, 'answer:global'].map((s) => quotaRefusal(s, CONTACT));
    for (const t of texts) {
      expect(t).toMatchObject({ status: 429, code: 'limit_reached', message: visitorLimitText(CONTACT) });
      expect(t.message).toBe('Лимит вопросов на сегодня исчерпан. Свяжитесь с владельцем сайта: owner@example.test');
      expect(t.retryAfterSeconds).toBeGreaterThan(0);
    }
  });
  it('песочнице — свой текст со сроком сброса', () => {
    expect(quotaRefusal(`answer:sandbox:${ACC}`, CONTACT).code).toBe('limit_sandbox_account');
    expect(quotaRefusal('answer:sandbox:global', CONTACT).code).toBe('limit_sandbox_global');
  });
  it('неизвестный scope — ошибка кода, не «разрешить»; провайдер — 503', () => {
    expect(() => quotaRefusal('embed:global', CONTACT)).toThrow();
    expect(providerRefusal(new ProviderUnavailableError('x'))).toMatchObject({ status: 503, code: 'provider_unavailable' });
    expect(() => providerRefusal(new Error('чужая'))).toThrow('чужая');
  });
});
