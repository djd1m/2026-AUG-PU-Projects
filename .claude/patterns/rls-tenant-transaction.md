# Паттерн: изоляция арендаторов через роль БД и транзакцию

## Maturity: 🔴 Alpha · Извлечено: 2026-08-27 · Источник: `projects/01-testimonials-senja` · v1.0

## Когда применять

Многоарендное приложение на PostgreSQL, где у части путей есть аутентифицированный
владелец данных, а у части — нет (публичная страница, форма без входа, виджет, вебхук,
фоновый воркер). Требование: **владелец не видит чужих строк**, и это не должно зависеть
от того, вспомнил ли автор обработчика дописать `WHERE account_id = …`.

## Когда НЕ применять

- Один арендатор / нет разделения данных — RLS добавит стоимость без выгоды.
- ORM, скрывающий соединение: паттерн держится на том, что вся работа идёт **в одной
  транзакции одного соединения** (`SET LOCAL` действует до `COMMIT`). Пул, отдающий
  произвольное соединение на каждый запрос, ломает его молча.
- Аналитика/миграции под суперпользователем — им нужна отдельная роль и отдельный путь.

## Предпосылки

Три роли в БД и политики RLS на таблицах:

```sql
CREATE ROLE app_authenticated NOLOGIN;                 -- дашборд, под RLS
CREATE ROLE app_service       NOLOGIN BYPASSRLS;       -- анонимные и системные пути
-- владелец схемы (миграции) — третья, отдельная

ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON projects
  FOR ALL TO app_authenticated
  USING (account_id = current_setting('app.current_account_id', true)::uuid);
```

## Реализация

```ts
async function runInTransaction<T>(
  setup: (c: PoolClient) => Promise<void>,
  fn: (c: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await setup(client);              // роль и контекст ставятся ВНУТРИ транзакции
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch { /* соединение могло быть разорвано БД */ }
    throw err;                        // исходную ошибку не теряем
  } finally {
    client.release();                 // SET LOCAL откатывается вместе с транзакцией
  }
}

export async function withAccount<T>(accountId: string, fn: (c: PoolClient) => Promise<T>) {
  if (!UUID_RE.test(accountId)) throw new Error(`withAccount: не uuid: ${JSON.stringify(accountId)}`);
  return runInTransaction(async (c) => {
    // Имя роли — идентификатор, bind-параметры недопустимы; здесь это литеральная
    // константа, поэтому инъекция невозможна.
    await c.query('SET LOCAL ROLE app_authenticated');
    // Для GUC `SET LOCAL app.x = $1` не работает — set_config(..., true) это то же самое,
    // но обычным параметризованным запросом.
    await c.query("SELECT set_config('app.current_account_id', $1, true)", [accountId]);
  }, fn);
}

export async function withService<T>(fn: (c: PoolClient) => Promise<T>) {
  return runInTransaction((c) => c.query('SET LOCAL ROLE app_service').then(() => undefined), fn);
}
```

Внутри `withAccount` обработчик пишет обычный SQL без `WHERE account_id` — политика
фильтрует строки сама.

## Несущее ограничение (главное в паттерне)

**`withService` — это `BYPASSRLS`. RLS не применяется НИ НА ОДНОЙ таблице внутри него.**

Изоляция на анонимных путях — исключительно обязанность вызывающего кода:

- каждый анонимный обработчик резолвит `slug → project_id` **сам** и фильтрует по нему;
- ни один анонимный роут не принимает `project_id` от клиента — только `slug`;
- если фильтр забыт, **RLS не подстрахует** — забыт он будет молча.

Это ограничение обязано быть написано в шапке файла, а не жить в голове автора: соблазн
«взять `withService`, потому что с ним проще» возникает у каждого следующего обработчика.
Хороший ход — [страж по исходнику](source-parsing-invariant-guard.md), запрещающий приём
`project_id` из пользовательского ввода в `api/`.

## Подводные камни

| Камень | Что происходит |
|---|---|
| `SET ROLE` вместо `SET LOCAL ROLE` | Роль переживает транзакцию и утекает в следующий запрос по тому же соединению из пула |
| Работа с БД вне `withAccount/withService` | Запрос уйдёт под ролью владельца пула — то есть мимо всей защиты |
| `SET LOCAL app.x = $1` | Postgres не принимает bind-параметры для GUC; нужен `set_config(name, value, true)` |
| `current_setting('app.x')` без второго аргумента | Бросает исключение, если GUC не установлен; `true` даёт `NULL` — политика тогда не пропустит ничего, и это правильный отказ |
| `accountId` из пользовательского ввода | Проверка формата в `withAccount` — последний рубеж, а не замена проверке сессии выше по стеку |
| Тесты под суперпользователем | Зелёные тесты на выключенном RLS. Тестовая роль обязана быть `app_authenticated` |

## Как проверять

Отдельный тест-файл (`packages/db/tests/rls.test.ts`), который под `withAccount` одного
аккаунта пытается прочитать строку другого и требует ноль строк — и делает это для
**каждой** таблицы с политикой. Таблица без такого теста считается незащищённой.

## Родственные артефакты

- [`source-parsing-invariant-guard.md`](source-parsing-invariant-guard.md) — как запретить приём `project_id` от клиента на уровне исходника
- [`../rules/docker-ports.md`](../rules/docker-ports.md) — порт БД не публикуется наружу никогда

## Changelog

- v1.0: извлечено из `packages/db/src/tenant.ts` проекта `01-testimonials-senja`.
