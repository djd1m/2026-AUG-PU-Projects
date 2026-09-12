**Verdict:** 🟢 READY

# Requirements Testability Analysis
Spec revision: sha256:d33ff4ad354e2b2c8c235f5fc32f34a503d776098b74864a54c6b24ebfc4e5b1

Проект: N4 «Тарелка». Фича: `consent-and-telegram-auth`. Валидатор: Phase 2 (Sonnet 5, константа
ранбука `docs/feature-runbook.md`). Единица анализа — `FR-consent-and-telegram-auth-n` /
`NFR-consent-and-telegram-auth-n` (формат `sparc-prd-mini` на уровне фичи, как в `foundation` и
`scan-pipeline`; user-story форма не используется). INVEST применён к каждому требованию как к
негоциируемой единице работы, SMART — к его критериям приёмки.

## Summary

- Требований проанализировано: 15 (13 FR + 2 NFR).
- Критериев приёмки: 20 (`AC-consent-and-telegram-auth-1` … `-20`), все имеют строку в
  `## Criterion scenarios`.
- Средний балл: **90/100**.
- Заблокировано (score < 50 или floor): 0.
- Blocking floor (`Testable`/`Completeness`/`Traceability` = 0): не сработал ни для одного
  требования.
- Находок: 3 — 1 `high`, 2 `medium`, ни одна не блокирующая.
- Security acceptance criteria: применимо, присутствует специфично (бонус +5).
- Growth traceability: не применимо (+0) — см. раздел ниже.

## Results

| Требование | Заголовок | Score | INVEST | SMART | Status |
|---|---|---|---|---|---|
| FR-consent-and-telegram-auth-1 | Проверка подписи `initData` | 95/100 | 50/50 ✓ | 25/30 | READY |
| FR-consent-and-telegram-auth-2 | Вход и атомарный перенос дневника | 95/100 | 50/50 ✓ | 25/30 | READY |
| FR-consent-and-telegram-auth-3 | Защита от повтора `initData` (DEC-A-016) | 90/100 | 50/50 ✓ | 25/30 | READY |
| FR-consent-and-telegram-auth-4 | Формат `TELEGRAM_BOT_TOKEN` при старте | 92/100 | 50/50 ✓ | 25/30 | READY |
| FR-consent-and-telegram-auth-5 | Согласие (`grant`) на дневник | 95/100 | 50/50 ✓ | 25/30 | READY |
| FR-consent-and-telegram-auth-6 | Отказ не блокирует съёмку | 92/100 | 50/50 ✓ | 25/30 | READY |
| FR-consent-and-telegram-auth-7 | Fail-closed граница записи дневника | 82/100 | 50/50 ✓ | 20/30 | READY |
| FR-consent-and-telegram-auth-8 | Отзыв согласия закрывает карточки | 95/100 | 50/50 ✓ | 25/30 | READY |
| FR-consent-and-telegram-auth-9 | `erase_all` синхронный, идемпотентный | 95/100 | 50/50 ✓ | 25/30 | READY |
| FR-consent-and-telegram-auth-10 | Фоновое удаление ≤ 72 ч | 92/100 | 50/50 ✓ | 30/30 ✓ | READY |
| FR-consent-and-telegram-auth-11 | Активный скан не прерывается удалением | 88/100 | 50/50 ✓ | 25/30 | READY |
| FR-consent-and-telegram-auth-12 | Аудит передачи наружу без согласия | 88/100 | 50/50 ✓ | 25/30 | READY |
| FR-consent-and-telegram-auth-13 | Экраны входа/согласия/удаления | 85/100 | 42/50 | 22/30 | READY |
| NFR-consent-and-telegram-auth-1 | Единая точка возврата `401` | 92/100 | 50/50 ✓ | 25/30 | READY |
| NFR-consent-and-telegram-auth-2 | Три состояния долгой задачи эразуры | 92/100 | 50/50 ✓ | 30/30 ✓ | READY |

**Средний балл: (95+95+90+92+95+92+82+95+95+92+88+88+85+92+92)/15 = 1348/15 = 90/100.**

