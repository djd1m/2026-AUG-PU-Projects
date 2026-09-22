# Foundation — отчёт Codex

Дата: 2026-09-21. Реализация по `00_brief_codex.md` создана. Полная приёмка НЕ завершена:
интеграционные проверки PostgreSQL не выполнены, независимое Anthropic-ревью завершилось таймаутом,
а неизменяемый по постановке Dockerfile несовместим с выбранным в ней набором workspace.
Финальный статус ниже означает непрохождение всех ворот, а не отсутствие исходников.

## Что реализовано

- npm workspaces, Node 22, TypeScript 5 strict, Next.js 15 App Router, единый lockfile.
  Команды `build`, `lint`, `typecheck`, `test`, `db:migrate`.
- Общие union-типы, массивы перечислений и fail-closed чтение тарифов/статусов.
  Сверка каждого соответствующего SQL CHECK с массивом; для источников и событий без
  безопасного разрешающего значения неизвестное значение возвращает `null`.
- Ручная SQL-миграция всех 15 сущностей, связи, уникальности, частичные индексы, nullable-поля,
  мягкое удаление `video.deleted_at`, проверки оценок и объяснений, монотонная уникальность fence.
  Мигратор pg применяет SQL по порядку, проверяет SHA уже применённых файлов, сериализует запуски
  advisory-lock и выполняет изменения транзакционно. Down-миграции нет; откат описан в шапке SQL.
- Конфигурация отказывает при отсутствии, пустоте и непригодных значениях, объясняя последствия.
  Web валидирует все обязательные параметры один раз при старте через Next instrumentation;
  процессный singleton разделяется между бандлами. Для воркеров используются их роли из compose.
- Регистрация, вход и серверный logout. Bcrypt cost 10 вне соединения пула; фиктивное сравнение
  той же стоимости для неизвестного адреса. Аккаунт и сессия регистрации создаются одним CTE;
  занятый адрес получает такой же ответ и случайный cookie, не открывающий существующий аккаунт.
  Вход повторно проверяет активность аккаунта под блокировкой перед записью сессии.
- Токен сессии 256 бит; в БД только HMAC-SHA256 от него. Cookie `__Host-n5_session`:
  `HttpOnly; Secure; SameSite=Lax; Path=/`. IP сохраняется только как `/24`, включая IPv6.
  Истёкшая/отозванная сессия и неактивный аккаунт не авторизуются.
- Лимитер Redis: атомарный INCR/TTL, 30 мутирующих auth-запросов за минутное окно ДО чтения тела.
  Недоступность Redis закрывает вход. В Redis хранится HMAC адреса с TTL, не полный IP.
  Проверка Origin, ограничение JSON-потока 4096 байт и отказ паролей длиннее 72 байт bcrypt.
- `/health`: конфигурация плюс `SELECT 1`; 200 при успехе, иначе 503, без выдачи деталей ошибок.
- Три заглушки воркеров стартуют, читают конфигурацию и ждут; SIGINT/SIGTERM завершают ожидание.
  S3 оставлен явно пустым каркасом.
- `check-env-wiring.sh`: настоящий `docker compose config --format json`, граф импортов каждого
  сервиса, разбор TypeScript, имена с цифрами, явные исключения `NEXT_RUNTIME` и `NEXT_PHASE`.
  Динамическое непроверяемое чтение окружения даёт 2. Секреты разрешённого compose не печатаются.

## Созданные файлы

