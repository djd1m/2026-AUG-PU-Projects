# Квитанция — plan-consent (Phase 1 PLAN, плечо B, фича `consent-and-telegram-auth`)

RUN_ID: 20260912T201834Z-consent-and-telegram-auth-B-7076
WORK_UNIT_ID: plan-consent
requested: claude-sonnet-5; actual: unknown to worker

## Файлы

- `docs/features/consent-and-telegram-auth/01_specification.md` — 13 FR, 2 NFR, 20 AC
- `docs/features/consent-and-telegram-auth/02_pseudocode.md` — 8 алгоритмов (`VerifyTelegramInitData`,
  `TelegramLogin`, `GrantOrDeclineConsent`, `EnforceConsentBeforeDiaryWrite`, `RevokeConsentOrErase`,
  `RunErasureJob`, `ValidateTelegramBotTokenFormat`, `GuardExternalTransferWithoutConsent`,
  `RenderConsentAndAuthScreens`), API Contracts (уточнение отказов маршрутов 9/12/13), State
  Transitions (`account.status`), Error Handling Strategy, Scenario Coverage (4/4 сценариев проекта
  заявлены)
- `docs/features/consent-and-telegram-auth/03_architecture.md` — размещение по `apps/api`,
  `apps/recognizer`, `apps/web`, External Dependencies (Telegram initData — переиспользована
  подтверждённая цитата), переменные окружения (без нового `N4_TELEGRAM_LOGIN`), Data Architecture
  (без новых сущностей, один новый индекс `002_erasure_index.sql`)
- `docs/features/consent-and-telegram-auth/04_refinement.md` — 24-строчная Edge Cases Matrix, раздел
  «Нерешённое: withdraw и будущие записи», 20 запланированных тестов, испытание стража на
  внедрённом дефекте, Security Hardening
- `docs/features/consent-and-telegram-auth/05_completion.md` — плановый порядок Phase 3, команды,
  чеклист готовности, плановая таблица Criterion coverage на все 20 AC

## FR/AC/алгоритмы

FR-consent-and-telegram-auth-1…13, NFR-consent-and-telegram-auth-1…2,
AC-consent-and-telegram-auth-1…20 — полный список и трассировка на `docs/Specification.md`
(FR-AUTH-002, FR-AUTH-003, FR-GROWTH-006, NFR-SEC-002), `docs/Pseudocode.md` (`TelegramLogin`,
`ConsentAndErasure`), `docs/ADR.md` (ADR-002, ADR-009, ADR-010) — таблица «Трассировка на документы
проекта» в конце `01_specification.md`.

## Команда и код ворот

```
bash /root/.npm/_npx/ac10dded1a3b4a50/node_modules/@dzhechkov/p-replicator/scripts/check-pipeline-gaps.sh . --traceability --role-map-source ../../.claude/commands/feature.md --project-role-map-source ../../.claude/skills/sparc-prd-mini/SKILL.md
```
(версия пакета 1.13.2, DEC-A-010). Первый прогон дал `VERDICT traceability=FAIL features=3 gaps=7`
(семь FR/AC этой фичи не имели `REQUIREMENT:` в `02_pseudocode.md`: AC-5, AC-18, AC-19,
FR-consent-and-telegram-auth-3/4/12/13). Добавлены три алгоритма
(`ValidateTelegramBotTokenFormat`, `GuardExternalTransferWithoutConsent`,
`RenderConsentAndAuthScreens`) и `REQUIREMENT:`-строки на `VerifyTelegramInitData` для документированно
НЕ реализуемых FR-3/AC-5. Повторный прогон:
`VERDICT traceability=PASS features=3 gaps=0 inconclusive=0` — **код возврата 0**, все четыре контура
(`project`, `foundation`, `scan-pipeline`, `consent-and-telegram-auth`) зелёные.

## Вопросы координатору (три пункта, ни один не решён единолично)

1. **Защита от повтора `initData`** (FR-consent-and-telegram-auth-3, AC-5). Бриф фичи требовал
   «hash initData использован один раз». Реализация требует НОВОГО логического поля на `account`
   (например `last_telegram_auth_hash`/`last_telegram_auth_at`) либо новой, 15-й сущности сверх
   закрытого канона §4 (14 сущностей). Ни один из документов проекта (`Pseudocode.md`,
   `Architecture.md`, `ADR.md`, `decisions-autonomous.md`) не вводит такое поле или сущность. НЕ
   реализовано; задокументировано как открытый пробел с двумя предложенными вариантами
   (`01_specification.md`, «Открытый вопрос»; `04_refinement.md`, edge case; `05_completion.md`,
   «Что эта фича НЕ доказывает»).
