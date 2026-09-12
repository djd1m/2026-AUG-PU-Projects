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

Status: completed
