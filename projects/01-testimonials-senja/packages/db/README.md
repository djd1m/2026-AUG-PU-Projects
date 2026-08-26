# @proofwall/db

Слой доступа к данным Proofwall: SQL-миграции, роли/RLS-политики и тонкий типизированный клиент
на `pg`. **Без ORM** — `docs/Architecture.md` §3.1 осознанно выбрала чистый SQL + RLS, потому что
ORM мешает политикам RLS. Бизнес-логика (валидация, HTTP-роуты, вызовы Claude API) сюда не
входит — она в `apps/web` / `services/worker`.

## Структура

```
migrations/   001…008 — пронумерованные идемпотентные SQL-миграции
src/
  index.ts      пул соединений (pg.Pool), реэкспорт tenant/rate-limit/types
  tenant.ts     withAccount() / withService() — переключение роли + контекст арендатора
  rate-limit.ts единый rate-limit/anti-fraud помощник (Architecture §3.4)
  types.ts      TS-типы строк таблиц
  migrate.ts    раннер миграций
tests/        интеграционные тесты на реальной Postgres (не моки)
```

## Как накатить миграции

```bash
cp ../../.env.example ../../.env   # если ещё не сделано — заполнить DATABASE_URL
npm run db:migrate                 # из корня репозитория (алиас на packages/db/migrate)
# или напрямую:
DATABASE_URL=postgres://proofwall:...@localhost:5432/proofwall npm run migrate --workspace packages/db
```

Миграции идемпотентны (`IF NOT EXISTS`, `DROP POLICY IF EXISTS` перед `CREATE POLICY`) и
применяются по возрастанию имени файла. Уже применённые — отслеживаются в служебной таблице
`schema_migrations` (заводится раннером автоматически), повторный запуск — no-op.

## Как устроены роли (Architecture §3.1)

Приложение подключается к Postgres **одним** пользователем — тем, что задан в `DATABASE_URL`
(`POSTGRES_USER` из `.env.example`). Две прикладные роли переключаются **внутри транзакции**
через `SET LOCAL ROLE`, а не отдельными учётными данными:

| Роль | RLS | Когда | Как получить |
|---|---|---|---|
| `app_authenticated` | применяется | Дашборд/модерация — есть проверенная сессия владельца | `withAccount(accountId, fn)` |
| `app_service` | **BYPASSRLS** | Форма, виджет, Wall of Love, вебхуки, воркер — анонимные/системные пути | `withService(fn)` |

```ts
import { withAccount, withService } from '@proofwall/db';

// Дашборд-путь: RLS фильтрует строки САМА, WHERE project_id дублировать не нужно.
await withAccount(session.accountId, async (client) => {
  await client.query('update testimonials set status = $1 where id = $2', ['approved', id]);
});

// Анонимный путь: BYPASSRLS — изоляция ИСКЛЮЧИТЕЛЬНО на явном фильтре в коде.
await withService(async (client) => {
  const project = await client.query('select id from projects where slug = $1', [slug]);
  await client.query('select id from testimonials where project_id = $1 and status = $2', [
    project.rows[0].id,
    'approved',
  ]);
});
```

## Чего нельзя делать (non-negotiable, security.md §2)

- **Никогда** не принимать `project_id` от клиента в анонимном роуте — только `slug`, резолвить
  в код через `withService`. `app_service` не подстрахует забытый `WHERE project_id = ...` — она
  **обходит RLS полностью** (`BYPASSRLS`), это не баг, а осознанное решение Architecture §3.1 п.2.
- **Не** вызывать `withService`, когда применим `withAccount` — это осознанно снижает защиту.
- **Не** заводить отдельный rate-limit/anti-fraud стор под новое требование того же класса
  задачи ("не более N событий за интервал T по ключу") — расширять `scope` в
  `rate_limit_events` (`packages/db/src/rate-limit.ts`), см. `.claude/rules/security.md` §4.
