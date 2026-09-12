**Verdict:** 🟢 READY

# Requirements Testability Analysis
Spec revision: sha256:93e47bcaa853f3badc5896291b5c5e1c432ac258e69f82cc43ea9585f3e9866b

Проект: N4 «Тарелка». Фича: `scan-pipeline`. Валидатор: Phase 2 (Sonnet 5, константа ранбука).
Единица анализа — `FR-scan-pipeline-n` / `NFR-scan-pipeline-n` (формат `sparc-prd-mini` на уровне
фичи: FR/NFR + `AC-scan-pipeline-n`, не отдельные user-story — как и в `foundation`). INVEST применён
к каждому требованию как к негоциируемой единице работы, SMART — к его критериям приёмки.

## Summary

- Требований проанализировано: 16 (13 FR + 3 NFR).
- Критериев приёмки: 18 (`AC-scan-pipeline-1` … `AC-scan-pipeline-18`), все имеют строку в
  `## Criterion scenarios`.
- Средний балл: **93/100**.
- Заблокировано (score < 50 или floor): 0.
- Blocking floor (`Testable`/`Completeness`/`Traceability` = 0): не сработал ни для одного
  требования — все восемнадцать AC поимённо покрыты сценариями `04_refinement.md` §Test Cases,
  дублированными в `05_completion.md` §Criterion coverage.
- Находок: 3 (VS-01 low, VS-02 low, VS-03 low), ни одна не блокирующая.
- Security acceptance criteria: применимо и присутствует специфично (бонус +5).
- Growth traceability: не применимо (+0) — фича не касается ни одного `FR-GROWTH-nnn`; growth здесь
  ограничен переиспользованием `growth_event(type=install)` из `foundation`, не новым обязательством.

## Results

| Требование | Заголовок | Score | INVEST | SMART | Status |
|---|---|---|---|---|---|
| FR-scan-pipeline-1 | Приём фото: валидация по содержимому | 95/100 | 50/50 ✓ | 25/30 | READY |
| FR-scan-pipeline-2 | Заявка ключа повторности атомарным оператором | 100/100 | 50/50 ✓ | 30/30 ✓ | READY |
| FR-scan-pipeline-3 | Квота ДО вызова модели, атомарно | 95/100 | 50/50 ✓ | 25/30 | READY |
| FR-scan-pipeline-4 | Сохранение оригинала и немедленный 202 | 95/100 | 50/50 ✓ | 25/30 | READY |
| FR-scan-pipeline-5 | Нормализация фото ДО вызова модели | 92/100 | 50/50 ✓ | 25/30 | READY |
| FR-scan-pipeline-6 | Вызов модели по схеме, диапазоны — наш код | 95/100 | 50/50 ✓ | 25/30 | READY |
| FR-scan-pipeline-7 | Эскалация к Sonnet 5, четвёртый ключ | 95/100 | 50/50 ✓ | 25/30 | READY |
| FR-scan-pipeline-8 | Итог сопоставления через порт, терминальный статус | 90/100 | 45/50 | 25/30 | READY |
| FR-scan-pipeline-9 | `GET /scans/{id}`: владение и честные поля | 95/100 | 50/50 ✓ | 25/30 | READY |
| FR-scan-pipeline-10 | Двухуровневый лимит частоты | 90/100 | 50/50 ✓ | 20/30 | READY |
| FR-scan-pipeline-11 | `PurgeExpiredPhotos` | 92/100 | 50/50 ✓ | 25/30 | READY |
| FR-scan-pipeline-12 | Наблюдаемость расхода по попыткам | 88/100 | 50/50 ✓ | 20/30 | READY |
| FR-scan-pipeline-13 | `LiveModelProvider`, включение ключом | 90/100 | 50/50 ✓ | 20/30 | READY |
| NFR-scan-pipeline-1 | Результат ≤ 6 с p95 (перф.) | 87/100 | 50/50 ✓ | 20/30 | READY |
| NFR-scan-pipeline-2 | Фото приватны, 30 дней, presigned | 95/100 | 50/50 ✓ | 25/30 | READY |
| NFR-scan-pipeline-3 | 3000 сканов/сутки без деградации | 90/100 | 50/50 ✓ | 20/30 | READY |

**Средний балл: (95+100+95+95+92+95+95+90+95+90+92+88+90+87+95+90)/16 = 1484/16 = 92,75 ≈ 93/100.**

