# Фича `consent-and-telegram-auth` — спецификация

Имена, статусы, маршруты и числа — из [`docs/canon.md`](../../canon.md) (заморожен 2026-09-12);
здесь они не переизобретаются. Наблюдаемое поведение продукта — из
[`docs/Specification.md`](../../Specification.md) (FR-AUTH-002, FR-AUTH-003, FR-GROWTH-006,
NFR-SEC-002); причины решений — из [`docs/ADR.md`](../../ADR.md) (ADR-002, ADR-009, ADR-010).

## Цель

Дать пользователю дверь из анонимной сессии в постоянный аккаунт через Telegram (не терять дневник
при смене устройства) и дверь наружу из продукта (управлять согласием на обработку данных о питании
как специальной категории персональных данных и удалить свои данные). До этой фичи FR-AUTH-002 и
FR-AUTH-003 были не исполнены по построению: маршруты `POST /api/v1/auth/telegram`,
`POST /api/v1/consent`, `DELETE /api/v1/account` объявлены каноном (§5, DEC-A-012), но не
реализованы.

## Объём

Три серверных маршрута (`POST /auth/telegram`, `POST /consent`, `DELETE /account` — маршруты 9, 12,
13 канона), два экрана PWA/TMA (кнопка «Войти через Telegram» — в TMA автоматически по `initData` при
открытии; экран согласия перед первой записью дневника) и один экран настроек («удалить мои данные»).
Фича реализует алгоритмы `docs/Pseudocode.md` → `TelegramLogin` и `ConsentAndErasure` целиком, включая
фоновую задачу удаления с дедлайном 72 ч.

**Вне фичи:** сам дневник (`scan-pipeline`), карточка как объект (`scan-pipeline`), кабинет партнёра,
оплата (в неделю не входит нигде, PD-PRICE-001). Ревокация карточек (`share_card.revoked_at`) —
операция ЭТОЙ фичи (`ConsentAndErasure` шаг 3-4), но сама сущность `share_card` и её создание —
`scan-pipeline`.

## Зависимости

`foundation` (`device_session`, `account` — физическая схема и роли БД, `ValidateRuntimeConfig`,
`packages/shared` конверт ответа). Перенос анонимного дневника (`TelegramLogin` шаг 7) читается
сквозным сценарием ВМЕСТЕ со `scan-pipeline`, потому что до неё `diary_entry` не создаётся ничем —
это названная зависимость ПРОВЕРКИ (роадмап `consent-and-telegram-auth.description`), а не
реализации: код переноса пишется здесь и работает на пустом множестве строк, пока `scan-pipeline` не
поставляет записи.

## Решения координатора DEC-A-016 (2026-09-12)

**1. Защита от повтора `initData` — РЕАЛИЗУЕТСЯ, без новой сущности.** Канон расширяется ДВУМЯ
логическими полями на КАЖДОЙ из двух уже существующих сущностей (не 15-я сущность, а изменение
`account` и `device_session` — решение координатора, зафиксированное здесь и в
`02_pseudocode.md` Data Structures): `last_telegram_auth_hash: string?` (SHA-256 от присланного
поля `hash` строки `initData`) и `last_telegram_auth_at: Timestamp?`. Повтор ТОЙ ЖЕ строки в течение
24 часов отклоняется `401 initdata_replayed`. Для первого входа (аккаунта ещё нет) сверка идёт по
полям `device_session`; после того как аккаунт найден или создан — по полям `account`. См.
FR-consent-and-telegram-auth-3 и AC-consent-and-telegram-auth-5 ниже.

