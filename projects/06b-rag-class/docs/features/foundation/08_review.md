# Фича 1 · foundation — независимая валидация

**Дата:** 2026-09-30 · **Ревизия:** `2704ba6d` (`feature/06b-rag-class`) · **Валидатор:** Claude Opus 5.5, новый агент без
контекста исполнителя (условие владельца №6). Один полный проход; код не исправлялся.

## Вердикт: ПРИНЯТО С ПРАВКАМИ

Блокеров нет. Все AC фичи реализованы, у каждого есть тест, и я сам проверил, что эти тесты падают при внесённом дефекте:
6 мутаций в unit, 2 в integration, 2 в compose. Одна находка high касается схемы: RLS не держит согласованность
денормализованного `account_id` с родительской строкой. Её дешевле всего исправить сейчас, в `001_init.sql`, пока на стенде
нет данных, и обязательно до фичи `index-jobs`, в которой появляется первая запись в `source`.

## Обязательства фичи, составленные ДО чтения кода

Источники: `00-task.md`, `decisions-owner.md` (OWN-06B-004/007/008), дорожная карта `foundation`, Specification
US-001/FR-n6b-1/US-016/FR-n6b-16/NFR-n6b-3/NFR-n6b-5, Pseudocode (Data Structures, Register and login, Boot config check),
Architecture (Docker Compose, Data Architecture, Security), `test-scenarios.md`, `security.md`, `testing.md`.

| AC | Обязательство | Итог |
|---|---|---|
| AC-1 | npm workspaces: apps/web, apps/widget, services/worker, packages/db, packages/rag | ✅ |
| AC-2 | 16 сущностей, pgvector `vector(1536)`, HNSW cosine, ограничения по Architecture (unique lower(email), один уровень подаккаунта, `studio_access DEFAULT false`, PDF ≤ 10 МБ, частичный unique живой задачи, `unique(scope, day)`) | ✅ |
| AC-3 | RLS по `account_id` на ботах, источниках, фрагментах, журнале; чужой id не находится; роль приложения | ✅ по строкам; ⚠ F-1, F-2, F-3 |
| AC-4 | Boot config check: закрытый список 13 переменных; отсутствие и `''` → exit 1 с именем и последствием; `LIMIT_*` только положительное целое; персональный ≤ суточного; `PUBLIC_BASE_URL` https в проде | ✅ |
| AC-5 | Каждая проверяемая переменная читается решением (CFG-I5) | ⚠ 4 из 13, остальные 9 в явном списке ожидания, см. F-6 |
| AC-6 | SC-US-001-1: пароль ≥ 10, план `free`, сессия httpOnly (Secure, Lax) на 7 дней, в БД HMAC токена | ✅ |
| AC-7 | SC-US-001-2: одинаковый ответ, фиктивный хэш той же стоимости, bcrypt 12 вне транзакции | ✅ |
| AC-8 | SC-US-001-3: `kind=studio`; неизвестный kind → owner | ✅ |
| AC-9 | SC-US-001-4: 10/час на адрес (IPv4 целиком, IPv6 /64), HMAC с `VISITOR_SECRET`, общий ключ регистрации и входа, атомарно ДО разбора тела, bcrypt и записи; 11-я → 429 | ✅ (в том числе конкурентно) |
| AC-10 | Адрес клиента — последний элемент `X-Forwarded-For` | ✅ |
| AC-11 | Выход из аккаунта (FR-n6b-1) | ✅ |
| AC-12 | `GET /api/health`; compose: у БД нет `ports:`, healthcheck у db и web, `service_healthy`, `unless-stopped` | ✅ |
| AC-13 | `scripts/check-env-wiring.sh` и доказательство, что он падает | ✅ |
| AC-14 | Тесты названы по SC-US; integration на тестовом compose `n6b-test` | ✅ имена; ⚠ compose нет, см. F-5 |

## Находки

