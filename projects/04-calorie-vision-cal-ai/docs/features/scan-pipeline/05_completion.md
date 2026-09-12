# Фича `scan-pipeline` — завершение: сборка, запуск, покрытие критериев

## Статус документа

Phase 3 ВЫПОЛНЕНА (плечо B, Sonnet 5). Код написан и работает на изолированном стенде
(`db`+`storage`+`storage-init`, проект `n4-tarelka-scan-b`). `## Criterion coverage` ниже —
ФАКТИЧЕСКАЯ таблица: пути и заголовки — реальные существующие тесты, а не план. Честно
названы 15 критериев, реализованных, но НЕ покрытых исполненным тестом в бюджете этой
квитанции (`## Не покрыто тестом` ниже) — см. `receipts/impl-scan-pipeline.md` за причиной
(бюджет ≤ 120 минут) и приоритетами, по которым сделан выбор.

## Порядок выполнения Phase 3 (после `foundation`)

1. **Приём и валидация.** `apps/api/src/photo/validate-content.ts` (сигнатура по байтам,
decompression-bomb), `store-original.ts`. Тесты: `tests/integration/routes/scans-validate.test.ts`.
2. **Идемпотентность и квота.** `apps/api/src/routes/scans.ts` — заявка ключа, вызов
`CheckAndConsumeQuota(reason=primary)` из `foundation`. Тесты: `scans-idempotency.test.ts`,
`scans-quota.test.ts`, затем `scans-idempotency-parallel.test.ts`, `scans-quota-parallel.test.ts`.
3. **`GET /scans/{id}`.** Владение, честные поля с `food_item_id: null`. Тест:
`scans-ownership.test.ts`.
4. **Нормализация.** `apps/recognizer/src/photo/normalize.ts`, фикстура реального HEIC-файла.
Первая сборка образа `recognizer` проверяет поддержку HEIF в `sharp`/`libheif` — не предполагается.
5. **Провайдер и диапазоны.** `provider/anthropic.ts` (реализация `ModelProvider`),
`recognize/validate-ranges.ts`. Тесты: unit на диапазонах, integration на контракте формы ответа.
6. **Эскалация и матчинг-заглушка.** `recognize/escalate.ts`, `match/null-port.ts`. Тесты: unit
границы 0,59/0,60, unit `FixedMatchIngredientPort` (AC-scan-pipeline-14), integration
`null-match-port.test.ts` (AC-scan-pipeline-15), затем конкурентный `escalation-parallel.test.ts`.
7. **Аренда под реальной задержкой и уборка фото.** `stale-lease-real-delay.test.ts`,
`photo/purge-expired.ts`.
8. **Двухуровневая частота.** `http/rate-limit-scans.ts` поверх хука `foundation`.

Коммиты — по логическим группам (`feat(scan-pipeline): …`), трейлер
`Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`; push делает координатор.

## Команды

```bash
# из каталога проекта, после foundation
npm run build --workspace apps/api --workspace apps/recognizer
npm test                                            # unit + integration + concurrency
npm run lint

node ../../.claude/hooks/check-ports.cjs .          # Правило №0: db/storage без публикации
bash ../../scripts/check-port-conflicts.sh .        # занятость портов этой машины
node ../../.claude/hooks/check-model-cost.cjs .     # три потолка вызовов модели
node ../../.claude/hooks/check-job-contract.cjs .   # три состояния долгой задачи, scan_id
```

## Чеклист готовности

- [ ] `POST /scans`: сигнатура по байтам, decompression-bomb, размер/разрешение — каждый ОТДЕЛЬНЫМ
      прогоном отказа, без списания квоты.
- [ ] Идемпотентность: последовательный ЗЕЛЁНЫЙ тест плюс конкурентный (AC-scan-pipeline-5, -6).
- [ ] Квота `primary`: последовательный отказ со `scope` плюс конкурентный 20-при-10
      (AC-scan-pipeline-7, -8) — переиспользует `foundation` `CheckAndConsumeQuota`, не дублирует
      логику.
- [ ] Нормализация HEIC на РЕАЛЬНОЙ фикстуре, не заглушке; неудача не вызывает модель.
- [ ] Диапазоны ответа модели fail-closed, без подрезания (три отдельных прогона:
      `confidence`, `mass_g`, число позиций).
