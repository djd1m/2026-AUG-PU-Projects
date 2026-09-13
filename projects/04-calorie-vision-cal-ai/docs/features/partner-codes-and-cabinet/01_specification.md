# Фича `partner-codes-and-cabinet` — спецификация

Проект: N4 «Тарелка». Фаза: Phase 1 PLAN (режим скорости, DEC-A-032). Дата: 2026-09-13.
Источники: [`docs/canon.md`](../../canon.md), [`docs/Specification.md`](../../Specification.md)
(FR-PARTNER-001…003, FR-GROWTH-002/004/005/007, US-010…011, SC-US-010-1/2, SC-US-011-1/2),
[`docs/Pseudocode.md`](../../Pseudocode.md) (`ApplyPartnerCode`, `AntiFraudOnCode`,
`PartnerDashboard`), [`docs/ADR.md`](../../ADR.md) (ADR-008), `.claude/rules/security.md`
(порядок операций, anti-fraud, `403` — исключение из правила «чужое = `404`»),
`.claude/rules/shared-resource-verification.md`, `.claude/rules/coding-style.md`.
Формат документа — по образцу `docs/features/foundation/01_specification.md`.

## Цель

Дать блогеру персональный код и кабинет со своими счётчиками, а продукту — честную атрибуцию
установок: явный код всегда сильнее ранее сохранённого cookie, недействительный код никогда не
откатывается к нему, и один код не может быть накручен со стороны одного IP-адреса без ручного
вмешательства оператора.

## Объём

Входит: `POST /api/v1/codes/apply` (маршрут `codes/apply` канона §5) с тремя исходами по полю
`attribution.source`; anti-fraud по IP-префиксу и коду (порог из `FR-PARTNER-003`); ручная
разблокировка кода; переход атрибуции `pending → activated`, включая ПОВТОРНУЮ проверку кода и
самореферала на момент активации (решение ниже); `GET /api/v1/partner/dashboard` (маршрут
`partner/dashboard`) с четырьмя счётчиками по трём окнам.

Не входит: выдача кода партнёру (делает оператор вручную, вне API недели — PD-PRICE-001), деньги
и выплаты (в неделе не существуют), сам вызов распознавания (владеет `source-and-correct` /
`scan-pipeline`), запись `growth_event(install/share_click/card_view)` (владеют `scan-pipeline` и
`share-card-and-growth-events`), связывание сессии с аккаунтом через Telegram (владеет
`consent-and-telegram-auth`) — эта фича лишь ЧИТАЕТ `device_session.account_id`, если он уже
проставлен.

## Решение, введённое этим планом: где реально появляется `attribution.status = rejected`

Корневой `Pseudocode.md` (шаг 4 `ApplyPartnerCode`) прямо говорит: три проверки (заблокирован /
самореферал / anti-fraud) «идут ДО записи» — то есть НИ ОДИН из трёх исходов `rejected(...)` в
момент ПРИМЕНЕНИЯ кода не создаёт и не меняет строку `attribution`. Но канон и `Architecture.md`
физически объявляют у `attribution` статус `rejected` и колонку `reject_reason` с ровно теми же
тремя причинами — а ни один шаг ни одного алгоритма корневых документов их не пишет. Это разрыв
между схемой и алгоритмом, и он не может быть оставлен на усмотрение реализующего агента (два
агента заполнили бы его по-разному — ровно тот класс дефекта, для которого существует канон).

**Решение:** `attribution.status = rejected` пишет ТОЛЬКО `ActivateAttributionOnRecognition` (эта
фича, алгоритм ниже), и делает это, когда между ПРИМЕНЕНИЕМ кода и ПЕРВЫМ успешным распознаванием
изменились факты, которые в момент применения ещё не были известны или ещё не были истинны:

1. Код, на который указывает `pending`-атрибуция, к моменту активации оказался `blocked`
   (заблокирован позже — по чужой накрутке того же кода с других сессий, или оператором вручную).
   `reject_reason = code_blocked`. Различить, каким именно был исходный `blocked_reason` кода
   (`antifraud_ip_burst` или `manual`), для ЭТОЙ конкретной строки задним числом нечестно —
   `antifraud_ip_burst` в `attribution.reject_reason` эта фича не пишет НИКОГДА (см. AC-13,
   follow-up в `05_completion.md`).