INVEST = 50/50 у пятнадцати требований из шестнадцати: каждое независимо реализуемо поверх каркаса
`foundation` (Independent — раздел «Цель»: атомарный модуль квоты, аренда и `ModelProvider`
«здесь только ВЫЗЫВАЮТСЯ, а не переписываются»), не диктует внутреннюю реализацию сверх названного
контракта (Negotiable), имеет явную ценность как первый платный путь продукта (Valuable), оценимо и
ограничено по объёму одним алгоритмом или узким механизмом (Estimable, Small), и имеет проверяемые
`AC-scan-pipeline-n` (Testable). Единственное исключение — **FR-scan-pipeline-8 (45/50)**: `Small`
начислен 6/8, а не 8/8, потому что требование единовременно несёт три разных обязательства
(интерфейс `MatchIngredientPort`, терминальный статус `failed(no_food_matched)` для реального
`NullMatchIngredientPort`, И согласованность с ADR-001) — см. Detailed Analysis ниже; ни одно из трёх
не тривиально по отдельности, но связаны они одним требованием, а не тремя.

SMART < 30 в двенадцати случаях: `Time-bound` начислен не везде (см. таблицу по требованиям), а
`Specific`/`Measurable` снижены там, где число есть, но не привязано к переменной окружения (частота,
FR-scan-pipeline-10) или измерение явно отложено на развёрнутый стенд (NFR-scan-pipeline-1/3,
FR-scan-pipeline-12). Это не дефекты фичи — они унаследованы от одного и того же факта: фичи `foundation`
и `scan-pipeline` реализуются ДО существования стенда, и NFR-PERF-001/OPS-001 честно помечены
«не измерено» (`05_completion.md` §«Что эта фича НЕ доказывает»), как и в `foundation`.

## Criterion scenarios

| Criterion | Scenario |
|-----------|----------|
| AC-scan-pipeline-1 | Файл `.jpg` с байтами не JPEG/PNG/WebP/HEIC отвергается 422 до квоты и до записи (`tests/integration/routes/scans-validate.test.ts`) |
| AC-scan-pipeline-2 | Decompression bomb (>100 Мпикс по метаданным) отвергается до декодирования (`tests/unit/photo/decompression-bomb.test.ts`) |
| AC-scan-pipeline-3 | Фото 13 МБ и фото 250×250 px отвергаются без списания квоты, каждое своим кодом (`tests/integration/routes/scans-validate.test.ts`) |
| AC-scan-pipeline-4 | Отсутствующий либо непригодный `Idempotency-Key` даёт 422 до квоты (`tests/integration/routes/scans-idempotency.test.ts`) |
| AC-scan-pipeline-5 | Повтор с тем же ключом и сессией возвращает тот же `scan_id` без повторного списания (`tests/integration/routes/scans-idempotency.test.ts`) |
| AC-scan-pipeline-6 | Два одновременных запроса с одним ключом создают ровно одну строку `recognition` (`tests/concurrency/routes/scans-idempotency-parallel.test.ts`) |
| AC-scan-pipeline-7 | Отказ квоты называет `scope=user`, не сохраняет фото, не создаёт задание (`tests/integration/routes/scans-quota.test.ts`) |
| AC-scan-pipeline-8 | 20 параллельных запросов при пределе 10 дают ровно 10×202 и 10×429(scope=user) (`tests/concurrency/routes/scans-quota-parallel.test.ts`) |
| AC-scan-pipeline-9 | HEIC 11 МБ/4032px нормализуется в JPEG ≤1568px ≤5МБ ДО вызова модели, оригинал не изменён (`tests/integration/photo/normalize-heic.test.ts`) |
| AC-scan-pipeline-10 | Неудачная нормализация даёт `failed(schema_violation)`, ноль вызовов `ModelProvider` (`tests/integration/photo/normalize-failure.test.ts`) |
| AC-scan-pipeline-11 | `confidence=1,5` / `mass_g=6000` / 13 позиций — каждый прогон даёт `failed(schema_violation)` без подрезания (`tests/unit/recognize/validate-ranges.test.ts`) |
| AC-scan-pipeline-12 | Граница эскалации: `0,59` вызывает второй вызов, `0,60` — нет, по счётчику адаптера (`tests/unit/recognize/escalate.test.ts`) |
| AC-scan-pipeline-13 | 20 одновременных эскалаций при остатке 1 дают ровно ОДИН вызов Sonnet 5 (`tests/concurrency/recognize/escalation-parallel.test.ts`) |
| AC-scan-pipeline-14 | Исчерпанная эскалационная квота (unit, `FixedMatchIngredientPort`): `done`+`low_confidence`+`failure_reason=quota_exhausted_escalation`, не `failed`/`refused` (`tests/unit/recognize/escalate-exhausted.test.ts`) |
| AC-scan-pipeline-15 | Реальный `NullMatchIngredientPort`: `failed(no_food_matched)` всегда, `done` не встречается ни разу (`tests/integration/recognize/null-match-port.test.ts`) |
| AC-scan-pipeline-16 | Провайдер недоступен/таймаут — `failed(provider_unavailable)`/`failed(provider_timeout)`, попытка не откатывается (`tests/integration/provider/anthropic-failure.test.ts`) |
| AC-scan-pipeline-17 | Устаревший `lease_fence` под реальной задержкой провайдера: `UPDATE` затрагивает 0 строк, `stale_lease_result` в аудите (`tests/concurrency/recognize/stale-lease-real-delay.test.ts`) |
| AC-scan-pipeline-18 | Чужой и несуществующий `scan_id` дают один и тот же 404 (`tests/integration/routes/scans-ownership.test.ts`) |

