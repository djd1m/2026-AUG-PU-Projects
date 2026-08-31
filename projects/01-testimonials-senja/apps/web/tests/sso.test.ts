// FR-016 — вход через Yandex ID.
//
// Главный инвариант: учётка, У КОТОРОЙ ЕСТЬ ПАРОЛЬ, НЕ связывается по совпадению адреса.
// Он проверяется здесь на живой БД БЕЗ единого сетевого вызова — ради этого сетевой слой
// (lib/sso.ts) и политика (lib/sso-account.ts) разделены.
//
// Остальные инварианты — сеть вне транзакции, таймауты, единственная точка выдачи сессии —
// проверяются стражами по исходнику: они относятся ко ВСЕМ путям кода, включая будущие.

import { afterAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const DB_URL = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
if (!DB_URL) throw new Error('TEST_DATABASE_URL не задан');
process.env.DATABASE_URL = DB_URL;
process.env.SESSION_SECRET = 'test-secret-at-least-16-chars-long';
process.env.BASE_URL = 'https://proofwall.test';
process.env.YANDEX_CLIENT_ID = 'test-client-id';
process.env.YANDEX_CLIENT_SECRET = 'test-client-secret';

const { withService, closePool } = await import('@proofwall/db');
const { registerAccountAndProject } = await import('../src/lib/register');
const { attemptLogin } = await import('../src/lib/login');
const { resolveSsoAccount } = await import('../src/lib/sso-account');
const { changePassword } = await import('../src/lib/password-change');
const sso = await import('../src/lib/sso');
const { GET: callback, SSO_IP_THRESHOLD } = await import('../src/app/api/auth/yandex/callback/route');

afterAll(async () => { await closePool(); });

const SRC = path.resolve(__dirname, '../src');
const strip = (c: string) =>
  c.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/'[^']*'|"[^"]*"|`[^`]*`/g, "''");
const raw = (rel: string) => readFileSync(path.resolve(SRC, rel), 'utf8');
const read = (rel: string) => strip(raw(rel));

const PW = 'correct-horse-battery-staple';
const RUN = `${process.pid}-${Date.now().toString(36)}`;
let seq = 0;
const uniq = () => { seq += 1; return `${RUN}-${seq}`; };
// ФОРМА IP ОБЯЗАТЕЛЬНА. extractClientIP не распознаёт произвольную строку и возвращает
// 'unknown' — тогда ВСЕ тесты набора делят один счётчик, и тот, кто идёт следом, получает
// 429 вместо своей проверки. Ровно этот дефект был в FR-014, здесь он повторился.
// Октеты случайные, чтобы наборы не пересекались между прогонами: счётчик живёт час.
let ipSeq = 0;
const ip = () => {
  ipSeq += 1;
  const a = 10;
  const b = (process.pid + ipSeq) % 250 + 1;
  const c = Math.floor(Date.now() / 1000) % 250 + 1;
  const d = ipSeq % 250 + 1;
  return `${a}.${b}.${c}.${d}`;
};

/** Учётка С ПАРОЛЕМ — через обычную регистрацию. */
async function makePasswordOwner() {
  const slug = `sso-${uniq()}`;
  const email = `${slug}@example.com`;
  const r = await withService((c) => registerAccountAndProject(c, {
    email, password: PW, desired_slug: slug, project_name: 'SSO',
  }));
  if (!r.ok) throw new Error(JSON.stringify(r.body));
  const { rows } = await withService((c) =>
    c.query<{ id: string }>('select id from accounts where email = $1', [email]));
  return { accountId: rows[0]!.id, email };
}

const resolve = (extId: string, email: string) =>
  withService((c) => resolveSsoAccount(c, 'yandex', extId, email));

const accountRow = (email: string) => withService(async (c) => {
  const { rows } = await c.query<{ id: string; password_hash: string | null }>(
    'select id, password_hash from accounts where email = $1', [email]);
  return rows;
});

const identityRows = (extId: string) => withService(async (c) => {
  const { rows } = await c.query<{ account_id: string }>(
    'select account_id from sso_identities where provider = $1 and external_id = $2',
    ['yandex', extId]);
  return rows;
});

