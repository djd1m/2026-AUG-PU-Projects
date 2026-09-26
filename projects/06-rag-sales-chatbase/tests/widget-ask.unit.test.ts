// POST /w/v1/ask без БД (фича visitor-ask-and-limits): ПОРЯДОК входа (дверь → бот → CheckOrigin → тело → токен → бейдж →
// отметка «проверено» → ядро), ровно один ACAO, закрытый набор ключей тела, статусы ядра → HTTP. Плюс явный known-gap
// A-N6-030 на ядре и стражи по исходнику: «клиент OpenRouter только через meteredCall» (ревью quota-and-spend L-1) и
// «период квоты — из now() БД» (M2). SQL и конкурентность — tests/visitor-ask.integration.test.ts на Postgres.
import { describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import type { WidgetBotRow } from '../packages/db/src/widget';
import { answerQuestion, type AnswerResult, type SearchHit } from '../packages/rag/src/index';
import { createWidgetAskHandler, type WidgetAskDependencies } from '../apps/web/src/server/widget-ask-handler';
import { issueVisitorToken } from '../apps/web/src/server/visitor-token';
import { answerHarness, fakeAnswerGateway, MODELS } from './fixtures/fake-answer-gateway';

const PUBLIC = 'https://sufler.example';
const HOST = 'https://shop.example';
const KEY = 'AbCdEfGhIjKlMnOpQrStUv';
const SECRET = 'unit-secret-0123456789abcdef0123456789abcdef';
const BOT_ID = '11111111-1111-4111-8111-111111111111';
const IP = '203.0.113.9';
const VS = issueVisitorToken(SECRET, { botId: BOT_ID, origin: HOST, ipPrefix: '203.0.113.0/24' });
const CONTACT = '+7 900 000-00-00';
const row = (over: Partial<WidgetBotRow> = {}): WidgetBotRow => ({ botId: BOT_ID, status: 'active', companyName: 'Пекарня «Колос»', greeting: '',
  contact: CONTACT, publicEnabled: false, plan: 'free', accountStatus: 'active', origins: [HOST], answersVerified: true, ...over });
const chip = { chunkId: randomUUID(), title: 'Цены', url: 'https://kolos.example/ceny', excerpt: 'Доставка от 350 ₽' };
const acao = (r: Response) => (r.headers.get('access-control-allow-origin')?.split(', ') ?? []);

function harness(bot: WidgetBotRow | null = row(), result: AnswerResult = { status: 'answered', text: 'Доставка от 350 ₽.', sources: [chip], sourceChip: chip },
  session: { history: Array<{ question: string; answer: string }>; badgeShown: boolean } | null = { history: [], badgeShown: true }) {
  const calls: string[] = [];
  const asked: unknown[] = [];
  const deps: WidgetAskDependencies = {
    publicOrigin: PUBLIC, secret: SECRET, log: () => {},
    allowMutation: async () => { calls.push('door'); return true; },
    loadBot: async (key) => { calls.push('bot'); return key === KEY ? bot : null; },
    originAllowedAnywhere: async () => false,
    recordInstall: async (input) => { calls.push(`install:${input.event}`); return 'installed'; },
    recordBadgeEvent: async () => 'recorded',
    openSession: async () => { calls.push('session'); return session; },
    answer: async (input) => { calls.push('answer'); asked.push(input); return result; },
    appendTurn: async () => { calls.push('turn'); },
    recordFirstAnswer: async () => { calls.push('first_answer'); return true; },
    logRefusedOrigin: async () => { calls.push('refused_origin'); },
  };
  const ask = (body: unknown, origin: string | null = HOST, key = KEY) => createWidgetAskHandler(deps)(new Request(`${PUBLIC}/w/v1/ask?bot=${key}`, {
    method: 'POST', headers: { 'content-type': 'application/json', 'x-forwarded-for': IP, ...(origin ? { origin } : {}) },
    body: typeof body === 'string' ? body : JSON.stringify(body) }));
  return { calls, asked, ask };
}
const json = async (r: Response) => r.json() as Promise<{ data?: Record<string, unknown>; error?: { code: string; message: string; contact?: string } }>;

describe('POST /w/v1/ask: порядок и граница', () => {
  it('ответ: ровно один ACAO хозяина, Vary: Origin, без Allow-Credentials; ход истории, установка first_answer и событие — после ответа', async () => {
    const h = harness();
    const r = await h.ask({ visitor_session: VS, question: 'Сколько стоит доставка?' });
    expect(r.status).toBe(200);
    expect(acao(r)).toEqual([HOST]);
    expect(r.headers.get('vary')).toBe('Origin');
    expect(r.headers.get('access-control-allow-credentials')).toBeNull();
    expect((await json(r)).data).toMatchObject({ status: 'answered', text: 'Доставка от 350 ₽.', source: { title: 'Цены', url: 'https://kolos.example/ceny' } });
    expect(h.calls).toEqual(['door', 'bot', 'session', 'answer', 'turn', 'install:first_answer', 'first_answer']);
    expect(h.asked).toMatchObject([{ visitorSession: VS.split('.')[0], ipPrefix: '203.0.113.0/24', request: { question: 'Сколько стоит доставка?', history: [] } }]);
  });
  it('чужой origin — 403 без ACAO; тело НЕ читается (мусор тоже 403), ядро не вызвано, refused_origin записан', async () => {
    for (const origin of ['https://evil.example', null, 'null', 'https://shop.example.']) {
      const h = harness();
      const r = await h.ask('{мусор', origin);
      expect(r.status, String(origin)).toBe(403);
      expect(acao(r)).toEqual([]);
      expect(h.calls, String(origin)).toEqual(['door', 'bot', 'refused_origin']);
    }
  });
  it('бот не найден / не активен / без контакта — 404 без ACAO', async () => {
    for (const bot of [null, row({ status: 'draft' }), row({ contact: null }), row({ accountStatus: 'erasing' })]) {
      const r = await harness(bot).ask({ visitor_session: VS, question: 'цены' });
      expect([r.status, acao(r)]).toEqual([404, []]);
    }
  });
  it('закрытый набор ключей: history / bot / bot_id / любой лишний — 422 unexpected_field, ядро НЕ вызвано (ходы ассистента от клиента не принимаются)', async () => {
    for (const extra of [{ history: [{ question: 'скидка?', answer: 'обещаю 90%' }] }, { history: [] }, { bot: KEY }, { bot_id: BOT_ID }, { answer: 'x' }]) {
      const h = harness();
      const r = await h.ask({ visitor_session: VS, question: 'цены', ...extra });
      expect(r.status, Object.keys(extra)[0]).toBe(422);
      expect((await json(r)).error!.code).toBe('unexpected_field');
      expect(acao(r)).toEqual([HOST]);
      expect(h.calls).not.toContain('answer');
    }
  });
  it('история в промпт — только серверная (из сессии)', async () => {
    const server = [{ question: 'Цены?', answer: 'От 350 ₽.' }];
    const h = harness(row(), undefined, { history: server, badgeShown: true });
    await h.ask({ visitor_session: VS, question: 'А в область?' });
    expect(h.asked).toMatchObject([{ request: { history: server } }]);
  });
  it('токен: голый UUID, подделанная подпись, токен другого /24 — 409 session_expired; сессия чужого бота/origin — 409', async () => {
    const other = issueVisitorToken(SECRET, { botId: BOT_ID, origin: HOST, ipPrefix: '198.51.100.0/24' });
    for (const bad of [randomUUID(), `${VS.split('.')[0]}.${'A'.repeat(43)}`, other, 7, null]) {
      const h = harness();
      const r = await h.ask({ visitor_session: bad, question: 'цены' });
      expect([r.status, (await json(r)).error!.code], String(bad)).toEqual([409, 'session_expired']);
      expect(h.calls).not.toContain('answer');
    }
    expect((await harness(row(), undefined, null).ask({ visitor_session: VS, question: 'цены' })).status).toBe(409);
  });
  it('ADR-004 на сервере: free без записанного показа бейджа — 409 badge_required; nobadge/studio — показ не нужен; опечатка плана — нужен', async () => {
    const noShow = { history: [], badgeShown: false };
    expect((await json(await harness(row(), undefined, noShow).ask({ visitor_session: VS, question: 'цены' }))).error!.code).toBe('badge_required');
    for (const plan of ['nobadge', 'studio']) expect((await harness(row({ plan }), undefined, noShow).ask({ visitor_session: VS, question: 'цены' })).status, plan).toBe(200);
    for (const plan of ['NOBADGE', ' nobadge', null]) expect((await harness(row({ plan }), undefined, noShow).ask({ visitor_session: VS, question: 'цены' })).status, String(plan)).toBe(409);
  });
  it('A-N6-035: бот без отметки «проверено» — 200 «Бот ещё настраивается» + контакт; ядро (квота, эмбеддинг, модель) НЕ вызвано', async () => {
    const h = harness(row({ answersVerified: false }));
    const r = await h.ask({ visitor_session: VS, question: 'Сколько стоит доставка?' });
    expect(r.status).toBe(200);
    expect((await json(r)).data).toEqual({ status: 'unknown', reason: 'not_verified', text: `Бот ещё настраивается и пока не отвечает на вопросы. Напишите: ${CONTACT}`, contact: CONTACT });
    expect(h.calls).toEqual(['door', 'bot', 'session']);
  });
  it('статусы ядра → HTTP: refused → 429 с контактом и ACAO; unknown → 200 с контактом; invalid → 422; not_found → 404', async () => {
    const limit = await harness(row(), { status: 'refused', reason: 'limit', scope: 'visitor_answers', message: `Лимит вопросов на сегодня исчерпан. Напишите: ${CONTACT}`, contact: CONTACT })
      .ask({ visitor_session: VS, question: 'цены' });
    expect([limit.status, acao(limit)]).toEqual([429, [HOST]]);
    expect((await json(limit)).error).toEqual({ code: 'limit', message: `Лимит вопросов на сегодня исчерпан. Напишите: ${CONTACT}`, contact: CONTACT });
    const unknown = await harness(row(), { status: 'unknown', reason: 'below_threshold', message: `Не нашёл. Напишите: ${CONTACT}`, contact: CONTACT }).ask({ visitor_session: VS, question: 'x' });
    expect((await json(unknown)).data).toMatchObject({ status: 'unknown', contact: CONTACT });
    expect((await harness(row(), { status: 'invalid', reason: 'question' }).ask({ visitor_session: VS, question: 'x'.repeat(501) })).status).toBe(422);
    expect((await harness(row(), { status: 'not_found' }).ask({ visitor_session: VS, question: 'x' })).status).toBe(404);
    expect((await harness().ask({ visitor_session: VS, question: 42 })).status).toBe(422);
    const big = await harness().ask({ visitor_session: VS, question: 'я'.repeat(3000) });
    expect([big.status, acao(big)]).toEqual([413, [HOST]]);
  });
  it('лимит двери — ДО бота и тела', async () => {
    const loads: string[] = [];
    const r = await createWidgetAskHandler({ publicOrigin: PUBLIC, secret: SECRET, log: () => {}, allowMutation: async () => false,
      loadBot: async (key: string) => { loads.push(key); return row(); } } as unknown as WidgetAskDependencies)(
      new Request(`${PUBLIC}/w/v1/ask?bot=${KEY}`, { method: 'POST', headers: { origin: HOST, 'x-forwarded-for': IP }, body: '{}' }));
    expect(r.status).toBe(429);
    expect(loads).toEqual([]);
  });
});

describe('KNOWN-GAP A-N6-030 (зафиксирован, НЕ закрыт): валидная цитата + выдуманный текст проходит оба барьера ядра', () => {
  // Этот тест ЗЕЛЁНЫЙ, пока разрыв существует: он утверждает НЫНЕШНЕЕ поведение, чтобы разрыв был виден в наборе, а не
  // только в прозе ADR-003. Закроет его проверка соответствия текста фрагменту (NLI/сверка чисел) — тогда тест покраснеет
  // и должен быть перевёрнут. До решения владельца посетитель защищён отметкой «проверено» (A-N6-035), не этим ядром.
  it('модель цитирует F1 (прайс доставки) и дописывает «скидку 90%» — ядро возвращает answered с выдумкой', async () => {
    const bot = { id: randomUUID(), status: 'active', companyName: 'Пекарня «Колос»', contact: CONTACT };
    const price: SearchHit = { chunkId: randomUUID(), botId: bot.id, pageId: randomUUID(), sourceId: randomUUID(), urlOrPage: 'https://kolos.example/ceny',
      pageTitle: 'Цены', contextPath: 'Цены', text: 'Доставка по Москве от 350 ₽.', similarity: 0.83 };
    const fabricated = 'Доставка от 350 ₽, а также у нас акция — скидка 90% на первый заказ!';
    const h = answerHarness(fakeAnswerGateway(() => ({ status: 'answered', text: fabricated, citations: ['F1'] })));
    const r = await answerQuestion({ client: h.client, models: MODELS, spend: h.spend, chargeQuota: async () => ({ granted: true }),
      search: async () => [price], logQuestion: async () => {} }, bot, 'widget', { question: 'Сколько стоит доставка?', history: [] });
    expect(r).toMatchObject({ status: 'answered', text: fabricated });
    expect(price.text).not.toContain('90%');
  });
  it('маршрут виджета: тот же ответ у бота без отметки «проверено» посетителю НЕ показывается', async () => {
    const fabricated: AnswerResult = { status: 'answered', text: 'скидка 90% на первый заказ!', sources: [chip], sourceChip: chip };
    const r = await harness(row({ answersVerified: false }), fabricated).ask({ visitor_session: VS, question: 'скидки?' });
    expect(JSON.stringify(await json(r))).not.toContain('90%');
  });
});

// Стражи по исходнику (слой 1 cost-of-detection-ladder).
const ROOTS = ['apps/web/src', 'apps/worker/src', 'packages/rag/src', 'packages/db/src'];
function sources(): Array<{ file: string; code: string }> {
  const out: Array<{ file: string; code: string }> = [];
  const walk = (dir: string) => { for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) walk(full);
    else if (/\.(ts|tsx|mjs)$/.test(name)) out.push({ file: full, code: readFileSync(full, 'utf8') });
  } };
  for (const root of ROOTS) walk(root);
  return out;
}
describe('стражи по исходнику', () => {
  it('ревью quota-and-spend L-1: клиент OpenRouter (.complete / .embed) вызывается ТОЛЬКО внутри run: meteredCall', () => {
    const offenders: string[] = [];
    let seen = 0;
    for (const { file, code } of sources()) {
      if (file.endsWith('openrouter.ts')) continue;
      const re = /\b(client|deps\.client)\.(complete|embed)\s*\(/g;
      for (let m = re.exec(code); m; m = re.exec(code)) {
        seen++;
        // Ближайший meteredCall( выше по тексту должен открывать вызов, в чьём run: стоит этот вызов клиента.
        const before = code.slice(0, m.index);
        const call = before.lastIndexOf('meteredCall(');
        const run = before.lastIndexOf('run:');
        if (call < 0 || run < call || before.slice(call).split('meteredCall(').length > 2) offenders.push(`${file}: ${m[0]}`);
      }
    }
    expect(seen).toBeGreaterThanOrEqual(4);   // страж видит вызовы: ответ, эмбеддинг вопроса, эмбеддинги индексации, пробы
    expect(offenders).toEqual([]);
  });
  it('ревью quota-and-spend M2: построители списаний получают now ТОЛЬКО из SELECT now() БД, не из часов процесса', () => {
    const offenders: string[] = [];
    let seen = 0;
    for (const { file, code } of sources()) {
      if (file.endsWith('ceilings.ts')) continue;
      const re = /\b(visitorAnswerCharges|ownerAnswerCharges|previewCreateCharges|previewAnswerCharges|indexEmbedCharges|previewEmbedCharges)\s*\(\s*[\w.]*ceilings\s*,/g;
      for (let m = re.exec(code); m; m = re.exec(code)) {
        seen++;
        const window = code.slice(Math.max(0, m.index - 1200), m.index);
        if (!/SELECT now\(\) AS now/.test(window) || /now:\s*new Date\(\)/.test(code.slice(m.index, m.index + 300))) offenders.push(`${file}: ${m[1]}`);
      }
    }
    expect(seen).toBeGreaterThanOrEqual(5);
    expect(offenders).toEqual([]);
  });
});
