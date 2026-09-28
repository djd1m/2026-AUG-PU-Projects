// text-source (FR-SOURCE-005, A-N6-080): текстовый файл по адресу. Разбор на разделы (AC-1), граница чужого адреса ADR-010
// (AC-2: 12 адресов Refinement, форма URL, robots.txt), тип и размер (AC-3), вход маршрута (AC-6). Сеть — подменный сайт
// на 127.0.0.1 ВНУТРИ процесса (tests/fixtures/fake-site.ts): политика адресов не подменяется, подменён только маршрут
// соединения с ПРОВЕРЕННОГО публичного адреса; любое соединение с другим адресом записывается и проваливает запрос.
import { afterEach, describe, expect, it } from 'vitest';
import type { Handler } from './fixtures/fake-site';
import { html, PUBLIC_IP, redirect, startFakeSite, text, type FakeSite } from './fixtures/fake-site';
import { slugify, splitTextFile, sectionUrl, sectionDisplay, plainLine } from '../apps/worker/src/text/split-text';
import { decodeText, fetchTextFile, looksLikeHtml, TextFetchFailure } from '../apps/worker/src/text/fetch-text';
import { TEXT_MAX_BYTES } from '../packages/rag/src/constants';
import { createSiteSourceHandler, type CabinetDependencies } from '../apps/web/src/server/cabinet-handler';
import { AddressRefusal } from '../apps/web/src/server/preview-handler';

const FILE = 'http://site.example/llms-full.txt';
const LLMS_FULL = `# aicoding.space — полный текст

> Русскоязычный сайт об agentic engineering. Карта сайта — https://aicoding.space/llms.txt.

# Блог

## AI-дайджест недели: агенты и модели

Адрес: https://aicoding.space/blog/digest/

### Главное

Неделя принесла три практических сдвига в агентных сценариях и локальных моделях.

### Россия

Корпоративные продукты и агентные сценарии.

## AI-дайджест недели: агенты и модели

Второй выпуск с тем же заголовком — якорь обязан отличаться.

# Курсы

## Курс «Промпт-инжиниринг»

\`\`\`md
## Это не раздел — заголовок внутри блока кода
\`\`\`

Текст курса про [промпты](https://aicoding.space/courses/prompts/) и ![схема](x.png) примеры.
`;

describe('разбор файла на разделы (AC-1)', () => {
  it('# и ## делят на разделы, ### — путь внутри раздела; блок кода не делит; пустой # — не раздел', () => {
    const { sections, emptySections } = splitTextFile(LLMS_FULL);
    expect(sections.map((s) => s.title)).toEqual([
      'aicoding.space — полный текст',
      'Блог › AI-дайджест недели: агенты и модели',
      'Блог › AI-дайджест недели: агенты и модели',
      'Курсы › Курс «Промпт-инжиниринг»',
    ]);
    expect(emptySections).toBe(2);   // «# Блог» и «# Курсы» без текста до первого ##
    const digest = sections[1]!;
    expect(digest.blocks).toContainEqual({ kind: 'heading', level: 3, text: 'Главное' });
    expect(digest.blocks).toContainEqual({ kind: 'heading', level: 3, text: 'Россия' });
    const course = sections[3]!;
    expect(course.blocks.map((b) => b.text)).toContain('## Это не раздел — заголовок внутри блока кода');
    expect(course.blocks.map((b) => b.text)).toContain('Текст курса про промпты (https://aicoding.space/courses/prompts/) и схема примеры.');
  });
  it('якоря: slug заголовка любого алфавита, повтор — с суффиксом; текст до первого заголовка — без якоря', () => {
    const { sections } = splitTextFile(LLMS_FULL);
    expect(sections.map((s) => s.anchor)).toEqual(['aicodingspace-полный-текст', 'ai-дайджест-недели-агенты-и-модели', 'ai-дайджест-недели-агенты-и-модели-1',
      'курс-промпт-инжиниринг']);
    expect(new Set(sections.map((s) => s.anchor)).size).toBe(sections.length);
    const pre = splitTextFile('Просто текст без заголовков.\nВторая строка.').sections;
    expect(pre).toHaveLength(1);
    expect(pre[0]!.anchor).toBeNull();
    expect(sectionUrl(new URL(FILE), null)).toBe(FILE);
    expect(slugify('  Цены & доставка!  ')).toBe('цены-доставка');
    expect(slugify('!!!')).toBe('');
    expect(splitTextFile('## !!!\nтекст').sections[0]!.anchor).toBe('razdel-1');
  });
  it('адрес «страницы» — файл + #якорь; пример непрочитанного — путь#якорь, раскодирован, без управляющих символов', () => {
    const url = sectionUrl(new URL(FILE), 'цены-доставка');
    expect(new URL(url).origin + new URL(url).pathname).toBe(FILE);
    expect(decodeURIComponent(new URL(url).hash)).toBe('#цены-доставка');
    expect(sectionDisplay(new URL(FILE), 'цены-доставка')).toBe('/llms-full.txt#цены-доставка');
    expect(sectionDisplay(new URL('http://site.example/a%00b.txt'), null)).not.toContain('\u0000');
  });
  it('хэш раздела меняется с содержимым и не зависит от соседей; одинаковые разделы — одинаковый хэш', () => {
    const a = splitTextFile('## A\nтекст один\n## B\nтекст два').sections;
    const b = splitTextFile('## A\nтекст один\n## B\nтекст ДВА изменён').sections;
    expect(a[0]!.contentHash).toBe(b[0]!.contentHash);
    expect(a[1]!.contentHash).not.toBe(b[1]!.contentHash);
  });
  it('llms.txt: разделы ## со списком ссылок, ссылки — текстом (по ним не ходим)', () => {
    const { sections } = splitTextFile('# Сайт\n\n> Описание\n\n## Курсы\n\n- [Промпты](https://s.example/p): основы\n- [Агенты](https://s.example/a)\n');
    expect(sections.map((s) => s.title)).toEqual(['Сайт', 'Сайт › Курсы']);
    expect(sections[1]!.blocks.map((b) => b.text)).toEqual(['- Промпты (https://s.example/p): основы', '- Агенты (https://s.example/a)']);
    expect(plainLine('> цитата')).toBe('цитата');
  });
});

