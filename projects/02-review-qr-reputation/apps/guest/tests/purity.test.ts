// T4 · Ответ гостевой поверхности зависит ТОЛЬКО от slug.
//
// Это обязательный критерий приёмки из постановки, дословно:
//   «Все посетители видят одинаковый путь к публичному отзыву, без предварительной
//    сортировки по ожидаемой тональности.»
//
// Проверяется прогоном, а не код-ревью: N запросов, различающихся ОДНИМ измерением
// каждый, обязаны дать побайтово совпадающее тело и одинаковый Location.
//
// Список нормализаций ПУСТ — страница не ставит cookie и не несёт инлайновых скриптов,
// значит нет ни nonce, ни CSRF-токена, и sha256 берётся с сырого тела. Это сильнее
// нормализации: нормализация есть то место, где страж однажды начнёт стирать настоящее
// различие.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';

process.env.SESSION_SECRET = 'test-secret-at-least-16-chars';
process.env.BASE_URL = 'https://reviewqr.test';
process.env.DATABASE_URL_RENDER = process.env.TEST_DATABASE_URL ?? '';

const { pool, closePool } = await import('../src/db.js');

// ОТДЕЛЬНОЕ соединение для подготовки данных, и это не удобство теста.
// Пул приложения работает под ролью app_render, которая по замыслу НЕ МОЖЕТ писать в
// places и accounts — первая же попытка дала permission denied. То есть сама невозможность
// подготовить фикстуру пулом приложения ПОДТВЕРЖДАЕТ границу, ради проверки которой
// написан этот файл. Фикстуры готовит суперпользователь, проверки идут под ролью.
const pgAdmin = new (await import('pg')).default.Pool({
  connectionString: process.env.TEST_ADMIN_URL ?? '',
});
const { server } = await import('../src/server.js');
const { buildDoors } = await import('../src/render.js');
const { invalidateChoicePage } = await import('../src/server.js');
const { deviceHash } = await import('../src/journal.js');

let base = '';
const SLUG = `t4-${process.pid}`;

beforeAll(async () => {
  await pgAdmin.query(
    `insert into accounts (id, name) values ('33333333-3333-3333-3333-333333333333','T4')
     on conflict do nothing`);
  const { rows } = await pgAdmin.query<{ id: string }>(
    `insert into places (account_id, slug, name) values
       ('33333333-3333-3333-3333-333333333333', $1, 'Кофейня «Артель»') returning id`, [SLUG]);
  const placeId = rows[0]!.id;
  for (const [p, k] of [['yandex_maps', 'review_form'], ['twogis', 'card']] as const) {
    await pgAdmin.query(
      'insert into platform_links (place_id, platform, url, link_kind) values ($1,$2,$3,$4)',
      [placeId, p, `https://example.test/${p}`, k]);
  }
  await new Promise<void>((r) => server.listen(0, () => r()));
  const a = server.address();
  base = `http://127.0.0.1:${typeof a === 'object' && a ? a.port : 0}`;
});

afterAll(async () => {
  await pgAdmin.query('delete from places where slug = $1', [SLUG]);
  await pgAdmin.end();
  server.close();
  await closePool();
});

/** Двенадцать измерений: каждое меняет ОДНО и обязано ничего не изменить в ответе. */
const VARIANTS: { name: string; path: string; headers: Record<string, string> }[] = [
  { name: 'базовый',           path: '', headers: {} },
  { name: '?rating=1',         path: '?rating=1', headers: {} },
  { name: '?rating=5',         path: '?rating=5', headers: {} },
  { name: '?sentiment=bad',    path: '?sentiment=bad', headers: {} },
  { name: 'cookie',            path: '', headers: { cookie: 'mood=angry; ab=B' } },
  { name: 'UA мобильный',      path: '', headers: { 'user-agent': 'Mozilla/5.0 (iPhone)' } },
  { name: 'UA десктопный',     path: '', headers: { 'user-agent': 'Mozilla/5.0 (Macintosh)' } },
  { name: 'UA пустой',         path: '', headers: { 'user-agent': '' } },
  { name: 'язык en',           path: '', headers: { 'accept-language': 'en-US,en' } },
  { name: 'язык ru',           path: '', headers: { 'accept-language': 'ru-RU,ru' } },
  { name: 'X-Forwarded-For A', path: '', headers: { 'x-forwarded-for': '10.1.1.1' } },
  { name: 'X-Forwarded-For B', path: '', headers: { 'x-forwarded-for': '203.0.113.9' } },
];

