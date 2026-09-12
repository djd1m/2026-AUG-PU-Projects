# Квитанция — Phase 2 VALIDATE, фича `scan-pipeline`

RUN_ID: `20260912T195930Z-scan-pipeline-B-fe9f` · WORK_UNIT_ID: `validate-scan-pipeline`
Исполнитель: Sonnet 5 (роль Phase 2 по ранбуку, константа).
requested: claude-sonnet-5; actual: unknown to worker (нет доступа к метаданным исполнения из воркера).

## Что сделано

Прочитано (только чтение): `docs/feature-runbook.md`, `../../.claude/skills/requirements-validator/SKILL.md`
и `references/{scoring-system,feature-report-contracts,bdd-patterns}.md`, все пять документов фичи
`docs/features/scan-pipeline/01…05*.md`, образец формата `docs/features/foundation/validation-report.md`,
`docs/canon.md`, `docs/Specification.md` (FR-CAPTURE-002, FR-RECOGNIZE-001/002, FR-LIMIT-001/002,
NFR-PERF-001, NFR-SEC-001, US-001/US-002/US-009 со сценариями), `docs/Pseudocode.md` (`EnqueueScan`,
`RecognizeScan`, `CheckAndConsumeQuota`, строка 32 `failure_reason`), `docs/Architecture.md`
(External Dependencies, строка 155 `recognition`), `docs/model-cost-contract.md`,
`docs/long-job-contract.md`, `docs/decisions-autonomous.md` (DEC-A-002/003/005/008/009/013/014),
проектные `.claude/rules/{security,coding-style,testing,secrets-management}.md`, корневые
`../../.claude/rules/{model-call-cost,security-operation-order,shared-resource-verification,
fail-closed-defaults,honest-configuration}.md`.

Написан `docs/features/scan-pipeline/validation-report.md`: 16 требований (13 FR + 3 NFR) оценены по
INVEST/SMART, 18 `AC-scan-pipeline-n` трассированы на именованные сценарии из дословных заголовков-
планов в `04_refinement.md` и `05_completion.md`. Найдено 3 находки (VS-01, VS-02, VS-03), все `low`,
не блокирующие (blocking floor не сработал ни для одного требования — ни одно не имеет
`Testable`/`Completeness`/`Traceability` = 0). Security acceptance criteria — применимо, присутствует
специфично по шести из шести применимых категорий. Growth traceability — не применимо: фича
переиспользует `growth_event(type=install)` из `foundation`, не вводит нового `FR-GROWTH-nnn`.

Проверено особо и закрыто без блокирующих замечаний: порядок операций (частота → валидация →
идемпотентность → квота → фото → задание, `EnqueueScanForFeature`); идемпотентность в обе стороны
(тот же ключ+сессия → тот же `scan_id`; тот же ключ+другая сессия → второй независимый скан,
`04_refinement.md` Edge Cases, строка 4); нормализация ДО вызова модели и проверка диапазонов ПОСЛЕ
разбора — обе стражены с внедряемым дефектом; эскалация под четвёртым ключом ДО Sonnet 5; fencing
под реальной задержкой провайдера (AC-17); закрытый список `failure_reason` — фича не расширяет
восьмизначное множество `Pseudocode.md:32` (расхождение "6 значений" в `Architecture.md:155` —
предсуществующее, вне фичи, отмечено VS-03); `refused(no_food_detected)` после оплаченного вызова
модели — НЕ дефект, точное совпадение с проектным каноном `FR-RECOGNIZE-001`, отличное от
`failed(no_food_matched)` (DEC-A-014); статусы канона (`recognition.status`, 4 значения) не
расширены; контракт `MatchIngredientPort`/`NullMatchIngredientPort` (DEC-A-014) реализуем и
протестирован двумя разными доказательствами (AC-14 unit с подменённым портом, AC-15 integration с
реальным); External Dependencies — строка MinIO presigned честно понижена до вторичного источника
по CFG-I4, вердикт не завышен (оговорка присутствует текстом, VS-01 предлагает сделать её заметнее
структурно); security AC (413/422 разделены не полностью — VS-02; MIME по сигнатуре; presigned
только серверные — `api` сам кладёт оригинал, клиент не получает presigned PUT; секреты закреплены
за верным сервисом).

