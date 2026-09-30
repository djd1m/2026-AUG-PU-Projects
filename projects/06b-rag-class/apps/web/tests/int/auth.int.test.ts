import { createHmac, randomInt } from 'node:crypto';
import bcrypt from 'bcrypt';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { reserveQuotaNow } from '@n6b/db';
import { AuthService, DUMMY_HASH, type PasswordHasher } from '@/server/auth';
import { createAuthHandler, readSessionCookie } from '@/server/auth-handler';
import { PgAuthStore } from '@/server/auth-store';
import { servicePool, ownerPool, uniq } from '../../../../packages/db/tests/int/helpers';

// FR-n6b-1 на настоящей БД, настоящем bcrypt (cost 12) и настоящем счётчике quota_counter под служебным пользователем n6b_app_service.
const BASE = 'https://n6b.example.test';
const SESSION_SECRET = 's'.repeat(48);
const owner = ownerPool();
const app = servicePool(10);
afterAll(async () => { await owner.end(); await app.end(); });

const calls: string[] = [];
const hasher: PasswordHasher = {
  hash: async (p, cost) => { calls.push('hash'); return bcrypt.hash(p, cost); },
  compare: async (p, h) => { calls.push(h === DUMMY_HASH ? 'compare:dummy' : 'compare'); return bcrypt.compare(p, h); },
};
const auth = new AuthService(new PgAuthStore(app), hasher, SESSION_SECRET);
const deps = { auth, publicBaseUrl: BASE, visitorSecret: 'v'.repeat(48), authLimitPerHour: 10, production: true,
  reserve: (keys: Parameters<typeof reserveQuotaNow>[1]) => reserveQuotaNow(app, keys) };
const register = createAuthHandler('register', deps);
const login = createAuthHandler('login', deps);

// Адреса — со случайной базой на прогон (spend-ceilings 08_review.md F-5): счётчик входа живёт час, и повторный прогон
// на той же БД без `down -v` иначе упирался бы в попытки прошлого прогона с тех же адресов.
const RUN_V4 = `172.${randomInt(16, 32)}.${randomInt(0, 256)}`;
const RUN_V6 = randomInt(0x1000, 0x10000).toString(16);
let ipCounter = 0;
const freshIp = () => `${RUN_V4}.${(ipCounter += 1)}`;
function req(body: object, ip: string): Request {
  return new Request(`${BASE}/api/auth/x`, { method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': `10.0.0.1, ${ip}`, origin: BASE },
    body: JSON.stringify(body) });
}
const tokenOf = (res: Response) =>
  readSessionCookie(new Request(BASE, { headers: { cookie: (res.headers.get('set-cookie') ?? '').split(';')[0]! } }));

beforeEach(() => { calls.length = 0; });