```text
package.json
package-lock.json
tsconfig.base.json
vitest.config.ts
apps/web/package.json
apps/web/tsconfig.json
apps/web/next.config.ts
apps/web/next-env.d.ts
apps/web/public/.gitkeep
apps/web/src/instrumentation.ts
apps/web/src/app/layout.tsx
apps/web/src/app/page.tsx
apps/web/src/app/health/route.ts
apps/web/src/app/api/auth/register/route.ts
apps/web/src/app/api/auth/login/route.ts
apps/web/src/app/api/auth/logout/route.ts
apps/web/src/server/auth.ts
apps/web/src/server/auth-store.ts
apps/web/src/server/auth-handler.ts
apps/web/src/server/environment.ts
apps/web/src/server/ip.ts
apps/web/src/server/rate-limit.ts
apps/web/src/server/route.ts
apps/web/src/server/runtime.ts
apps/worker/package.json
apps/worker/tsconfig.json
apps/worker/src/quota-environment.ts
apps/worker/src/wait.ts
apps/worker/workers/stt.ts
apps/worker/workers/select.ts
apps/worker/workers/render.ts
packages/db/package.json
packages/db/tsconfig.json
packages/db/src/index.ts
packages/db/src/migrate.ts
packages/db/migrations/001_init.sql
packages/shared/package.json
packages/shared/tsconfig.json
packages/shared/src/index.ts
packages/shared/src/enums.ts
packages/shared/src/config.ts
packages/s3/package.json
packages/s3/tsconfig.json
packages/s3/src/index.ts
scripts/check-env-wiring.sh
scripts/check-env-wiring.mjs
scripts/lint.mjs
tests/tsconfig.json
tests/fixtures/environment.ts
tests/config.test.ts
tests/enums.test.ts
tests/auth.test.ts
tests/health.test.ts
tests/wiring.test.ts
tests/database.integration.test.ts
docs/features/foundation/07_code_report.md
```

Квитанции, журналы проверок и телеметрия: `tests/artifacts/foundation/`.
Список SHA256 всех 55 исходных/тестовых/конфигурационных файлов — `source-snapshot.json`.
Сборочные `dist/`, `.next/` и `node_modules/` являются игнорируемыми результатами команд.

## Команды и фактические результаты

| Команда / проверка | Код | Результат |
|---|---:|---|
| `bash ../../scripts/complexity-router.sh packages/db/migrations/001_init.sql apps/web/src/app/api/auth/login/route.ts apps/worker/workers/stt.ts` | 1 | L: схема, публичный маршрут, несколько сервисов |
| `npm install --offline --cache /root/.npm --no-audit --no-fund` | 1 | ENOTCACHED для `@types/bcrypt` |
| `npm install --cache /tmp/n5-npm-cache --no-audit --no-fund --fetch-retries=0 --fetch-timeout=20000` | 0 | Установлены зависимости и записан lockfile |
| `npm run build` — первый и финальный прогоны | 0 | Все пять workspace; web показывает три auth-маршрута и `/health` |
| `npm run lint` | 0 | Локальные статические правила; это не ESLint |
| `npm run typecheck` | 0 | Все workspace и тестовые исходники |
| Первый `npm test` | 1 | EPERM синхронных pipe дочернего процесса в тесте конфигурации |
| Второй `npm test` | 1 | Слишком узкий regex текста последствия возврата слота |
| Финальный `npm test` | 0 | 55 passed, 6 skipped; все skipped требуют PostgreSQL |
| Семь запусков собранного `.next/server/instrumentation.js` без отдельного обязательного параметра | каждый 1 | Все шесть потолков и origin действительно останавливают старт, имя переменной присутствует |
| `bash scripts/check-env-wiring.sh` без настроенного окружения | 2 | Проверка не выполнена: compose не может разрешить обязательные параметры |
| Та же команда с временными синтетическими значениями из набора `.env.example` | 0 | Проверен фактический compose, потерь имён нет; `.env` не создавался |
| Страж wiring с удалённым `N5_LIMIT_USER_UPLOAD_REFUNDS` у web | 1 | Дефект обнаружен |
| `bash ../../scripts/check-port-conflicts.sh .` | 1 | Конфигурация не разрешена; строка о свободном порте НЕ доказывает готовность окружения |
| `docker compose version` | 0 | CLI v5.1.1 доступен |
| `docker info --format '{{.ServerVersion}}'` | 1 | Нет доступа к Docker socket |
| Попытка изолированного PostgreSQL 16 в `/tmp`, без TCP | 1 | Запрещены chown/смена групп; сервер не запущен |
| Независимое `claude -p --model sonnet --tools '' --no-session-persistence ...` | 1 | JSON: `is_error: true`, `Request timed out`, `modelUsage: {}` |
| `bash -n scripts/check-env-wiring.sh`, `git diff --check` | 0 | Синтаксис shell и проверка diff |

