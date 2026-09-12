# Фича `scan-pipeline` — завершение: сборка, запуск, покрытие критериев

## Статус документа

Это ПЛАН выпуска фичи (Phase 1). Ни одного файла кода, теста и фикстуры ещё не существует — фича
`foundation` тоже ещё не реализована (её собственный `05_completion.md` тоже плановый). Команды и
пути ниже — целевые; коды возврата не подставляются заранее, а заполняются фактическими значениями
в квитанции Phase 3.

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

**Таблица ПЛАНОВАЯ.** Пути файлов и заголовки — ожидаемые (см. `04_refinement.md`, Test Cases);
Phase 3 заменяет их фактическими, и только тогда ворота `--completion` имеют смысл: они открывают
файл и ищут заголовок дословно.

| Criterion | Test file | Test title |
|-----------|-----------|------------|
| AC-scan-pipeline-1 | tests/integration/routes/scans-validate.test.ts | отвергает файл с расширением jpg и байтами не JPEG кодом 422 |
| AC-scan-pipeline-2 | tests/unit/photo/decompression-bomb.test.ts | отвергает изображение с распаковкой свыше ста мегапикселей до декодирования |
| AC-scan-pipeline-3 | tests/integration/routes/scans-validate.test.ts | отвергает фото сверх двенадцати мегабайт и меньше трёхсот двадцати пикселей без списания квоты |
| AC-scan-pipeline-4 | tests/integration/routes/scans-idempotency.test.ts | требует заголовок Idempotency-Key в форме UUID |
| AC-scan-pipeline-5 | tests/integration/routes/scans-idempotency.test.ts | повторный запрос с тем же ключом возвращает тот же scan_id без повторного списания |
| AC-scan-pipeline-6 | tests/concurrency/routes/scans-idempotency-parallel.test.ts | два одновременных запроса с одним ключом создают ровно одну строку recognition |
| AC-scan-pipeline-7 | tests/integration/routes/scans-quota.test.ts | отказ квоты называет scope user и не сохраняет фото |
| AC-scan-pipeline-8 | tests/concurrency/routes/scans-quota-parallel.test.ts | двадцать параллельных запросов при пределе десять дают ровно десять успехов и десять отказов |
| AC-scan-pipeline-9 | tests/integration/photo/normalize-heic.test.ts | нормализует HEIC в JPEG не длиннее тысячи пятисот шестидесяти восьми пикселей и не больше пяти мегабайт |
| AC-scan-pipeline-10 | tests/integration/photo/normalize-failure.test.ts | не вызывает модель при неудачной нормализации |
| AC-scan-pipeline-11 | tests/unit/recognize/validate-ranges.test.ts | отклоняет уверенность массу и число позиций вне диапазона без подрезания |
| AC-scan-pipeline-12 | tests/unit/recognize/escalate.test.ts | вызывает вторую модель на уверенности ноль целых пятьдесят девять сотых и не вызывает на шестидесяти |
| AC-scan-pipeline-13 | tests/concurrency/recognize/escalation-parallel.test.ts | двадцать одновременных эскалаций при остатке один дают ровно один вызов сильной модели |
| AC-scan-pipeline-14 | tests/unit/recognize/escalate-exhausted.test.ts | исчерпанная квота эскалации сохраняет done с low_confidence и не выбрасывает первичный результат |
| AC-scan-pipeline-15 | tests/integration/recognize/null-match-port.test.ts | реальный порт сопоставления всегда даёт failed no_food_matched и статус done не встречается |
| AC-scan-pipeline-16 | tests/integration/provider/anthropic-failure.test.ts | провайдер недоступен или таймаут даёт failed без отката квоты |
| AC-scan-pipeline-17 | tests/concurrency/recognize/stale-lease-real-delay.test.ts | устаревший захват под реальной задержкой провайдера затрагивает ноль строк |
| AC-scan-pipeline-18 | tests/integration/routes/scans-ownership.test.ts | чужой и несуществующий scan_id дают один и тот же ответ 404 |

Критерии AC-scan-pipeline-11 и AC-scan-pipeline-3 закрываются НЕ одним утверждением: у первого три
отдельных прогона (по одному на нарушенное поле), у второго — два (размер и разрешение). Ворота
сверяют по одному заголовку на критерий; полноту утверждений внутри теста предъявляет квитанция
Phase 3 явно, а не подразумевает.