**Вердикт: 🟢 READY.** Средний балл 93/100 (диапазон по требованиям 87–100), ни одно требование не
заблокировано.

## Ворота

```
bash /root/.npm/_npx/ac10dded1a3b4a50/node_modules/@dzhechkov/p-replicator/scripts/check-pipeline-gaps.sh . \
  --report-revision --criterion-scenarios \
  --role-map-source ../../.claude/commands/feature.md \
  --project-role-map-source ../../.claude/skills/sparc-prd-mini/SKILL.md
```

Первый прогон вернул код **2**:
```
NOT-ESTABLISHED contour=scan-pipeline criterion-scenarios table missing or malformed in validation-report.md detail=row
VERDICT report-revision=PASS features=2 gaps=0 inconclusive=0
VERDICT criterion-scenarios=NOT-ESTABLISHED features=2 gaps=0 inconclusive=1
```
Причина: строка `AC-scan-pipeline-16` несла экранированный литерал `\|` внутри ячейки
(`failed(provider_unavailable\|provider_timeout)`), который парсер таблицы (awk, разбор по
буквальному символу `|`, без понимания markdown-экранирования) считает четвёртым разделителем
столбца — строка получала 4 pipe-символа вместо 3 и не проходила `count == 4` после `split`.
Исправлено заменой на `` `failed(provider_unavailable)`/`failed(provider_timeout)` `` (без `|`
внутри ячейки); остальные 17 строк таблицы сверены на отсутствие лишних `|` тем же способом до
повторного прогона.

Повторный прогон:
```
VERDICT report-revision=PASS features=2 gaps=0 inconclusive=0
VERDICT criterion-scenarios=PASS features=2 gaps=0 inconclusive=0
```
Код возврата: **0**. `features=2` — оба зарегистрированных контура (`foundation`,
`scan-pipeline`); ни для одного не зафиксировано `GAP` ни `NOT-ESTABLISHED`.

## Находки

- **VS-01** (low): `03_architecture.md:85` — строка MinIO External Dependencies несёт вердикт
  `CONFIRMED` при вторично-источниковом доказательстве (первоисточник вернул `404` 2026-09-12);
  оговорка честная и текстовая, но токен вердикта совпадает с голым `CONFIRMED` остальных строк —
  предложено ввести отдельный токен для наглядности. Не блокер.
- **VS-02** (low): `AC-scan-pipeline-3` не разделяет явно, какой код (413 vs 422) отвечает
  превышению размера файла, а какой — недостаточному разрешению, хотя `02_pseudocode.md` шаг 4 их
  различает. Предложено уточнить перед Phase 3.
- **VS-03** (low, вне фичи): `docs/Architecture.md:155` называет `failure_reason` «enum из 6
  значений», а `docs/Pseudocode.md:32` перечисляет 8 — расхождение на проектном уровне,
  предшествующее `scan-pipeline` и не введённое ею; сама фича корректно использует подмножество
  восьмизначного списка. Отмечено, чтобы Phase 3/4 не приняли устаревшее число из `Architecture.md`.

Обе/все три — completeness-замечания, не блокеры; подробности и предлагаемые исправления — в самом
отчёте.

## Попытка 2 — ревалидация после challenge Codex Astra (PC-01…PC-09, DEC-A-015)

План фичи переписан (Ревизия 2 документов, `plan-challenge.md`): 18 FR (было 13, добавлены
FR-14…18), 29 AC (было 18, добавлены AC-19…29), 50 тегов `REQUIREMENT:` в `02_pseudocode.md`
(18+3+29 — сходится). Прочитано заново: все пять документов фичи целиком, `plan-challenge.md`,
`docs/decisions-autonomous.md` (добавлено DEC-A-015).

