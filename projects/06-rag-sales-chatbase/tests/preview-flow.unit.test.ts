// preview-flow без БД: порядок операций маршрутов (лимит двери → Origin → тело → CheckAddress ДО квоты и постановки),
// закрытый набор ключей тела, cookie без токена в адресе, подсказки и история. Боевой SQL — preview-flow.integration.
import { describe, expect, it } from 'vitest';
import { createPreviewAskHandler, createPreviewCreateHandler, AddressRefusal, type PreviewDependencies } from '../apps/web/src/server/preview-handler';
import { normalizeSiteUrl, tokenHash, draftName } from '../apps/web/src/server/preview-session';
import { readHistory, suggestQuestions } from '../packages/db/src/previews';

const ORIGIN = 'https://sufler.test.invalid';
function fakeDeps(overrides: Partial<PreviewDependencies> = {}) {
  const calls: string[] = [];
  const deps: PreviewDependencies = {
    publicOrigin: ORIGIN, secret: 's'.repeat(64), budget: { pageBudget: 20, embedBudget: 40_000 },
    allowMutation: async () => { calls.push('limit'); return true; },
    checkAddress: async (url) => { calls.push('check'); return { url: new URL(url) }; },
    findRepeat: async () => { calls.push('repeat'); return null; },
    createPreview: async () => { calls.push('create'); return { kind: 'created', indexJobId: '11111111-1111-4111-8111-111111111111', botId: '22222222-2222-4222-8222-222222222222' }; },
    isUniqueViolation: () => false,
    enqueue: async () => { calls.push('enqueue'); },
    newPublicKey: () => 'k'.repeat(22),
    readAccess: async () => ({ previewId: 'p', botId: '22222222-2222-4222-8222-222222222222', browserSession: 'b'.repeat(64), history: [], expired: false, claimed: false }),
    readJob: async () => null, readSite: async () => null, answersLeft: async () => 10,
    answer: async (botId) => { calls.push(`answer:${botId}`); return { status: 'unknown', reason: 'below_threshold', message: 'Не нашёл', contact: null }; },
    appendTurn: async () => {}, shareCtaShown: async () => false,
    authenticate: async () => null, claim: async () => ({ status: 'not_found' }),
    log: () => {}, ...overrides,
  };
  return { deps, calls };
}
const request = (body: unknown, headers: Record<string, string> = {}) => new Request(`${ORIGIN}/api/preview`, { method: 'POST', body: JSON.stringify(body),
  headers: { 'x-forwarded-for': '93.184.216.9', origin: ORIGIN, 'content-type': 'application/json', 'idempotency-key': '33333333-3333-4333-8333-333333333333', ...headers } });

describe('CreatePreview: порядок — это защита', () => {
  it('успех: лимит → повтор? → CheckAddress → квота+строки → очередь; 202 с index_job_id и HttpOnly cookie без токена в теле', async () => {
    const { deps, calls } = fakeDeps();
    const r = await createPreviewCreateHandler(deps)(request({ url: 'kolos.example' }));
    expect(r.status).toBe(202);
    expect(calls).toEqual(['limit', 'repeat', 'check', 'create', 'enqueue']);
    const body = await r.json() as { data: Record<string, unknown> };
    expect(Object.keys(body.data)).toEqual(['index_job_id']);
    expect(r.headers.getSetCookie().some((c) => /^__Host-n6_preview=[A-Za-z0-9_-]{43}; Path=\/; HttpOnly; Secure; SameSite=Lax; Max-Age=86400$/.test(c))).toBe(true);
  });
  it('SSRF-отказ CheckAddress — 422, ни квоты, ни строк, ни постановки', async () => {
    const { deps, calls } = fakeDeps({ checkAddress: async () => { throw new AddressRefusal('blocked_address'); } });
    const r = await createPreviewCreateHandler(deps)(request({ url: 'http://10.0.0.5/' }));
    expect(r.status).toBe(422);
    expect(calls).toEqual(['limit', 'repeat']);
  });
  it('лимит двери — 429 до тела и до CheckAddress; чужой или пустой Origin — 403', async () => {
    const limited = fakeDeps({ allowMutation: async () => false });
    expect((await createPreviewCreateHandler(limited.deps)(request({ url: 'kolos.example' }))).status).toBe(429);
    expect(limited.calls).toEqual([]);
    for (const origin of ['https://evil.example', '']) {
      const { deps, calls } = fakeDeps();
      expect((await createPreviewCreateHandler(deps)(request({ url: 'kolos.example' }, { origin }))).status).toBe(403);
      expect(calls).toEqual(['limit']);
    }
  });
  it('тело: лишний ключ, пустой адрес, адрес с пробелами, без Idempotency-Key — 400 до CheckAddress', async () => {
    for (const [body, headers] of [[{ url: 'kolos.example', bot_id: 'x' }, {}], [{ url: '' }, {}], [{ url: 'kolos .example' }, {}], [{ url: 'kolos.example' }, { 'idempotency-key': 'abc' }]] as const) {
      const { deps, calls } = fakeDeps();
      expect((await createPreviewCreateHandler(deps)(request(body, headers))).status).toBe(400);
      expect(calls).toEqual(['limit']);
    }
  });
  it('отказ квоты — 429 limit_preview, очередь не тронута', async () => {
    const { deps, calls } = fakeDeps({ createPreview: async () => ({ kind: 'refused', scope: 'preview_session' }) });
    const r = await createPreviewCreateHandler(deps)(request({ url: 'kolos.example' }));
    expect(r.status).toBe(429);
    expect(calls).not.toContain('enqueue');
  });
});

