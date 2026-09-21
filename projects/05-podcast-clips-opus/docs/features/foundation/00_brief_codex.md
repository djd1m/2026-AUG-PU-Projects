# Постановка для Codex — фича `foundation` проекта N5 «КлипМейкер»

Ты реализуешь ПЕРВУЮ фичу проекта. Рабочий каталог — корень проекта
`projects/05-podcast-clips-opus`. Пиши файлы прямо в него. Язык кода — TypeScript, комментарии и
сообщения об ошибках — по-русски (интерфейс продукта русский).

## Сначала прочитай (в этом порядке, они в этом же каталоге проекта)

1. `docs/canon.md` — ЗАМОРОЖЕННЫЙ источник имён и чисел: §4 (15 сущностей и закрытые
   перечисления), §5 (10 публичных путей и 15 процедур), §6 (7 сервисов compose, какой секрет
   какому сервису), §7 (числа: потолки, сроки, лимиты частоты).
2. `docs/Pseudocode.md` — `## Data Structures` (поля каждой сущности) и алгоритмы
   `AuthRegisterAndLogin`, `CheckAndConsumeQuota`, `RefundUploadSlot`.
3. `docs/Architecture.md` — `## Data Architecture` (физические ограничения, индексы, CHECK),
   `## Security Architecture` (порядок операций, сессии, секреты).
4. `docs/Specification.md` — `### FR-AUTH-001`, `### FR-LIMIT-002`, `### FR-LIMIT-003`,
   `### NFR-SEC-001`.
5. `CLAUDE.md` и `.claude/rules/coding-style.md`, `.claude/rules/security.md`,
   `.claude/rules/testing.md` — соглашения проекта.
6. `docker-compose.yml`, `Dockerfile`, `.env.example` — УЖЕ НАПИСАНЫ и являются контрактом на имена
   переменных, цели сборки и пути. НЕ ПРАВЬ их. Имена workspace в `Dockerfile` (`apps/web`,
   `apps/worker`, `packages/db`, `packages/s3`, `packages/queue`, `packages/types`,
   `packages/config`) — ориентир; если создаёшь другой набор пакетов, перечисли расхождение в
   отчёте, но САМ Dockerfile не меняй.

## Что построить

### 1. Монорепо (npm workspaces)

Корневой `package.json` с workspaces `apps/*` и `packages/*`, скриптами `build`, `lint`,
`typecheck`, `test`, `db:migrate`. Node 22, TypeScript 5. Рабочие места:
`apps/web` (Next.js 15 App Router), `apps/worker` (Node, точки входа `workers/stt.ts`,
`workers/select.ts`, `workers/render.ts` — на этой фиче достаточно заглушек, которые стартуют,
читают конфигурацию и ждут), `packages/db` (миграции SQL + клиент pg), `packages/shared` (закрытые
перечисления, типы, загрузчик конфигурации), `packages/s3` (может быть пустым каркасом с
README-комментарием: наполнение — фича `upload-and-quota`).
`tsconfig.base.json` со строгим режимом. Единый `package-lock.json` в корне.

### 2. Закрытые перечисления — ОДИН источник

`packages/shared/src/enums.ts` объявляет КАЖДОЕ закрытое перечисление канона §4 как union-тип плюс
массив значений (`as const`), из которого генерируются и проверки в коде, и текст `CHECK` в
миграции. Два списка значений в двух местах — дефект: сделай так, чтобы SQL получал значения из
этого же файла (скрипт генерации либо тест, сверяющий SQL с массивом).

Перечисления (ровно они, ровно эти значения): `account.plan` (2), `account.status` (3),
`video.source` (2), `video.status` (7), `video.failure_reason` (16, включая
`refused_user_uploads` и `probe_timeout`), `clip.status` (4), `clip.failure_reason` (4),
`job_attempt.stage` (3), `job_attempt.status` (4), `growth_event.type` (8),
`attribution.source` (3), `attribution.status` (3), `partner_code.status` (2),
`quota_counter.scope` (6: `user_minutes`, `user_uploads`, `user_upload_refunds`, `user_llm`,
`global_minutes`, `global_llm`), `pro_interest.source_screen` (3).