**2. `N4_TELEGRAM_LOGIN=on|off` не вводится.** Бриф предполагал переключатель, делающий
`TELEGRAM_BOT_TOKEN` обязательным только при включённом входе. Фактическое состояние на момент
написания (`docs/features/foundation/03_architecture.md`, раздел «Переменные окружения»):
`TELEGRAM_BOT_TOKEN` уже объявлена в compose как `${TELEGRAM_BOT_TOKEN:?…}` — форма с двоеточием
валит `docker compose up` при отсутствующем ИЛИ пустом значении БЕЗУСЛОВНО, вход через Telegram в
неделе не является опциональной возможностью (FR-AUTH-002 — обязательное требование канона), и
переключатель добавил бы состояние «продукт работает без входа», которого нет ни в одном документе
проекта. Ниже (FR-consent-and-telegram-auth-4) — только дополнительная проверка формата токена в
коде `api`, не новая конфигурационная семантика.

**3. Отзыв согласия (`withdraw_consent`) БЛОКИРУЕТ последующие записи дневника и создание карточек.**
Решение снимает двойственность буквального чтения канона (`04_refinement.md`, было «Нерешённое»):
`withdraw_consent` теперь, помимо немедленного закрытия карточек, обнуляет `account.consent_at`
(поле уже существует в каноне — второго поля не заводится). Дальнейшая попытка создать
`diary_entry` ИЛИ `share_card` для этого владельца получает `403 consent_required` — тот же код,
что проектный `Pseudocode.md` уже резервирует для маршрута 5 (`POST /api/v1/share-cards`: «`403`
`consent_required` — это НЕ чужой ресурс, а собственный при недостающем согласии»). Уже существующие
записи дневника и до-отзыва созданные карточки (кроме самой публикации, уже закрытой) НЕ удаляются
— это по-прежнему отдельное действие, `DELETE /account { scope: 'erase_all' }`. Экран отзыва
дополнительно и явно предлагает удаление данных (FR-consent-and-telegram-auth-13).

## Функциональные требования

### FR-consent-and-telegram-auth-1
`POST /api/v1/auth/telegram` (маршрут 9 канона) принимает `{ init_data }` — сырую строку, НЕ
разобранный объект. Порядок проверки фиксирован и не может быть переставлен: (1) подпись
HMAC-SHA-256 по сырым байтам строки проверки, секрет — `HMAC-SHA256("WebAppData", bot_token)`; (2)
сравнение результата постоянным временем; (3) только после успеха (1)-(2) — проверка `auth_date` не
старше 24 часов. Любой провал любого из трёх шагов даёт РОВНО ОДИН ответ `401`: аккаунт не создаётся,
сессия не выдаётся, ничего не записывается в базу. Реализует FR-AUTH-002, `Pseudocode.md` →
`TelegramLogin` шаги 1-5, SC-US-013-2.

### FR-consent-and-telegram-auth-2
Успешная проверка находит или создаёт `account` по `telegram_user_id` и связывает
`device_session.account_id` (сессия НЕ заменяется, а связывается — `TelegramLogin` шаг 6). Анонимный
дневник переносится ЦЕЛИКОМ в ОДНОЙ транзакции: все `diary_entry` с `owner_key` этой сессии получают
`owner_key` аккаунта. Частичный перенос запрещён: сбой посередине обязан откатить ВСЕ строки, а не
оставить дневник разделённым между владельцами. Ответ `{ account_id, migrated_entries }` плюс
установка cookie. Реализует FR-AUTH-002, `TelegramLogin` шаг 7, SC-US-013-1.

### FR-consent-and-telegram-auth-3 — защита от повтора initData (DEC-A-016)
Повторное использование ОДНОЙ И ТОЙ ЖЕ строки `initData` (валидной и свежей) более одного раза в
течение 24 часов ОТКЛОНЯЕТСЯ `401 initdata_replayed`. Сервер хранит SHA-256 от присланного поля
`hash` и время последнего успешного использования: на `account.last_telegram_auth_hash` /
`last_telegram_auth_at`, если аккаунт уже найден или создаётся этим же запросом, и на
`device_session.last_telegram_auth_hash` / `last_telegram_auth_at` — для сверки ДО того, как
аккаунт существует. Проверка выполняется ПОСЛЕ подписи и свежести (шаги 1-5 `TelegramLogin`) и ДО
поиска/создания аккаунта — третий, а не первый или второй фильтр. Легитимный повторный вход
(новая строка `initData` с новым `hash`/`auth_date`) не блокируется: сверяется точное совпадение
хэша, а не сам факт повторного входа.