2. `device_session.account_id` к моменту активации оказался равен `partner.account_id` владельца
   кода — самореферал, не видимый в момент применения анонимной сессией, стал виден после входа
   через Telegram (фича `consent-and-telegram-auth`, вне зависимости очерёдности эта фича её
   ЧИТАЕТ, а не пишет). `reject_reason = self_referral`.

Исходы `rejected(...)`, возвращаемые САМИМ `ApplyPartnerCode` (маршрут `codes/apply`), остаются
ответами HTTP и строками структурированного журнала — они не трогают таблицу `attribution`, как и
написано в корневом Pseudocode. Оба алгоритма используют один и тот же закрытый список причин, но
пишут в разные места и в разное время. Владелец канона подтверждает или отклоняет это чтение на
чекпойнте Phase 1; отклонение означает, что `attribution.reject_reason` не используется вовсе и
колонка объявлена, но не заполняется — тоже честный, но менее ценный исход.

## Решение: аудит — это строка структурированного журнала, а не 15-я сущность

Канон закрывает список сущностей на 14 (`docs/canon.md` §4). У `ApplyPartnerCode` и
`AntiFraudOnCode` пять аудируемых событий: `replaced_weaker_source`, `self_referral`,
`code_blocked` (заблокированный код предъявлен повторно), `antifraud_ip_burst` (код только что
заблокирован), `manual_unblock`. Ни одно не создаёт строку в БД — это ОДНА строка JSON в
структурированном журнале процесса `api` (тот же механизм, что `stale_lease_result` и
`swept_as_timeout` в `foundation`, NFR-foundation-2). Добавление 15-й таблицы ради журнала было бы
тем же нарушением, что и молчаливое добавление 15-го маршрута.

## Функциональные требования

### FR-partner-codes-and-cabinet-1 — нормализация и форма кода
Вход `POST /api/v1/codes/apply`: `{ code: string, source: 'explicit' }` (значения `deeplink` и
`cookie` — внутренние источники вызова из `scan-pipeline`/веб-клиента, не вводятся пользователем
руками через этот маршрут напрямую, но алгоритм их принимает как внутренний параметр вызова).
Нормализация: обрезать пробелы по краям, привести к верхнему регистру. Форма — РОВНО `^[A-Z0-9]{4,12}$`
(та же проверка, что `CHECK` на `partner_code.code`). Код не найден ИЛИ не проходит форму → `invalid`,
`422`, НИЧЕГО не изменено — ни в `attribution`, ни в журнале. Откат к `cookie` при `invalid`
ЗАПРЕЩЁН (ADR-008).

### FR-partner-codes-and-cabinet-2 — порядок проверок ДО записи
Внутри ОДНОЙ транзакции, в этом порядке: (1) `pg_advisory_xact_lock` по коду — сериализует ВСЕ
одновременные применения ЭТОГО кода, включая с разных сессий и разных IP; (2) ПОСЛЕ захвата лока —
перечитать `partner_code.status`; если `blocked` → `rejected(code_blocked)`, транзакция откатывается
(писать нечего); (3) самореферал — `device_session.account_id` (если проставлен) равен
`partner.account_id` владельца кода → `rejected(self_referral)`, запись в журнал, откат;
(4) `AntiFraudOnCode` (FR-partner-codes-and-cabinet-3) — при блокировке → `rejected(antifraud_ip_burst)`,
откат. Перечитывание статуса ПОСЛЕ лока обязательно: чтение ДО лока сделало бы лок бутафорией —
конкурентный собрат мог заблокировать код в момент между чтением и захватом.