INVEST = 50/50 у 14 из 15: каждое требование независимо оценимо, не диктует реализацию, имеет явную
ценность (защита ПДн специальной категории, дверь наружу из продукта — `01_specification.md` §Цель),
ограничено по объёму и проверяемо именованными `AC-n`. FR-13 (экраны) теряет `Testable`
(8→2, «vague AC»): ни один `AC-consent-and-telegram-auth-n` не относится ИСКЛЮЧИТЕЛЬНО к
клиентскому поведению экранов (порядок показа, тексты двух раздельных кнопок удаления) — покрытие
идёт КОСВЕННО через серверные AC-8/9/12/13 плюс собственное признание документа `reason: ui-only`
(`02_pseudocode.md:296-298`); текст экранов и порядок их показа не имеют ни одного прямого теста,
кроме `RenderConsentAndAuthScreens` как чистого представления. Это снижает Testable, но не до нуля
(критерии AC-8/9 КОСВЕННО связывают экран с проверяемым API-эффектом), поэтому floor не сработал.
SMART < 30 почти везде из-за `Time-bound = 0`: фича не показывает пользователю числа с задержкой
(кроме `erase_all`/эразуры, где срок есть — FR-10, NFR-2 получили полный балл `Time-bound = 5×2=10`
из-за явных 72 ч/часового цикла). FR-7 теряет дополнительно `Specific`/`Relevant` частично (см. VC-02
ниже — граница специфицирована, но её объём для анонимных сессий не решён координатором явно).

## Criterion scenarios

| Criterion | Scenario |
|-----------|----------|
| AC-consent-and-telegram-auth-1 | Успешный вход переносит все записи анонимного дневника в аккаунт (`tests/integration/auth-telegram.test.ts`) |
| AC-consent-and-telegram-auth-2 | Подделанная подпись отклоняется без создания аккаунта (`tests/unit/verify-init-data.test.ts`) |
| AC-consent-and-telegram-auth-3 | Верная подпись с `auth_date` старше 24 часов отклоняется (`tests/unit/verify-init-data.test.ts`) |
| AC-consent-and-telegram-auth-4 | Ответ 401 для подписи и свежести возвращается из одной точки исходника (`tests/unit/verify-init-data.test.ts`) |
| AC-consent-and-telegram-auth-5 | Повторное использование той же `initData` в пределах 24 часов отклоняется как `initdata_replayed` (`tests/integration/initdata-replay.test.ts`) |
| AC-consent-and-telegram-auth-6 | Вход с другого устройства связывается с существующим аккаунтом без потери или задвоения дневника (`tests/integration/auth-telegram.test.ts`) |
| AC-consent-and-telegram-auth-7 | Пустой `init_data` отклоняется как ошибка ввода без вычисления подписи (`tests/unit/verify-init-data.test.ts`) |
| AC-consent-and-telegram-auth-8 | Согласие с известной версией сохраняет версию, хэш и время (`tests/integration/consent.test.ts`) |
| AC-consent-and-telegram-auth-9 | Отказ от согласия оставляет съёмку и результат доступными (`tests/integration/consent.test.ts`) |
| AC-consent-and-telegram-auth-10 | Неизвестная версия и несовпавший хэш отклоняются одним кодом (`tests/unit/consent.test.ts`) |
| AC-consent-and-telegram-auth-11 | Запись дневника без согласия отклоняется на границе фичи (`tests/unit/enforce-before-diary-write.test.ts`) |
| AC-consent-and-telegram-auth-12 | Отзыв согласия закрывает карточки и блокирует новую запись дневника `consent_required` (`tests/integration/account-delete.test.ts`) |
| AC-consent-and-telegram-auth-13 | Запрос `erase_all` переводит аккаунт в `erasing` и отвечает синхронно с дедлайном (`tests/integration/account-delete.test.ts`) |
| AC-consent-and-telegram-auth-14 | Повторный `erase_all` во время `erasing` получает 409 без сдвига дедлайна (`tests/concurrency/account-delete-race.test.ts`) |
| AC-consent-and-telegram-auth-15 | Фоновая задача завершает удаление в срок и повторный прогон идемпотентен (`tests/integration/erasure-job.test.ts`) |
| AC-consent-and-telegram-auth-16 | Активный скан откладывает удаление одного аккаунта, не блокируя остальные (`tests/concurrency/erasure-job.test.ts`) |
| AC-consent-and-telegram-auth-17 | Запрос без `confirm` отклоняется без изменения статуса (`tests/unit/account-delete.test.ts`) |
| AC-consent-and-telegram-auth-18 | Передача дневника наружу без согласия отклоняется и попадает в аудит (`tests/unit/consent-denied-audit.test.ts`) |
| AC-consent-and-telegram-auth-19 | Токен бота неверного формата валит старт с названной причиной (`tests/unit/token-format.test.ts`) |
| AC-consent-and-telegram-auth-20 | Вход после удаления аккаунта создаёт новый аккаунт без восстановления старых данных (`tests/integration/auth-telegram.test.ts`) |

