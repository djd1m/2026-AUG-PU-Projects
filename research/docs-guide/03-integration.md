# CJM и ADR: механически проверяется ли их интеграция в Specification?

Объект: `projects/01-testimonials-senja/`. Метод: грепы + построчное чтение реальных файлов,
без предположений. Все команды и их вывод — ниже, без сокращений там, где это важно для вывода.

## Прямой ответ

| Вопрос | Ответ | Слой (см. cost-of-detection ladder) |
|---|---|---|
| Интеграция **CJM** в Specification проверяется механически (пайплайном)? | **Нет.** Проверка была сделана один раз вручную отдельным swarm'ом валидации (`docs/validation/05-coherence.md`), не является частью `sparc-prd-mini` / `requirements-validator` | 4/5 (в этом прогоне сработало; в общем случае — нет гарантии) |
| Интеграция **ADR** в Specification/Architecture проверяется механически? | **Частично и не там, где производится ADR.md.** `cc-toolkit-generator-enhanced` ищет ADR только по пути `docs/adr/*.md` (idea2prd), а `/replicate` производит `docs/ADR.md` (SPARC, единый файл) — при детекции пайплайна `has_adr` для SPARC-проекта **всегда `False`**, вне зависимости от содержимого файла. Реальный ADR→план gate (`check-plan-completeness.mjs`, C1/C2) существует, но **только внутри `feature-adr`**, для его собственной структуры `03_adr/` + `06_implementation_plan.md` — к SPARC/`docs/ADR.md` он не применяется | 1 (баг в детекторе, легко чинится тестом), для `feature-adr` — 1/3 (но не на этом проекте) |

---

## 1. CJM — что нашлось

### 1.1 Грепы по `.claude/`

```
$ grep -rn -i "cjm\|customer journey" .claude/
```
Совпадения — только в `reverse-engineering-unicorn` (генерация прототипа CJM, Phase 0) и в
`feature-adr-conventions.md` (список того, что несёт `/feature-adr`, включая "CJM prototypes").
**Ноль совпадений** в `sparc-prd-mini/SKILL.md`, `requirements-validator/`, `cc-toolkit-generator-enhanced/`.
Значит: ни один из механизмов, которые реально формируют/валидируют Specification.md, не знает
слова "CJM" — нет инструкции "перенеси выбранный вариант в Specification", нет проверки "CJM
отражён в требованиях".

### 1.2 Что нашлось фактически на проекте 01

`Specification.md` — **0 упоминаний** CJM. Но `PRD.md` §2.3 и §9 **явно** ссылаются на
`CJM_Variants.md` и фиксируют разрешение конфликта (см. ниже) — то есть перенос произошёл на
уровне PRD, следующий слой (Specification) наследует смысл без прямой ссылки. Это нормально для
типовой цепочки discovery → PRD → Specification, но означает, что **сам факт наследования нигде
не проверяется** — если бы кто-то забыл перенести, отличить "забыли" от "сознательно другое
решение" было бы невозможно без ручного чтения.

### 1.3 Матрица: элемент CJM (Вариант A, выбранный) → отражение в требованиях

| Элемент CJM (Variant A) | Где должен быть отражён | Отражён? | Доказательство |
|---|---|---|---|
| Aha Moment: «нашли 47 отзывов» | PRD/Specification | **Переопределён явно** | PRD §2.3: конфликт зафиксирован, новое определение — «стена живёт на домене», обоснование дано |
| Entry Hook (S1: «отзывы разбросаны по 8 местам») | PRD Problem Statement | Да | PRD §2.2, сегмент S1 |
| Onboarding: авто-скан 30+ платформ | Specification (или явное исключение) | **Исключён явно** | PRD §1.2 «Не входит», §6.2 «мини-импорт CSV» как отложенное |
| **Core Loop: еженедельный дайджест «3 новых отзыва найдено»** | Specification / PRD | **НЕТ — ни отражения, ни явного исключения** | `grep -n -i "дайджест\|digest\|core loop\|weekly" docs/Specification.md docs/PRD.md` → **пусто** |
| Paywall: сразу после Aha, на эмоции | FR-GROWTH-003 | Да | Specification.md FR-GROWTH-003 (badge на free, снятие на paid) |
| Invite/Referral: «Powered by» → вирусный контур | FR-GROWTH-001, FR-GROWTH-003 | Да | Specification.md |
| Экраны (6 шагов, AARRR) | PRD §5 User Journey | Да, переписано (7 шагов) | PRD §5 — не буквальный перенос, но согласован по смыслу |
| Варианты B, C (отклонённые) | PRD §6.2 «следующая итерация» | Да, зафиксированы как отложенные, не потерянные | PRD §6.2: C2PA (B), AI-visibility (C) |