### FR-partner-codes-and-cabinet-3 — anti-fraud без новой таблицы
Счётчик применений одного кода с одного `ip_prefix` за скользящее окно 10 минут вычисляется
запросом `COUNT(*)` по `growth_event` (`type = 'code_applied'`, `partner_code_id = :code_id`,
`created_at > now() - interval '10 minutes'`) с JOIN на `device_session` по `device_session_id`
ради `ip_prefix` — колонки `ip_prefix` на `growth_event` нет, а на `device_session` она уже есть
(`foundation`). Новой таблицы и новой колонки эта фича не вводит. Порог — `> 50` (то есть 51-е
применение блокирует код). При превышении: `UPDATE partner_code SET status = 'blocked',
blocked_reason = 'antifraud_ip_burst', blocked_at = now()` В ТОЙ ЖЕ транзакции, что и отказ этой
попытки; запись в журнал (код, `ip_prefix`, время — БЕЗ полного адреса). Счёт ведётся ТОЛЬКО по
исходу `applied` (событие `code_applied` пишется исключительно при нём, FR-partner-codes-and-cabinet-5) —
отклонённые и конфликтные попытки счётчик не увеличивают, потому что события для них не существует.

### FR-partner-codes-and-cabinet-4 — три исхода по полю `source` (ядро фичи)
Решение принимается по полю `attribution.source` существующей строки, НЕ по факту её существования
(ADR-008). Дословно из корневого `Pseudocode.md`, шаги 6–9:

| Существующая атрибуция | Новый источник | Исход | Что происходит |
|---|---|---|---|
| нет строки | любой | `applied` | создать: `source` = источник вызова, `replaced_source = NULL`, `status = pending` |
| `source ∈ {cookie, deeplink}` | `explicit` | `applied` | ЗАМЕНИТЬ `partner_code_id`, `replaced_source` = прежний `source`, `source = explicit`; журнал `replaced_weaker_source` |
| `source = explicit` | любой (включая тот же код) | `conflict`, `409` | НИЧЕГО не менять |
| `source ∈ {cookie, deeplink}` | `cookie`/`deeplink` | `conflict`, `409` | НИЧЕГО не менять |

`UNIQUE (device_session_id)` даёт единственность строки, но не её неизменность — правило замены
живёт в этом коде, а не в ограничении.

### FR-partner-codes-and-cabinet-5 — событие применения ровно один раз
`growth_event(type = code_applied, device_session_id, partner_code_id)` пишется РОВНО при исходе
`applied` (создание ИЛИ замена), в ТОЙ ЖЕ транзакции, что и запись `attribution`. Исходы `conflict`,
`invalid`, `rejected(*)` события не порождают: событие означает состоявшееся применение, а не
попытку (корневой Pseudocode, шаг 10).

### FR-partner-codes-and-cabinet-6 — конкурентность одной сессии
Перед чтением/изменением строки `attribution` захватывается ВТОРОЙ `pg_advisory_xact_lock`, ключ —
`device_session_id` (независимый от лока по коду из FR-2; порядок захвата ВСЕГДА
код-лок → сессия-лок, что исключает взаимную блокировку между двумя разными кодами одной сессии и
между одним кодом двух разных сессий). Под этим локом одновременные вызовы `ApplyPartnerCode` для
ОДНОЙ сессии выполняются строго по очереди: два одновременных применения РАЗНЫХ кодов при пустой
атрибуции дают ровно один `applied` (тот, что выполнился первым по очереди захвата лока) и один
`conflict` (второй увидит уже explicit-строку от первого).

### FR-partner-codes-and-cabinet-7 — ручная разблокировка, и только она
Оператор переводит `partner_code.status: blocked → active` отдельной операцией (вне продуктового
API недели — административное действие), сбрасывая `blocked_reason`/`blocked_at` в `NULL` и оставляя
журнал `manual_unblock`. Автоматического снятия НЕТ ни в коде, ни в фоновой задаче, ни в TTL: порог
50/10 минут при автоснятии перестаёт быть порогом и становится задержкой
(`.claude/rules/security.md`, anti-fraud). Это проверяется стражем по исходнику
(AC-partner-codes-and-cabinet-11).

### FR-partner-codes-and-cabinet-8 — активация переоценивает факты на момент распознавания
`ActivateAttributionOnRecognition(device_session_id)` вызывается интеграционной точкой первого
успешного распознавания (владеет `source-and-correct`; сигнатура и место вызова — в
`03_architecture.md`). Для `pending`-атрибуции этой сессии, в ОДНОЙ транзакции с записью
`recognition.status = done`:

1. Перечитать `partner_code.status`. Если `blocked` → `attribution.status = rejected`,
   `reject_reason = code_blocked`. `activated_at` НЕ проставляется, `growth_event(activation)` НЕ
   пишется.
2. Иначе перечитать `device_session.account_id`. Если равен `partner.account_id` владельца кода →
   `attribution.status = rejected`, `reject_reason = self_referral`.
3. Иначе → `attribution.status = activated`, `activated_at = now()`,
   `growth_event(type = activation, device_session_id, partner_code_id)`.
4. Идемпотентно: если атрибуция УЖЕ не `pending` (уже `activated` или `rejected` от прошлого
   вызова), повторный вызов — no-op, второе успешное распознавание НЕ создаёт второе событие
   активации.

### FR-partner-codes-and-cabinet-9 — кабинет партнёра: код только с сервера
`GET /api/v1/partner/dashboard?window=day|week|all`. Код разрешается на СЕРВЕРЕ из
`partner.account_id` вызывающего (`account_id` аутентифицированной сессии); ЛЮБОЕ значение кода,
присланное в запросе (query, body, заголовок), ИГНОРИРУЕТСЯ. Вызывающий, у которого нет своего
`partner`, получает `403` — единственное законное исключение из правила «чужой ресурс = `404`»
(`.claude/rules/security.md`, `docs/Pseudocode.md` строка 431), потому что ответ не подтверждает и
не опровергает существование чужого кода, а лишь то, что вызывающий не партнёр.

### FR-partner-codes-and-cabinet-10 — четыре счётчика из одной таблицы
Все четыре счётчика вычисляются ПО `growth_event`, отфильтрованному `partner_code_id` этого кода,
за окно: переходы — `card_view`, установки — `install`, активации — `activation`, шеринги —
`share_click`. Ни один счётчик не берётся из другого источника (в частности, активации — НЕ из
`COUNT(attribution WHERE status=activated)`, а из `growth_event(activation)`, потому что обе строки
пишутся ОДНОЙ транзакцией FR-8 и разъехаться не могут, а порядок источника обязан быть один и тот
же для всех четырёх). Денег, ставок, выплат в ответе нет.

### FR-partner-codes-and-cabinet-11 — честные нули и раздельные метрики
Ноль наблюдений по коду → явные нули с пометкой «данных нет», а не пустой ответ и не отсутствующие
поля. Показатели `i` (карточек на активированного) и `conv%` (установок на карточку) — раздельные
поля, произведение не вычисляется. При числе наблюдений < 30 доля отдаётся строкой «недостаточно
данных (n из 30)», а не процентом; знаменатель `0` даёт то же самое, а не `0%`
(`fail-closed-defaults`, `honest-configuration` CFG-I7).

## Нефункциональные требования

### NFR-partner-codes-and-cabinet-1 — разделяемые ресурсы корректны под конкуренцией
Два независимых разделяемых ресурса — attribution-строка одной сессии (FR-6) и anti-fraud-счётчик
одного кода (FR-2/3) — проверяются КОНКУРЕНТНЫМ прогоном на настоящем PostgreSQL, а не
последовательным (`shared-resource-verification.md`): последовательный тест зеленеет и при
корректной сериализации, и без нее.

### NFR-partner-codes-and-cabinet-2 — аудит виден и не содержит полного адреса
Все пять аудируемых событий (см. «Решение: аудит») существуют в структурированном журнале строкой
JSON с `request_id`; ни в одном не появляется полный IP-адрес (только `ip_prefix`), значение cookie
или содержимое `initData`.

## Критерии приёмки

### AC-partner-codes-and-cabinet-1 — недействительный код ничего не меняет
Given (а) код `AB`, не проходящий форму `[A-Z0-9]{4,12}`, и (б) код `ZZZZ9999`, проходящий форму, но
отсутствующий в `partner_code`
When `POST /api/v1/codes/apply` вызывается для каждого
Then оба возвращают `invalid`/`422`; строк `attribution` не создано и не изменено; строк
`growth_event` не создано.

### AC-partner-codes-and-cabinet-2 — первое применение создаёт атрибуцию
Given у сессии нет строки `attribution`, код `LIZA10` активен и не заблокирован
When применяется `source = explicit`
Then `applied`/`200`; создана ровно одна строка `attribution` со `status = pending`,
`source = explicit`, `replaced_source = NULL`; создана ровно одна строка
`growth_event(type = code_applied)`.

