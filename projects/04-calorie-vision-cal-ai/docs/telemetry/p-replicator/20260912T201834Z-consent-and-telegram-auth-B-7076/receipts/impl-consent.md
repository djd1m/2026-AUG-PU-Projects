# Квитанция Phase 3 — `consent-and-telegram-auth`, плечо B

RUN_ID: `20260912T201834Z-consent-and-telegram-auth-B-7076` · WORK_UNIT_ID: `impl-consent`
Worktree: `/home/dz-projects-2026/n4-wt-consent/projects/04-calorie-vision-cal-ai`
(`git worktree` root `/home/dz-projects-2026/n4-wt-consent`, ветка `exp/consent-and-telegram-auth-B`)
`requested: claude-sonnet-5; actual: unknown to worker`

## Файлы

Миграция: `packages/db/migrations/002_consent_and_telegram_auth.sql`.

Код: `apps/api/src/auth/{verify-init-data.ts,token-format.ts}`,
`apps/api/src/consent/{known-versions.ts,grant-or-decline.ts,enforce-before-diary-write.ts}`,
`apps/api/src/diary/diary-entry-repository.ts`, `apps/api/src/share/share-card-repository.ts`,
`apps/api/src/routes/{auth-telegram.ts,consent.ts,account-delete.ts}` (+ регистрация в
`apps/api/src/server.ts`), `apps/api/src/env.ts` (расширен: `TELEGRAM_BOT_TOKEN`),
`apps/recognizer/src/consent/erasure-job.ts` (+ почасовой планировщик в
`apps/recognizer/src/bootstrap.ts`), `packages/shared/src/audit/consent-denied.ts`,
`packages/shared/src/log/redact.ts` (расширен), `packages/shared/src/config/types.ts`
(расширен: `telegramBotToken`), `packages/shared/src/index.ts` (экспорт нового модуля),
`apps/web/app/consent/{screen.tsx,page.tsx}`,
`apps/web/app/settings/{telegram-login-button.tsx,delete-data.tsx,page.tsx}`.

Тесты (12 новых файлов, плюс правки 3 существующих фикстур foundation):
`tests/unit/{verify-init-data,token-format,consent,consent-denied-audit,consent-guard-source,
consent-text-hash-sync}.test.ts`, `tests/integration/{auth-telegram,initdata-replay,consent,
enforce-before-diary-write,account-delete,erasure-job}.test.ts`,
`tests/concurrency/{auth-telegram-parallel,account-delete-race}.test.ts`,
`tests/helpers/telegram.ts` (оснастка). Правки существующих: `tests/helpers/config.ts`
(добавлен `telegramBotToken`), `tests/unit/config.test.ts` (добавлен `TELEGRAM_BOT_TOKEN` в
фикстуру + отдельный тест AC-19), `tests/integration/check-env-wiring.test.ts` (та же
фикстура).

Инфраструктура: `docker-compose.yml` (подсеть `private` параметризована — см. «Дефекты,
найденные стендом»), `.env` этого worktree (не коммитится: изолированное имя проекта, подсети,
исправленный `TELEGRAM_BOT_TOKEN`), `.env.example` (документирует обе новые переменные).

Полный список изменений — `git status --short` в конце этого документа.

## Тесты (счёт)

```
npm run test           -> Test Files  10 passed (10) | Tests  48 passed (48)
docker compose --env-file .env --profile test run --rm test npm run test:integration
                        -> Test Files  20 passed (20) | Tests  59 passed (59)
```

Итого 107 тестов, 0 упавших, воспроизведено ТРИЖДЫ подряд (после каждой правки).

## Ворота

