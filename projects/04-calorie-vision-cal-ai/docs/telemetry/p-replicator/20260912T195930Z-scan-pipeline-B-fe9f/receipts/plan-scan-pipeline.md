# Квитанция — plan-scan-pipeline (Phase 1 PLAN, плечо B)

RUN_ID: 20260912T195930Z-scan-pipeline-B-fe9f
WORK_UNIT_ID: plan-scan-pipeline
Плечо: B (заявлено координатором как claude-sonnet-5)
requested: claude-sonnet-5; actual: unknown to worker (модель исполнения подтверждается метаданными
запуска, не текстом задания)

## Что сделано

Прочитаны и применены (без правки чужих файлов): `docs/feature-runbook.md`,
`.claude/feature-roadmap.json` (фича `scan-pipeline`), `docs/canon.md`, `docs/Specification.md`
(FR-CAPTURE-002, FR-RECOGNIZE-001/002, FR-LIMIT-001/002, FR-SOURCE-001 частично, NFR-PERF-001,
NFR-SEC-001, SC-US-001-1/2, SC-US-002-1/2, SC-US-009-1), `docs/Pseudocode.md` (`EnqueueScan`,
`RecognizeScan`, `CheckAndConsumeQuota`, `PurgeExpiredPhotos`, API Contracts маршрутов 1–2),
`docs/Architecture.md` (External Dependencies, Data Architecture, Component Breakdown),
`docs/ADR.md` (ADR-001, ADR-003, ADR-004, ADR-007, ADR-010), `docs/model-cost-contract.md`,
`docs/long-job-contract.md`, `docs/Refinement.md`, `docs/test-scenarios.md`,
`docs/features/foundation/02_pseudocode.md` и `03_architecture.md` целиком, `.claude/agents/planner.md`,
`.claude/rules/{coding-style,security,secrets-management,testing}.md`,
`../../.claude/rules/{model-call-cost,long-running-job,security-operation-order,honest-configuration}.md`,
`../../.claude/commands/feature.md` (DOCUMENT_ROLE_MAP), `../../.claude/skills/requirements-validator/references/feature-report-contracts.md`,
`../../.claude/skills/sparc-prd-mini/SKILL.md` (строки 76–100 wire-format, 254–316 Phase 4 Scenario
Coverage).

Написаны пять документов `docs/features/scan-pipeline/{01_specification,02_pseudocode,
03_architecture,04_refinement,05_completion}.md` (1016 строк суммарно). Ни один файл вне
`docs/features/scan-pipeline/` и этой квитанции не создан и не изменён; файлы `foundation` не тронуты.

### Решение, требующее подтверждения координатора

Бриф фичи описывал стык с `source-and-correct` формулировкой «результат `done` содержит `items` с
`food_item_id: null`». Это противоречит ADR-001 Confirmation (2) («`recognition` без единой ссылки
на `food_item` не может получить статус `done`»), защищённому тестом на внедрённом дефекте. Вместо
буквального прочтения (что фактически отменило бы принятое, испытанное решение ADR) в
`01_specification.md` записан порт `MatchIngredientPort` с реализацией `NullMatchIngredientPort`:
в реальном окружении ЭТОЙ фичи `done` НЕДОСТИЖИМ, любой распознанный кадр завершается
`refused(no_food_matched)`; логика эскалации/`low_confidence`/`failure_reason` доказана ОТДЕЛЬНЫМ
unit-тестом с подменённым портом (AC-scan-pipeline-14), а не сквозным прогоном. Полное обоснование —
`01_specification.md`, раздел «Стык с `source-and-correct`». **Это расхождение с буквальной
формулировкой брифа сделано осознанно ради сохранения ADR-001 и требует явного «ок» либо
контрраспоряжения координатора на чекпойнте Phase 1.**

MinIO presigned URL (маршрут 1, шаг сохранения оригинала) — первоисточник
`min.io/docs/minio/linux/developers/javascript/API.html` вернул `404` при проверке 2026-09-12
(четыре попытки, разные пути и зеркала, все ответили `404` либо усечённым JS-рендером). Способность
подтверждена ВТОРИЧНЫМ источником (DeepWiki по исходнику `minio/minio-js`, дословная цитата в
`03_architecture.md`), вердикт помечен `CONFIRMED — источник вторичный`, а не `CONFIRMED`
безусловно; расхождение с обычным форматом таблицы (остальные 8 строк проекта — первоисточник)
названо явно в тексте, а не скрыто.

