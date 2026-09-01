// Кабинет: изоляция арендаторов, регистрация, точки, ссылки.

import { afterAll, describe, expect, it } from 'vitest';

process.env.DATABASE_URL_OWNER = process.env.TEST_DATABASE_URL ?? '';

const { closePool } = await import('../src/db.js');
const { register, login, resolveSession, verifyPassword, hashPassword } = await import('../src/auth.js');
const { createPlace, setPlatformLink, listPlaces, listFeedback, validatePlatformUrl } = await import('../src/places.js');
const pgAdmin = new (await import('pg')).default.Pool({ connectionString: process.env.TEST_ADMIN_URL ?? '' });

afterAll(async () => { await pgAdmin.end(); await closePool(); });

const uniq = (() => { let n = 0; return (p: string) => `${p}-${process.pid}-${++n}`; })();

async function owner() {
  const email = `${uniq('own')}@test.ru`;
  const r = await register(email, 'пароль-восемь', 'Тест');
  if (!r.ok) throw new Error(r.error);
  return { email, token: r.token, accountId: r.accountId };
}

describe('регистрация и вход', () => {
  it('полный круг: регистрация → сессия → вход', async () => {
    const o = await owner();
    const s = await resolveSession(o.token);
    expect(s?.accountId).toBe(o.accountId);
    const l = await login(o.email, 'пароль-восемь');
    expect(l.ok).toBe(true);
  });

  it('неверный пароль и несуществующая почта неотличимы ПО ТЕЛУ', async () => {
    const o = await owner();
    const a = await login(o.email, 'не тот пароль');
    const b = await login(`${uniq('none')}@test.ru`, 'любой пароль');
    expect(a).toEqual(b);
  });

  it('страж: verify считается ВСЕГДА — раннего возврата до него нет', async () => {
    // Ранний возврат ломает ВРЕМЯ ответа, а не тело: ветка «почты нет» становится
    // заметно быстрее, и вход превращается в оракул существования почты. Тело при этом
    // одинаково, поэтому предыдущий тест мутацию НЕ ловил, а замер времени ненадёжен.
    // Стережём свойство по исходнику: коалесценция в заглушечный хеш обязана стоять
    // в вызове verify, и ни одного return между чтением owner и verify быть не должно.
    const { readFileSync } = await import('node:fs');
    const src = readFileSync(new URL('../src/auth.js', import.meta.url).pathname
      .replace('/auth.js', '/auth.ts'), 'utf8');
    expect(src).toMatch(/verifyPassword\(owner\?\.password_hash \?\? \(await dummyHash\(\)\)/);
    const between = src.slice(src.indexOf("select id, password_hash from owners"), src.indexOf('const ok = await verifyPassword'));
    expect(between, 'ранний возврат до verify — тайминг-оракул').not.toMatch(/return\s*\{/);
  });

  it('битый хеш в БД — отказ, а не 500', async () => {
    expect(await verifyPassword('мусор', 'пароль')).toBe(false);
    expect(await verifyPassword('', 'пароль')).toBe(false);
  });

  it('смена стоимости scrypt не ломает старые пароли: N зашит в хеш', async () => {
    const h = await hashPassword('секрет');
    expect(h).toMatch(/^scrypt\$16384\$/);
    expect(await verifyPassword(h, 'секрет')).toBe(true);
  });
});

describe('изоляция арендаторов — через кабинет', () => {
  it('владелец A не видит точек владельца B', async () => {
    const a = await owner(); const b = await owner();
    await createPlace(b.accountId, 'Точка B');
    const seen = await listPlaces(a.accountId);
    expect(seen.length).toBe(0);
  });

  it('A не может привязать ссылку к точке B — RLS, а не проверка в коде', async () => {
    const a = await owner(); const b = await owner();
    const pb = await createPlace(b.accountId, 'Точка B');
    if (!pb.ok) throw new Error(pb.error);
    const r = await setPlatformLink(a.accountId, pb.id, 'yandex_maps', 'https://yandex.ru/maps/org/x/');
    expect(r.ok).toBe(false);
  });

  it('A не читает обращения точки B', async () => {
    const a = await owner(); const b = await owner();
    const pb = await createPlace(b.accountId, 'Точка B');
    if (!pb.ok) throw new Error(pb.error);
    await pgAdmin.query(`insert into private_feedback (place_id, body) values ($1, 'секрет гостя B')`, [pb.id]);
    const rows = await listFeedback(a.accountId, pb.id);
    expect(rows.length).toBe(0);
  });
});

describe('точки и ссылки', () => {
  it('создание → в списке, счётчики нулевые', async () => {
    const o = await owner();
    const r = await createPlace(o.accountId, 'Моя точка');
    expect(r.ok).toBe(true);
    const list = await listPlaces(o.accountId);
    if (r.ok) expect(list.map((p) => p.slug)).toContain(r.slug);
    expect(list[0]?.feedback_count).toBe(0);
  });

  it('одинаковые названия у двух владельцев — ОБЕ точки создаются, адреса разные', async () => {
    // «Занято» не показывается никогда: коллизия решается случайным хвостом молча.
    const a = await owner(); const b = await owner();
    const rs = await Promise.all([
      createPlace(a.accountId, 'Кофейня Артель'), createPlace(b.accountId, 'Кофейня Артель'),
    ]);
    expect(rs.every((r) => r.ok)).toBe(true);
    const slugs = rs.map((r) => (r.ok ? r.slug : ''));
    expect(new Set(slugs).size).toBe(2);
    expect(slugs[0]).toContain('kofeynya-artel');
  });

  it('кривой ввод НЕ отвергается — нормализуется: кириллица, пробелы, регистр', async () => {
    const o = await owner();
    for (const name of ['КИРИЛЛИЦА', 'sp ace point', 'UPPER Case']) {
      const r = await createPlace(o.accountId, name);
      expect(r.ok, name).toBe(true);
      if (r.ok) expect(r.slug, name).toMatch(/^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/);
    }
  });

  it('ссылка чужого хоста отвергается ДО записи', () => {
    expect(validatePlatformUrl('yandex_maps', 'https://evil.ru/maps').ok).toBe(false);
    expect(validatePlatformUrl('yandex_maps', 'http://yandex.ru/maps/org/x/').ok).toBe(false);   // http
    expect(validatePlatformUrl('twogis', 'https://2gis.ru/firm/123').ok).toBe(true);
    expect(validatePlatformUrl('yandex_maps', 'https://yandex.ru.evil.com/x').ok).toBe(false);   // поддомен-обман
  });

  it('повторная вставка ссылки — замена, а не дубль', async () => {
    const o = await owner();
    const p = await createPlace(o.accountId, 'X');
    if (!p.ok) throw new Error(p.error);
    await setPlatformLink(o.accountId, p.id, 'twogis', 'https://2gis.ru/firm/1');
    await setPlatformLink(o.accountId, p.id, 'twogis', 'https://2gis.ru/firm/2');
    const list = await listPlaces(o.accountId);
    const links = list.find((x) => x.id === p.id)?.links ?? [];
    expect(links.length).toBe(1);
    expect(links[0]?.url).toContain('/firm/2');
  });
});

describe('транслитерация адреса', () => {
  it('русское название превращается в читаемый адрес', async () => {
    const { translit } = await import('../src/slug.js');
    expect(translit('Кофейня «Артель»')).toBe('kofeynya-artel');
    expect(translit('Щи & Борщи №1')).toBe('schi-borschi-1');
    expect(translit('  Пробелы   и   регистр  ')).toBe('probely-i-registr');
  });

  it('пустой остаток и резерв получают случайный хвост', async () => {
    const { slugCandidate, RESERVED } = await import('../src/slug.js');
    expect(slugCandidate('™!!')).toMatch(/^p-[0-9a-f]{4}$/);
    const api = slugCandidate('API');
    expect(RESERVED.has(api), api).toBe(false);
  });

  it('хвост коллизии СЛУЧАЙНЫЙ, а не «-2»: перебор соседей не подсказывается', async () => {
    const { slugCandidate } = await import('../src/slug.js');
    const a = slugCandidate('Артель', true);
    const b = slugCandidate('Артель', true);
    expect(a).not.toBe(b);
    expect(a).not.toMatch(/-2$/);
  });
});