### FR-consent-and-telegram-auth-4
Бэкенд `api` при старте, ДО первого вызова `TelegramLogin`, проверяет, что `TELEGRAM_BOT_TOKEN`
имеет форму `<цифры>:<35 символов A-Za-z0-9_-->` (формат токена Bot API); значение, не проходящее
формат, валит старт с названной переменной и причиной «токен бота имеет неверный формат», а не
падает необработанным исключением при первом вычислении HMAC-секрета. Это ДОПОЛНИТЕЛЬНАЯ проверка
поверх безусловного `${TELEGRAM_BOT_TOKEN:?…}` compose (`foundation`): compose ловит отсутствие и
пустоту, эта проверка — синтаксически невалидное значение.

### FR-consent-and-telegram-auth-5
`POST /api/v1/consent` (маршрут 12 канона) принимает `{ decision: 'grant' | 'decline',
consent_version, consent_text_hash }` от ЛЮБОЙ сессии — анонимной или связанной с аккаунтом
(DEC-A-019, маршрут не требует входа). `grant` сохраняет `consent_version`, `consent_text_hash`,
`consent_at` на `account`, если сессия связана, ИНАЧЕ на саму `device_session` — при последующем
входе через Telegram эти поля переносятся на аккаунт (`TelegramLogin`, `02_pseudocode.md`).
Согласие спрашивается ДО ПЕРВОЙ записи в дневник, а не при установке и не перед первым сканом
(ADR-009): камера и результат первого распознавания доступны без согласия. `consent_version`, не
входящая в код-владеемый список известных версий текста, даёт `422` — согласие на неизвестный текст
не является согласием. Реализует FR-AUTH-003, NFR-SEC-002,
`ConsentAndErasure` шаг 1, SC-US-012-1.

### FR-consent-and-telegram-auth-6
Отказ (`decision: 'decline'`) фиксируется с версией текста и временем. Продукт остаётся
работоспособным: съёмка и результат распознавания доступны, запись дневника не создаётся. Это
объявленная граница, а не деградация (`ConsentAndErasure` шаг 2). Реализует FR-AUTH-003, SC-US-012-1.

### FR-consent-and-telegram-auth-7
По умолчанию всё закрыто (NFR-SEC-002, fail-closed): попытка создать `diary_entry` ИЛИ `share_card`
для владельца без действующего `consent_at` отклоняется `403 consent_required` НА ГРАНИЦЕ, которую
держит эта фича — независимо от того, какой код пытается писать (`scan-pipeline`, консольный
скрипт, будущая фича). **Исключения для анонимного владельца НЕТ (DEC-A-019):** правило применяется
ОДИНАКОВО к `account` (никогда не дававшему согласие, ЛИБО отозвавшему его —
`withdraw_consent` обнуляет `consent_at`, см. FR-consent-and-telegram-auth-8) и к анонимной
`device_session` (согласие ей ещё не задано) — согласие требуется перед ПЕРВОЙ записью дневника для
ЛЮБОЙ сессии, а не только после входа через Telegram; 7-суточный срок анонимного дневника
(`FR-AUTH-001`) — срок хранения уже согласованных данных, не замена согласия. Недоступность
источника истины о согласии (например, отказ чтения `account`/`device_session`) — тоже отказ, а не
пропуск. Реализует NFR-SEC-002, FR-GROWTH-006, ADR-009,
канон маршрут 5 (`POST /api/v1/share-cards`, отказ `consent_required`).