`docs/features/scan-pipeline/validation-report.md` переписан целиком под новую ревизию: Spec revision
пересчитан (`sha256sum docs/features/scan-pipeline/01_specification.md` →
`9c33776afe68cdf98b9f05e31731260b5336d760a27d8056397cf108481c2891`), 21 требование (18 FR + 3 NFR)
оценены заново, `## Criterion scenarios` расширена до 29 строк. Построчно проверено закрытие
PC-01…PC-09 — все девять закрыты в тексте плана (таблица в самом отчёте); PC-03 закрыт по букве
формулировки, но реализация правила В `SweepStuckScans` несёт СОБСТВЕННЫЙ, новый дефект (см. ниже).

**Вердикт не изменился: 🟢 READY.** Средний балл 93/100 (было 93/100 при 16 требованиях — устойчиво
при почти в полтора раза большем объёме). Находок 5: VS-01/02 (low, перенесены без изменений), VS-03
(было low, **повышена до medium** — эта ревизия ввела `failure_reason = 'timeout'`
(`02_pseudocode.md:335,341`) как девятое значение, отсутствующее и в восьмизначном списке
`Pseudocode.md:32`, и тем более в шестизначном счёте `Architecture.md:155`, без сопровождающей записи
в `docs/canon.md`/`docs/decisions-autonomous.md` — в отличие от прежних расширений канона проекта
(DEC-A-002, DEC-A-012)), VS-04 (medium, новая: судьба `outcome: 'unknown'` в `model_call` без
агрегатора не названа явно в `05_completion.md` «Что эта фича НЕ доказывает»).

**VS-05 (high, новая, ключевая находка этой попытки — обнаружена самостоятельным чтением, не из
`plan-challenge.md`).** `SweepStuckScans` Правило В (`02_pseudocode.md:337–342`) сметает по одному
лишь возрасту `created_at >= 30 с` и `lease_fence >= 1`, БЕЗ проверки `leased_until` — в отличие от
Правил А и Б, которые именно на нём и держатся. Поскольку `FR-scan-pipeline-6` объявляет дедлайн ОДНОГО
вызова модели 25 с, а штатная эскалация (`FR-scan-pipeline-7`) делает ВТОРОЙ полный вызов той же
длины, легитимная эскалированная попытка (до 25+25=50 с) при ЖИВОЙ, не истёкшей аренде будет
ошибочно сметена уже на 31-й секунде, а честный результат живого воркера при попытке записи получит
`swept_as_timeout` вместо своего статуса. Названный в документе риск («между 30 и ~31 с») описывает
только пограничное совпадение по времени и не покрывает этот структурный разрыв между двумя другими
числами того же плана (25×2 против 30). Не блокер (floor не сработал, требование тестируемо и
трассировано), но единственная находка, рекомендованная к точечному исправлению (правка одного
`WHERE` либо порога) ДО либо во время Phase 3 — подробности, цитаты и три варианта исправления в
самом отчёте, раздел Detailed Analysis и Findings.

### Ворота (Попытка 2)

```
bash /root/.npm/_npx/ac10dded1a3b4a50/node_modules/@dzhechkov/p-replicator/scripts/check-pipeline-gaps.sh . \
  --report-revision --criterion-scenarios \
  --role-map-source ../../.claude/commands/feature.md \
  --project-role-map-source ../../.claude/skills/sparc-prd-mini/SKILL.md
```

Перед прогоном все 29 строк новой таблицы `## Criterion scenarios` сверены на отсутствие лишних `|`
(урок Попытки 1) — чисто.

