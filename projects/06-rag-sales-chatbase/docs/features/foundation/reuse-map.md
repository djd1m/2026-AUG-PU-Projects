# foundation — карта переиспользования (источник → назначение → что изменено)

**Дата:** 2026-09-25 · **Донор:** N5 `projects/05-podcast-clips-opus` (ADR-012), N4 через скаффолд Phase 3
(ADR-014). Файлы N5 читались из рабочего дерева; тронутые в нём параллельным агентом файлы
(`enums.ts`, `vitest.config.ts` и др. из `git status`) в N6 не копировались дословно — N6 берёт только
форму. В каждом скопированном файле первая строка — комментарий `из N5: <путь> — <что изменено>`
(в `package.json` — ключ `"//"`, JSON комментариев не допускает).

## Ответ по строкам `reuse` роадмапа (обязателен, reuse-inventory «Как применяется»)

| # | ADR | Блок | Ответ | Что именно |
|---|---|---|---|---|
| 1 | ADR-012 | вход, сессии, bcrypt вне транзакции (`auth.ts`, `auth-store.ts`, `auth-handler.ts`) | **адаптировано** | cookie `__Host-n6_session`; колонка `session.token_hash` (Pseudocode) вместо `cookie_token_hash`; ответы в форме API Contracts N6 `{ data }` / `{ error: { code, message } }`; `readAccountStatus` из `@n6/rag`; срок сессии из `SESSION_TTL_DAYS` |
| 2 | ADR-012 | префикс IP, лимит частоты (`ip.ts`, `rate-limit.ts`) | **`rate-limit.ts` перенесено** (префикс ключа `n6:`) · **`ip.ts` адаптировано** | дверь N6 ЗАМЕНЯЕТ XFF одним адресом → `clientIp` принимает ровно одно значение, без `trustedProxyHops` (A-N6-021); IPv6 — /48 по канону §7 вместо /64 |
| 3 | ADR-012 | compose, Caddy, воспроизведение, `check-env-wiring.*`, `check-env-complete.sh` | **адаптировано частично** | `docker-compose.yml`, `proxy/Caddyfile` адаптированы скаффолдом Phase 3/4 и в этой фиче ВПЕРВЫЕ собраны; тестовый профиль N5 вынесен в `compose.test.yml` (`name: n6-test`, без MinIO); `check-env-wiring.*` — сервисы `web` и `worker-index`, пакеты `@n6/*`; `check-env-complete.sh` — перенесено. **`docs/REPRODUCE.md` НЕ написан:** он описывает выпуск на стенд (DEVELOPMENT_GUIDE §5 п.6), стенда ещё нет |
| 4 | ADR-014 | дверь с лимитом (N4 `Caddyfile`, `proxy/Dockerfile`) | **перенесено скаффолдом Phase 3, в этой фиче не менялось** | проверено: образ собран, шаг `caddy list-modules \| grep -q http.handlers.rate_limit` выполнен на сборке, `caddy validate` → `Valid configuration`; числа 30/120 и `header_up X-Forwarded-For {client_ip}` закреплены `tests/proxy-rate.test.ts` |

## Файлы

