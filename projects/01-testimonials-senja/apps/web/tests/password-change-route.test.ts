// FR-010 — HTTP-слой смены пароля.
//
// Существует по той же причине, что login-route.test.ts: восемнадцать тестов проверяли
// lib/login.ts и ни один не вызывал маршрут, отчего четыре дефекта прошли зелёными.
// Здесь проверяется то, что живёт ТОЛЬКО в маршруте: источник accountId, коды ответов,
// предел тела и cookie.

import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

const DB_URL = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
if (!DB_URL) throw new Error('TEST_DATABASE_URL не задан');
process.env.DATABASE_URL = DB_URL;
process.env.SESSION_SECRET = 'test-secret-at-least-16-chars-long';
process.env.BASE_URL = 'https://proofwall.test';

// Маршрут читает cookie через next/headers — вне Next этого рантайма нет.
const state = vi.hoisted(() => ({ token: undefined as string | undefined }));
vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) =>
      name === 'pw_session' && state.token ? { value: state.token } : undefined,
  }),
}));

const { withService, closePool } = await import('@proofwall/db');
const { registerAccountAndProject } = await import('../src/lib/register');
const { createSession, hashSessionToken } = await import('../src/lib/session');
const { MAX_JSON_BODY } = await import('../src/lib/request-body');
const { POST } = await import('../src/app/api/auth/password/route');

afterAll(async () => { await closePool(); });

const URL_ = 'https://proofwall.test/api/auth/password';
const OLD = 'old-correct-horse-battery';
const NEW = 'new-correct-horse-battery';
let seq = 0;

async function makeOwner(): Promise<{ accountId: string; email: string }> {
  seq += 1;
  const slug = `pwr-${seq}-${Date.now().toString(36)}`;
  const email = `${slug}@example.com`;
  const r = await withService((c) =>
    registerAccountAndProject(c, { email, password: OLD, desired_slug: slug, project_name: 'PWR' }),
  );
  if (!r.ok) throw new Error(JSON.stringify(r.body));
  const { rows } = await withService((c) =>
    c.query<{ id: string }>('select id from accounts where email = $1', [email]),
  );
  return { accountId: rows[0]!.id, email };
}

// Здесь ключ едет через X-Forwarded-For и обязан выглядеть адресом, поэтому уникальность
// между прогонами даётся двумя случайными октетами, а не строкой: счётчик по адресу живёт
// час и между наборами не чистится (разбор — в password-change.test.ts).
const OCT = [1 + Math.floor(Math.random() * 250), 1 + Math.floor(Math.random() * 250)];
function post(body: unknown, raw?: string): Promise<Response> {
  seq += 1;
  return POST(new Request(URL_, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': `11.${OCT[0]}.${OCT[1]}.${seq & 255}` },
    body: raw ?? JSON.stringify(body),
  })) as unknown as Promise<Response>;
}

async function login(accountId: string): Promise<string> {
  const token = await withService((c) => createSession(c, accountId));
  state.token = token;
  return token;
}

async function storedHash(accountId: string): Promise<string> {
  const { rows } = await withService((c) =>
    c.query<{ password_hash: string }>('select password_hash from accounts where id = $1', [accountId]),
  );
  return rows[0]!.password_hash;
}

beforeEach(() => { state.token = undefined; });

describe('FR-010.1 — маршрут требует валидной сессии', () => {
  it('без cookie → 401, а не 500', async () => {
    const res = await post({ current_password: OLD, new_password: NEW });
    expect(res.status).toBe(401);
  });
});

describe('AC-010.18 — чужой account_id в теле не влияет НИ НА ЧТО', () => {
  it('владелец A с account_id жертвы B в теле меняет только СВОЙ пароль', async () => {
    const victim = await makeOwner();
    const actor = await makeOwner();
    const victimBefore = await storedHash(victim.accountId);
    const victimSession = await withService((c) => createSession(c, victim.accountId));

    await login(actor.accountId);
    const res = await post({
      // Ровно тот дефект, который проходил мимо всех критериев ревизии 1:
      // реализация, берущая идентификатор отсюда, позволяет сменить пароль ЛЮБОМУ.
      account_id: victim.accountId,
      current_password: OLD,
      new_password: NEW,
    });
    expect(res.status).toBe(200);

    // Падает при: const accountId = body.account_id.
    expect(await storedHash(victim.accountId), 'пароль жертвы изменён через поле в теле')
      .toBe(victimBefore);
    const { rows } = await withService((c) =>
      c.query('select 1 from sessions where token_hash = $1 and revoked_at is null', [
        hashSessionToken(victimSession),
      ]));
    expect(rows.length, 'сессии жертвы отозваны через поле в теле').toBe(1);
  });
});

describe('AC-010.11 — предел размера тела', () => {
  it('тело больше предела → 413', async () => {
    const owner = await makeOwner();
    await login(owner.accountId);
    const huge = JSON.stringify({ current_password: OLD, new_password: 'x'.repeat(MAX_JSON_BODY + 64) });
    const res = await post(undefined, huge);
    // Падает при: убрать readBodyAtMost.
    expect(res.status).toBe(413);
  });
});

describe('AC-010.8 / AC-010.9 — границы, проверяемые до транзакции', () => {
  it.each([
    ['короче 8', 'a'.repeat(7), 400],
    ['длиннее 200', 'a'.repeat(201), 400],
  ])('%s → %i', async (_name, next, status) => {
    const owner = await makeOwner();
    await login(owner.accountId);
    expect((await post({ current_password: OLD, new_password: next })).status).toBe(status);
  });

  it('новый пароль равен текущему → 400', async () => {
    const owner = await makeOwner();
    await login(owner.accountId);
    const res = await post({ current_password: OLD, new_password: OLD });
    expect(res.status).toBe(400);
  });

  it('нестроковые поля не роняют маршрут', async () => {
    const owner = await makeOwner();
    await login(owner.accountId);
    for (const bad of [null, 42, {}, ['a'], true]) {
      const res = await post({ current_password: bad, new_password: NEW });
      expect([400, 401]).toContain(res.status);
    }
  });
});

describe('AC-010.7 — неверный текущий пароль', () => {
  it('401 тем же телом, что при отсутствии сессии (NFR-010.4)', async () => {
    const owner = await makeOwner();
    await login(owner.accountId);
    const wrong = await post({ current_password: 'не-тот', new_password: NEW });
    expect(wrong.status).toBe(401);
    const wrongBody = JSON.stringify(await wrong.json());

    state.token = undefined;
    const noSession = await post({ current_password: OLD, new_password: NEW });
    expect(noSession.status).toBe(401);
    // Различимость дала бы вору сигнал «сессия жива, пароль не тот».
    expect(JSON.stringify(await noSession.json())).toBe(wrongBody);
  });
});

describe('AC-010.6 / NFR-010.6 — успех выдаёт новую cookie в ТОМ ЖЕ ответе', () => {
  it('200, cookie httpOnly, токена в теле нет', async () => {
    const owner = await makeOwner();
    const authenticating = await login(owner.accountId);
    const res = await post({ current_password: OLD, new_password: NEW });
    expect(res.status).toBe(200);

    const setCookie = res.headers.get('set-cookie') ?? '';
    const token = /pw_session=([^;]+)/.exec(setCookie)?.[1];
    expect(token, 'новая cookie не выдана — владелец остался бы снаружи').toBeTruthy();
    expect(token).not.toBe(authenticating);
    expect(setCookie.toLowerCase()).toContain('httponly');
    // Токен в теле прочитал бы любой скрипт на странице.
    expect(JSON.stringify(await res.json())).not.toContain(token!);
  });
});