## FR/AC/алгоритмы

- FR: `FR-scan-pipeline-1`…`FR-scan-pipeline-13` (13), `NFR-scan-pipeline-1`…`-3` (3).
- AC: `AC-scan-pipeline-1`…`AC-scan-pipeline-18` (**18**).
- Алгоритмы `02_pseudocode.md`: `EnqueueScanForFeature`, `GetScanStatus`, `NormalizePhotoForModel`,
  `RecognizeScanWithinScanPipeline`, `RateLimitScanRoutes`, `PurgeExpiredPhotos` (6); все REQUIREMENT-
  ключи (FR+NFR+AC, 34 штуки) закрыты, дубликатов нет (см. ворота ниже).
- `## Scenario Coverage`: 5 сценариев в спецификации, 4 заявлены алгоритмом, 1 (`SC-US-002-1`) —
  `out-of-mvp-scope` (закрывает целиком `source-and-correct`).

## Ворота

Команда:
```
bash /root/.npm/_npx/ac10dded1a3b4a50/node_modules/@dzhechkov/p-replicator/scripts/check-pipeline-gaps.sh . --traceability --role-map-source ../../.claude/commands/feature.md --project-role-map-source ../../.claude/skills/sparc-prd-mini/SKILL.md
```
Первый прогон: `FAIL` (gaps=19 — 18 непроверенных AC-ключей плюс дублированный `FR-scan-pipeline-10`
в двух алгоритмах). Исправлено: добавлены `REQUIREMENT: AC-scan-pipeline-N` во все шесть алгоритмов,
дубликат `FR-scan-pipeline-10` убран из `EnqueueScanForFeature` (остался только в
`RateLimitScanRoutes`, который его реализует).

Второй прогон:
```
TRACE contour=scan-pipeline specification=./docs/features/scan-pipeline/01_specification.md pseudocode=./docs/features/scan-pipeline/02_pseudocode.md
COUNT requirements=34 algorithms=34 missing-algorithm=0 orphan-algorithm=0
PASS contour=scan-pipeline bidirectional traceability complete
VERDICT traceability=PASS features=2 gaps=0 inconclusive=0
```
Контур `foundation` при этом остался PASS (28/28) — файлы `foundation` не тронуты. Итоговый код
возврата: `0`.

## Что осталось непроверенным (и почему)

- Живой вызов Anthropic (`LiveModelProvider`) не проверялся — кода ещё нет, это план Phase 1, а не
  реализация; в Phase 3 живой режим и вовсе не смокится (ключа на машине нет, DEC-A-009).
- MinIO presigned URL подтверждён вторичным источником, не первоисточником (см. выше) — риск назван,
  не устранён; повторная проверка первоисточника — задача Phase 3 или отдельная задача документации.
- Конкурентные и unit-тесты, названные в `04_refinement.md`/`05_completion.md`, — ПЛАН, ни один файл
  теста не существует; это ожидаемо для Phase 1.

## Попытка 2 — правка по DEC-A-014 (координатор)

Координатор принял порт `MatchIngredientPort`/`NullMatchIngredientPort` (сохраняет ADR-001), но
поправил ОДНУ деталь: промежуточный исход «нет совпадения в базе» в этой фиче — статус `failed` с
`failure_reason = no_food_matched`, а НЕ `refused`. Обоснование координатора: по канону `refused`
зарезервирован за отказом ДО вызова модели (квота/лимит), `failed` — за обработкой, которая ВЫЗВАЛА
модель и не дала результата (попытка оплачена и учтена). В этой фиче матчинг всегда пуст
(`NullMatchIngredientPort`), значит попытка ВСЕГДА была оплачена и обработана — это `failed`, а не
отказ до вызова.