### AC-partner-codes-and-cabinet-3 — явный код заменяет слабый источник
Given у сессии есть `attribution` с `source = cookie`, указывающая на код A
When применяется код B с `source = explicit`
Then `applied`/`200`; строка ОБНОВЛЕНА (не создана вторая): `partner_code_id` = B,
`replaced_source = cookie`, `source = explicit`; в журнале — `replaced_weaker_source` с кодами A и B.

### AC-partner-codes-and-cabinet-4 — явный источник не перебивается
Given у сессии `attribution` с `source = explicit`, код A
When применяется код B (`explicit`) и, отдельным прогоном, повторно код A (`explicit`)
Then оба дают `conflict`/`409`; строка `attribution` не изменена ни в одном прогоне.

### AC-partner-codes-and-cabinet-5 — слабый не перебивает слабый
Given у сессии `attribution` с `source = deeplink`
When применяется код с `source = cookie`
Then `conflict`/`409`; строка не изменена.

### AC-partner-codes-and-cabinet-6 — конкурентное применение одной сессией
Given у сессии нет `attribution`, коды A и B оба активны
When `POST /api/v1/codes/apply(A, explicit)` и `POST /api/v1/codes/apply(B, explicit)` стартуют
одновременно для ОДНОЙ сессии
Then ровно один вызов возвращает `applied`, второй — `conflict`; после обоих в `attribution` РОВНО
одна строка на эту сессию; ни один вызов не завершается необработанной ошибкой уникальности
(`23505`).

### AC-partner-codes-and-cabinet-7 — заблокированный код отклоняется до записи
Given `partner_code.status = blocked`
When код применяется
Then `rejected(code_blocked)`; строк `attribution`/`growth_event` не создано; журнал содержит
событие с этим кодом.

### AC-partner-codes-and-cabinet-8 — самореферал на применении
Given `device_session.account_id` равен `partner.account_id` владельца кода
When владелец применяет собственный код
Then `rejected(self_referral)`; строк `attribution`/`growth_event` не создано; журнал содержит
событие.

### AC-partner-codes-and-cabinet-9 — anti-fraud блокирует на 51-м применении и переживает конкуренцию
Given код с 50 засчитанными `code_applied` за последние 10 минут с одного `ip_prefix`
When (а) выполняется 51-е применение последовательно и (б) отдельным прогоном — 20 одновременных
применений с того же `ip_prefix` при исходных 45 засчитанных
Then в (а) код переходит в `blocked` с причиной `antifraud_ip_burst`, 51-я попытка получает
`rejected(antifraud_ip_burst)`, журнал содержит `ip_prefix` и время БЕЗ полного адреса; в (б) — код
блокируется РОВНО один раз (не блокируется повторно 20 раз), число ДОПОЛНИТЕЛЬНО принятых
применений сверх исходных 45 не превышает 6 (50 − 45 + 1 отклонённое, ровно то, что даёт
последовательная сериализация по локу кода), и после прогона `partner_code.status = blocked` ровно
с одной причиной блокировки.

### AC-partner-codes-and-cabinet-10 — блокировка не пересчитывается повторно
Given код уже `blocked` по anti-fraud
When код применяется ещё раз
Then `rejected(code_blocked)` (шаг 2 гейта, не шаг 4); окно 10 минут для этого кода НЕ пересчитано
повторно (запрос `COUNT` к `AntiFraudOnCode` не выполняется — проверяется по числу обращений к
адаптеру подсчёта в тесте).

### AC-partner-codes-and-cabinet-11 — разблокировка только вручную (страж по исходнику)
Given исходный код репозитория
When в код внедряется дефект — фоновая задача или условие `blocked_at < now() - interval` в SQL
запросе, автоматически возвращающее `status = active`
Then страж красный, называет файл; после удаления дефекта — страж зелёный; ручная операция
разблокировки при этом остаётся и пишет `manual_unblock` в журнал.

