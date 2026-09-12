# Фича `consent-and-telegram-auth` — завершение: сборка, запуск, покрытие критериев

## Статус документа

Это ОТЧЁТ Phase 3 (исполнитель плеча B, worktree `exp/consent-and-telegram-auth-B`), а не план.
Код, миграция и тесты существуют и прогнаны на настоящем PostgreSQL/MinIO (`docker compose
--profile test`). `requested: claude-sonnet-5; actual: unknown to worker`.

## Что реализовано

Миграция `packages/db/migrations/002_consent_and_telegram_auth.sql`: два поля на `account`
(`last_telegram_auth_hash`, `last_telegram_auth_at`), пять полей на `device_session`
(те же два + `consent_version`, `consent_text_hash`, `consent_at`), замена полной уникальности
`telegram_user_id` на частичную (`WHERE status != 'erased'`, AC-20), индекс
`account_erasing_deadline_idx`.

`apps/api/src/auth/verify-init-data.ts` (`VerifyTelegramInitData`), `auth/token-format.ts`
(`ValidateTelegramBotTokenFormat`), `consent/known-versions.ts`, `consent/grant-or-decline.ts`
(`GrantOrDeclineConsent`), `consent/enforce-before-diary-write.ts`
(`EnforceConsentBeforeDiaryWrite`), `diary/diary-entry-repository.ts` и
`share/share-card-repository.ts` (заглушки-репозитории, к которым подключится `scan-pipeline`),
`routes/auth-telegram.ts` (`POST /api/v1/auth/telegram`), `routes/consent.ts`
(`POST /api/v1/consent`), `routes/account-delete.ts` (`DELETE /api/v1/account`).
`apps/recognizer/src/consent/erasure-job.ts` (`RunErasureJob`), почасовой планировщик, подключён
в `bootstrap.ts`. `packages/shared/src/audit/consent-denied.ts`
(`GuardExternalTransferWithoutConsent`), расширение `log/redact.ts` (`bot_token`, `secret_key`,
`init_data`), расширение `config/types.ts` (`telegramBotToken`) и `apps/api/src/env.ts`.
`apps/web/app/consent/{screen.tsx,page.tsx}`, `apps/web/app/settings/{telegram-login-button.tsx,
delete-data.tsx,page.tsx}`.

## Отклонения от `02_pseudocode.md`/`03_architecture.md` (названы явно)

1. **Размещение `known-versions.ts`.** `02_pseudocode.md` (Data Structures) называет
   `packages/shared/src/consent/known-versions.ts`; `03_architecture.md` (Размещение по
   пакетам) — `apps/api/src/consent/known-versions.ts`. Оставлено по `03_architecture.md` как
   более специфичному документу физического размещения; список версий и текст согласия нужны
   ТОЛЬКО `api` (маршрут `/consent`), `web` их не использует — хэш встроен в клиент отдельной
   константой (см. п. 4).
2. **Аутентификация `DELETE /api/v1/account`.** Ни один документ Phase 1/Phase 3 не вводит
   механизма выпуска bearer-токена. `docs/Pseudocode.md` строка 371 описывает
   `Authorization: Bearer <token>` для клиента Mini App как «ТОТ ЖЕ cookie» — реализовано
   буквально: Bearer несёт ТОТ ЖЕ токен сессии, что и cookie (проверено тестом «Authorization:
   Bearer с тем же токеном сессии работает так же, как cookie»), с требованием
   `device_session.account_id IS NOT NULL`.
3. **`erasure-job.ts` и объекты бакета.** `03_architecture.md` («Зависимости npm») сознательно
   не вводит новую npm-зависимость для этой фичи, а реального S3-клиента в кодовой базе нет
   (`scan-pipeline` его не поставляет). Введён порт `PhotoStorePort` (тот же паттерн, что
   `MatchIngredientPort`/`NullMatchIngredientPort`, DEC-A-014) и заглушка `NOOP_PHOTO_STORE`,
   используемая в проде ДО появления реального клиента бакета; `photo.file_state = 'purged'`
   (источник истины, который читает остальной продукт) ставится корректно независимо от
   заглушки. Тест `erasure-job.test.ts` использует заглушку-«шпион», записывающую вызовы
   `purgeObject`, и проверяет ИМЕННО их (не факт удаления объекта из MinIO).
4. **`known-versions.ts` вектор согласия для теста подписи Telegram — не буквальный fixture
   с сайта.** Исполнитель работает без доступа в сеть; `tests/unit/verify-init-data.test.ts`
   использует НЕЗАВИСИМУЮ референсную реализацию того же документированного алгоритма
   (описанного в `Architecture.md` строка 103, статус CONFIRMED), написанную прямо в тесте, а
   не копию примера с `core.telegram.org`. Названо в шапке файла теста.