Вывод:
```
NOT-ESTABLISHED contour=consent-and-telegram-auth role=validation-report path=./docs/features/consent-and-telegram-auth/validation-report.md missing or unreadable
NOT-ESTABLISHED contour=consent-and-telegram-auth role=validation-report path=./docs/features/consent-and-telegram-auth/validation-report.md missing or unreadable
VERDICT report-revision=NOT-ESTABLISHED features=3 gaps=0 inconclusive=1
VERDICT criterion-scenarios=NOT-ESTABLISHED features=3 gaps=0 inconclusive=1
```
Код возврата: **2**.

**Разбор — это НЕ дефект `scan-pipeline`.** `grep -c "scan-pipeline"` по полному выводу → `0`: ни
одна строка не называет `scan-pipeline`. `features=3` — за время между Попыткой 1 и Попыткой 2 в
`docs/features/` появился третий контур, `consent-and-telegram-auth` (Phase 1 другой фичи, другим
исполнителем, параллельно), у которого `validation-report.md` ещё не существует — законное состояние
для фичи, не дошедшей до Phase 2. `gaps=0` по обоим режимам означает: там, где сравнение вообще
установлено (`foundation`, `scan-pipeline`), несоответствий нет; итоговый код `2` — проекция
NOT-ESTABLISHED третьего, чужого контура на общий вердикт, как и в квитанции Попытки 1 (`project`
контур тогда). Правка `consent-and-telegram-auth` не входит в объём этой задачи (другая фича, другой
исполнитель, инструкция ограничивает объём документами `scan-pipeline`); правка внесена не была.

### Находки (сводно, полный текст и рекомендации — в отчёте)

- **VS-01** (low, без изменений).
- **VS-02** (low, без изменений).
- **VS-03** (medium, повышена): `failure_reason = 'timeout'` — девятое значение без записи в канон/DEC-A.
- **VS-04** (medium, новая): судьба `outcome: 'unknown'` без агрегатора не названа в «НЕ доказывает».
- **VS-05** (high, новая): `SweepStuckScans` Правило В может смести легитимную эскалацию (25×2=50с
  против порога 30с, без проверки `leased_until`) — единственная находка, требующая правки перед
  Phase 3.

## Попытка 3 — ревалидация после второго challenge Codex Astra (PC-06/PC2-01/PC2-02, DEC-A-017)

План переписан снова (`plan-challenge-2.md`): PC-06 (был `open`) и две новые находки PC2-01/PC2-02.
Прочитано заново: все пять документов фичи целиком, `plan-challenge-2.md`, `docs/decisions-autonomous.md`
(DEC-A-016…019). Файл `01_specification.md` вырос ДО и ВО ВРЕМЯ этого прогона (37 AC вместо 36,
названных в задаче, — `AC-scan-pipeline-37` появился параллельно, другим исполнителем, во время
чтения); валидировано по фактическому состоянию на диске, отмечено в самом отчёте.

`docs/features/scan-pipeline/validation-report.md` переписан целиком: Spec revision пересчитан
(`7eb38593c2ad325b86b1062aa2d8f56f65dfc37f03ebe3748f55bbe3c48a436a`), 24 требования (21 FR + 3 NFR),
`## Criterion scenarios` расширена до 37 строк.

**Построчно подтверждено закрытие PC-06, PC2-01, PC2-02 и — отдельно — моей находки VS-05 из Попытки
2:** `FR-scan-pipeline-18` теперь пересчитывает `day` и на ПЕРВОМ захвате, не только на повторных
(PC-06); `FR-scan-pipeline-19` меняет ключ объекта на `recognition_id` вместо хеша содержимого,
исключая коллизию между сканами одной сессии (PC2-01, `AC-30/31`); `FR-scan-pipeline-20` вводит ЕДИНЫЙ
30-секундный бюджет под одним `AbortController`, а `SweepStuckScans` Правило В теперь ОБЯЗАНО
проверять `leased_until < now()` — живую аренду sweeper не трогает (PC2-02 = моя VS-05, закрыта,
`AC-36`). Более того, `FR-scan-pipeline-7`/`AC-37` closes ещё более тонкий подслучай, которого не
называл даже `plan-challenge-2.md`: эскалация при остатке бюджета < 8 с не предпринимается вовсе
(документ прямо цитирует «ре-валидатор VS-05»). VS-03 (medium) закрыта: `failure_reason` расширен до
10 значений в КОРНЕВЫХ документах с решением DEC-A-018 (канон обновлён, как и требовалось). VS-04
закрыта: агрегатор `scripts/telemetry/model-calls.sh` теперь РЕАЛИЗУЕТСЯ этой фичей (`FR-21`, `AC-34`).