Источник сценариев — дословные заголовки-планы из `04_refinement.md` §«Test Cases», продублированные
в `05_completion.md` §«Criterion coverage»; оба документа помечают их ПЛАНОВЫМИ до Phase 3 — ворота
`--completion` откроют файл и сверят заголовок дословно только тогда.

## Detailed Analysis: FR-scan-pipeline-8 (итог сопоставления через порт) — 90/100

### INVEST Analysis

| Criterion | Pass | Issue |
|-----------|------|-------|
| Independent | ✓ | Порт `MatchIngredientPort` — новая точка расширения, не зависит от `source-and-correct` для своей сборки |
| Negotiable | ✓ | Реализация `NullMatchIngredientPort` названа, но детали алгоритма матчинга — не предмет этого FR |
| Valuable | ✓ | Защищает принятый и протестированный ADR-001 Confirmation (2), а не вводит риск |
| Estimable | ✓ | Один модуль (`match/null-port.ts`) плюс интерфейс |
| Small | ~ (6/8) | Требование одновременно закрывает интерфейс, терминальный статус реального порта и согласованность с ADR-001 — три сцепленных обязательства в одном FR (см. ниже) |
| Testable | ✓ | `AC-scan-pipeline-14` (unit, подменённый порт) и `AC-scan-pipeline-15` (integration, реальный порт) дают два разных, не смешиваемых доказательства |

### SMART Analysis (AC-scan-pipeline-14, AC-scan-pipeline-15)

Цитата (`01_specification.md:290–305`):
> «AC-scan-pipeline-14 … Given `MatchIngredientPort`, подменённый тестовым двойником … счётчик
> эскалации уже на пределе (601-я попытка) … Then второй вызов модели НЕ выполняется; итоговый
> статус — `done` с `low_confidence = true` и `failure_reason = quota_exhausted_escalation`, а НЕ
> `failed` и НЕ `refused`.»
> «AC-scan-pipeline-15 … Given реальный `NullMatchIngredientPort` … модель нашла еду с ЛЮБЫМ
> `confidence` … Then итоговый статус — `failed(no_food_matched)`; статус `done` НИ РАЗУ не
> зафиксирован ни на одном прогоне интеграционного набора этой фичи; страж по исходнику (ADR-001,
> Confirmation 2) остаётся зелёным без единого исключения.»

| Criterion | Pass | Issue |
|-----------|------|-------|
| Specific | ✓ | Двойник назван по имени (`FixedMatchIngredientPort`/реальный `NullMatchIngredientPort`), поля и значения перечислены буквально |
| Measurable | ✓ | Терминальный статус и `failure_reason` — точные литералы, не диапазон |
| Achievable | ✓ | Оба прогона проверяют один и тот же код с разной подменой зависимости — стандартный паттерн внедрения |
| Relevant | ✓ | Напрямую защищает инвариант ADR-001, названный в разделе «Стык с `source-and-correct`» |
| Time-bound | ✗ | Нет временной границы (не применимо к терминальному статусу без временного условия) |

