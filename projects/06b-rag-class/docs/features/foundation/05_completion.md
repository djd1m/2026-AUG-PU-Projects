# Фича 1 · foundation — завершение

**Дата:** 2026-09-30 · **Исходная ревизия:** `14834bae` · **Код фичи:** `fc61fa02..00e8f493` (+ коммит с этим файлом) ·
**Исполнитель:** Claude Opus 5.5 (один исполнитель, worktree) · **Ревью:** отдельный новый агент — не проводилось здесь.

## Что сделано

| Требование | Реализация | Доказательство |
|---|---|---|
| Монорепо npm workspaces (ADR-001) | `package.json` (5 workspace), `tsconfig*.json`, `vitest*.config.ts` | `docker build` трёх целей Dockerfile — OK (`tests/artifacts/foundation/docker-build.txt`) |
| 16 сущностей + pgvector (ADR-002) | `packages/db/migrations/001_init.sql` | int: все 16 таблиц, pgvector 0.8.x, HNSW `vector_cosine_ops`, размерность 1536 обязательна |
| Роли, RLS по `account_id` (NFR-n6b-3) | `002_rls.sql`, `packages/db/src/tenant.ts` | две роли входа (`n6b_app_tenant` → `n6b_tenant`, `n6b_app_service` → `n6b_service`, ответ на F-3); четыре файла int: `rls.test.ts`, `rls-catalog.test.ts`, `roles.test.ts`, `tenant-fk.test.ts` (R-1 узкой перепроверки) |
| Атомарные квоты | `packages/db/src/quota.ts` | int: 50 параллельных при пределе 3 → ровно 3; откат всех ключей попытки |
| Boot config check (FR-n6b-16, SC-US-016-2) | `packages/db/src/boot-config.ts`, `apps/web/src/server/config.ts`, `apps/web/src/instrumentation.ts`, `services/worker/src/{config,main}.ts` | unit 63 + 3 (процесс воркера); образ web без окружения → exit 1 «OPENROUTER_API_KEY не задан: …» |
| Регистрация/вход/выход (FR-n6b-1, SC-US-001-1…4) | `apps/web/src/server/{auth,auth-store,auth-handler,ip,runtime}.ts`, `app/api/auth/*` | unit 13 + int 9 на реальном bcrypt 12 и `quota_counter`; образ web: регистрация → 201 и cookie |
| `GET /api/health` (NFR-n6b-5) | `apps/web/src/server/health.ts`, `app/api/health/route.ts` | образ web: 200 `{"status":"ok","db":"ok"}`; 503 без БД/конфигурации (unit) |
| `scripts/check-env-wiring.sh` | `scripts/check-env-wiring.{sh,mjs}` | код 0: web=16, worker=6, migrate=2 чтений; мутация → код 1 |

## Переиспользование N1–N5

