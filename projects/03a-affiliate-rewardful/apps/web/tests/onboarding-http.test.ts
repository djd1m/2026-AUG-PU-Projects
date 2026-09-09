import { expect, it, vi } from 'vitest';
import { randomBytes } from 'node:crypto';
import { readBodyAtMost } from '../src/lib/http/body';
import { HttpAdmission, DurableAdmission, admissionSlot } from '../src/lib/http/admission';
import { anonymousCookie, createCsrf, csrfBinding, readCookie, verifyCsrf } from '../src/lib/http/csrf';
import { errorResponse, HttpError } from '../src/lib/http/errors';
import { OnboardingError } from '../../../packages/db/src/onboarding-contract';

function streamRequest(stream: ReadableStream<Uint8Array>, signal?: AbortSignal): Request {
  return new Request('https://n3a.example.test/api/auth/signup', {
    method: 'POST', body: stream, signal, duplex: 'half',
  } as RequestInit);
}
it('AC9 bounds total body bytes and time even when cancellation never settles', async () => {
  expect(await readBodyAtMost(new Request('https://n3a.example.test', { method: 'POST', body: 'я' }))).toBe('я');
  const overflow = streamRequest(new ReadableStream({ start(c) { c.enqueue(new Uint8Array(32 * 1024 + 1)); }, cancel: () => new Promise(() => {}) }));
  await expect(readBodyAtMost(overflow)).rejects.toMatchObject({ status: 413 });
  const slow = streamRequest(new ReadableStream({ pull: () => new Promise(() => {}), cancel: () => new Promise(() => {}) }));
  const start = performance.now();
  await expect(readBodyAtMost(slow, 32768, 30)).rejects.toMatchObject({ status: 408 });
  expect(performance.now() - start).toBeLessThan(1000);
  const abort = new AbortController();
  const canceled = readBodyAtMost(streamRequest(new ReadableStream({ pull: () => new Promise(() => {}) }), abort.signal));
  abort.abort(); await expect(canceled).rejects.toMatchObject({ status: 408 });
  await expect(readBodyAtMost(streamRequest(new ReadableStream({ start(c) { c.enqueue(Uint8Array.of(0xff)); c.close(); } })))).rejects.toMatchObject({ status: 422 });
});
it('AC9 permits exactly sixteen HTTP handlers and never queues the seventeenth', async () => {
  const admission = new HttpAdmission(); let release!: () => void;
  const blocked = new Promise<void>((resolve) => { release = resolve; });
  const running = Array.from({ length: 16 }, () => admission.run(() => blocked));
  const work = vi.fn(async () => {});
  await expect(admission.run(work)).rejects.toMatchObject({ code: 'overloaded' });
  expect(work).not.toHaveBeenCalled();
  // An aborted caller cannot release ongoing work because slots have no early-release API.
  await expect(admission.run(work)).rejects.toMatchObject({ code: 'overloaded' });
  release(); await Promise.all(running);
  await admission.run(work); expect(work).toHaveBeenCalledTimes(1);
  await expect(admission.run(async () => { throw new Error('sentinel'); })).rejects.toThrow();
  await admission.run(work); expect(work).toHaveBeenCalledTimes(2);
});
it('AC9 source admission ignores forwarding headers and separates stable bounded identity slots', async () => {
  const secret = randomBytes(32);
  const repository = { chargeSource: vi.fn(async () => ({ allowed: true, retry_after: 0 })),
    chargeIdentity: vi.fn(async () => ({ allowed: false, retry_after: 32 })) };
  const first = new DurableAdmission(repository, secret); const restarted = new DurableAdmission(repository, secret);
  await first.source(); await restarted.source();
  expect(repository.chargeSource.mock.calls[0]).toEqual(repository.chargeSource.mock.calls[1]);
  await expect(first.identity(null)).rejects.toMatchObject({ status: 429, retryAfter: 32 });
  for (let n = 0; n < 100; n++) {
    const slot = admissionSlot('identity', `identity-${n}`, secret);
    expect(slot).toBeGreaterThanOrEqual(0); expect(slot).toBeLessThan(4096);
  }
});
it('AC3 CSRF binds anonymous or current session context, exact Origin and expiry', () => {
  const secret = randomBytes(32); const anon = randomBytes(32).toString('base64url');
  const binding = csrfBinding(null, anon)!; const now = Date.now();
  const proof = createCsrf(binding, secret, now);
  const request = (token = proof.token, origin: string | null = 'https://n3a.example.test') => {
    const headers = new Headers({ 'X-CSRF-Token': token }); if (origin !== null) headers.set('Origin', origin);
    return new Request('https://n3a.example.test/api/auth/login', { method: 'POST', headers });
  };
  expect(() => verifyCsrf(request(), 'https://n3a.example.test', binding, secret, now)).not.toThrow();
  for (const origin of [null, 'null', 'https://evil.example.test', 'https://n3a.example.test/'])
    expect(() => verifyCsrf(request(proof.token, origin), 'https://n3a.example.test', binding, secret, now)).toThrow('csrf_rejected');
  for (const context of [null, csrfBinding(randomBytes(32), anon), csrfBinding(null, randomBytes(32).toString('base64url'))])
    expect(() => verifyCsrf(request(), 'https://n3a.example.test', context, secret, now)).toThrow('csrf_rejected');
  expect(() => verifyCsrf(request(), 'https://n3a.example.test', binding, secret, now + 1_800_000)).toThrow('csrf_rejected');
  expect(() => verifyCsrf(request(proof.token.slice(0, -43) + (proof.token.at(-43) === 'a' ? 'b' : 'a') + proof.token.slice(-42)), 'https://n3a.example.test', binding, secret, now)).toThrow();
  expect(anonymousCookie(anon)).toContain('; Path=/; Max-Age=1800; Secure; HttpOnly; SameSite=Lax');
  expect(() => readCookie(new Request('https://n3a.example.test', { headers: { cookie: 'a=x; a=y' } }), 'a')).toThrow();
});
it('AC10 private errors never serialize private exception messages', async () => {
  const logs = vi.spyOn(console, 'error').mockImplementation(() => {});
  try {
    for (const error of [new Error('secret-email-password-grant-sentinel'), { stack: 'secret-email-password-grant-sentinel' }]) {
      const response = errorResponse(error, 'test');
      expect(response.status).toBe(503); expect(response.headers.get('cache-control')).toBe('no-store');
      expect(await response.text()).not.toContain('sentinel');
    }
    expect(errorResponse(new OnboardingError('forbidden'), 'test').status).toBe(404);
    expect(errorResponse(new HttpError(429, 'rate_limited', 60), 'test').headers.get('retry-after')).toBe('60');
    expect(logs).not.toHaveBeenCalled();
  } finally { logs.mockRestore(); }
});
