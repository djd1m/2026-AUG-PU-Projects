// FR-011 — партнёрский кабинет.
//
// Четыре ревизии документов ушли на то, чтобы критерии стали разборчивыми. У каждого теста
// ниже — строка «падает при»: если её вырезать, тест обязан покраснеть.

import { afterAll, describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

const DB_URL = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
if (!DB_URL) throw new Error('TEST_DATABASE_URL не задан');
process.env.DATABASE_URL = DB_URL;
process.env.SESSION_SECRET = 'test-secret-at-least-16-chars-long';
process.env.BASE_URL = 'https://proofwall.test';

const { withService, closePool, rateLimit } = await import('@proofwall/db');
const { hashKey } = await import('../src/lib/login');
const {
  issuePartnerCode, revokePartnerCode, rotateDashboardToken, getPartnerCohortDashboardById,
} = await import('../src/lib/partner');
const {
  resolvePartner, hashPartnerToken, PARTNER_IP_SCOPE, PARTNER_IP_THRESHOLD, PARTNER_WINDOW,
} = await import('../src/lib/partner-auth');
const { POST } = await import('../src/app/api/partner/session/route');

afterAll(async () => { await closePool(); });

const SRC = path.resolve(__dirname, '../src');
const strip = (c: string) => c.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const read = (rel: string) => strip(readFileSync(path.resolve(SRC, rel), 'utf8'));
function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const e of readdirSync(dir)) {
    const full = path.join(dir, e);
    if (statSync(full).isDirectory()) out.push(...sourceFiles(full));
    else if (/\.tsx?$/.test(full)) out.push(full);
  }
  return out;
}

let seq = 0;
const RUN = `${process.pid}-${Date.now().toString(36)}`;
/** Уникально МЕЖДУ прогонами: счётчик по адресу живёт час и между наборами не чистится. */
const ip = () => { seq += 1; return `partner-${RUN}-${seq}`; };

interface Partner { id: string; code: string; token: string; }

async function makePartner(name = 'Партнёр'): Promise<Partner> {
  seq += 1;
  const r = await withService((c) => issuePartnerCode(c, `${name}${seq}`, { actorId: 'test' }));
  return { id: r.id, code: r.code, token: r.dashboard_token };
}

/** Наполняет когорту: N регистраций, из них C оплативших с суммой каждая. */
async function seedCohort(partnerId: string, signups: number, conversions: number, amount: number) {
  await withService(async (c) => {
    for (let i = 0; i < signups; i += 1) {
      const acc = await c.query<{ id: string }>(
        "insert into accounts (email, password_hash) values ($1, 'x') returning id",
        [`cohort-${RUN}-${partnerId.slice(0, 8)}-${i}@example.com`]);
      const status = i < conversions ? 'converted' : 'pending';
      const ra = await c.query<{ id: string }>(
        `insert into referral_attributions (account_id, partner_code_id, source, status)
         values ($1, $2, 'cookie', $3) returning id`,
        [acc.rows[0]!.id, partnerId, status]);
      if (i < conversions) {
        await c.query(
          `insert into commissions (referral_attribution_id, payment_event_id, amount)
           values ($1, $2, $3)`,
          [ra.rows[0]!.id, `pay-${RUN}-${partnerId.slice(0, 8)}-${i}`, amount]);
      }
    }
  });
}

const resolve = (token: string, addr = ip()) =>
  withService((c) => resolvePartner(c, token, addr));

// ─────────────────────────────────────────────────────────────────────────────
describe('AC-011.1 / AC-011.2 — кабинет показывает СВОИ числа и только их', () => {
  it('изоляция на двух партнёрах с РАЗНЫМИ ненулевыми числами', async () => {
    const a = await makePartner('А');
    const b = await makePartner('Б');
    await seedCohort(a.id, 3, 1, 100);
    await seedCohort(b.id, 7, 5, 900);

    const auth = await resolve(a.token);
    expect(auth.ok).toBe(true);
    if (!auth.ok) return;
    expect(auth.partnerCodeId).toBe(a.id);

    const data = await withService((c) => getPartnerCohortDashboardById(c, auth.partnerCodeId));
    expect(data).not.toBeNull();
    // Падает при: убрать `where partner_code_id = $1` из любого из трёх запросов.
    // На ОДНОМ партнёре или на пустой базе та же мутация прошла бы незаметно.
    expect(data!.cohort.signups, 'видны чужие регистрации').toBe(3);
    expect(data!.cohort.conversions, 'видны чужие конверсии').toBe(1);
    expect(data!.cohort.total_commission, 'видны чужие начисления').toBe(100);
  });
});