### FR-consent-and-telegram-auth-8
`DELETE /api/v1/account` со `scope: 'withdraw_consent'` (маршрут 13 канона) немедленно проставляет
`revoked_at` ВСЕМ карточкам владельца (`share_card.revoked_at`); адреса `/c/{card_id}` перестают
отдавать содержимое не позже 60 секунд (`Caddyfile` `Cache-Control: no-store`, чтение `revoked_at` на
каждом запросе — уже реализовано `foundation`/`scan-pipeline` дверью, эта фича ставит значение).
Дополнительно (DEC-A-016) обнуляет `account.consent_at`: дальнейшие попытки создать `diary_entry`
или `share_card` для этого владельца отклоняются `403 consent_required` (FR-consent-and-telegram-auth-7)
— второго поля-флага «отозвано» не заводится, обнулённый `consent_at` и есть источник истины. Отзыв
НЕ удаляет уже существующие записи дневника и созданные ранее карточки (их содержимое, не
публикацию) — это отдельное действие (`scope: 'erase_all'`, FR-consent-and-telegram-auth-9).
Реализует FR-GROWTH-006, `ConsentAndErasure` шаг 3.

### FR-consent-and-telegram-auth-9
`DELETE /api/v1/account` со `scope: 'erase_all'` переводит `account.status: active → erasing`,
ставит `deletion_requested_at`, немедленно закрывает карточки (как в
FR-consent-and-telegram-auth-8) и отвечает `200 { accepted: true, cards_revoked_at, erase_deadline }`
— СИНХРОННО, без опроса состояния отдельным маршрутом: канон закрыл список из 14 маршрутов плюс
`/health` (§5), нового маршрута опроса в нём нет, а видимость состояния для владельца не нужна —
после `erase_all` его сессия и аккаунт всё равно перестают существовать. Повторный вызов, пока
`account.status = erasing`, даёт `409`: второе удаление не запускается, `deletion_requested_at` и
`erase_deadline` не сдвигаются. Реализует FR-AUTH-003, `ConsentAndErasure` шаг 4, SC-US-012-2.

### FR-consent-and-telegram-auth-10
Фоновая задача удаления завершает `erase_all` не позже 72 часов от `deletion_requested_at`: удаляет
`account`, `diary_entry`, `recognition`, `share_card` (строки) и объекты фото
(`photo.file_state → purged`, сам объект — из бакета) владельца; переводит
`account.status: erasing → erased`. Задача идемпотентна: повторный запуск на уже удалённом владельце
не делает ничего и не является ошибкой. Задача НЕ удаляет `device_session`, `attribution` и
`growth_event`: они не содержат данных о питании (NFR-SEC-002 говорит именно о них), а
`device_session.account_id` при удалении аккаунта обнуляется (`SET NULL`) — партнёрские счётчики
(FR-PARTNER-002) остаются измеримыми и после удаления аккаунта, потому что они не хранят историю
питания. Реализует FR-AUTH-003, ADR-009 Confirmation, ADR-010, `ConsentAndErasure` шаг 4.

### FR-consent-and-telegram-auth-11
Скан, находящийся в статусе `queued` в момент запроса `erase_all`, ДОВОДИТСЯ ДО КОНЦА: попытка уже
оплачена (счёт по попыткам, `Specification.md` FR-LIMIT-001), и отмена уже списанного вызова не
возвращает деньги. Результат записывается как обычно (в том числе `done`/`failed`/`refused`), и
только затем строка удаляется фоновой задачей удаления в общем цикле. Реализует FR-AUTH-003, канон §7
«счёт по попыткам».

### FR-consent-and-telegram-auth-12
Любая внутренняя попытка передать записи дневника во внешний канал (публикация, экспорт, будущий
дайджест) без действующего согласия владельца получает отказ и запись в аудит с причиной «нет
согласия»; попытка не завершается частично. Реализует FR-GROWTH-006 (сценарий security).