`db:migrate` против настоящей БД, `docker compose --profile test run --rm test`, развёртывание
и HTTP E2E НЕ запускались. PostgreSQL-тесты выбираются автоматически при наличии
`DATABASE_URL` отдельной БД с именем `*_test`; используют уникальную схему и удаляют только её.
Базу `n5_test` предварительно должен подготовить оператор: текущий compose создаёт только `n5`.

## Стражи и мутации

- Тариф: fallback заменён с `free` на `paid` → тест красный, exit 1.
- Потолки: обязательное чтение заменено дефолтом → отдельные запуски красные, exit 1.
- Bcrypt: внедрены `pool.connect`, `BEGIN`, `bcrypt.hash`, `COMMIT` внутри записи → страж красный,
  exit 1. Предварительная мутация только текстом не используется как доказательство этого дефекта.
- CHECK: в копии SQL `paid` заменён на `premium` → фиксированный oracle обнаружил несовпадение.
- Wiring: из настоящего разрешённого compose удалено имя переменной → exit 1; имя `S3_ENDPOINT`
  отдельно проверено без обрезания до `S`; пустой вход отвергается.
- После восстановления исходников: финальные build/lint/typecheck/test — exit 0.
  Доказательства: `mutations.json`, `*-red.txt`, `tests-final.txt`.

Шесть PostgreSQL-тестов подготовлены, но НЕ подтверждены исполнением: миграции/15 таблиц,
12 конкурентных регистраций, отзыв cookie, 12 bcrypt-сравнений при пуле из 4 соединений,
8 первых рендеров/уникальность fence/NULL-объяснения, 20 link_view и 10 guest_opened.
Мутации реальных SQL-ограничений не выполнены без БД. Остальные стражи ADR следующих фич
не объявляются покрытыми этой реализацией.

## Расхождения и принятые решения

1. **16 против 17 причин видео.** Pseudocode явно перечисляет 17 различных значений и использует
   их в алгоритмах, включая `render_failed`; подпись и бриф говорят «16». Сохранены все 17,
   ни одно требуемое состояние не исключено. Уточнение отправлено владельцу, ответа в ходе
   исполнения не получено. Документы-источники не исправлялись.
2. **Workspace против Dockerfile.** Созданы ровно пять workspace брифа. Dockerfile требует
   `turbo.json`, `packages/queue`, `packages/types`, `packages/config`, не копирует манифест
   `packages/shared` на deps-стадии и запускает `npx turbo build`. Эти зависимости/пустышки
   не добавлялись. npm-сборка работает; Docker-сборка текущего скаффолда не является рабочей.
   Сам Dockerfile оставлен без изменений по прямому запрету.
3. **Конфигурация по ролям.** Буквальное требование всех переменных каждому процессу противоречит
   compose и распределению секретов: `SESSION_SECRET` только у web, origin у web/render,
   шесть потолков у web/stt/select. Валидируются обязательные параметры соответствующей роли;
   секреты не расширены на лишние сервисы. HTTP разрешён в development и test, поскольку test
   compose прямо задаёт `http://test.invalid`; production требует HTTPS.
4. **Прокси не ограничивает частоту.** В Caddyfile есть лишь комментарий о лимитере. Поэтому
   приложение само применяет Redis-лимит до тела. Утверждение «лимит стоит на прокси» было бы
   неверным. Реальная цепочка внешнего прокси/XFF требует проверки на стенде; код доверяет
   последнему адресу, добавленному Caddy, при отсутствии прямой публикации web.