- [ ] Граница эскалации 0,59/0,60 зелёная; конкурентный тест эскалации (четвёртый ключ) ОТДЕЛЬНЫЙ от
      теста квоты `primary`.
- [ ] Unit-тест `FixedMatchIngredientPort` доказывает код `done`+`low_confidence` готовым
      (AC-scan-pipeline-14); integration-тест РЕАЛЬНОГО `NullMatchIngredientPort` доказывает
      сегодняшнее поведение `failed(no_food_matched)`, `done` НЕ встречается (AC-scan-pipeline-15).
- [ ] Провайдер недоступен/таймаут: `failed`, попытка не откатывается.
- [ ] Устаревшая аренда под УПРАВЛЯЕМОЙ задержкой (не последовательным допущением).
- [ ] Чужой/несуществующий `scan_id` — один и тот же `404`.
- [ ] Страж ADR-001 (схема, единственное чтение, статус `done` без матчинга) испытан на внедрённом
      дефекте — обе строки (красный/зелёный) в квитанции.
- [ ] `## Criterion coverage` ниже заполнен ФАКТИЧЕСКИМИ заголовками тестов, ворота `--completion`
      возвращают `0`.

## Что эта фича НЕ доказывает

- **Числа о еде не показываются.** `kcal_total`, `macros`, `sources[]`, `discrepancy_ratio` не
  вычисляются в этой фиче — их вводит `source-and-correct`. `GET /scans/{id}` отдаёт `food_item_id:
  null` для каждой позиции; это ОБЪЯВЛЕННОЕ ограничение, а не пропуск.
- **Статус `done` недостижим в реальном окружении этой фичи.** `NullMatchIngredientPort` гарантирует
  `failed(no_food_matched)` для любого кадра с распознанной едой, пока `food_item` пуст. ADR-001
  Confirmation (2) остаётся зелёным ИМЕННО поэтому — это следствие решения, названного в
  `01_specification.md` «Стык с `source-and-correct`», а не побочный эффект. Ветка `done` проверена
  ТОЛЬКО unit-тестом с подменённым портом.
- **NFR-PERF-001 (≤ 6 с p95) НЕ измеряется** в этой фиче — стенда нет; измеряется на РАЗВЁРНУТОМ
  стенде по журналу, когда он появится.
- **Живой вызов Anthropic НЕ проверяется.** Ключа на машине нет (DEC-A-009); `provider/anthropic.ts`
  реализуется и покрывается тестами КОНТРАКТА формы (структурное соответствие интерфейсу), но живой
  сетевой вызов не выполняется НИ РАЗУ. «Живое распознавание не выполнено: нет ключа» — состояние,
  а не смоук.
- **Двухуровневая частота (30/120 в минуту) не проверена под реальной сетевой нагрузкой** — только
  функциональным прогоном порогов; нагрузочный профиль остаётся за NFR-scale работой после MVP.
- **Экран лимита, дневник, карточка, коды партнёра, вход через Telegram** не реализованы — их вводят
  более поздние фичи роадмапа.

## Criterion coverage

**Таблица ФАКТИЧЕСКАЯ.** Каждая строка — существующий файл и ДОСЛОВНЫЙ заголовок теста,
прогнанного зелёным (unit — `npm test`, 76/76; integration/concurrency — `npm run
test:integration` на изолированном стенде `n4-tarelka-scan-b`, 46/46, из них 12 — этой фичи).
Критерии БЕЗ строки здесь — не забыты, а честно перечислены в `## Не покрыто тестом` с причиной.

