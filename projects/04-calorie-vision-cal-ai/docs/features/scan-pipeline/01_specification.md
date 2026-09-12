# Фича `scan-pipeline` — спецификация

Проект: N4 «Тарелка». Фаза: Phase 1 PLAN. Дата: 2026-09-12. Плечо B (Sonnet 5).
Источники имён и чисел: [`docs/canon.md`](../../canon.md) (заморожен 2026-09-12),
[`docs/Specification.md`](../../Specification.md) (FR-CAPTURE-002, FR-RECOGNIZE-001, FR-RECOGNIZE-002,
FR-LIMIT-001, FR-LIMIT-002, FR-SOURCE-001 в части «число только из базы», NFR-PERF-001, NFR-SEC-001,
SC-US-001-1, SC-US-001-2, SC-US-009-1), [`docs/Architecture.md`](../../Architecture.md) (Component
Breakdown, External Dependencies, Data Architecture), [`docs/ADR.md`](../../ADR.md) (ADR-001, ADR-003,
ADR-004, ADR-007, ADR-010), [`docs/Pseudocode.md`](../../Pseudocode.md) (`EnqueueScan`, `RecognizeScan`,
`CheckAndConsumeQuota`, `PurgeExpiredPhotos`, API Contracts маршрутов 1–2),
[`docs/model-cost-contract.md`](../../model-cost-contract.md), [`docs/long-job-contract.md`](../../long-job-contract.md),
[`docs/Refinement.md`](../../Refinement.md), [`docs/test-scenarios.md`](../../test-scenarios.md),
фича `foundation` ([`03_architecture.md`](../foundation/03_architecture.md),
[`02_pseudocode.md`](../foundation/02_pseudocode.md)).

## Цель

Дать пользователю ПЕРВЫЙ платный вызов продукта: снять кадр, дождаться распознавания ингредиентов и
порции моделью, честно отказать при исчерпанном потолке, и не потерять ни рубль на дублях, разрывах
соединения или гонке воркеров. Фича встраивается ПОВЕРХ каркаса `foundation`, а не строит его заново:
атомарный модуль потолков (`apps/api/src/quota/check-and-consume.ts`), аренда задания с fencing
(`apps/recognizer/src/lease.ts`) и интерфейс `ModelProvider` с фейком уже существуют и здесь только
ВЫЗЫВАЮТСЯ, а не переписываются.

Фича НЕ показывает пользователю калорийность и БЖУ и не вычисляет их: это ЯВНО объявленный стык со
следующей фичей `source-and-correct`, см. раздел «Стык с `source-and-correct`» ниже.

## Объём

Входит:

1. `POST /api/v1/scans` — приём фото (multipart, ≤ 12 МБ, JPEG/PNG/WebP/HEIC, ≥ 320×320 px),
   валидация по СОДЕРЖИМОМУ байтов, decompression-bomb защита, EXIF-strip, заявка
   `Idempotency-Key` (обязателен, UUID), квота `reason = primary` (переиспользование
   `CheckAndConsumeQuota` из `foundation`), сохранение оригинала в приватный бакет с
   `expires_on = +30 дней`, ответ `202` с `scan_id`.
2. `GET /api/v1/scans/{id}` — чтение статуса; чужой и несуществующий `id` дают ОДИН `404`.
3. `apps/recognizer`: нормализация фото ДО вызова модели (HEIC→JPEG, длинная сторона ≤ 1568 px,
   ≤ 5 МБ), вызов `ModelProvider.recognize` (Haiku 4.5) со строгой JSON-схемой, проверка диапазонов
   ответа В КОДЕ после разбора, эскалация к Sonnet 5 при `confidence < 0,6` через
   `CheckAndConsumeQuota(reason = escalation)` — четвёртый ключ, `LiveModelProvider` (Anthropic
   Messages API, vision + structured outputs) как вторая реализация интерфейса `ModelProvider`
   рядом с фейком `foundation`.
4. Двухуровневый лимит частоты канона §7 (30/мин мутирующие, 120/мин читающие) поверх общего хука
   `foundation` (FR-foundation-8), применённый к маршрутам 1 и 2.
5. `PurgeExpiredPhotos` — батч-уборка фото старше 30 дней (NFR-SEC-001, ADR-010).
6. Журнал `model_call {reason, model, ok, ms}` на КАЖДУЮ попытку — источник NFR-OPS-001; расход
   виден по счётчикам `scan_quota_counter`, а не только по журналу.
