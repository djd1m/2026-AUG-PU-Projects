import { describe, expect, it, vi } from 'vitest';
import { submitAuth } from '@/lib/auth-client';

// F-9: экраны входа и регистрации шлют форму в существующие API и показывают ошибку сервера, а не «успех».
const reply = (status: number, body: unknown) => vi.fn(async () =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })) as unknown as typeof fetch;

describe('submitAuth (экран входа и регистрации)', () => {
  it('SC-US-001-1: регистрация уходит на /api/auth/register с kind; 201 → успех', async () => {
    const fetchImpl = reply(201, { data: { ok: true } });
    expect(await submitAuth('register', { email: 'a@b.test', password: 'x'.repeat(10), kind: 'studio' }, fetchImpl))
      .toEqual({ ok: true });
    const [url, init] = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(url).toBe('/api/auth/register');
    expect(JSON.parse(init.body)).toEqual({ email: 'a@b.test', password: 'x'.repeat(10), kind: 'studio' });
    expect(init.headers).toEqual({ 'content-type': 'application/json' });
  });

  it('вход не шлёт kind; 200 → успех', async () => {
    const fetchImpl = reply(200, { data: { ok: true } });
    expect(await submitAuth('login', { email: 'a@b.test', password: 'p'.repeat(10), kind: 'owner' }, fetchImpl))
      .toEqual({ ok: true });
    const init = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0]![1];
    expect(JSON.parse(init.body)).toEqual({ email: 'a@b.test', password: 'p'.repeat(10) });
  });

  it.each([
    [401, 'Неверный e-mail или пароль'],
    [409, 'Аккаунт с этим e-mail уже есть — войдите'],
    [429, 'Слишком много попыток, повторите через час'],
    [422, 'Укажите корректный e-mail и пароль от 10 символов'],
  ])('ответ %i → показывается текст сервера', async (status, message) => {
    expect(await submitAuth('login', { email: 'a@b.test', password: 'p'.repeat(10) },
      reply(status, { error: { code: 'x', message } }))).toEqual({ ok: false, message });
  });

  it('регистрация с ответом 200 (не 201) — не успех: форма не уводит в кабинет без подтверждения', async () => {
    const outcome = await submitAuth('register', { email: 'a@b.test', password: 'p'.repeat(10) }, reply(200, {}));
    expect(outcome.ok).toBe(false);
  });

  it('непонятный ответ и обрыв сети — своё сообщение, не успех', async () => {
    const html = vi.fn(async () => new Response('<html>', { status: 502 })) as unknown as typeof fetch;
    expect(await submitAuth('login', { email: 'a@b.test', password: 'p'.repeat(10) }, html))
      .toEqual({ ok: false, message: 'Не удалось выполнить запрос. Повторите позже.' });
    const down = vi.fn(async () => { throw new TypeError('fetch failed'); }) as unknown as typeof fetch;
    expect((await submitAuth('login', { email: 'a@b.test', password: 'p'.repeat(10) }, down)).ok).toBe(false);
  });
});
