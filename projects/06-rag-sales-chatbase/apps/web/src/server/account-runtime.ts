// Связка маршрутов удаления (фича account-erasure): SQL из @n6/db, bcrypt — здесь, ВНЕ транзакции. Одна функция для
// маршрутов и для тестов (tests/account-erasure.integration.test.ts подменяет только ограничитель двери и сессию);
// зависимости собираются ОДИН раз на процесс, как у кабинета, оплаты и партнёрки.
import bcrypt from 'bcrypt';
import { eraseBotQuestionLog, requestErasure, type Pool } from '@n6/db';
import type { AccountDependencies } from './account-handler';
import { DUMMY_HASH } from './auth';
import { erasureCookie } from './erasure-receipt';
import { allowMutation } from './rate-limit';
import { getRuntime } from './runtime';

export function createAccountDependencies(w: { pool: Pool; publicOrigin: string; sessionSecret: string; allowMutation: AccountDependencies['allowMutation'];
  authenticate: AccountDependencies['authenticate']; log?: (line: string) => void }): AccountDependencies {
  const { pool } = w;
  return {
    publicOrigin: w.publicOrigin, authenticate: w.authenticate, allowMutation: w.allowMutation, log: w.log,
    checkPassword: async (accountId, password) => {
      // pool.query отпускает соединение ДО bcrypt; для неактивного и отсутствующего — фиктивный хэш (равное время).
      const hash = (await pool.query<{ password_hash: string }>(`SELECT password_hash FROM account WHERE id = $1 AND status = 'active'`, [accountId])).rows[0]?.password_hash;
      const matches = await bcrypt.compare(password, hash || DUMMY_HASH);
      return Boolean(hash) && matches;
    },
    requestErasure: (accountId) => requestErasure(pool, accountId),
    receiptCookie: (accountId) => erasureCookie(accountId, w.sessionSecret),
    eraseQuestionLog: (botId, accountId) => eraseBotQuestionLog(pool, botId, accountId),
  };
}

const accountGlobal = globalThis as typeof globalThis & { n6Account?: AccountDependencies };
export function getAccountDependencies(): AccountDependencies {
  return accountGlobal.n6Account ??= (() => {
    const { pool, redis, auth, config } = getRuntime();
    return createAccountDependencies({ pool, publicOrigin: config.publicOrigin, sessionSecret: config.sessionSecret,
      allowMutation: (ip, account) => allowMutation(redis, ip, config.sessionSecret, account),
      authenticate: (token) => auth.authenticate(token) });
  })();
}