7. Тесты: unit (диапазоны, граница эскалации 0,59/0,60, валидация формата), integration (маршруты,
   нормализация, провайдер), конкурентные (идемпотентность, квота под нагрузкой ЭТОЙ фичи —
   эскалационный ключ, аренда с реальным вызовом провайдера), стражи по исходнику (ADR-001: схема
   без `calories/kcal/protein/fat/carbs`; единственное чтение `model_estimate_kcal`).

Вне объёма (делают другие фичи роадмапа): расчёт ккал/БЖУ из базы USDA, нечёткий поиск, курация
`food_synonym`, импорт FDC, `Snapshot`, `discrepancy_ratio`, экран расхождения — всё это FR-SOURCE-001
(остальная часть)/002/003, FR-CORRECT-003, реализует `source-and-correct` (см. ниже); карточка 9:16,
дневник, коды партнёра, вход через Telegram, экран лимита как UI — реализуют более поздние фичи.
Каркас квоты, аренды и адаптера — `foundation`, здесь не переписывается.

## Стык с `source-and-correct` — явное решение, требует подтверждения координатора

Бриф фичи предлагал: «результат `done` содержит `items` с `food_item_id: null` до появления RAG».
Это противоречит ADR-001 Confirmation (2): «`recognition` без единой ссылки на `food_item` не может
получить статус `done`» — инвариант, гарантированный тестом на внедрённом дефекте. Нарушать принятый
и защищённый ADR ради удобства стыка неверно, поэтому решение здесь ДРУГОЕ и явно расходится с
формулировкой брифа — расхождение зафиксировано, а не скрыто:

- В эту фичу вводится порт `MatchIngredientPort` (`match(item): Promise<{food_item_id, snapshot} |
  null>`) — точка расширения для сопоставления с базой. Реализация ЭТОЙ фичи —
  `NullMatchIngredientPort`, которая ВСЕГДА возвращает `null` (в `food_item` ещё нет ни одной строки:
  импорт делает `source-and-correct`).
- Следствие, СОГЛАСОВАННОЕ с ADR-001: пока используется `NullMatchIngredientPort`, ни один `recognition`
  не может сопоставить ни одной позиции → шаг «ни одна позиция не сопоставлена» истинен ВСЕГДА →
  терминальный статус для любого кадра с распознанной едой — `failed(no_food_matched)`, а НЕ `done`.
  `done` в этой фиче НЕДОСТИЖИМ, и это ожидаемое, объявленное ограничение, а не дефект.
- Логика эскалации, диапазонов, `low_confidence` и `failure_reason = quota_exhausted_escalation`
  проверяется UNIT-тестом с ПОДМЕНЁННЫМ портом (тестовый `MatchIngredientPort`, возвращающий
  совпадение) — это доказывает, что код правильный и готов принять реальный порт, не дожидаясь
  `source-and-correct`. Интеграционный прогон на РЕАЛЬНОМ `NullMatchIngredientPort` отдельно
  доказывает сегодняшнее поведение (`failed(no_food_matched)`).
- `source-and-correct` заменяет `NullMatchIngredientPort` на реализацию с триграммным поиском —
  контракт интерфейса не меняется, меняется только реализация за портом.

Координатор (владелец канона) подтверждает эту трактовку на чекпойнте Phase 1 ЛИБО явно требует
буквального прочтения брифа (что означало бы отмену ADR-001 Confirmation (2) — решение вне
компетенции исполнителя плеча).

## Функциональные требования

### FR-scan-pipeline-1 — приём фото: валидация по содержимому, не по имени
`POST /api/v1/scans` принимает `multipart/form-data` с полем файла. Тип файла определяется по БАЙТАМ
(`file-type` либо аналог, не `Content-Type` заголовка и не расширение). Полиглот (пригоден как
изображение И как HTML/архив) отвергается. Объявленные размеры изображения, дающие распаковку свыше
100 Мпикс, отвергаются ДО декодирования. EXIF, включая GPS, снимается при нормализации (шаг
recognizer, FR-scan-pipeline-5), а не на приёме — приём сохраняет оригинал НЕТРОНУТЫМ (ADR-010:
удаление по запросу удаляет обе копии). Непригодный формат/размер/содержимое даёт `422`/`413` с
названной причиной ДО обращения к квоте и ДО создания `photo`; попытка НЕ списывается
(FR-CAPTURE-002, `EnqueueScan` шаг 2).

