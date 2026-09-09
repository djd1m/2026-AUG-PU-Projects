**Verdict:** 🟡 CAVEATS

# N3a — результат проверки PRD и плана
Spec revision: sha256:ebdbb78650429072e998d694460501894a5f87ca049f7af0828df826898aa8f7

Дата: 2026-09-09. RUN_ID: `20260909T174821Z-prd-a-1934`.
Профиль `compact-quality-first-v2`, риск XL. Проверенный кандидат: `1e346bef85cb13cb3cb37bc0eb55e01ec5af7fad` (опубликован как `b0e7365`).

Шесть направлений документальной проверки завершены. Открытых blocker/high замечаний к проверенному техническому плану нет. Это не приёмка приложения и не утверждение владельцем предложенного изменения объёма D7. До кода остаются решение по D7 и рассмотрение конкретного XL-плана.

Публикация добавляет этот отчёт, receipts/телеметрию и обновляет только метки состояния PRD, плана, резюме и CLAUDE. Точные до/после SHA и diff находятся в [publication-status-overlay](telemetry/p-replicator/20260909T174821Z-prd-a-1934/evidence/publication-status-overlay.json). Нормативные Specification, Pseudocode, Architecture, ADR, C4, Refinement и BDD совпадают с проверенным кандидатом. Старые receipts относятся к указанным в них версиям и не выдаются за полное повторное ревью финального пакета.

## Что сохранено из решения владельца

- CJM A — «Через вознаграждение»; альтернативы B/C сохранены как история выбора.
- Первая интеграция N1 Proofwall, ЮKassa проверяется на стороне N1.
- Владелец самостоятельно переводит доход за предыдущий календарный месяц каждого 5-го числа. Срок относится к переводу, CSV денег не отправляет.
- Код N1/N2 сначала исследуется на пригодность; N2 — только донор. Старый N3 не входит в scope.
- N3a хранит самостоятельный журнал начислений/корректировок и реестры, без общей БД или runtime-импортов соседних проектов.

## Шесть независимых направлений

Все ссылки ниже находятся в `docs/telemetry/p-replicator/20260909T174821Z-prd-a-1934/`.

| Направление | Запрошенная модель | Результат и доказательство |
|---|---|---|
| User stories / INVEST | Sol high | CAVEATS, 90.8/100, 0/13 ниже порога; [stories-v2](telemetry/p-replicator/20260909T174821Z-prd-a-1934/stories-v2.md) |
| Acceptance / SMART | Sol high | CAVEATS, 90.3/100 в обязательном контуре; A1–A4 закрыты; [acceptance-v2](telemetry/p-replicator/20260909T174821Z-prd-a-1934/acceptance-v2.md) |
| Архитектура и consequential challenge | Astra xhigh | CAVEATS, CH01–05 и обе находки v2 закрыты; [architecture-v3-review](telemetry/p-replicator/20260909T174821Z-prd-a-1934/architecture-v3-review.md) |
| Денежные алгоритмы | Astra high | PASS для финальной коррекции с сохранением прежних закрытий; [pseudocode-v3-review](telemetry/p-replicator/20260909T174821Z-prd-a-1934/pseudocode-v3-review.md) |
| Междокументная согласованность | Sol high | READY в области проверки, COH01–03 закрыты; [coherence-v2](telemetry/p-replicator/20260909T174821Z-prd-a-1934/coherence-v2.md) |
| Внешние возможности | Sol high | READY, 4/4 CONFIRMED; [dependencies-v1](telemetry/p-replicator/20260909T174821Z-prd-a-1934/dependencies-v1.md) |

У каждой роли свой агент и файл результата; автор архитектуры не принимал собственные изменения. Коррекции ограничены тремя итерациями; после изменений повторно проверялись затронутые области. Разные модели одного поставщика не доказывают независимость ошибок.