### FR-consent-and-telegram-auth-13
Экран «Войти через Telegram» — в PWA кнопка на экране результата/настроек; в TMA вход выполняется
автоматически при открытии, если сессия ещё анонимна (по `initData`, без действия пользователя).
Экран согласия показывается ПЕРЕД первой попыткой сохранить запись дневника (после подтверждения
результата распознавания), НЕ перед первым сканом — камера остаётся первым экраном продукта
(FR-CAPTURE-001 не переопределяется). Экран «удалить мои данные» в настройках предлагает раздельно
«отозвать согласие» (`withdraw_consent`) и «удалить всё» (`erase_all`), объясняя разницу словами:
первое закрывает карточки немедленно и останавливает дневник; второе запускает удаление в течение
72 часов. Реализует FR-AUTH-002, FR-AUTH-003, ADR-009.

## Нефункциональные требования

### NFR-consent-and-telegram-auth-1
Ответ `401` для «подпись не сошлась» и для «подпись верна, но `auth_date` устарел» формируется ОДНОЙ
веткой кода после ОБЕИХ проверок: реализация не может вернуть `401` из точки, где выполнена только
проверка свежести, если подпись при этом не проверена — тест по исходнику подтверждает единственную
точку возврата `401` для FR-consent-and-telegram-auth-1, а не измерение миллисекунд (тайминг-тесты
на CI флаки). Реализует `Specification.md` §порядок проверки, `.claude/rules/security-operation-order.md`.

### NFR-consent-and-telegram-auth-2
Фоновая задача удаления — долгая работа в терминологии
`.claude/rules/long-running-job.md`: ровно три различимых состояния (`account.status`:
`active` / `erasing` / `erased`), выданный ДО начала работы идентификатор — сама строка `account`
(её `id` уже известен вызывающему из cookie/токена сессии), продолжение по тому же идентификатору
при повторном вызове (FR-consent-and-telegram-auth-9 `409`, не второй запуск). Реализует
FR-AUTH-003, `long-running-job.md`.

## Критерии приёмки

### AC-consent-and-telegram-auth-1 — успешный вход переносит дневник целиком
Given анонимная сессия с 3 записями дневника и валидная строка `initData` от Telegram Mini App с
`auth_date` 5 минут назад
When выполняется `POST /api/v1/auth/telegram`
Then ответ `200 { account_id, migrated_entries: 3 }` с установкой cookie; в `diary_entry` НОЛЬ строк
с прежним `owner_key` (сессии) и ровно 3 строки с `owner_key` аккаунта.

### AC-consent-and-telegram-auth-2 — подделанная подпись отклоняется до разбора
Given `initData` с изменённым одним байтом полезной нагрузки при исходном значении `hash`
When выполняется `POST /api/v1/auth/telegram`
Then ответ `401`; в `account` и `device_session` ноль новых или изменённых строк; поле полезной
нагрузки (например, `user.id`) НЕ появляется ни в одной структуре лога до отказа.

### AC-consent-and-telegram-auth-3 — просроченный auth_date с верной подписью отклоняется
Given подлинная подпись `initData`, `auth_date` — 25 часов назад
When выполняется `POST /api/v1/auth/telegram`
Then ответ `401`; аккаунт не создан, сессия не выдана.

### AC-consent-and-telegram-auth-4 — единственная точка отказа для обеих причин
Given исходный код обработчика `POST /api/v1/auth/telegram`
When статический тест ищет операторы `return 401` (или эквивалент) на пути проверки
Then найдена РОВНО одна точка возврата `401`, достижимая из обеих веток (неверная подпись,
просроченная свежесть); отдельной ранней ветки `if (expired) return 401` до проверки подписи нет.

### AC-consent-and-telegram-auth-5 — повтор initData отклоняется (DEC-A-016)
Given валидная, свежая строка `initData`, уже использованная один раз успешно (её `hash` сохранён в
`account.last_telegram_auth_hash`/`last_telegram_auth_at`)
When ТА ЖЕ строка передаётся `POST /api/v1/auth/telegram` повторно в пределах 24 часов
Then ответ `401 initdata_replayed`; ни аккаунт, ни сессия, ни перенос дневника не меняются вторым
вызовом; НОВАЯ строка `initData` (другой `hash`/`auth_date`) от того же `telegram_user_id`
по-прежнему обрабатывается как обычный вход.