describe('T4 · страница выбора — чистая функция от slug', () => {
  it('двенадцать измерений дают ПОБАЙТОВО одинаковое тело', async () => {
    const seen = new Map<string, string[]>();
    for (const v of VARIANTS) {
      // КЭШ СБРАСЫВАЕТСЯ ПЕРЕД КАЖДЫМ ВАРИАНТОМ. Без этого страж слеп к
      // недетерминированности рендера: первый вызов кладёт страницу в кэш, остальные
      // одиннадцать получают ЕЁ ЖЕ и совпадают всегда — даже если порядок дверей
      // случайный. Проверено мутацией: со случайной сортировкой страж оставался зелёным.
      invalidateChoicePage(SLUG);
      const r = await fetch(`${base}/r/${SLUG}${v.path}`, { headers: v.headers });
      const sha = createHash('sha256').update(await r.text()).digest('hex');
      expect(r.status, v.name).toBe(200);
      (seen.get(sha) ?? seen.set(sha, []).get(sha)!).push(v.name);
    }
    expect(seen.size, `разошлись: ${[...seen.values()].map((g) => g.join('+')).join(' ≠ ')}`).toBe(1);
  });

  it('ответ не ставит cookie и не несёт инлайновых скриптов', async () => {
    const r = await fetch(`${base}/r/${SLUG}`);
    const body = await r.text();
    expect(r.headers.get('set-cookie')).toBeNull();
    expect(body).not.toMatch(/<script/i);
    expect(body).not.toMatch(/nonce=/);
    expect(r.headers.get('cache-control')).toBe('no-store');
  });
});

describe('T4b · редирект — чистая функция от пары (slug, platform)', () => {
  it('те же двенадцать измерений дают одинаковый Location', async () => {
    const locations = new Set<string>();
    for (const v of VARIANTS) {
      const r = await fetch(`${base}/go/${SLUG}/yandex_maps${v.path}`, {
        headers: v.headers, redirect: 'manual',
      });
      expect(r.status, v.name).toBe(302);
      locations.add(r.headers.get('location') ?? '');
    }
    expect(locations.size, `Location разошёлся: ${[...locations].join(' ≠ ')}`).toBe(1);
  });
});

describe('T5 · равновесность дверей', () => {
  it('приватная дверь — элемент того же множества, узлы неотличимы по разметке', async () => {
    const body = await (await fetch(`${base}/r/${SLUG}`)).text();
    const links = [...body.matchAll(/<a class="([^"]*)"/g)].map((m) => m[1]);
    expect(links.length).toBe(3);                       // две площадки + приватная
    expect(new Set(links).size, 'у дверей разные классы — появился вес').toBe(1);
    expect(body).not.toMatch(/<img/i);                  // растровых логотипов нет
    expect(body).not.toMatch(/fill="#/);                // цвет в значке = вес
  });

  it('число видимых дверей равно числу настроенных плюс приватная', async () => {
    const body = await (await fetch(`${base}/r/${SLUG}`)).text();
    expect((body.match(/class="door"/g) ?? []).length).toBe(3);
    expect(body).not.toMatch(/details|summary|Показать ещё|Other/i);  // ничего за раскрытием
  });
});

describe('T6 · до развилки нет ни одного виджета оценки', () => {
  it('на странице выбора нет звёзд, смайликов и вопроса об оценке', async () => {
    const body = await (await fetch(`${base}/r/${SLUG}`)).text();
    expect(body).not.toMatch(/★|☆|⭐|оцените|как всё прошло\?|поставьте оценку/i);
    expect(body).not.toMatch(/type="radio"|input/i);
  });
});

describe('T12 · в вычислении device_hash участвуют И place_id, И неделя', () => {
  it('разные точки дают РАЗНЫЕ хэши для одного устройства', () => {
    const a = deviceHash('s', 'place-A', '10.0.0.1', 'UA');
    const b = deviceHash('s', 'place-B', '10.0.0.1', 'UA');
    expect(a.equals(b), 'один телефон даёт одинаковый хэш в двух заведениях — сквозной трекер').toBe(false);
  });

  it('страж по исходнику: place_id стоит в сообщении HMAC', async () => {
    const { readFileSync } = await import('node:fs');
    const src = readFileSync(new URL('../src/journal.ts', import.meta.url), 'utf8');
    // Данными это НЕ ловится: без place_id числа метрики остаются ПРАВДОПОДОБНЫМИ,
    // ошибка не в величине, а в смысле. Поэтому страж смотрит в исходник.
    expect(src).toMatch(/\.update\(`\$\{placeId\}\|\$\{ip\}\|\$\{ua\}`\)/);
  });
});

describe('порядок дверей — детерминированная перестановка из slug', () => {
  it('одинаков между вызовами и различается между точками', () => {
    const links = [
      { platform: 'yandex_maps', url: 'u', link_kind: 'review_form' },
      { platform: 'twogis', url: 'u', link_kind: 'card' },
    ] as const;
    const k = (s: string) => buildDoors(s, links as never, 'https://x').map((d) => d.key).join(',');

    // ДВАДЦАТЬ вызовов, а не два. На трёх дверях случайная перестановка совпадает с
    // исходной примерно в одном случае из шести — два вызова этого не различают, и
    // первая редакция теста пропускала мутацию «сортировать случайно».
    const repeated = new Set(Array.from({ length: 20 }, () => k('alpha')));
    expect(repeated.size, 'порядок дверей недетерминирован — это скрытый A/B').toBe(1);

    const orders = new Set('abcdefghij'.split('').map(k));
    expect(orders.size, 'порядок одинаков у всех точек — площадка систематически первая').toBeGreaterThan(1);
  });
});