**Вердикт не изменился: 🟢 READY.** Средний балл 94/100 (было 93 при 21 требовании; устойчиво при
росте на 8 AC и 3 FR). Новых находок 2, обе не блокеры:

- **VS-06 (medium, новая).** `AC-scan-pipeline-19` не обновлён вместе с `FR-scan-pipeline-19`: его
  текст всё ещё описывает механизм Попытки 3 («повтор перезаписывает ТОТ ЖЕ детерминированный ключ
  объекта» — по хешу содержимого), который эта же ревизия прямо ОТМЕНЯЕТ в пользу ключа по
  `recognition_id` (не детерминированного между повторами; орфан убирается отдельным механизмом по
  возрасту, `AC-31`). Тест, написанный буквально по `AC-19`, будет проверять несуществующий механизм.
- **VS-07 (low, новая).** `03_architecture.md` §«Размещение по пакетам и сервисам» не обновлена с
  Попытки 1 — восемь требований (`FR-14…21`) не имеют строки размещения; путь нового файла
  `scripts/telemetry/model-calls.sh` (`FR-21`) назван только в спецификации, не продублирован в
  архитектуре.

### Ворота (Попытка 3)

Первый прогон вернул `2` (`NOT-ESTABLISHED … detail=section` для `scan-pipeline`): заголовок таблицы
в отчёте был написан как `## Criterion scenarios (37)` — парсер ворот требует ТОЧНОЕ совпадение
`## Criterion scenarios` без хвоста; исправлено удалением `(37)`. Также при первой сборке таблицы
использовал сокращённые id (`AC-1`…`AC-37`) вместо полных `AC-scan-pipeline-N` — исправлено ДО первого
прогона (сверено регэкспом на 37 строк).

Повторный прогон:
```
GAP contour=consent-and-telegram-auth report-revision validation-report.md sha256:d33ff4ad354e… != specification sha256:a8e8a3807737…
VERDICT report-revision=FAIL features=3 gaps=1 inconclusive=0
VERDICT criterion-scenarios=PASS features=3 gaps=0 inconclusive=0
```
Код возврата: **1**. `grep -c "scan-pipeline"` по полному выводу → `0` — единственный `GAP` называет
`consent-and-telegram-auth` (чужая фича, стал stale spec revision в её собственном отчёте, другой
исполнитель, вне объёма этой задачи); `criterion-scenarios=PASS` для всех трёх контуров, включая
`scan-pipeline`. Правка `consent-and-telegram-auth` не вносилась.

## Попытка 4 (ПОСЛЕДНЯЯ по DEC-A-020) — ревалидация после третьего challenge Codex Astra

Третий challenge (`plan-challenge-3.md`): STOP по PC3-01 (high, `attempt_id` не различал
примарный/эскалационный вызов) и PC3-02 (medium, `AC-32` конфликтовал с новым 30-секундным бюджетом),
плюс частичные PC-02/03/05/06/07/08/09. DEC-A-020: эта правка (Попытка 6 псевдокода) закрывает
названное и является ПОСЛЕДНЕЙ — дальнейшую проверку плана challenge не проводит, остаток проверяет
слепой судья Phase 4 на реальном коде.