**Находка:** единственный по-настоящему потерянный (не перенесённый и не исключённый явно)
элемент CJM — **Core Loop** варианта A. Это не критично для MVP недели (он зависел от
исключённого импорта), но факт, что решение о нём никак не задокументировано (в отличие от
Onboarding, для которого исключение прописано явно), означает, что перенос CJM в требования был
**избирательным и негарантированным**, а не системным.

### 1.4 Что реально нашла ручная проверка (для контраста)

`docs/validation/05-coherence.md` (побочный продукт отдельного swarm-прогона валидации, НЕ
стандартный артефакт `requirements-validator`, см. §4) содержит:

- **C8** — атрибуция цитаты «отзывы разбросаны по 8 местам»: `Solution_Strategy.md` §3 ошибочно
  приписывает эту фразу источнику «PRD §3.1», хотя дословно она взята из `CJM_Variants.md`
  (Entry Hook, вариант A) — найдена **неверная ссылка на источник** ручной сверкой текста.
- Подтверждение существования `discovery/cjm-prototype.html` и ссылок на него.

`docs/DIFF-discovery-vs-sparc.md` прямо признаёт:

> 🟡 CJM-варианты не переоценены под growth. Три варианта из discovery остались как есть...
> `CJM_Variants.md` не обновлён под новый формат.

Это **честная фиксация пробела**, но она существует только потому, что кто-то в конкретном
прогоне решил её написать — не потому, что пайплайн этого требует. Ни `sparc-prd-mini`, ни
`requirements-validator` не содержат правила «сверить CJM с финальными требованиями».

---

## 2. ADR — что нашлось

### 2.1 Грепы по `.claude/`

```
$ grep -rln -i "adr" .claude/
```
Даёт десятки файлов, но по существу два независимых мира:

1. **`cc-toolkit-generator-enhanced`** (генератор тулкита для `/replicate`, Phase 3) — упоминает
   ADR в модулях 01, 02, 03, 04, 05, 06, но **всегда через путь idea2prd `docs/adr/*.md`**.
2. **`feature-adr`** (отдельный, независимый пакет `@dzhechkov/skills-feature-adr`) — своя
   ADR-дисциплина (MADR+Confirmation), свой gate `check-plan-completeness.mjs`, свой путь
   `features/<slug>/03_adr/`.

Эти два мира **не пересекаются**: `feature-adr` не читает `docs/ADR.md`, а
`cc-toolkit-generator-enhanced` не знает про `features/<slug>/03_adr/`.

### 2.2 Ключевая находка — детектор `has_adr` слеп к SPARC-формату ADR

`.claude/skills/cc-toolkit-generator-enhanced/modules/01-detect-parse.md`, Step 1 (список
файлов SPARC-пайплайна для сканирования):

```
# SPARC pipeline files (top-level or docs/)
PRD.md, Solution_Strategy.md, Specification.md, Pseudocode.md, Architecture.md,
Refinement.md, Completion.md, Research_Findings.md, Final_Summary.md, CLAUDE.md
```

**`ADR.md` в этом списке нет вообще**, хотя `.claude/commands/replicate.md` (строка 230)
официально относит `docs/ADR.md` к стандартному набору из 11 SPARC-документов Phase 1.

Step 2 того же модуля, детекция пайплайна:

```python
has_adr = len(glob(f"{docs_path}/docs/adr/*.md")) > 5   # ищет ДИРЕКТОРИЮ docs/adr/, >5 файлов
...
elif has_sparc_arch and has_sparc_sol:
    return "SPARC"   # для проекта 01 — именно эта ветка
```

