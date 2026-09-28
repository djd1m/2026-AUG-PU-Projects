// gate-onboarding (A-N6-066) без БД: запись заглушки ворот A-N6-035 маршрутом виджета (с сессией, до ответа, сбой записи
// не отнимает заглушку), склонение «посетитель», разметка баннера и сводки, страж «тестовый чат не зависит от отметки».
// SQL, триггер и счёт — tests/gate-onboarding.integration.test.ts; экраны в браузере — tests/browser/gate-onboarding.test.ts.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { WidgetBotRow } from '../packages/db/src/widget';
import { createWidgetAskHandler, type WidgetAskDependencies } from '../apps/web/src/server/widget-ask-handler';
import { issueVisitorToken } from '../apps/web/src/server/visitor-token';
import { GateBanner, GATE_STUB_WARNING, stubVisitorsLine, visitorsWord } from '../apps/web/src/app/dashboard/GateBanner';
import { SummaryBlock } from '../apps/web/src/app/dashboard/bots/[botId]/BotExtrasViews';
import { requestVerify } from '../apps/web/src/lib/verify-request';

const PUBLIC = 'https://sufler.example', HOST = 'https://aicoding.example', KEY = 'AbCdEfGhIjKlMnOpQrStUv';
const SECRET = 'unit-secret-0123456789abcdef0123456789abcdef';
const BOT_ID = '11111111-1111-4111-8111-111111111111';
const VS = issueVisitorToken(SECRET, { botId: BOT_ID, origin: HOST, ipPrefix: '203.0.113.0/24' });
const row = (answersVerified: boolean): WidgetBotRow => ({ botId: BOT_ID, status: 'active', companyName: 'Школа', greeting: '', contact: '+7 900 000-00-00',
  publicEnabled: false, plan: 'free', accountStatus: 'active', origins: [HOST], answersVerified, publicSlug: null });

