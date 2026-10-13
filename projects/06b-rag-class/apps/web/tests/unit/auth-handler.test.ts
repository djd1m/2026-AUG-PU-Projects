import bcrypt from 'bcrypt';
import { describe, expect, it, vi } from 'vitest';
import type { QuotaDecision, QuotaKey } from '@n6b/db';
import { AuthService, type AuthStore, BCRYPT_COST, DUMMY_HASH, type PasswordHasher } from '@/server/auth';
import { createAuthHandler, readSessionCookie } from '@/server/auth-handler';
import { createHealthHandler } from '@/server/health';

const BASE = 'https://n6b.example.test';

function memoryStore(): AuthStore & { accounts: Map<string, { id: string; password_hash: string | null }> } {
  const accounts = new Map<string, { id: string; password_hash: string | null }>();
  const sessions = new Map<string, string>();
  return {
    accounts,
    async findAccount(email) { return accounts.get(email) ?? null; },
    async register(email, passwordHash, _kind, session) {
      if (accounts.has(email)) return false;
      const id = `acc-${accounts.size + 1}`;
      accounts.set(email, { id, password_hash: passwordHash });
      sessions.set(session.tokenHash, id);
      return true;
    },
    async createSession(accountId, session) { sessions.set(session.tokenHash, accountId); },
    async deleteSession(tokenHash) { sessions.delete(tokenHash); },
    async findSession(tokenHash) { const id = sessions.get(tokenHash); return id ? { account_id: id } : null; },
  };
}

// Быстрый «хэшер» с журналом вызовов: проверяется ЧТО и КОГДА вызывается, а не скорость bcrypt.
function spyHasher() {
  const calls: string[] = [];
  const hasher: PasswordHasher = {
    hash: vi.fn(async (p: string, cost: number) => { calls.push('hash'); return `h${cost}:${p}`; }),
    compare: vi.fn(async (p: string, hash: string) => { calls.push(`compare:${hash}`); return hash === `h12:${p}`; }),
  };
  return { hasher, calls };
}

function setup(limit = 10) {
  const store = memoryStore();
  const { hasher, calls } = spyHasher();
  const auth = new AuthService(store, hasher, 's'.repeat(48));
  let used = 0;
  const reserve = vi.fn(async (keys: readonly QuotaKey[]): Promise<QuotaDecision> => {
    calls.push('reserve');
    used += 1;
    return used <= limit ? { ok: true } : { ok: false, scope: keys[0]!.scope };
  });
  const deps = { auth, publicBaseUrl: BASE, visitorSecret: 'v'.repeat(48), authLimitPerHour: limit,
    production: true, reserve };
  return { store, calls, reserve, register: createAuthHandler('register', deps),
    login: createAuthHandler('login', deps), logout: createAuthHandler('logout', deps) };
}

