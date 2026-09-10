import { expect, it, vi } from 'vitest';
import { createHmac, randomBytes, randomUUID } from 'node:crypto';
import { createApi, type Action, type ApiRuntime } from '../src/lib/http/handler';
import { HttpAdmission, DurableAdmission } from '../src/lib/http/admission';
import { createCsrf, csrfBinding, ANONYMOUS_COOKIE } from '../src/lib/http/csrf';
import { SessionService, hashSessionToken } from '../src/lib/auth/session';
import { SESSION_COOKIE } from '../src/lib/auth/cookie';
import type { IdentityContext, IdentityRepository } from '../../../packages/db/src/auth-repository';
import type { OnboardingService } from '../../../packages/db/src/onboarding-contract';
import { OnboardingError } from '../../../packages/db/src/onboarding-contract';

const origin = 'https://n3a.example.test';
function fixture() {
  const secret = randomBytes(32); const anonymous = randomBytes(32).toString('base64url');
  const active = new Map<string, IdentityContext>();
  const userId = randomUUID();
  const repository: IdentityRepository = {
    findUser: vi.fn(async () => null), issueSessionIfCurrent: vi.fn(async () => null),
    resolveSession: vi.fn(async (hash) => active.get(hash.toString('hex')) ?? null),
    revokeSession: vi.fn(async (hash) => { active.delete(hash.toString('hex')); }),
  };
  const invoked = vi.fn(async () => { throw new OnboardingError('forbidden'); });
  const onboarding = new Proxy({}, { get: () => invoked }) as OnboardingService;
  const counters = { chargeSource: vi.fn(async () => ({ allowed: true, retry_after: 0 })),
    chargeIdentity: vi.fn(async () => ({ allowed: true, retry_after: 0 })) };
  const runtime: ApiRuntime = {
    config: { databaseUrl: 'postgresql://n3a_app:test@db/n3a', sessionSecret: secret, identitySecret: randomBytes(32),
      admissionSecret: randomBytes(32), appOrigin: origin },
    sessions: new SessionService(repository, secret), onboarding,
    credentials: { authenticate: vi.fn(async () => ({ ok: false as const, error: 'invalid_credentials' as const })) },
    admission: new DurableAdmission(counters, randomBytes(32)),
    hashIdentity: (value) => { if (typeof value !== 'string') throw new Error('invalid'); return createHmac('sha256', secret).update(value).digest(); },
  };
  const addSession = () => {
    const token = randomBytes(32).toString('base64url'); const hash = hashSessionToken(token, secret);
    const context = { user_id: userId, session_id: randomUUID(), expires_at: new Date(Date.now() + 86400000) };
    active.set(hash.toString('hex'), context); return { token, hash, context };
  };
  const request = (body: unknown, session?: ReturnType<typeof addSession>) => new Request(origin + '/api/test', {
    method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json',
      Cookie: session ? `${SESSION_COOKIE}=${session.token}` : `${ANONYMOUS_COOKIE}=${anonymous}`,
      'X-CSRF-Token': createCsrf(csrfBinding(session?.hash ?? null, anonymous)!, secret).token }, body: JSON.stringify(body),
  });
  return { runtime, repository, active, invoked, counters, request, addSession, api: createApi(async () => runtime, new HttpAdmission()) };
}
it('AC3 every mutation rejects absent Origin/CSRF before enrollment effects', async () => {
  const f = fixture();
  const actions: Action[] = ['signup', 'login', 'logout', 'bind', 'preview', 'accept', 'acceptPartner',
    'policy', 'activate', 'issue', 'revokeGrant', 'revokeOperator', 'partnerStatus', 'revokeAsset'];
  for (const action of actions) {
    const response = await f.api(new Request(origin + '/api/test', { method: 'POST', body: '{}' }), action, { id: randomUUID() });
    expect(response.status).toBe(403); expect(response.headers.get('cache-control')).toBe('no-store');
  }
  expect(f.invoked).not.toHaveBeenCalled(); expect(f.runtime.credentials.authenticate).not.toHaveBeenCalled();
  expect(f.repository.revokeSession).not.toHaveBeenCalled();
  expect(f.counters.chargeSource).toHaveBeenCalledTimes(14);
});
it('AC3 login failures are generic and successful rotation revokes previous session without disclosing token', async () => {
  const f = fixture();
  const absent = await f.api(f.request({ identity: 'absent@example.test', password: 'correct-length' }), 'login');
  const wrong = await f.api(f.request({ identity: 'existing@example.test', password: 'wrong-password' }), 'login');
  expect(absent.status).toBe(401); expect(wrong.status).toBe(401);
  expect((await absent.json()).error).toEqual((await wrong.json()).error);
  const old = f.addSession(); const next = f.addSession();
  f.runtime.credentials.authenticate = vi.fn(async () => ({ ok: true as const, token: next.token, context: next.context }));
  const response = await f.api(f.request({ identity: 'existing@example.test', password: 'correct-length' }, old), 'login');
  expect(response.status).toBe(200); expect(f.active.has(old.hash.toString('hex'))).toBe(false);
  expect(await response.text()).not.toContain(next.token);
  expect(response.headers.get('set-cookie')).toContain('Secure; HttpOnly; SameSite=Lax');
  expect(response.headers.get('set-cookie')).toContain(`${ANONYMOUS_COOKIE}=; Path=/; Max-Age=0`);
});
it('AC3 logout clears only after durable revocation and outage preserves explicit failure', async () => {
  const f = fixture(); const session = f.addSession();
  const request = f.request({}, session);
  const response = await f.api(request, 'logout');
  expect(response.status).toBe(200); expect(f.active.size).toBe(0);
  expect(response.headers.get('set-cookie')).toContain(`${SESSION_COOKIE}=; Path=/; Max-Age=0`);
  expect((await f.api(f.request({}, session), 'logout')).status).toBe(403);
  const second = f.addSession();
  vi.mocked(f.repository.revokeSession).mockRejectedValue(new Error('private-connection-sentinel'));
  const outage = await f.api(f.request({}, second), 'logout');
  expect(outage.status).toBe(503); expect(outage.headers.get('set-cookie')).toBeNull();
  expect(await outage.text()).not.toContain('sentinel');
  expect(f.active.has(second.hash.toString('hex'))).toBe(true);
});
it('AC4 rejects client owner authority and implicit consent without calling the domain', async () => {
  const f = fixture(); const session = f.addSession(); const grant = randomBytes(32).toString('base64url');
  const invalid = [
    { action: 'signup' as Action, body: { identity: 'x@example.test', password: 'valid-password', grant_token: grant, role: 'owner' } },
    { action: 'acceptPartner' as Action, body: { grant_token: grant, policy_id: randomUUID(), terms_hash: 'a'.repeat(64), accepted: false } },
    { action: 'issue' as Action, body: { identity: 'x@example.test', role: 'owner' } },
    { action: 'activate' as Action, body: { ready: true } },
  ];
  for (const test of invalid) expect((await f.api(f.request(test.body, session), test.action, { id: randomUUID() })).status).toBe(422);
  expect(f.invoked).not.toHaveBeenCalled();
});
it('AC9 HTTP slot rejection precedes lazy runtime and durable admission', async () => {
  let resolve!: (value: ApiRuntime) => void;
  const loading = new Promise<ApiRuntime>((yes) => { resolve = yes; });
  const factory = vi.fn(() => loading); const api = createApi(factory, new HttpAdmission());
  const pending = Array.from({ length: 16 }, () => api(new Request(origin), 'me'));
  expect((await api(new Request(origin), 'me')).status).toBe(503); expect(factory).toHaveBeenCalledTimes(16);
  const f = fixture(); resolve(f.runtime);
  expect((await Promise.all(pending)).every((r) => r.status === 401)).toBe(true);
  expect((await api(new Request(origin), 'me')).status).toBe(401);
});
it('AC9 spoofed forwarding headers cannot skip the shared durable source limit', async () => {
  const f = fixture();
  vi.mocked(f.counters.chargeSource).mockResolvedValue({ allowed: false, retry_after: 60 });
  for (const forwarded of ['192.0.2.1', '198.51.100.2', '203.0.113.3']) {
    const response = await f.api(new Request(origin + '/api/auth/me', {
      headers: { 'X-Forwarded-For': forwarded, 'X-Real-IP': forwarded, Forwarded: `for=${forwarded}` },
    }), 'me');
    expect(response.status).toBe(429); expect(response.headers.get('retry-after')).toBe('60');
  }
  expect(f.counters.chargeSource).toHaveBeenCalledTimes(3);
  expect(f.repository.resolveSession).not.toHaveBeenCalled(); expect(f.invoked).not.toHaveBeenCalled();
});

it('AC3 invalid canonical session denies all protected reads before object lookup', async () => {
 const f=fixture(); const cookie=`${SESSION_COOKIE}=${randomBytes(32).toString('base64url')}`;
 for(const action of ['me','program','members','assets'] as Action[]){
 const response=await f.api(new Request(origin+'/api/test',{headers:{cookie}}),action,{id:randomUUID()});
 expect(response.status).toBe(401);
 }
 expect(f.invoked).not.toHaveBeenCalled();
});
