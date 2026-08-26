// packages/db/src/tenant.ts
//
// Источник: docs/Architecture.md §3.1 ("Два независимых места" изоляции арендаторов), §3.2
// (контекст сессии владельца); .claude/rules/security.md §2.
//
// withAccount — аутентифицированный дашборд-путь. Роль app_authenticated, транзакция получает
//   контекст `SET LOCAL app.current_account_id` — RLS-политики (007_rls.sql, 008_audit.sql)
//   фильтруют строки САМИ, код обработчика не обязан дублировать WHERE project_id.
//
// withService — анонимные пути (форма, виджет, Wall of Love) и системные операции без сессии
//   владельца (вебхуки, воркер транскрипции). Роль app_service — BYPASSRLS.
//
//   ВНИМАНИЕ (буквально security.md §2): RLS для этой роли НЕ применяется НИ НА ОДНОЙ таблице.
//   Изоляция арендаторов на этих путях — ИСКЛЮЧИТЕЛЬНО обязанность вызывающего кода: каждый
//   обработчик обязан резолвить slug → project_id и фильтровать
//   `.where('project_id', projectId)` сам. Ни один анонимный роут не должен принимать project_id
//   от клиента напрямую — только slug. packages/db не может проверить это за вызывающую сторону;
//   если фильтр в коде забыт, RLS его НЕ подстрахует.

import type { PoolClient } from 'pg';
import { pool } from './index';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function runInTransaction<T>(
  setup: (client: PoolClient) => Promise<void>,
  fn: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await setup(client);
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch {
      // соединение уже могло быть разорвано БД — ROLLBACK может упасть сам, исходную ошибку не теряем
    }
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Открывает транзакцию под ролью app_authenticated с контекстом арендатора
 * `app.current_account_id = accountId`. Внутри fn действуют RLS-политики (Architecture §3.1) —
 * запросы автоматически видят только строки, принадлежащие этому account_id.
 *
 * accountId ДОЛЖЕН приходить из уже проверенной сессии (Architecture §3.2), не из
 * непроверенного пользовательского ввода — валидация формата здесь (правило проекта
 * "Validate input at system boundaries") — последний рубеж, не замена проверке сессии выше по стеку.
 */
export async function withAccount<T>(
  accountId: string,
  fn: (client: PoolClient) => Promise<T>,
): Promise<T> {
  if (!UUID_RE.test(accountId)) {
    throw new Error(`withAccount: accountId не похож на uuid: ${JSON.stringify(accountId)}`);
  }
  return runInTransaction(async (client) => {
    // SET LOCAL ROLE не принимает bind-параметры (имя роли — идентификатор, не значение), но имя
    // здесь литеральная константа — инъекция невозможна.
    await client.query('SET LOCAL ROLE app_authenticated');
    // set_config(name, value, is_local=true) == SET LOCAL, но через обычный параметризованный
    // запрос: `SET LOCAL app.x = $1` Postgres не поддерживает bind-параметры для GUC.
    await client.query("SELECT set_config('app.current_account_id', $1, true)", [accountId]);
  }, fn);
}

/**
 * Открывает транзакцию под ролью app_service (BYPASSRLS) — для анонимных путей и системных
 * операций без контекста аккаунта. См. предупреждение в шапке файла: RLS не защищает НИЧЕГО
 * внутри этого вызова, фильтрация — на совести вызывающего кода.
 */
export async function withService<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  return runInTransaction(async (client) => {
    await client.query('SET LOCAL ROLE app_service');
  }, fn);
}
