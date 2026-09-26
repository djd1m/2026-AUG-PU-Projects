// Аккаунт текущей сессии для серверных страниц кабинета (layout уже отправил без сессии на /login). account_id —
// ТОЛЬКО отсюда; bot_id — из адреса, владение проверяет SQL (packages/db/src/bots.ts, OWNED).
import { cookies } from 'next/headers';
import { COOKIE_NAME } from './auth-handler';
import { getRuntime } from './runtime';
export async function currentAccountId(): Promise<string | null> {
  const token = (await cookies()).get(COOKIE_NAME)?.value;
  if (!token || !/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
  return (await getRuntime().auth.authenticate(token))?.account_id ?? null;
}