Правки: заменено `refused(no_food_matched)` → `failed(no_food_matched)` во всех местах, где статус
относится к ЭТОЙ фиче (`01_specification.md` — раздел «Стык», FR-scan-pipeline-8,
AC-scan-pipeline-15, таблица «Наследуемые сценарии»; `02_pseudocode.md` — шаг 7
`RecognizeScanWithinScanPipeline`, State Transitions (`refused_no_match` → `failed_no_match`),
Error Handling Strategy; `04_refinement.md` — строка 601-й эскалации, страж ADR-001-статус, заголовок
теста AC-scan-pipeline-15; `05_completion.md` — тот же заголовок теста дословно, раздел «Что фича НЕ
доказывает», таблица `Criterion coverage`). `refused(escalation)` (AC-scan-pipeline-13, отказ квоты
ДО вызова модели) и `refused(no_food_detected)` (модель не нашла еды — тоже ДО матчинга, терминально
на шаге 5) НЕ тронуты: они остаются `refused` по тому же критерию координатора («до вызова» либо
«вызов сделан, но результат не сформирован» — `no_food_detected` это прямой ответ модели, а не
обработка после неё, и здесь сохранена буквальная формулировка project-level Pseudocode.md шаг 4,
который координатор не менял).

Ворота, повторный прогон после правки:
```
TRACE contour=scan-pipeline specification=./docs/features/scan-pipeline/01_specification.md pseudocode=./docs/features/scan-pipeline/02_pseudocode.md
COUNT requirements=34 algorithms=34 missing-algorithm=0 orphan-algorithm=0
PASS contour=scan-pipeline bidirectional traceability complete
VERDICT traceability=PASS features=2 gaps=0 inconclusive=0
```
Заголовки тестов AC-scan-pipeline-15 сверены на дословное совпадение между `04_refinement.md` и
`05_completion.md` (обе несут «даёт failed no_food_matched и статус done не встречается»).

## Попытка 3 — закрытие PC-01…PC-09 (challenge Codex Astra, DEC-A-015)

Прочитан `docs/features/scan-pipeline/plan-challenge.md` целиком (verdict STOP, 9 находок:
PC-01/PC-02 blocker, PC-03…PC-08 high, PC-09 medium). Все девять закрыты в 01/02/04/05 по решениям
координатора DEC-A-015, перечисленным в задании. Изменения по каждой находке:

- **PC-02 (blocker, атомарная публикация).** Объект теперь загружается в MinIO ДО любой транзакции
  БД, по детерминированному ключу `sha256(содержимое)+session` (повтор не создаёт орфанов); ОДНА
  короткая транзакция вставляет `photo`+`recognition` (с уже установленным `photo_id`) и списывает
  квоту `primary`; отказ квоты откатывает ВСЮ транзакцию (не переводит в `refused` — строки не
  существовало). Новый `FR-scan-pipeline-14`, переписан `EnqueueScanForFeature` целиком, новые
  AC-19/20.
- **PC-01 (blocker, повтор после истечения аренды).** Каждый захват с `lease_fence ≥ 2` списывает
  ЕЩЁ ОДНУ попытку `primary` ДО вызова модели; `maxRetries: 0` у SDK, дедлайн запроса 25 с. Новый
  `FR-scan-pipeline-15`, шаг 2 `RecognizeScanWithinScanPipeline`, новый AC-21.
- **PC-03 (дедлайны).** `lease_fence ≤ 3` (зависимость от `foundation`, названа явно, не внесена
  сюда); новый алгоритм `SweepStuckScans` — три правила (5 мин без захвата, `fence=3` неуловимо, 30 с
  приближение по `created_at` — колонки `first_leased_at` в каноне нет и она не добавлена). Гонка
  sweeper/воркер закрыта общим условием `status = 'queued'` в ОБОИХ операторах записи. Новый
  `FR-scan-pipeline-16`, новые AC-22/23.
- **PC-04 (декодируемость).** Новый шаг в `EnqueueScanForFeature`: `sharp(buffer, {
  limitInputPixels: 50e6 }).metadata()` + декодирование одной страницы, ДО загрузки объекта, ДО
  идемпотентности, ДО квоты. Новый `FR-scan-pipeline-17`, новый AC-24.
- **PC-05 (EXIF/кадры).** `rotate()` ДО `withMetadata(false)`; `{ pages: 1 }` явно; нормализатор
  принимает ПОДТВЕРЖДЁННЫЙ `photo.mime`, не «заявленный»; полиглот-проверка обобщена на все четыре
  формата (не только JPEG EOI). Правка `FR-scan-pipeline-5` и `NormalizePhotoForModel`, новый AC-25.
