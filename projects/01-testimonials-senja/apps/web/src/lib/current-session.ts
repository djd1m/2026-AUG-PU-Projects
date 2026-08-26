// Чтение сессии владельца — Architecture §3.2 («Middleware на каждый запрос дашборда:
// cookie → валидная сессия → account_id»).
//
// Проверка выполняется под app_service: сессию нужно найти ДО того, как появится
// account_id, а без account_id контекст арендатора для app_authenticated выставить не из чего.
// Это единственное место, где app_service читает sessions; всё, что дальше по дашборд-пути,
// обязано идти через withAccount.

import { cookies } from 'next/headers';
import { withService } from '@proofwall/db';
import { SESSION_COOKIE, hashSessionToken } from './session';

export async function currentAccountId(): Promise<string | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  let tokenHash: string;
  try {
    tokenHash = hashSessionToken(token);
  } catch {
    // SESSION_SECRET не задан — fail-closed: считаем, что сессии нет.
    return null;
  }

  return withService(async (client) => {
    // Сверка по хешу выполняется в SQL по индексу unique(token_hash) — равенство по
    // 64 hex-символам, восстановить токен из хеша нельзя (см. session.ts).
    const { rows } = await client.query<{ account_id: string }>(
      `select account_id from sessions
        where token_hash = $1 and revoked_at is null and expires_at > now()`,
      [tokenHash],
    );
    return rows[0]?.account_id ?? null;
  });
}
