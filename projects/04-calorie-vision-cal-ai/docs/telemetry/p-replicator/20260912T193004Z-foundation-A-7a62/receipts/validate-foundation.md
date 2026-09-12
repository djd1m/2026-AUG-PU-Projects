# Квитанция — Phase 2 VALIDATE, фича `foundation`

RUN_ID: `20260912T193004Z-foundation-A-7a62` · WORK_UNIT_ID: `validate-foundation`
Исполнитель: Sonnet 5 (роль Phase 2 по ранбуку, константа).
requested: claude-sonnet-5; actual: unknown to worker (нет доступа к метаданным исполнения из воркера).

## Что сделано

Прочитано (только чтение): `docs/feature-runbook.md`, `.claude/skills/requirements-validator/SKILL.md`
и `references/{scoring-system,feature-report-contracts,invest-criteria}.md`, все пять документов
фичи `docs/features/foundation/01…05*.md`, `docs/canon.md`, `docs/Specification.md` (FR-AUTH-001,
FR-CAPTURE-001, FR-LIMIT-001/002, NFR-SCALE-001, NFR-OPS-001, NFR-SEC-001/002), `docs/Architecture.md`
(разделы Security/Data через docker-compose.yml и 03_architecture.md фичи), `docs/ADR.md` (ADR-002,
003, 007, 009 — тексты решений сверены с цитатами фичи), `docs/docker-compose.yml` (healthcheck-и,
единственный публикуемый порт), правила проекта: `security.md`, `coding-style.md`,
`secrets-management.md`, `testing.md`, а также корневые `security-operation-order.md`,
`fail-closed-defaults.md`, `honest-configuration.md`, `shared-resource-verification.md`,
`guard-must-be-able-to-fail.md`, `deployment-seams.md`.

Написан `docs/features/foundation/validation-report.md`: 12 требований (10 FR + 2 NFR) оценены по
INVEST/SMART, 16 `AC-foundation-n` трассированы на именованные сценарии из дословных заголовков тестов
в `04_refinement.md` и `05_completion.md`. Найдено 2 находки (VF-01, VF-02), обе `medium`,
не блокирующие (blocking floor не сработал ни для одного требования — ни одно не имеет
`Testable`/`Completeness`/`Traceability` = 0). Security acceptance criteria — применимо, присутствует
специфично по пяти из семи категорий (две — не применимы к этой фиче). Growth traceability — не
применимо: `foundation` не касается ни одного `FR-GROWTH-nnn` (growth-события, карточки, коды
партнёра явно вне объёма фичи).

**Вердикт: 🟢 READY.** Средний балл 95/100 (диапазон по требованиям 92–100), ни одно требование не
заблокировано.

## Ворота

```
bash /root/.npm/_npx/ac10dded1a3b4a50/node_modules/@dzhechkov/p-replicator/scripts/check-pipeline-gaps.sh . \
  --report-revision --criterion-scenarios \
  --role-map-source ../../.claude/commands/feature.md \
  --project-role-map-source ../../.claude/skills/sparc-prd-mini/SKILL.md
```

Вывод:
```
NOT-ESTABLISHED contour=project report-revision line missing in validation-report.md
NOT-ESTABLISHED contour=project criterion-scenarios table missing or malformed in validation-report.md detail=header
VERDICT report-revision=NOT-ESTABLISHED features=1 gaps=0 inconclusive=1
VERDICT criterion-scenarios=NOT-ESTABLISHED features=1 gaps=0 inconclusive=1
```
Код возврата: **2**.

### Разбор NOT-ESTABLISHED — это не дефект фичи `foundation`

Обе строки NOT-ESTABLISHED помечены `contour=project` — это ПРОЕКТНЫЙ `docs/validation-report.md`
(Phase 2 SPARC-уровня проекта, RUN_ID `20260912T171708Z-replicate-04-phase1-4-sparc-0c00`, написан
другими исполнителями — `validator-stories-ac`, `validator-docs-coherence`, `fixer-phase2`,
`revalidator`, до начала работы над `foundation`), а не `docs/features/foundation/validation-report.md`.
Причина: его строка ревизии — `Spec revision после исправлений: sha256:9b487baf90ed` (лишний текст
перед `sha256:` и дайджест из 12 hex-символов вместо 64) не проходит регэксп чекера
`^Spec revision: sha256:[a-f0-9]{64}$`.

Ни в одной строке вывода не упомянут `foundation` (проверено `grep -c "foundation"` по полному
выводу → 0), а `VERDICT … features=1 gaps=0 …` означает: найдена ровно одна фича (`foundation`), и
для НЕЁ не зафиксировано ни одного `GAP` — обе проверки (`--report-revision`,
`--criterion-scenarios`) молчаливы при успехе (скрипт печатает только отказы, что подтверждено
чтением `process_revision_contour`/`process_scenario_contour` в исходнике проверки). Итоговый код `2`
— проекция НЕОДНОЗНАЧНОГО контура `project` на общий вердикт; чекер не даёт флага, ограничивающего
проверку одной фичей.

Правка `docs/validation-report.md` (проектного) НЕ входит в объём этой задачи (она принадлежит
другому RUN_ID и другим исполнителям, а инструкция задачи запрещает править документы ФИЧИ — этот
документ шире фичи и его правка была бы самостоятельным решением за пределами мандата валидатора
Phase 2 `foundation`); правка внесена не была.

## Находки