### AC-consent-and-telegram-auth-6 — вход с другого устройства не теряет и не дублирует дневник
Given аккаунт уже связан с сессией A (дневник A перенесён ранее), у сессии B (тот же Telegram-аккаунт,
другое устройство) — 2 собственные записи дневника
When сессия B выполняет `POST /api/v1/auth/telegram` с валидной подписью того же `telegram_user_id`
Then сессия B связывается с ТЕМ ЖЕ `account`; 2 записи дневника сессии B получают `owner_key`
аккаунта ДОБАВЛЕНИЕМ к уже перенесённым; итоговое число записей дневника аккаунта — сумма, ни одна
запись не потеряна и не задвоена.

### AC-consent-and-telegram-auth-7 — пустой init_data отклоняется как ошибка ввода, не как 401
Given тело запроса `{ init_data: '' }` или без поля `init_data`
When выполняется `POST /api/v1/auth/telegram`
Then ответ `422` с названной причиной «init_data отсутствует»; `401` не возвращается — различие между
«нечего проверять» и «проверка не прошла» видно в коде ответа.

### AC-consent-and-telegram-auth-8 — согласие даётся до первой записи дневника (в том числе анонимно, DEC-A-019)
Given пользователь подтвердил первый результат распознавания, дневник ещё не ведётся; сессия МОЖЕТ
быть как анонимной (нет `account_id`), так и связанной с аккаунтом
When экран согласия показан и пользователь соглашается с известной версией текста
Then `POST /api/v1/consent { decision: 'grant', consent_version, consent_text_hash }` возвращает
`200`; `consent_version`, `consent_text_hash`, `consent_at` заполнены на `account` (если сессия
связана) ИЛИ на `device_session` (если анонимна); последующая попытка записи дневника ЭТОЙ СЕССИЕЙ
проходит. Если сессия анонимна и позже выполняет `POST /api/v1/auth/telegram`, `migrated_entries`
возвращает и перенесённые записи, и связанное согласие переносится на `account` без повторного
запроса (`TelegramLogin` шаг 6).

### AC-consent-and-telegram-auth-9 — отказ от согласия не блокирует съёмку
Given пользователь отказывается на экране согласия
When `POST /api/v1/consent { decision: 'decline', … }` выполнен
Then ответ `200`; отказ зафиксирован с версией текста и временем; повторный вызов результата
распознавания (`GET /api/v1/scans/{id}`) по-прежнему отвечает `200`, а `PATCH /api/v1/diary/{id}`
или создание записи дневника для этого владельца отклоняются.

### AC-consent-and-telegram-auth-10 — неизвестная версия текста согласия отклоняется
Given `consent_version = 'v99-does-not-exist'`, не входящая в код-владеемый список
When выполняется `POST /api/v1/consent`
Then ответ `422`; `account.consent_version` не изменяется.

### AC-consent-and-telegram-auth-11 — запись дневника без согласия невозможна на границе фичи, включая анонимную сессию (DEC-A-019)
Given владелец без `consent_at` (согласие никогда не давалось) и валидный `recognition.status = done`;
прогон повторяется ДВАЖДЫ — один раз с владельцем-аккаунтом, один раз с АНОНИМНОЙ `device_session`
(без `account_id`) — исключения по типу сессии НЕТ
When любой код (в том числе гипотетический прямой вызов репозитория, минуя маршрут) пытается создать
`diary_entry` для этого владельца
Then В ОБОИХ прогонах попытка отклоняется `403 consent_required` на уровне, который держит эта
фича; строка `diary_entry` не создаётся ни для аккаунта, ни для анонимной сессии.