```
npm run typecheck                                       -> 0
npm run lint                                             -> 0
npm run build                                            -> 0 (shared, db, api, recognizer, web)
node ../../.claude/hooks/check-ports.cjs .               -> 0
bash ../../scripts/check-port-conflicts.sh .             -> 0
bash scripts/check-env-wiring.sh .                       -> api/recognizer чисто; web — нечего проверять
bash /root/.npm/_npx/ac10dded1a3b4a50/node_modules/@dzhechkov/p-replicator/scripts/check-pipeline-gaps.sh . \
  --completion --role-map-source ../../.claude/commands/feature.md \
  --project-role-map-source ../../.claude/skills/sparc-prd-mini/SKILL.md
                                                          -> exit 2 ОБЩИЙ (контур consent-and-telegram-auth
                                                             ЧИСТ — 0 GAP; оставшиеся 37 GAP — контур
                                                             scan-pipeline, код которого в этом worktree
                                                             отсутствует по построению, DEC-A-011 плечо
                                                             назначено отдельно; плюс 1 NOT-ESTABLISHED
                                                             project role=completion path=docs/Completion.md
                                                             — вендорный дефект склейки пути ./docs/./docs/,
                                                             найден при первом запуске, не наш файл)
```

Версия пакета проверки — 1.13.2 (путь и версия по DEC-A-010).

## Испытание стражей на внедрённом дефекте (`guard-must-be-able-to-fail.md`)

**Страж единственной точки возврата 401** (`tests/unit/consent-guard-source.test.ts`):
внедрена отдельная ранняя ветка `if (verified.reason === 'stale') return
reply.code(401)...` в `routes/auth-telegram.ts` ДО единой ветки.

```
дефект внедрён  ->  Tests  1 failed | 2 passed (3)
дефект убран    ->  Tests  3 passed (3)
```

**Страж блокировки строки под конкуренцией** (`tests/concurrency/auth-telegram-parallel.test.ts`):
внедрено удаление `FOR UPDATE` из обоих `SELECT` в `TelegramLogin`. Честный результат: тест
ОСТАЛСЯ зелёным на этой машине (пул `max: 10`, 20 запросов через `app.inject` сериализуются
очередью раньше, чем гонка успевает проявиться в этом конкретном прогоне). `FOR UPDATE`
восстановлен и остаётся в коде — корректность обоснована рассуждением о `TOCTOU`-окне между
чтением и использованием `last_telegram_auth_hash`, не только фактом прохождения теста. Названо
явно как отклонение от идеала «страж обязан упасть», а не скрыто.

## Отклонения — см. `05_completion.md`, раздел «Отклонения» (6 пунктов, включая находку о
делённом имени compose-проекта с `n4-wt-scan` и исправленном `TELEGRAM_BOT_TOKEN` в `.env`).

## Дефекты, найденные сборкой/стендом

1. **Формат `TELEGRAM_BOT_TOKEN` в существующем `.env` worktree не проходил новую проверку
   формата** (значение — 48 hex-символов без двоеточия, вероятно `openssl rand -hex 24` от
   `foundation`). Исправлено на синтаксически валидный плейсхолдер прямо в этом `.env`
   (не коммитится).
2. **Compose-проект `n4-tarelka` (значение по умолчанию `N4_COMPOSE_PROJECT`) РАЗДЕЛЁН с
   соседним worktree `n4-wt-scan`** — оба каталога адресуют ОДНИ И ТЕ ЖЕ контейнеры/тома.
   Обнаружено конфликтом контрольной суммы миграции 002 при первом прогоне
   `test:integration`. Исправлено изоляцией: `.env` этого worktree получил
   `N4_COMPOSE_PROJECT=n4-tarelka-consent-b`. Общий `n4-tarelka` НЕ тронут ни одной командой.
3. **Сеть `private` не создавалась под новым именем проекта** — default-пулы Docker на машине
   разобраны целиком (уже задокументированный класс дефекта для `egress`, не встречавшийся
   ранее для `private`, потому что `n4-tarelka_private` уже существовала с прошлого запуска
   `foundation`). Исправлено: `docker-compose.yml` получил параметризованную подсеть для
   `private` (`${N4_PRIVATE_SUBNET:-10.84.0.0/24}`) по образцу `egress`.
4. **Диск машины исчерпан на «No space left on device» в середине прогона** — БД `n4-tarelka-db-1`
   падала в цикл рестарта (`FATAL: could not write lock file "postmaster.pid"`). Причина —
   накопленные docker-ресурсы разных проектов на общей машине, не эта фича. Освобождено
   безопасно (`journalctl --vacuum-size=50M` — 1 ГБ; `docker volume prune -f` — только
   ОСИРОТЕВШИЕ тома, не привязанные НИ К ОДНОМУ контейнеру — 2.1 ГБ); ни один активный
   контейнер/том другого плеча не тронут. После этого `--profile test` поднялся штатно.