Для проекта 01 (`docs/ADR.md` — один файл, НЕ директория `docs/adr/`) `has_adr` **никогда не
станет `True`**, независимо от того, сколько в нём принятых решений. Все последующие условные
блоки — `IF has_adr: include ADR compliance verification list` (module 04, строка 93),
`IF has_adr: include top 5-10 ADR summaries` (module 04, строка 111), `ADR Security Boost` для
`security.md` (module 02, строка 229) — **не активируются для SPARC-проектов в принципе**, это
не "модель забыла", а структурный path mismatch в коде детектора.

Эмпирическая проверка: у проекта 01 `.claude/` не сгенерирован (Phase 3 `/replicate` не
запускалась) — поэтому нельзя показать "0 упоминаний ADR в сгенерированном тулките" так же
прямо, как в прецеденте с growth-engine. Но доказательство того же типа — грепом по коду
самого генератора:

```
$ grep -n "docs/ADR\.md" .claude/skills/cc-toolkit-generator-enhanced/modules/*.md
(пусто)
```

### 2.3 Матрица: ADR → требование в Specification.md / Architecture.md

| ADR | Решение (кратко) | Упомянут в Specification.md? | Упомянут в Architecture.md / Pseudocode / C4? | Оценка |
|---|---|---|---|---|
| ADR-001 | Shadow DOM изоляция виджета | Нет | Да (`Architecture.md:202`, `Refinement.md:213`) | Отражён, но не в Specification (она пишется раньше Architecture) |
| ADR-002 | Серверная проверка тарифа для badge | **Да** (`:162`, `:330`) | Да (Architecture, C4, Pseudocode) | Единственный ADR с обратной ссылкой из Specification — добавлен по итогам ручной валидации (см. §3) |
| ADR-003 | Приоритет промокода над cookie | **Нет** (0 упоминаний "ADR-003" вне ADR.md) | Нет | Содержательно решение продублировано прозой в FR-GROWTH-002 («приоритет у промокода... правило фиксируется здесь»), но **без единой явной ссылки на ADR-003** ни в одну сторону |
| ADR-004 | Порог `noindex` (3 отзыва / 400 симв. / >20 проектов/час) | Нет прямой ссылки (числа те же, без "ADR-004") | Да, 1 раз (`Architecture.md:163`) | Числа совпадают дословно, но связь не трассируема автоматически — сам ADR-004 признаёт, что перенёс числа ИЗ Specification, а не наоборот |
| ADR-005 | Граница Claude API / FTC | Нет | Да (`Architecture.md:55, 261`) | ADR-005 сам ссылается на "Specification.md FR-NFR-SEC-002" в заголовке, обратной ссылки нет |
| ADR-006 | Идемпотентность вебхуков | Нет | Да (5 мест в Architecture.md) | Аналогично — контракт идемпотентности реализует FR-GROWTH-002, но без явной метки "ADR-006" в Specification |
| ADR-007 | Caddy/TLS | Нет (в Specification вообще нет NFR про TLS) | Да (`Architecture.md:390, 403`) | Написан **позже**, как реакция на находку валидатора W-3 («нет ADR на Caddy») — до этого отсутствовал вовсе |

**Пустые ячейки — это находка**: 6 из 7 ADR не имеют обратной ссылки из Specification.md
(только ADR-002 — единственное исключение, и оно появилось не по правилу пайплайна, а по
конкретной рекомендации ручного coherence-отчёта, пункт 6 в его "Плане возврата на Phase 1"). Это
системно объяснимо: `Specification.md` пишется в Phase 3 `sparc-prd-mini`, `ADR.md` — продукт
Phase 5 (Architecture), т.е. **раньше во времени, чем решения, которые он должен бы содержать**.
Прямая связь идёт только вперёд (Architecture/Pseudocode/C4 цитируют номера ADR), а обратного
шага "обнови Specification под принятые ADR" в `sparc-prd-mini` **не существует**.

---

## 3. Обратная проверка — противоречия Specification ↔ ADR