function harness(verified: boolean, logFails = false) {
  const calls: string[] = [], logged: Array<[string, string]> = [], lines: string[] = [];
  const deps: WidgetAskDependencies = {
    publicOrigin: PUBLIC, secret: SECRET, log: (line) => lines.push(line),
    allowMutation: async () => true, loadBot: async () => row(verified), originAllowedAnywhere: async () => false,
    recordInstall: async () => 'installed', recordBadgeEvent: async () => 'recorded',
    openSession: async () => ({ history: [], badgeShown: true }),
    answer: async () => { calls.push('answer'); return { status: 'unknown', reason: 'below_threshold', message: 'нет', contact: 'x' }; },
    appendTurn: async () => {}, recordFirstAnswer: async () => true, logRefusedOrigin: async () => { calls.push('refused_origin'); },
    logNotVerified: async (botId, session) => { calls.push('not_verified'); if (logFails) throw new Error('db down'); logged.push([botId, session]); },
  };
  const ask = (question = 'цены?') => createWidgetAskHandler(deps)(new Request(`${PUBLIC}/w/v1/ask?bot=${KEY}`, { method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': '203.0.113.9', origin: HOST }, body: JSON.stringify({ visitor_session: VS, question }) }));
  return { calls, logged, lines, ask };
}

describe('маршрут виджета: заглушка ворот записывается', () => {
  it('без отметки — not_verified с id сессии из ПРОВЕРЕННОГО токена, ядро не вызвано', async () => {
    const h = harness(false);
    const r = await h.ask();
    expect(((await r.json()) as { data: { reason: string } }).data.reason).toBe('not_verified');
    expect(h.calls).toEqual(['not_verified']);
    expect(h.logged).toEqual([[BOT_ID, VS.split('.')[0]]]);
  });
  it('сбой записи журнала не отнимает у посетителя заглушку с контактом и пишется в лог сервера', async () => {
    const h = harness(false, true);
    const r = await h.ask();
    expect(r.status).toBe(200);
    expect(((await r.json()) as { data: { reason: string; contact: string } }).data).toMatchObject({ reason: 'not_verified', contact: '+7 900 000-00-00' });
    expect(h.lines).toContain('Виджет: исход not_verified не записан');
  });
  it('ревью круга 1: пустой, пробельный и длиннее 500 символов вопрос — 422 как у ядра, заглушка НЕ пишется', async () => {
    for (const question of ['', '   ', 'в'.repeat(501)]) {
      const h = harness(false);
      const r = await h.ask(question);
      expect([r.status, ((await r.json()) as { error: { code: string } }).error.code], JSON.stringify(question.slice(0, 5))).toEqual([422, 'invalid_question']);
      expect(h.calls).toEqual([]);
    }
    const ok = harness(false);
    expect((await ok.ask('в'.repeat(500))).status).toBe(200);
    expect(ok.calls).toEqual(['not_verified']);
  });
  it('с отметкой — not_verified не пишется, отвечает ядро', async () => {
    const h = harness(true);
    await h.ask();
    expect(h.calls).toEqual(['answer']);
  });
});

describe('склонение и тексты', () => {
  it.each([[1, 'посетитель'], [2, 'посетителя'], [4, 'посетителя'], [5, 'посетителей'], [11, 'посетителей'], [12, 'посетителей'], [14, 'посетителей'],
    [21, 'посетитель'], [22, 'посетителя'], [111, 'посетителей'], [101, 'посетитель'], [0, 'посетителей']])('%i → %s', (n, word) => {
    expect(visitorsWord(n)).toBe(word);
  });
  it('глагол согласован: 1 получил, 11 получили, 21 получил, 3 получили', () => {
    expect(stubVisitorsLine(1)).toBe('1 посетитель получил заглушку «Бот ещё настраивается»');
    expect(stubVisitorsLine(11)).toBe('11 посетителей получили заглушку «Бот ещё настраивается»');
    expect(stubVisitorsLine(21)).toBe('21 посетитель получил заглушку «Бот ещё настраивается»');
    expect(stubVisitorsLine(3)).toBe('3 посетителя получили заглушку «Бот ещё настраивается»');
  });
});

describe('разметка', () => {
  const banner = (over: Partial<Parameters<typeof GateBanner>[0]>) => renderToStaticMarkup(createElement(GateBanner, { verified: false, ready: true, resetAt: null,
    stubVisitors: 0, chatHref: '#chat-title', busy: false, error: '', onVerify: () => {}, ...over }));
  it('отметка стоит — баннера нет', () => { expect(banner({ verified: true })).toBe(''); });
  it('без отметки — текст заглушки; готовый источник — кнопка; нет готового — кнопки нет', () => {
    expect(banner({})).toContain(GATE_STUB_WARNING);
    expect(banner({})).toContain('>Я проверил ответы бота</button>');
    expect(banner({ ready: false })).not.toContain('<button');
  });
  it('снятие базой — дата и «материалы обновились»; число посетителей за 7 дней — только если > 0', () => {
    expect(banner({ resetAt: '2026-09-28T09:00:00.000Z' })).toContain('Отметка снята 28 сентября: материалы обновились — проверьте ответы заново.');
    expect(banner({ stubVisitors: 3 })).toContain('За 7 дней 3 посетителя получили заглушку');
    expect(banner({})).not.toContain('За 7 дней');
  });
  it('сводка: только заглушки — не «вопросов ещё не было»; строка заглушек отдельно от «не знал»', () => {
    const html = renderToStaticMarkup(createElement(SummaryBlock, { summary: { answered: 0, unknown: 0, refused_limit: 0, not_verified_visitors: 5, last_unknown: [] } }));
    expect(html).not.toContain('Вопросов ещё не было');
    expect(html).toContain('5 посетителей получили заглушку «Бот ещё настраивается»');
    expect(html).toMatch(/<\/ul><p[^>]*stub-count/);
  });
});

describe('requestVerify — общий путь отметки из экрана бота и экрана установки (ревью круга 1)', () => {
  const sender = (status: number, body: unknown, calls: unknown[] = []) => (async (...args: unknown[]) => { calls.push(args); return { status, body }; }) as never;
  it('200 с булевым answers_verified — успех; запрос — POST /api/bots/{id}/verify { verified }', async () => {
    const calls: unknown[] = [];
    expect(await requestVerify(BOT_ID, true, sender(200, { data: { answers_verified: true } }, calls))).toEqual({ ok: true, verified: true });
    expect(calls).toEqual([[`/api/bots/${BOT_ID}/verify`, 'POST', { verified: true }]]);
  });
  it('409 indexing — текст сервера; 200 без данных или с не-булевым — ошибка, а не «отметка стоит»; сеть — «нет связи»', async () => {
    expect(await requestVerify(BOT_ID, true, sender(409, { error: { code: 'indexing', message: 'Дождитесь окончания загрузки материалов' } })))
      .toEqual({ ok: false, message: 'Дождитесь окончания загрузки материалов' });
    for (const body of [null, {}, { data: {} }, { data: { answers_verified: 'true' } }]) {
      expect(await requestVerify(BOT_ID, true, sender(200, body)), JSON.stringify(body)).toEqual({ ok: false, message: 'Не удалось сохранить отметку. Повторите' });
    }
    expect(await requestVerify(BOT_ID, true, (async () => { throw new TypeError('fetch failed'); }) as never)).toEqual({ ok: false, message: 'Нет связи с сервером. Повторите' });
  });
  it('страж: оба экрана ставят отметку только через requestVerify, прямого POST …/verify в экранах нет', () => {
    for (const file of ['apps/web/src/app/dashboard/bots/[botId]/BotScreen.tsx', 'apps/web/src/app/dashboard/bots/[botId]/install/InstallScreen.tsx']) {
      const code = readFileSync(file, 'utf8');
      expect(code, file).toMatch(/requestVerify\(p\.botId/);
      expect(code, file).not.toMatch(/\/verify`/);
    }
  });
});

describe('страж: тестовый чат владельца не зависит от отметки «проверено» (AC-4)', () => {
  it('путь ответа владельца (маршрут и связка) не читает отметку', () => {
    const handler = readFileSync('apps/web/src/server/cabinet-handler.ts', 'utf8');
    const ownerAsk = handler.slice(handler.indexOf('export function createOwnerAskHandler'), handler.indexOf('// POST /api/bots/{bot_id}/verify'));
    expect(ownerAsk.length).toBeGreaterThan(100);
    expect(ownerAsk).not.toMatch(/verif/i);
    const deps = readFileSync('apps/web/src/server/cabinet-deps.ts', 'utf8');
    const answer = deps.slice(deps.indexOf('    answer: async'));
    expect(answer).not.toMatch(/verif/i);
  });
});