**Valid receipts / required receipts: 6/6.** Проверены regular/non-symlink, содержимое, точный конечный `Status: completed`, SHA и изменение после записанного dispatch при исходном отсутствии файла. [Протокол проверки receipts](telemetry/p-replicator/20260909T174821Z-prd-a-1934/evidence/receipts-verification.json). Нет недоставленных финальных work units. Исторический pseudocode-v1 с неверным размещением terminal marker был отклонён и исправлен до использования; это не скрыто в events.

## Качество требований и сценарии

36 уникальных требований (27 FR + 9 NFR), у каждого один точный владелец в Pseudocode. 13 историй; 51 уникальный SC сопоставлен с 51 именованным BDD-сценарием. Из них 50 относятся к обязательному описанному контуру, SC-US-009-4 проверяет пока не принятое предложение D7. Его наличие не утверждает сокращение первоначального monetary dogfooding.

48 SC имеют алгоритмическую ссылку; SC-US-012-1/2/3 явно исключены как `ui-only`. Дублирующих или потерянных идентификаторов нет. [BDD и Criterion scenarios](test-scenarios.md) содержат актуальный SHA Specification.

У всех 13 историй Testable/Completeness/Traceability выше нуля, цитаты критериев и таблица связей приложены в независимых receipts. Минимальная итоговая оценка — 84 в INVEST-проходе, 78 в SMART-проходе; средние двух разных проходов не смешиваются. Security +5 и Growth +5 записаны отдельно от 100-балльных оценок. Эти числа — оценки документов, не доля пройденных runtime-тестов.

Остаётся medium-оговорка STORIES-SIZE: US-003/006/007/008/012 описывают составные результаты. В [плане](implementation-plan.md) заданы зависимости и очередность; при подготовке каждой реализации они разбиваются на ограниченные задачи с собственными AC и файловым владением. Продуктовые US/SC-ID при этом сохраняются.

## Gap Register

Одинаковые замечания разных ревьюеров сгруппированы по причине; строки не являются суммой сырых находок.

| Группа / исходные ID | Исходная тяжесть | Исправление / итог |
|---|---|---|
| G01: PSEUDO-01, CH-04 | high | Один persistent payer/person/year reserve для всех программ, баз и налоговых моделей; закрыто |
| G02: PSEUDO-02, CH-05, V2-01/ARV2-01 | high | Observation доступен при restore; атомарная замена резерва; HistoricalTaxBasis отдельно от пяти current counter decisions; закрыто финальными двумя Astra-проходами |
| G03: PSEUDO-03, CH-01, A-1 | high | Порядок доставки не меняет месячные суммы; signed correction и отдельные economic/audit hashes; единый отрицательный oracle; закрыто |
| G04: PSEUDO-04 | high | Identity-only session до согласия, минимальная membership создаётся атомарно после принятия; закрыто |
| G05: PSEUDO-05, CH-02 | high | Историческая пригодность ссылки/партнёра на регистрацию, immutable evidence; закрыто |
| G06: PSEUDO-06 | medium | Timezone неизменна после активации/первых учётных фактов; закрыто |
| G07: CH-03, ARV2-02, COH-01 | blocker | Везде единственный режим every eligible payment/lifetime; противоречивые first-only/finite варианты убраны; закрыто |
| G08: A-2 | high | Срок самого перевода5-го, actual/report dates раздельны; ранний/поздний факт сохранён и не назван своевременным; закрыто |
| G09: A-3, COH-03 | high | D7 явно назван неутверждённым предложением в начале плана, резюме и SC; неоднозначность закрыта, само решение владельца ожидается |
| G10: A-4 | medium | R1–R4: отсутствующие/уже включённые суммы, НПД coverage, A-before-B, разные inclusion flags, неизвестная история, replay/concurrency/crash; закрыто как тестовый контракт |
| G11: COH-02 | warning | План называет текущие stack/transport proposals; exact versions остаются задачей donor audit; закрыто |
| G12: STORIES-SIZE | medium | Укрупнённые истории требуют ограниченных реализационных задач; сохраняется как оговорка |

Исторические отчёты NEEDS WORK сохранены. Закрытие означает исправленный и перечитанный документальный контракт, не доказательство отсутствия дефектов будущего кода.