2. **`N4_TELEGRAM_LOGIN=on|off` не введён.** Бриф предполагал переключатель для условной
   обязательности `TELEGRAM_BOT_TOKEN`. Фактически `foundation` уже объявила токен БЕЗУСЛОВНО
   обязательным в compose (`${TELEGRAM_BOT_TOKEN:?…}`), и вход через Telegram — не опциональная
   возможность продукта (FR-AUTH-002 обязателен). Переключатель ввёл бы недокументированное
   состояние «продукт без входа». Вместо него добавлена ТОЛЬКО проверка ФОРМАТА токена в коде `api`
   (FR-consent-and-telegram-auth-4) — не новая конфигурационная семантика.
3. **Блокирует ли `withdraw_consent` будущие записи дневника?** Канон (`ConsentAndErasure` шаг 3)
   описывает только немедленное закрытие карточек и не трогает `account.consent_at`. Буквальное
   чтение: НЕ блокирует (новое поле `consent_revoked_at` — то же ограничение канона, что в пункте 1).
   Зафиксировано как открытый вопрос в `04_refinement.md`, «Нерешённое: withdraw и будущие записи»,
   с указанием, что Phase 3 обязана либо получить решение координатора, либо реализовать букву
   канона с явной пометкой в квитанции.

Ни новых сущностей, ни новых маршрутов сверх канона (§4 — 14 сущностей, §5 — 14 маршрутов +
`/health`) не введено. Все три пункта выше — открытые вопросы, а не самовольные решения.

## Попытка 2 — решения координатора DEC-A-016 (2026-09-12)

Координатор закрыл все три открытых вопроса решением DEC-A-016:

1. **Защита от повтора `initData` — РЕАЛИЗОВАНА** без новой сущности: два логических поля
   (`last_telegram_auth_hash: string?`, `last_telegram_auth_at: Timestamp?`) добавлены к КАЖДОЙ из
   двух уже существующих сущностей — `account` и `device_session`. Сверка встроена в `TelegramLogin`
   шаг 2 (ПОСЛЕ подписи и свежести, ДО поиска/создания аккаунта): совпадение `hash` в окне 24 ч →
   `401 initdata_replayed`. FR-consent-and-telegram-auth-3 переписан из «не реализуется» в описание
   механизма; AC-consent-and-telegram-auth-5 переписан из «известное ограничение» в проверяемый
   критерий отказа.
2. **`N4_TELEGRAM_LOGIN` не введён** — подтверждено координатором без изменений, оставлено как в
   попытке 1 (FR-consent-and-telegram-auth-4, проверка формата токена).
3. **Отзыв согласия (`withdraw_consent`) теперь БЛОКИРУЕТ** последующие `diary_entry`/`share_card`:
   `RevokeConsentOrErase` шаг 3 дополнительно обнуляет `account.consent_at` (существующее поле,
   второе не заводится); `EnforceConsentBeforeDiaryWrite` не различает «согласия не было» и
   «согласие отозвано» — оба дают `403 consent_required`. Существующие записи и уже созданные
   карточки (кроме публикации, закрытой немедленно) сохраняются до `erase_all`. Раздел
   «Нерешённое» в `04_refinement.md` заменён на «Решено (DEC-A-016)».

Изменены все пять документов: `01_specification.md` (раздел решений, FR-3/7/8, AC-5/12),
`02_pseudocode.md` (Data Structures — таблица новых полей; `TelegramLogin` — шаг сверки на повтор
и запись меток; `RevokeConsentOrErase` шаг 3; `EnforceConsentBeforeDiaryWrite` шаг 3; Error Handling
Strategy — две строки), `03_architecture.md` (Data Architecture — две новые колонки на каждой из
двух таблиц, два индекса, переименована миграция), `04_refinement.md` (edge cases, раздел «Решено»,
тест `initdata-replay.test.ts` описан как защита, а не как факсация пробела),
`05_completion.md` (чеклист, «Что фича НЕ доказывает», Criterion coverage AC-5/AC-12).

Первый прогон ворот после правок дал `DUPLICATE … AC-consent-and-telegram-auth-5`,
`DUPLICATE … FR-consent-and-telegram-auth-3` (оба ключа были объявлены REQUIREMENT одновременно в
`VerifyTelegramInitData` и в `TelegramLogin` — дублирующая декларация запрещена wire-форматом).
Исправлено: `REQUIREMENT:` для FR-3/AC-5 оставлен только в `TelegramLogin`, где реально выполняется
шаг сверки. Повторный прогон:

```
bash /root/.npm/_npx/ac10dded1a3b4a50/node_modules/@dzhechkov/p-replicator/scripts/check-pipeline-gaps.sh . --traceability --role-map-source ../../.claude/commands/feature.md --project-role-map-source ../../.claude/skills/sparc-prd-mini/SKILL.md
```
`VERDICT traceability=PASS features=3 gaps=0 inconclusive=0` — **код возврата 0**.

Никакой новой сущности и никакого нового маршрута сверх канона по-прежнему не введено: DEC-A-016
расширил ДВЕ существующие сущности логическими полями, не добавил 15-ю сущность или 15-й маршрут.

## Попытка 3 — находки валидатора VC-01…03 (`docs/features/consent-and-telegram-auth/validation-report.md`)

1. **VC-01 — устаревший абзац и опечатка префикса.** `02_pseudocode.md` в конце Scenario Coverage
   утверждал, что защита от повтора «НЕ реализуется» и «AC-consent-and-telegram-auth-13» — экраны
   (на деле AC-13 — критерий про `erase_all`, экраны это FR-13). Оба исправлены: абзац переписан по
   факту DEC-A-016 (защита реализована, `TelegramLogin` шаг 2), тест `initdata-replay.test.ts`
   назван ОБЯЗАТЕЛЬНЫМ; ссылка на экраны исправлена на `FR-consent-and-telegram-auth-13`.
2. **VC-02 — решение DEC-A-019: анонимного исключения НЕТ.** Согласие требуется перед первой
   записью дневника ДЛЯ ЛЮБОЙ сессии, включая анонимную (ADR-009, SC-US-012-1 не делают
   исключения). `device_session` расширена тремя полями `consent_version`/`consent_text_hash`/
   `consent_at` (те же, что уже есть у `account` — не новая сущность). Изменены:
   `EnforceConsentBeforeDiaryWrite` (шаг 1 разрешает владельца в `account` ИЛИ `device_session` без
   исключения), `GrantOrDeclineConsent` (пишет в ту таблицу, что разрешена), `TelegramLogin` (новый
   шаг 6 — перенос согласия с сессии на аккаунт при входе, без перезаписи уже имеющегося у аккаунта
   согласия), FR-consent-and-telegram-auth-5/7, AC-8/AC-11 (оба — два прогона: аккаунт и анонимная
   сессия), edge cases и тесты в `04_refinement.md`.
3. **VC-03 — конкурентный тест защиты от повтора и гонка создания аккаунта.** Добавлены: (а) тест
   20 параллельных `POST /auth/telegram` одной `initData` → 1×`200`, 19×`401 initdata_replayed`;
   (б) путь конфликта уникального индекса `(telegram_user_id) WHERE status != 'erased'` при двух
   параллельных ПЕРВЫХ входах — `TelegramLogin` шаг 3 переписан на `ON CONFLICT … DO NOTHING` +
   повторный `SELECT` с ПОВТОРНОЙ сверкой хэша на конфликте (иначе конкурент с тем же `initData`,
   проигравший гонку `INSERT`, увидел бы чужую победу как свой успешный вход вместо `401`). Оба
   сценария — новые строки в Edge Cases Matrix и Testing Strategy `04_refinement.md`, чеклист и
   индекс (`(telegram_user_id) WHERE status != 'erased'`) — в `03_architecture.md` Data Architecture.

Изменённые файлы: `01_specification.md` (FR-5/7, AC-8/11), `02_pseudocode.md` (Data Structures —
три поля на `device_session`; `GrantOrDeclineConsent`, `EnforceConsentBeforeDiaryWrite`,
`TelegramLogin` шаги 3/6/9 переписаны; Scenario Coverage — устаревший абзац и опечатка исправлены),
`03_architecture.md` (второй индекс), `04_refinement.md` (6 новых строк edge cases, 4 новых теста,
раздел «Решено» без изменений), `05_completion.md` (2 новых пункта чеклиста).

Ворота после правок:
```
bash /root/.npm/_npx/ac10dded1a3b4a50/node_modules/@dzhechkov/p-replicator/scripts/check-pipeline-gaps.sh . --traceability --role-map-source ../../.claude/commands/feature.md --project-role-map-source ../../.claude/skills/sparc-prd-mini/SKILL.md
```
`VERDICT traceability=PASS features=3 gaps=0 inconclusive=0` — **код возврата 0**, с первого прогона
после правок (без DUPLICATE на этот раз).

Status: completed