Правило fail-closed: функция чтения значения из БД или из внешнего входа, встретив значение вне
множества, возвращает САМОЕ СТРОГОЕ (`failed` для статусов работы, `rejected` для атрибуции,
`free` для тарифа), а не бросает и не пропускает.

### 3. Миграция `packages/db/migrations/001_init.sql`

Все 15 сущностей канона §4 с полями из `Pseudocode.md` `## Data Structures` и физическими
ограничениями из `Architecture.md` `## Data Architecture`. Обязательно:

- `UNIQUE (account.email)`; частичный `UNIQUE (account.telegram_user_id) WHERE telegram_user_id IS NOT NULL`;
- `UNIQUE (video.account_id, video.idempotency_key)`;
- `CHECK` по КАЖДОМУ закрытому перечислению;
- `UNIQUE (quota_counter.scope, scope_key, day)`; колонки `limit` НЕТ (предел — параметр запроса);
- `UNIQUE (job_attempt.video_id, fence)`; колонки `series_no int NOT NULL DEFAULT 1`,
  `wait_reason text NULL`, `clip_id uuid NULL`;
- `clip.render_fence int NOT NULL DEFAULT 0`, `clip.watermarked boolean NOT NULL`,
  `CHECK (clip.score IS NULL OR (explain_hook <> '' AND explain_completeness <> '' AND explain_length <> ''))`;
- `UNIQUE (clip_link.code)`, `UNIQUE (partner_code.code)`, `UNIQUE (guest_pack.code)`,
  `UNIQUE (attribution.account_id)`, `UNIQUE (pro_interest.account_id)`;
- частичные `UNIQUE (growth_event.clip_link_id, ip_prefix, day) WHERE type = 'link_view'` и
  `UNIQUE (growth_event.guest_pack_id, ip_prefix, day) WHERE type = 'guest_opened'`;
- частичный индекс по `video.status` для сторожа;
- `guest_pack.sent_at`, `expires_at`, `consent_version`, `consent_text_hash`, `consent_at`,
  `host_partner_code_id`;
- мягкое удаление `deleted_at` там, где оно объявлено, и частичные индексы `WHERE deleted_at IS NULL`.

Миграции — обычные SQL-файлы, применяются по порядку; отката добавлять не нужно, но опиши его
одной строкой комментария в шапке файла. Генератор схемы из кода НЕ использовать.

### 4. Конфигурация, которая ОТКАЗЫВАЕТ (главный инвариант этой фичи)

`packages/shared/src/config.ts`: чтение окружения с валидацией. Обязательные без значения по
умолчанию: `N5_LIMIT_USER_MINUTES`, `N5_LIMIT_USER_UPLOADS`, `N5_LIMIT_USER_UPLOAD_REFUNDS`,
`N5_LIMIT_USER_LLM`, `N5_LIMIT_GLOBAL_MINUTES`, `N5_LIMIT_GLOBAL_LLM`, `N5_PUBLIC_ORIGIN`,
`DATABASE_URL`, `REDIS_URL`, `SESSION_SECRET`.

- Отсутствие или непригодное значение ЛЮБОЙ из них валит запуск процесса ненулевым кодом с
  сообщением, называющим ПОСЛЕДСТВИЕ, а не факт («`N5_PUBLIC_ORIGIN` не задан: он вшивается в метку
  каждого клипа и определяет каждую выдаваемую наружу ссылку; с дефолтом все они вели бы в никуда»).
- Пустая строка ≠ отсутствие: обе отвергаются, но различаются в сообщении.
- Потолки — целые положительные; `N5_PUBLIC_ORIGIN` проверяется `new URL()` и списком протоколов
  (`https:`, в dev дополнительно `http:`), а не подчищается.
- Валидация выполняется ОДИН раз при старте процесса, не на каждый запрос.

### 5. Регистрация и вход (FR-AUTH-001)

`POST /api/auth/register` и `POST /api/auth/login` (route handlers Next.js), `POST /api/auth/logout`.

- Пароль ≥ 8 символов, `bcrypt` cost ≥ 10. **Хэширование и сравнение выполняются ВНЕ транзакции
  БД**: соединение пула берётся только под короткую запись. Причина названа в правиле проекта —
  пул общий у всех маршрутов, и N одновременных попыток входа кладут продукт целиком.
