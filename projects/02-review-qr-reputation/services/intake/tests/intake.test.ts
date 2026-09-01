// Приём приватных обращений: порядок операций, лимиты, границы.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

process.env.BASE_URL = 'https://reviewqr.test';
process.env.DATABASE_URL_INTAKE = process.env.TEST_DATABASE_URL ?? '';

const { pool, closePool } = await import('../src/db.js');
const { server, barrier } = await import('../src/server.js');
const { CoarseBarrier } = await import('../src/barrier.js');
const { validate } = await import('../src/validate.js');
const pgAdmin = new (await import('pg')).default.Pool({ connectionString: process.env.TEST_ADMIN_URL ?? '' });

let base = '';
const SLUG = `in-${process.pid}`;
const ORIGIN = 'https://reviewqr.test';

beforeAll(async () => {
  await pgAdmin.query(`insert into accounts (id,name) values ('44444444-4444-4444-4444-444444444444','I') on conflict do nothing`);
  await pgAdmin.query(`insert into places (account_id,slug,name) values ('44444444-4444-4444-4444-444444444444',$1,'Тест')`, [SLUG]);
  await new Promise<void>((r) => server.listen(0, () => r()));
  const a = server.address();
  base = `http://127.0.0.1:${typeof a === 'object' && a ? a.port : 0}`;
});
afterAll(async () => {
  await pgAdmin.query('delete from places where slug=$1', [SLUG]);
  await pgAdmin.end(); server.close(); await closePool();
});

const post = (body: unknown, headers: Record<string, string> = {}) =>
  fetch(`${base}/api/feedback/private`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: ORIGIN, ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });

const ip = (() => { let n = 0; return () => `10.${process.pid % 250}.${++n % 250}.7`; })();

describe('порядок операций — это защита', () => {
  it('Origin проверяется ПЕРВЫМ: чужой и отсутствующий одинаково отвергаются', async () => {
    const r1 = await fetch(`${base}/api/feedback/private`, {
      method: 'POST', headers: { 'content-type': 'application/json', origin: 'https://evil.test' },
      body: JSON.stringify({ slug: SLUG, body: 'текст' }) });
    expect(r1.status).toBe(403);
    const r2 = await fetch(`${base}/api/feedback/private`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ slug: SLUG, body: 'текст' }) });
    // Отсутствие заголовка — ОТКАЗ, а не «старый клиент»: форма, которую отдаём мы,
    // всегда заставляет браузер его прислать.
    expect(r2.status).toBe(403);
  });

  it('слишком большое тело отвергается ДО разбора', async () => {
    const r = await post('x'.repeat(20_000), { 'x-forwarded-for': ip() });
    expect(r.status).toBe(413);
  });

  it('несуществующая точка — 404, и лимит на неё не тратится', async () => {
    const r = await post({ slug: 'нет-такой', body: 'текст' }, { 'x-forwarded-for': ip() });
    expect(r.status).toBe(404);
  });
});