describe('AC-011.16 / AC-011.17 — публичный код кабинета НЕ открывает', () => {
  it('код из реферальной ссылки, предъявленный как ключ, не подходит', async () => {
    const p = await makePartner();
    // Ровно та атака, ради предотвращения которой написана вся фича:
    // curl -b 'pw_partner=<код из реферальной ссылки>'.
    // Падает при: положить в cookie code или id вместо токена.
    expect((await resolve(p.code)).ok, 'публичный код открыл кабинет').toBe(false);
    expect((await resolve(p.id)).ok, 'идентификатор партнёра открыл кабинет').toBe(false);
  });

  it('выданный токен не равен коду и не выводится из него', async () => {
    const p = await makePartner();
    expect(p.token).not.toBe(p.code);
    expect(p.token.length).toBeGreaterThan(30);
    expect(p.token).not.toContain(p.code);
  });
});

describe('AC-011.5 / AC-011.6 — отказы неразличимы, отзыв действует немедленно', () => {
  it('неизвестный, отозванный и мусорный ключ дают ОДИН ответ', async () => {
    const revoked = await makePartner();
    await withService((c) => revokePartnerCode(c, revoked.code, 'test'));

    const answers = await Promise.all([
      resolve('совершенно-неизвестный-ключ'),
      resolve(revoked.token),
      resolve(''),
      resolve('!!мусор!!'),
    ]);
    // Падает при: вернуть «код отозван» отдельным ответом.
    for (const a of answers) {
      expect(a).toEqual({ ok: false, tooMany: false });
    }
  });

  it('отзыв ПОСЛЕ выдачи cookie закрывает кабинет при следующем показе', async () => {
    const p = await makePartner();
    expect((await resolve(p.token)).ok).toBe(true);
    await withService((c) => revokePartnerCode(c, p.code, 'test'));
    // Падает при: проверять статус только при входе, а не на каждом обращении.
    expect((await resolve(p.token)).ok, 'отозванный код всё ещё открывает кабинет').toBe(false);
  });
});