### Обоснование понижения `Small`

`01_specification.md:151–159` (FR-scan-pipeline-8) вводит интерфейс `MatchIngredientPort`,
ФИКСИРУЕТ терминальный статус `failed(no_food_matched)` для реального `NullMatchIngredientPort`,
И одновременно несёт обязательство «условная запись по `lease_fence`» (переиспользование
`foundation`). Это не completeness-пробел — все три части специфицированы, протестированы
(AC-14/15/17) и трассированы порознь в `02_pseudocode.md` (шаги 7–8 `RecognizeScanWithinScanPipeline`)
— а именно AC-14/15/17 покрывают три РАЗНЫХ аспекта одного FR, что и есть определение «требование
крупнее одного узкого механизма» по критерию Small. Понижение не блокирует и не снижает балл ниже
порога READY (90/100), но отличает эту фичу от `foundation`, где каждый FR закрывался максимум
двумя AC.

## Security acceptance criteria

Фича вводит первый платный вызов внешней модели, приём файла от посетителя и приватное хранилище —
применимо целиком.

| Criterion | Статус | Evidence |
|-----------|--------|----------|
| Input Validation | Присутствует, специфично | `FR-scan-pipeline-1`: тип по байтам, полиглот отвергается, decompression-bomb ДО декодирования (`AC-scan-pipeline-1/2`); диапазоны ответа модели — код после разбора, без подрезания (`FR-scan-pipeline-6`, `AC-scan-pipeline-11`) |
| Authentication | Присутствует, специфично, наследуется | Маршруты требуют `n4_session` (`foundation`, `02_pseudocode.md` API Contracts: `Response 401: нет сессии`); фича не переопределяет механизм |
| Authorization | Присутствует, специфично | `FR-scan-pipeline-9`: владение по серверному `owner_key`, чужой и несуществующий `id` — ОДИН `404` (`AC-scan-pipeline-18`), соответствует `.claude/rules/security.md` «404, не 403» |
| Data Protection | Присутствует, специфично | `NFR-scan-pipeline-2`: приватный бакет, presigned ≤15 минут, EXIF-strip при нормализации (не на приёме — оригинал нетронут, ADR-010), `PurgeExpiredPhotos` через 30 дней |
| Multi-Tenant Isolation | Не применимо | Фича не вводит multi-tenant модель (аноним по `device_session_id`, как и `foundation`) |
| Secret Management | Присутствует, специфично | `ANTHROPIC_API_KEY` используется ТОЛЬКО в `recognizer` (`FR-scan-pipeline-13`, «Границы, которые фича обязана сохранить» в `03_architecture.md`); ключа модели, полного адреса и содержимого фото в журнал `model_call` не попадает (переиспользование редактора `foundation`) |
| Webhook Security | Не применимо | Фича не принимает вебхуков |

**Бонус:** +5 (шесть из шести применимых категорий присутствуют специфично, ни одна не отсутствует —
штраф −10 не применяется).

**Порядок операций (`security-operation-order.md`) воспроизведён верно и без исключений:**
частота ДО разбора тела (`RateLimitScanRoutes` шаг 1–2) → валидация содержимого (шаги 2–4
`EnqueueScanForFeature`) → заявка идемпотентности (шаг 5) → квота (шаг 6) → сохранение фото (шаг 7);
на стороне `recognizer` — нормализация ДО вызова модели (`RecognizeScanWithinScanPipeline` шаг 2 до
шага 3) и эскалация ДО Sonnet 5 (шаг 6 вызывает `CheckAndConsumeQuota` прежде второго обращения к
провайдеру). Недоступность провайдера — `failed(provider_unavailable|provider_timeout)`, попытка не
откатывается (`AC-scan-pipeline-16`) — соответствует правилу «недоступность источника истины —
исключение, а не возвращаемое значение, коммитящее частичное состояние» ровно в той форме, для
которой это правило и писалось.

## Growth traceability

Не применимо (+0). Фича переиспользует `growth_event(type = install)` из `foundation`
(`FR-scan-pipeline-4` шаг 9 псевдокода) как ЧУЖОЕ обязательство, уже отвеченное в `foundation`, а не
вводит новый `FR-GROWTH-nnn`. Ни один growth-идентификатор проекта не относится к `scan-pipeline` —
`activation`, `share_click`, `card_view`, `code_applied` объявлены вне объёма явно (раздел «Объём» →
«Вне объёма»).