Источник имён сценариев — дословные заголовки тестов из `05_completion.md` §«Criterion coverage»
(таблица помечена ПЛАНОВОЙ; заголовки те же, что в `04_refinement.md` §«Тесты, которые Phase 3
обязан создать»).

## Detailed Analysis: FR-consent-and-telegram-auth-7 (fail-closed граница) — 82/100

### INVEST Analysis

| Criterion | Pass | Issue |
|-----------|------|-------|
| Independent | ✓ | Граница — отдельный модуль (`enforce-before-diary-write.ts`), импортируется, не копируется |
| Negotiable | ✓ | Способ реализации не продиктован |
| Valuable | ✓ | Прямая защита NFR-SEC-002, «по умолчанию всё закрыто» |
| Estimable | ✓ | Один модуль, два вызывающих места (дневник, карточка) названы |
| Small | ✓ | Один предикат (`consent_at IS NULL`) |
| Testable | ✓ | `AC-consent-and-telegram-auth-11` даёт точный вход/выход |

### SMART Analysis (AC-consent-and-telegram-auth-11)

Цитата (`01_specification.md:271-276`):
> «AC-consent-and-telegram-auth-11 … Given владелец без `consent_at` (согласие никогда не давалось)
> и валидный `recognition.status = done` … Then попытка отклоняется на уровне, который держит эта
> фича … строка `diary_entry` не создаётся.»

| Criterion | Pass | Issue |
|-----------|------|-------|
| Specific | частично | Формула «владелец без `consent_at`» специфична для АККАУНТА; для анонимной сессии (владелец = `device_session`, `consent_at` физически не существует у этой сущности) критерий не описывает поведение — см. VC-02 |
| Measurable | ✓ | Бинарный исход: строка создана / не создана |
| Achievable | ✓ | Один индексный поиск |
| Relevant | частично | Защищает NFR-SEC-002 для аккаунтов; для анонимного окна защиты в этом AC нет вовсе — см. VC-02, отличается ли это от намерения NFR-SEC-002 |
| Time-bound | ✗ | Не применимо (проверка перед записью, не измерение задержки) |

### Findings

**VC-01 (high).** `02_pseudocode.md:293-298` (раздел `## Scenario Coverage`) содержит фрагмент,
противоречащий остальному документу:
> «AC-consent-and-telegram-auth-5 (повтор `initData`) НЕ реализуется — заявлен в `01_specification.md`
> как открытый вопрос и закрыт алгоритмом `VerifyTelegramInitData` только В ТОМ СМЫСЛЕ, что тест
> фиксирует ТЕКУЩЕЕ (не защищённое) поведение; это не пропуск покрытия, а названное ограничение.»

Это прямо противоречит: (1) `01_specification.md` §«Решения координатора DEC-A-016» и
`FR-consent-and-telegram-auth-3`, где защита от повтора ОПИСАНА КАК РЕАЛИЗУЕМАЯ, с конкретными
полями `last_telegram_auth_hash`/`_at`; (2) самому `AC-consent-and-telegram-auth-5`
(`01_specification.md:230-236`), чьё Then — «ответ `401 initdata_replayed`», а не «текущее
незащищённое поведение»; (3) алгоритму `TelegramLogin` шаг 2 (`02_pseudocode.md:82`), который
полностью реализует сверку и отказ; (4) `04_refinement.md` Edge Cases Matrix (строка «повтор ОДНОЙ И
ТОЙ ЖЕ валидной `initData`») и обязательному тесту `initdata-replay.test.ts`
(`03_architecture.md:60`, `04_refinement.md:91`); (5) `05_completion.md` строке `## Criterion
coverage` и пункту чеклиста «Все три пункта DEC-A-016 реализованы… `initdata-replay.test.ts`
доказывает отказ». Фрагмент — явно НЕДООБНОВЛЁННЫЙ остаток более раннего черновика (написанного до
решения DEC-A-016, когда защита от повтора действительно была открытым вопросом) и оставленный без
правки после того, как решение приняли и реализовали во всём остальном документе. Тем же фрагментом
(`02_pseudocode.md:296`) допущена вторая, более мелкая ошибка — «`AC-consent-and-telegram-auth-13`
экрана (кнопка входа, экран согласия, экран удаления)» использует префикс `AC-`, хотя UI-требование
называется `FR-consent-and-telegram-auth-13` (`AC-consent-and-telegram-auth-13` — существующий,
другой критерий: «erase_all запускает удаление и отвечает синхронно», см. `01_specification.md:287`).
Смешение семейств идентификаторов запрещено каноном (`docs/canon.md` §2, «любой документ ссылается на
эти идентификаторы, не выдумывает свои»). **Риск:** реализатор, читающий только итоговый раздел
`## Scenario Coverage` (а не всю историю решений документа), может прочитать защиту от повтора как
необязательную и пропустить обязательный тест. **Исправление (до Phase 3):** удалить или переписать
абзац `02_pseudocode.md:293-295` в соответствии с текущим (реализуемым) статусом AC-5, и заменить
`AC-consent-and-telegram-auth-13` на `FR-consent-and-telegram-auth-13` в строке 296. Не блокер: во
ВСЕХ прочих местах документа (алгоритм, тесты, чеклист) состояние верное и непротиворечивое —
дефект локализован в одном самоописательном абзаце, а не в спецификации поведения.