| # | Сила | Где | Что не так | Сценарий отказа | Правило / AC | Минимальная правка |
|---|---|---|---|---|---|---|
| F-1 | **high** | `packages/db/migrations/001_init.sql:73-74` (`source`), `:85-86` (`source_file`), `:96-97` (`document`), `:111-113` (`chunk`), `:127-128` (`index_job`), `:148-149` (`question_log`) | Внешний ключ на родителя одиночный (`bot_id → bot(id)`), а `account_id` денормализован без связи с `account_id` родителя. Проверка FK идёт в обход RLS, поэтому арендатор A под `n6b_tenant` вставляет `source(bot_id = бот B, account_id = A)`, и WITH CHECK это пропускает. **Воспроизведено:** `INSERT … RETURNING 'A inserted source referencing B bot'` вернул строку. | Обработчик `POST /api/bots/{id}/sources` в фиче `index-jobs` пишет строку по `bot_id` из URL, не выбрав бота под RLS. Воркер (роль `n6b_service`, BYPASSRLS) индексирует источник, фрагменты получают `bot_id` бота B, и поиск для B (фильтр по `bot_id` на сервисной роли) начинает отвечать посетителям B текстом, который подложил A. RLS должна ловить именно такой «забыли проверить», и здесь она молчит. | NFR-n6b-3; Architecture «`account_id` денормализован … для RLS одним предикатом»; `security.md` «чужой `bot_id` → 404» | Составные FK: `UNIQUE (id, account_id)` на `bot`, `source` и `document`; затем `FOREIGN KEY (bot_id, account_id) REFERENCES bot (id, account_id)` в `source`, `chunk` и `question_log`, `(source_id, account_id) → source` в `source_file`, `document` и `index_job`, `(document_id, account_id) → document` в `chunk`. Добавить int-тест «вставка со ссылкой на чужого родителя → FK violation». |
| F-2 | medium | `packages/db/tests/int/rls.test.ts:198` | Изоляция чтения проверяется на 5 из 9 таблиц кабинета: `source_file`, `question_log`, `growth_event` и `handover_token` не проверены. **Мутация:** политика `USING (true) WITH CHECK (true)` на `source_file` и `question_log` → **35 passed / 35**, страж остаётся зелёным. В `question_log` лежат тексты вопросов посетителей. | Правка политики одной из этих таблиц в будущей миграции пройдёт тесты. | `guard-must-be-able-to-fail`; `testing.md` п. 4 | Сидировать строки во всех 9 таблицах (`seedTenant`) и перечислить все 9 в `it.each` чтения и записи. |
| F-3 | medium | `packages/db/migrations/002_rls.sql:24-25` | `n6b_app` состоит и в `n6b_tenant`, и в `n6b_service`. Любой SQL внутри транзакции кабинета может выполнить `SET LOCAL ROLE n6b_service` и получить BYPASSRLS. **Воспроизведено:** из транзакции арендатора A прочитан `password_hash` аккаунта B. От ошибки «забыли WHERE» RLS защищает, от внедрения SQL — нет. Такая схема перенесена из N1 и названа в шапке миграции. | Внедрение SQL в любой запрос кабинета приводит к чтению всех арендаторов, включая хэши паролей. | NFR-n6b-3 (глубина защиты) | Минимум — записать это ограничение в `security.md` и ADR как принятый риск. Лучше — два LOGIN-пользователя с отдельными пулами: `n6b_web_tenant`, состоящий только в `n6b_tenant`, и `n6b_web_service`. |
| F-4 | low | `packages/db/migrations/002_rls.sql:44` | `GRANT SELECT ON account TO n6b_tenant` открывает все колонки, в том числе `password_hash` своего аккаунта и подаккаунтов студии. | Экран или API кабинета, отдающий `SELECT *` из `account`, выведет хэши пароля. | `security.md` (пароли) | Выдать права на колонки: `GRANT SELECT (id, email, kind, plan, badge_removal, parent_account_id, studio_access, is_test, referred_by_bot_id, created_at) ON account`. |
| F-5 | medium | `DEVELOPMENT_GUIDE.md:48`; `testing.md` «Integration … compose `name: n6b-test`» | Тестового compose `n6b-test` нет. `npm run test:int` требует `TEST_DATABASE_URL_OWNER` и `TEST_APP_PASSWORD`, а в репозитории нигде не описано, как поднять БД и откуда взять эти переменные. Воспроизводимость держится на памяти исполнителя (слой 5). Исполнитель назвал это сам (п. 7). | Следующий исполнитель или валидатор не повторит интеграционный прогон по документам проекта. Правило `testing.md` п. 7 («полный прогон ВСЕХ наборов») на деле не исполняется. | `testing.md`; `compose-hygiene` п. 1 | `compose.test.yml` с `name: n6b-test`, БД без `ports:`, паролями `${VAR:?}` и сервисом-раннером во внутренней сети; строка запуска в `DEVELOPMENT_GUIDE.md`. |
| F-6 | low | `apps/web/tests/unit/config-wiring.test.ts:35-36` | Отклонение «9 из 13 не читаются» законно: решения относятся к фичам `spend-ceilings` и `rag-answer-sandbox`, имена стоят в явном списке, и страж падает, если имя уже читается, а из списка не убрано. Страж не падает, если фича из списка закрыта (`status: done`), а имя так и осталось не прочитанным. | `spend-ceilings` поставлена, один из `LIMIT_*` не подключён — CFG-I5 молча нарушен. | `honest-configuration` CFG-I5 | В стражe: если `roadmap[pending].status === 'done'`, тест падает. |
| F-7 | low | `services/worker/tests/unit/boot.test.ts:6`; корневой `package.json` `test` | На свежем checkout `npm test` падает (3 failed, `ERR_MODULE_NOT_FOUND …/@n6b/db/dist/index.js`), пока нет `npm run build --workspace @n6b/db`. Условие записано в комментарии теста, в скриптах его нет. | Ложно-красный прогон у нового участника или в CI. | `testing.md` «Команды» | `"pretest": "npm run build --workspace @n6b/db"` или строка в `DEVELOPMENT_GUIDE.md`. |
| F-8 | low | `docs/Architecture.md:144`, `.claude/rules/security.md` «Авторизация»; `docs/Pseudocode.md` SourceFile | Два отклонения исполнителя законны, но документы им не соответствуют. `app.account_id` вместо `app.account_ids` — улучшение: список видимых аккаунтов вычисляет БД, клиент его не передаёт. `source_file.account_id` Architecture требует для RLS, а в Data Structures его нет. | Следующий исполнитель по документам начнёт передавать `app.account_ids`, и контекст молча будет пустым. Fail-closed, но это отказ функциональности. | Трассировка документ ↔ код | Поправить Architecture, security.md и Pseudocode (одна строка в каждом). |
| F-9 | low (дорожная карта) | `.claude/feature-roadmap.json` | Экран регистрации и входа (формы кабинета) не входит ни в одну фичу: поиск по «форм», «кабинет», «/login», «UI» даёт пусто, кроме demo-page. Foundation поставила только API, и исполнитель это назвал (п. 5). | E2E «регистрация → URL → …» (`testing.md`) некуда кликать. | `testing.md` E2E | Координатору: добавить UI входа и регистрации в описание первой кабинетной фичи. |

