// public-page-and-summary без БД: слаг демо-страницы, закрытая форма прихода `?from=` и cookie прихода, ссылка бейджа на
// демо-странице, middleware лендинга, запись прихода только при регистрации и только из cookie. SQL — public-page.integration.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { newPublicSlug, slugBase, PUBLIC_SLUG } from '../packages/db/src/public-page';
import { ARRIVAL } from '../packages/db/src/growth';
import { ARRIVAL_COOKIE, arrivalCookie, arrivalSetCookie, arrivalSlug, parseArrival, readArrivalCookie } from '../apps/web/src/lib/arrival';
import { badgeHref } from '../apps/web/src/lib/badge-required';
import { createArrivalRecorder } from '../apps/web/src/server/route';
import { createAuthHandler } from '../apps/web/src/server/auth-handler';
import type { AuthService } from '../apps/web/src/server/auth';
import { publicPageMetadata } from '../apps/web/src/app/b/[slug]/PublicPageView';
import { checkOrigin, requestOrigin } from '../apps/web/src/server/check-origin';

const PUBLIC = 'https://sufler.test.invalid';
const ACCOUNT = '11111111-1111-4111-8111-111111111111';

describe('слаг демо-страницы', () => {
  it('транслит имени + 4 символа, только [a-z0-9-], ≤ 60; пустое имя — «bot»', () => {
    expect(slugBase('Стоматология «Улыбка»')).toBe('stomatologiya-ulybka');
    expect(slugBase('  Щи & Борщ №1 ')).toBe('schi-borsch-1');
    expect(slugBase('«»')).toBe('bot');
    expect(slugBase('Ё'.repeat(80)).length).toBeLessThanOrEqual(50);
    const slug = newPublicSlug('Пекарня «Колос»', () => Buffer.from([0, 1, 35, 36]));
    expect(slug).toBe('pekarnya-kolos-ab9a');
    for (const name of ['Пекарня', 'x', '---', 'Ё'.repeat(200), 'Shop.Example 24/7']) expect(newPublicSlug(name), name).toMatch(PUBLIC_SLUG);
  });
});

describe('приход по бейджу / демо-странице (FR-GROWTH-003/006)', () => {
  const good = ['shop.example', 'www.shop.example', 'xn--80ajpngj0i.xn--p1ai', 'b/kolos-ab12'];
  const bad = [undefined, null, 42, ['shop.example'], '', 'Shop.Example', 'shop', 'http://shop.example', 'shop.example/path', 'shop.example:8080',
    'b/AB', 'b/x', 'b/../../etc', '-bad.example', 'bad-.example', 'shop..example', '<script>.example', 'a'.repeat(254), 'пекарня.рф'];
  it('принимается только закрытая форма, без нормализации; та же форма в коде БД', () => {
    for (const v of good) { expect(parseArrival(v), v).toBe(v); expect(ARRIVAL.test(v), v).toBe(true); }
    for (const v of bad) expect(parseArrival(v), JSON.stringify(v)).toBeNull();
    expect([arrivalSlug('b/kolos-ab12'), arrivalSlug('shop.example')]).toEqual(['kolos-ab12', null]);
  });
  it('cookie прихода: HttpOnly, Secure, Lax, 7 суток; чтение отвергает подмену', () => {
    expect(arrivalCookie('b/kolos-ab12')).toBe(`${ARRIVAL_COOKIE}=b%2Fkolos-ab12; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=604800`);
    expect(readArrivalCookie(`a=1; ${ARRIVAL_COOKIE}=b%2Fkolos-ab12`)).toBe('b/kolos-ab12');
    for (const raw of ['Evil.Example', '%E0%A4%A', 'http%3A%2F%2Fx.example', '']) expect(readArrivalCookie(`${ARRIVAL_COOKIE}=${raw}`), raw).toBeNull();
    expect(readArrivalCookie(null)).toBeNull();
  });
  // middleware импортирует next/server — его глобальные типы ломают проверку типов тестов; решение вынесено в чистую
  // функцию, а привязка middleware к ней и к пути `/` проверяется по исходнику.
  it('решение middleware: годный from — cookie; мусор и отсутствие — ничего; matcher — только `/`', () => {
    expect(arrivalSetCookie(new URL(`${PUBLIC}/?from=shop.example&utm_source=badge`))).toContain(`${ARRIVAL_COOKIE}=shop.example;`);
    for (const from of ['Evil', 'javascript:alert(1)', '']) expect(arrivalSetCookie(new URL(`${PUBLIC}/?from=${encodeURIComponent(from)}`)), from).toBeNull();
    expect(arrivalSetCookie(new URL(PUBLIC))).toBeNull();
    const source = readFileSync('apps/web/src/middleware.ts', 'utf8');
    expect(source).toContain("export const config = { matcher: '/' };");
    expect(source).toContain('arrivalSetCookie(request.nextUrl)');
  });
  it('запись прихода: аккаунт — из выданной сессии, значение — из cookie; без cookie и без сессии — ничего', async () => {
    const recorded: unknown[] = [];
    const recorder = createArrivalRecorder({ authenticate: async (t) => (t === 'T' ? { account_id: ACCOUNT } : null),
      record: async (...args) => { recorded.push(args); return true; } });
    await recorder(new Request(PUBLIC, { headers: { cookie: `${ARRIVAL_COOKIE}=shop.example` } }), 'T');
    await recorder(new Request(PUBLIC), 'T');
    await recorder(new Request(PUBLIC, { headers: { cookie: `${ARRIVAL_COOKIE}=shop.example` } }), 'other');
    await recorder(new Request(PUBLIC, { headers: { cookie: `${ARRIVAL_COOKIE}=Bad` } }), 'T');
    expect(recorded).toEqual([[ACCOUNT, 'shop.example']]);
  });
  it('обработчик авторизации зовёт запись прихода только при регистрации; её сбой регистрацию не валит', async () => {
    const auth = { register: async () => 'T', registerWithCode: async () => 'T', login: async () => 'T', logout: async () => {}, authenticate: async () => null } as unknown as AuthService;
    const calls: string[] = [];
    const run = (action: 'login' | 'register', fail = false) => createAuthHandler(action, { auth, publicOrigin: PUBLIC, allowMutation: async () => true,
      recordArrival: async () => { calls.push(action); if (fail) throw new Error('БД недоступна'); } })(new Request(`${PUBLIC}/api/auth/${action}`, {
      method: 'POST', headers: { 'content-type': 'application/json', origin: PUBLIC, 'x-forwarded-for': '93.184.216.9' }, body: JSON.stringify({ email: 'u@example.org', password: 'long-password' }) }));
    expect((await run('login')).status).toBe(200);
    expect((await run('register')).status).toBe(200);
    expect((await run('register', true)).status).toBe(200);
    expect(calls).toEqual(['register', 'register']);
  });
});