- **PC-06 (сутки).** `day` вычисляется в МОМЕНТ каждой попытки (`POST`, повторный захват, эскалация)
  — не наследуется. Новый `FR-scan-pipeline-18`, новый AC-26.
- **PC-07 (наблюдаемость).** `model_call` — теперь ДВА события (`START` синхронно перед вызовом,
  `OUTCOME` после) с полным набором полей координатора (`request_id, scan_id, fence, reason, model,
  mode, outcome, ms, day, tokens?`); агрегатор `scripts/telemetry/model-calls.sh` и служебная
  страница — план, явно вне недели. Правка `FR-scan-pipeline-12`, новый AC-27.
- **PC-08 (стык).** `MatchIngredientPort.match(items[]) → matches[]` — пакетный вызов, запись с
  `parts[]` для составных блюд; контрактный тест отделён от поведенческого теста
  `NullMatchIngredientPort`; страж ADR-001-статус в `04_refinement.md` переписан — мутирует УСЛОВИЕ
  записи (запрет `done` при нуле совпадений), а не подменяет реализацию порта, как было в Попытке 1
  (это и была находка PC-08 — подмена порта сама по себе не мутирует инвариант). Явно названо и НЕ
  скрыто: `failed(no_food_matched)` этой фичи (DEC-A-014) и `refused(no_food_matched)` root ADR-001
  Confirmation (2) — про РАЗНЫЕ по природе события (заглушка вместо поиска против генуинного нуля
  совпадений), сойдутся, когда `source-and-correct` подставит реальный порт. Правка `FR-scan-pipeline-8`,
  новый AC-28.
- **PC-09 (эскалация).** `ModelProvider.recognize(image, schema, { model, deadlineMs })` — модель
  передаётся вызывающим явно; фейк возвращает `model` в ответе для транспортного контрактного теста.
  Правка `FR-scan-pipeline-6`/`-13`, новый AC-29.

**Две зависимости от `foundation`, названные явно и НЕ внесённые этой квитанцией** (правка чужого
файла — не мой WORK_UNIT): предикат выборки `photo_id IS NOT NULL AND lease_fence < 3`, и расширение
сигнатуры `ModelProvider.recognize` третьим параметром. Обе описаны в `03_architecture.md`, раздел
«Зависимости от `foundation`, требующие правки», с названным резервным путём (локальная обёртка в
этой фиче), если координатор их в `foundation` не перенесёт.

**Уникальность FR/AC проверена:** 18 FR (`-1`…`-18`, было 13, добавлены `-14`…`-18`), 3 NFR
(без изменений), 29 AC (`-1`…`-29`, было 18, добавлены `-19`…`-29`) — все заголовки уникальны
(`grep` по `### (FR|NFR|AC)-scan-pipeline-N`, ноль дублей). Один REQUIREMENT-дубль
(`FR-scan-pipeline-18`, claimed изначально в двух алгоритмах) обнаружен и убран из
`EnqueueScanForFeature` (оставлен в `RecognizeScanWithinScanPipeline`, где живёт AC-26).

Ворота:
```
bash …/check-pipeline-gaps.sh . --traceability --role-map-source ../../.claude/commands/feature.md --project-role-map-source ../../.claude/skills/sparc-prd-mini/SKILL.md
```
Контур `scan-pipeline`: `COUNT requirements=50 algorithms=50 missing-algorithm=0 orphan-algorithm=0` →
`PASS contour=scan-pipeline bidirectional traceability complete`. **Общий код возврата скрипта — `1`,
а общий `VERDICT traceability=FAIL`** — ИСКЛЮЧИТЕЛЬНО из-за находки в ЧУЖОМ контуре
`consent-and-telegram-auth` (`DUPLICATE consent-and-telegram-auth pseudocode AC-consent-and-telegram-auth-5`
и `FR-consent-and-telegram-auth-3`), который пишет другой агент параллельно — не тронут этой
квитанцией (владение файлами, `swarm-file-evidence.md`). Мой контур — `PASS`, `gaps=0`.