Проверил отклонения, которые назвал сам исполнитель:

- `app.account_id` вместо `app.account_ids`: **законно** и безопаснее; документы нужно подогнать (F-8).
- `source_file.account_id`: **законно**, этого требует Architecture; но без составного FK поле может разойтись с родителем (F-1).
- 9 из 13 переменных не читаются: **законно** на этой фиче, есть страж; усилить его (F-6).
- 503 без `X-Forwarded-For`: **законно**. Fail-closed по `honest-configuration` CFG-S1 и `fail-closed-defaults` п. 5: без адреса предел не построить. Прокси стенда `caddy:2.10-alpine` сам выставляет XFF, так что последний элемент — адрес клиента. На развёрнутом стенде это не проверено (слой 3–4, E2E).
- 403 на чужой `Origin` у `/api/auth/*`: в API Contracts такого кода нет, но это законное ужесточение. Проверка идёт до предела, поэтому чужая страница не расходует счётчик. Стоит добавить 403 в таблицу API Contracts.

## Что проверено и оказалось в порядке

Среда: копия `git archive HEAD` в scratchpad, `node:22.22.0-bookworm-slim`, `--cpus 2`. Unit и сборка шли с `--network none`.
Integration — `pgvector/pgvector:0.8.6-pg16` в `docker network create --internal n6b-val-net`, без `ports:`
(`docker inspect` → `{"5432/tcp":null}`), пароли `openssl rand -hex 24` в env-файлах scratchpad. Контейнеры `n6b-val-*` и сеть
удалены после прогона.