describe('регистрация и вход на Postgres (FR-n6b-1)', () => {
  it('SC-US-001-1: аккаунт плана free и сессия; в БД — HMAC токена, не токен; срок 7 дней', async () => {
    const email = `${uniq('owner')}@example.test`;
    const res = await register(req({ email, password: 'correct horse 1' }, freshIp()));
    expect(res.status).toBe(201);
    const token = tokenOf(res)!;
    const acc = (await owner.query('SELECT id, plan, kind, password_hash FROM account WHERE email = $1', [email])).rows[0];
    expect(acc.plan).toBe('free');
    expect(acc.kind).toBe('owner');
    expect(bcrypt.getRounds(acc.password_hash)).toBe(12);
    const s = (await owner.query('SELECT token_hash, expires_at FROM session WHERE account_id = $1', [acc.id])).rows;
    expect(s).toHaveLength(1);
    expect(s[0].token_hash).toBe(createHmac('sha256', SESSION_SECRET).update(token).digest('hex'));
    expect(s[0].token_hash).not.toContain(token);
    const days = (new Date(s[0].expires_at).getTime() - Date.now()) / 86_400_000;
    expect(days).toBeGreaterThan(6.9);
    expect(days).toBeLessThanOrEqual(7);
    expect(await auth.authenticate(token)).toBe(acc.id);
  });

  it('SC-US-001-2: неверный пароль и чужой e-mail — одинаковый ответ; для чужого сверяется фиктивный хэш', async () => {
    const email = `${uniq('a')}@example.test`;
    await register(req({ email, password: 'correct horse 1' }, freshIp()));
    calls.length = 0;
    const wrong = await login(req({ email, password: 'wrong password 1' }, freshIp()));
    const unknown = await login(req({ email: `${uniq('none')}@example.test`, password: 'wrong password 1' }, freshIp()));
    expect([wrong.status, unknown.status]).toEqual([401, 401]);
    expect(await wrong.json()).toEqual(await unknown.json());
    expect(calls).toEqual(['compare', 'compare:dummy']);
  });

  it('SC-US-001-3: kind=studio → аккаунт studio; неизвестный kind → owner', async () => {
    const studio = `${uniq('studio')}@example.test`;
    const odd = `${uniq('odd')}@example.test`;
    await register(req({ email: studio, password: 'correct horse 1', kind: 'studio' }, freshIp()));
    await register(req({ email: odd, password: 'correct horse 1', kind: 'admin' }, freshIp()));
    const kinds = (await owner.query('SELECT email, kind, plan FROM account WHERE email = ANY($1) ORDER BY email',
      [[studio, odd]])).rows;
    expect(Object.fromEntries(kinds.map((r) => [r.email, `${r.kind}/${r.plan}`])))
      .toEqual({ [studio]: 'studio/free', [odd]: 'owner/free' });
  });

  it('повтор e-mail в другом регистре → 409, второй аккаунт и сессия не созданы', async () => {
    const email = `${uniq('dup')}@example.test`;
    await register(req({ email, password: 'correct horse 1' }, freshIp()));
    const res = await register(req({ email: email.toUpperCase(), password: 'correct horse 2' }, freshIp()));
    expect(res.status).toBe(409);
    expect((await owner.query('SELECT count(*)::int AS n FROM account WHERE lower(email) = $1', [email])).rows[0].n).toBe(1);
  });

  it('SC-US-001-4: 11-я попытка с адреса за час → 429, bcrypt не вызван, аккаунт не создан', async () => {
    const ip = freshIp();
    for (let i = 0; i < 5; i += 1) await login(req({ email: `${uniq('x')}@example.test`, password: 'wrong password 1' }, ip));
    for (let i = 0; i < 5; i += 1) await register(req({ email: 'bad', password: 'short' }, ip)); // 422, но попытка засчитана
    calls.length = 0;
    const email = `${uniq('late')}@example.test`;
    const res = await register(req({ email, password: 'correct horse 1' }, ip));
    expect(res.status).toBe(429);
    expect(calls).toEqual([]);
    expect((await owner.query('SELECT count(*)::int AS n FROM account WHERE email = $1', [email])).rows[0].n).toBe(0);
    // другой адрес не затронут
    expect((await register(req({ email, password: 'correct horse 1' }, freshIp()))).status).toBe(201);
  });

  it('SC-US-001-4: IPv6 — разные адреса одной /64 делят счётчик, соседняя /64 — нет', async () => {
    const net = `2001:${RUN_V6}:${(ipCounter += 1).toString(16)}:1`;
    for (let i = 1; i <= 10; i += 1) {
      await login(req({ email: `${uniq('v6')}@example.test`, password: 'wrong password 1' }, `${net}::${i.toString(16)}`));
    }
    expect((await login(req({ email: 'a@example.test', password: 'wrong password 1' }, `${net}:ffff::99`))).status).toBe(429);
    expect((await login(req({ email: 'a@example.test', password: 'wrong password 1' },
      `2001:${RUN_V6}:${ipCounter.toString(16)}:2::1`))).status).toBe(401);
  });

  it('конкурентно: 20 одновременных попыток с одного адреса при пределе 10 → ровно 10 дошли до bcrypt', async () => {
    const ip = freshIp();
    const results = await Promise.all(Array.from({ length: 20 }, () =>
      login(req({ email: `${uniq('p')}@example.test`, password: 'wrong password 1' }, ip))));
    expect(results.filter((r) => r.status === 429)).toHaveLength(10);
    expect(results.filter((r) => r.status === 401)).toHaveLength(10);
    expect(calls.filter((c) => c.startsWith('compare'))).toHaveLength(10);
  });

  it('IP не хранится: ключ счётчика — HMAC адреса', async () => {
    const ip = '203.0.113.250';
    await login(req({ email: `${uniq('k')}@example.test`, password: 'wrong password 1' }, ip));
    const scopes = (await owner.query("SELECT scope FROM quota_counter WHERE scope LIKE 'auth:addr:%'")).rows
      .map((r) => r.scope as string);
    expect(scopes.length).toBeGreaterThan(0);
    expect(scopes.some((s) => s.includes('203.0.113') || s.includes('198.51.100'))).toBe(false);
    expect(scopes.every((s) => /^auth:addr:[0-9a-f]{32}:\d{4}-\d{2}-\d{2}T\d{2}$/.test(s))).toBe(true);
  });

  it('выход удаляет сессию из БД', async () => {
    const email = `${uniq('out')}@example.test`;
    const token = tokenOf(await register(req({ email, password: 'correct horse 1' }, freshIp())))!;
    const res = await createAuthHandler('logout', deps)(new Request(`${BASE}/api/auth/logout`, { method: 'POST',
      headers: { cookie: `n6b_session=${token}`, origin: BASE } }));
    expect(res.status).toBe(200);
    expect(await auth.authenticate(token)).toBeNull();
  });
});
