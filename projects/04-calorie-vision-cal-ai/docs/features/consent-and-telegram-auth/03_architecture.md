# Фича `consent-and-telegram-auth` — архитектура

Системная архитектура принадлежит [`docs/Architecture.md`](../../Architecture.md) и здесь не
переписывается: ниже только то, что создаёт ЭТА фича, поверх каркаса `foundation`
([`../foundation/03_architecture.md`](../foundation/03_architecture.md)).

## Размещение по пакетам и сервисам

| Требование фичи | Пакет / сервис | Файлы (целевые) |
|---|---|---|
| FR-consent-and-telegram-auth-1 проверка подписи | `apps/api` | `src/auth/verify-init-data.ts` (`VerifyTelegramInitData`) |
| FR-consent-and-telegram-auth-2 вход и перенос | `apps/api` | `src/routes/auth-telegram.ts` (`POST /api/v1/auth/telegram`) |
| FR-consent-and-telegram-auth-4 формат токена | `apps/api` | `src/bootstrap.ts` (расширение `ValidateRuntimeConfig` из `foundation`), `src/auth/token-format.ts` |
| FR-consent-and-telegram-auth-5/6 согласие | `apps/api` | `src/routes/consent.ts` (`POST /api/v1/consent`), `src/consent/known-versions.ts`, `src/consent/grant-or-decline.ts` |
| FR-consent-and-telegram-auth-7 fail-closed граница | `packages/db` | `src/consent/enforce-before-diary-write.ts` — вызывается ИЗ `scan-pipeline` (владелец маршрута дневника), но реализуется здесь, потому что владеет ею эта фича; `scan-pipeline` импортирует функцию, не копирует логику |
| FR-consent-and-telegram-auth-8/9 отзыв и удаление | `apps/api` | `src/routes/account-delete.ts` (`DELETE /api/v1/account`) |
| FR-consent-and-telegram-auth-10/11 фоновая эразура | `apps/recognizer` | `src/consent/erasure-job.ts` (`RunErasureJob`), запускается по расписанию, как `purge-expired.ts` из `scan-pipeline`, но раз в час |
| FR-consent-and-telegram-auth-12 аудит без согласия | `packages/shared` | `src/audit/consent-denied.ts` |
| FR-consent-and-telegram-auth-13 экраны | `apps/web` | `app/settings/telegram-login-button.tsx`, `app/consent/screen.tsx`, `app/settings/delete-data.tsx` |

`apps/recognizer` уже не принимает HTTP-запросов извне (`foundation`, граница не меняется);
`erasure-job.ts` — такая же фоновая задача, как `purge-expired.ts`, без собственного порта.
Доменная логика (`auth/verify-init-data.ts`, `consent/*`) не знает ни `FastifyRequest`, ни клиента
`pg`: маршруты (`routes/*.ts`) — единственная граница, переводящая HTTP в вызовы этих модулей.

## Структура каталогов (добавления к `foundation` и `scan-pipeline`)

```
apps/
├── api/src/
│   ├── auth/
│   │   ├── verify-init-data.ts       # VerifyTelegramInitData: HMAC, сравнение постоянного времени, свежесть
│   │   └── token-format.ts           # проверка формата TELEGRAM_BOT_TOKEN при старте
│   ├── routes/
│   │   ├── auth-telegram.ts          # POST /api/v1/auth/telegram
│   │   ├── consent.ts                # POST /api/v1/consent
│   │   └── account-delete.ts         # DELETE /api/v1/account
│   └── consent/
│       ├── known-versions.ts         # код-владеемый список версий текста согласия + их sha256
│       ├── grant-or-decline.ts       # GrantOrDeclineConsent
│       └── enforce-before-diary-write.ts  # EnforceConsentBeforeDiaryWrite — импортируется scan-pipeline
└── recognizer/src/
    └── consent/
        └── erasure-job.ts            # RunErasureJob, почасовой планировщик

packages/shared/src/
└── audit/
    └── consent-denied.ts             # запись аудита «нет согласия» без содержимого дневника

apps/web/app/
├── settings/
│   ├── telegram-login-button.tsx     # PWA: кнопка; TMA: автозапуск по initData при монтировании
│   └── delete-data.tsx               # два действия: withdraw_consent, erase_all — раздельно
└── consent/
    └── screen.tsx                    # показывается ПЕРЕД первой записью дневника, не перед сканом

tests/
├── unit/          auth/verify-init-data (вектор из спецификации Telegram + подделанные варианты), auth/token-format, consent/known-versions
├── integration/   routes/auth-telegram (перенос дневника, повторный вход, вход после erased), routes/consent (grant/decline/422), routes/account-delete (withdraw/erase/409/422), consent/enforce-before-diary-write
└── concurrency/   routes/account-delete (два параллельных erase_all — второй получает 409, дедлайн не сдвигается), consent/erasure-job (активный recognition откладывает удаление аккаунта, не блокирует батч остальных)
```

