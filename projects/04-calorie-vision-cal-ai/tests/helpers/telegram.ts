// Оснастка тестов Telegram-входа: строит валидную `initData` тем же алгоритмом, который
// описывает `03_architecture.md`/`Architecture.md` (секрет — производная токена бота).
// Токен ЗДЕСЬ ЖЕ, что и в `testApiConfig()` — тест обязан подписывать тем токеном, который
// проверяет сервер, иначе проверяется не входная граница, а несовпадение фикстур.

import { createHmac } from 'node:crypto';

export const TEST_BOT_TOKEN = '111111111:AAHtest-bot-token-1234567890abcdefg';

export function signInitData(fields: Record<string, string>, botToken: string = TEST_BOT_TOKEN): string {
  const pairs = Object.keys(fields)
    .sort()
    .map((key) => `${key}=${fields[key]}`);
  const dataCheckString = pairs.join('\n');
  const secretKey = createHmac('sha256', 'WebAppData').update(botToken, 'utf8').digest();
  const hash = createHmac('sha256', secretKey).update(dataCheckString, 'utf8').digest('hex');
  return new URLSearchParams({ ...fields, hash }).toString();
}

export function buildInitData(telegramUserId: string, options: { readonly authDateSecondsAgo?: number; readonly queryId?: string } = {}): string {
  const authDate = String(Math.floor(Date.now() / 1000) - (options.authDateSecondsAgo ?? 60));
  const fields: Record<string, string> = {
    auth_date: authDate,
    user: JSON.stringify({ id: Number(telegramUserId), first_name: 'Тест' }),
  };
  if (options.queryId !== undefined) fields.query_id = options.queryId;
  return signInitData(fields);
}