## Фактические проверки

[Полные результаты и SHA кандидата](telemetry/p-replicator/20260909T174821Z-prd-a-1934/evidence/candidate-v3-gates.json).

| Проверка | Результат |
|---|---|
| check-docs-complete | exit0, 11 обязательных непустых документов; диапазоны `[1..10000]`/`[−C,0]` — типы, не шаблоны |
| check-external-deps | exit0, четыре строки с закрытыми вердиктами и предъявленными первичными доказательствами |
| check-growth-trace / check-handoff-manifest | exit0 / exit0, 4 growth requirement и 14 discovery outputs прослежены |
| check-look-origin | exit0, гипотезы не выданы за живую съёмку |
| check-metric-source | exit0, источники четырёх итоговых метрик явно названы |
| Exact FR/SC/BDD linkage | exit0, 36/36, 51/51, 48+3 UI-only; SHA Specification в BDD совпадает |
| Размер документов / diff whitespace | все проверенные документы <500 строк; git diff --check exit0 |
| check-look-trace | exit2: «облик источника НЕ ИЗМЕРЕН, причина: no-browser-mcp» — не пройден |
| check-webhook-contract | exit2: «повторная доставка НЕ ВОСПРОИЗВОДИЛАСЬ, причина: not-implemented» — не пройден |

Проверки форматной полноты и внешнего инвентаря запускались до семантических волн. Механический complexity-router распознал docs-only как T; эффективный риск оставлен XL по деньгам/правам/интеграции. Риск не снижался из-за расширения файлов .md.

Локальный `scripts/check-pipeline-gaps.sh` дополнительно прошёл на исходном кандидате `cafe2c4`; это не замена неразрешившемуся `@dzhechkov/p-replicator/scripts/check-pipeline-gaps.sh` (MODULE_NOT_FOUND). Подключение обязательной пакетной утилиты нужно проверить/исправить перед будущим /feature. Ни установка toolkit, ни этот будущий gate не объявлены выполненными.

Прежние 110 Firefox-проверок относятся только к неизменённым HTML CJM. Runtime build/typecheck, PostgreSQL, concurrency/mutation, restore, N1/ЮKassa E2E, нагрузка, развёртывание и реальные переводы не выполнялись. Mermaid описан исходниками; визуальная отрисовка диаграмм отдельно не проверялась.

## Внешние зависимости

