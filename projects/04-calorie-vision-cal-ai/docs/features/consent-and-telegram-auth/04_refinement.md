# Фича `consent-and-telegram-auth` — уточнение: краевые случаи, проверки, ужесточение

Слой каждой проверки выбран по природе признака, а не по удобству
([`cost-of-detection-ladder`](../../../../.claude/rules/cost-of-detection-ladder.md)). Порядок
операций — это и есть защита
([`security-operation-order`](../../../../.claude/rules/security-operation-order.md)): подпись
проверяется до разбора, свежесть — после подписи, согласие — до записи, эразура — только после
подтверждённого `confirm`.

## Edge Cases Matrix

| Случай | Вход | Ожидаемое | Как обеспечивается |
|---|---|---|---|
| подделанный `hash` | один байт полезной нагрузки изменён, `hash` — от исходной строки | `401`, ничего не создано | `HMAC` по сырым байтам, не по разобранному объекту (AC-consent-and-telegram-auth-2) |
| просроченный `auth_date` | подпись верна, `age > 24 ч` | `401`, та же ветка ответа | свежесть проверяется ПОСЛЕ подписи, обе причины сходятся в одну точку возврата (NFR-consent-and-telegram-auth-1) |
| и подпись неверна, и `auth_date` просрочен одновременно | оба условия ложны | один и тот же `401` | тест единственной точки возврата (AC-consent-and-telegram-auth-4), а не измерение миллисекунд — тайминг-тест на CI флаки, структурный тест — нет |
| пустой `init_data` | поле отсутствует или `''` | `422`, HMAC не вычисляется | различие «нечего проверять» / «проверка не прошла» видно в коде ответа (AC-consent-and-telegram-auth-7) |
| повтор ОДНОЙ И ТОЙ ЖЕ валидной `initData` в пределах 24 ч | перехваченная или продублированная строка | `401 initdata_replayed`, ничего не изменено (DEC-A-016) | сверка `hash` с `last_telegram_auth_hash`/`_at` на `account` (если уже есть) или на `device_session` (первый вход) — `TelegramLogin` шаг 2 |
| легитимный повторный вход с НОВОЙ `initData` того же `telegram_user_id` | другой `hash`, другой `auth_date` | обрабатывается как обычный вход, НЕ блокируется | сверяется точное совпадение `hash`, а не факт повторного входа |
| вход с другого устройства, аккаунт уже существует | сессия B, тот же `telegram_user_id`, что и уже связанная сессия A | сессия B связывается с ТЕМ ЖЕ аккаунтом, её дневник ДОБАВЛЯЕТСЯ к уже перенесённому | `UPDATE diary_entry SET owner_key = :account WHERE owner_key = :session_id` — предикат по сессии B, записи A не трогает и не задваивает (AC-consent-and-telegram-auth-6) |
| повторный вход ТОЙ ЖЕ сессии, уже связанной | `device_session.account_id` уже заполнен тем же `account_id` | `migrated_entries = 0`, без ошибки | предикат `owner_key = :session_id` не находит строк — они уже перенесены в предыдущий раз |
| вход после удаления (`account.status = 'erased'`) | тот же `telegram_user_id`, аккаунт физически удалён | создаётся НОВЫЙ `account` с новым `id` | `TelegramLogin` шаг 2: `status != 'erased'` — обязательное условие переиспользования найденной строки (AC-consent-and-telegram-auth-20) |
| неизвестная версия текста согласия | `consent_version = 'v99'` | `422 unknown_consent_version` | код-владеемый закрытый список (`honest-configuration` CFG-I8), не окружение |
| присланный хэш не совпадает с версией | верная версия, чужой `consent_text_hash` | `422`, ТОТ ЖЕ код, что неизвестная версия | сервер вычисляет `sha256` сам, не доверяет присланному значению как факту |
| запись дневника без согласия, включая обход маршрута | прямой вызов репозитория дневника, `consent_at IS NULL` | отказ на границе `EnforceConsentBeforeDiaryWrite`, а не на уровне HTTP-маршрута | единственная функция, которую обязан вызвать любой писатель `diary_entry` (`03_architecture.md`, «Границы») |
| анонимная сессия пишет дневник БЕЗ согласия (DEC-A-019, нет исключения) | `device_session.consent_at IS NULL`, `account_id IS NULL` | `403 consent_required` — ТАК ЖЕ, как для аккаунта | `EnforceConsentBeforeDiaryWrite` шаг 1 разрешает владельца в `account` ИЛИ `device_session` и не делает исключения по типу |
| анонимная сессия даёт согласие, потом входит через Telegram | `device_session.consent_at` заполнен, `account.consent_at IS NULL` | согласие ПЕРЕНОСИТСЯ на аккаунт, повторно не запрашивается | `TelegramLogin` шаг 6 — копирует `consent_version`/`consent_text_hash`/`consent_at`, если у аккаунта своего согласия ещё нет |
| вход через Telegram, у аккаунта УЖЕ есть своё согласие (другое устройство) | `account.consent_at` заполнен, текущая анонимная сессия тоже согласилась | согласие аккаунта СОХРАНЯЕТСЯ, сессионное не перезаписывает его | `TelegramLogin` шаг 6, ветка «ELSE оставить без изменений» |
| два параллельных первых входа одним `telegram_user_id` (VC-03) | конкурентный `POST /auth/telegram` дважды с валидными, РАЗНЫМИ `initData` того же пользователя | ровно ОДНА строка `account`, оба запроса успешны и указывают на неё | частичный уникальный индекс `(telegram_user_id) WHERE status != 'erased'` + `ON CONFLICT … DO NOTHING` + повторный `SELECT` на конфликте (`TelegramLogin` шаг 3) |
| 20 параллельных повторов ОДНОЙ И ТОЙ ЖЕ `initData` (VC-03) | одна валидная строка, 20 одновременных запросов | РОВНО 1 успех (`200`), 19 × `401 initdata_replayed` | блокировка строки (`FOR UPDATE`) на сверке `last_telegram_auth_hash` сериализует конкурентов; только первый, зафиксировавший транзакцию, проходит |
| отзыв согласия (`withdraw_consent`) при существующем дневнике | 5 записей дневника, 3 карточки | карточки закрыты немедленно; ДНЕВНИК НЕ УДАЛЯЕТСЯ | `withdraw_consent` — не `erase_all`; канон разводит их явно (`Pseudocode.md` `ConsentAndErasure` шаги 3 и 4 — разные глаголы) |
| `withdraw_consent` и новая запись дневника/карточки | withdraw обнуляет `account.consent_at` (DEC-A-016) | `403 consent_required` на новую `diary_entry`/`share_card`; уже существующие записи и закрытые карточки НЕ удаляются | `consent_at` — единственный источник истины; отдельного поля «отозвано» нет, см. `EnforceConsentBeforeDiaryWrite` шаг 3 |
| повторный `erase_all` во время `erasing` | второй запрос до завершения фоновой задачи | `409`, `deletion_requested_at`/`erase_deadline` не сдвигаются | `SELECT … FOR UPDATE` на `account.status` внутри той же транзакции, что и переход (AC-consent-and-telegram-auth-14) |
| `erase_all` без `confirm` | `{ scope: 'erase_all' }` | `422`, состояние не меняется | проверка `confirm === true` — первый шаг алгоритма, до любой мутации (AC-consent-and-telegram-auth-17) |
| активный скан на момент запроса эразуры | `recognition.status = 'queued'` для аккаунта | аккаунт ПРОПУСКАЕТСЯ в текущем часовом прогоне, не теряется | попытка уже оплачена (счёт по попыткам); удаление откладывается, не отменяет вызов модели (AC-consent-and-telegram-auth-16) |
| два конкурентных `erase_all` от разных вкладок | гонка на `SELECT … FOR UPDATE` | ровно один переход `active → erasing`, второй получает `409` | блокировка строки транзакцией — конкурентный прогон обязателен, последовательный тест не различает реализации |
| `RunErasureJob` падает посередине батча на одном аккаунте | ошибка при удалении объекта фото одного владельца | ОСТАЛЬНЫЕ аккаунты батча обрабатываются; сбойный остаётся `erasing` до следующего прогона | обработка каждого аккаунта — своя транзакция, не общая на батч |
| объект фото уже отсутствует в бакете при эразуре | ключ не найден | шаг считается успешным | как в `PurgeExpiredPhotos`: цель — отсутствие файла, а не факт удаления |
| повторный прогон `RunErasureJob` на уже `erased` аккаунте | `status = 'erased'` | ничего не меняется, не ошибка | предикат `WHERE status = 'erasing'` не находит строку — идемпотентность по построению, не по проверке постфактум |
| передача дневника наружу без согласия | внутренний вызов экспорта/дайджеста | отказ + запись аудита «нет согласия» | `EnforceConsentBeforeDiaryWrite`-аналог на пути ЧТЕНИЯ для передачи наружу — та же граница, другое направление (FR-consent-and-telegram-auth-12) |
| `TELEGRAM_BOT_TOKEN` неверного формата | `not-a-real-token` | отказ старта `api`, названа причина | `token-format.ts`, вызывается из `bootstrap.ts` ДО открытия сокета (AC-consent-and-telegram-auth-19) |
| `TELEGRAM_BOT_TOKEN` пуст или отсутствует | не задан в `.env` | `docker compose up` отказывает РАНЬШЕ, чем стартует процесс | `${TELEGRAM_BOT_TOKEN:?…}` в compose (`foundation`, уже реализовано) |
| секрет попал в поле журнала при ошибке HMAC | исключение внутри `verify-init-data.ts` несёт токен в стеке | `[redacted]` | редактор запрещённых значений расширен именами `bot_token`, `secret_key`, `init_data` |