### FR-scan-pipeline-2 — заявка ключа повторности одним атомарным оператором
Заголовок `Idempotency-Key` обязателен и обязан быть UUID; отсутствие или непригодная форма — `422`
ДО обращения к квоте (`EnqueueScan` шаг 2а). Заявка — `INSERT INTO recognition (device_session_id,
idempotency_key, status) VALUES (…, 'queued') ON CONFLICT (device_session_id, idempotency_key) DO
NOTHING RETURNING id`. Пустой результат означает «такой скан уже есть»: прочитать существующую
строку и вернуть ТОТ ЖЕ `scan_id`, тот же `202` и её текущий статус, без повторного списания квоты и
без второго вызова модели. «Прочитать, потом вставить» запрещено (`long-job-contract.md`).

### FR-scan-pipeline-3 — квота ДО вызова модели, атомарно, переиспользованием `foundation`
Маршрут вызывает `CheckAndConsumeQuota(session, ip_prefix, day, reason = 'primary')` из
`apps/api/src/quota/check-and-consume.ts` (`foundation`, не переписывается). `IF refused THEN`
перевести заявленную строку `recognition` в `refused` с `failure_reason` по названному `scope`
(`quota_exhausted_user` | `quota_exhausted_global`), вернуть `429` с телом `{ limit, reset_at, scope
}`, БЕЗ сохранения фото и БЕЗ создания задания очереди — вызова модели не было, списывать нечего
(ADR-007, FR-LIMIT-001/002).

### FR-scan-pipeline-4 — сохранение оригинала и немедленный `202`
После `granted`: оригинал кладётся в приватный бакет (`storage`, MinIO) с `expires_on = today + 30
дней`, `file_state = 'present'`; заявленная строка `recognition` дополняется `photo_id`,
`attempt_no = 1`, `escalated = false`, `lease_fence = 0`, статус остаётся `queued`. При ПЕРВОМ скане
сессии пишется `growth_event(type = install, …)`. Маршрут отвечает `202` с `{ scan_id, status:
'queued' }` немедленно, не дожидаясь распознавания (`long-job-contract.md`: идентификатор выдаётся
ДО начала работы, а не вместе с результатом).

### FR-scan-pipeline-5 — нормализация фото на сервере ДО вызова модели
`recognizer` преобразует HEIC/HEIF → JPEG, приводит длинную сторону к ≤ 1568 px, сжимает до ≤ 5 МБ и
сохраняет как `photo.normalized_object_key`; оригинал не изменяется. Соединение с базой на время
загрузки и нормализации НЕ удерживается: аренда (шаг `foundation` `LeaseRecognitionJob`) уже
закрыла транзакцию. `IF нормализация не удалась THEN failed(schema_violation)` с названной причиной,
вызова модели НЕ делать (FR-CAPTURE-002, `RecognizeScan` шаг 2а).

### FR-scan-pipeline-6 — вызов модели по строгой схеме, диапазоны проверяет наш код
`recognizer` вызывает `Haiku 4.5` через `ModelProvider.recognize(image, schema)`. Схема ответа:
`items[]` (`label_ru`, `mass_g`, `candidates[]` ≤ 3), `confidence`, `model_estimate_kcal`; полей
`calories`, `kcal`, `protein`, `fat`, `carbs` в схеме НЕТ (ADR-001). После разбора код проверяет:
`confidence` в 0…1; `mass_g` каждой позиции в 1…5000; позиций ≤ 12; кандидатов на позицию ≤ 3;
`model_estimate_kcal ≥ 0`. `IF` любое условие нарушено `THEN failed(schema_violation)` с названным
полем — значение вне диапазона трактуется как отсутствующее, а НЕ подрезается до границы. `IF`
провайдер недоступен или истёк таймаут `THEN failed(provider_unavailable | provider_timeout)` —
попытка уже списана и не возвращается. `IF` модель не нашла еды `THEN refused(no_food_detected)`,
запись дневника не создаётся (FR-RECOGNIZE-001, SC-US-001-2).