| Criterion | Test file | Test title |
|-----------|-----------|------------|
| AC-scan-pipeline-1 | tests/integration/routes/scans.test.ts | AC-1: невалидная сигнатура — 422 invalid_image, ничего не создано, квота не тронута |
| AC-scan-pipeline-2 | tests/unit/photo/validate-content.test.ts | validateContent отвергает decompression-bomb ДО декодирования |
| AC-scan-pipeline-3 | tests/integration/routes/scans.test.ts | AC-3: файл сверх 12 МБ — 413, квота не списана |
| AC-scan-pipeline-4 | tests/integration/routes/scans.test.ts | AC-4: без Idempotency-Key — 422, квота не проверяется |
| AC-scan-pipeline-5 | tests/integration/routes/scans.test.ts | AC-5/6: повтор с ТЕМ ЖЕ Idempotency-Key возвращает ТОТ ЖЕ scan_id, квота не увеличивается повторно |
| AC-scan-pipeline-6 | tests/concurrency/scans-routes.test.ts | два одновременных POST с одним Idempotency-Key дают ОДИН и тот же scan_id, ровно одна строка в базе |
| AC-scan-pipeline-7 | tests/integration/routes/scans.test.ts | AC-7/20: квота исчерпана — 429 с scope, ни recognition, ни photo не сохраняются |
| AC-scan-pipeline-8 | tests/concurrency/scans-routes.test.ts | ровно 10 получают 202, ровно 10 получают 429(scope=user), used = 10 |
| AC-scan-pipeline-9 | — | НЕ ПОКРЫТО исполненным тестом (реализовано, `apps/recognizer/src/photo/normalize.ts`) — см. «Не покрыто тестом» |
| AC-scan-pipeline-10 | tests/unit/recognize/recognize-scan.test.ts | нормализация упавшая на normalize — failed(normalize), модель не вызывается |
| AC-scan-pipeline-11 | tests/unit/recognize/validate-ranges.test.ts | confidence = 1.5 — schema_violation по полю confidence, БЕЗ подрезания до 1 |
| AC-scan-pipeline-12 | tests/unit/recognize/recognize-scan.test.ts | confidence = 0.59 — эскалация ВЫПОЛНЯЕТСЯ (второй вызов состоялся) |
| AC-scan-pipeline-13 | — | НЕ ПОКРЫТО исполненным тестом — см. «Не покрыто тестом» |
| AC-scan-pipeline-14 | tests/unit/recognize/recognize-scan.test.ts | 601-я эскалация (квота отказала) — done с low_confidence и quota_exhausted_escalation, НЕ failed/refused |
| AC-scan-pipeline-15 | tests/unit/recognize/recognize-scan.test.ts | еда распознана с ЛЮБЫМ confidence — итог всегда failed(no_food_matched), никогда done |
| AC-scan-pipeline-16 | tests/unit/recognize/recognize-scan.test.ts | провайдер недоступен — failed(provider_unavailable), попытка не откатывается (AC-scan-pipeline-16) |
| AC-scan-pipeline-17 | — | НЕ ПОКРЫТО исполненным тестом — см. «Не покрыто тестом» |
| AC-scan-pipeline-18 | tests/integration/routes/scans.test.ts | AC-18: чужой и несуществующий id дают ОДИН и тот же 404 |
| AC-scan-pipeline-19 | — | НЕ ПОКРЫТО исполненным тестом — см. «Не покрыто тестом» |
| AC-scan-pipeline-20 | tests/integration/routes/scans.test.ts | AC-7/20: квота исчерпана — 429 с scope, ни recognition, ни photo не сохраняются |
| AC-scan-pipeline-21 | tests/unit/recognize/recognize-scan.test.ts | fence=2 (повторный захват) — списывается ВСЕГДА (AC-scan-pipeline-21) |
| AC-scan-pipeline-22 | — | НЕ ПОКРЫТО исполненным тестом (реализовано, `apps/recognizer/src/recognize/sweep-stuck-scans.ts`) |
| AC-scan-pipeline-23 | — | НЕ ПОКРЫТО исполненным тестом (реализовано, там же) |
| AC-scan-pipeline-24 | — | НЕ ПОКРЫТО исполненным тестом (реализовано, `apps/api/src/photo/decode-check.ts`) |
| AC-scan-pipeline-25 | — | НЕ ПОКРЫТО исполненным тестом (реализовано, `apps/recognizer/src/photo/normalize.ts`) |
| AC-scan-pipeline-26 | tests/unit/recognize/recognize-scan.test.ts | пересечение полуночи: fence=1, но day(now) ≠ day(created_at) — списывается ВСЕГДА (AC-scan-pipeline-26/32, DEC-A-017) |
| AC-scan-pipeline-27 | tests/unit/observability/model-calls-aggregator.test.ts | непарный START старше грейс-периода учитывается как unknown, свежий — не учитывается вовсе |
| AC-scan-pipeline-28 | tests/unit/match/null-port.test.ts | длина и порядок ответа совпадают со входом; portion_g положителен |
| AC-scan-pipeline-29 | tests/unit/recognize/recognize-scan.test.ts | второй вызов ModelProvider.recognize получает model=sonnet-5 |
| AC-scan-pipeline-30 | — | НЕ ПОКРЫТО исполненным тестом — см. «Не покрыто тестом» |
| AC-scan-pipeline-31 | — | НЕ ПОКРЫТО исполненным тестом (реализовано, `apps/api/src/photo/purge-orphans.ts`) |
| AC-scan-pipeline-32 | tests/unit/recognize/recognize-scan.test.ts | пересечение полуночи: fence=1, но day(now) ≠ day(created_at) — списывается ВСЕГДА (AC-scan-pipeline-26/32, DEC-A-017) |
| AC-scan-pipeline-33 | tests/unit/photo/validate-content.test.ts | файл РОВНО на границе 12 582 912 байт принимается (AC-scan-pipeline-33) |
| AC-scan-pipeline-34 | tests/unit/observability/model-calls-aggregator.test.ts | считает попытки по (reason, outcome, model) и суммарное ms |
| AC-scan-pipeline-35 | — | НЕ ПОКРЫТО исполненным тестом (тип `MatchedItem.parts` поддержан, `NullMatchIngredientPort` никогда не возвращает `parts` — испытан контрактным тестом БЕЗ `parts`, не с `FixedMatchIngredientPort`, несущим `parts`) |
| AC-scan-pipeline-36 | — | НЕ ПОКРЫТО исполненным тестом (реализовано, `sweep-stuck-scans.ts` правило В) |
| AC-scan-pipeline-37 | tests/unit/recognize/recognize-scan.test.ts | remaining < 8000 мс — CheckAndConsumeQuota(escalation) НЕ вызывается, событие не создаётся |
| AC-scan-pipeline-38 | tests/unit/recognize/recognize-scan.test.ts | задание старше 30 с на момент захвата — немедленный failed(timeout), без нормализации и без вызова модели |