## Решено (DEC-A-016): withdraw и будущие записи дневника

Канон (`Pseudocode.md` `ConsentAndErasure`) описывает `withdraw` явно ТОЛЬКО как закрытие карточек;
буквальное чтение оставляло открытым, блокирует ли он новую запись. Координатор решил: `withdraw`
ДОПОЛНИТЕЛЬНО обнуляет `account.consent_at` (тот же существующий столбец — второе поле
`consent_revoked_at` не заводится); `EnforceConsentBeforeDiaryWrite` не различает «согласия никогда
не было» и «согласие отозвано» — оба состояния читаются как `consent_at IS NULL` и дают
`403 consent_required` на новую `diary_entry` ИЛИ `share_card`. Уже существующие записи и ранее
созданные (хоть и закрытые) карточки НЕ удаляются этим действием — удаление данных остаётся
отдельным `scope: 'erase_all'`. Реализовано в `Algorithm: RevokeConsentOrErase` шаг 3 и
`Algorithm: EnforceConsentBeforeDiaryWrite` шаг 3 (`02_pseudocode.md`).

## Testing Strategy

Раннер — `vitest` 3, как в `foundation`. Unit-тесты `verify-init-data.ts` используют ВЕКТОР ИЗ
ОФИЦИАЛЬНОЙ СПЕЦИФИКАЦИИ Telegram (пример `data-check-string` и ожидаемого `hash` из
`core.telegram.org/bots/webapps`) — тест на самодельном фейковом токене доказывает только
внутреннюю согласованность реализации, а не совместимость с реальным Telegram; вектор из
официальной документации нужен как эталон формата (сортировка ключей, разделитель `\n`, порядок
HMAC). Интеграционные тесты — на настоящем PostgreSQL профиля `test` (перенос дневника,
идемпотентность повторного входа). Конкурентные тесты — ОБЯЗАТЕЛЬНЫ для `erase_all` (гонка двух
запросов) и для `RunErasureJob` (активный скан не блокирует батч других аккаунтов) — разделяемый
ресурс закрывается ТОЛЬКО конкурентным прогоном
([`shared-resource-verification`](../../../../.claude/rules/shared-resource-verification.md)):
последовательный тест на «второй `erase_all` получает `409`» зеленеет и при неправильной реализации
без блокировки строки, если гонка не создана намеренно.