## Проверено без замечаний

- Все 18 `AC-scan-pipeline-n` имеют строку в `## Criterion scenarios` (Traceability floor не сработал
  ни разу); те же 18 строк дословно повторены в `05_completion.md` (плановая таблица, честно
  помеченная как таковая).
- `refused(no_food_detected)` ПОСЛЕ оплаченного вызова модели — НЕ дефект: это точное совпадение с
  канонической формулировкой проекта `docs/Specification.md` FR-RECOGNIZE-001 («Кадр без
  распознаваемой еды завершается статусом `refused`»), установленной ДО этой фичи. Отдельно от него
  — терминальный статус `failed(no_food_matched)` для «еда есть, но не сопоставлена с базой»
  (`FR-scan-pipeline-8`) — другой сценарий с другим статусом, зафиксированным решением DEC-A-014
  («до фичи `source-and-correct` исход `failed(no_food_matched)`… `refused` остаётся только за
  квотой» — формулировка DEC-A-014 неточна буквально, поскольку `refused` также легитимно занят
  `no_food_detected` по канону FR-RECOGNIZE-001, но применительно к предмету самого решения — новому
  статусу `no_food_matched` — вывод верен: `failed`, не `refused`). Оба статуса, `refused` и `failed`,
  используются в этой фиче ровно так, как определяет канон, без смешения.
- Закрытый список `recognition.status` (4 значения) НЕ расширен; закрытый список `failure_reason`
  фичи (`quota_exhausted_user`, `quota_exhausted_global`, `quota_exhausted_escalation`,
  `schema_violation`, `provider_unavailable`, `provider_timeout`, `no_food_detected`,
  `no_food_matched`) — подмножество восьмизначного перечисления `docs/Pseudocode.md:32`, новых
  значений фича не вводит.
- «Стык с `source-and-correct»`: расхождение с буквальным брифом названо явно, обосновано ссылкой на
  защищённый тестом инвариант ADR-001 Confirmation (2), и решение УЖЕ зафиксировано координатором в
  автономном режиме (`docs/decisions-autonomous.md` DEC-A-014, под общим разрешением DEC-A-001/
  DEC-A-011) — формальное требование раздела «подтверждает на чекпойнте» удовлетворено записью в
  журнале решений, а не оставлено открытым вопросом.
- Идемпотентность специфицирована ПОЛНОСТЬЮ, включая противоположный случай: тот же ключ + ДРУГАЯ
  сессия создаёт ВТОРОЙ независимый скан (`04_refinement.md` Edge Cases Matrix, строка 4;
  `UNIQUE (device_session_id, idempotency_key)`, не `UNIQUE (idempotency_key)`), а не только «тот же
  ключ + та же сессия → тот же scan_id».
- Нормализация ДО вызова модели, диапазоны — код после разбора: обе пары `security-operation-order.md`
  соблюдены и снабжены стражами по исходнику с внедряемым дефектом (`04_refinement.md`
  §«Стражи по исходнику»), включая испытание на «поменять шаги местами» — соответствует
  `guard-must-be-able-to-fail.md`.
- Обязательные конкурентные тесты названы явно, отделены от последовательных и друг от друга:
  идемпотентность (AC-6), квота `primary` (AC-8), эскалация — ОТДЕЛЬНО, четвёртый ключ (AC-13),
  устаревшая аренда ПОД РЕАЛЬНОЙ (управляемой) задержкой провайдера, а не последовательным
  допущением (AC-17) — соответствует `shared-resource-verification.md` и проектному `testing.md`.
- Отказ квоты корректно НЕ сохраняет фото и НЕ создаёт задание очереди (`AC-scan-pipeline-7`,
  `02_pseudocode.md` шаг 6: «Фото на этом шаге ещё НЕ сохранено») — вызов модели не оплачивается там,
  где он не был разрешён.
- Контракт стыка `MatchIngredientPort` / `NullMatchIngredientPort` (DEC-A-014) реализуем: интерфейс
  односторонний (`match(item): Promise<{…} | null>`), тестовый двойник `FixedMatchIngredientPort`
  назван и ограничен unit-тестом эскалации, реальная реализация проекта `source-and-correct` заменяет
  ТОЛЬКО реализацию за портом — контракт не меняется (`02_pseudocode.md` Data Structures).