Тесты — в общем `tests/`, слоями, как в `foundation`: конкурентные прогоны требуют настоящего
PostgreSQL профиля `test`.

## Зависимости npm (добавления к `foundation`)

| Пакет | Мажор | Где | Зачем |
|---|---|---|---|
| `node:crypto` (встроенный) | — | `apps/api` | `createHmac`, `timingSafeEqual` — Node.js core, новой зависимости не добавляет |

Не ставится в этой фиче ничего нового: HMAC-SHA-256 и сравнение постоянного времени — стандартная
библиотека Node.js, отдельный пакет для этого не нужен и увеличивал бы поверхность атаки без пользы.
Telegram Mini Apps SDK на клиенте — уже зависимость `apps/web` (`foundation` ADR-002); эта фича
использует только его `WebApp.initData`, ничего нового не подключает.

## External Dependencies

| Capability needed | Provider / API | Evidence | Verdict | Requirements relying on it |
|---|---|---|---|---|
| проверка подлинности данных, полученных от Mini App | Telegram Mini Apps (`initData`) | цитата уже подтверждена в `docs/Architecture.md` строка 103: «You can verify the integrity of the data received by comparing the received hash parameter with the hexadecimal representation of the HMAC-SHA-256 signature» ([core.telegram.org/bots/webapps](https://core.telegram.org/bots/webapps), проверено 2026-09-12) | CONFIRMED (переиспользуется, не переснимается заново) | FR-consent-and-telegram-auth-1 |

Инвентарь внешних зависимостей проекта целиком — [`docs/Architecture.md`](../../Architecture.md),
раздел External Dependencies; эта фича не добавляет к нему новых поставщиков — секрет `bot_token`
уже объявлен там же (строка про `sendMessage`) и в `foundation` (`TELEGRAM_BOT_TOKEN`).

## Переменные окружения

Все обязательные проверяются `ValidateRuntimeConfig` (`foundation`) ДО открытия сокета; эта фича
ДОБАВЛЯЕТ проверку ФОРМАТА к уже обязательной переменной, не вводит новых.

| Переменная | `api` | `recognizer` | `web` | Поведение при отсутствии/непригодности |
|---|---|---|---|---|
| `TELEGRAM_BOT_TOKEN` | да (уже обязательна в compose `${VAR:?…}`, `foundation`) | нет | нет | отказ старта `api` ДО открытия сокета, если значение не соответствует формату `<цифры>:<35 символов A-Za-z0-9_->` (FR-consent-and-telegram-auth-4); отсутствие/пустота ловится РАНЬШЕ — на уровне `docker compose up` |

**`N4_TELEGRAM_LOGIN=on|off` НЕ вводится** (см. `01_specification.md`, «Открытый вопрос»). Вход
через Telegram — не опциональная возможность продукта, а обязательное требование канона
(FR-AUTH-002); добавление переключателя создало бы недокументированное нигде состояние «продукт без
входа» и потребовало бы решения владельца/координатора, которое не запрашивалось этой фичей.

## Data Architecture — дополнение к `foundation`

Ни одной новой ТАБЛИЦЫ. Используются уже существующие (`foundation`
`packages/db/migrations/001_init.sql`): `account.status`, `account.consent_version`,
`account.consent_text_hash`, `account.consent_at`, `account.deletion_requested_at`,
`share_card.revoked_at`, `device_session.account_id`. `RunErasureJob` (02_pseudocode.md) читает
`recognition.status` и `recognition.account_id` — обе колонки уже существуют.

Решением координатора DEC-A-016 (2026-09-12) добавлены ДВЕ колонки к КАЖДОЙ из двух существующих
таблиц (расширение, не новая сущность): `account.last_telegram_auth_hash text?`,
`account.last_telegram_auth_at timestamptz?`, `device_session.last_telegram_auth_hash text?`,
`device_session.last_telegram_auth_at timestamptz?` — защита от повтора `initData`
(FR-consent-and-telegram-auth-3). `withdraw_consent` обнуляет `account.consent_at` (тот же
существующий столбец, второй флаг «отозвано» не заводится).

Два индекса, которых `foundation` не создавала явно, но которые эта фича ТРЕБУЕТ:
1. `CREATE INDEX ON account (deletion_requested_at) WHERE status = 'erasing'` — для `RunErasureJob`
   шага 1 (`SELECT … WHERE status = 'erasing'`, малое ожидаемое число строк, но без индекса
   некорректно с ростом базы).
2. `CREATE UNIQUE INDEX ON account (telegram_user_id) WHERE status != 'erased'` — предикат
   `TelegramLogin` шага 2/3 (`SELECT … FOR UPDATE`) обязан находить строку атомарно под конкуренцией;
   частичная уникальность (не по всем строкам — `erased` строки НЕ участвуют, иначе второй вход того
   же `telegram_user_id` после удаления не смог бы вставить новую строку) — то же решение, что и
   `TelegramLogin` шаг 3 «удалённый аккаунт не переиспользуется».

Миграция — `packages/db/migrations/002_consent_and_telegram_auth.sql` (первая миграция ПОСЛЕ
`foundation`; порядковый номер подтверждается при реализации сверкой с фактическим состоянием
каталога `migrations/`, а не предполагается заранее).

## Security Architecture — дополнение

- **Проверка `initData` реализуется здесь, а не переизобретается.** `Architecture.md` (строки
  199-206) уже фиксирует порядок как часть системной защиты; эта фича — единственное МЕСТО КОДА, где
  он реализован (`apps/api/src/auth/verify-init-data.ts`), и другие маршруты его не дублируют.
- **`timingSafeEqual` требует буферов равной длины.** Node.js бросает исключение при разной длине
  входов, а не возвращает `false` молча — реализация обязана привести оба буфера к одинаковой длине
  (например, дополнением до длины SHA-256 = 32 байта) ПЕРЕД вызовом, иначе сравнение упадёт
  исключением вместо константного `false`, и это исключение обязано попадать в ту же единственную
  ветку `401` (`NFR-consent-and-telegram-auth-1`), а не превращаться в `500`.
- **Секрет HMAC не логируется.** `secret_key` (производная от `TELEGRAM_BOT_TOKEN`) и сам токен не
  попадают ни в один объект журнала — редактор запрещённых значений `foundation`
  (`packages/shared/src/log/redact.ts`) расширяется списком имён полей `bot_token`, `secret_key`,
  `init_data` (сырая строка может содержать `user.first_name`/`username` — персональные данные
  Telegram-профиля, не относящиеся к данным о питании, но всё равно не подлежащие журналированию).
- **`erasure-job.ts` не логирует содержимое удаляемых данных.** Аудит эразуры (`02_pseudocode.md`
  шаг 4) несёт только числа и идентификаторы, не текст записей дневника.
- **Границы фичи `foundation` не меняются:** `web` по-прежнему не хранит секретов и не ходит в базу
  напрямую; `recognizer` по-прежнему без HTTP извне; хранилища без публикации портов.

## Границы, которые фича обязана сохранить

- `EnforceConsentBeforeDiaryWrite` — единственная граница, через которую ЛЮБОЙ код обязан пройти
  перед записью `diary_entry`; `scan-pipeline` импортирует эту функцию и не реализует свою проверку
  согласия — иначе два места проверки одного факта разойдутся молча (`deployment-seams.md`).
  Модуль лежит в `apps/api/src/consent/`, поскольку и `POST /api/v1/scans/{id}/correct`, и
  `PATCH /api/v1/diary/{entry_id}` (маршруты `scan-pipeline`) уже работают внутри `apps/api`.
- Канон закрыт на 14 маршрутах плюс `/health` — эта фича не добавляет 15-й маршрут опроса статуса
  удаления; наблюдаемость эразуры — только через аудит (служебная страница расхода `foundation`
  NFR-OPS-001 её не покрывает: это разные наблюдаемости, добавление в неё не входит в объём фичи).
- `attribution` и `growth_event` не трогаются `RunErasureJob` — граница явно проведена в
  `02_pseudocode.md`, потому что смешение «данные о питании» и «данные атрибуции» стёрло бы разницу,
  ради которой NFR-SEC-002 вообще существует.
