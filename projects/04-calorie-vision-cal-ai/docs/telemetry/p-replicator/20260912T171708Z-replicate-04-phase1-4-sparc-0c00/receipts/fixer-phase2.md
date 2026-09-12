# Fixer Phase 2 — раунд 1 исправлений по квитанции validator-docs-coherence

Project: N4 «Тарелка» (`projects/04-calorie-vision-cal-ai`).
RUN_ID: 20260912T171708Z-replicate-04-phase1-4-sparc-0c00 · WORK_UNIT_ID: fixer-phase2.
Раунд: 1 (V1-R01…R04, R06). Коммитов не делал.

requested: claude-opus-5; actual: unknown to worker

## Находка → файл:строка → что сделано

| Находка | Файл:строка | Что сделано |
|---|---|---|
| V1-R01 blocker (DEC-A-002, вариант a) | `docs/Pseudocode.md:40` | `scan_quota_counter.scope` — закрытый набор из ТРЁХ значений `user / global / escalation`; `scope_key` для `global` и `escalation` — константа `all` |
| V1-R01 | `docs/Pseudocode.md:77-88` | `CheckAndConsumeQuota(reason ∈ {primary, escalation})`. Шаг 1: ненастроенный ЛЮБОЙ из трёх потолков валит старт. Шаг 2: `primary` — три ключа (user/session_id/10, user/ip_prefix/10, global/all/3000), `escalation` — ЧЕТЫРЕ (те же три + escalation/all/600). Шаг 3: все ключи попытки в ОДНОЙ транзакции, `INSERT … ON CONFLICT … DO UPDATE SET used = used + 1 WHERE used < limit RETURNING`. Шаг 4: отказ любого ключа → откат ВСЕЙ транзакции и `refused(scope)` без вызова модели (откат транзакцией, а не встречными декрементами: параллельная попытка между инкрементом и декрементом увидела бы завышенное значение) |
| V1-R01 | `docs/Pseudocode.md:99` | `EnqueueScan` шаг 3 зовёт `CheckAndConsumeQuota(session, reason = primary)` (было `'first_call'`); `429` несёт `scope` |
| V1-R01 | `docs/Pseudocode.md:121-122` | `RecognizeScan` шаг 5: `CheckAndConsumeQuota(reason = escalation)` ДО Sonnet 5; отказ (включая потолок 600) → результат первичной модели сохраняется, скан завершается `done` с признаком `low_confidence`, НЕ `failed` и НЕ `refused`. Шаг 6: признак вычисляемый (`status = done AND confidence < 0,6`), отдельной колонки не требует |
| V1-R01 | `docs/Pseudocode.md:346-347` | Маршрут 1: `429` с телом `{ limit, reset_at, scope }`. Маршрут 2: в ответе `low_confidence` и `escalated` |
| V1-R01 | `docs/Architecture.md:144` | Физическая схема: `scope` — enum из 3 значений; названо, почему третье значение — отдельная строка счётчика, а не пометка на существующей |
| V1-R01 | `docs/ADR.md:137,143-153,160-168` | Заголовок ADR-007 назвал третий потолок; Decision — «ТРИ числа канона», каждому свой `scope`; Confirmation — три падающих теста: 601-я эскалация за сутки отказывается без вызова Sonnet 5 (счётчиком обращений к провайдеру, не текстом лога) и скан при этом `done` + `low_confidence`; отсутствие ЛЮБОЙ из трёх переменных валит старт — три отдельных прогона; конкурентный прогон 20 эскалаций при остатке 1 |
| V1-R01 | `docs/Refinement.md:17` | Edge case опирается на ЧЕТВЁРТЫЙ ключ `scope = escalation`, а не на «тот же счётчик»; исход — `done` + `low_confidence` |
| V1-R01 | `docs/Refinement.md:58-64` | Критический путь 1: конкурентный тест обязателен ОТДЕЛЬНО для четвёртого ключа — зелёный тест на трёх ключах ничего не говорит о четвёртом |
| V1-R01 | `docs/Completion.md:24-30` | Чек-лист: три числа с именами `scope`; проверять тремя отдельными прогонами, потому что проверка одной переменной зеленеет при отсутствующей второй |
| V1-R01 | `CLAUDE.md:49-56` | Инвариант квоты: три потолка, три строки счётчика, четвёртый ключ у эскалации; отказ по `escalation` не выбрасывает оплаченный первичный результат |
| V1-R01 | `docs/Specification.md:53-63,149-160` | FR-RECOGNIZE-002 — третий потолок и поведение `low_confidence`; FR-LIMIT-002 — «суточных потолков ДВА», 600 эскалаций отдельным счётчиком, остаток КАЖДОГО из трёх виден оператору, отказ называет `scope`, ненастроенный ЛЮБОЙ валит старт |
| V1-R01 | `docs/Specification.md:624` · `docs/PRD.md:276` · `docs/Final_Summary.md:79` | Метрика «доля попыток, завершённых отказом по потолку» получила разбивку по `scope`; строка остаётся байт-в-байт одинаковой в трёх документах |
| V1-R02 high | `docs/Architecture.md:143` | Колонка `attribution.replaced_source` — nullable enum тех же трёх значений, с названной ценой отсутствия (прямой перевод схемы в DDL молча потерял бы поле) |
| V1-R02 | `docs/Architecture.md:243,258` | Счёт расхождений 11 → 12; двенадцатая строка таблицы Reconciliation — `attribution.replaced_source` |
| V1-R03 high | `docs/ADR.md:186-193` | ADR-008 Confirmation переписан на ТРИ исхода; названо, что уникальный индекс гарантирует единственность строки, но не её неизменность, и тест, ожидающий здесь отказа от ограничения, проверял бы запрещённую реализацию |
| V1-R03 | `docs/Refinement.md:20` | Edge case «Повторный apply кода» — три входа и три исхода; лечение названо кодом, а не ограничением вставки |
| V1-R03 | `docs/Refinement.md:41` | Убрано остаточное «`attribution.device_session_id` на конфликте вставки, а не на проверке в коде» — того же класса ошибка, что и в ADR-008 |
| V1-R03 | `docs/Architecture.md:259` | Последняя строка Reconciliation: «требует правки Pseudocode… передано координатору» → «закрыто: `Pseudocode.md` приведён к трём исходам», с перечислением исходов |
| V1-R03 | `docs/Specification.md:244-257` | Два Gherkin-сценария под `@FR-GROWTH-002 @growth @edge-case`: «слабая + explicit → 200 applied с `replaced_source = cookie`» и «слабая + слабая → 409 с `existing_source`». Без `SC-US-nnn-k`, поэтому множества SC не изменились |
| V1-R04 medium | `docs/Pseudocode.md:352` | Контракт маршрута 7: `409` покрывает ОБЕ конфликтные ветки (existing `explicit` + любой код; слабая + слабая), тело `{ existing_source }` |
| V1-R06 low | `docs/Architecture.md:63,64,82,135,144,197` | Точные токены ADR-001, ADR-003, ADR-005, ADR-006, ADR-007, ADR-009, ADR-010 — по одному упоминанию в разделе, где решение реализуется |