| Модуль | Источник | Статус |
|---|---|---|
| auth bcrypt + фиктивный хэш (N5 #24) | `projects/05-podcast-clips-opus/apps/web/src/server/{auth,auth-store,auth-handler}.ts` | **адаптировано**: cost 10→12, пароль ≥10, `kind`, предел по адресу ДО разбора тела, 409 по спецификации, схема N6b |
| адрес клиента / IPv6 /64 (N5 #20) | `projects/05-podcast-clips-opus/apps/web/src/server/ip.ts` | **адаптировано**: последний элемент XFF, IPv4 целиком (а не /24) для входа, HMAC с `VISITOR_SECRET` |
| сессия HMAC, fail-closed секрет (N1 #6) | `projects/01-testimonials-senja/apps/web/src/lib/session.ts` | **адаптировано** (идея HMAC-хэша токена влита в `AuthService.tokenHash`; секрет проверяет Boot config check) |
| RLS-транзакция SET LOCAL (N1 #9) | `projects/01-testimonials-senja/packages/db/{migrations/002_roles.sql,007_rls.sql,src/tenant.ts}` | **адаптировано**: роль приложения NOINHERIT, FORCE RLS, список аккаунтов считает функция БД (подаккаунты студии) |
| раннер миграций (N1) | `projects/01-testimonials-senja/packages/db/src/migrate.ts` | **адаптировано**: advisory-блокировка, пароль роли приложения |
| атомарные квоты (N4 #14) | `projects/04-calorie-vision-cal-ai/packages/db/src/quota.ts` | **адаптировано**: `quota_counter(scope, day)`, сутки и час по Москве |
| check-env-wiring (N5 #10) | `projects/05-podcast-clips-opus/scripts/check-env-wiring.{sh,mjs}` | **адаптировано**: сервисы N6b, закрытые списки `name: 'X'`, плейсхолдеры вместо секретов машины |
| check-compose-buildable (N1 #10) | `projects/01-testimonials-senja/scripts/check-compose-buildable.sh` | **не перенесён**: сборка проверена `docker build` трёх целей без запуска стека (стенд не поднимается) |
| compose-каркас (N5 #22) | `projects/05-podcast-clips-opus/docker-compose.yml` | **не менялся**: скелет Фазы 4 уже был; foundation сделала его собираемым |
| подаккаунт один уровень (N2 #11) | `projects/02-review-qr-reputation/packages/db/migrations/002_core.sql` | **написано заново** по той же идее: триггер `account_one_level` |
| `enums.ts`, `boot-config.ts`, `health.ts`, страж CFG-I5 | — | **написано заново** |

Код `projects/06-rag-sales-chatbase/**` не открывался.

## Проверки

- typecheck: 0 ошибок; unit: **119 passed**; integration (pgvector во внутренней сети docker, без портов, пароли
  `openssl rand`): **35 passed**. Файлы: `tests/artifacts/foundation/{unit-green,int-green}.txt`.
- Мутации (`tests/artifacts/foundation/mutations.txt`), каждый дефект → красный, восстановлен `git checkout`:

| Мутация | Результат с дефектом |
|---|---|
| M1 RLS выключена на `bot` | 9 failed / 21 |
| M2 политика `USING (true)` | 13 failed / 21 |
| M3 `studio_access` игнорируется | 1 failed / 21 |
| M4 `''` принимается конфигурацией | 13 failed / 66 |
| M5 пара «персональный ≤ общего» не проверяется | 4 failed / 66 |
| M6 предел через `Number()` | 9 failed / 63 |
| M7 предел входа пропускается | 3 failed / 9 (int) |
| M9 IPv6 — адрес целиком вместо /64 | 2 failed / 10 |
| M10 без фиктивного хэша | 1 failed / 14 |
| M11 `LIMIT_AUTH_ADDR_HOUR` не проброшен в compose | `check-env-wiring.sh` → код 1 «web: LIMIT_AUTH_ADDR_HOUR» |

- Стражи (`tests/artifacts/foundation/guards.txt`): `check-ports.cjs .` 0 · `check-port-conflicts.sh` 0 ·
  `check-env-wiring.sh` 0. Compose требует `${VAR:?}`, поэтому стражи запускаются с плейсхолдерами из `.env.example`.
- Образы (`image-smoke.txt`, внутренняя сеть, без портов): migrate 0; web без окружения → exit 1 с именем переменной;
  web → `/api/health` 200, регистрация 201; worker без окружения → exit 1.

## Отклонения и не сделано

1. Контекст арендатора — `app.account_id` (одно значение), список видимых аккаунтов считает `n6b_account_ids()`;
   документы подогнаны (Architecture, Pseudocode, `security.md` — ответ на F-8).
2. `source_file.account_id` добавлен (в Data Structures его нет; нужен для RLS по Architecture).
3. Валидатор конфигурации лежит в `packages/db` (общий для web и worker), а не в отдельном пакете.
4. Из 13 переменных решениями читаются 4 (`SESSION_SECRET`, `VISITOR_SECRET`, `PUBLIC_BASE_URL`, `LIMIT_AUTH_ADDR_HOUR`);
   остальные 9 — в `PENDING_DECISIONS` с id фичи (`spend-ceilings`, `rag-answer-sandbox`); страж CFG-I5 падает, если
   имя подключено, но осталось в списке, или не подключено и не в списке.
5. Экраны регистрации и входа (`/register`, `/login`) и кабинет-заглушка (`/cabinet`) **добавлены в foundation по решению
   координатора** (ответ на F-9 валидации): форма шлёт в существующие `/api/auth/*`, показывает текст ошибки сервера,
   после входа ведёт в кабинет; содержимое кабинета — следующие фичи.
6. Воркер: только проверка конфигурации и файл-пульс, аренда задач — фича `index-jobs`. Пульс пишется, хотя задачи не
   берутся (в журнале это сказано) — healthcheck воркера до `index-jobs` означает «процесс жив», не «работает».
7. Интеграция — стек `compose.test.yml` (`name: n6b-test`, ответ на F-5): все наборы одной командой из
   `DEVELOPMENT_GUIDE.md` §5; без `TEST_DATABASE_URL_OWNER`/`TEST_TENANT_PASSWORD`/`TEST_SERVICE_PASSWORD` тесты падают.
8. Адрес клиента без `X-Forwarded-For` → 503: прямой отладочный вход на `127.0.0.1:3106` без прокси не работает намеренно.
9. Дорожная карта (`status`) не обновлялась — до ревью.

Status: completed