### FR-scan-pipeline-7 — эскалация к Sonnet 5, четвёртый ключ ДО вызова
`IF confidence < 0,6 AND escalated = false THEN` вызвать `CheckAndConsumeQuota(reason =
'escalation')` — ДО обращения к Sonnet 5. `IF granted THEN` повторить вызов модели `Sonnet 5` ровно
ОДИН раз, `escalated = true`, `attempt_no = 2`. `ELSE` второго вызова НЕ делать: результат первичной
модели сохраняется, попытка эскалации отклонена по `scope = escalation`, событие расхода несёт
`quota_exhausted_escalation`. Логика проверяется unit-тестом с подменённым `MatchIngredientPort`
(см. «Стык»), поскольку в реальном окружении этой фичи `done` недостижим (ADR-004, ADR-007,
`model-cost-contract.md`).

### FR-scan-pipeline-8 — итог сопоставления через порт, терминальный статус без базы
После валидации диапазонов и решения по эскалации вызывается `MatchIngredientPort.match(item)` для
каждой позиции. Реализация этой фичи (`NullMatchIngredientPort`) всегда возвращает `null` → каждая
позиция помечается `unmatched = true`, `food_item_id = null`. `IF` НИ ОДНА позиция не сопоставлена
`THEN recognition = failed(no_food_matched)` с подсказкой «блюда нет в базе, уточните ингредиент
вручную» — что в реальном окружении этой фичи истинно ВСЕГДА для кадра с распознанной едой
(ADR-001, «Стык» выше). Результат записывается УСЛОВНО по своему `lease_fence`
(`apps/recognizer/src/lease.ts`, `foundation`); `UPDATE`, затронувший ноль строк, отбрасывается с
`stale_lease_result` в аудит (ADR-003, DEC-A-008).

### FR-scan-pipeline-9 — `GET /api/v1/scans/{id}`: владение и честные поля
Чужой и несуществующий `id` дают ОДИН `404` (владение — по `owner_key` на сервере). Тело ответа несёт
`status`, `items[]` (`label_ru`, `mass_g`, `unmatched`, `food_item_id: null` — до `source-and-correct`),
`confidence`, `low_confidence`, `escalated`, `model_estimate_kcal`, `failure_reason?`. Поля
`kcal_total`, `macros`, `sources[]`, `conflict_flag`, `share_card_id` из полного контракта проекта
(`Pseudocode.md`, маршрут 2) в ЭТОЙ фиче отсутствуют либо равны `null`/`[]` — они появляются с
`source-and-correct`, и это названо здесь явно, а не подразумевается.

### FR-scan-pipeline-10 — двухуровневый лимит частоты
Хук частоты `foundation` (FR-foundation-8) расширяется порогами канона §7: 30 запросов/мин на
`ip_prefix` для МУТИРУЮЩИХ маршрутов (`POST /scans`), 120/мин для ЧТЕНИЯ (`GET /scans/{id}`); `429`
без тела запроса в журнале (DEC-A-013). Применяется ДО разбора тела (`security-operation-order.md`).

### FR-scan-pipeline-11 — `PurgeExpiredPhotos`
Раз в сутки батч `photo` с `expires_on < today AND file_state = 'present'`, ограниченным размером;
удаление объекта из бакета (отсутствие объекта — тоже успех); `file_state → purged`, строка `photo`
СОХРАНЯЕТСЯ. Идемпотентна: повторный прогон в тот же день не делает ничего (NFR-SEC-001, ADR-010).

### FR-scan-pipeline-12 — наблюдаемость расхода по попыткам
Каждый вызов `ModelProvider.recognize` (успешный, отказавший, эскалационный) пишет строку журнала
`model_call { reason: 'primary' | 'escalation', model, ok: boolean, ms: number }` — источник
NFR-OPS-001. Счёт ведётся по ПОПЫТКАМ: таймаут и отказ провайдера пишутся наравне с успехом.

### FR-scan-pipeline-13 — `LiveModelProvider` как вторая реализация порта, включается ключом
`apps/recognizer/src/provider/anthropic.ts` реализует интерфейс `ModelProvider` из `foundation`
(`apps/recognizer/src/provider/types.ts`) поверх Anthropic Messages API (vision + structured
outputs). Выбирается `SelectModelProvider` (`foundation`) при `N4_MODEL_PROVIDER=live` и
непустом `ANTHROPIC_API_KEY`; по умолчанию и во всех тестах — фейк `foundation` (DEC-A-009). Живой
режим не является предметом тестов этой фичи (ключа на машине нет) и отдельно помечается «живое
распознавание не выполнено: нет ключа», а не объявляется смоуком.

