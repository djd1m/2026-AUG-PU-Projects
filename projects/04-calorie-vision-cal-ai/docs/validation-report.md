**Verdict:** 🟡 CAVEATS

# Validation Report — «Тарелка» (N4), Phase 2

Дата: 2026-09-12 · RUN_ID: `20260912T171708Z-replicate-04-phase1-4-sparc-0c00`
Spec revision: sha256:9b487baf90edf596db8b64ce4388c7e80a5207032bbd816223e7ef68cede6d66
Spec revision после исправлений (Phase 2, полная): sha256:9b487baf90edf596db8b64ce4388c7e80a5207032bbd816223e7ef68cede6d66
Режим: автономный (владелец отсутствует, DEC-A-001); все решения раунда — в [`decisions-autonomous.md`](decisions-autonomous.md).

## Как проверяли

| Линза | Исполнитель | Модель | Квитанция |
|---|---|---|---|
| stories + acceptance + BDD | validator-stories-ac | Claude Sonnet 5 | [receipts/validator-stories-ac.md](telemetry/p-replicator/20260912T171708Z-replicate-04-phase1-4-sparc-0c00/receipts/validator-stories-ac.md) |
| architecture + pseudocode + coherence + dependencies + Decision Coverage | validator-docs-coherence | Claude Sonnet 5 | [receipts/validator-docs-coherence.md](telemetry/p-replicator/20260912T171708Z-replicate-04-phase1-4-sparc-0c00/receipts/validator-docs-coherence.md) |
| независимый проход по всем 6 линзам (cross-model) | codex-validator | Codex gpt-5.6-sol, effort high | [receipts/codex-validator.md](telemetry/p-replicator/20260912T171708Z-replicate-04-phase1-4-sparc-0c00/receipts/codex-validator.md) |
| исправления, 4 раунда | fixer-phase2 | Claude Opus 5 | [receipts/fixer-phase2.md](telemetry/p-replicator/20260912T171708Z-replicate-04-phase1-4-sparc-0c00/receipts/fixer-phase2.md) |
| ре-валидация 21 находки | revalidator | Claude Sonnet 5 | [receipts/revalidator.md](telemetry/p-replicator/20260912T171708Z-replicate-04-phase1-4-sparc-0c00/receipts/revalidator.md) |

Шаг 2.0 (детерминированно, до роя): `check-docs-complete` 0 · `check-external-deps` 0. Итерации FIX → RE-VALIDATE: 2 из максимум 3 (плюс два точечных раунда по одной строке).

## Summary

- Историй: 13 (US-001…US-013), критериев приёмки: 26, все с именованными сценариями.
- Средний балл: **88.5/100**; ниже 70 — нет; BLOCKED (< 50) — 0; blocking floor — 0 нарушений.
- Growth Traceability: 7/7 FR-GROWTH прослежены (+5); FR-GROWTH-007 из SPECULATIVE принят решением DEC-A-006 (подлежит подтверждению владельцем).
- Security AC: присутствуют для всех применимых областей (+5); штрафов нет.
- Внешние зависимости: 10 способностей, **10 CONFIRMED**, 0 UNCONFIRMED, 0 CONTRADICTED.
- Находок валидаторами: 21 (V1: 1 blocker, 2 high, 1 medium, 2 low; V2: 2 blocker, 8 high, 4 medium + 1 traceability); после исправлений: **21/21 закрыто**, ре-валидация нашла 1 новую (high, формулировка одной ячейки), закрыта раундом 4.

## Results

| Story | Title | Score | INVEST | SMART | Status |
|-------|-------|-------|--------|-------|--------|
| US-001 | Марина: сфотографировать обед и сразу увидеть калории и БЖУ | 89/100 | 5/6 | 5/5 | READY |
| US-002 | Марина: видеть, откуда взято каждое число | 88/100 | 6/6 | 4/5 | READY |
| US-003 | Марина: поправить порцию | 90/100 | 6/6 | 4/5 | READY |
| US-004 | Марина: видеть, когда оценка и база расходятся | 92/100 | 6/6 | 4/5 | READY |
| US-005 | Марина: видеть итог дня | 86/100 | 6/6 | 4/5 | READY |
| US-006 | Марина: мягкий стрик | 92/100 | 6/6 | 4/5 | READY |
| US-007 | Артём: белок в первом результате и карточка | 84/100 | 5/6 | 4/5 | READY |
| US-008 | Артём: заменить неверно определённый ингредиент | 88/100 | 6/6 | 4/5 | READY |
| US-009 | Марина: понимать, что лимит сканов исчерпан | 88/100 | 6/6 | 4/5 | READY |
| US-010 | Лиза: раздать аудитории персональный код | 88/100 | 6/6 | 4/5 | READY |
| US-011 | Лиза: видеть воронку своей когорты | 88/100 | 6/6 | 4/5 | READY |
| US-012 | Марина: управлять согласием и удалить данные | 89/100 | 5/6 | 5/5 | READY |
| US-013 | Артём: войти через Telegram | 88/100 | 6/6 | 4/5 | READY |

Системное замечание валидатора: SMART 4/5 у 11 историй из-за слов «мгновенно/немедленно/сразу» без порога —
исправлено раундом 2 (V2-R12), баллы не пересчитывались. INVEST 5/6 у US-001/007/012 — истории тянут 2–3 FR;
рекомендация декомпозиции на стадии задач записана в квитанции.