### Тесты, которые Phase 3 обязан создать

| Тест | Слой | Что доказывает |
|---|---|---|
| `verify-init-data.test.ts` — эталонный вектор Telegram | unit | HMAC и сортировка ключей совпадают с официальным примером |
| `verify-init-data.test.ts` — подделанный байт полезной нагрузки | unit | AC-consent-and-telegram-auth-2 |
| `verify-init-data.test.ts` — `auth_date` 25 часов назад, подпись верна | unit | AC-consent-and-telegram-auth-3 |
| `verify-init-data.test.ts` — единственная точка возврата `401` (grep по исходнику) | unit / static | AC-consent-and-telegram-auth-4, NFR-consent-and-telegram-auth-1 |
| `verify-init-data.test.ts` — пустой `init_data` | unit | AC-consent-and-telegram-auth-7 |
| `auth-telegram.test.ts` — перенос 3 записей дневника | integration | AC-consent-and-telegram-auth-1 |
| `auth-telegram.test.ts` — вход с другого устройства, тот же аккаунт | integration | AC-consent-and-telegram-auth-6 |
| `auth-telegram.test.ts` — повторный вход после `erased` создаёт новый аккаунт | integration | AC-consent-and-telegram-auth-20 |
| `consent.test.ts` — grant с известной версией (аккаунт И анонимная сессия — два прогона) | integration | AC-consent-and-telegram-auth-8 |
| `consent.test.ts` — decline не блокирует съёмку | integration | AC-consent-and-telegram-auth-9 |
| `consent.test.ts` — неизвестная версия и несовпавший хэш | unit | AC-consent-and-telegram-auth-10 |
| `auth-telegram.test.ts` — согласие анонимной сессии переносится на аккаунт при входе | integration | AC-consent-and-telegram-auth-8, DEC-A-019 |
| `enforce-before-diary-write.test.ts` — запись без согласия отклонена (аккаунт И анонимная сессия — два прогона, DEC-A-019) | unit | AC-consent-and-telegram-auth-11 |
| `concurrency/auth-telegram-parallel.test.ts` — 20 одновременных `POST /auth/telegram` с ОДНОЙ `initData` → 1×`200`, 19×`401 initdata_replayed` (VC-03) | concurrency | AC-consent-and-telegram-auth-5 |
| `concurrency/auth-telegram-parallel.test.ts` — два параллельных ПЕРВЫХ входа одним `telegram_user_id`, РАЗНОЙ `initData` → ровно одна строка `account` (VC-03) | concurrency | AC-consent-and-telegram-auth-1, FR-consent-and-telegram-auth-2 |
| `account-delete.test.ts` — `withdraw_consent` закрывает карточки, не трогает дневник | integration | AC-consent-and-telegram-auth-12 |
| `account-delete.test.ts` — `erase_all` синхронный ответ и переход в `erasing` | integration | AC-consent-and-telegram-auth-13 |
| `account-delete.test.ts` — повторный `erase_all` во время `erasing` | integration | AC-consent-and-telegram-auth-14, конкурентная версия — `concurrency/account-delete-race.test.ts` |
| `account-delete.test.ts` — без `confirm` | unit | AC-consent-and-telegram-auth-17 |
| `erasure-job.test.ts` — завершение с искусственно сдвинутым временем, идемпотентность | integration | AC-consent-and-telegram-auth-15 |
| `erasure-job.test.ts` — активный скан откладывает удаление аккаунта, не блокирует батч | concurrency | AC-consent-and-telegram-auth-16 |
| `consent-denied-audit.test.ts` — попытка передачи наружу без согласия | unit | AC-consent-and-telegram-auth-18 |
| `token-format.test.ts` — три недопустимых формата токена | unit | AC-consent-and-telegram-auth-19 |
| `initdata-replay.test.ts` — повтор той же `initData` в пределах 24 ч отклоняется `401 initdata_replayed`; новая `initData` того же пользователя проходит | integration | AC-consent-and-telegram-auth-5 |