describe('SC-US-013-2: индексация демо-страницы только по явному флагу', () => {
  it('без флага и для несуществующей — noindex, nofollow; с флагом — index', () => {
    expect(publicPageMetadata({ companyName: 'Колос', indexable: false }).robots).toEqual({ index: false, follow: false });
    expect(publicPageMetadata(null).robots).toEqual({ index: false, follow: false });
    expect(publicPageMetadata({ companyName: 'Колос', indexable: true })).toEqual({ title: 'Колос — чат с ИИ-помощником', robots: { index: true, follow: true } });
  });
});

describe('источник запроса виджета с демо-страницы (A-N6-038 (6))', () => {
  it('без Origin: только Sec-Fetch-Site: same-origin даёт N6_PUBLIC_ORIGIN; явный Origin главнее; иначе — отказ', () => {
    const h = (init: Record<string, string>) => new Headers(init);
    expect(requestOrigin(h({ 'sec-fetch-site': 'same-origin' }), `${PUBLIC}/`)).toBe(PUBLIC);
    expect(requestOrigin(h({ 'sec-fetch-site': 'same-origin' }))).toBeNull();
    for (const site of ['cross-site', 'same-site', 'none', 'Same-Origin', '']) expect(requestOrigin(h({ 'sec-fetch-site': site }), PUBLIC), site).toBeNull();
    expect(requestOrigin(h({}), PUBLIC)).toBeNull();
    expect(requestOrigin(h({ origin: 'https://shop.example', 'sec-fetch-site': 'same-origin' }), PUBLIC)).toBe('https://shop.example');
    // Дальше — прежнее правило: свой origin пропускается только при public_enabled.
    expect(checkOrigin(requestOrigin(h({ 'sec-fetch-site': 'same-origin' }), PUBLIC), { origins: [], publicEnabled: false }, PUBLIC)).toBeNull();
    expect(checkOrigin(requestOrigin(h({ 'sec-fetch-site': 'same-origin' }), PUBLIC), { origins: [], publicEnabled: true }, PUBLIC)).toBe(PUBLIC);
  });
});

// Ревью фичи 13, находка 4: браузерный набор рендерит демо-страницу оснасткой, а не маршрутом Next — связь настоящего
// page.tsx с проверенными частями стережётся по исходнику (комментарии вырезаются: смотрим на код).
describe('стражи по исходнику: настоящая /b/{slug} и кнопка «Поделиться»', () => {
  const code = (path: string) => readFileSync(path, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
  it('page.tsx: 404 через notFound, метаданные из publicPageMetadata, тег виджета с data-bot и data-open, просмотр пишется', () => {
    const page = code('apps/web/src/app/b/[slug]/page.tsx');
    expect(page).toMatch(/if \(!page\) notFound\(\);/);
    expect(page).toMatch(/return publicPageMetadata\(await load\(/);
    expect(page).toMatch(/<script src=\{`\/w\/\$\{bundle\}`\} data-bot=\{page\.publicKey\} data-open="true" async \/>/);
    expect(page).toMatch(/recordPublicPageView\(/);
  });
  it('PreviewScreen: «Поделиться» гасит кнопку сразу и ждёт запись клика не дольше таймаута', () => {
    const screen = code('apps/web/src/app/preview/[jobId]/PreviewScreen.tsx');
    const share = screen.slice(screen.indexOf('const share = useCallback'), screen.indexOf('if (gone)'));
    expect(share.indexOf('setSaving(true)')).toBeGreaterThan(-1);
    expect(share.indexOf('setSaving(true)')).toBeLessThan(share.indexOf('await fetch('));
    expect(share).toMatch(/setTimeout\(\(\) => controller\.abort\(\), SHARE_TIMEOUT_MS\)/);
    expect(share).toMatch(/signal: controller\.signal/);
  });
});

describe('ссылка бейджа на демо-странице (A-N6-038 (3))', () => {
  it('свой origin и слаг — from=b/<slug>; чужой origin — домен хозяина; свой без слага — домен', () => {
    expect(badgeHref(PUBLIC, PUBLIC, 'kolos-ab12')).toBe(`${PUBLIC}/?from=b%2Fkolos-ab12&utm_source=badge`);
    expect(badgeHref(PUBLIC, 'https://shop.example', 'kolos-ab12')).toBe(`${PUBLIC}/?from=shop.example&utm_source=badge`);
    expect(badgeHref(PUBLIC, PUBLIC, null)).toBe(`${PUBLIC}/?from=sufler.test.invalid&utm_source=badge`);
  });
});