| Источник (N5, если не сказано иное) | Назначение (N6) | Что изменено |
|---|---|---|
| `package.json` | `package.json` | имя `n6-sufler`; сборка db → rag → worker → web; typecheck сначала собирает db/rag (их `dist` нужен типам web/worker); без playwright/axe |
| `tsconfig.base.json` | `tsconfig.base.json` | без изменений |
| `vitest.config.ts` | `vitest.config.ts` | алиасы `@n6/rag`, `@n6/db`; без браузерного набора; таймауты 20 с |
| `scripts/test.mjs` | `scripts/test.mjs` | без изменений |
| `scripts/test-skip-reporter.ts` | `scripts/test-skip-reporter.ts` | без `S3_ENDPOINT`; флаг `N6_ACCEPTANCE` |
| `scripts/lint.mjs` | `scripts/lint.mjs` | без изменений |
| `scripts/test-db.mjs` | `scripts/test-db.mjs` | пакет `@n6/db` |
| `scripts/check-env-wiring.mjs` | `scripts/check-env-wiring.mjs` | корни `web`, `worker-index`; `@n6/*`; config из `packages/rag/src/config.ts` |
| `scripts/check-env-wiring.sh` | `scripts/check-env-wiring.sh` | без профиля `test`; `N6_ENV_FILE` — env-файл вне репозитория |
| `scripts/check-env-complete.sh` | `scripts/check-env-complete.sh` | только комментарий |
| `scripts/test-limits-mutations.mjs` | `scripts/test-ceilings-mutations.mjs` | та же схема «копия → дефект → красный → восстановление → зелёный»; 5 мутаций стража старта; `node_modules/@n6/*` указывают на КОПИЮ (иначе подпроцессы грузили бы оригинал) |
| `Dockerfile` | `Dockerfile` | манифесты 4 workspace N6; без ffmpeg/OpenCV; цель `migrate`; CMD — файлы, не `npm start` |
| `.dockerignore` | `.dockerignore` | `!docs/canon.md` последней строкой (тест читает перечень потолков из канона) |
| `docker-compose.yml` (профиль `test`) | `compose.test.yml` | отдельный файл с `name: n6-test`; `pgvector/pgvector:0.8.6-pg16` на tmpfs; без MinIO; без портов на хосте |
| `packages/db/package.json`, `tsconfig.json` | `packages/db/*` | имя `@n6/db`; скрипт `migrate`; без зависимости от shared |
| `packages/db/src/index.ts` | `packages/db/src/pool.ts` + `index.ts` | пул вынесен в `pool.ts` (expected_files); `application_name` n6; quota/attempts — фичи `quota-and-spend`, `index-job-core` |
| `packages/db/src/migrate.ts` | `packages/db/src/migrate.ts` | номер advisory-lock `60925001` |
| `packages/db/migrations/001_init.sql` (форма) | `packages/db/migrations/001_init.sql` | **написано заново по форме донора**: 19 сущностей канона §4, `CREATE EXTENSION vector WITH SCHEMA public`, `vector(1536)` + HNSW cosine m=16/ef_construction=64, CHECK закрытых перечислений, UNIQUE, несущие атомарность (Architecture «Data Architecture») |
| `packages/shared/src/config.ts` | `packages/rag/src/config.ts` | `required`/`url`/`loadConnectionConfig` перенесены; потолки — 14 `QUOTA_*` канона с таблицей (scope, вид предела) и 8 парами «персональный ≤ общего»; модели из закрытого набора (A-N6-022); `N6_PUBLIC_ORIGIN` без слеша и без петли вне dev/test; S3, водяной знак и число звеньев прокси убраны |
| `packages/shared/src/enums.ts` (форма) | `packages/rag/src/enums.ts` | **написано заново**: значения канона N6 §4, чтение неизвестного — самое строгое |
| `packages/shared/package.json` | `packages/rag/package.json` | имя `@n6/rag` (канон: общий пакет N6 — `packages/rag`) |
| `apps/web/package.json`, `tsconfig*.json`, `next.config.ts` | `apps/web/*` | без tRPC, S3, очереди |
| `apps/web/src/preflight.ts`, `instrumentation.ts`, `server/runtime.ts`, `server/route.ts`, `server/environment.ts` | те же пути | конфиг `@n6/rag`; без сторожа очереди; переменные N6 |
| `apps/web/src/server/auth*.ts`, `ip.ts`, `rate-limit.ts` | те же пути | строки 1–2 таблицы выше |
| `apps/web/src/app/api/auth/*/route.ts` | те же пути | без изменений |
| `apps/web/src/app/health/route.ts` | тот же путь | здоровье требует расширения `vector` (без него БД отвечает, но индексировать не может) |
| `apps/worker/package.json`, `tsconfig.json` | `apps/worker/*` | только `@n6/rag`; `src/` вместо `workers/` |
| — (образец формы — `apps/web/src/server/environment.ts`) | `apps/worker/src/environment.ts`, `src/index.ts` | **написано заново**: у N5 нет воркера индексации; процесс только проверяет конфигурацию и пишет отметку жизни для healthcheck compose |
| `tests/auth.test.ts`, `database.integration.test.ts`, `health.test.ts`, `proxy-rate.test.ts`, `fixtures/environment.ts`, `tsconfig.json`; `config.test.ts` (форма) | `tests/*` | переменные, таблицы и числа N6; + ADR-001 Confirmation (HNSW на 3072 падает), CHECK-инварианты, конкурентный лимит на настоящем Redis |
| — | `tests/enums.test.ts`, `tests/compose.test.ts`, `tests/redis.integration.test.ts` | **написано заново**: CHECK миграции = перечисления кода; гигиена compose/Dockerfile слоем 1 |

## Что из N5 сознательно НЕ взято

`packages/shared` (роль у `@n6/rag`), `packages/s3` (у N6 нет объектного хранилища, ADR-018),
`packages/queue` и `attempts.ts` (фича `index-job-core`), `quota.ts` и `spend.ts` (фича
`quota-and-spend`), `N5_TRUSTED_PROXY_HOPS` (A-N6-021), `bcrypt-load.test.ts` (опирается на
`UV_THREADPOOL_SIZE` в compose web, которого у N6 нет — нагрузочная проверка входа не перенесена).