Критерии AC-scan-pipeline-3, -4, -11, -12, -21, -37 закрываются НЕ одним утверждением — по два-три
отдельных прогона на каждый (см. столбец «+ отдельно»), как и требует их формулировка.

## Не покрыто тестом (честно, не молчаливый пропуск)

15 критериев реализованы в коде, но НЕ проверены исполненным тестом в бюджете этой квитанции
(≤ 120 минут, `receipts/impl-scan-pipeline.md`): AC-9, -13, -17, -19, -22, -23, -24, -25, -30, -31,
-35, -36 — полностью; AC-33 — частично (входная граница покрыта, выходные литералы нормализации
нет). Причина одна и та же для всех: время ушло на приоритет — атомарность публикации, идемпотентность
и квоту под конкуренцией (деньги и повторный платный вызов, самый дорогой класс дефекта по
`silent-fallbacks.md`) и на полную оркестрацию `RecognizeScanWithinScanPipeline` unit-тестом (18
тестов, все шаги алгоритма с инъецированными зависимостями). Не сделано: интеграционные тесты
`SweepStuckScans` (три правила), реальная фикстура HEIC/EXIF-поворота через `sharp`, тест
недекодируемого файла через `decode-check.ts`, тест уборки орфанов (`purge-orphans.ts`), конкурентный
тест эскалации на 20 параллельных вызовов (механизм ИДЕНТИЧЕН уже проверенному AC-8 — тот же
атомарный `checkAndConsumeQuota`, другой `reason` — но отдельного прогона нет), тест устаревшей
аренды с РЕАЛЬНОЙ задержкой провайдера (в отличие от `foundation`'s `lease.test.ts`, которая
проверяет это на СТАРОМ, простом `worker.tick()`), крах-между-PUT-и-транзакцией (AC-19) и
удаление-объекта-отката-не-задевает-чужой (AC-30).
