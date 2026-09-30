// Транзакции с ролью и контекстом арендатора — перенос N1 packages/db/src/tenant.ts (#9), адаптирован:
// пул передаётся явно (синглтон создаёт процесс), контекст — app.account_id, список видимых аккаунтов считает БД.
//
// withTenant  — кабинет. Роль n6b_tenant, RLS фильтрует строки сама (002_rls.sql).
// withService — вход, квоты, публичные ручки, воркер. Роль n6b_service BYPASSRLS: изоляция арендаторов здесь —
//               ИСКЛЮЧИТЕЛЬНО явный WHERE в вызывающем коде. RLS его не подстрахует.
// Соединение пула возвращается после COMMIT/ROLLBACK: SET LOCAL не переживает транзакцию (урок N1: иначе контекст
// одного арендатора достался бы следующему запросу на том же соединении).

import type { Pool, PoolClient } from './pool.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function inTransaction<T>(pool: Pool, setup: (c: PoolClient) => Promise<void>,
  fn: (c: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await setup(client);
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined); // исходную ошибку не теряем
    throw error;
  } finally {
    client.release();
  }
}

/** accountId обязан прийти из проверенной сессии; проверка формата — последний рубеж, не замена ей. */
export function withTenant<T>(pool: Pool, accountId: string, fn: (c: PoolClient) => Promise<T>): Promise<T> {
  if (!UUID_RE.test(accountId)) return Promise.reject(new Error('withTenant: accountId не uuid'));
  return inTransaction(pool, async (c) => {
    await c.query('SET LOCAL ROLE n6b_tenant');
    await c.query("SELECT set_config('app.account_id', $1, true)", [accountId]);
  }, fn);
}

export function withService<T>(pool: Pool, fn: (c: PoolClient) => Promise<T>): Promise<T> {
  return inTransaction(pool, async (c) => {
    await c.query('SET LOCAL ROLE n6b_service');
  }, fn);
}