- Неразличимость: «адреса нет», «аккаунт не активен», «неверный пароль» дают ОДИН текст, ОДИН код
  и сопоставимое время — при отсутствующем аккаунте выполняется сравнение с фиктивным хэшем той же
  стоимости.
- Сессия: значение ≥ 128 бит энтропии в cookie `HttpOnly; Secure; SameSite=Lax`; в БД только
  `cookie_token_hash`; `ip_prefix` — /24, полный адрес не хранится нигде.
- `logout` гасит сессию на сервере (`revoked_at`), а не только в браузере.
- Лимит частоты (30 мутирующих запросов/мин на IP) применяется ДО разбора тела запроса. Если
  реализовать это в приложении сложно — оставь точку расширения и отметь в отчёте, что лимит стоит
  на прокси (`proxy/Caddyfile`).

### 6. `GET /health`

Вне префикса `/api/v1`, отвечает 200 только если конфигурация прочитана и БД отвечает; иначе 503.

### 7. `scripts/check-env-wiring.sh`

Сверяет `process.env.X` в исходниках каждого сервиса с блоком `environment:` этого сервиса в
`docker compose config`. Коды возврата: `0` потерь нет, `1` переменная читается кодом, но не
проброшена, `2` проверка НЕ ВЫПОЛНЕНА (нет docker/compose/прав). Две ошибки, уже допущенные
однажды при написании такой проверки, повторять нельзя: регулярное выражение `[A-Z][A-Z0-9_]*`
(без цифр `S3_ENDPOINT` режется до `S`), и список исключений ЯВНЫЙ, а не молчаливый.

## Тесты (vitest), обязательные для приёмки

1. **Шесть отдельных прогонов** запуска без каждой из шести переменных-потолков: каждый даёт
   ненулевой код и сообщение, называющее незакрытый вызов. Проверка одной переменной зеленеет при
   отсутствующей второй — поэтому именно шесть, а не один.
2. Седьмой прогон: пустой `N5_PUBLIC_ORIGIN` валит запуск.
3. fail-closed перечислений: для мусорных значений (`null`, `''`, `'PAID'`, `' paid'`, `'premium'`,
   `0`, `1`, `true`, `{}`, `['paid']`) функция тарифа возвращает `free`; аналогично для статусов.
4. Неразличимость входа: три исхода отказа дают одинаковый текст и код; время ответа на
   несуществующий адрес сопоставимо с временем на неверный пароль (замер грубый, порог мягкий).
5. Сверка SQL и перечислений: множество значений в `CHECK` каждой колонки совпадает с массивом из
   `packages/shared/src/enums.ts`.
6. Страж: `bcrypt` не вызывается внутри транзакции (проверка по исходнику — в файле
   регистрации/входа между `BEGIN` и `COMMIT` нет вызова хэширования).

Тесты, требующие настоящего PostgreSQL, помечай так, чтобы они запускались в профиле `test`
compose; чисто логические (конфигурация, перечисления, страж по исходнику) должны идти без БД.

## Границы

- НЕ реализуй: загрузку файлов, очередь, транскрипцию, выделение, рендер, метку, гостевую
  страницу, партнёрские коды, экран интереса. Это следующие фичи роадмапа.
- НЕ правь: `docker-compose.yml`, `Dockerfile`, `.env.example`, `proxy/Caddyfile`, ничего в `docs/`,
  ничего в `.claude/`.
- НЕ добавляй зависимости, которых нет в стеке канона (Next.js, React, pg, bcrypt, zod, vitest,
  bullmq, ioredis — допустимы; ORM-генераторы схемы — нет).
- Секреты в код не попадают; `.env` не создавать.

## Отчёт (обязателен)

Последним действием запиши файл `docs/features/foundation/07_code_report.md`:
что создано (список файлов), что из постановки НЕ сделано и почему, какие команды ты выполнил и с
какими кодами возврата (`npm install`, `npm run build`, `npm test` — если запускал), какие
расхождения с документами нашёл (особенно: поля, которых нет в каноне; имена workspace против
`Dockerfile`), что осталось непроверенным. Последняя строка файла — ровно `Status: completed`
или `Status: failed`.