### AC-partner-codes-and-cabinet-12 — активация: первый успех переводит в activated, второй — no-op
Given `pending`-атрибуция, код активен, самореферала нет
When происходит ПЕРВОЕ успешное распознавание этой сессии, а затем ВТОРОЕ
Then после первого: `status = activated`, `activated_at` установлен, РОВНО одна строка
`growth_event(activation)`; после второго — число строк `growth_event(activation)` для этой сессии
осталось РОВНО 1, `activated_at` не изменился.

### AC-partner-codes-and-cabinet-13 — активация: код заблокирован между применением и распознаванием
Given `pending`-атрибуция; ПОСЛЕ её создания код блокируется (другой сессией, anti-fraud)
When происходит первое успешное распознавание этой сессии
Then `status = rejected`, `reject_reason = code_blocked`; `growth_event(activation)` НЕ создан;
`activated_at` остаётся `NULL`.

### AC-partner-codes-and-cabinet-14 — активация: самореферал обнаружен после входа через Telegram
Given `pending`-атрибуция создана анонимной сессией (`account_id = NULL`); ПОСЛЕ этого сессия
связывается с аккаунтом, равным `partner.account_id` владельца кода
When происходит первое успешное распознавание
Then `status = rejected`, `reject_reason = self_referral`; `growth_event(activation)` НЕ создан.

### AC-partner-codes-and-cabinet-15 — счётчики кабинета совпадают с событиями
Given по коду за окно `day` есть 5 `card_view`, 3 `install`, 2 `activation`, 1 `share_click`
When владелец открывает `GET /api/v1/partner/dashboard?window=day`
Then ответ содержит РОВНО эти четыре числа и время последнего обновления; денежных полей нет.

### AC-partner-codes-and-cabinet-16 — чужой код не раскрывается
Given вызывающий аутентифицирован, но не является партнёром (нет строки `partner` с его
`account_id`)
When запрашивается `GET /api/v1/partner/dashboard`
Then `403`; тело ответа не содержит ни одного числового счётчика ни по какому коду.

### AC-partner-codes-and-cabinet-17 — код кабинета берётся только с сервера (страж по исходнику)
Given исходный код обработчика `GET /api/v1/partner/dashboard`
When в код внедряется дефект — чтение `partner_code_id` из `request.query.code` вместо
`partner.account_id` вызывающего
Then страж красный, называет файл и строку; после отката — страж зелёный, и запрос с посторонним
`?code=` в query-строке по-прежнему возвращает СОБСТВЕННЫЕ счётчики вызывающего, а не счётчики по
присланному коду.

### AC-partner-codes-and-cabinet-18 — честные нули и раздельные метрики
Given (а) по коду за окно нет ни одного `card_view` и (б) число наблюдений равно 12 (< 30)
When открывается кабинет
Then в (а) — все четыре счётчика `0` с пометкой «данных нет», а не пустой ответ; в (б) — доля
подаётся строкой «недостаточно данных (12 из 30)», `i` и `conv%` — двумя раздельными полями без
вычисленного произведения.

### AC-partner-codes-and-cabinet-19 — в ответе кабинета нет денежных полей
Given любой валидный запрос кабинета
When разбирается JSON-схема ответа
Then в ней НЕТ ни одного поля, семантически означающего деньги, ставку или выплату (проверяется
списком запрещённых имён полей: `payout`, `rate`, `price`, `earnings`, `balance`, `commission`).

## Answer-map: FR/AC ← корень
FR-PARTNER-001 ← FR-partner-codes-and-cabinet-1,2,4,5,6. FR-PARTNER-002 ← FR-partner-codes-and-cabinet-9,10,11.
FR-PARTNER-003 ← FR-partner-codes-and-cabinet-2,3,7. FR-GROWTH-002 ← FR-partner-codes-and-cabinet-1,4.
FR-GROWTH-004/005/007 ← FR-partner-codes-and-cabinet-10,11. ADR-008 ← FR-partner-codes-and-cabinet-4
(Confirmation ADR-008 буквально закрывается AC-2…6). SC-US-010-1 ← AC-2, AC-12. SC-US-010-2 ← AC-1.
SC-US-011-1 ← AC-15, AC-18. SC-US-011-2 ← AC-16, AC-17.