describe('тип содержимого (AC-3)', () => {
  it('HTML-разметка в начале — не текст; Markdown с тегом в середине — текст', () => {
    for (const body of ['<!DOCTYPE html><html>', '  <html lang="ru">', '<!-- x --><head>', '<body>привет']) expect(looksLikeHtml(body), body).toBe(true);
    expect(looksLikeHtml('# Заголовок\nтекст <b>жирный</b>')).toBe(false);
  });
  it('кодировка: utf-8 и windows-1251 — текст; неизвестная, битый utf-8 и NUL — not_text', () => {
    expect(decodeText(Buffer.from('Привет', 'utf8'), 'text/plain; charset=utf-8')).toBe('Привет');
    expect(decodeText(Buffer.from([0xcf, 0xf0, 0xe8, 0xe2, 0xe5, 0xf2]), 'text/plain; charset=windows-1251')).toBe('Привет');
    expect(decodeText(Buffer.from('﻿# x', 'utf8'), 'text/markdown')).toBe('# x');
    for (const [bytes, type] of [[Buffer.from('x'), 'text/plain; charset=x-unknown'], [Buffer.from([0xff, 0xfe, 0xfd]), 'text/plain'],
      [Buffer.from('a\u0000b'), 'text/plain']] as const) {
      expect(() => decodeText(bytes, type)).toThrow(TextFetchFailure);
    }
  });
});