**VC-02 (medium).** `EnforceConsentBeforeDiaryWrite` шаг 1 (`02_pseudocode.md:121`) вводит границу,
не зафиксированную ни одним `DEC-A-nnn`: «анонимная запись дневника до входа … РАЗРЕШЕНА на 7 суток
анонимного дневника (`FR-AUTH-001`) и НЕ проходит через эту проверку» — то есть анонимная сессия
(владелец без Telegram-аккаунта) вообще НЕ обязана давать согласие, пока не войдёт, и весь
7-суточный анонимный дневник ведётся без единой проверки `NFR-SEC-002`. Это прямо сужает букву
`ADR-009` («Согласие берётся до первой записи в дневник… Confirmation: тест — `POST` записи в
дневник без отметки согласия отклоняется на уровне API», `docs/ADR.md:231-243`, без оговорки про
анонимные сессии) и проектного сценария `SC-US-012-1` (`docs/Specification.md:629-631`: «Given Марина
впервые подтверждает результат для дневника… When показывается экран согласия и она отказывается» —
сценарий не квалифицирует Марину как вошедшую через Telegram). В отличие от трёх решений,
перечисленных явно в `01_specification.md` §«Решения координатора DEC-A-016», ЭТО сужение объёма
NFR-SEC-002 нигде не зафиксировано как решение координатора — оно введено одним предложением внутри
алгоритма, без записи в `docs/decisions-autonomous.md`. Инженерная логика решения понятна и
самосогласованна (анонимный дневник самоуничтожается за 7 суток по отдельной политике FR-AUTH-001,
поэтому повторное согласие для него избыточно) — но это ИМЕННО тот класс решения, для которого
данный проект требует явной записи (ср. `DEC-A-016` в этом же документе, `DEC-A-006` для
FR-GROWTH-007). Дефекта в тестируемости AC-11 нет (Given/When/Then для сценария с существующим
`consent_at` корректны и проверяемы), но объём защиты для АНОНИМНОГО пути не покрыт НИ ОДНИМ
`AC-consent-and-telegram-auth-n` и не проверяется ни одним тестом из `05_completion.md`
§«Criterion coverage» — специальная категория ПДн обрабатывается 7 суток без согласия, и никто
явно не подтвердил, что это осознанный, а не забытый пробел. **Исправление:** записать решение как
`DEC-A-0nn` (или включить четвёртым пунктом в `DEC-A-016`) явно, со ссылкой на `ADR-009`/
`SC-US-012-1`, и добавить `AC-consent-and-telegram-auth-n` на «запись дневника в анонимном окне 7
суток создаётся без запроса согласия» — иначе Phase 4 (Codex Astra) не сможет отличить это решение
от регресса ADR-009.

