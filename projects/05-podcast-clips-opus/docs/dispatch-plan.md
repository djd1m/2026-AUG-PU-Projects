# План диспетчеризации Phase 1 — «КлипМейкер» (N5, клон Opus Clip)

**Пишущий фан-аут:** да
**Координатор пишет:** да
**Разрезы файлов:** нет
**Канон:** docs/canon.md
**Хеш канона:** (проставляется после заморозки канона, до запуска единиц)
**Проверка канона:** НЕ ВЫПОЛНЕНА
**Проверка владения:** НЕ ВЫПОЛНЕНА
**Причина:** план показан владельцу до запуска (правило «сначала план, потом действие», 21.09.2026)

RUN_ID: `20260921T183717Z-replicate-05-phase05-1-sparc-0e76`. Режим владельца: **cross-family review** —
планирование и проверка на семействе Anthropic, кодирование (после Phase 4) на семействе OpenAI; семейства не
совпадают. Вход Phase 1: постановка §05, `CJM_Variants.md` (D), `source-product-profile.md`, кодовая база
`2026-jan-pu-opus-clone` как референс, канон `docs/canon.md`.

## Стадии и модели (Anthropic — по классу задачи)

| Стадия | Единица | Модель · effort | Почему эта модель | Пишет |
|---|---|---|---|---|
| 0 · канон и контракты | координатор | Fable 5.1 | заморозка имён — решение с последствиями на все документы | `docs/canon.md`, `docs/dispatch-plan.md`, четыре контракта (`model-cost`, `long-job`, `webhook`, `embed`) |
| 1 · требования (последовательно, до фан-аута) | `spec-writer` | Opus 5, high | 30+ FR с Gherkin и промоушен двух семян: работа с понятными границами, но объёмная и точная | `docs/Specification.md`, `docs/PRD.md` |
| 2a · алгоритмы и данные | `algo-writer` | Opus 5, high | логическая модель, покрытие 100 % SC, машинные ключи REQUIREMENT | `docs/Pseudocode.md`, `docs/Research_Findings.md`, `docs/Solution_Strategy.md` |
| 2b · архитектура и решения | `arch-writer` | Fable 5.1 (координатор) | ADR по трём расхождениям с клоном (очередь, файлы, модели STT) — consequential design; инвентарь внешних зависимостей с цитатами | `docs/Architecture.md`, `docs/ADR.md`, `docs/C4_Diagrams.md` |
| 3 · эксплуатация и синтез | `ops-writer` | Sonnet 5, medium | edge cases, тесты, деплой, итог — ограниченная работа по готовым документам | `docs/Refinement.md`, `docs/Completion.md`, `docs/Final_Summary.md` |
| ворота | координатор | скрипты (слой 1) | детерминированные проверки, не суждение | — |

Стадии 2a и 2b идут параллельно после стадии 1 (обе читают замороженную Specification и канон); стадия 3 — после
сверки 2a↔2b (Reconciliation with Pseudocode). Одновременно не более двух пишущих агентов.
Каждая единица получает `WORK_UNIT_ID`, абсолютный `TRACE_PATH` в `docs/telemetry/p-replicator/<RUN_ID>/receipts/`
и пишет квитанцию со строкой `Status: completed|failed` последней. Координатор интегрирует только по квитанциям.

## Что решается на этой фазе (и записывается как ADR)

1. Очередь заданий: PostgreSQL (`FOR UPDATE SKIP LOCKED` + аренда с fence, как N4) против BullMQ/Redis клона.
2. Файлы: том Docker (постановка) против S3 клона; TTL клипов на free.
3. STT: `whisper-1` (слова) против `gpt-4o-transcribe-diarize` (сегменты + спикер) — критерий таймкоды; в D
   диаризации нет, но выбор модели не должен закрывать путь к полному B.
4. Метка (watermark) как часть тарифной архитектуры: где стоит, минимальный размер, короткая ссылка с кодом.
5. Оплата в неделе: экран интереса «Pro скоро» (как N4) — предложение координатора; переиспользование ЮKassa из
   клона — вторая волна. Владелец может переопределить на чекпоинте.

## Ворота Phase 1 (после стадии 3)

```bash
node ../../.claude/hooks/check-docs-complete.cjs .     # документы написаны
node ../../.claude/hooks/check-look-trace.cjs .        # FR-LOOK доехали до Specification или отклонены
node ../../.claude/hooks/check-growth-trace.cjs .      # ожидаемо 2: брифа Phase 0 нет (--from-docs); семена FR-GROWTH — из постановки
node ../../.claude/hooks/check-metric-source.cjs .     # у каждой метрики источник из закрытого списка
node ../../.claude/hooks/check-external-deps.cjs .     # инвентарь чужих сервисов с вердиктом
node ../../.claude/hooks/check-model-cost.cjs .        # потолки вызовов модели
node ../../.claude/hooks/check-job-contract.cjs .      # три состояния долгой задачи
node ../../.claude/hooks/check-webhook-contract.cjs .  # «вебхуков нет» — законный 2
node ../../.claude/hooks/check-embed-contract.cjs .    # «не встраивается» — законный 2
node ../../.claude/hooks/check-canon.cjs .             # канон цел
node ../../.claude/hooks/check-file-ownership.cjs .    # один писатель на файл
```

## Единицы

| Единица | Что пишет |
|---|---|
| spec-writer | docs/Specification.md, docs/PRD.md |
| algo-writer | docs/Pseudocode.md, docs/Research_Findings.md, docs/Solution_Strategy.md |
| arch-writer | docs/Architecture.md, docs/ADR.md, docs/C4_Diagrams.md |
| ops-writer | docs/Refinement.md, docs/Completion.md, docs/Final_Summary.md |

## Владение

| Файл | Владелец |
|---|---|
| docs/canon.md | координатор |
| docs/dispatch-plan.md | координатор |
| docs/model-cost-contract.md | координатор |
| docs/long-job-contract.md | координатор |
| docs/webhook-contract.md | координатор |
| docs/embed-contract.md | координатор |
| docs/Specification.md | spec-writer |
| docs/PRD.md | spec-writer |
| docs/Pseudocode.md | algo-writer |
| docs/Research_Findings.md | algo-writer |
| docs/Solution_Strategy.md | algo-writer |
| docs/Architecture.md | arch-writer |
| docs/ADR.md | arch-writer |
| docs/C4_Diagrams.md | arch-writer |
| docs/Refinement.md | ops-writer |
| docs/Completion.md | ops-writer |
| docs/Final_Summary.md | ops-writer |
| CLAUDE.md | координатор (Phase 3) |

## После Phase 1 (для полноты картины, не запускается сейчас)

| Стадия | Семейство | Модель | Роль |
|---|---|---|---|
| Phase 2 VALIDATE | Anthropic | Opus 5 high (смысл, противоречия) + Sonnet 5 (INVEST/SMART, BDD), отдельные агенты | независимый проход, не авторы документов |
| Phase 3–4 toolkit/scaffold | Anthropic | Opus 5 | проектный тулкит и compose |
| IMPLEMENT | OpenAI (Codex) | `gpt-6-astra` high — конвейер STT→LLM→ffmpeg и очередь; `gpt-5.6-sol` high — обычные фичи; `gpt-5.6-terra` medium — изолированные модули | pre-flight `codex-companion.mjs setup --json` перед первой фичей |
| REVIEW / QE кода | Anthropic | Opus 5 high; Fable 5.1 точечно — гонки, деньги, безопасность | агент, не являющийся автором кода |