Известный (уже задокументированный) случай: `FR-GROWTH-003` изначально требовал **безусловного**
восстановления видимости badge, `ADR-002` честно признавал недостижимость этого для случая
сокрытия родительского контейнера. Найдено ручной валидацией
(`docs/validation-report.md`, находка C-2, "🔴 Критично") и **уже исправлено** — текущий текст
`FR-GROWTH-003` (Specification.md:330-373) содержит раздел «Достижимая граница (ADR-002)» и
отдельный `@security`-сценарий, честно описывающий недетектируемый случай.

Целевой построчный поиск других противоречий (ADR-005 vs FR-NFR-SEC-002, ADR-006 vs FR-GROWTH-002,
ADR-004 vs FR-GROWTH-005) **новых противоречий не выявил** — содержание совпадает по существу
во всех трёх парах. Других расхождений Specification ↔ ADR **не найдено** — этот вывод основан на
прямом построчном сравнении текста, не на предположении.

Важная оговорка: то, что противоречие ADR-002/FR-GROWTH-003 было найдено и исправлено, доказывает
не наличие механизма, а его **единичное, ручное срабатывание** — этим и занимался
`docs/validation/05-coherence.md`, отдельный swarm-прогон (см. git-историю ниже), не стандартный
шаг `/replicate` или `/feature`.

```
$ git log --oneline -- projects/01-testimonials-senja/docs/validation/
4dce591 validation(01): re-validation report - B-4 closed on paper only
910475e validation(01): coherence report - 78/100, 10 contradictions
f1229ce validation(01): acceptance criteria report
138992d validation(01): user stories INVEST report - 87.3/100, 0 blocked
d235b0f validation(01): architecture report - 62/100 CAVEATS
```

`requirements-validator/SKILL.md` (стандартный скилл, который реально вызывает `/replicate`
Phase 2) производит **один файл** `validation-report.md`, не серию `01…06-*.md` — файлы
`docs/validation/01-06` являются продуктом отдельного, более глубокого ручного/swarm-прогона,
не воспроизводимого автоматически при обычном запуске пайплайна.

---

## 4. Что даёт `feature-adr`, чего нет в `p-replicator`

`feature-adr` (модуль `.claude/skills/feature-adr/modules/03-adr.md` + Step 8
`08-qe.md` + скрипт `check-plan-completeness.mjs`) реализует **настоящий machine-checkable
gate**, а не "ревьюер заметит":

- Каждый ADR обязан иметь секцию **Confirmation** (метод проверки, метрика, владелец,
  load-bearing свойство) — 100%-требование, форсируется на Step 3.
- **K2-gate** (`check-plan-completeness.mjs`, между Step 6 и Step 7):
  - **C1** — каждый файл `03_adr/*.md` обязан иметь ≥1 строку задачи в
    `06_implementation_plan.md`, цитирующую его номер (grep по `ADR-00N`).
  - **C2** — каждое свойство из секции Confirmation каждого ADR обязано быть названо в плане
    по пути тестового файла.
- **Step 8 QE** повторно проверяет "Confirmation-to-test link": если у load-bearing свойства ADR
  нет реального автотеста — оценка не выше `C`, фиксируется blocker gap.
- **Amendment Gate** (`dz amendment-check`) — тот же принцип для правок, добавленных на этапе
  ideation (Step 3.5): каждая поправка обязана нести собственный Confirmation-тест, который
  **падает при откате поправки** (non-vacuous).

Это ровно то, чего структурно нет в `cc-toolkit-generator-enhanced`: там ADR — источник для
опционального обогащения тулкита (`IF has_adr: include...`), а не входной контракт с
обязательной проверкой присутствия в дальнейших артефактах.

**Ограничение**: этот механизм существует **только внутри пайплайна `/feature-adr`**, для его
собственной директории `features/<slug>/`. К `docs/ADR.md`, порождаемому `/replicate` для
SPARC-проекта (как проект 01), он не применяется и применяться не может без интеграционной
работы — два пайплайна ADR в этом репозитории не связаны.

---

## 5. Вывод по лестнице обнаружения