## Criterion scenarios

| Criterion | Scenario |
|-----------|----------|

Проектный контур /replicate объявляет критерии как `SC-US-nnn-k` (не `AC-`), поэтому машинная таблица `AC → сценарий`
здесь пуста по построению; трассировка 26 `SC-US` → именованные сценарии — в квитанции validator-stories-ac
(`telemetry/p-replicator/20260912T171708Z-replicate-04-phase1-4-sparc-0c00/receipts/validator-stories-ac.md`, раздел «Criterion scenarios»)
и в [`test-scenarios.md`](test-scenarios.md). Контракт `AC-` действует для фич (`docs/features/<slug>/`).

## Gap Register

| ID | Sev | Суть | Решение | Статус |
|---|---|---|---|---|
| V1-R01 / V2-R04 | blocker | Третий потолок 600/сутки объявлен, но не имел модели и алгоритма | DEC-A-002: scope `escalation`, четвёртый ключ в `CheckAndConsumeQuota`, ADR-007 «три числа» | closed |
| V2-R03 | blocker | ADR-001 запрещал оценку калорий в ответе модели, экран расхождения без неё невозможен | DEC-A-003: `model_estimate_kcal` только для экрана расхождения; число всегда из `food_item` | closed |
| V2-R01 | blocker | Трассировка SC → именованные сценарии | таблица Criterion scenarios (26/26) + Refinement Test Cases | closed |
| V1-R02 | high | Нет колонки `attribution.replaced_source` | добавлена, 12-я строка сверки | closed |
| V1-R03 / V2-R09 | high | ADR-008 и Refinement описывали старое поведение кода партнёра | три исхода по `attribution.source` во всех документах | closed |
| V2-R02 | high | Нет security-AC для фото-ввода, чтения дневника, мутаций | добавлены под SC | closed |
| V2-R05 | high | Двойной вызов модели после истечения аренды | DEC-A-008: `lease_owner` + `lease_fence`, условная запись результата | closed |
| V2-R06 | high | Нет маршрутов согласия, удаления, правки записи | DEC-A-004: 13 маршрутов | closed |
| V2-R07 | high | Нет сущностей листа ожидания Pro и событий воронки | DEC-A-004: 14 сущностей | closed |
| V2-R08 | high | Контракт долгих задач обещал идемпотентный ключ и 202, маршрут их не имел | `Idempotency-Key`, 202 + `scan_id` | closed |
| V2-R10 | high | HEIC и 12 МБ против лимитов провайдера | DEC-A-005: серверная нормализация до ≤ 5 МБ / 1568 px; зависимость подтверждена цитатой | closed |
| V2-R11 | high | Structured outputs не проверяют диапазоны | проверка в коде после разбора | closed |
| V2-R15 | medium | PagerDuty/Slack/email без зависимости | DEC-A-007: журнал + Telegram sendMessage, строка зависимости CONFIRMED | closed |
| V1-R04 | medium | 409 описан для одной из двух конфликтных веток | обе ветки, тело `{ existing_source }` | closed |
| V2-R12 | medium | Расплывчатые слова вместо порогов | заменены числами | closed |
| V2-R13 | medium | PRD «всегда pending» против pending → activated | одна формулировка | closed |
| V2-R14 | medium | FR-GROWTH-007 промотирован без записи решения | DEC-A-006, строка в Specification | closed (ожидает подтверждения владельца) |
| V1-R05 | low | NFR-области канона без OPS | канон | closed |
| V1-R06 | low | Architecture без токенов ADR | 7 упоминаний | closed |
| НОВАЯ-01 | high | Маршрут 11: 403 и 404 для чужой записи против security-AC «только 404» | раунд 4: один код 404 для чужой и несуществующей записи; чужие сканы/дневник — тоже 404 | closed |

## Decision Coverage

Decisions in docs/ADR.md: 10 · named downstream: 10 · superseded: 0

Recorded but named nowhere:
| Decision | Title |
|---|---|
| none | none |

Named downstream but absent from docs/ADR.md:
| Mention | File |
|---|---|
| none | none |

## Контракты поверхностей (шаги 2.1–2.4)

| Проверка | Код | Значение |
|---|---|---|
| check-embed-contract | 2 | законное «продукт не встраивается» |
| check-job-contract | 2 | законное «НЕ ВЫПОЛНЕНА, not-deployed» — следы трёх состояний появятся после развёртывания стенда |
| check-webhook-contract | 2 | законное «входящих вебхуков нет» |
| check-model-cost | 0 | два вызова, три потолка, отказ при достижении, ненастроенный потолок валит старт |
| check-look-origin | 2 | стороннего разбора не было (профиль снят прокликиванием) |

## Почему 🟡, а не 🟢

1. Восемь решений раунда (DEC-A-002…008, особенно DEC-A-006 о промоушене FR-GROWTH-007) приняты координатором
   в отсутствие владельца и подлежат подтверждению.
2. Контракт долгих задач не проверен на стенде (законная двойка) — закрывается в Phase 4/реализации.
3. Баллы историй не пересчитывались после устранения расплывчатых слов; текущее среднее — нижняя оценка.

Блокеров нет, противоречий после раунда 4 не найдено, внешних зависимостей UNCONFIRMED нет → Phase 3 разрешена с
этими оговорками.