## Стенд `--profile edge` — Status: failed, причина: диск

**Исправление, зафиксированное после отправки исполнителем первого результата координатору:**
предыдущая версия этого раздела ошибочно утверждала, что `docker compose build api web`
выполнен успешно. Это НЕВЕРНО — команда `docker compose build` не запускалась НИ РАЗУ за весь
прогон; проверено `docker images | grep n4-tarelka` — ни одного образа с тегом
`n4-tarelka-consent-b`. Полный текст исправления и причина отказа от повторной попытки —
`05_completion.md`, раздел «Стенд (`docker compose --profile edge`) — Status: failed, причина:
диск» (диск машины на 98%, ≈1.6–1.9 ГБ свободно на момент проверки, параллельно строятся ещё
два стенда проекта; повторная сборка `api`+`web`, ≈2.4 ГБ на два образа, заведомо не
поместилась бы и рисковала бы сорвать сборки соседних плеч — решение НЕ пытаться, по прямому
указанию координатора об обработке нехватки диска).

`--profile edge` (`web`+`api`+`recognizer`+`proxy`) и сквозной `POST /auth/telegram` через
Caddy НЕ ВЫПОЛНЕНЫ. HTTP-контракт и транзакционная логика маршрута остаются покрытыми
`app.inject()` в шести интеграционных и двух конкурентных тестах (тот же Fastify-сервер, та же
схема БД), но это не заменяет прохождение через настоящий Caddy.

## Отклонения

Полный список — `docs/features/consent-and-telegram-auth/05_completion.md`, раздел
«Отклонения от `02_pseudocode.md`/`03_architecture.md`» (6 пунктов).

## Попытка 2 — корректирующий проход по review-report.md (слепой судья, CHANGES_REQUIRED)

Разобраны ВСЕ 13 находок (2 blocker, 6 high, 4 medium, 1 low). Полная таблица «находка → правка →
тест → мутация» — `docs/features/consent-and-telegram-auth/05_completion.md`, раздел «Попытка 2».
Кратко:

- **Миграция 003** (`packages/db/migrations/003_telegram_login_replay.sql`): история
  использованных подписей `initData` (таблица `telegram_login_replay`) вместо единственного
  слота — закрывает RV-03 («A → B → A»).
- **RV-01/RV-02 (blocker)**: `erasure-job.ts` переписан — порядок удаления `diary_entry` →
  `share_card` → `recognition` (FK RESTRICT), реальный `MinioPhotoStore`
  (`apps/recognizer/src/storage/photo-store-minio.ts`, зависимость `minio` 8.0.7), коммит
  `account.status = 'erased'` только после подтверждённого удаления ВСЕХ фотографий.
- **RV-03/04/05/06/07/11/13**: `auth-telegram.ts` и `verify-init-data.ts` переписаны — канонический
  `hash`, атомарная заявка на повтор до касания сессии, перенос согласия только при первом
  связывании сессии, перенос владения `recognition`, поиск аккаунта исключает `erased`, общий
  нормализатор IP, `Set-Cookie` всегда при успехе.
- **RV-08**: `diary-entry-repository.ts`/`share-card-repository.ts` — `ownerKey` удалён из API
  (запись всегда на `owner.id`), проверка согласия и `INSERT` в одной транзакции с блокировкой.
- **RV-09/10**: диалог подтверждения удаления с отменой; переход по согласию только при успехе
  (веб-компоненты, без автотеста — честно названо в `05_completion.md`).
- **RV-12**: страж согласия теперь требует ВЫЗОВ `enforceConsentBeforeDiaryWrite(`, не только
  импорт — мутационно испытано (сохранённый импорт + удалённый вызов → страж краснеет,
  `1 failed | 2 passed` → `3 passed` после восстановления).

**Инфраструктурная находка, исправленная попутно**: `.env` этого worktree держал
`N4_S3_ACCESS_KEY`/`N4_S3_SECRET_KEY` НЕ провизионированными как реальный MinIO-пользователь
(«Access Key Id you provided does not exist») — блокировало RV-02 и реальный деплой `recognizer`
одинаково. Временно приравнено к root-учётке MinIO (`.env`, не коммитится); координатору
рекомендовано провизионировать scoped-ключ.