## Попытка 4 — второй challenge Codex Astra, DEC-A-017

Прочитан `docs/features/scan-pipeline/plan-challenge-2.md` целиком (verdict STOP: PC-06 open, PC-02/
03/05/07/08/09 partially, две новые находки PC2-01/PC2-02 high). Все закрыты:

- **PC-06 (open → closed).** Дыра: ПЕРВЫЙ захват (`lease_fence=1`) не пересчитывал `day`, только
  повторные (`fence≥2`). Теперь `RecognizeScanWithinScanPipeline` шаг 2 списывает `primary` заново
  при `fence≥2` **ИЛИ** `day(now)≠day(created_at)` — приём перед полуночью и первый захват после нею
  расходуют день ЗАХВАТА, не приёма. Сознательный перерасход на границе, назван явно. Новый
  AC-scan-pipeline-32.
- **PC2-01 (high, новая).** `object_key` был `sha256(содержимое)+session` — общий для двух РАЗНЫХ
  запросов с одинаковым фото; удаление объекта отклонённого B стирало фото принятого A. Заменено на
  `object_key = device_session_id/recognition_id.ext`, `recognition_id` генерируется ДО загрузки;
  дедупликация не выполняется. Новый `FR-scan-pipeline-19`, новый AC-30.
- **PC-02 (partially → closed часть про орфанов).** Добавлен явный шаг 12 `EnqueueScanForFeature`:
  суточная уборка объектов без строки `photo` (по префиксу `device_session_id/`), старше 1 часа. Новый
  AC-31.
- **PC-03 + PC2-02 (partially/high → closed).** Общий бюджет задачи `created_at+30с` теперь ЕДИНЫЙ на
  все попытки (не 25с на каждый вызов заново): шаг 1а вычисляет остаток ПРИ КАЖДОМ захвате и
  немедленно отказывает без вызова, если бюджет исчерпан ДО начала; вызов модели и нормализация — под
  ОДНИМ `AbortController` на остаток бюджета — платная работа физически обрывается по истечении, а не
  продолжается после того, как sweeper уже пометил задание просроченным (это и была находка PC2-02).
  `SweepStuckScans` правило В ОБЯЗАТЕЛЬНО требует `leased_until < now()` — sweeper больше НИКОГДА не
  трогает задание с живой арендой; новое правило Г называет предпочтительный (предикат `foundation`)
  и обязательный (шаг 1а воркера) рубежи против «захвата уже просроченного задания». Ответ провайдера,
  пришедший ПОЗЖЕ бюджета, — новый исход `model_call outcome='late'` (оплачен, но не применён).
  Новые `FR-scan-pipeline-20`, AC-36; правка `FR-scan-pipeline-16`.
- **PC-05 (partially → closed числа).** Все пределы названы литералами: вход `≤ 12 582 912` байт,
  декодирование `≤ 50 000 000` px, `1` кадр, выход JPEG качеством `85`, `≤ 1568` px, `≤ 5 242 880`
  байт, время нормализации `≤ 3000` мс → `failed(normalize)`. **Названо явно координатору:**
  `failure_reason='normalize'` — ЕЩЁ ОДНО значение сверх исходных 8 канона (как и `timeout` в Попытке
  3) — требует ратификации координатором в root `Pseudocode.md`/`canon.md`, эта квитанция её НЕ
  вносит. Новый AC-33.
- **PC-07 (partially → closed).** `scripts/telemetry/model-calls.sh` теперь РЕАЛИЗУЕТСЯ этой фичей
  (новый алгоритм `AggregateModelCallLog`), не только планируется; событие корреляции — `attempt_id =
  recognition_id:fence:reason`; служебная страница остаётся ПЛАНОМ, названо явно. Новые
  `FR-scan-pipeline-21`, AC-34.
- **PC-08 (partially → closed часть про Snapshot).** Каждый элемент `parts[]` несёт СВОЙ
  `source_snapshot`, контракт симметричен верхнему уровню. Новый AC-35. Найденная в challenge-2
  формальная слабость мутации стража («страж требует красного теста даже при совпадении ВСЕХ позиций,
  а такой вход не меняет корректный результат») — принята как корректное замечание; страж в
  `04_refinement.md` уже (с Попытки 3) мутирует УСЛОВИЕ записи `done`, а не подменяет порт — этот
  конкретный ложный случай (все позиции совпали) как раз и должен оставаться зелёным ОБОИМИ, красным
  — именно на входе с ЧАСТИЧНЫМ или НУЛЕВЫМ совпадением; формулировка стража это уже требует, отдельной
  правки не потребовалось.