## Нефункциональные требования

### NFR-scan-pipeline-1 — результат ≤ 6 с p95, включая эскалацию (NFR-PERF-001)
Соединение с базой не удерживается во время вызова модели (аренда закрывается ДО обращения к
провайдеру, `foundation` `LeaseRecognitionJob`); подписанная ссылка на объект живёт ≤ 15 минут.
Измеряется на РАЗВЁРНУТОМ стенде по журналу, не на этой машине — в этой фиче НЕ ИЗМЕРЕНО (стенда нет).

### NFR-scan-pipeline-2 — фото приватны, 30 дней, presigned (NFR-SEC-001)
Публичной ссылки на фото не существует ни на одном шаге. Объект отдаётся только подписанным URL
владельцу сессии, срок ≤ 15 минут. `expires_on = created_at + 30 дней`; удаление — `PurgeExpiredPhotos`
плюс политика жизненного цикла бакета как второй рубеж (ADR-010).

### NFR-scan-pipeline-3 — 3000 сканов/сутки без деградации времени ответа (NFR-SCALE-001)
Очередь распознавания не удерживает соединение с базой во время вызова внешней модели (см.
NFR-scan-pipeline-1); горизонтальное масштабирование `recognizer` копиями без изменения кода — цену
несёт единственное настоящее узкое место, внешний вызов модели (латентность 2–5 с).

## Критерии приёмки

### AC-scan-pipeline-1 — вход проверяется по содержимому, не по имени
Given файл `plate.jpg`, чьи первые байты НЕ являются сигнатурой JPEG/PNG/WebP/HEIC
When выполняется `POST /api/v1/scans` с этим файлом и валидным `Idempotency-Key`
Then ответ `422` с названной причиной; строка `recognition` не создана, `scan_quota_counter` не
изменён.

### AC-scan-pipeline-2 — decompression bomb отвергается до декодирования
Given изображение, чьи заявленные размеры дают распаковку свыше 100 Мпикс при валидных байтах формата
When выполняется `POST /api/v1/scans`
Then ответ `422`/`413` до попытки декодирования; сервис не падает и не зависает.

### AC-scan-pipeline-3 — превышение размера и формата не списывает квоту
Given фото 13 МБ (сверх 12 МБ) и фото 250×250 px (меньше 320×320)
When выполняется `POST /api/v1/scans` для каждого
Then оба получают отказ с названной причиной; `scan_quota_counter.used` не изменился ни для одного
ключа.

### AC-scan-pipeline-4 — `Idempotency-Key` обязателен
Given запрос `POST /api/v1/scans` без заголовка `Idempotency-Key` либо со значением `not-a-uuid`
When запрос обрабатывается
Then ответ `422`; квота не проверяется и не списывается.

### AC-scan-pipeline-5 — повтор с тем же ключом не создаёт второй оплаченный скан
Given успешный `POST /api/v1/scans` с ключом `K` вернул `scan_id = S`
When тот же запрос повторяется с тем же `Idempotency-Key = K` и той же сессией
Then ответ `202` с ТЕМ ЖЕ `scan_id = S`; `scan_quota_counter.used` не увеличился повторно; вызов
модели не сделан дважды.

### AC-scan-pipeline-6 — конкурентная идемпотентность
Given два одновременных `POST /api/v1/scans` с одним `Idempotency-Key` и одной сессией
When оба запроса стартуют без ожидания друг друга
Then оба получают ОДИН и тот же `scan_id`; в базе ровно одна строка `recognition` с этим ключом;
ровно ОДИН оплаченный вызов модели.

### AC-scan-pipeline-7 — отказ квоты не создаёт задание и называет `scope`
Given `scan_quota_counter` пользователя уже на пределе (`used = limit`)
When выполняется валидный `POST /api/v1/scans`
Then ответ `429` с телом `{ limit, reset_at, scope: 'user' }`; фото НЕ сохранено в бакет; строка
`recognition` переведена в `refused(quota_exhausted_user)`; вызов модели не выполнен.