**VC-03 (medium).** Защита от повтора `initData` (DEC-A-016, `TelegramLogin` шаг 2) читает и
сравнивает `last_telegram_auth_hash`/`_at` на разделяемых строках (`account` под `FOR UPDATE`, но
`device_session` — БЕЗ явной блокировки строки, «первый вход», `02_pseudocode.md:82`), однако ни
`04_refinement.md` §«Testing Strategy» (там названы конкурентные тесты ТОЛЬКО для `erase_all` и
`RunErasureJob`), ни `05_completion.md` §«Criterion coverage» не называют конкурентный тест для
`initdata-replay.test.ts` — единственная запись про него (`04_refinement.md:91`) специфицирует его
как `integration`, не `concurrency`. Ровно эта разница (последовательный тест «второй запрос после
первого получает `401`» против «два одновременных запроса с идентичным `initData`») — предмет
корневого правила [`shared-resource-verification.md`](../../../../.claude/rules/shared-resource-verification.md):
последовательный тест доказывает работу проверки, но не показывает гонку между сверкой
`last_telegram_auth_hash` (шаг 2, без блокировки `device_session`) и последующей вставкой строки
`account`, защищённой лишь частичным уникальным индексом на `telegram_user_id`
(`03_architecture.md:120-124`). Два параллельных запроса с ОДНОЙ И ТОЙ ЖЕ перехваченной `initData` в
рамках одной ещё-анонимной `device_session` могут оба пройти сверку до того, как один из них запишет
`last_telegram_auth_hash`, и разойтись на шаге вставки `account` через ошибку уникального
ограничения, а не через специфицированный `401 initdata_replayed` — путь ошибки для этого случая
нигде не описан. **Исправление:** добавить конкурентный тест (аналогично `account-delete-race.test.ts`)
и явно описать, что делает `TelegramLogin` при конфликте уникального индекса на шаге 3 (превратить в
`401 initdata_replayed`, а не бросить необработанную ошибку `500`).

Ни одна из трёх находок не обнуляет `Testable`/`Completeness`/`Traceability` ни для одного `AC-n`:
все двадцать критериев имеют строку в `## Criterion scenarios`, порядок операций
(`security-operation-order.md`) во ВСЕХ описанных парах (частота↔тело, квота↔вызов, подпись↔разбор,
подпись↔свежесть, согласие↔запись) соблюдён и специфицирован верно.

## Security acceptance criteria

Фича вводит вход через внешнего провайдера идентичности (Telegram), секрет (`TELEGRAM_BOT_TOKEN`) и
границу специальной категории ПДн — применимо целиком.

| Criterion | Check | Status |
|---|---|---|
| Input Validation | Все пользовательские данные проверяются? | Присутствует, специфично: `init_data` — сырые байты до разбора (`AC-2/3/4/7`); `consent_version`/`consent_text_hash` сверяются с код-владеемым списком, не доверяются как факт (`02_pseudocode.md:26-33`) |
| Authentication | Механизм аутентификации назван? | Присутствует, специфично: HMAC-SHA-256 по официальной схеме Telegram (`VerifyTelegramInitData`), эталонный вектор из документации Telegram (`04_refinement.md:54-58`) |
| Authorization | Контроль доступа определён? | Присутствует: `DELETE /account` требует `Authorization: Bearer <token>` (владелец действует только над собственным аккаунтом — параметра «чей аккаунт» в теле нет) |
| Data Protection | Обработка чувствительных данных специфицирована? | Присутствует, специфично: данные о питании — специальная категория (NFR-SEC-002), согласие версионировано, эразура — 72 ч; НО см. VC-02 — объём защиты для анонимного окна не зафиксирован решением |
| Multi-Tenant Isolation | Не применимо | Модель — `device_session`/`account`, как в `foundation`/`scan-pipeline` |
| Secret Management | Секреты вынесены наружу? | Присутствует, специфично: `TELEGRAM_BOT_TOKEN` только в `api`; редактор журнала расширен именами `bot_token`, `secret_key`, `init_data` (`03_architecture.md:140-144`) |
| Webhook Security | Проверка подписи? | Не webhook в строгом смысле (клиент, не сторонний сервер, шлёт `init_data`), но подписью защищено — see Authentication выше |

**Бонус:** +5 (шесть из семи применимых категорий присутствуют специфично, ни одна не отсутствует —
штраф −10 не применяется; VC-02 снижает уверенность в Data Protection, но не превращает её в
отсутствующую: механизм для АККАУНТОВ специфицирован полностью).

**Security AC явно покрыты:** подделка `hash` (AC-2), просроченный `auth_date` (AC-3), повтор
(AC-5, с оговоркой VC-03), инъекция через `consent_version`/`consent_text_hash` (AC-10, сервер не
доверяет клиенту), секрет не логируется (`03_architecture.md` Security Architecture, испытывается
Phase 4 по грепу).

## Growth traceability

Не применимо (+0). `FR-GROWTH-006` уже присутствует в `docs/Specification.md` (трассировка семени
брифа M5 выполнена на уровне проекта до этой фичи — не в `docs/product-discovery-brief.md`
семенем этой фичи). `consent-and-telegram-auth` РЕАЛИЗУЕТ уже существующее требование
(`FR-consent-and-telegram-auth-8/12/18` ссылаются на `FR-GROWTH-006` как на источник), а не
промоутирует новую строку из брифа — ни одного нового `FR-GROWTH-nnn` фича не вводит. Тот же паттерн,
что в `foundation`/`scan-pipeline`: growth-семя проверяется один раз на уровне проекта, а не заново
на каждой фиче, которая его использует.