Прочитано заново: `plan-challenge-3.md`, `docs/decisions-autonomous.md` (DEC-A-020/021),
`RecognizeScanWithinScanPipeline` целиком (порядок «бюджет → нормализация 3000мс → списание квоты
непосредственно ПЕРЕД вызовом модели» — одна перестановка закрывает PC-06+PC-05+PC3-02 разом, названо
в самом документе), `SweepStuckScans`, обновлённые `AC-19` (VS-06), `AC-32` (переписан) и НОВЫЙ
`AC-38`, таблица размещения `03_architecture.md` (VS-07).

`validation-report.md` переписан под финальную ревизию: Spec revision пересчитан В КОНЦЕ, ПОСЛЕ
последнего чтения файла (`3d15453d677b7ea7c282ce522e5b2bc20d3dd011b985b52817d3f6e58de683d4`), 24
требования (без изменения количества), `## Criterion scenarios` расширена до **38** строк (было 37,
добавлен `AC-scan-pipeline-38`). `REQUIREMENT:` тегов в `02_pseudocode.md` — **62** = 21+3+38,
сходится с числом «62/62» из задачи.

**Подтверждено цитатами, построчно (полные цитаты — в самом отчёте):**
- **PC3-01 закрыт**: `02_pseudocode.md:277` — `attempt_id` теперь включает `call_no`, примарный и
  эскалационный вызов получают РАЗНЫЕ `attempt_id` в пределах одного `fence`; `:280` — `late`
  ОБНОВЛЯЕТ исход того же `attempt_id`, не создаёт второе событие.
- **PC3-02 закрыт**: `AC-scan-pipeline-32` переписан на физически возможный сценарий (задание 15 с,
  строго внутри бюджета 30 с); новый `AC-scan-pipeline-38` тестирует симметричный случай (35 с →
  немедленный `failed(timeout)` без списания и без вызова) — оба полюса теперь непротиворечивы.
- **VS-06 (моя находка Попытки 3) закрыта**: `AC-scan-pipeline-19` явно переписан — «ключ НЕ
  детерминирован содержимым — отменённый в Попытке 3 механизм… здесь БОЛЬШЕ НЕ описывается»; Then
  теперь ссылается на реальный механизм (уборка орфанов по возрасту).
- **VS-07 (моя находка Попытки 3) закрыта**: таблица размещения `03_architecture.md` теперь содержит
  строки `FR-scan-pipeline-14…21`, включая путь `scripts/telemetry/model-calls.sh` для `FR-21`.

**Вердикт не изменился: 🟢 READY.** Средний балл 94/100 (FR-15/18/20 выросли на 1–2 балла каждое за
счёт устранения внутренних противоречий; агрегат не сдвинулся на уровне округления). **Новых находок
этим прогоном НЕ обнаружено.** Остаются только VS-01/VS-02 (low, без изменений все четыре попытки) —
completeness-замечания, безопасно оставленные на усмотрение Phase 3/4.

### Ворота (Попытка 4, финальный прогон)

Урок Попыток 2–3 применён ПРЕВЕНТИВНО: заголовок таблицы сразу написан как `## Criterion scenarios`
(без хвоста `(38)`), полные id `AC-scan-pipeline-N` использованы сразу, отсутствие лишних `|`
проверено ДО первого запуска ворот. Тем не менее первый черновик снова содержал `(38)` в заголовке
(привычка с Попытки 3) — исправлено ДО прогона командой grep+sed, без затраты попытки ворот.

```
VERDICT report-revision=PASS features=3 gaps=0 inconclusive=0
VERDICT criterion-scenarios=PASS features=3 gaps=0 inconclusive=0
```
Код возврата: **0** — чистый, без единого `GAP`/`NOT-ESTABLISHED`, включая контур
`consent-and-telegram-auth` (её `report-revision` тоже теперь `PASS` — стал актуальным независимо от
этой задачи).

Status: completed
