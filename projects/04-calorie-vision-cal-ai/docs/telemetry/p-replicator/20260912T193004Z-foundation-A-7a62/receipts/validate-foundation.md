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

## Попытка 3 (RV-03)

Слепой судья (Phase 4) нашёл **RV-foundation-03 (medium)**: отчёт Попытки 2 был привязан к хешу
`3be77fbc…c3234`, спецификация с тех пор получила `FR-foundation-11` (коммит `9ae9f1c`,
«FR-11 для уборщика, проза FR-6 под DEC-A-015/018» — уборщик получил собственный ключ трассировки,
закрывая `DUPLICATE` в `check-pipeline-gaps.sh --traceability`), а отчёт заявлял «новой FR/NFR-строки
не заводили». Замена одной контрольной суммы без переоценки состава была бы косметикой, что и было
сутью находки.

**Прочитано заново (не точечно):** весь текущий `01_specification.md` (427 строк, было 396 в
Попытке 1/2), `git show 9ae9f1c -- .../01_specification.md` (дифф, показавший точную границу
FR-foundation-6/FR-foundation-11), весь `02_pseudocode.md` целиком с грепом всех `REQUIREMENT:`/
`REALISES:` меток (подтверждено: `SweepStuckJobs` несёт `REQUIREMENT: FR-foundation-11`, DUPLICATE
устранён), обновлённые `04_refinement.md`/`05_completion.md` (разделы «Попытка 2» и «Попытка 3»
координатора — доказательство закрытия VF-02 на стенде, две зоны rate-limit, 125/120 и 35/30),
исходники тестов `tests/unit/config.test.ts` (строки 104–111, 159–163, 169+) чтением, а не по
пересказу.

**Ключевая находка ПРИ перечитывании (сверх заявленного объёма задачи):** `VF-01` и `VF-02`
(находки Попытки 1) оказались ЗАКРЫТЫ РЕАЛИЗАЦИЕЙ И ТЕСТАМИ — DEC-A-013 ввёл
`N4_RATE_LIMIT_MUTATE_PER_MIN`/`N4_RATE_LIMIT_READ_PER_MIN` (30/120), проверенные тестом отказа
старта, тестом согласованности с каноном и на РАЗВЁРНУТОМ стенде (125 чтений → 120 успехов, `429` с
121-го; 35 мутаций → 30 успехов, `429` с 31-го); S3-переменные покрыты явными тестами и для `api`, и
для `recognizer`. Но текст `01_specification.md` (`AC-foundation-3`, `FR-foundation-8`,
`AC-foundation-13`) и `03_architecture.md` (таблица переменных) НЕ переписаны — то же расхождение
«реализация ушла дальше документа», из-за которого возникла сама RV-03. Severity обеих находок
понижена medium → low с точным указанием строк тестов-доказательств; баллы `FR-foundation-2`/
`FR-foundation-8` НЕ менял, поскольку они оценивают текст спецификации, а не факт существования кода
где-то ещё — этот принцип и есть ответ на урок RV-03 «замена числа без переоценки — косметика».

**Изменения в `validation-report.md`:**
1. `Spec revision` → `sha256:02cfa7f68f8acdc9f09a8795076b4d0fdd8a33aa9fcf66f6a9538e0c447e3670`
   (текущий `01_specification.md`).
2. `FR-foundation-11` добавлен в `## Results`, оценён отдельно по INVEST (50/50) и SMART
   (30/30 — `AC-foundation-19` имеет явную временную границу «пять минут», `Time-bound = 5`) =
   **100/100**, с разделом `## Detailed Analysis: FR-foundation-11` (цитата AC, разбор всех четырёх
   Given-клауз, подтверждение покрытия тестами по строкам `tests/concurrency/lease.test.ts:217–310`).
3. Состав требований 12 → **13** (11 FR + 2 NFR); средний балл пересчитан по всем тринадцати
   заново — **1238/13 = 95,23 ≈ 95/100** (совпал с прежним округлением, но это результат пересчёта,
   а не перенос).
4. `VF-01`, `VF-02` — severity medium → low, статус «закрыто в реализации, не синхронизировано в
   спецификации», с точными путями и номерами строк тестов-доказательств; баллы AC/FR не менял.
5. `VF-03` — отмечена ЗАКРЫТОЙ, сверено построчно с `02_pseudocode.md:154–198`, id сохранён в
   таблице находок для истории (не удалён молча).
6. `VF-04` (low, новая) — таблица «Трассировка на документы проекта» и раздел «Объём» не упоминают
   `FR-foundation-11`.
7. Добавлен раздел `## Дополнение: RV-foundation-03 (Попытка 3)` с прямым разбором находки судьи и
   тем, что именно исправлено.

**Вердикт не изменился: 🟢 READY**, средний балл 95/100 (13 требований). Ни одна находка не задевает
`Testable`/`Completeness`/`Traceability` = 0.