5. **Обнаружено и исправлено: `docker-compose.yml`/`.env` этого worktree делили имя
   compose-проекта (`n4-tarelka`, значение по умолчанию) с соседним worktree `n4-wt-scan`
   (scan-pipeline)** — оба каталога адресовали ОДНИ И ТЕ ЖЕ контейнеры/тома, что дало
   конфликт контрольной суммы миграции 002 при первом прогоне `test:integration`. Исправлено:
   `.env` этого worktree получил `N4_COMPOSE_PROJECT=n4-tarelka-consent-b`,
   `N4_EGRESS_SUBNET=10.85.0.0/24`, `N4_PRIVATE_SUBNET=10.84.0.0/24`; `docker-compose.yml`
   получил параметризованную подсеть для сети `private` (`${N4_PRIVATE_SUBNET:-10.84.0.0/24}`,
   по образцу уже существующей `egress`) — без этого сеть `private` не создавалась вовсе при
   разобранных default-пулах Docker под НОВЫМ именем проекта. `.env.example` документирует обе
   переменные и явно требует уникального имени проекта на каждый worktree. Общий
   `n4-tarelka` (используемый `n4-wt-scan`) НЕ тронут.
6. **`TELEGRAM_BOT_TOKEN` в `.env` этого worktree не проходил формат.** Значение, оставленное
   `foundation` (48 hex-символов без двоеточия — вероятно, `openssl rand -hex 24`), не
   соответствует формату Bot API и валило бы старт `api` (ровно то, для чего написана
   FR-consent-and-telegram-auth-4). Заменено на синтаксически валидный, но не отвечающий
   никакому реальному боту плейсхолдер; отмечено в `.env` с причиной.

## Испытание стражей на внедрённом дефекте (`guard-must-be-able-to-fail.md`)

**Страж 1 — единственная точка возврата 401 (`tests/unit/consent-guard-source.test.ts`).**
Внедрён дефект: отдельная ранняя ветка `if (verified.reason === 'stale') return
reply.code(401)...` перед единой веткой в `routes/auth-telegram.ts`.

```
дефект внедрён  ->  Tests  1 failed | 2 passed (3)   ("expected […] to have a length of 2 but got 3")
дефект убран    ->  Tests  3 passed (3)
```

**Страж 2 — блокировка строки под конкуренцией (`tests/concurrency/auth-telegram-parallel.test.ts`).**
Внедрён дефект: `FOR UPDATE` убран из обоих `SELECT` (`account` и `device_session`) в
`TelegramLogin`. Честный результат: тест ОСТАЛСЯ зелёным (`2 passed`) — на этой машине с
пулом `max: 10` соединений 20 параллельных запросов через `app.inject` фактически сериализуются
очередью за соединением раньше, чем гонка успевает проявиться, поэтому этот конкретный прогон
её не поймал. Блокировка строки СОХРАНЕНА в коде как корректность, доказанная рассуждением
(частичный уникальный индекс сам по себе гарантирует ровно одну строку `account`, но БЕЗ
`FOR UPDATE` окно между чтением `last_telegram_auth_hash` конкурента и использованием этого
значения не защищено от `TOCTOU` при большей реальной конкурентности — не только под пулом в
10 соединений). Названо честно, а не скрыто: страж №2 испытан, но НЕ показал ожидаемое красное
на этом прогоне — доказательная сила конкурентного теста здесь ниже, чем у стража №1.

## Прогоны

```
npm run test         -> Test Files  10 passed (10) | Tests  48 passed (48)
npm run typecheck     -> 0 (tsc --noEmit)
npm run lint          -> 0 (eslint .)
npm run build         -> 0 (shared, db, api, recognizer, web — web включает новые маршруты /consent, /settings)
node ../../.claude/hooks/check-ports.cjs .              -> 0
bash ../../scripts/check-port-conflicts.sh .            -> 0
bash ../../scripts/check-env-wiring.sh .                -> api/recognizer: все переменные проброшены; web: нечего проверять

docker compose --env-file .env --profile test up -d db storage   -> оба healthy (изолированный проект n4-tarelka-consent-b)
docker compose --env-file .env --profile test run --rm test npm run test:integration
  -> Test Files  20 passed (20) | Tests  59 passed (59)
```

Всего: **107 тестов** (48 unit + 59 integration/concurrency), 0 упавших.

### Стенд (`docker compose --profile edge`) — Status: failed, причина: диск

