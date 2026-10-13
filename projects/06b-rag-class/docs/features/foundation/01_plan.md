# Фича 1 · foundation — план

**Дата:** 2026-09-30 · **База:** `14834bae` (`feature/06b-rag-class`) · **Исполнитель:** Claude Opus 5.5, один исполнитель
(worktree-агент), ревью — отдельный новый агент.

## Тир

`bash ../../scripts/complexity-router.sh` по целевым файлам → **L** (признак «миграция схемы»). Оговорка правила
`complexity-router.md`: SPARC-комплект моложе недели, FR-n6b-1/16 и алгоритмы «Register and login», «Boot config check» есть
в Pseudocode → фаза PLAN уже выполнена документами; исполняется как **M с обязательным набором**: страж + мутация,
конкурентный тест (предел входа — разделяемый счётчик), перекрёстное чтение Specification + Architecture, полный прогон
всех наборов. Фаза REVIEW — отдельным агентом (условие владельца №6).

## Что входит (дорожная карта, `foundation`)

| Единица | Файлы | Требования |
|---|---|---|
| Монорепо npm workspaces | `package.json`, `tsconfig.base.json`, `apps/{web,widget}`, `services/worker`, `packages/{db,rag}` | ADR-001 |
| Схема 16 сущностей + pgvector | `packages/db/migrations/001_init.sql` | Pseudocode → Data Structures, Architecture → Data Architecture |
| Роли, гранты, RLS по `account_id` | `packages/db/migrations/002_rls.sql`, `packages/db/src/tenant.ts` | NFR-n6b-3 |
| Раннер миграций, роль приложения | `packages/db/src/migrate.ts` | Architecture → Docker Compose |
| Атомарная квота (для предела входа; общий модуль для spend-ceilings) | `packages/db/src/quota.ts` | FR-n6b-1, FR-n6b-16 |
| Boot config check (13 переменных, закрытый список) | `packages/db/src/boot-config.ts`, `apps/web/src/server/config.ts`, `apps/web/src/instrumentation.ts`, `services/worker/src/config.ts` | FR-n6b-16, NFR-n6b-3, SC-US-016-2 |
| Регистрация, вход, выход | `apps/web/src/server/{auth,auth-store,auth-handler,ip}.ts`, `app/api/auth/*/route.ts` | FR-n6b-1, SC-US-001-1…4 |
| `GET /api/health` | `apps/web/src/app/api/health/route.ts` | NFR-n6b-5 |
| Страж проброса окружения | `scripts/check-env-wiring.{sh,mjs}` | deployment-seams, страж №1 |

## Решения исполнителя (названы, не подразумеваются)

1. **Контекст арендатора** — `set_config('app.account_id', $1, true)` в транзакции под ролью `n6b_tenant`; список видимых
   аккаунтов (свой + подаккаунты с `studio_access=true`) вычисляет функция БД `n6b_account_ids()`, а не приложение.
   Документы называют `app.account_ids` — имя изменено, потому что список не передаётся с клиента.
2. **Роли:** `n6b_app` (LOGIN, NOINHERIT — сама по себе прав не имеет), `n6b_tenant` (под RLS), `n6b_service` (BYPASSRLS —
   публичные и системные пути: вход, квоты, журнал вызовов). Запрос без `SET LOCAL ROLE` → `permission denied` (fail-closed).
3. **`source_file.account_id`** денормализован (в Data Structures его нет, Architecture требует RLS по `account_id` для SourceFile).
4. **Проверка конфигурации** — один валидатор в `packages/db/src/boot-config.ts`, списки — у каждого процесса
   (web: 13 из Pseudocode; worker: ключ и два предела эмбеддингов). Вторая копия валидатора была бы дефектом.
5. **Предел входа** резервируется отдельной закоммиченной транзакцией ДО разбора тела и bcrypt (порядок
   security-operation-order: лимит до валидации); попытка засчитывается и при последующем 401/409/422.
6. Адрес клиента — последний элемент `X-Forwarded-For` (web доступен только через прокси); нет адреса → 503, а не вход без предела.
7. Закрытые множества — `packages/db/src/enums.ts`; тест сверяет CHECK миграции с ними (слой 1).

## Не входит (другие фичи дорожной карты)

Потолки ответов и песочницы (`spend-ceilings`, XL) — переменные `LIMIT_ANSWER_*`, `LIMIT_SANDBOX_*`, `LIMIT_EMBED_*`,
`MIN_SIMILARITY` проверяются при старте, но решением читаются в своих фичах; страж CFG-I5 держит их в явном списке
«ещё не подключены» с именем фичи. Виджет, RAG, воркер задач — только манифесты workspace.

## Проверки

Unit (vitest) + integration на Postgres+pgvector во внутренней сети docker без публикации портов, пароли `openssl rand`.
Мутации: RLS-политика, отказ конфигурации на `''`, предел входа до bcrypt. Выводы — `tests/artifacts/foundation/`.