**Ворота:**
```
bash /root/.npm/_npx/ac10dded1a3b4a50/node_modules/@dzhechkov/p-replicator/scripts/check-pipeline-gaps.sh . \
  --criterion-scenarios \
  --role-map-source ../../.claude/commands/feature.md \
  --project-role-map-source ../../.claude/skills/sparc-prd-mini/SKILL.md
```
```
VERDICT criterion-scenarios=PASS features=4 gaps=0 inconclusive=0
```
Код возврата: **0** — контур `foundation` чист, и на этот раз чист весь прогон целиком: соседняя
фича `source-and-correct`, которая в Попытке 2 давала `NOT-ESTABLISHED`, к этому моменту получила
свой `validation-report.md` от другого исполнителя.

```
node ../../.claude/hooks/check-review-contract.cjs . foundation
```
```
PASS review-contract feature=foundation AC-ids=21 rows=21
```
Код возврата: **0**.

requested: claude-sonnet-5; actual: unknown to worker.

## Попытка 4 (RV-03 повторно)

Третье слепое ревью снова вернуло **RV-foundation-03 (medium)**: отчёт был привязан к
`02cfa7f6…7e3670`, спецификация тем временем стала `431b004e…0e5059` — коммит `ae8f072` («проза
приведена к тому, что реально сделано (VF-01, 02, 04)») переписал `FR-foundation-2` (четыре
переменные S3, обе формы, оба сервиса), `FR-foundation-8` (числа порога, источник, вторая дверная
защита) и закрыл `VF-04` (уборщик — в разделе «Объём» и в таблице трассировки).

**Прочитано:** дифф `git show ae8f072 -- .../01_specification.md` целиком; текущие
`FR-foundation-2`, `-8`, `-11`, `AC-foundation-3`, `-13`, `-19`, раздел «Объём» и таблица
трассировки; `Caddyfile:35–56` и `03_architecture.md:131` (вторая, дверная защита частоты);
`tests/unit/config.test.ts` — **дважды**, потому что координатор предупредил о конкурентной правке
этого файла `impl-foundation`, и файл ДЕЙСТВИТЕЛЬНО изменился между первым и вторым чтением.

**Находки:**
- `VF-01`, `VF-02` — остаются ОТКРЫТЫМИ, severity `low` без изменений: FR-проза теперь полна,
  `AC-foundation-3`/`-13` (Gherkin) тем же коммитом не тронуты — чистый текстовый разрыв FR↔AC.
  Баллы `FR-foundation-2`/`FR-foundation-8` (92/100 каждый) НЕ менял: SMART оценивает текст AC,
  а он не изменился с Попытки 1.
- `VF-03` — без изменений, ЗАКРЫТА (сверено в Попытке 3).
- `VF-04` — **ЗАКРЫТА**, проверено дословно: `FR-foundation-11` теперь в п. 5 раздела «Объём» и в
  таблице трассировки.
- `VF-05` (новая) — при ПЕРВОМ чтении `tests/unit/config.test.ts` обнаружил ровно то расхождение,
  которое координатор назвал RV-foundation-02: тест `recognizer` для четырёх S3-переменных проверял
  только `undefined`, без `''` (4/8 вместо 8/8, при 8/8 у `api`). Начал писать находку как ОТКРЫТУЮ.
  При ВТОРОМ чтении, непосредственно перед фиксацией вердикта, увидел новый тест
  `tests/unit/config.test.ts:165–180` с явной ссылкой на `RV-foundation-02` в комментарии — файл
  изменился конкурентно, как и предупреждал координатор. **Не принял присутствие теста на веру:**
  прогнал `npx vitest run tests/unit/config.test.ts` → `17 passed (17)`, включая новый. Записал
  `VF-05` как «обнаружена и закрыта в этом же прогоне», с обеими стадиями и точной командой/выводом
  проверки — быстрее обещанной Попытки 6 реализации.

**Вердикт не изменился: 🟢 READY**, средний балл 95/100 (13 требований, без изменений — новых
FR/NFR в этой попытке не добавлено, `FR-foundation-11` уже учтён в Попытке 3).

**Spec revision** обновлён на `sha256:431b004e3612e86cfeeac592231f013771d908143cfe6d1610ac59d3e40e5059`
(проверено дважды за время работы — не сдвинулся, как и обещал координатор).

**Ворота:**
```
bash /root/.npm/_npx/ac10dded1a3b4a50/node_modules/@dzhechkov/p-replicator/scripts/check-pipeline-gaps.sh . \
  --criterion-scenarios --role-map-source ../../.claude/commands/feature.md \
  --project-role-map-source ../../.claude/skills/sparc-prd-mini/SKILL.md
```
```
VERDICT criterion-scenarios=PASS features=4 gaps=0 inconclusive=0
```
Код возврата: **0**.

```
node ../../.claude/hooks/check-review-contract.cjs . foundation
```
```
PASS review-contract feature=foundation AC-ids=21 rows=21
```
Код возврата: **0**.

Файлы НЕ трогал за пределами `docs/features/foundation/validation-report.md` и этой квитанции;
`01_specification.md`, `tests/unit/config.test.ts` и прочий код читал, не правил.

requested: claude-sonnet-5; actual: unknown to worker.

Status: completed