**V1-R05** (canon.md §2 — область `OPS` в списке областей NFR) закрыт координатором в каноне до
начала раунда: `canon.md:26` уже перечисляет PERF/SEC/SCALE/OPS. `canon.md` мне не принадлежит,
правок не вносил.

## Отклонение от формулировки задания — одно, названное

Задание просило «`429 quota_exceeded` с полем `scope`». Поле `scope` добавлено. Код ошибки оставлен
прежним — `quota_exhausted`: он согласован с закрытым перечислением `recognition.failure_reason`
(`quota_exhausted_user` / `quota_exhausted_global`) и с текстом Specification. Переименование
потребовало бы править перечисление сущности и создало бы расхождение того же класса, который этот
раунд закрывает. Если координатор настаивает на `quota_exceeded`, это правка трёх мест и делается
вторым пакетом.

## Коды ворот (из каталога проекта)

| Проверка | Код |
|---|---|
| `node ../../.claude/hooks/check-docs-complete.cjs .` | 0 |
| `node ../../.claude/hooks/check-growth-trace.cjs .` | 0 |
| `node ../../.claude/hooks/check-look-trace.cjs .` | 0 |
| `node ../../.claude/hooks/check-metric-source.cjs .` | 0 |
| `node ../../.claude/hooks/check-external-deps.cjs .` | 0 |
| `node ../../.claude/hooks/check-model-cost.cjs .` | 0 |
| `node ../../.claude/hooks/check-handoff-manifest.cjs .` | 0 |

## Самопроверка скриптом, испытанная на внедрённом дефекте

Скрипт: `/tmp/claude-0/-home-dz-projects-2026-2026-AUG-PU-Projects-2026-AUG-PU-Projects/0c3fce04-3ca0-42bc-b5a7-fcb38e1228ce/scratchpad/selfcheck.py`
(временный, вне проекта — правило «не сохранять рабочие файлы в корень»).

Проверяет четыре свойства: каждый `REQUIREMENT:` Pseudocode существует как `### ` заголовок
Specification (33 из 33); множества `SC-US-nnn-k` совпадают в обе стороны (26 = 26); каждое
перечисление значений `scope` равно трём каноническим и двухзначной формы не осталось (4
перечисления); каждое перечисление значений `source` лежит внутри трёх канонических (4 перечисления,
поля `POST /interest.source` и `food_item.source` исключены явно — это другие поля с тем же именем).

Страж испытан на способность падать (`guard-must-be-able-to-fail.md`): во временную копию
`Pseudocode.md` внесены три дефекта сразу — `REQUIREMENT: FR-LIMIT-999`, `REALISES: SC-US-099-9`,
двухзначный `scope: user / global`.

```text
с внедрёнными дефектами  ->  4 FAIL, RESULT: DEFECTS FOUND, exit=1
после восстановления     ->  0 FAIL, RESULT: OK,             exit=0
```

Status: completed