5. **SQL NULL.** Предписанный CHECK объяснений сам по себе пропускает UNKNOWN. Добавлены
   отдельные проверки `IS NOT NULL`, непустых объяснений и суммы трёх компонентов оценки.
6. **Неопределённые значения канона.** Канон §4 не перечисляет все наборы, названные в брифе;
   недостающие значения взяты из Data Structures Pseudocode. Поля продуктовых таблиц не
   изобретались. `_schema_migration` — отдельная техническая таблица мигратора.
7. **Сессия.** Срок 7 суток и минимум SESSION_SECRET 32 байта — локальные решения реализации:
   канон их не задаёт. Они отмечены здесь, а не выдаются за числа канона.
8. **Регистрация.** Между прозой Specification и Pseudocode есть неоднозначность ответа на
   занятый адрес. Выбран явный контракт Pseudocode: HTTP 200 и одинаковый JSON/cookie-формат
   у новой и повторной регистрации; существующему аккаунту повторная регистрация доступа не даёт.
9. **Телеметрия и запрет docs.** Новые записи помещены в `tests/artifacts/foundation`, поскольку
   бриф запрещает изменения docs кроме этого финального отчёта. Уже существовавшее изменение
   старого `docs/telemetry/.../events.jsonl` не принадлежит этой работе и не редактировалось.

## Что не сделано и что остаётся непроверенным

Не реализованы последующие фичи: загрузки и операции квоты, очереди, модели, рендер, метка,
страницы гостя, партнёрские операции и интерес Pro. Их таблицы существуют как фундамент,
наличие таблиц не доказывает пользовательский сценарий. Telegram и восстановление пароля
не входят в эту постановку. Главная страница — только честная заглушка состояния разработки.

Не подтверждены настоящим исполнением SQL, конкурентность БД, Redis-лимит под нагрузкой,
runtime health с настоящей БД, cookie через TLS-прокси, Docker-образы и полный CJM.
Нет утверждения о пригодности Cloud.ru, платных API, производительности или готовности стенда.
OWN-002 не закрыт: Anthropic не вернул содержательного ревью. Его не подменяли саморевью Codex.

Для приёмки нужны: отдельная БД `n5_test`, выполнение интеграционного набора, независимое
Anthropic-ревью и согласованное устранение перечисленных несовместимостей Dockerfile.
Защищённые `docker-compose.yml`, `Dockerfile`, `.env.example`, `proxy/Caddyfile`, `.claude/`
и прежние документы не изменялись. `.env` и секреты не создавались, коммит/публикация не выполнялись.

## Телеметрия и идентичность результата

- Профиль: `compact-quality-first-v2`, риск L; существующие SPARC и явный бриф использованы
  как согласованный вход. Исполнитель один, OpenAI Codex; системные метаданные называют семейство
  GPT-6, точный идентификатор модели/effort не предоставлены и оставлены `null`.
- Независимое ревью: запрошен Anthropic `sonnet` через CLI; фактическая модель не подтверждена
  из-за таймаута, `actual_model: null`. Fallback другого семейства не выдавался за OWN-002.
- Измеренная часть: **1234,547 секунды, 20 мин 34,547 с**, включая инструменты, ожидание ревью
  и исправления. Начальное чтение до создания записи не измерено; полного elapsed и active нет.
- Токены и стоимость: `null`, хост не предоставляет счётчики. Экономия пока не установлена.
- Запись: `tests/artifacts/foundation/run.json`; события: `events.jsonl`; состояние передачи:
  `work-record.json`. Проверка формата companion-validator не заявляется выполненной.
- Исходники привязаны к `source-snapshot.json`, SHA256 этого манифеста:
  `8857bf1eab563373faa0448f97250cfc604958db0fac233c742aa1fd2937e7c8`.

Status: failed
