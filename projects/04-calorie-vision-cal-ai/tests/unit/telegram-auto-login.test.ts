// TelegramAutoLogin (RV-consent-and-telegram-auth-06, третий обзор) — логика решения «пробовать
// ли вход» и классификации ответа сервера, вынесенная в чистые функции именно затем, чтобы её
// можно было проверить БЕЗ jsdom (`vitest.config.ts` — unit-слой на `environment: 'node'`, без
// DOM). Поведение самого React-компонента (монтирование, localStorage, useEffect) автотестом не
// покрыто — честно названо в квитанции, тот же класс ограничения, что у RV-09/RV-10 второго
// обзора (`05_completion.md`).

import { describe, expect, it, vi } from 'vitest';
import { shouldAttemptTelegramLogin, submitTelegramLogin } from '../../apps/web/app/telegram-auto-login.js';

describe('shouldAttemptTelegramLogin', () => {
  it('initData отсутствует — не пробовать (не Mini App или SDK ещё не готов)', () => {
    expect(shouldAttemptTelegramLogin({ initData: undefined, alreadyLinked: false, lastAttemptedInitData: '' })).toBe(false);
  });

  it('initData пустая строка — не пробовать', () => {
    expect(shouldAttemptTelegramLogin({ initData: '', alreadyLinked: false, lastAttemptedInitData: '' })).toBe(false);
  });

  it('RV-06 п. 2: браузер УЖЕ связывал аккаунт раньше — не пробовать, даже со свежей initData', () => {
    expect(shouldAttemptTelegramLogin({ initData: 'auth_date=1&hash=abc', alreadyLinked: true, lastAttemptedInitData: '' })).toBe(false);
  });

  it('ТА ЖЕ строка уже отправлялась — не пробовать заново (раньше это дублировало попытку на каждом монтировании /settings)', () => {
    expect(
      shouldAttemptTelegramLogin({ initData: 'auth_date=1&hash=abc', alreadyLinked: false, lastAttemptedInitData: 'auth_date=1&hash=abc' }),
    ).toBe(false);
  });

  it('свежая initData, ещё не связано, строка НЕ совпадает с прошлой попыткой — пробовать', () => {
    expect(
      shouldAttemptTelegramLogin({ initData: 'auth_date=2&hash=def', alreadyLinked: false, lastAttemptedInitData: 'auth_date=1&hash=abc' }),
    ).toBe(true);
  });
});

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

describe('submitTelegramLogin', () => {
  it('200 — исход "ok"', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(200, { data: { account_id: 'a1', migrated_entries: 0 } }));
    await expect(submitTelegramLogin('init', fetchImpl as unknown as typeof fetch)).resolves.toBe('ok');
  });

  it('RV-06 п. 2: 401 initdata_replayed — исход "replayed", НЕ "failed" (сервер говорит «уже вошли этой строкой»)', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(401, { error: { code: 'initdata_replayed', message: 'x' } }));
    await expect(submitTelegramLogin('init', fetchImpl as unknown as typeof fetch)).resolves.toBe('replayed');
  });

  it('401 unauthorized (подпись/свежесть) — исход "failed", НЕ путается с replayed', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(401, { error: { code: 'unauthorized', message: 'x' } }));
    await expect(submitTelegramLogin('init', fetchImpl as unknown as typeof fetch)).resolves.toBe('failed');
  });

  it('409 account_erasing — исход "failed" (вход отклонён, RV-05 маршрута)', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(409, { error: { code: 'account_erasing', message: 'x' } }));
    await expect(submitTelegramLogin('init', fetchImpl as unknown as typeof fetch)).resolves.toBe('failed');
  });

  it('422 missing_init_data — исход "failed"', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(422, { error: { code: 'missing_init_data', message: 'x' } }));
    await expect(submitTelegramLogin('init', fetchImpl as unknown as typeof fetch)).resolves.toBe('failed');
  });

  it('RV-06 п. 3: сетевой отказ (fetch реджектится) ПРОБРАСЫВАЕТСЯ вызывающему — раньше терялся без .catch и оставлял компонент в pending навсегда', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new TypeError('failed to fetch');
    });
    await expect(submitTelegramLogin('init', fetchImpl as unknown as typeof fetch)).rejects.toThrow('failed to fetch');
  });
});
