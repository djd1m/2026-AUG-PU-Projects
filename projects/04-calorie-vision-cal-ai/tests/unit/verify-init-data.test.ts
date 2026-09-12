// VerifyTelegramInitData (AC-consent-and-telegram-auth-2/3/4/7).
//
// Отклонение от Testing Strategy (`04_refinement.md`): «вектор из ОФИЦИАЛЬНОЙ СПЕЦИФИКАЦИИ
// Telegram» предполагает буквальный fixture с сайта `core.telegram.org/bots/webapps`. Этот
// исполнитель работает БЕЗ доступа в сеть и не может честно скопировать байт-в-байт пример с
// живого сайта, не имея возможности его открыть. Вместо этого первый тест ниже — НЕЗАВИСИМАЯ
// референсная реализация того же АЛГОРИТМА (описанного в `Architecture.md` строка 103 и
// процитированного в `03_architecture.md`, External Dependencies, статус CONFIRMED), написанная
// прямо в тесте без обращения к продакшн-коду: если обе реализации одного и того же
// документированного алгоритма сходятся на одном и том же входе — это то же самое свойство
// формата (сортировка ключей, разделитель `\n`, порядок HMAC), которое проверял бы буквальный
// fixture. Задокументировано как отклонение в `05_completion.md`.

import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { verifyTelegramInitData } from '../../apps/api/src/auth/verify-init-data.js';

const BOT_TOKEN = '123456789:AAF-reference-token-for-tests-000000000';

/** Референсная реализация — НЕЗАВИСИМАЯ от `verify-init-data.ts`, тот же документированный алгоритм. */
function referenceSign(fields: Record<string, string>, botToken: string): string {
  const pairs = Object.keys(fields)
    .sort()
    .map((key) => `${key}=${fields[key]}`);
  const dataCheckString = pairs.join('\n');
  const secretKey = createHmac('sha256', 'WebAppData').update(botToken, 'utf8').digest();
  return createHmac('sha256', secretKey).update(dataCheckString, 'utf8').digest('hex');
}

function buildInitData(fields: Record<string, string>, botToken: string): string {
  const hash = referenceSign(fields, botToken);
  const params = new URLSearchParams({ ...fields, hash });
  return params.toString();
}

describe('VerifyTelegramInitData', () => {
  it('эталонный вектор: независимая референсная реализация того же документированного алгоритма совпадает', () => {
    const authDate = String(Math.floor(Date.now() / 1000) - 300);
    const fields = { auth_date: authDate, query_id: 'AAHtest', user: JSON.stringify({ id: 555666777, first_name: 'Тест' }) };
    const initData = buildInitData(fields, BOT_TOKEN);

    const result = verifyTelegramInitData(initData, BOT_TOKEN);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.telegramUserId).toBe('555666777');
      expect(result.authDate).toBe(Number.parseInt(authDate, 10));
    }
  });

  it('AC-2: изменённый байт полезной нагрузки при исходном hash отклоняется 401-эквивалентом (signature)', () => {
    const authDate = String(Math.floor(Date.now() / 1000) - 60);
    const fields = { auth_date: authDate, user: JSON.stringify({ id: 1, first_name: 'A' }) };
    const initData = buildInitData(fields, BOT_TOKEN);
    // Один байт полезной нагрузки изменён ПОСЛЕ вычисления hash — подпись больше не сойдётся.
    const tampered = initData.replace('first_name%22%3A%22A%22', 'first_name%22%3A%22B%22');

    const result = verifyTelegramInitData(tampered, BOT_TOKEN);

    expect(result).toEqual({ ok: false, reason: 'signature' });
  });

  it('AC-3: подлинная подпись, auth_date 25 часов назад — отклоняется (stale)', () => {
    const authDate = String(Math.floor(Date.now() / 1000) - 25 * 60 * 60);
    const fields = { auth_date: authDate, user: JSON.stringify({ id: 2 }) };
    const initData = buildInitData(fields, BOT_TOKEN);

    const result = verifyTelegramInitData(initData, BOT_TOKEN);

    expect(result).toEqual({ ok: false, reason: 'stale' });
  });

  it('AC-7: пустой init_data отклоняется как ошибка ввода (missing), не как проверка подлинности', () => {
    expect(verifyTelegramInitData('', BOT_TOKEN)).toEqual({ ok: false, reason: 'missing' });
    expect(verifyTelegramInitData(undefined, BOT_TOKEN)).toEqual({ ok: false, reason: 'missing' });
    expect(verifyTelegramInitData('   ', BOT_TOKEN)).toEqual({ ok: false, reason: 'missing' });
  });

  it('и подпись неверна, и auth_date просрочен одновременно — один и тот же reason: signature', () => {
    const authDate = String(Math.floor(Date.now() / 1000) - 48 * 60 * 60);
    const fields = { auth_date: authDate, user: JSON.stringify({ id: 3 }) };
    const initData = buildInitData(fields, BOT_TOKEN).replace(/hash=[0-9a-f]+/, 'hash=' + '0'.repeat(64));

    const result = verifyTelegramInitData(initData, BOT_TOKEN);

    // Подпись проверяется ПЕРВОЙ: причина — signature, а не stale, даже когда оба условия ложны.
    expect(result).toEqual({ ok: false, reason: 'signature' });
  });

  it('легитимный повторный вход с НОВОЙ initData того же пользователя проходит как обычный вход', () => {
    const fieldsA = { auth_date: String(Math.floor(Date.now() / 1000) - 10), user: JSON.stringify({ id: 42 }) };
    const fieldsB = { auth_date: String(Math.floor(Date.now() / 1000) - 5), user: JSON.stringify({ id: 42 }), query_id: 'second' };

    const resultA = verifyTelegramInitData(buildInitData(fieldsA, BOT_TOKEN), BOT_TOKEN);
    const resultB = verifyTelegramInitData(buildInitData(fieldsB, BOT_TOKEN), BOT_TOKEN);

    expect(resultA.ok).toBe(true);
    expect(resultB.ok).toBe(true);
    if (resultA.ok && resultB.ok) {
      expect(resultA.hash).not.toBe(resultB.hash);
      expect(resultA.telegramUserId).toBe(resultB.telegramUserId);
    }
  });
});