- External Dependencies: строка MinIO presigned явно и честно понижена до вторичного источника
  (DeepWiki по исходнику `minio-js`, а не страница вендора, вернувшая `404` при проверке
  2026-09-12) с named-обоснованием по `honest-configuration.md` CFG-I4 — вердикт не подставлен
  молча и не выдан за полноценный CONFIRMED без оговорки (см. VS-01 ниже — оговорка есть, но
  расположена как единственная строка таблицы такого рода, что стоит разметить нагляднее).
- `web` не получает секретов в этой фиче — не введено ни одной ссылки на `ANTHROPIC_API_KEY` или
  `TELEGRAM_BOT_TOKEN` вне `recognizer`/`api` (сверено чтением `03_architecture.md` таблицы
  размещения и «Границы, которые фича обязана сохранить»).
- `docker compose`/переменные окружения: фича НЕ добавляет ни одной новой переменной — явно названо
  и сверено с `secrets-management.md` проекта (`S3_*`, `N4_MODEL_PROVIDER`, `ANTHROPIC_API_KEY`,
  три потолка квоты уже объявлены `foundation`).

## Findings

**VS-01 (low).** `03_architecture.md:85` (External Dependencies, строка MinIO) несёт вердикт
`CONFIRMED — способность существует и синтаксис назван, ИСТОЧНИК ВТОРИЧНЫЙ`, тогда как все восемь
строк `docs/Architecture.md` (проектный уровень) и остальные две строки этой же таблицы фичи
используют голый `CONFIRMED` с прямой цитатой страницы вендора. Смешение в одной колонке значения
«подтверждено первоисточником» и «подтверждено вторичным источником, вердикт снижен» под ОДНИМ и тем
же токеном `CONFIRMED` — пусть и с честной оговоркой текстом внутри той же ячейки и отдельным
абзацем-предупреждением сразу под таблицей — создаёт риск, что при беглом чтении таблицы (например,
grep по `CONFIRMED`) эта строка будет прочитана как эквивалентная первоисточникам. Дефекта в
фактическом решении нет: срок 900 с строго внутри окна 1…604800 с, деградация до вторичного
источника обоснована честно и по CFG-I4. **Исправление (необязательное, completeness):** ввести
отдельный токен вердикта (например, `CONFIRMED (secondary)`) для этой одной строки, либо оставить
как есть — это ЗАМЕЧАНИЕ низкой критичности, не блокер.

**VS-02 (low).** `01_specification.md:222–226` (`AC-scan-pipeline-3`) объединяет два разных нарушения
(«фото 13 МБ» и «фото 250×250 px») в одном Given/Then и говорит «оба получают отказ с названной
причиной», не называя явно, какой код возврата (413 или 422) соответствует какому нарушению —
хотя `02_pseudocode.md` шаг 4 и API Contracts различают `413 | 422` по природе нарушения (размер
файла vs разрешение). `04_refinement.md` Test Cases не восполняет разрыв: заголовок теста
(«отвергает фото сверх двенадцати мегабайт и меньше трёхсот двадцати пикселей без списания квоты»)
тоже не называет коды раздельно. **Исправление:** явно сопоставить в `AC-scan-pipeline-3` — превышение
размера файла → `413`, недостаточное разрешение → `422` (или наоборот, если решение иное) — прежде
Phase 3, чтобы тест не изобретал сопоставление сам.

**VS-03 (low, вне фичи, но затрагивает проверяемое здесь утверждение).** Заявление «статусы канона
не расширены» опирается на закрытый список `failure_reason` в `docs/Pseudocode.md:32` (восемь
значений), но `docs/Architecture.md:155` описывает ТУ ЖЕ колонку как «enum из 6 значений» — расхождение
в count на уровне ПРОЕКТНЫХ документов, предшествующее этой фиче и не введённое ею. `scan-pipeline`
использует ровно те восемь значений `Pseudocode.md`, и это проверено выше построчно, поэтому находка
не блокирует эту фичу — но проверяющий Phase 3/4 не должен принимать «6» из `Architecture.md` за
актуальный count при проверке стража на «список не расширен»: он устарел относительно `Pseudocode.md`.
Исправление — задача владельца канона (`docs/Architecture.md`), не этой фичи.

---

**Валидатор:** Sonnet 5 (роль Phase 2, ранбук `docs/feature-runbook.md`). Бюджет: ≤ 30 минут.