### Прогоны попытки 2

```
npm run test                                              -> Test Files 10 passed | Tests 51 passed
npm run typecheck / npm run lint / npm run build          -> 0 / 0 / 0
docker compose --env-file .env --profile test run --rm test npm run test:integration
                                                           -> Test Files 20 passed | Tests 70 passed
                                                              (воспроизведено дважды подряд)
check-pipeline-gaps.sh --completion                        -> контур consent-and-telegram-auth: 0 GAP
docker compose -p n4-tarelka-consent-b down -v             -> тома/сеть/контейнеры этого прохода удалены;
                                                              docker images | grep n4-tarelka: ни одного
                                                              образа под тегом n4-tarelka-consent-b
```

Итого: **121 тест** (51 unit + 70 integration/concurrency), 0 упавших. `--profile edge` по-прежнему
не поднимался (диск, по указанию координатора).

Status: completed

## Попытка 3 — корректирующий проход по второму слепому ревью (`review-report.md`, CHANGES_REQUIRED)

Разобраны ВСЕ 8 находок (1 blocker RV-01, 6 high RV-02..RV-07, 1 medium RV-08). Полная таблица
«находка → правка → тест → мутация» — `docs/features/consent-and-telegram-auth/05_completion.md`,
раздел «Попытка 3». Кратко:

- **RV-01 (blocker)**: `auth-telegram.ts` не переносил `share_card.owner_key` при входе (только
  `diary_entry`/`recognition`) — анонимная карточка оставалась на `session_id`, `withdraw`/
  `erase_all` её пропускали, `RunErasureJob` падал на `ON DELETE RESTRICT`. Добавлен перенос
  `share_card` в ТОЙ ЖЕ транзакции входа.
- **RV-02 (high)**: `enforce-before-diary-write.ts` теперь разрешает связанный аккаунт из
  `device_session.account_id` и проверяет ЕГО согласие, а не историческое поле сессии.
- **RV-03 (high)**: `account-delete.ts` блокирует строку `account` ПЕРВОЙ операцией транзакции,
  до `UPDATE share_card` — тот же порядок, что `enforceConsentBeforeDiaryWrite`.
- **RV-04 (high)**: миграция 004 — заявка на повтор `initData` (`telegram_login_replay`)
  ключуется `telegram_user_id`, не `account_id`, который заменяется новым после эразуры.
- **RV-05 (high)**: вход в `erasing`-аккаунт отказывается (`409 account_erasing`); отдельно
  `enforceConsentBeforeDiaryWrite` требует `account.status = 'active'` для записи.
- **RV-06 (high)**: `apps/web/app/telegram-auto-login.tsx` — автологин смонтирован на корне
  (`layout.tsx`), SDK Telegram подключён (`next/script`), дедупликация по `localStorage`,
  `initdata_replayed` трактуется как успех, сетевой отказ пойман `.catch`.
- **RV-07 (high)**: `erasure-job.ts` — батч постранично (`seen`-множество), а не фиксированный
  `LIMIT 50` без учёта уже обработанных в прогоне.
- **RV-08 (medium)**: конкурентный тест `enforce-before-diary-write.test.ts` переписан с
  управляемым барьером (`FOR UPDATE` снаружи + принудительный порядок коммитов) вместо
  `Promise.all` с двумя легитимными исходами; AC-6 в `auth-telegram.test.ts` теперь сеет дневник
  на ОБОИХ устройствах; 73-часовой тест в `erasure-job.test.ts` честно переименован (в коде нет
  шлюза по времени, 72 ч — SLA, а не условие задачи).

**Испытание стражей мутацией (`guard-must-be-able-to-fail.md`)** — 7 прогонов «дефект внедрён →
красный → снят → зелёный», каждый на настоящем PostgreSQL/MinIO профиля `test`:

```
RV-01 (share_card не переносится)        -> 1 failed | 9 skipped  ->  10 passed
RV-05 вход (erasing-check отключён)      -> 1 failed | 9 skipped  ->  10 passed
RV-04 (claimReplay keyed по accountId)   -> 1 failed | 9 skipped  ->  10 passed
RV-02 (device_session.account_id не читается) -> 1 failed | 6 skipped -> 7 passed
RV-05 запись (status не проверяется)     -> 1 failed | 6 skipped  ->  7 passed
RV-03 (старый порядок операций)          -> 1 failed | 7 skipped  ->  8 passed
RV-07 (пагинация ограничена 1 страницей) -> 1 failed | 8 skipped  ->  9 passed
```

**Честно НЕ выполнено:** поведение React-компонента `TelegramAutoLogin` (монтирование,
`useEffect`, `localStorage`) не проверено автотестом — `vitest.config.ts` объявляет unit-слой на
`environment: 'node'` без jsdom, `web-shell.test.tsx` рендерит только через
`renderToStaticMarkup` (без эффектов). Логика решения вынесена в чистые функции и покрыта
ПОЛНОСТЬЮ (`tests/unit/telegram-auto-login.test.ts`, 11 тестов); сам компонент проверен чтением
кода. Маршрут просмотра карточки `/c/{id}` (канон, `scan-pipeline`) в этом worktree отсутствует
по построению — тот же класс пробела, что AC-9 исходного `review-report.md`.

### Прогоны попытки 3

```
npm run test                                              -> Test Files 11 passed | Tests 62 passed
npm run typecheck / npm run lint / npm run build          -> 0 / 0 / 0
docker compose --env-file .env --profile test run --rm -T test npm run test:integration
                                                           -> Test Files 20 passed | Tests 78 passed
                                                              (воспроизведено дважды подряд)
check-pipeline-gaps.sh --completion                        -> контур consent-and-telegram-auth: 0 GAP
                                                              (37 GAP scan-pipeline — не этот worktree,
                                                              DEC-A-011; 1 NOT-ESTABLISHED — вендорный
                                                              дефект склейки пути, не наш файл)
node ../../.claude/hooks/check-review-contract.cjs . consent-and-telegram-auth
                                                           -> PASS AC-ids=20 rows=20
bash scripts/check-env-wiring.sh .                        -> api/recognizer чисто
bash ../../scripts/check-port-conflicts.sh .              -> 0 (порт 4181 свободен)
docker compose -p n4-tarelka-consent-b down -v            -> тома/сеть/контейнеры удалены;
                                                              docker images | grep n4-tarelka-consent-b:
                                                              0 образов (профиль edge НЕ поднимался,
                                                              images НЕ собирались — по указанию
                                                              координатора, диск машины 99% в начале
                                                              прохода)
```

Итого попытки 3: **140 тестов** (62 unit + 78 integration/concurrency), 0 упавших. Новых в этом
проходе — 11 unit + 7 integration = 18 тестов.

Status: completed

## Попытка 4 — ПОСЛЕДНЯЯ корректирующая попытка (DEC-A-032, режим скорости), только high

Владелец перевёл проект в режим скорости: дальше без нового ревью — сразу слияние. По прямому
указанию закрыты ТОЛЬКО три `high` четвёртого (слепого) обзора; две `medium` (RV-04, RV-05)
сознательно НЕ трогались — вынесены в `docs/features/consent-and-telegram-auth/05_completion.md`,
раздел «Follow-up, не блокирующий закрытие».

- **RV-01 (high, `share-card-repository.ts:34`/`diary-entry-repository.ts`)**: guard проверял
  согласие СВЯЗАННОГО аккаунта (`accountId`), но `INSERT` писал `owner_key = input.owner.id` —
  исходный `session_id`. Отзыв согласия по `owner_key = accountId` карточку не находил;
  `RunErasureJob` падал на `ON DELETE RESTRICT`. Правка: `ConsentEnforcement` при
  `outcome:'granted'` теперь возвращает `ownerKey` — канонический идентификатор, реально
  проверенный под блокировкой; оба репозитория пишут `enforcement.ownerKey`, а не `input.owner.id`.