### AC-scan-pipeline-8 — конкурентный потолок пользователя (20 при пределе 10)
Given предел `N4_SCAN_LIMIT_USER = 10`, одно устройство, ноль попыток за сегодня
When 20 `POST /api/v1/scans` стартуют одновременно с одним общим барьером
Then ровно 10 получают `202`, ровно 10 получают `429(scope=user)`; `scan_quota_counter.used` для
ключа пользователя равен ровно 10; ни одна попытка не потеряна и не посчитана дважды.

### AC-scan-pipeline-9 — нормализация HEIC до вызова модели
Given фото формата HEIC размером 11 МБ, длинной стороной 4032 px
When `recognizer` обрабатывает задание
Then перед вызовом модели создаётся `photo.normalized_object_key` формата JPEG с длинной стороной
≤ 1568 px и размером ≤ 5 МБ; вызов модели выполняется НАД нормализованной копией, оригинал не
изменён.

### AC-scan-pipeline-10 — неудачная нормализация не вызывает модель
Given повреждённый файл, прошедший приёмную валидацию по сигнатуре, но не декодируемый нормализатором
When `recognizer` обрабатывает задание
Then результат `failed(schema_violation)` с названной причиной; ни одного вызова `ModelProvider` не
зафиксировано счётчиком обращений.

### AC-scan-pipeline-11 — диапазоны проверяет код, а не подрезает
Given ответ модели с `confidence = 1,5`, ЛИБО с позицией `mass_g = 6000`, ЛИБО с 13 позициями
(три отдельных прогона)
When `recognizer` разбирает ответ
Then каждый прогон даёт `failed(schema_violation)` с названным полем; значение НЕ подрезается до
границы (`confidence` не становится `1`, `mass_g` не становится `5000`).

### AC-scan-pipeline-12 — граница эскалации 0,59/0,60
Given ответ первичной модели с `confidence = 0,59`, ЗАТЕМ отдельно `confidence = 0,60`
When `recognizer` принимает решение об эскалации
Then при `0,59` выполняется второй вызов модели (эскалация); при `0,60` второй вызов НЕ выполняется;
оба исхода проверяются счётчиком обращений к адаптеру провайдера.

### AC-scan-pipeline-13 — конкурентная эскалация: 20 при остатке 1
Given предел `N4_ESCALATION_LIMIT_DAY` исчерпан до остатка 1, 20 распознаваний одновременно
возвращают `confidence < 0,6`
When все 20 одновременно вызывают `CheckAndConsumeQuota(reason = escalation)`
Then РОВНО один вызов `Sonnet 5` зафиксирован счётчиком обращений к адаптеру провайдера (не текстом
журнала); остальные 19 получают `refused(escalation)` и НЕ вызывают Sonnet 5.

### AC-scan-pipeline-14 — 601-я эскалация не выбрасывает первичный результат (unit, подменённый порт)
Given `MatchIngredientPort`, подменённый тестовым двойником, возвращающим совпадение для каждой
позиции; счётчик эскалации уже на пределе (601-я попытка)
When `recognizer` обрабатывает задание с `confidence < 0,6`
Then второй вызов модели НЕ выполняется; итоговый статус — `done` с `low_confidence = true` и
`failure_reason = quota_exhausted_escalation`, а НЕ `failed` и НЕ `refused`. Тест явно помечен как
доказательство ГОТОВНОСТИ кода к реальному порту, а не сегодняшнего интеграционного поведения
(см. «Стык с `source-and-correct`»).

### AC-scan-pipeline-15 — реальное окружение этой фичи: `done` недостижим, а инвариант ADR-001 держится
Given реальный `NullMatchIngredientPort` (эта фича, `food_item` пуст), модель нашла еду с ЛЮБЫМ
`confidence`
When `recognizer` завершает обработку
Then итоговый статус — `failed(no_food_matched)`; статус `done` НИ РАЗУ не зафиксирован ни на одном
прогоне интеграционного набора этой фичи; страж по исходнику (ADR-001, Confirmation 2) остаётся
зелёным без единого исключения.

### AC-scan-pipeline-16 — провайдер недоступен или таймаут — попытка засчитана, ошибка не проглочена
Given фейковый провайдер настроен на исход `provider_unavailable` (отдельно — `provider_timeout`)
When `recognizer` вызывает `ModelProvider.recognize`
Then результат `failed(provider_unavailable)` / `failed(provider_timeout)`; квота НЕ откатывается —
попытка уже списана на шаге приёма; исключение из вызова не проглатывается функцией-колбэком
транзакции (`security-operation-order.md`).