### AC-consent-and-telegram-auth-12 — отзыв согласия закрывает карточки и блокирует новую запись (DEC-A-016)
Given у владельца 3 опубликованные карточки (`share_card.revoked_at IS NULL`) и `consent_at`
заполнен
When выполняется `DELETE /api/v1/account { confirm: true, scope: 'withdraw_consent' }`
Then ответ `200`; в течение 60 секунд ВСЕ 3 адреса `/c/{card_id}` отвечают `404` без содержимого;
`account.consent_at` становится `NULL`; строки `diary_entry`, созданные ДО отзыва, НЕ удалены (это
не `erase_all`); попытка создать новую `diary_entry` или `share_card` ПОСЛЕ отзыва отклоняется
`403 consent_required`.

### AC-consent-and-telegram-auth-13 — erase_all запускает удаление и отвечает синхронно
Given владелец с 5 записями дневника, 2 карточками, `account.status = active`
When выполняется `DELETE /api/v1/account { confirm: true, scope: 'erase_all' }`
Then ответ `200 { accepted: true, cards_revoked_at, erase_deadline }` в пределах текущего запроса
(без второго опроса); `account.status = erasing`; `deletion_requested_at` заполнен;
`erase_deadline` не позже `deletion_requested_at + 72 часа`; обе карточки закрыты немедленно
(`revoked_at` заполнен в момент ответа, не после фоновой задачи).

### AC-consent-and-telegram-auth-14 — повторный erase_all не запускает второе удаление
Given `account.status = erasing` (запрос уже был отправлен)
When `DELETE /api/v1/account { confirm: true, scope: 'erase_all' }` выполняется повторно
Then ответ `409`; `deletion_requested_at` и ранее выданный `erase_deadline` НЕ изменяются.

### AC-consent-and-telegram-auth-15 — фоновая задача завершает удаление в срок и идемпотентна
Given `account.status = erasing`, `deletion_requested_at` установлен
When фоновая задача выполняется (тест — с искусственно сдвинутым временем на 72 часа вперёд)
Then `account.status = erased`; ноль строк `diary_entry`, `recognition`, `share_card` с прежним
`owner_key`/`account_id`; объекты фото переведены в `purged`; повторный запуск задачи на том же
владельце не изменяет ничего и не завершается ошибкой.

### AC-consent-and-telegram-auth-16 — удаление не прерывает уже оплаченный скан
Given `recognition.status = queued` (аренда воркера активна) в момент запроса `erase_all`
When фоновая задача удаления запускается ДО завершения скана
Then задача ожидает терминального статуса скана (`done`/`failed`/`refused`) ПЕРЕД удалением строки
`recognition`; попытка не отменяется и не теряется без записи в потолки.

### AC-consent-and-telegram-auth-17 — без confirm запрос отклоняется
Given тело `{ scope: 'erase_all' }` без поля `confirm`
When выполняется `DELETE /api/v1/account`
Then ответ `422`; `account.status` не меняется.

### AC-consent-and-telegram-auth-18 — передача дневника наружу без согласия отклоняется и аудируется
Given владелец без действующего согласия (`consent_at IS NULL` или отозвано)
When внутренний вызов пытается передать записи его дневника во внешний канал
Then вызов отклоняется; в аудите — запись с причиной «нет согласия»; данные наружу не уходят ни
частично, ни целиком.

### AC-consent-and-telegram-auth-19 — TELEGRAM_BOT_TOKEN неверного формата валит старт с причиной
Given `TELEGRAM_BOT_TOKEN=not-a-real-token` (не соответствует `<цифры>:<35 символов>`)
When процесс `api` запускается
Then он завершается ненулевым кодом до открытия сокета; в `stderr` — имя переменной и причина
«токен бота имеет неверный формат», а не необработанное исключение при первом входе.

### AC-consent-and-telegram-auth-20 — удалённый аккаунт не восстанавливается входом
Given `account.status = erased` (удаление завершено фоновой задачей)
When владелец повторно проходит `POST /api/v1/auth/telegram` с тем же `telegram_user_id`
Then создаётся НОВЫЙ `account` (прежний `id` не переиспользуется, прежние данные не восстанавливаются
— они физически удалены); `migrated_entries` считается от текущей анонимной сессии, а не от истории
удалённого аккаунта.