## Проверено без замечаний

- Схема проверки `initData` (`VerifyTelegramInitData`) совпадает с документацией Telegram: секрет —
  `HMAC-SHA256(key="WebAppData", data=TELEGRAM_BOT_TOKEN)` (`02_pseudocode.md:59`), строка проверки —
  отсортированные пары `key=value` кроме `hash`, соединённые `\n` (`02_pseudocode.md:58`), сравнение
  — `crypto.timingSafeEqual` на буферах равной длины (`02_pseudocode.md:61`, дополнительно уточнено в
  `03_architecture.md:135-139` про исключение при разной длине), `auth_date` ≤ 24 ч ПОСЛЕ подписи
  (`02_pseudocode.md:63`). Порядок совпадает с `docs/Architecture.md:199-205` и корневым
  `security-operation-order.md`.
- Единственная точка возврата `401` для обеих причин (подпись/свежесть) специфицирована как СТАТИЧЕСКИЙ
  тест (грep по коду), а не тайминг-тест (`NFR-consent-and-telegram-auth-1`, `AC-4`,
  `04_refinement.md:16` — явно отклонён вариант измерения миллисекунд как flaky на CI). Страж назван
  ВМЕСТЕ с обязательством его испытать на внедрённом дефекте (`04_refinement.md:93-101`), по
  `guard-must-be-able-to-fail.md`.
- Перенос анонимного дневника — одна транзакция, откат ВСЕХ строк при сбое (`FR-2`, `TelegramLogin`
  шаг 8), вход с другого устройства ДОБАВЛЯЕТ к уже перенесённым без потери/задвоения (`AC-6`,
  предикат `owner_key = :session_id` не трогает уже перенесённые строки).
- Отзыв согласия блокирует НОВЫЕ записи/карточки (`403 consent_required`), но НЕ удаляет
  существующие; удаление данных остаётся отдельным `erase_all` — разведено явно и решением DEC-A-016,
  и в `Pseudocode.md` `ConsentAndErasure` шагах 3/4 (разные глаголы, не смешиваются).
- `DELETE /account` идемпотентен и покрывает: фото (`photo.file_state → purged`, объект удаляется из
  бакета, отсутствие объекта — тоже успех, как `PurgeExpiredPhotos`), `recognition`, `diary_entry`,
  `share_card` (закрыт заранее API, физически удалён здесь), переход `account.status`. `attribution`
  и `growth_event` НЕ анонимизируются, а остаются НЕТРОНУТЫМИ обоснованно: они ключуются
  `device_session_id`, а не `account_id` (`docs/Pseudocode.md:39`, `docs/Architecture.md:162`), не
  содержат данных о питании, и `device_session.account_id` при удалении аккаунта обнуляется
  (`SET NULL`, `FR-10`) — партнёрские счётчики остаются измеримыми без переизобретения второй
  анонимизации того же факта.
- Чужой ресурс → 404: не применимо к трём маршрутам этой фичи буквально (ни один не принимает
  чужой идентификатор в URL — `POST /auth/telegram`, `POST /consent`, `DELETE /account` действуют
  только на вызывающего, без параметра «чей аккаунт»); проектное правило `404` вместо `403`
  (`security.md`) фичей не нарушается, потому что применять его здесь не к чему.
- Security AC: подделка `hash` (`AC-2`), истёкший `auth_date` (`AC-3`), инъекция через
  `consent_version`/`consent_text_hash` (`AC-10`, сервер вычисляет хэш сам, не доверяет присланному
  значению как факту) — все три покрыты именованными тестами, не общими словами.
- Маршруты 9/12/13 канона (`POST /auth/telegram`, `POST /consent`, `DELETE /account`) сверены с
  нумерованной таблицей `docs/Pseudocode.md:377-389` (не с порядком перечисления в `canon.md` §5,
  который не несёт номеров) — номера совпадают: 9, 12, 13.
- `docker compose`/секреты: фича не добавляет ни одной новой переменной окружения — только
  ДОПОЛНИТЕЛЬНУЮ проверку ФОРМАТА уже обязательной `TELEGRAM_BOT_TOKEN` (`03_architecture.md:87-99`);
  `web` не получает ни одного секрета (сверено с `secrets-management.md` проекта).