describe('вопрос предпросмотра: бот и история — с сервера', () => {
  const ask = (body: unknown, cookie = `__Host-n6_preview=${'t'.repeat(43)}`) => new Request(`${ORIGIN}/api/preview/x/ask`, { method: 'POST', body: JSON.stringify(body),
    headers: { 'x-forwarded-for': '93.184.216.9', origin: ORIGIN, 'content-type': 'application/json', cookie } });
  const id = '11111111-1111-4111-8111-111111111111';
  it('bot_id и history в теле — 400 unexpected_field, ядро не зовётся; бот ядра — из строки предпросмотра', async () => {
    for (const body of [{ question: 'Q', bot_id: '99999999-9999-4999-8999-999999999999' }, { question: 'Q', history: [{ question: 'a', answer: 'b' }] }]) {
      const { deps, calls } = fakeDeps();
      const r = await createPreviewAskHandler(deps)(ask(body), id);
      expect(r.status).toBe(400);
      expect(calls.filter((c) => c.startsWith('answer'))).toEqual([]);
    }
    const { deps, calls } = fakeDeps();
    expect((await createPreviewAskHandler(deps)(ask({ question: 'Q' }), id)).status).toBe(200);
    expect(calls).toContain('answer:22222222-2222-4222-8222-222222222222');
  });
  it('без cookie предпросмотра — 404 (как несуществующий), ядро не зовётся', async () => {
    const { deps, calls } = fakeDeps();
    expect((await createPreviewAskHandler(deps)(ask({ question: 'Q' }, ''), id)).status).toBe(404);
    expect(calls).toEqual(['limit']);
  });
});

describe('чистые функции', () => {
  it('адрес: без схемы → https; пустое, с пробелами, длиннее 2048, не строка → null', () => {
    expect(normalizeSiteUrl(' kolos.example ')).toBe('https://kolos.example');
    expect(normalizeSiteUrl('http://kolos.example/a')).toBe('http://kolos.example/a');
    for (const bad of ['', '  ', 'a b.ru', 'x'.repeat(2050), 42, null, ['kolos.example']]) expect(normalizeSiteUrl(bad)).toBeNull();
    expect(draftName(new URL('https://www.kolos.example/'))).toBe('kolos.example');
  });
  it('хэш токена зависит от назначения: хэш браузера ≠ хэш предпросмотра того же значения', () => {
    expect(tokenHash('s', 'browser', 'x')).not.toBe(tokenHash('s', 'preview', 'x'));
    expect(tokenHash('s', 'preview', 'x')).toMatch(/^[0-9a-f]{64}$/);
  });
  it('история из БД читается fail-closed; больше 2 ходов — последние 2', () => {
    expect(readHistory('[]')).toEqual([]);
    expect(readHistory([{ question: 'a' }])).toEqual([]);
    expect(readHistory([{ question: 'a', answer: 'b', extra: 1 }])).toEqual([{ question: 'a', answer: 'b' }]);
    expect(readHistory([1, 2, 3].map((n) => ({ question: `q${n}`, answer: `a${n}` })))).toEqual([{ question: 'q2', answer: 'a2' }, { question: 'q3', answer: 'a3' }]);
  });
  it('подсказки: темы из текста сайта, затем заголовки, не больше трёх, без повторов', () => {
    expect(suggestQuestions(['Доставка по городу. Цена от 350 ₽', 'Режим работы: без выходных'], [])).toEqual(
      ['Сколько стоят ваши услуги?', 'Как работает доставка?', 'Когда вы работаете?']);
    expect(suggestQuestions(['просто текст'], ['О компании', 'О компании', ''])).toEqual(['Расскажите про «О компании»']);
  });
});