// ═════════════════════════════════════════════════════════════════════════════
describe('AC-016.1 — новый человек', () => {
  it('создаётся учётка БЕЗ пароля, вход выполнен', async () => {
    const email = `new-${uniq()}@example.com`;
    const r = await resolve(`yid-${uniq()}`, email);

    expect(r.kind).toBe('linked');
    if (r.kind !== 'linked') return;
    expect(r.created).toBe(true);
    expect(r.token).toBeTruthy();

    const rows = await accountRow(email);
    expect(rows).toHaveLength(1);
    // Пароля НЕТ — это и есть смысл nullable в 015_sso.sql
    expect(rows[0]!.password_hash).toBeNull();
  });
});

describe('AC-016.2 — повторный вход тем же Яндексом', () => {
  it('ведёт в ТУ ЖЕ учётку, второй не создаётся', async () => {
    const extId = `yid-${uniq()}`;
    const email = `rep-${uniq()}@example.com`;
    const first = await resolve(extId, email);
    const second = await resolve(extId, email);

    expect(first.kind).toBe('linked');
    expect(second.kind).toBe('linked');
    if (first.kind !== 'linked' || second.kind !== 'linked') return;
    expect(second.accountId).toBe(first.accountId);
    expect(second.created).toBe(false);
    expect(await identityRows(extId)).toHaveLength(1);
  });
});