| Проверка | Команда | Результат |
|---|---|---|
| Порты до запуска | `bash scripts/check-port-conflicts.sh projects/06b-rag-class` (с плейсхолдерами `.env.example`) | 0: хранилище не публикуется, 3106 свободен |
| Правило №0 | `node .claude/hooks/check-ports.cjs projects/06b-rag-class` | 0: хранилищ 1, нарушений нет |
| Типы | `npm run typecheck` | 0 |
| Unit | `vitest run --config vitest.config.ts` (после build `@n6b/db`) | **119 passed** (6 файлов) |
| Integration | `vitest run --config vitest.int.config.ts` | **35 passed** (rls 21, auth 9, quota 5); повторный migrate идемпотентен |
| Сборка web без окружения | `npm run build` | 0: сборка не требует секретов |
| Старт web без окружения | `next start` с `NODE_ENV=production`, окружение пустое | **exit 1**, «OPENROUTER_API_KEY не задан: ответы и эмбеддинги вопросов невозможны. Сервис не стартует.» Значение не печатается |
| Страж проброса | `bash scripts/check-env-wiring.sh` | 0 (web=16, worker=6, migrate=2) |
| RLS вручную (psql как `n6b_app` → `n6b_tenant`, контекст A) | чтение строк B в `source_file`, `question_log`, `growth_event`, `handover_token`, `account` | 0 строк в каждой; вставка `question_log` с `account_id` B → `violates row-level security policy` |
| Функция контекста | `pg_proc` | `n6b_account_ids()` — SECURITY DEFINER, `search_path` закреплён |

**Мутации валидатора** (в копии, после каждой восстановлено; базовый прогон после всех — 35/35 и 119/119):

| # | Внесённый дефект | Результат |
|---|---|---|
| V-M1 | предел входа перенесён ПОСЛЕ разбора тела | 1 failed («мусорное тело тоже расходует попытку») |
| V-M2 | для неизвестного e-mail bcrypt не вызывается (нет фиктивного хэша) | 1 failed (SC-US-001-2) |
| V-M3 | квота «прочитать, потом записать» вместо одной инструкции | 2 failed: 11 из 50 при пределе 3; конкурентный вход |
| V-M4 | политика `USING (true)` на `source_file` и `question_log` | **0 failed**, страж не видит (F-2) |
| V-M5 | `''` принимается конфигурацией | 13 failed (по одному на каждую из 13 переменных) |
| V-M6 | адрес — первый элемент XFF вместо последнего | 2 failed |
| V-M7 | из compose убран `VISITOR_SECRET` у web | `check-env-wiring.sh` → 1 «web: VISITOR_SECRET» |
| V-M8 | из compose убран `LIMIT_ANSWER_BOT_DAY` | `check-env-wiring.sh` → 1 «web: LIMIT_ANSWER_BOT_DAY» |