| Проверка | Текущий слой | Обоснование |
|---|---|---|
| CJM-элемент перенесён в требования или явно исключён | **4/5** | Существует только как разовая находка ручного coherence-swarm’а (`docs/validation/05-coherence.md`, `DIFF-discovery-vs-sparc.md`); ни в `sparc-prd-mini`, ни в `requirements-validator` нет ни слова "CJM" |
| ADR учтён генератором тулкита (`cc-toolkit-generator-enhanced`) | **1, но сломан** | Детерминированная проверка (`has_adr` glob) существует, но ищет не тот путь — `docs/adr/*.md` вместо `docs/ADR.md`; для SPARC-проектов гарантированно `False` |
| Решение ADR отражено в Specification.md обратной ссылкой | **отсутствует как проверка** (0/5) | Существует только "естественный" перенос вперёд (Architecture цитирует ADR), обратного шага в `sparc-prd-mini` нет вообще; единственное исключение (ADR-002) — ручная правка по итогам разового аудита |
| Specification не противоречит принятым ADR | **4/5 в этом прогоне; структурно 0** | Единственное найденное и исправленное противоречие (FR-GROWTH-003/ADR-002) — заслуга разового `docs/validation/05-coherence.md`, не встроенного правила |
| ADR несёт proof — реализовано в коде (Confirmation-to-test) | **1/3, но только в `feature-adr`, не в `/replicate`** | `check-plan-completeness.mjs` C1/C2 — настоящий layer-1/3 gate; неприменим к `docs/ADR.md` |

Итог тем же тоном, что и growth-engine прецедент: и CJM, и ADR **хорошо и содержательно
прорабатываются** в discovery/architecture-документах — но нет **принудительного** механизма,
который бы (а) заставил каждый элемент CJM либо попасть в Specification, либо быть явно
списанным, и (б) заставил каждый ADR либо получить обратную ссылку в Specification, либо
получить явную пометку "решение принято позже, Specification не пересматривается". Оба случая —
классический **тупик слоя 4/5**: сработало один раз, потому что кто-то решил проверить вручную.

## 6. Предлагаемые gates (по образцу `GROWTH-MECHANICS-REQUIREMENTS.md` §5)

| # | Проверка | Слой | Механизм |
|---|---|---|---|
| G1 | В `docs/Specification.md` для каждого варианта CJM, отмеченного в `CJM_Variants.md` как отклонённый или изменённый, есть явная фраза-маркер (например, "исключён из scope" / "переопределён") | 1 | `sparc-prd-mini` при заполнении Phase 3 обязан писать за каждый пункт CJM-таблицы (Aha Moment, Entry Hook, Onboarding, Core Loop, Paywall, Invite) один из трёх статусов: `отражён в FR-<id>` \| `явно исключён (§X)` \| нет статуса → **FAIL**. Проверяется grep-diff множества строк CJM-таблицы против множества маркеров в Specification/PRD |
| G2 | `has_adr` в `cc-toolkit-generator-enhanced/modules/01-detect-parse.md` должен видеть `docs/ADR.md` (SPARC) не только `docs/adr/*.md` (idea2prd) | 1 | Однострочный фикс: `has_adr = exists(f"{docs_path}/ADR.md") or len(glob(f"{docs_path}/docs/adr/*.md")) > 5`; регрессионный тест на проекте 01 (`has_adr` должен стать `True`) |
| G3 | Каждый `## ADR-NNN` из `docs/ADR.md` имеет ≥1 обратную ссылку `ADR-NNN` где-то в `Specification.md` **или** явную пометку `[ADR принят после Specification, обратная сверка не требуется]` | 1 (grep) | Скрипт: извлечь номера ADR из `ADR.md`, для каждого — grep по `Specification.md`; отсутствие обоих условий → FAIL. Аналог C1 из `check-plan-completeness.mjs`, но нацеленный на `docs/ADR.md`/`Specification.md`, а не на `features/<slug>/` |
| G4 | Phase 2 (`requirements-validator`) обязан включать раздел "CJM/ADR coherence" по образцу существующего Security-раздела — **безусловно**, не опционально | 3 | Добавить в `requirements-validator/SKILL.md` шаг, аналогичный уже существующему у growth ("Growth Mechanics Acceptance Criteria"), с формальным чек-листом G1/G3 внутри `validation-report.md` |
| G5 | «Валидатор на Phase 4 заметит несоответствие CJM/ADR» | 4/5 | ❌ Антипаттерн — именно так это и работает сегодня; не использовать как единственную защиту |