## Наследуемые сценарии приёмки проекта

| Сценарий проекта | Что закрывает `consent-and-telegram-auth` | Что остаётся другой фиче |
|---|---|---|
| SC-US-012-1 — отказ от согласия оставляет продукт работоспособным | `POST /consent decline`, экран согласия, отсутствие записи дневника | сама форма экрана результата — `scan-pipeline` |
| SC-US-012-2 — удаление данных за 72 ч, карточки — немедленно/60 с | `DELETE /account erase_all`, фоновая задача, ревокация карточек | существование `share_card` как сущности — `scan-pipeline` |
| SC-US-013-1 — вход через Telegram переносит дневник целиком | `TelegramLogin` целиком, атомарный перенос | сами перенесённые `diary_entry` создаёт `scan-pipeline` |
| SC-US-013-2 — подделанная подпись даёт 401 без создания аккаунта | проверка подписи, порядок, отсутствие побочных записей | — |

## Трассировка на документы проекта

| Требование фичи | Источник проекта |
|---|---|
| FR-consent-and-telegram-auth-1 | `Specification.md` FR-AUTH-002; `Pseudocode.md` `TelegramLogin` шаги 1-5; `Architecture.md` Security Architecture; `Architecture.md` External Dependencies (initData, CONFIRMED) |
| FR-consent-and-telegram-auth-2 | `Specification.md` FR-AUTH-002; `Pseudocode.md` `TelegramLogin` шаг 6-7; ADR-002 |
| FR-consent-and-telegram-auth-3 | «Открытый вопрос» этого документа; не привязано к канону — сознательный пробел |
| FR-consent-and-telegram-auth-4 | `foundation` 03_architecture.md переменные окружения (`TELEGRAM_BOT_TOKEN`); `.claude/rules/fail-closed-defaults.md` |
| FR-consent-and-telegram-auth-5 | `Specification.md` FR-AUTH-003, NFR-SEC-002; `Pseudocode.md` `ConsentAndErasure` шаг 1; канон маршрут 12 |
| FR-consent-and-telegram-auth-6 | `Specification.md` FR-AUTH-003; ADR-009; `Pseudocode.md` `ConsentAndErasure` шаг 2 |
| FR-consent-and-telegram-auth-7 | `Specification.md` NFR-SEC-002; `.claude/rules/fail-closed-defaults.md`; `.claude/rules/honest-configuration.md` CFG-I6 |
| FR-consent-and-telegram-auth-8 | `Specification.md` FR-GROWTH-006; `Pseudocode.md` `ConsentAndErasure` шаг 3; `Architecture.md` «Публичная карточка не кэшируется» |
| FR-consent-and-telegram-auth-9 | `Specification.md` FR-AUTH-003; `Pseudocode.md` `ConsentAndErasure` шаг 4, маршрут 13, State Transitions `account.status`; `.claude/rules/long-running-job.md` |
| FR-consent-and-telegram-auth-10 | ADR-009 Confirmation; ADR-010; `Pseudocode.md` `ConsentAndErasure` шаг 4 |
| FR-consent-and-telegram-auth-11 | `Specification.md` FR-LIMIT-001 «счёт по попыткам»; `.claude/rules/shared-resource-verification.md` |
| FR-consent-and-telegram-auth-12 | `Specification.md` FR-GROWTH-006 (security scenario); `Pseudocode.md` `ConsentAndErasure` шаг 5 |
| FR-consent-and-telegram-auth-13 | `Specification.md` FR-AUTH-002/003, FR-CAPTURE-001; ADR-002, ADR-009 |
| NFR-consent-and-telegram-auth-1 | `Pseudocode.md` `TelegramLogin` шаги 3-4; `.claude/rules/security-operation-order.md` |
| NFR-consent-and-telegram-auth-2 | `.claude/rules/long-running-job.md`; `Pseudocode.md` `ConsentAndErasure` шаг 4 |