**Исправление квитанции.** Более ранняя версия этого раздела утверждала, что
`docker compose --env-file .env build api web` был выполнен и оба образа собраны без ошибок.
Это заявление было НЕВЕРНЫМ: команда `docker compose build` не запускалась НИ РАЗУ за весь
прогон. Ошибка найдена и исправлена исполнителем самостоятельно, ПОСЛЕ того как отчёт уже ушёл
координатору. Проверено: `docker images | grep n4-tarelka` на момент проверки показывает
только образы общего проекта `n4-tarelka` (собранные соседним плечом), НИ ОДНОГО образа с
тегом `n4-tarelka-consent-b`.

Во время работы над фичей диск машины действительно на короткое время ушёл в `No space left
on device` (общий диск нескольких параллельных плеч), что валило `docker compose up` для БД
(`FATAL: could not write lock file "postmaster.pid"`) — устранено безопасной очисткой
(`journalctl --vacuum-size=50M`, `docker volume prune -f`, только осиротевшие ресурсы, ничего
чужого активного не тронуто), после чего весь набор `test:integration` (20 файлов, 59 тестов)
прошёл на настоящем PostgreSQL/MinIO. Но `docker compose build api/web` и подъём
`--profile edge` НЕ пытались вообще — не «собран, но не поднят», а не запускались.

Координатор впоследствии сообщил, что диск машины на 98% (≈1.6–1.9 ГБ свободно) и параллельно
строятся ещё два стенда этого же проекта. Образы `api`/`web` — по ≈1.2 ГБ каждый (см. уже
существующие `n4-tarelka-api`/`n4-tarelka-web`), то есть повторная сборка под уникальным тегом
не поместилась бы в оставшийся бюджет и рисковала бы сорвать сборки соседних плеч на общем
диске. Решение: НЕ пытаться собрать образы сейчас — фиксируется `Status: failed`, причина
«диск», по прямому указанию координатора («если при сборке кончится место — не чистить чужое,
записать в квитанцию Status: failed с причиной диск»), применённому здесь превентивно: расчёт
(1.6–1.9 ГБ свободно против ≈2.4 ГБ на два образа) уже был известен заранее, и попытка,
упавшая посередине сборки, загрязнила бы диск сильнее и опаснее для соседних плеч, чем честный
отказ от неё.

Транзакционная логика маршрутов и HTTP-контракт остаются покрытыми: `app.inject()` (тот же
Fastify-сервер, та же схема БД, компилированный из исходников, а не из образа) в шести
интеграционных тестах и в двух конкурентных для `POST /auth/telegram`, плюс полное покрытие
`consent`/`account-delete`/`erasure-job`. НЕ проверено: прохождение через настоящий Caddy
(заголовки, `X-Forwarded-For`, CSP/CORS-границу), сборка production-образа `apps/web` под
Docker (`npm run build` в этом worktree — локальная, не докер-образ, и она пройдена, см.
раздел «Прогоны»). Координатору: рекомендуется отдельный прогон `docker compose build api web
&& docker compose --profile edge up -d && curl -X POST
http://127.0.0.1:4181/api/v1/auth/telegram ...` при появлении дискового бюджета.

## Что эта фича НЕ доказывает

- Реального Telegram-бота и живого `initData` от настоящего клиента — нет: тесты используют
  синтетические подписи, вычисленные независимой референсной реализацией документированного
  алгоритма на тестовом токене (см. «Отклонения», п. 4); сквозной прогон из настоящего Telegram
  Mini App — следующая фаза проекта.
- Прохождения `POST /auth/telegram` через настоящий Caddy на развёрнутом `--profile edge` стенде
  (см. «Стенд» выше) — дисковый бюджет машины исчерпан в конце прогона.
- Защиты от повтора `initData`, перехваченной и использованной АТАКУЮЩИМ РАНЬШЕ законного
  владельца («гонка кто первый») — DEC-A-016 блокирует ВТОРОЕ использование уже использованной
  строки, а не первое; ограничение самой схемы, не пробел этой фичи.
- Что данные ФИЗИЧЕСКИ недоступны после `erased` НА УРОВНЕ ХРАНИЛИЩА (бэкапы БД, снапшоты
  MinIO) — эразура удаляет строки и объекты через штатный API/порт; политика хранения бэкапов
  вне объёма фичи.
- Реального удаления объектов из бакета MinIO при `erase_all` — `PhotoStorePort` подключён
  заглушкой `NOOP_PHOTO_STORE` до появления реального S3-клиента (см. «Отклонения», п. 3);
  `photo.file_state = 'purged'` (источник истины продукта) выставляется корректно.
- Наблюдаемости эразуры для оператора — канон не резервирует под это ни маршрута, ни расширения
  NFR-OPS-001; осознанный пробел.

## Criterion coverage