## Испытание стражей на внедрённом дефекте

Единственная точка возврата `401` (NFR-consent-and-telegram-auth-1) — страж, который ОБЯЗАН уметь
падать
([`guard-must-be-able-to-fail`](../../../../.claude/rules/guard-must-be-able-to-fail.md)): Phase 3
обязана временно вернуть `401` из отдельной ранней ветки (`if (stale) return 401` до проверки
подписи), убедиться, что статический тест КРАСНЕЕТ, и только затем восстановить единую точку —
результат («2 failed → N passed после восстановления») входит в квитанцию Phase 3, не в этот
документ.

## Security Hardening

- Сравнение `hash` — ТОЛЬКО `crypto.timingSafeEqual`; `===`/`==` на строках или буферах запрещены
  исходным стражем (грep по `verify-init-data.ts` на прямое сравнение строк — Phase 4 проверяет).
- `TELEGRAM_BOT_TOKEN` не появляется ни в одном сообщении об ошибке, ни в одной строке журнала —
  редактор `foundation` расширяется явным списком имён (см. `03_architecture.md`).
- `erase_all` необратим с момента `confirm: true`; UI обязан подтверждать действие отдельным
  диалогом (это требование к экрану, FR-consent-and-telegram-auth-13, не к API — API не добавляет
  второго подтверждения поверх `confirm`, потому что канон не резервирует под это второе поле).