**Код, прочитанный построчно, без замечаний:** порядок в `auth-handler.ts`: Origin → предел (отдельная закоммиченная
транзакция) → тело ≤ 4 КБ → zod → bcrypt. bcrypt стоит вне транзакций. Фиктивный хэш cost 12 сверяется и для
подаккаунта без пароля. Недоступность БД при резерве даёт 503, а не пропуск. Пул: `max 10`, `connectionTimeoutMillis 5000`.
`SET LOCAL` не переживает транзакцию (есть тест). Отказы конфигурации и журналы печатают имя переменной или класс ошибки,
но не значения и не тексты ошибок БД. Пароль роли в `migrate.ts` уходит через `format(%L)` и не журналируется. Compose:
у `db` нет `ports:`, `internal: true`, web публикуется только на `127.0.0.1:${N6B_WEB_PORT:-3106}`. Все секреты и пределы
заданы как `${VAR:?}`, образы с тегами, `restart: unless-stopped` у долгоживущих сервисов (у migrate `"no"` — законно для
one-shot). Образы запускаются от `USER node`, `.dockerignore` исключает `.env*`, `tests`, `.claude`.

## Что осталось суждением (слой 3–4)

Подпись XFF на живом прокси стенда, поведение предела при реальном обороте часа по МСК, выравнивание времени ответа
на настоящем железе (в тестах выравнивание проверено по факту вызова bcrypt, а не секундомером). Всё это E2E на стенде.

## Ответ на находки

**Исполнитель правок:** Claude Opus 5.5 (агент исправлений, 2026-09-30), от ревизии `382e0c55`. Миграции `001`/`002`
поправлены на месте: стенда и данных нет. Мутации — на свежей БД `compose.test.yml` (down -v между прогонами), дефектный
файл подменялся монтированием; журнал — `tests/artifacts/foundation/fix-mutations.txt`. Итоговый полный прогон — командой
`DEVELOPMENT_GUIDE.md` §5 на чистом дереве архива коммита `69804972` (без `dist`, `node_modules`, `.env`):
typecheck 0 · unit **134 passed** · integration **65 passed** (`tests/artifacts/foundation/fix-green.txt`). `next build`
и `check-env-wiring.mjs` (web=17, worker=6, migrate=3) — 0 в контейнере без сети.