- **RV-02 (high, `auth-telegram.ts:153`)**: после эразуры повтор initData вставлял новый
  `account` (шаг 1), затем `claimReplay` обнаруживал повтор и колбэк ВОЗВРАЩАЛ `{kind:'replayed'}`
  — `withTransaction` коммитил вставку вместе с честным `401`. Правка: `replayed`/`erasing`
  теперь ИСКЛЮЧЕНИЯ (`LoginReplayedError`, `AccountErasingError`), откатывающие транзакцию
  целиком; разбираются `catch` СНАРУЖИ `withTransaction`.
- **RV-03 (high, `telegram-auto-login.tsx:57,118`)**: постоянный `localStorage`-флаг
  (`TELEGRAM_LINKED_KEY`) навсегда запрещал автологин даже со свежей initData; `401
  initdata_replayed` трактовался как доказательство входа. Правка: флаг удалён целиком (и из
  `settings/telegram-login-button.tsx`, который его тоже читал только для отображения);
  `shouldAttemptTelegramLogin` лишился параметра `alreadyLinked` — дедупликация ограничена
  ТОЛЬКО последней отправленной строкой initData.

**Испытание стражей мутацией** (`guard-must-be-able-to-fail.md`) — на настоящем PostgreSQL
профиля `test`, дефект внедрён вручную, снят после красного:

```
RV-01 (owner_key = input.owner.id, старое поведение)  -> 1 failed | 9 skipped -> 10 passed
RV-02 (return {kind:'replayed'} вместо throw)         -> 1 failed | 9 skipped -> 10 passed
```

Новые/дополненные тесты: `tests/integration/erasure-job.test.ts` («review4 RV-01: карточка,
созданная ЧЕРЕЗ связанную сессию…» — воспроизводит связать→согласие→создать через сессию→
отозвать→эразура, проверяет `owner_key` напрямую и завершение `RunErasureJob` без ошибки FK);
`tests/integration/auth-telegram.test.ts` (существующий «review3 RV-04…» дополнен полным снимком
`account` до/после отказавшего повтора — `toEqual` + `toHaveLength(1)`); `tests/unit/telegram-
auto-login.test.ts` (тест на `alreadyLinked`, закреплявший дефект, ПЕРЕПИСАН на противоположное
утверждение; сигнатура функции лишилась параметра).

### Прогоны попытки 4

```
npm run test                                              -> Test Files 11 passed | Tests 62 passed
npm run typecheck / npm run lint / npm run build          -> 0 / 0 / 0
docker compose --env-file .env --profile test run --rm -T test npm run test:integration
                                                           -> Test Files 20 passed | Tests 79 passed
                                                              (воспроизведено дважды подряд)
bash ../../scripts/check-pipeline-gaps.sh .                -> контур consent-and-telegram-auth:
                                                              0 [GAP]-маркеров во всех 7 файлах
                                                              контура; ⚠️/❌ общего прогона —
                                                              PR-002/003/007 других контуров
                                                              (foundation/scan-pipeline), не этот
                                                              worktree
node ../../.claude/hooks/check-review-contract.cjs . consent-and-telegram-auth
                                                           -> PASS AC-ids=20 rows=20
bash ../../scripts/check-port-conflicts.sh .               -> 0 (порт 4181 свободен)
docker compose -p n4-tarelka-consent-b down -v             -> тома/сеть/контейнеры удалены;
                                                              docker images | grep n4-tarelka-consent-b:
                                                              0 образов (профиль edge НЕ поднимался,
                                                              images НЕ собирались — диск машины 99%,
                                                              1.6 ГБ свободно)
```

Итого попытки 4: **141 тестов** (62 unit + 79 integration/concurrency), 0 упавших. Новых в этом
проходе — 1 unit (переписан, не просто добавлен) + 2 integration = 3 теста, плюс 2 мутационных
испытания стражей.

**Честно НЕ сделано в этой попытке (по прямому указанию координатора, режим скорости):**
RV-04 (medium, `grant-or-decline.ts:38`, decline не проверяет версию) и RV-05 (medium, заголовки
тестов обещают больше, чем проверяют — `consent.test.ts:95`, `account-delete.test.ts:71`,
73-часовой тест `erasure-job.test.ts`, AC-20) — перенесены в `05_completion.md`, «Follow-up».
Также туда перенесены уже названные ограничения: монтирование `TelegramAutoLogin` без jsdom и
отсутствующий маршрут `/c/{id}` (не этот worktree).

Status: completed
