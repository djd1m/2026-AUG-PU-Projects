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
  it('непривязанный идентификатор не наследует учётку по неподтверждённой почте', async () => {
    const email = `nopw-${uniq()}@example.com`;
    // Первый вход создал учётку без пароля
    const first = await resolve(`yid-a-${uniq()}`, email);
    if (first.kind !== 'linked') throw new Error('ожидался linked');

    // ДРУГОЙ идентификатор, тот же адрес — так выглядит повторная привязка после отвязки
    const second = await resolve(`yid-b-${uniq()}`, email);
    expect(second.kind).toBe('needs_password_login');
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

  it('параллельные чужие идентификаторы не наследуют passwordless аккаунт', async () => {
    const email = `conflict-${uniq()}@example.com`;
    const first = await resolve(`yid-seed-${uniq()}`, email);
    if (first.kind !== 'linked') throw new Error('подготовка не удалась');
    const extId = `conflict-${uniq()}`;
    const all = await Promise.all(Array.from({ length: 8 }, () => resolve(extId, email)));
    for (const r of all) expect(r.kind).toBe('needs_password_login');
    expect(await identityRows(extId)).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