describe('загрузка файла: граница чужого адреса (ADR-010), тип и размер', () => {
  let site: FakeSite | null = null;
  afterEach(async () => { await site?.close(); site = null; });
  const UA = 'SuflerBot/0.1 (+https://sufler.example/bot)';
  const get = (url: string, s = site!, maxBytes?: number) => fetchTextFile({ url, userAgent: UA, net: s.net, pauseMs: 0, timeoutMs: 2000, ...(maxBytes ? { maxBytes } : {}) });
  const reason = async (promise: Promise<unknown>) => { try { await promise; return 'ok'; } catch (e) { if (e instanceof TextFetchFailure) return e.reason; throw e; } };
  const noRobots = { '/robots.txt': text('', 'text/plain', 404) };
  const md = (body: string, type = 'text/markdown; charset=utf-8'): Handler => (_q, r) => { r.writeHead(200, { 'content-type': type }); r.end(body); };

  // Refinement «SSRF: 12 адресов»: петля, частные, метаданные облака, CGNAT, «все интерфейсы», IPv6 петля/ULA/link-local,
  // имя с A-записью в частную сеть и перенаправление в петлю. Отказ — ДО загрузки файла, ни одного соединения к цели.
  const TWELVE = ['http://127.0.0.1/llms.txt', 'http://10.0.0.5/llms.txt', 'http://172.16.0.1/llms.txt', 'http://192.168.1.1/llms.txt',
    'http://169.254.169.254/latest/meta-data/', 'http://100.64.0.1/llms.txt', 'http://0.0.0.0/llms.txt', 'http://[::1]/llms.txt',
    'http://[fc00::1]/llms.txt', 'http://[fe80::1]/llms.txt', 'http://internal.example/llms.txt', 'http://site.example/go'];
  it.each(TWELVE)('%s → blocked_address, файл не загружен', async (target) => {
    site = await startFakeSite({ ...noRobots, '/go': redirect('http://127.0.0.1/llms-full.txt'), '/llms-full.txt': md('# x\n' + 'текст '.repeat(100)) },
      { 'internal.example': ['10.0.0.5'] });
    expect(await reason(get(target))).toBe('blocked_address');
    expect(site.dials.every((ip) => ip === PUBLIC_IP)).toBe(true);
    expect(site.requests.map((r) => r.path)).not.toContain('/llms-full.txt');
  });
  it('форма адреса: не http(s), порт не 80/443, учётные данные — отказ без DNS и соединений', async () => {
    site = await startFakeSite({ ...noRobots });
    for (const url of ['ftp://site.example/llms.txt', 'file:///etc/passwd', 'http://site.example:8080/llms.txt', 'http://user:pw@site.example/llms.txt']) {
      expect(await reason(get(url)), url).toBe('blocked_address');
    }
    expect(site.resolved).toEqual([]);
    expect(site.dials).toEqual([]);
  });
  it('robots.txt запрещает путь → robots_disallowed, файл не запрошен; robots недоступен (5xx) → unreachable', async () => {
    site = await startFakeSite({ '/robots.txt': text('User-agent: *\nDisallow: /llms'), '/llms-full.txt': md('# x\nтекст') });
    expect(await reason(get(FILE))).toBe('robots_disallowed');
    expect(site.requests.map((r) => r.path)).toEqual(['/robots.txt']);
    await site.close();
    site = await startFakeSite({ '/robots.txt': text('сбой', 'text/plain', 503), '/llms-full.txt': md('# x\nтекст') });
    expect(await reason(get(FILE))).toBe('unreachable');
    expect(site.requests.map((r) => r.path)).toEqual(['/robots.txt']);
  });
  it('перенаправление на путь, запрещённый robots, — robots_disallowed; на другой сайт — unreachable без соединения', async () => {
    site = await startFakeSite({ '/robots.txt': text('User-agent: *\nDisallow: /private'), '/llms-full.txt': redirect('/private/full.txt'),
      '/private/full.txt': md('# x\nтекст'), '/away.txt': redirect('http://other.example/llms.txt') }, { 'other.example': [PUBLIC_IP] });
    expect(await reason(get(FILE))).toBe('robots_disallowed');
    expect(site.requests.map((r) => r.path)).not.toContain('/private/full.txt');   // запрещённый путь не запрошен
    expect(await reason(get('http://site.example/away.txt'))).toBe('unreachable');
    expect(site.requests.map((r) => r.host)).not.toContain('other.example');
  });
  it('HTML вместо текста (text/html) → not_text без чтения тела; text/plain с HTML внутри → not_text; json → not_text', async () => {
    site = await startFakeSite({ ...noRobots, '/llms-full.txt': html('<!doctype html><html><body>' + 'страница '.repeat(1000) + '</body></html>'),
      '/fake.txt': md('<!DOCTYPE html>\n<html><body>SPA</body></html>', 'text/plain; charset=utf-8'), '/data.json': md('{"a":1}', 'application/json') });
    expect(await reason(get(FILE))).toBe('not_text');
    expect(await reason(get('http://site.example/fake.txt'))).toBe('not_text');
    expect(await reason(get('http://site.example/data.json'))).toBe('not_text');
  });
  it(`размер: ровно ${TEXT_MAX_BYTES} байт — принят; +1 байт (заявлен) и +1 байт без Content-Length (поток) — too_large`, async () => {
    const exact = Buffer.alloc(TEXT_MAX_BYTES, 0x61);
    exact.write('# Раздел\n', 0, 'utf8');
    const over = Buffer.concat([exact, Buffer.from('a')]);
    site = await startFakeSite({ ...noRobots,
      '/exact.txt': (_q, r) => { r.writeHead(200, { 'content-type': 'text/plain', 'content-length': String(exact.length) }); r.end(exact); },
      '/over.txt': (_q, r) => { r.writeHead(200, { 'content-type': 'text/plain', 'content-length': String(over.length) }); r.end(over); },
      '/stream.txt': (_q, r) => { r.writeHead(200, { 'content-type': 'text/plain' }); for (let i = 0; i < over.length; i += 65536) r.write(over.subarray(i, i + 65536)); r.end(); } });
    const ok = await get('http://site.example/exact.txt');
    expect(ok.bytes).toBe(TEXT_MAX_BYTES);
    expect(ok.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(await reason(get('http://site.example/over.txt'))).toBe('too_large');
    expect(await reason(get('http://site.example/stream.txt'))).toBe('too_large');
  });
  it('404 → unreachable; принятый файл: пауза между запросами, User-Agent продукта, Host — имя сайта', async () => {
    site = await startFakeSite({ ...noRobots, '/llms-full.txt': md('# Цены\n' + 'Доставка по Москве — 300 ₽. '.repeat(20)) });
    expect(await reason(get('http://site.example/missing.txt'))).toBe('unreachable');
    const file = await get(FILE);
    expect(file.text.startsWith('# Цены')).toBe(true);
    expect(file.requests).toBe(2);   // robots.txt + файл
    expect(site.requests.every((r) => r.userAgent === UA && r.host === 'site.example')).toBe(true);
  });
});

describe('маршрут POST /api/bots/{id}/sources с kind: text (AC-6)', () => {
  const ORIGIN = 'https://sufler.example', BOT = '33333333-3333-4333-8333-333333333333', ACCOUNT = '11111111-1111-4111-8111-111111111111';
  const KEY = '44444444-4444-4444-8444-444444444444';
  function deps(calls: unknown[], over: Partial<CabinetDependencies> = {}): CabinetDependencies {
    const touch = (name: string) => async () => { calls.push(name); throw new Error(`${name} не должен вызываться`); };
    return {
      publicOrigin: ORIGIN, authenticate: async () => ({ account_id: ACCOUNT }), allowMutation: async () => true,
      listBots: touch('list'), createBot: touch('create'), newPublicKey: () => 'k', updateSettings: touch('update'), addOrigin: touch('origin'),
      checkAddress: async (url) => { calls.push(['check', url]); return { url: new URL(url) }; }, ownsBot: async () => true,
      createSite: async (input) => { calls.push(['create', input]); return { kind: 'created', indexJobId: '55555555-5555-4555-8555-555555555555' }; },
      findJob: async () => null, reindex: touch('reindex'), deleteSource: touch('delete'),
      enqueue: async () => { calls.push('enqueue'); }, answer: touch('answer'), setVerified: touch('verify'), publish: touch('publish'), summary: touch('summary'),
      log: () => {}, ...over,
    };
  }
  const post = (body: unknown) => new Request(`${ORIGIN}/api/bots/${BOT}/sources`, { method: 'POST', body: JSON.stringify(body), headers: {
    origin: ORIGIN, 'content-type': 'application/json', 'idempotency-key': KEY, cookie: `__Host-n6_session=${'A'.repeat(43)}`, 'x-forwarded-for': '93.184.1.7' } });
  it('{ url, kind: text } → CheckAddress ДО записи, источник text, 202 с index_job_id; без kind — сайт, как раньше', async () => {
    const calls: unknown[] = [];
    const r = await createSiteSourceHandler(deps(calls))(post({ url: 'site.example/llms-full.txt#x', kind: 'text' }), BOT);
    expect(r.status).toBe(202);
    expect(calls[0]).toEqual(['check', 'https://site.example/llms-full.txt#x']);
    expect(calls[1]).toEqual(['create', { accountId: ACCOUNT, botId: BOT, rootUrl: 'https://site.example/llms-full.txt', idempotencyKey: KEY, kind: 'text' }]);
    const site: unknown[] = [];
    await createSiteSourceHandler(deps(site))(post({ url: 'site.example' }), BOT);
    expect(site[1]).toEqual(['create', { accountId: ACCOUNT, botId: BOT, rootUrl: 'https://site.example/', idempotencyKey: KEY }]);
  });
  it('неизвестный kind, pdf и лишнее поле — 400 до CheckAddress и записи', async () => {
    for (const body of [{ url: 'a.ru/x.txt', kind: 'TEXT' }, { url: 'a.ru/x.txt', kind: 'pdf' }, { url: 'a.ru/x.txt', kind: null }, { url: 'a.ru/x.txt', kind: 'text', extra: 1 }]) {
      const calls: unknown[] = [];
      expect((await createSiteSourceHandler(deps(calls))(post(body), BOT)).status, JSON.stringify(body)).toBe(400);
      expect(calls).toEqual([]);
    }
  });
  it('адрес во внутреннюю сеть — 422 blocked_address, записи нет', async () => {
    const calls: unknown[] = [];
    const r = await createSiteSourceHandler(deps(calls, { checkAddress: async () => { throw new AddressRefusal('blocked_address'); } }))(
      post({ url: 'http://127.0.0.1/llms.txt', kind: 'text' }), BOT);
    expect(r.status).toBe(422);
    expect(calls.filter((c) => Array.isArray(c) && c[0] === 'create')).toEqual([]);
  });
});