describe('AC-011.7 — в БД лежит ХЕШ, а не токен', () => {
  it('исходное значение не встречается в строке партнёра', async () => {
    const p = await makePartner();
    const { rows } = await withService((c) =>
      c.query<{ h: string | null }>('select dashboard_token_hash as h from partner_codes where id = $1', [p.id]));
    // Падает при: сохранить токен как есть.
    expect(rows[0]!.h).not.toBe(p.token);
    expect(rows[0]!.h).toBe(hashPartnerToken(p.token));
    expect(rows[0]!.h).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('AC-011.22 / AC-011.24 — ротация в ТОЙ ЖЕ строке отбирает прежний доступ', () => {
  it('код не меняется, когорта цела, старый токен мёртв', async () => {
    const p = await makePartner();
    await seedCohort(p.id, 4, 2, 50);

    const fresh = await withService((c) => rotateDashboardToken(c, p.code));
    expect(fresh).toBeTruthy();

    // Падает при: перевыпускать код — когорта разрезалась бы надвое.
    const { rows } = await withService((c) =>
      c.query<{ id: string }>('select id from partner_codes where code = $1', [p.code]));
    expect(rows[0]!.id, 'ротация создала НОВУЮ строку — начисления остались у старой').toBe(p.id);

    // Падает при: не проверять хеш на каждом обращении.
    expect((await resolve(p.token)).ok, 'прежний токен всё ещё работает').toBe(false);
    const after = await resolve(fresh!);
    expect(after.ok, 'новый токен не работает').toBe(true);
    if (after.ok) {
      const data = await withService((c) => getPartnerCohortDashboardById(c, after.partnerCodeId));
      expect(data!.cohort.signups, 'когорта потеряна при ротации').toBe(4);
    }
  });
});

describe('AC-011.25 — ставка по умолчанию, а не NULL', () => {
  it('код без явной ставки получает дефолт схемы', async () => {
    const p = await makePartner();
    const { rows } = await withService((c) =>
      c.query<{ r: string | null }>('select commission_rate::text as r from partner_codes where id = $1', [p.id]));
    // Падает при: `options.commissionRate ?? null` — явный NULL отменяет default колонки,
    // и тогда commissions не создаются вовсе, а кабинет показывает ноль каждому навсегда.
    expect(rows[0]!.r, 'ставка пуста — начислений не будет никогда').not.toBeNull();
    expect(Number(rows[0]!.r)).toBeGreaterThan(0);
  });

  it('явно заданная ставка сохраняется', async () => {
    seq += 1;
    const r = await withService((c) =>
      issuePartnerCode(c, `Явная${seq}`, { actorId: 'test', commissionRate: 0.15 }));
    const { rows } = await withService((c) =>
      c.query<{ r: string }>('select commission_rate::text as r from partner_codes where id = $1', [r.id]));
    expect(Number(rows[0]!.r)).toBeCloseTo(0.15, 4);
  });
});

describe('AC-011.11 / AC-011.12 / AC-011.27 — лимит считает НЕУДАЧИ, успех бюджет не тратит', () => {
  it('одна неудача = +1 по адресу; успех не пишет ничего', async () => {
    const p = await makePartner();
    const addr = ip();
    const key = hashKey(PARTNER_IP_SCOPE, addr);
    const count = () => withService((c) => rateLimit.count(PARTNER_IP_SCOPE, key, PARTNER_WINDOW, c));

    const before = await count();
    await resolve('неверный-ключ', addr);
    expect(await count() - before, 'неудача не записана').toBe(1);

    const mid = await count();
    await resolve(p.token, addr);
    // Падает при: писать счётчик всегда. Партнёр, открывший кабинет 30 раз за час,
    // запирал бы себя сам — ровно то, что NFR-009.4 входа запрещает.
    expect(await count() - mid, 'успешное открытие потратило бюджет').toBe(0);
  });

  it(`${PARTNER_IP_THRESHOLD} неудач с одного адреса → tooMany`, async () => {
    const addr = ip();
    for (let i = 0; i < PARTNER_IP_THRESHOLD; i += 1) await resolve(`мимо-${i}`, addr);
    const r = await resolve('ещё-мимо', addr);
    // Падает при: убрать rateLimit.exceeded.
    expect(r).toEqual({ ok: false, tooMany: true });
  });

  it('успешный партнёр не заперт чужим исчерпанием с ДРУГОГО адреса', async () => {
    const p = await makePartner();
    const busy = ip();
    for (let i = 0; i < PARTNER_IP_THRESHOLD; i += 1) await resolve(`мимо-${i}`, busy);
    expect((await resolve(p.token, ip())).ok).toBe(true);
  });
});

describe('AC-011.14 — «нет данных» отличается от «ноль процентов»', () => {
  it('партнёр без регистраций: conversion_rate = null, не 0', async () => {
    const p = await makePartner();
    const data = await withService((c) => getPartnerCohortDashboardById(c, p.id));
    // Падает при: conversions / (signups || 1).
    expect(data!.cohort.conversion_rate).toBeNull();
    expect(data!.cohort.signups).toBe(0);
  });
});

describe('AC-011.19 — issuePartnerCode сохранил ШЕСТЬ свойств', () => {
  it('сигнатура, id, audit_log, ставка, владелец, явный отказ при исчерпании', async () => {
    seq += 1;
    const owner = await withService((c) =>
      c.query<{ id: string }>("insert into accounts (email, password_hash) values ($1,'x') returning id",
        [`owner-${RUN}-${seq}@example.com`]));
    const r = await withService((c) =>
      issuePartnerCode(c, `Полный${seq}`, {
        actorId: 'admin-1', ownerAccountId: owner.rows[0]!.id, commissionRate: 0.2,
      }));
    expect(r.id, 'возврат id потерян — восемь вызовов деструктурируют его').toBeTruthy();
    expect(r.code).toBeTruthy();
    expect(r.dashboard_token).toBeTruthy();

    const { rows } = await withService((c) =>
      c.query<{ owner: string | null; rate: string }>(
        'select owner_account_id as owner, commission_rate::text as rate from partner_codes where id = $1',
        [r.id]));
    expect(rows[0]!.owner, 'owner_account_id потерян — self-referral перестанет ловиться')
      .toBe(owner.rows[0]!.id);
    expect(Number(rows[0]!.rate)).toBeCloseTo(0.2, 4);

    const audit = await withService((c) =>
      c.query("select 1 from audit_log where entity_id = $1 and action = 'partner_code_issued'", [r.id]));
    expect(audit.rows.length, 'запись в audit_log потеряна').toBe(1);
  });

  it('исчерпание попыток подбора кода — ЯВНЫЙ отказ, а не пустое значение', () => {
    const code = read('lib/partner.ts');
    // Падает при: заменить while(true)+throw на for(…<10) — тогда после десяти коллизий
    // функция дошла бы до конца и вернула undefined, а вызывающий получил undefined.id.
    expect(code, 'исчерпание попыток стало тихим').toMatch(/attempt > 10\)\s*throw new Error/);
  });
});

// ─── Стражи по исходнику ──────────────────────────────────────────────────────
describe('AC-011.4 / AC-011.9 — партнёр определяется ТОЛЬКО токеном', () => {
  it('модуль аутентификации не знает про HTTP и не принимает идентификатор партнёра', () => {
    const code = read('lib/partner-auth.ts');
    for (const forbidden of ['next/headers', 'NextRequest', 'searchParams', 'params.']) {
      expect(code, `${forbidden} в модуле = появился путь мимо токена`).not.toContain(forbidden);
    }
    expect(code).toMatch(/token:\s*string/);
  });

  it('кабинет и маршрут не читают токен из адреса', () => {
    for (const rel of ['app/partner/dashboard/page.tsx', 'app/api/partner/session/route.ts']) {
      const code = read(rel);
      expect(code, `${rel}: токен из query-параметра — утечка через Referer и журналы`)
        .not.toMatch(/searchParams|URL\(.*\)\.searchParams/);
    }
  });
});

describe('AC-011.20 — запросы к партнёрским таблицам только в трёх модулях', () => {
  it('новых мест не появилось', () => {
    const TABLES = /\b(partner_codes|referral_attributions|commissions)\b/;
    const ALLOWED = [
      path.join('lib', 'partner.ts'),
      path.join('lib', 'partner-auth.ts'),
      path.join('lib', 'referral.ts'),   // законное место: атрибуция живёт там
    ];
    const offenders = sourceFiles(SRC)
      .filter((f) => TABLES.test(strip(readFileSync(f, 'utf8'))))
      .map((f) => path.relative(SRC, f))
      .filter((rel) => !ALLOWED.includes(rel));
    // RLS на этих таблицах НЕТ и грантов app_authenticated тоже: единственный фильтр — тот,
    // что написан в запросе. Падает при: дописать запрос в страницу или маршрут.
    expect(offenders, `запросы к партнёрским таблицам вне разрешённых модулей: ${offenders}`)
      .toEqual([]);
  });
});

describe('AC-011.21 — токен не попадает в журнал', () => {
  it('ни console.*, ни audit_log на пути аутентификации не принимают токен', () => {
    for (const rel of ['lib/partner-auth.ts', 'app/api/partner/session/route.ts']) {
      const code = read(rel);
      expect(code, `${rel}: console.* на пути токена`).not.toMatch(/console\.\w+/);
      expect(code, `${rel}: запись в audit_log на пути токена`).not.toContain('audit_log');
    }
  });

  it('в SQL уезжает хеш, а не сырой токен', () => {
    const code = read('lib/partner-auth.ts') + read('lib/partner.ts');
    // Падает при: `where dashboard_token_hash = sha256($1)` — тогда сырой токен попал бы
    // в pg_stat_statements, в log_statement и в текст ошибки при сбое.
    expect(code, 'sha256 считается в SQL — сырой токен уезжает в журналы БД')
      .not.toMatch(/sha256\(\$/i);
    expect(code).toContain('hashPartnerToken(');
  });
});

describe('AC-011.10 / AC-011.13 — cookie и предел тела', () => {
  it('cookie httpOnly и ограничена путём /partner', () => {
    const code = read('app/api/partner/session/route.ts');
    expect(code).toContain('httpOnly: true');
    expect(code).toMatch(/path:\s*'\/partner'/);
  });

  it('маршрут ВЫЗЫВАЕТ общий предел тела', () => {
    const code = read('app/api/partner/session/route.ts');
    expect(code).toMatch(/await\s+readBodyAtMost\(\s*request\s*,\s*MAX_JSON_BODY\s*\)/);
  });
});

describe('AC-011.23 — вложенных транзакций нет', () => {
  it('resolvePartner не открывает свою транзакцию, а принимает client', () => {
    const code = read('lib/partner-auth.ts');
    // Падает при: обернуть тело в withService. Вложение даёт самоблокировку на пуле:
    // при 31 одновременном запросе внешние обёртки занимают все 30 соединений.
    expect(code, 'модуль открывает собственную транзакцию — вложение положит пул')
      .not.toContain('withService');
    expect(code).toMatch(/client:\s*PoolClient/);
  });

  it('кабинет открывает РОВНО одну транзакцию на показ', () => {
    const code = read('app/partner/dashboard/page.tsx');
    expect((code.match(/withService\(/g) ?? []).length,
      'кабинет открывает больше одной транзакции — вдвое дороже ограничиваемого POST').toBe(1);
  });
});

describe('маршрут: коды ответов', () => {
  const URL_ = 'https://proofwall.test/api/partner/session';
  // Здесь адрес обязан ВЫГЛЯДЕТЬ адресом. На уровне библиотеки ключ — просто строка, но
  // маршрут пропускает его через extractClientIP, а тот отвергает всё, что не похоже на IP,
  // и возвращает единый литерал 'unknown'. С ним ВСЕ тесты маршрута и все прошлые прогоны
  // делили бы один ключ счётчика: окно час, порог 30 — и на шестом прогоне первый же тест
  // получал бы 429 вместо 401. Уникальность между прогонами даётся случайными октетами.
  const OCT = [1 + Math.floor(Math.random() * 250), 1 + Math.floor(Math.random() * 250)];
  let n = 0;
  const routeIp = () => { n += 1; return `13.${OCT[0]}.${OCT[1]}.${n % 250}`; };
  const post = (body: unknown, raw?: string) =>
    POST(new Request(URL_, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-forwarded-for': routeIp() },
      body: raw ?? JSON.stringify(body),
    })) as unknown as Promise<Response>;

  it('верный токен → 200 и httpOnly-cookie, токена в теле нет', async () => {
    const p = await makePartner();
    const res = await post({ token: p.token });
    expect(res.status).toBe(200);
    const setCookie = res.headers.get('set-cookie') ?? '';
    expect(setCookie.toLowerCase()).toContain('httponly');
    expect(setCookie).toContain('Path=/partner');
    expect(JSON.stringify(await res.json()), 'токен в теле читает любой скрипт')
      .not.toContain(p.token);
  });

  it('неизвестный токен → 401; нестроковый — тот же 401', async () => {
    expect((await post({ token: 'нет-такого' })).status).toBe(401);
    expect((await post({ token: 42 })).status).toBe(401);
    expect((await post({})).status).toBe(401);
  });

  it('тело больше предела → 413', async () => {
    const huge = JSON.stringify({ token: 'x'.repeat(8192) });
    expect((await post(undefined, huge)).status).toBe(413);
  });
});