### AC-scan-pipeline-17 — устаревшая аренда с реальным вызовом провайдера
Given воркер A взял задание, аренда искусственно истекла ПОКА A ожидает ответ фейкового провайдера с
управляемой задержкой; воркер B захватывает то же задание и завершает его первым
When A получает ответ провайдера и пытается записать результат своим (устаревшим) `lease_fence`
Then `UPDATE` от A затрагивает НОЛЬ строк; результат B остаётся нетронутым; в аудите есть запись
`stale_lease_result` с `scan_id`, `fence` A и текущим `fence`. Обе попытки списаны в квоту — это
названная цена fencing (DEC-A-008), а не дефект.

### AC-scan-pipeline-18 — чужой скан недостижим
Given `recognition` принадлежит сессии X
When сессия Y выполняет `GET /api/v1/scans/{id}` этой записи, а также `GET` НЕСУЩЕСТВУЮЩЕГО `id`
Then оба запроса получают ОДИН И ТОТ ЖЕ `404`; тело ответа не позволяет отличить «чужой» от
«не существует».

## Наследуемые сценарии приёмки проекта

Фича продолжает то, что `foundation` закрыла частично, и закрывает СВОИ сценарии полностью либо
частично там, где полное закрытие требует `source-and-correct`.

| Сценарий проекта | Что закрывает `scan-pipeline` | Что остаётся другой фиче |
|---|---|---|
| SC-US-001-1 — первый результат без анкеты и регистрации | приём кадра, квота, нормализация, вызов модели, `202`/`GET` статуса | время ≤ 6 с измеряется на стенде (не в этой фиче); показ калорий/БЖУ — `source-and-correct` |
| SC-US-001-2 — кадр без еды | `refused(no_food_detected)`, запись дневника не создаётся | — (закрыт полностью) |
| SC-US-002-1 — виден источник числа | НЕ закрыт: числа не считаются в этой фиче | `source-and-correct` целиком |
| SC-US-002-2 — «нет в базе» без нуля | частично: `unmatched = true` на КАЖДОЙ позиции через `NullMatchIngredientPort`, но `failed` вместо `done` с частичным покрытием | `source-and-correct`: `done` с частью позиций `unmatched` |
| SC-US-009-1 — отказ по потолку с временем обнуления | `429` со `scope` и `reset_at` | экран лимита как UI — фича `pro-interest-and-limits-ui` |

## Трассировка на документы проекта

| Требование фичи | Источник проекта |
|---|---|
| FR-scan-pipeline-1 | `Specification.md` FR-CAPTURE-002; `.claude/rules/security.md` «Граница входа» |
| FR-scan-pipeline-2 | `Pseudocode.md` `EnqueueScan` шаг 2а; `long-job-contract.md` |
| FR-scan-pipeline-3 | ADR-007; `Pseudocode.md` `CheckAndConsumeQuota`; `foundation` FR-foundation-5 |
| FR-scan-pipeline-4 | `Pseudocode.md` `EnqueueScan` шаги 4–6; ADR-010 |
| FR-scan-pipeline-5 | `Specification.md` FR-CAPTURE-002; `Pseudocode.md` `RecognizeScan` шаг 2а |
| FR-scan-pipeline-6 | ADR-001; `Architecture.md` External Dependencies (Anthropic vision, structured outputs) |
| FR-scan-pipeline-7 | ADR-004, ADR-007; `model-cost-contract.md` |
| FR-scan-pipeline-8 | ADR-001; раздел «Стык с `source-and-correct`» |
| FR-scan-pipeline-9 | `Pseudocode.md` API Contracts маршрут 2; `.claude/rules/security.md` «404, не 403» |
| FR-scan-pipeline-10 | `canon.md` §7; `foundation` FR-foundation-8 |
| FR-scan-pipeline-11 | `Pseudocode.md` `PurgeExpiredPhotos`; ADR-010 |
| FR-scan-pipeline-12 | `model-cost-contract.md`; NFR-OPS-001 |
| FR-scan-pipeline-13 | DEC-A-009; `foundation` `SelectModelProvider` |
| NFR-scan-pipeline-1 | NFR-PERF-001 |
| NFR-scan-pipeline-2 | NFR-SEC-001; ADR-010 |
| NFR-scan-pipeline-3 | NFR-SCALE-001 |