- **VF-01** (medium): `FR-foundation-2` объявляет обязательными `S3_ENDPOINT`, `S3_BUCKET`,
  `S3_ACCESS_KEY`, `S3_SECRET_KEY`, но ни `AC-foundation-3`, ни `tests/unit/config.test.ts` не
  называют явного прогона на их отсутствие (только `APP_ORIGIN` и `DATABASE_URL`).
- **VF-02** (medium): `FR-foundation-8`/`AC-foundation-13` описывают порог ограничителя частоты как
  «N запросов в окно» без именованного источника (ни литерал канона, ни переменная окружения) —
  в отличие от прочих потолков (ADR-007) и порога эскалации (ADR-004).

Обе — completeness-замечания, не блокеры; подробности и предлагаемые исправления — в самом отчёте.

## Попытка 2 (AC-17…21)

Координатор сообщил: реализация `foundation` добавила пять критериев `AC-foundation-17…21` в
`01_specification.md` (контракт DEC-A-015/DEC-A-018 — незавершённая публикация невидима воркеру,
предел захватов, уборщик застрявших заданий, модель/дедлайн задаёт вызывающий), и ворота
`--criterion-scenarios` давали 5 `GAP` по контуру `foundation` — у этих критериев не было строк в
`## Criterion scenarios`.

**Прочитано:** пять новых `AC-foundation-17…21` (`01_specification.md:333–370`), обновлённые
`02_pseudocode.md` (переписанный предикат `LeaseRecognitionJob`, новый алгоритм `SweepStuckJobs`,
новый контракт порта `SelectModelProvider`, строки 156–198), `04_refinement.md` (восемь новых
краевых случаев и таблица испытания мутацией), `05_completion.md` (обновлённая таблица `##
Criterion coverage`, строки 259–263), и квитанция реализации
`docs/telemetry/p-replicator/20260912T193004Z-foundation-A-7a62/receipts/impl-foundation.md`
раздел «Дополнение» (контракт, шесть новых испытаний стражей мутацией, 71 тест итого). Тесты
проверены чтением исходников: `grep -n "^\s*it("` в `tests/concurrency/lease.test.ts` и
`tests/integration/provider-adapter.test.ts` — заголовки совпадают дословно с тем, что уже
вписано в `05_completion.md`.

**Сделано в `validation-report.md`:**
1. `Spec revision` обновлён на текущий `sha256sum docs/features/foundation/01_specification.md`
   → `3be77fbcc5d393f5b8eabaf396ec7c09b00b132223c3b8ff277ab6eb05cb3234`.
2. В `## Criterion scenarios` добавлены пять строк (`AC-foundation-17…21`) — слой, именованный
   сценарий, файл теста, факт испытания мутацией (девять новых прогонов «дефект → красный, код
   восстановлен → зелёный», взяты из `impl-foundation.md`), без единого символа `|` внутри ячейки
   (проверено `awk -F'|'` — у каждой новой строки ровно 3 разделителя, как того требует парсер
   `extract_scenario_rows`).
3. Добавлена находка **VF-03** (low): проза `FR-foundation-6` (`01_specification.md:136–147`) не
   переписана вслед за DEC-A-015/018 — предикат, `SweepStuckJobs` и новый порт в ней не упомянуты,
   хотя `02_pseudocode.md` несёт их полно и точно, а `AC-foundation-17…21` и формальные метки
   `REQUIREMENT:`/`REALISES:` при алгоритмах `LeaseRecognitionJob`/`SweepStuckJobs`/
   `SelectModelProvider` (`02_pseudocode.md:156–160,175–177,190–193`) — корректны и полны. Это
   документационный пробел, не дефект приёмки: тестируемость не пострадала.
4. Обновлены Summary (21 критерий, 3 находки) и раздел «Проверено без замечаний».
5. Добавлен раздел «Дополнение: AC-foundation-17…21 (Попытка 2)» с обоснованием, почему вердикт
   не изменился.

**Вердикт не изменился: 🟢 READY.** Средний балл по 12 требованиям остался 95/100 — пять новых
критериев уточняют контракт `FR-foundation-6` (уже оценённый 100/100 в Попытке 1) и не вводят
новой FR/NFR-единицы анализа; ни один AC (включая 17–21) не имеет `Testable`/`Completeness`/
`Traceability` = 0.

**Ворота:**
```
bash /root/.npm/_npx/ac10dded1a3b4a50/node_modules/@dzhechkov/p-replicator/scripts/check-pipeline-gaps.sh . \
  --criterion-scenarios \
  --role-map-source ../../.claude/commands/feature.md \
  --project-role-map-source ../../.claude/skills/sparc-prd-mini/SKILL.md
```
Вывод:
```
NOT-ESTABLISHED contour=source-and-correct role=validation-report path=./docs/features/source-and-correct/validation-report.md missing or unreadable
VERDICT criterion-scenarios=NOT-ESTABLISHED features=4 gaps=0 inconclusive=1
```
Код возврата: **2** — но, как и в Попытке 1, это НЕ контур `foundation`: ноль упоминаний
`foundation` в выводе (`grep -c foundation` → 0), `gaps=0` для всех четырёх найденных фич
(`foundation`, `scan-pipeline`, `consent-and-telegram-auth`, `source-and-correct`). Единственный
`NOT-ESTABLISHED` — `contour=source-and-correct`: у этой (чужой, параллельно пишущейся) фичи ещё
нет собственного `validation-report.md` вовсе. Это вне мандата этой задачи и вне мандата фичи
`foundation`; правка не вносилась. Контур `foundation` по критерию `--criterion-scenarios`
подтверждён на **0 GAP**, что и требовалось координатором.

requested: claude-sonnet-5; actual: unknown to worker.

Status: completed