function req(body: unknown, headers: Record<string, string> = {}): Request {
  return new Request(`${BASE}/api/auth/x`, { method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': '203.0.113.7', origin: BASE, ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body) });
}

describe('регистрация и вход — порядок проверок (Pseudocode «Register and login»)', () => {
  it('фиктивный хэш — настоящий bcrypt той же стоимости 12, что и регистрация', async () => {
    expect(BCRYPT_COST).toBe(12);
    expect(bcrypt.getRounds(DUMMY_HASH)).toBe(12);
    expect(await bcrypt.compare('любой пароль', DUMMY_HASH)).toBe(false);
  });

  it('SC-US-001-1: регистрация → 201, cookie httpOnly, SameSite=Lax, Secure, 7 дней', async () => {
    const t = setup();
    const res = await t.register(req({ email: ' Owner@Example.TEST ', password: 'correct horse 1' }));
    expect(res.status).toBe(201);
    const cookie = res.headers.get('set-cookie') ?? '';
    expect(cookie).toMatch(/^n6b_session=[A-Za-z0-9_-]{43}; Path=\/; HttpOnly; SameSite=Lax; Max-Age=604800; Secure$/);
    expect(t.store.accounts.has('owner@example.test')).toBe(true);
  });

  it('SC-US-001-2: «нет e-mail» и «неверный пароль» — одинаковый ответ; для чужого e-mail сверяется фиктивный хэш', async () => {
    const t = setup();
    await t.register(req({ email: 'a@example.test', password: 'correct horse 1' }));
    t.calls.length = 0;
    const wrong = await t.login(req({ email: 'a@example.test', password: 'wrong password 1' }));
    const unknown = await t.login(req({ email: 'nobody@example.test', password: 'wrong password 1' }));
    expect(wrong.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(await wrong.json()).toEqual(await unknown.json());
    expect(t.calls).toContain(`compare:${DUMMY_HASH}`);
    expect(t.calls.filter((c) => c.startsWith('compare'))).toHaveLength(2);
  });

  it('вход верным паролем → 200 и сессия, которую находит authenticate; выход её удаляет', async () => {
    const t = setup();
    await t.register(req({ email: 'a@example.test', password: 'correct horse 1' }));
    const res = await t.login(req({ email: 'A@example.test', password: 'correct horse 1' }));
    expect(res.status).toBe(200);
    const token = readSessionCookie(new Request(BASE, { headers: { cookie: (res.headers.get('set-cookie') ?? '').split(';')[0]! } }));
    expect(token).not.toBeNull();
    const out = await t.logout(new Request(BASE, { method: 'POST', headers: { cookie: `n6b_session=${token}`, origin: BASE } }));
    expect(out.status).toBe(200);
    expect(out.headers.get('set-cookie')).toContain('Max-Age=0');
  });

  it('SC-US-001-4: 11-я попытка → 429, bcrypt не вызывается, аккаунт не создаётся', async () => {
    const t = setup(10);
    for (let i = 0; i < 10; i += 1) await t.login(req({ email: `x${i}@example.test`, password: 'wrong password 1' }));
    t.calls.length = 0;
    const res = await t.register(req({ email: 'new@example.test', password: 'correct horse 1' }));
    expect(res.status).toBe(429);
    expect((await res.json()).error.message).toBe('Слишком много попыток, повторите через час');
    expect(t.calls).toEqual(['reserve']);
    expect(t.store.accounts.has('new@example.test')).toBe(false);
  });

  it('предел ДО разбора тела: мусорное тело тоже расходует попытку (перебор невалидным телом не бесплатен)', async () => {
    const t = setup();
    const res = await t.login(req('{not json'));
    expect(res.status).toBe(422);
    expect(t.reserve).toHaveBeenCalledTimes(1);
  });

  it('чужой Origin → 403 до предела: чужая страница не сжигает счётчик посетителя', async () => {
    const t = setup();
    const res = await t.login(req({ email: 'a@example.test', password: 'correct horse 1' }, { origin: 'https://evil.test' }));
    expect(res.status).toBe(403);
    expect(t.reserve).not.toHaveBeenCalled();
  });

  it.each(['register', 'login', 'logout'] as const)('R-3: %s без заголовка Origin → 403 до предела и до выхода',
    async (action) => {
      const t = setup();
      const plain = new Request(`${BASE}/api/auth/${action}`, { method: 'POST',
        headers: { 'content-type': 'application/json', 'x-forwarded-for': '203.0.113.7', cookie: `n6b_session=${'a'.repeat(43)}` },
        body: JSON.stringify({ email: 'a@example.test', password: 'correct horse 1' }) });
      const res = await { register: t.register, login: t.login, logout: t.logout }[action](plain);
      expect(res.status).toBe(403);
      expect((await res.json()).error.code).toBe('forbidden_origin');
      expect(t.reserve).not.toHaveBeenCalled();
      expect(res.headers.get('set-cookie')).toBeNull();
    });

  it.each([
    [{ email: 'a@example.test', password: 'short' }, 422],
    [{ email: 'not-an-email', password: 'correct horse 1' }, 422],
    [{ email: 'a@example.test', password: 'я'.repeat(40) }, 422],
    [{ email: 'a@example.test', password: 'x'.repeat(5000) }, 413],
  ])('невалидный ввод %j → %i', async (body, status) => {
    expect((await setup().register(req(body))).status).toBe(status);
  });

  it('повторная регистрация того же e-mail → 409', async () => {
    const t = setup();
    await t.register(req({ email: 'a@example.test', password: 'correct horse 1' }));
    expect((await t.register(req({ email: 'A@EXAMPLE.test', password: 'correct horse 2' }))).status).toBe(409);
  });

  it('нет X-Forwarded-For → 503 и ни одной попытки bcrypt', async () => {
    const t = setup();
    const res = await t.login(new Request(`${BASE}/api/auth/login`, { method: 'POST',
      headers: { 'content-type': 'application/json', origin: BASE },
      body: JSON.stringify({ email: 'a@example.test', password: 'x'.repeat(12) }) }));
    expect(res.status).toBe(503);
    expect(t.calls).toEqual([]);
  });
});

describe('GET /api/health (NFR-n6b-5)', () => {
  it('200 только при ответившей БД; иначе 503 без текста ошибки', async () => {
    expect((await createHealthHandler(async () => undefined)()).status).toBe(200);
    const bad = await createHealthHandler(async () => { throw new Error('password=secret'); })();
    expect(bad.status).toBe(503);
    expect(JSON.stringify(await bad.json())).not.toContain('secret');
  });
});

describe('HAN-02 existing session factory regression', () => {
  it('prepareSession generates random HMAC material without creating/authenticating a session', async () => {
    const store = memoryStore(); const { hasher } = spyHasher();
    const auth = new AuthService(store, hasher, 'test-session-secret');
    const before = Date.now(); const a = auth.prepareSession(); const b = auth.prepareSession();
    expect(Buffer.from(a.token, 'base64url')).toHaveLength(32); expect(a.token).not.toBe(b.token);
    expect(a.record.tokenHash).toBe(auth.tokenHash(a.token)); expect(a.record.tokenHash).not.toBe(a.token);
    expect(a.record.expiresAt.getTime()).toBeGreaterThanOrEqual(before + 604800000);
    expect(a.record.expiresAt.getTime()).toBeLessThanOrEqual(Date.now() + 604800000);
    expect(await auth.authenticate(a.token)).toBeNull(); expect(hasher.hash).not.toHaveBeenCalled();
    const registration = await auth.register('client@example.test', 'long-password', 'owner');
    expect(registration.ok).toBe(true);
    if (registration.ok) expect(await auth.authenticate(registration.token)).toBe('acc-1');
    const login = await auth.login('client@example.test', 'long-password');
    expect(login).not.toBeNull(); expect(await auth.authenticate(login!)).toBe('acc-1');
  });
});