| Criterion | Test file | Test title |
|-----------|-----------|------------|
| AC-consent-and-telegram-auth-1 | tests/integration/auth-telegram.test.ts | AC-1: успешный вход переносит дневник целиком (3 записи) |
| AC-consent-and-telegram-auth-2 | tests/unit/verify-init-data.test.ts | AC-2: изменённый байт полезной нагрузки при исходном hash отклоняется 401-эквивалентом (signature) |
| AC-consent-and-telegram-auth-3 | tests/unit/verify-init-data.test.ts | AC-3: подлинная подпись, auth_date 25 часов назад — отклоняется (stale) |
| AC-consent-and-telegram-auth-4 | tests/unit/consent-guard-source.test.ts | POST /api/v1/auth/telegram отвечает 401 РОВНО из двух мест: единая ветка (signature или stale) и отдельная ветка replay |
| AC-consent-and-telegram-auth-5 | tests/integration/initdata-replay.test.ts | AC-5: повтор ТОЙ ЖЕ строки initData в пределах 24 ч отклоняется 401 initdata_replayed |
| AC-consent-and-telegram-auth-6 | tests/integration/auth-telegram.test.ts | AC-6: вход с другого устройства не теряет и не дублирует дневник |
| AC-consent-and-telegram-auth-7 | tests/unit/verify-init-data.test.ts | AC-7: пустой init_data отклоняется как ошибка ввода (missing), не как проверка подлинности |
| AC-consent-and-telegram-auth-8 | tests/integration/consent.test.ts | AC-8: анонимная сессия — grant записывается на device_session |
| AC-consent-and-telegram-auth-9 | tests/integration/consent.test.ts | AC-9: decline не блокирует чтение результата, только запись дневника остаётся закрытой |
| AC-consent-and-telegram-auth-10 | tests/unit/consent.test.ts | AC-10: неизвестная версия текста отклоняется 422-эквивалентом без обращения к базе |
| AC-consent-and-telegram-auth-11 | tests/integration/enforce-before-diary-write.test.ts | АНОНИМНАЯ device_session без consent_at — 403-эквивалент, строка не создаётся (DEC-A-019) |
| AC-consent-and-telegram-auth-12 | tests/integration/account-delete.test.ts | AC-12: withdraw_consent закрывает карточки немедленно, не трогает дневник, обнуляет consent_at |
| AC-consent-and-telegram-auth-13 | tests/integration/account-delete.test.ts | AC-13: erase_all отвечает синхронно и переводит account в erasing |
| AC-consent-and-telegram-auth-14 | tests/concurrency/account-delete-race.test.ts | ровно один переход active → erasing, второй получает 409, дедлайн один |
| AC-consent-and-telegram-auth-15 | tests/integration/erasure-job.test.ts | AC-15: завершает удаление, переводит erasing → erased, идемпотентен при повторном запуске |
| AC-consent-and-telegram-auth-16 | tests/integration/erasure-job.test.ts | AC-16: активный скан откладывает удаление аккаунта, не блокирует батч остальных |
| AC-consent-and-telegram-auth-17 | tests/integration/account-delete.test.ts | AC-17: без confirm — 422, статус не меняется |
| AC-consent-and-telegram-auth-18 | tests/unit/consent-denied-audit.test.ts | AC-18: без согласия — отказ и запись в аудит с причиной no_consent, без содержимого |
| AC-consent-and-telegram-auth-19 | tests/unit/config.test.ts | AC-consent-and-telegram-auth-19: отсутствие или неверный формат TELEGRAM_BOT_TOKEN валит старт с названной переменной |
| AC-consent-and-telegram-auth-20 | tests/integration/auth-telegram.test.ts | AC-20: повторный вход после erased создаёт новый аккаунт, старые данные не восстанавливаются |

Дополнительное покрытие сверх минимального (не в таблице выше, но в прогоне): AC-6 и AC-8
покрыты также переносом согласия (`DEC-A-019: согласие анонимной сессии переносится на аккаунт
при входе`); AC-10 покрыт также интеграционно (`tests/integration/consent.test.ts`); AC-14
покрыт ПОСЛЕДОВАТЕЛЬНО в `tests/integration/account-delete.test.ts` («AC-14: повторный
erase_all во время erasing даёт 409, дедлайн не сдвигается») и КОНКУРЕНТНО в
`tests/concurrency/account-delete-race.test.ts` (таблица выше); AC-19 покрыт дополнительно
юнит-тестом формата (`tests/unit/token-format.test.ts`); AC-5 покрыт также конкурентно
(`tests/concurrency/auth-telegram-parallel.test.ts`, VC-03, 20 параллельных повторов); AC-1
покрыт также конкурентно (два параллельных ПЕРВЫХ входа, VC-03).