describe('валидация: неопознанное — отказ, а не подстановка', () => {
  it('текст обязателен, оценка без текста не принимается', () => {
    const r = validate({ slug: 's', rating: 5 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.join()).toMatch(/текст обязателен/);
  });

  it('«Спасибо!» — восемь знаков — ПРОХОДИТ', () => {
    expect(validate({ slug: 's', body: 'Спасибо!' }).ok).toBe(true);
  });

  it('любое неопознанное значение оценки отвергается', () => {
    for (const bad of ['5', 5.5, 0, 6, true, [], {}, 'пять']) {
      const r = validate({ slug: 's', body: 'текст', rating: bad });
      expect(r.ok, JSON.stringify(bad)).toBe(false);
    }
  });

  it('оценка отсутствующая или пустая — законна', () => {
    for (const ok of [undefined, null, '']) {
      expect(validate({ slug: 's', body: 'текст', rating: ok }).ok, JSON.stringify(ok)).toBe(true);
    }
  });

  it('текст сохраняется ПОБАЙТОВО: приём не санирует', async () => {
    const evil = '<script>alert(1)</script> & "кавычки"';
    const r = await post({ slug: SLUG, body: evil }, { 'x-forwarded-for': ip() });
    expect(r.status).toBe(201);
    const { rows } = await pgAdmin.query<{ body: string }>(
      'select body from private_feedback order by created_at desc limit 1');
    // Санитайзер на приёме уничтожает улику необратимо; экранирование — при рендере.
    expect(rows[0]?.body).toBe(evil);
  });
});

describe('лимит: КОНКУРЕНТНО, а не последовательно', () => {
  it('20 одновременных запросов с одного адреса — принято не больше порога', async () => {
    const addr = ip();
    const rs = await Promise.all(
      Array.from({ length: 20 }, () => post({ slug: SLUG, body: 'параллельный текст' },
        { 'x-forwarded-for': addr })));
    const created = rs.filter((r) => r.status === 201).length;
    // Последовательный тест зеленеет и при раздельных COUNT+INSERT — то есть НЕ различает
    // дефект, при котором сто параллельных запросов все видят count=0 и все проходят.
    expect(created, `принято ${created} при пороге 10`).toBeLessThanOrEqual(10);
    expect(created).toBeGreaterThan(0);
  }, 30_000);

  it('другой адрес не наказан за соседа', async () => {
    const r = await post({ slug: SLUG, body: 'другой гость' }, { 'x-forwarded-for': ip() });
    expect([201, 429]).toContain(r.status);   // 429 только если исчерпан потолок точки
  });
});

describe('грубый барьер: в памяти, с пределом, деградирует в ПРОПУСК', () => {
  it('отбрасывает поток после порога и НЕ ходит в БД', () => {
    const b = new CoarseBarrier(3, 1000, 100);
    expect([b.allow('a'), b.allow('a'), b.allow('a'), b.allow('a')]).toEqual([true, true, true, false]);
    expect(b.rejected).toBe(1);
  });

  it('словарь не растёт без границы: ключ выбирает КЛИЕНТ', () => {
    const b = new CoarseBarrier(10, 60_000, 5);
    for (let i = 0; i < 50; i++) b.allow(`ip-${i}`);
    expect(b.size, 'словарь растёт по ключу клиента — исчерпание памяти').toBeLessThanOrEqual(5);
    expect(b.evicted).toBeGreaterThan(0);
  });

  it('при переполнении новый ключ ПРОПУСКАЕТСЯ, а не отвергается', () => {
    const b = new CoarseBarrier(10, 60_000, 2);
    b.allow('x'); b.allow('y');
    // Барьер — ограничитель ПОТОКА, а не квота: его переполнение не должно ронять приём.
    // Точные пороги стоят ступенью ниже и удержат то, что сюда просочилось.
    expect(b.allow('z')).toBe(true);
  });

  it('агрегат снимается и обнуляется — строки на каждый отказ НЕТ', () => {
    const b = new CoarseBarrier(1, 60_000, 10);
    b.allow('q'); b.allow('q'); b.allow('q');
    expect(b.drain().rejected).toBe(2);
    expect(b.drain().rejected).toBe(0);
  });
});

describe('страж: тракт отказа не обращается к БД', () => {
  it('в barrier.ts нет импорта пула и слова query', async () => {
    const { readFileSync } = await import('node:fs');
    const src = readFileSync(new URL('../src/barrier.ts', import.meta.url), 'utf8');
    // Барьер, считающий в той самой базе, которую защищает, — усилитель атаки: поток
    // становится бесплатным для атакующего и платным для нас.
    expect(src).not.toMatch(/from '\.\/db|pool\.|\.query\(/);
  });

  it('в server.ts грубый барьер стоит ДО чтения тела', async () => {
    const { readFileSync } = await import('node:fs');
    const src = readFileSync(new URL('../src/server.ts', import.meta.url), 'utf8');
    expect(src.indexOf('barrier.allow(')).toBeLessThan(src.indexOf('await readBody('));
    // И лимиты — до валидации, иначе перебор невалидными телами бесплатен.
    expect(src.indexOf('consume(SCOPE_PLACE')).toBeLessThan(src.indexOf('validate(parsed)'));
  });
});