| # | Что сделано | Коммит | Тест | Мутация → результат |
|---|---|---|---|---|
| F-1 | `UNIQUE (id, account_id)` у `bot`, `source`, `document`; составные FK `(parent_id, account_id) → parent(id, account_id)` у `source`, `source_file`, `document`, `chunk` (×2), `index_job`, `question_log`; у `model_call_log` — составной FK плюс `CHECK (bot_id IS NULL OR account_id IS NOT NULL)` | `6075a923` | `packages/db/tests/int/tenant-fk.test.ts`: каталожный страж (каждый FK между таблицами с `account_id` включает пару `account_id`, перечень из `pg_constraint`); на каждой из 7 связей арендатор A со ссылкой на объект B → отказ именно названного FK; контроль — та же вставка на свой объект проходит; служебный путь (BYPASSRLS) — тоже отказ | M1: `source_file_source_fk` одиночным → **2 failed / 17** |
| F-2 | Перечень таблиц — запросом к `pg_catalog` (все с `account_id` + `account`): RLS+FORCE; у выданных кабинету — политика для `n6b_tenant`; чтение (своих > 0, чужих 0), вставка с `account_id` B (копия своей строки через `json_populate_record`) → RLS, UPDATE/DELETE строк B → 0, перенос своей строки к B → отказ; невыданные кабинету — `permission denied`; кабинету не выдана ни одна таблица без `account_id`. `seedTenant` сидирует все 9 таблиц кабинета | `6075a923` | `packages/db/tests/int/rls-catalog.test.ts` | M2: `USING (true) WITH CHECK (true)` на `source_file` и `question_log` → **3 failed / 8** |
| F-3 | Два пользователя входа: `n6b_app_tenant` (член только `n6b_tenant`) и `n6b_app_service` (только `n6b_service`); `n6b_app` больше не создаётся. Строки `DATABASE_URL_TENANT` (web) и `DATABASE_URL_SERVICE` (web, worker): закрытый список, вид `pg-url` сверяет имя пользователя — перепутанные строки → отказ старта; пароли `N6B_DB_TENANT_PASSWORD`/`N6B_DB_SERVICE_PASSWORD` ставит `migrate`; проброс в compose и `.env.example`; web держит два пула: вход и квоты — служебный, кабинет — свой | `6075a923` | `roles.test.ts`: членство ролей; из транзакции кабинета `SET ROLE n6b_service` → отказ; сценарий валидатора (чтение `password_hash` B) → отказ; роли не пересекаются в обе стороны. `config.test.ts`, `boot.test.ts`: перепутанные строки → exit 1, пароль не печатается | M3: `GRANT n6b_service TO n6b_app_tenant` → **4 failed / 9**; M7: снята сверка пользователя → **2 failed**; M8: из compose убраны `DATABASE_URL_TENANT`/`_SERVICE` → `check-env-wiring` **exit 1** с именами |
| F-4 | `GRANT SELECT (id, email, kind, plan, badge_removal, parent_account_id, studio_access, is_test, referred_by_bot_id, created_at) ON account TO n6b_tenant` | `6075a923` | `roles.test.ts`: `has_column_privilege(… password_hash)` = false; `SELECT password_hash` и `SELECT *` из кабинета → отказ; разрешённые колонки читаются | M4: `GRANT SELECT ON account TO n6b_tenant` → **2 failed / 9** |
| F-5 | `compose.test.yml` (`name: n6b-test`, БД без `ports:`, `internal: true`, tmpfs, пароли `${VAR:?}`, `cpus: 2`), раннер `tests/compose/Dockerfile` со своим ignore-файлом; `DEVELOPMENT_GUIDE.md` §5 — та команда, что прогнана с нуля | `d4ec97e7` | `fix-green.txt`: команда §5 на чистом дереве → exit 0 | публикация портов: `config \| grep` на копии с `ports:` → 1 (на рабочем файле 0) |
| F-6 | `pendingViolations()`: имя в списке ожидания при `status: done` фичи → нарушение; имя уже читается → нарушение; фича не существует → нарушение. Страж испытывается на падение синтетическим входом в каждом прогоне | `a04bce9c` | `apps/web/tests/unit/config-wiring.test.ts` (3 новых кейса: два падения, одно молчание на корректном входе) | M5: убрана проверка `done` → **1 failed**; M6: `spend-ceilings.status = done` → **7 failed** (все `LIMIT_*`) |
| F-7 | `"pretest": "npm run build --workspace @n6b/db"` | `d4ec97e7` | `fix-green.txt`: на дереве без `dist` `npm test` сам собирает `@n6b/db`, 134 passed | до правки валидатор видел 3 failed на свежем checkout |
| F-8 | Architecture (роли БД, `app.account_id` + `n6b_account_ids()`, составные FK, `source_file` в денормализации), Pseudocode (`SourceFile.account_id`), `security.md` (две роли, три стража), `secrets-management.md` (новые переменные, тестовые пароли) | `69804972` | — | — |
| F-9 | `/register`, `/login` (форма → `/api/auth/*`, текст ошибки сервера, после входа → `/cabinet`), кабинет-заглушка с выходом; сессия проверяется служебным пулом, e-mail читается пулом кабинета под RLS. В `05_completion.md` записано: экран добавлен в foundation по решению координатора | `a73143f6` | `apps/web/tests/unit/auth-client.test.ts` (8): адрес и тело запроса, ошибки 401/409/422/429 показываются, 200 на регистрации не считается успехом, обрыв сети — не успех; `next build` собирает `/login`, `/register`, `/cabinet` | — (экран; клик в браузере — E2E на стенде) |

**Не сделано и оговорки.** 403 `forbidden_origin` у `/api/auth/*` в таблицу API Contracts не внесён (предложение
валидатора вне списка F-n). Экраны проверены unit-тестом и сборкой, не кликом в браузере. Пулов web теперь два (до 2×10
соединений, `runtime.ts`); при `max_connections` 100 запас есть.