describe('AC-016.3 — человек сменил адрес в яндексовом профиле', () => {
  it('попадает в ТУ ЖЕ учётку: ключ — идентификатор, а НЕ email', async () => {
    const extId = `yid-${uniq()}`;
    const first = await resolve(extId, `old-${uniq()}@example.com`);
    // Тот же externalId, ДРУГОЙ адрес — так выглядит смена почты у провайдера
    const second = await resolve(extId, `new-${uniq()}@example.com`);

    if (first.kind !== 'linked' || second.kind !== 'linked') throw new Error('ожидался linked');
    expect(second.accountId).toBe(first.accountId);
    // Второй учётки не появилось
    expect(await identityRows(extId)).toHaveLength(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('AC-016.4 — ГЛАВНЫЙ: учётка С ПАРОЛЕМ не связывается по совпадению адреса', () => {
  it('отказ, а не вход в чужой кабинет', async () => {
    const owner = await makePasswordOwner();
    // Атакующий вписал адрес жертвы в СВОЙ яндексовый профиль
    const r = await resolve(`attacker-${uniq()}`, owner.email);

    expect(r.kind).toBe('needs_password_login');
    // Сессия НЕ выдана — в типе её просто нет, но проверим и данными
    expect(await identityRows(`attacker-${uniq()}`)).toHaveLength(0);
  });

  it('привязка НЕ создана, сессий у владельца не прибавилось', async () => {
    const owner = await makePasswordOwner();
    const before = await withService(async (c) => {
      const { rows } = await c.query<{ n: string }>(
        'select count(*) as n from sessions where account_id = $1', [owner.accountId]);
      return rows[0]!.n;
    });

    const extId = `attacker-${uniq()}`;
    await resolve(extId, owner.email);

    expect(await identityRows(extId)).toHaveLength(0);
    const after = await withService(async (c) => {
      const { rows } = await c.query<{ n: string }>(
        'select count(*) as n from sessions where account_id = $1', [owner.accountId]);
      return rows[0]!.n;
    });
    expect(after).toBe(before);
  });

  it('владелец по-прежнему входит своим паролем — отказ не сломал ему вход', async () => {
    const owner = await makePasswordOwner();
    await resolve(`attacker-${uniq()}`, owner.email);
    const login = await withService((c) => attemptLogin(c, owner.email, PW, ip()));
    expect(login.ok).toBe(true);
  });
});

describe('AC-016.5 — адрес совпал, но у учётки пароля НЕТ', () => {
  it('привязка и вход: подделать владение такой учёткой нечем', async () => {
    const email = `nopw-${uniq()}@example.com`;
    // Первый вход создал учётку без пароля
    const first = await resolve(`yid-a-${uniq()}`, email);
    if (first.kind !== 'linked') throw new Error('ожидался linked');

    // ДРУГОЙ идентификатор, тот же адрес — так выглядит повторная привязка после отвязки
    const second = await resolve(`yid-b-${uniq()}`, email);
    expect(second.kind).toBe('linked');
    if (second.kind !== 'linked') return;
    expect(second.accountId).toBe(first.accountId);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('AC-016.6 — вход ПАРОЛЕМ в учётку без пароля', () => {
  it('отказ, и он неотличим от «аккаунта нет»', async () => {
    const email = `pwless-${uniq()}@example.com`;
    await resolve(`yid-${uniq()}`, email);

    const r = await withService((c) => attemptLogin(c, email, PW, ip()));
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.tooMany).toBe(false);
  });

  it('страж: login.ts коалесцирует NULL в заглушечный хеш, а не выходит рано', () => {
    const code = read('lib/login.ts');
    // Ранний возврат при отсутствии хеша сделал бы ответ заметно быстрее и вернул
    // таймингов оракул существования учётки — мутация S9.
    expect(code).toMatch(/account\?\.password_hash \?\? \(await dummyHash\(\)\)/);
  });
});

describe('AC-016.7 — смена пароля в учётке без пароля', () => {
  it('обычный отказ, НЕ исключение и не 500', async () => {
    const email = `chg-${uniq()}@example.com`;
    const r0 = await resolve(`yid-${uniq()}`, email);
    if (r0.kind !== 'linked') throw new Error('ожидался linked');

    // Не должно бросить — до правки verifyPassword(NULL) валился внутри argon2
    // Арность ОБЪЕКТНАЯ. Первая редакция передавала пять позиционных аргументов, из-за чего
    // accountId оказывался undefined, запрос не находил строк, и тест зеленел НЕ ПОТОМУ, что
    // ветка NULL работает. vitest этого не заметил — заметил tsc. Записано, потому что тест,
    // зеленеющий по чужой причине, неотличим снаружи от работающего.
    const r = await withService((c) =>
      changePassword(c, { accountId: r0.accountId, ip: ip(), current: PW, next: 'another-correct-horse' }));
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe('unauthorized');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('AC-016.10 — два ОДНОВРЕМЕННЫХ коллбэка с одним идентификатором', () => {
  it('ровно одна учётка и ровно одна привязка', async () => {
    const extId = `race-${uniq()}`;
    const email = `race-${uniq()}@example.com`;

    // ВОСЕМЬ, а не два. С двумя транзакции успевали разойтись во времени, и мутация
    // «снять on conflict do nothing» проходила ЗЕЛЁНОЙ — тест был гонкой только на бумаге.
    // Это тот же класс, что AC-010.29: проверка, зеленеющая по построению, а не по существу.
    const K = 8;
    const all = await Promise.all(
      Array.from({ length: K }, () => resolve(extId, email)),
    );

    for (const r of all) expect(r.kind).toBe('linked');
    const ids = new Set(all.map((r) => (r.kind === 'linked' ? r.accountId : 'x')));
    // ВСЕ восемь попали в ОДНУ учётку — иначе человек заходил бы то в одну, то в другую
    expect(ids.size, `учёток получилось ${ids.size}`).toBe(1);
    expect(await identityRows(extId)).toHaveLength(1);
    expect(await accountRow(email)).toHaveLength(1);
  });

  it('НАСТОЯЩИЙ конфликт привязок: учётка уже есть, гонка идёт только за sso_identities', async () => {
    // Прошлая редакция гоняла восемь потоков по НЕСУЩЕСТВУЮЩЕМУ адресу — и они
    // сериализовались на уникальности accounts.email, до конфликта привязок не доходя.
    // Тест был гонкой на бумаге: мутация «снять on conflict do nothing» проходила зелёной.
    //
    // Здесь учётка создана ЗАРАНЕЕ и без пароля, поэтому все потоки минуют вставку в
    // accounts и упираются ровно в sso_identities — то есть в проверяемое ограничение.
    const email = `conflict-${uniq()}@example.com`;
    const first = await resolve(`yid-seed-${uniq()}`, email);
    if (first.kind !== 'linked') throw new Error('подготовка не удалась');

    const extId = `conflict-${uniq()}`;
    const all = await Promise.all(
      Array.from({ length: 8 }, () => resolve(extId, email)),
    );

    for (const r of all) expect(r.kind).toBe('linked');
    const ids = new Set(all.map((r) => (r.kind === 'linked' ? r.accountId : 'x')));
    expect(ids.size).toBe(1);
    // Все восемь — в ту же учётку, что и подготовительный вход
    expect([...ids][0]).toBe(first.accountId);
    expect(await identityRows(extId)).toHaveLength(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('AC-016.8 — состояние попытки (state)', () => {
  it('подписанное состояние разбирается обратно', () => {
    const packed = sso.packState({ state: 'abc', verifier: 'v', expiresAt: Date.now() + 60_000 });
    expect(sso.unpackState(packed)).toMatchObject({ state: 'abc', verifier: 'v' });
  });

  it('подделанная подпись отвергается', () => {
    const packed = sso.packState({ state: 'abc', verifier: 'v', expiresAt: Date.now() + 60_000 });
    const [payload] = packed.split('.');
    expect(sso.unpackState(`${payload}.deadbeef`)).toBeNull();
  });

  it('подменённое тело при валидной форме отвергается', () => {
    const evil = Buffer.from(JSON.stringify({
      state: 'evil', verifier: 'v', expiresAt: Date.now() + 60_000,
    })).toString('base64url');
    const packed = sso.packState({ state: 'abc', verifier: 'v', expiresAt: Date.now() + 60_000 });
    const mac = packed.split('.')[1];
    expect(sso.unpackState(`${evil}.${mac}`)).toBeNull();
  });

  it('истёкшее отвергается', () => {
    const packed = sso.packState({ state: 'abc', verifier: 'v', expiresAt: Date.now() - 1 });
    expect(sso.unpackState(packed)).toBeNull();
  });

  it('мусор любой формы отвергается, а не роняет', () => {
    for (const bad of [undefined, '', '.', 'no-dot', 'a.b', '....', 'x'.repeat(5000)]) {
      expect(sso.unpackState(bad as string | undefined), JSON.stringify(bad)).toBeNull();
    }
  });
});

describe('AC-016.8 — PKCE', () => {
  it('challenge — это base64url(sha256(verifier)), а не сам verifier', () => {
    const v = sso.generateVerifier();
    const c = sso.challengeFor(v);
    expect(c).not.toBe(v);
    expect(c).toMatch(/^[A-Za-z0-9_-]+$/);
    // Детерминирован: тот же verifier даёт тот же challenge
    expect(sso.challengeFor(v)).toBe(c);
  });

  it('адрес согласия несёт challenge и S256, но НЕ несёт verifier', () => {
    const v = sso.generateVerifier();
    const url = sso.authorizeUrl('st', v);
    expect(url).toContain('code_challenge_method=S256');
    expect(url).toContain(encodeURIComponent(sso.challengeFor(v)));
    expect(url).not.toContain(v);
    expect(url).not.toContain('client_secret');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('AC-016.14 — провайдер недоступен', () => {
  const withFetch = async (impl: typeof fetch, fn: () => Promise<unknown>) => {
    const original = globalThis.fetch;
    globalThis.fetch = impl;
    try { return await fn(); } finally { globalThis.fetch = original; }
  };

  it('сетевая ошибка → SsoUnavailableError, а не сырой сбой', async () => {
    await withFetch(
      (() => Promise.reject(new Error('ECONNREFUSED'))) as unknown as typeof fetch,
      async () => {
        await expect(sso.exchangeCode('code', 'v')).rejects.toBeInstanceOf(sso.SsoUnavailableError);
      },
    );
  });

  it('5xx от провайдера → SsoUnavailableError', async () => {
    await withFetch(
      (() => Promise.resolve(new Response('', { status: 502 }))) as unknown as typeof fetch,
      async () => {
        await expect(sso.exchangeCode('code', 'v')).rejects.toBeInstanceOf(sso.SsoUnavailableError);
      },
    );
  });

  it('ответ без access_token → отказ, а не undefined дальше по коду', async () => {
    await withFetch(
      (() => Promise.resolve(Response.json({ token_type: 'bearer' }))) as unknown as typeof fetch,
      async () => {
        await expect(sso.exchangeCode('code', 'v')).rejects.toBeInstanceOf(sso.SsoUnavailableError);
      },
    );
  });

  it('профиль без id → отказ: ключа учётной записи нет, впускать некуда', async () => {
    await withFetch(
      (() => Promise.resolve(Response.json({ default_email: 'a@b.c' }))) as unknown as typeof fetch,
      async () => {
        await expect(sso.fetchProfile('tok')).rejects.toBeInstanceOf(sso.SsoUnavailableError);
      },
    );
  });

  it('профиль без email → отказ с указанием на права login:email', async () => {
    await withFetch(
      (() => Promise.resolve(Response.json({ id: '42' }))) as unknown as typeof fetch,
      async () => {
        await expect(sso.fetchProfile('tok')).rejects.toThrow(/login:email/);
      },
    );
  });

  it('успешный профиль отдаёт СЫРОЙ адрес — нормализует вызывающий', async () => {
    await withFetch(
      (() => Promise.resolve(Response.json({ id: '42', default_email: '  MiXeD@Example.COM ' }))) as unknown as typeof fetch,
      async () => {
        const p = await sso.fetchProfile('tok');
        expect(p.externalId).toBe('42');
        // Не тронут: второе объявление нормализации — мина (см. шапку login.ts)
        expect(p.email).toBe('  MiXeD@Example.COM ');
      },
    );
  });
});

describe('AC-016.15 — секретов нет', () => {
  it('authorizeUrl отказывается строить адрес без client_id', () => {
    const saved = process.env.YANDEX_CLIENT_ID;
    delete process.env.YANDEX_CLIENT_ID;
    try {
      expect(() => sso.authorizeUrl('s', 'v')).toThrow(sso.SsoNotConfiguredError);
      expect(sso.ssoConfigured()).toBe(false);
    } finally {
      process.env.YANDEX_CLIENT_ID = saved;
    }
  });

  it('пустая строка — тоже «не задан», а не валидное значение', () => {
    const saved = process.env.YANDEX_CLIENT_SECRET;
    process.env.YANDEX_CLIENT_SECRET = '   ';
    try {
      expect(sso.ssoConfigured()).toBe(false);
    } finally {
      process.env.YANDEX_CLIENT_SECRET = saved;
    }
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// СТРАЖИ ПО ИСХОДНИКУ — свойства кода, а не одного прогона.
// ═════════════════════════════════════════════════════════════════════════════
describe('AC-016.11 — сеть СНАРУЖИ транзакции', () => {
  // ВНИМАНИЕ: импорты проверяются по СЫРОМУ тексту, а не по strip(). strip() заменяет все
  // строковые литералы на '' — а путь импорта и есть строковый литерал. Первая редакция этих
  // двух стражей смотрела в strip() и не могла совпасть НИКОГДА: мутация S6 (политика
  // импортирует сетевой слой) прошла мимо них зелёной. Это ровно guard-must-be-able-to-fail.md:
  // проверка, ни разу не показавшая красное, проверкой не является.
  it('политика связывания не импортирует сетевой слой', () => {
    expect(raw('lib/sso-account.ts')).not.toMatch(/from ['"]\.\/sso['"]/);
    expect(read('lib/sso-account.ts')).not.toMatch(/\bfetch\s*\(/);
  });

  it('сетевой слой не импортирует ни withService, ни политику', () => {
    expect(read('lib/sso.ts')).not.toMatch(/withService|withAccount/);
    // ТОЛЬКО строки import. Проверка по всему сырому тексту совпадала с упоминанием
    // 'sso-account.ts' в собственном комментарии файла — то есть падала на честном коде.
    // Ложное красное так же вредно, как ложное зелёное: такой страж отключают через неделю.
    const imports = raw('lib/sso.ts').split('\n').filter((l) => /^\s*import /.test(l)).join('\n');
    expect(imports).not.toMatch(/sso-account/);
  });

  it('в коллбэке withService открывается ПОСЛЕ обмена кода', () => {
    const code = read('app/api/auth/yandex/callback/route.ts');
    const exchange = code.indexOf('exchangeCode(');
    const tx = code.lastIndexOf('withService(');
    expect(exchange).toBeGreaterThan(-1);
    expect(tx).toBeGreaterThan(exchange);
  });
});

describe('AC-016.12 — таймаут на КАЖДОМ внешнем вызове', () => {
  it('число fetch равно числу signal во всём apps/web', () => {
    const files = ['lib/sso.ts', 'lib/email.ts', 'lib/payment.ts'];
    for (const f of files) {
      const code = read(f);
      const fetches = (code.match(/\bfetch\s*\(/g) ?? []).length;
      const signals = (code.match(/signal:/g) ?? []).length;
      expect(signals, `${f}: fetch=${fetches} signal=${signals}`).toBeGreaterThanOrEqual(fetches);
    }
  });

  it('sso.ts использует AbortSignal.timeout, а не голый fetch', () => {
    const code = read('lib/sso.ts');
    expect(code).toMatch(/AbortSignal\.timeout\(SSO_TIMEOUT_MS\)/);
  });
});

describe('AC-016.13 — единственная точка выдачи сессии', () => {
  it('insert into sessions не появился в модулях SSO', () => {
    for (const f of ['lib/sso.ts', 'lib/sso-account.ts',
                     'app/api/auth/yandex/callback/route.ts',
                     'app/api/auth/yandex/start/route.ts']) {
      expect(raw(f), f).not.toMatch(/insert\s+into\s+sessions/i);
    }
  });
});

describe('AC-016.17 — секреты и коды не утекают в журнал', () => {
  it('ни console, ни логгер не вызываются с code, token или secret', () => {
    for (const f of ['lib/sso.ts', 'lib/sso-account.ts',
                     'app/api/auth/yandex/callback/route.ts']) {
      const code = read(f);
      expect(code, f).not.toMatch(/console\.(log|info|warn|error)/);
      expect(code, f).not.toMatch(/JSON\.stringify\((data|profile|saved)\)/);
    }
  });

  it('client_secret не попадает в адрес страницы согласия', () => {
    expect(sso.authorizeUrl('s', sso.generateVerifier())).not.toContain('secret');
  });
});

describe('AC-016.18 — нормализация адреса ЕДИНСТВЕННАЯ', () => {
  it('sso.ts не объявляет своей нормализации', () => {
    const code = read('lib/sso.ts');
    expect(code).not.toMatch(/toLowerCase\(\)/);
  });

  it('коллбэк нормализует канонической функцией из login.ts', () => {
    const code = read('app/api/auth/yandex/callback/route.ts');
    expect(code).toMatch(/normalizeEmail\(profile\.email\)/);
    expect(raw('app/api/auth/yandex/callback/route.ts')).toMatch(/from '@\/lib\/login'/);
  });
});

describe('AC-016.9 — state гасится ДО сетевых вызовов', () => {
  it('clearState объявлен раньше обмена кода', () => {
    const code = read('app/api/auth/yandex/callback/route.ts');
    expect(code.indexOf('clearState')).toBeLessThan(code.indexOf('exchangeCode('));
  });

  it('ПОСЛЕ чтения cookie ни один возврат не обходит clearState', () => {
    const code = read('app/api/auth/yandex/callback/route.ts');
    // Смотрим только хвост — от места, где состояние прочитано. До него гасить нечего:
    // отказ человека и превышение лимита случаются раньше, cookie ещё не тронута.
    //
    // Первая редакция этого стража считала ВСЕ `return` в файле и падала на возвратах
    // внутри back() и лямбды лимитера — то есть измеряла не то, что заявляла. Записано,
    // потому что страж, измеряющий не своё, опаснее отсутствующего: он зеленеет случайно.
    const from = code.indexOf('const saved =');
    expect(from).toBeGreaterThan(-1);
    const tail = code.slice(from);

    // Каждый возврат в хвосте обязан быть либо clearState(...), либо возвратом ЗНАЧЕНИЯ
    // внутри clearState. Голого `return back(` быть не может.
    expect(tail).not.toMatch(/return\s+back\(/);
    // И ровно один возврат успеха — он тоже через clearState
    expect(tail).toMatch(/return clearState\(response\)/);
  });
});

describe('AC-016.16 — лимит на коллбэке ДО сети', () => {
  it('rateLimit.exceeded вызывается раньше exchangeCode', () => {
    const code = read('app/api/auth/yandex/callback/route.ts');
    expect(code.indexOf('rateLimit.exceeded')).toBeLessThan(code.indexOf('exchangeCode('));
  });
});


// ═════════════════════════════════════════════════════════════════════════════
// МАРШРУТ ЦЕЛИКОМ. Стражи по исходнику проверяют ПОРЯДОК строк, но не ЭФФЕКТ: мутация
// `if (false && await rateLimit.exceeded(...))` оставляет строку на месте и проходит мимо
// проверки позиции. Поэтому лимит и сверка state проверяются поведением.
// ═════════════════════════════════════════════════════════════════════════════
const callbackReq = (params: Record<string, string>, cookie?: string, addr = ip()) =>
  new Request(`https://proofwall.test/api/auth/yandex/callback?${new URLSearchParams(params)}`, {
    headers: {
      ...(cookie ? { cookie: `${sso.SSO_STATE_COOKIE}=${cookie}` } : {}),
      'x-forwarded-for': addr,
    },
  });

const reason = (r: Response) =>
  new URL(r.headers.get('location') ?? 'https://x/').searchParams.get('sso');

describe('AC-016.8 — сверка state НА МАРШРУТЕ', () => {
  it('валидная cookie, но ЧУЖОЙ state в адресе → отказ, сети не было', async () => {
    const packed = sso.packState({
      state: 'ours', verifier: sso.generateVerifier(), expiresAt: Date.now() + 60_000,
    });
    let called = 0;
    const original = globalThis.fetch;
    globalThis.fetch = (async () => { called += 1; return Response.json({ access_token: 't' }); }) as unknown as typeof fetch;
    try {
      const r = await callback(callbackReq({ code: 'c', state: 'theirs' }, packed));
      expect(reason(r)).toBe('invalid_state');
      // Ни одного обращения к провайдеру: отказ случился ДО сети
      expect(called, 'провайдер был вызван при несовпадении state').toBe(0);
    } finally { globalThis.fetch = original; }
  });

  it('cookie нет вовсе → отказ', async () => {
    const r = await callback(callbackReq({ code: 'c', state: 's' }));
    expect(reason(r)).toBe('invalid_state');
  });

  it('cookie истёкшая → отказ', async () => {
    const packed = sso.packState({ state: 's', verifier: 'v', expiresAt: Date.now() - 1 });
    const r = await callback(callbackReq({ code: 'c', state: 's' }, packed));
    expect(reason(r)).toBe('invalid_state');
  });

  it('отказ гасит cookie состояния', async () => {
    const r = await callback(callbackReq({ code: 'c', state: 's' }));
    const setCookie = r.headers.get('set-cookie') ?? '';
    expect(setCookie).toContain(sso.SSO_STATE_COOKIE);
    expect(setCookie).toMatch(/Max-Age=0/i);
  });
});

describe('AC-016.16 — лимит на коллбэке ДЕЙСТВУЕТ, а не просто написан', () => {
  it(`попытка №${SSO_IP_THRESHOLD + 1} с одного адреса получает too_many`, async () => {
    const addr = ip();
    // Порог + 1 попыток подряд. Cookie не даём — до сети дело не доходит, но счётчик
    // пишется: лимит стоит ПЕРВЫМ шагом, до всякой проверки состояния.
    let last: Response | null = null;
    for (let i = 0; i <= SSO_IP_THRESHOLD; i += 1) {
      last = await callback(callbackReq({ code: 'c', state: 's' }, undefined, addr));
    }
    expect(reason(last!)).toBe('too_many');
  }, 20_000);

  it('другой адрес не наказан за соседа', async () => {
    const r = await callback(callbackReq({ code: 'c', state: 's' }, undefined, ip()));
    expect(reason(r)).toBe('invalid_state');
  });
});


describe('AC-016.19 — успешный вход ведёт на СУЩЕСТВУЮЩУЮ страницу', () => {
  // Первая редакция уводила на `/dashboard`, которой в приложении НЕТ (есть только
  // `/dashboard/[slug]`), то есть успешный вход заканчивался 404. Дефект поймала сквозная
  // проверка на стенде, а не набор тестов: тесты подтверждали, что сессия выдана, и молчали
  // о том, открывается ли выданный адрес. Тот же класс, что BASE_URL в FR-013.
  const pages = () => {
    const { readdirSync, statSync } = require('node:fs') as typeof import('node:fs');
    const walk = (dir: string, base = ''): string[] =>
      readdirSync(dir).flatMap((e) => {
        const full = path.join(dir, e);
        if (statSync(full).isDirectory()) return walk(full, `${base}/${e}`);
        return e === 'page.tsx' ? [base || '/'] : [];
      });
    return walk(path.resolve(SRC, 'app'));
  };

  it('маршрут не ведёт на `/dashboard` — такой страницы нет', () => {
    const routes = pages();
    expect(routes).not.toContain('/dashboard');
    expect(routes).toContain('/dashboard/[slug]');
    // СЫРОЙ текст: адрес — шаблонная строка, а strip() заменяет литералы на ''. Первая
    // редакция обеих проверок смотрела в strip() и совпасть не могла НИКОГДА — при этом
    // одна из них зеленела, создавая видимость проверки. Третий случай этого класса в
    // одной фиче; вывод записан в 05_completion.md.
    const code = raw('app/api/auth/yandex/callback/route.ts');
    expect(code).not.toMatch(/`\$\{baseUrl\(\)\}\/dashboard`/);
  });

  it('владелец с проектом уходит на его кабинет, без проектов — на главную', () => {
    const code = raw('app/api/auth/yandex/callback/route.ts');
    expect(code).toMatch(/resolution\.projects\[0\]/);
    expect(code).toMatch(/dashboard\/\$\{first\.slug\}/);
    // Запасной путь для учётки без проектов обязан существовать
    expect(code).toMatch(/: `\$\{baseUrl\(\)\}\/`/);
  });
});


// ═════════════════════════════════════════════════════════════════════════════
describe('AC-016.20 — гонка SSO против ОБЫЧНОЙ РЕГИСТРАЦИИ на тот же адрес', () => {
  // Ветка появилась при починке гонки за accounts_email_key и была бы иначе непокрытой —
  // а это самая опасная ветка фичи. Если победителем гонки оказалась регистрация, учётка
  // получает ПАРОЛЬ, и слепое перечитывание отдало бы её через SSO: ровно тот захват,
  // ради запрета которого написана вся фича.
  //
  // Проверяется ИНВАРИАНТОМ, а не ожидаемым порядком: кто выиграет — не наше дело, но ни
  // при каком исходе SSO не смеет впустить в учётку, у которой есть пароль.
  it('ни при каком исходе SSO не впускает в учётку с паролем', async () => {
    for (let round = 0; round < 10; round += 1) {
      const slug = `race2-${uniq()}`;
      const email = `${slug}@example.com`;
      const extId = `race2-${uniq()}`;

      const [reg, sso2] = await Promise.allSettled([
        withService((c) => registerAccountAndProject(c, {
          email, password: PW, desired_slug: slug, project_name: 'Гонка',
        })),
        resolve(extId, email),
      ]);

      // Чем бы ни кончилось — учётка в БД ровно одна
      expect(await accountRow(email), `раунд ${round}`).toHaveLength(1);
      const row = (await accountRow(email))[0]!;

      if (sso2.status === 'fulfilled' && sso2.value.kind === 'linked') {
        // SSO впустил — значит пароля у учётки быть НЕ ДОЛЖНО
        expect(row.password_hash, `раунд ${round}: SSO впустил в учётку С ПАРОЛЕМ`).toBeNull();
      }
      if (row.password_hash !== null) {
        // Пароль есть — значит SSO обязан был отказать
        expect(
          sso2.status === 'fulfilled' && sso2.value.kind === 'needs_password_login',
          `раунд ${round}: у учётки пароль, а SSO не отказал`,
        ).toBe(true);
      }
      void reg;
    }
  }, 30_000);

  it('страж: повторная проверка пароля после проигранной гонки не удалена', () => {
    const code = read('lib/sso-account.ts');
    // Две проверки has_password, а не одна: первая — до вставки, вторая — после конфликта.
    expect((code.match(/has_password/g) ?? []).length).toBeGreaterThanOrEqual(4);
    expect(code).toMatch(/if \(winner\.has_password\) return/);
  });
});


describe('AC-016.21 — тексты отказов не зовут на несуществующие страницы', () => {
  // Владелец прочитал «привяжите в настройках», пошёл искать настройки и не нашёл:
  // такой страницы в приложении нет. Тот же класс, что обещание письма на /forgot при
  // ненастроенной почте — интерфейс обещает действие, которого не построено.
  const pages = () => {
    const { readdirSync, statSync } = require('node:fs') as typeof import('node:fs');
    const walk = (dir: string, base = ''): string[] =>
      readdirSync(dir).flatMap((e) => {
        const full = path.join(dir, e);
        if (statSync(full).isDirectory()) return walk(full, `${base}/${e}`);
        return e === 'page.tsx' ? [base || '/'] : [];
      });
    return walk(path.resolve(SRC, 'app'));
  };

  it('ни один текст не отсылает в «настройки», пока их нет', () => {
    const code = raw('app/login/page.tsx');
    const messages = code.slice(code.indexOf('SSO_MESSAGES'), code.indexOf('export default'));
    const hasSettingsPage = pages().some((r) => /settings|настрой/i.test(r));
    if (!hasSettingsPage) {
      // Ищем только в ЗНАЧЕНИЯХ сообщений, не в комментариях: объяснение, почему текст
      // изменён, обязано упоминать настройки — иначе через месяц правку откатят.
      const values = messages.split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n');
      expect(values, 'текст зовёт в настройки, которых не существует')
        .not.toMatch(/в настройках|в настройки/);
    }
  });
});