- **Не** делать `SELECT` перед `INSERT` там, где нужна идемпотентность/анти-гонка —
  использовать `UNIQUE` constraint + `ON CONFLICT ... DO NOTHING RETURNING id`
  (`widget_installs`, `webhook_events`, `commissions` — см. ADR-006).
- **Не** трогать миграции задним числом после того, как они применены в любом окружении —
  добавлять новую пронумерованную миграцию.

## Как запускать тесты

Тесты — интеграционные, гоняются на **реальной** Postgres (правило `.claude/rules/testing.md` §1:
RLS/rate-limit/идемпотентность не эмулируются юнитом). Нужна пустая тестовая БД с накаченными
миграциями:

```bash
# поднять тестовую Postgres (когда появится compose.test.yml в корне репозитория — см. GAP ниже)
docker compose -f ../../compose.test.yml up -d postgres

# накатить миграции на тестовую БД
DATABASE_URL=postgres://postgres:postgres@localhost:5432/proofwall_test npm run migrate

# прогнать тесты
TEST_DATABASE_URL=postgres://postgres:postgres@localhost:5432/proofwall_test npm test
```

`TEST_DATABASE_URL` (или `DATABASE_URL`, если первого нет) — единственная переменная, которую
читают тесты (`tests/setup.ts`). Каждый тестовый файл выполняется последовательно
(`vitest.config.ts`: `fileParallelism: false`) и очищает все таблицы (`TRUNCATE ... CASCADE`)
перед каждым тестом.

**[GAP: `compose.test.yml` — тестовая Postgres-схема для CI — упоминается в
`DEVELOPMENT_GUIDE.md` §3 и `.claude/rules/testing.md`, но сам файл не входит в scope
`packages/db` (это корневой файл docker-compose) — его создание не описано ни в одном документе,
за которым закреплён `packages/db`.]** До его появления — поднять Postgres 16 вручную
(`docker run -p 5432:5432 -e POSTGRES_PASSWORD=postgres postgres:16-alpine`) и передать
`TEST_DATABASE_URL` явно.

Что покрыто (порядок — по риску проекта, `.claude/rules/testing.md` §1):

1. **RLS** (`tests/rls.test.ts`) — аккаунт A не видит/не может изменить проект и отзыв
   аккаунта B; собственные данные видны и модерируются нормально.
2. **`widget_installs`** (`tests/widget-installs.test.ts`) — повторная вставка `(project_id,
   domain)` не создаёт вторую строку; новая пара — создаёт; 10 параллельных вставок на один
   новый домен дают ровно одного "победителя" (тест гонки, Architecture §3.3).
3. **rate-limit** (`tests/rate-limit.test.ts`) — счётчик в окне работает, за окном — нет, разные
   `scope` не смешиваются, `revoke` откатывает списанную квоту (W-5), почасовая очистка.
4. **Идемпотентность** (`tests/idempotency.test.ts`) — повторный `event_id` в `webhook_events` и
   повторный `payment_event_id` в `commissions` не создают вторую строку (ADR-006, буквальный
   тест-контракт документа).

## Известные пробелы (см. также `.claude/rules/p-replicator-known-gaps.md`)

- `projects.deactivated` — используется в `Pseudocode.md` §5.1, но не описан в
  `Architecture.md` §3/§10 как поле и не имеет описанного правила выставления (см. комментарий в
  `migrations/003_core.sql`).
- `partner_codes.commission_rate` — ставка комиссии по умолчанию не зафиксирована ни в одном
  документе (открытый вопрос владельца продукта, `CLAUDE.md`) — колонка nullable.
- `sessions.expires_at` TTL и политика ротации — не зафиксированы числом (`Architecture.md` §3.2).
- Выбор платёжного провайдера — не зафиксирован (`Architecture.md` §3.5/§9/§11); схема
  `checkout_sessions`/`webhook_events` провайдер-агностична (ADR-006).
- Валюта/точность суммы `commissions.amount` — не зафиксированы.
- `testimonial.public_id`, упомянутый в `Pseudocode.md` §1, трактуется как `id` (uuid) — отдельной
  колонки нет; не описан как отдельное поле ни в одном документе.