- **PC-09 (partially → closed).** `03_architecture.md`: «предполагается» заменено на «внесено в план
  `foundation`, сообщение координатора 2026-09-12 20:33»; эта фича ДОПОЛНИТЕЛЬНО держит свой тест
  транспортного адаптера (`AC-scan-pipeline-29`) и не полагается на одно сообщение.
- **PC-01** оставлен `closed` (challenge-2 подтвердил).

**Уникальность:** 21 FR (было 18, добавлены `-19/-20/-21`), 3 NFR, 36 AC (было 29, добавлены
`-30…-36`) — все заголовки уникальны (`grep` + `uniq -c`, ноль дублей).

Ворота:
```
bash …/check-pipeline-gaps.sh . --traceability --role-map-source ../../.claude/commands/feature.md --project-role-map-source ../../.claude/skills/sparc-prd-mini/SKILL.md
```
Первый прогон после правок: `GAP FR-scan-pipeline-19`, `GAP FR-scan-pipeline-20` (забыл добавить
`REQUIREMENT:` в алгоритмы). Исправлено: `FR-scan-pipeline-19` → `EnqueueScanForFeature`,
`FR-scan-pipeline-20` → `RecognizeScanWithinScanPipeline`. Второй прогон:
```
TRACE contour=scan-pipeline … COUNT requirements=60 algorithms=60 missing-algorithm=0 orphan-algorithm=0
PASS contour=scan-pipeline bidirectional traceability complete
VERDICT traceability=PASS features=3 gaps=0 inconclusive=0
```
Код возврата скрипта в целом: `0` (RC=0) — контур `consent-and-telegram-auth`, ранее показывавший
дубли не моего авторства, к этому прогону тоже PASS (правку внёс другой агент, не эта квитанция).

## Дополнение к Попытке 4 — VS-05 (ре-валидатор): эскалация против общего бюджета

Находка: эскалация (второй полный вызов модели) могла запрашивать собственные `min(25с, remaining)`
без нижней границы — при `remaining`, близком к нулю, вызов заведомо не успевал получить ответ до
общего дедлайна 30 с и был обречён на `outcome='late'`, оплаченный впустую.

Правка (`RecognizeScanWithinScanPipeline` шаг 7, `02_pseudocode.md`): ПЕРЕД решением об эскалации
пересчитывается `remaining`. `IF remaining < 8 000 мс THEN` эскалация НЕ ПРЕДПРИНИМАЕТСЯ:
`low_confidence = true` напрямую, БЕЗ вызова `CheckAndConsumeQuota(reason='escalation')` и БЕЗ
события `model_call` — это отличается от отказа квоты (`quota_exhausted_escalation`): попытка не
была отказана, она вообще не была предпринята, поэтому не списывается и не логируется. `ELSE`
эскалация идёт штатно, но `callDeadlineMs` для ВТОРОГО вызова пересчитывается заново как `min(25с,
remaining)`, а не берёт полные 25 с — второй вызов делит ОДИН бюджет 30 с с первым.

Sweeper (`leased_until < now()` в правиле В) и правило «результат после дедлайна отбрасывается по
fence/status с `outcome='late'`» (шаг 9) уже были в Попытке 4 в требуемом виде — VS-05 их не менял,
только явно подтвердил.

Новый `AC-scan-pipeline-37`; правка `FR-scan-pipeline-7` (текст «делит бюджет с первичным»).
Уникальность: 21 FR, 3 NFR, 37 AC — все заголовки уникальны.

Ворота:
```
TRACE contour=scan-pipeline … COUNT requirements=61 algorithms=61 missing-algorithm=0 orphan-algorithm=0
PASS contour=scan-pipeline bidirectional traceability complete
VERDICT traceability=PASS features=3 gaps=0 inconclusive=0
```
RC=0.

Status: completed