Четыре CONFIRMED возможности: payment/refund notifications с повторами, payment lookup, refund lookup, merchant-scoped authentication. Независимый reviewer открыл официальную документацию ЮKassa 2026-09-09; ссылки и короткие цитаты — в [Architecture → External Dependencies](Architecture.md#external-dependencies).

Раздел провайдера побайтно совпадает с проверенным dependencies-v1; [candidate-v3-gates](telemetry/p-replicator/20260909T174821Z-prd-a-1934/evidence/candidate-v3-gates.json) фиксирует прямое сравнение старого/нового раздела и SHA раздела по указанному способу извлечения. Новые изменения за пределами раздела касаются локального учёта/ролей/восстановления и не добавляют внешних API. Поэтому provider capability evidence переиспользовано, а не выдано за новый whole-document review. UNCONFIRMED: none. CONTRADICTED: none.

Это не подтверждает наличие credentials, тестового магазина, готового N1 outbox/refund/cursor adapter или налоговую применимость у конкретного плательщика. Их готовность остаётся отдельной проверкой реализации. MRR N1 — unknown; НПД/договор/YTD — подтверждаемые ручные inputs, не выдуманный ФНС API.

## Decision Coverage

Decisions in docs/ADR.md: 8 · named downstream: 8 · superseded: 0.

| Decision | Exact downstream mentions |
|---|---|
| ADR-001 | Architecture.md, C4_Diagrams.md |
| ADR-002 | Specification.md, Architecture.md |
| ADR-003 | Specification.md |
| ADR-004 | Specification.md |
| ADR-005 | Specification.md, Architecture.md |
| ADR-006 | Specification.md |
| ADR-007 | Architecture.md |
| ADR-008 | Specification.md |

Recorded but named nowhere:

none

Named downstream but absent from docs/ADR.md:

none

Проверены ровно PRD, Solution_Strategy, Specification, Pseudocode, Architecture, Refinement, Completion, C4_Diagrams. ADR.md и этот отчёт исключены из поиска упоминаний. Это доказательство именования, не исполнения решений.

## Следующий шаг и ожидаемое решение

[Конкретный XL-план D1–D7](implementation-plan.md#конкретные-решения-xl-плана-после-выбора-a) содержит очередность, модели, навыки, допустимый параллелизм и проверки. Авторизация частых commit/push действует. Кодовые стадии, production и реальные платежи не выдаются за выполненные или автоматически разрешённые этим отчётом.

D7 остаётся открытым вопросом владельцу: лиды собственной N3a на первом этапе с денежной партнёркой позже либо собственный биллинг и денежная партнёрка сразу. Первый вариант — явно предложенное сокращение исходного scope, не следствие выбора CJM A. До ответа нельзя выдавать его за принятое обязательство. Принятые N1/ЮKassa/ручные выплаты сохраняются при обоих решениях.

Правило репозитория [complexity-router.md](../../../.claude/rules/complexity-router.md) устанавливает: «XL — /feature полным циклом + остановка на плане у владельца». На этом чекпойнте представлен конкретный проверенный план; новое подтверждение каждого документа не требуется.

## Модели, процесс и измерения

Запрашивались Terra medium для доказательств, Sol medium для исходных требований, Astra high для архитектуры/её коррекций и денежного ревью, Sol high для остальных проверок, Astra xhigh для независимого consequential challenge. Координатор сохранял модель текущей сессии. Фактические model/effort не аттестованы хостом и записаны null, глобальная конфигурация не менялась; скрытый fallback не заявлен.

Оркестрация через доступные агенты Codex; исполнения Ruflo daemon/swarm инструментов не заявлено. Обычный предел два дочерних агента временно поднят до трёх для независимых проверок: отдельные worktree/receipts, один integration owner, общий лимит хоста4. Причина и все dispatch/retries записаны в events.

[Паспорт и измерения прогона](telemetry/p-replicator/20260909T174821Z-prd-a-1934/run.json) и [журнал событий](telemetry/p-replicator/20260909T174821Z-prd-a-1934/events.jsonl) содержат elapsed до чекпойнта, ожидания и их пробелы. Active wall/agent work/tokens/cost/quota неизвестны: неполны интервалы пауз, хост не отдаёт usage и billing. Начальное чтение до старта run и финальная публикация после checkpoint-снимка отдельно не измерены. Экономия пока не установлена; парного baseline нет. Семидневное наблюдение не запускалось.

Снимок checkpoint: 2026-09-09T17:48:21.808319+00:00 → 2026-09-09T19:24:17.335394+00:00, elapsed 5755527ms (включая паузы). Active/usage/cost не измерены. Статус run blocked означает ожидание решения владельца, а не провал документальной валидации.

## Criterion scenarios

| Criterion | Scenario |
|-----------|----------|

Совместимость с пакетной проверкой `/feature`: глобальная Specification использует SC-ID, а не AC-ID, поэтому эта таблица AC пуста. Все 51 глобальные SC и их BDD остаются в [test-scenarios.md](test-scenarios.md); таблицы конкретных AC создаются в `features/<feature>/validation-report.md`. Пустая таблица не подтверждает реализацию SC.

После исторического checkpoint владелец разрешил реализацию словом «продолжай»; запись разрешения находится в implementation-plan.md. D7 остаётся отдельным открытым решением. Добавление машинного SHA не является новым семантическим ревью.

Уточнение foundation после этого исторического ревью: Pseudocode/ADR выбирают N1 Argon2id вместо неопределённого donor scrypt и TTL24h. Это отдельная проверяемая детализация в `features/foundation/`; старые шесть receipts не утверждают проверку новой редакции этих двух документов.
