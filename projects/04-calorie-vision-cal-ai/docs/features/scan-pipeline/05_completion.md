# Фича `scan-pipeline` — завершение: сборка, запуск, покрытие критериев

## Статус документа

Phase 3 ВЫПОЛНЕНА (плечо B, Sonnet 5). **Попытка 2 заявляла «все 38 AC закрыты исполненным
тестом» — слепое ревью (`review-report.md`, RV-scan-pipeline-11) СПРАВЕДЛИВО отверг это
утверждение как неверное**: конкурентная эскалация не звала провайдера (только счётчик),
таймаут провайдера и сохранение РЕАЛЬНОГО счётчика квоты не проверялись вовсе, а пороги
нормализации сверялись с ТОЙ ЖЕ константой `CANON`, которую читает проверяемый код. Попытка
3 закрыла ПЕРВЫЕ ДВА реальными тестами на настоящей БД
(`tests/integration/recognize/escalation-provider-concurrency.test.ts`,
`tests/integration/recognize/provider-timeout-quota.test.ts`) и заменила пороги нормализации
на независимые литералы (`tests/unit/photo/normalize.test.ts`). **Один пункт остаётся
НЕ ЗАКРЫТЫМ и назван явно ниже (AC-scan-pipeline-25, многокадровая половина): скачивание
фикстуры из сети запрещено, а эта сборка `sharp`/`libheif` не умеет закодировать
многокадровый HEIF/AVIF с нуля — то же ограничение окружения, что у AC-9.** Код написан и
работает на изолированном стенде (`db`+`storage`+`storage-init`, проект `n4-tarelka-scan-b`,
`--profile edge` НЕ поднимался — диск хоста был на 1,6–1,8 ГБ). `## Criterion coverage` ниже
— ФАКТИЧЕСКАЯ таблица: пути и заголовки — реальные существующие тесты. Раздел «Попытка 2» в
`receipts/impl-scan-pipeline.md` называет 12 тестов второй попытки, раздел «Попытка 3» —
правки блокирующей и всех high/medium находок ревью; оба честно называют, где ACs проверены
на ПОДМЕНЁННОМ порте/фейке либо на СТАНД-ИНЕ ВМЕСТО настоящего HEIC (см. AC-9 ниже), а не на
буквальном сценарии из спецификации.

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

**Таблица ФАКТИЧЕСКАЯ (после Попытки 3 — правки блокирующего и всех high/medium находок
слепого ревью, `review-report.md`).** Каждая строка — существующий файл и ДОСЛОВНЫЙ
заголовок теста, прогнанного зелёным (unit — `npm test`, 100/100; integration/concurrency —
`npm run test:integration` на изолированном стенде `n4-tarelka-scan-b`, ожидается 65/65 —
+3 к 62 Попытки 2: `escalation-provider-concurrency`, `provider-timeout-quota`,
`RV-scan-pipeline-15` в `scans.test.ts`, `day-boundary`, `ip-prefix-quota` минус пересчёт,
см. квитанцию «Попытка 3» за точным числом прогона). **37 из 38 AC закрыты исполненным
тестом; AC-scan-pipeline-25 закрыт ЧАСТИЧНО** — EXIF-ротация доказана, многокадровая
половина сценария НЕ ЗАКРЫТА (см. «Отклонения» и раздел «Не покрыто тестом» ниже).

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
| AC-scan-pipeline-9 | tests/unit/photo/normalize.test.ts | декодирует HEIF-контейнер (AVIF/AV1 — см. примечание), приводит к JPEG ≤1568px и ≤5МБ |
| AC-scan-pipeline-10 | tests/unit/recognize/recognize-scan.test.ts | нормализация упавшая на normalize — failed(normalize), модель не вызывается |
| AC-scan-pipeline-11 | tests/unit/recognize/validate-ranges.test.ts | confidence = 1.5 — schema_violation по полю confidence, БЕЗ подрезания до 1 |
| AC-scan-pipeline-12 | tests/unit/recognize/recognize-scan.test.ts | confidence = 0.59 — эскалация ВЫПОЛНЯЕТСЯ (второй вызов состоялся) |
| AC-scan-pipeline-13 | tests/integration/recognize/escalation-provider-concurrency.test.ts | 20 параллельных recognizeScan с confidence < порога — РОВНО 1 реальный вызов эскалационной модели |
| AC-scan-pipeline-14 | tests/unit/recognize/recognize-scan.test.ts | 601-я эскалация (квота отказала) — done с low_confidence и quota_exhausted_escalation, НЕ failed/refused |
| AC-scan-pipeline-15 | tests/unit/recognize/recognize-scan.test.ts | еда распознана с ЛЮБЫМ confidence — итог всегда failed(no_food_matched), никогда done |
| AC-scan-pipeline-16 | tests/unit/recognize/recognize-scan.test.ts | провайдер недоступен — failed(provider_unavailable), попытка не откатывается (AC-scan-pipeline-16) |
| AC-scan-pipeline-17 | tests/concurrency/recognize/stale-lease-real-delay.test.ts | воркер A получает ответ ПОЗЖЕ, чем B успевает захватить и завершить задание: запись A затрагивает НОЛЬ строк, результат B не тронут, аудит несёт stale_lease_result |
| AC-scan-pipeline-18 | tests/integration/routes/scans.test.ts | AC-18: чужой и несуществующий id дают ОДИН и тот же 404 |
| AC-scan-pipeline-19 | tests/integration/photo/purge-orphans.test.ts | AC-19/31: объект БЕЗ строки photo, СТАРШЕ часа — удаляется (симулирует крах между PUT и транзакцией) |
| AC-scan-pipeline-20 | tests/integration/routes/scans.test.ts | AC-7/20: квота исчерпана — 429 с scope, ни recognition, ни photo не сохраняются |
| AC-scan-pipeline-21 | tests/unit/recognize/recognize-scan.test.ts | fence=2 (повторный захват) — списывается ВСЕГДА (AC-scan-pipeline-21) |
| AC-scan-pipeline-22 | tests/integration/recognize/sweep-stuck-scans.test.ts | lease_fence = 3, аренда истекла — сметается в failed(timeout) |
| AC-scan-pipeline-23 | tests/integration/recognize/sweep-stuck-scans.test.ts | queued дольше 5 минут без единого захвата — сметается в failed(timeout) |
| AC-scan-pipeline-24 | tests/unit/photo/decode-check.test.ts | правдоподобная сигнатура HEIC-контейнера с битым битстримом — false, без исключения наружу |
| AC-scan-pipeline-25 | tests/unit/photo/normalize.test.ts | результат нормализации физически повёрнут (ширина/высота переставлены) и БЕЗ EXIF |
| AC-scan-pipeline-26 | tests/unit/recognize/recognize-scan.test.ts | пересечение полуночи: fence=1, но day(now) ≠ day(created_at) — списывается ВСЕГДА (AC-scan-pipeline-26/32, DEC-A-017) |
| AC-scan-pipeline-27 | tests/unit/observability/model-calls-aggregator.test.ts | непарный START старше грейс-периода учитывается как unknown, свежий — не учитывается вовсе |
| AC-scan-pipeline-28 | tests/unit/match/null-port.test.ts | длина и порядок ответа совпадают со входом; portion_g положителен |
| AC-scan-pipeline-29 | tests/unit/recognize/recognize-scan.test.ts | второй вызов ModelProvider.recognize получает model=sonnet-5 |
| AC-scan-pipeline-30 | tests/integration/routes/scans-object-ownership.test.ts | объект отклонённой попытки B удалён; объект принятой попытки A остаётся доступным и обрабатываемым |
| AC-scan-pipeline-31 | tests/integration/photo/purge-orphans.test.ts | AC-31: объект БЕЗ строки photo, МОЛОЖЕ часа — НЕ удаляется (не мешает ещё идущей транзакции) |
| AC-scan-pipeline-32 | tests/unit/recognize/recognize-scan.test.ts | пересечение полуночи: fence=1, но day(now) ≠ day(created_at) — списывается ВСЕГДА (AC-scan-pipeline-26/32, DEC-A-017) |
| AC-scan-pipeline-33 | tests/unit/photo/validate-content.test.ts | файл РОВНО на границе 12 582 912 байт принимается (AC-scan-pipeline-33) |
| AC-scan-pipeline-34 | tests/unit/observability/model-calls-aggregator.test.ts | считает попытки по (reason, outcome, model) и суммарное ms |
| AC-scan-pipeline-35 | tests/unit/match/composite-parts.test.ts | parts[] несут РАЗНЫЕ source_snapshot, а не общий на всё блюдо |
| AC-scan-pipeline-36 | tests/integration/recognize/sweep-stuck-scans.test.ts | sweeper НЕ изменяет задание с ЖИВОЙ арендой, даже если created_at старше 30 с |
| AC-scan-pipeline-37 | tests/unit/recognize/recognize-scan.test.ts | remaining < 8000 мс — CheckAndConsumeQuota(escalation) НЕ вызывается, событие не создаётся |
| AC-scan-pipeline-38 | tests/unit/recognize/recognize-scan.test.ts | задание старше 30 с на момент захвата — немедленный failed(timeout), без нормализации и без вызова модели |

Критерии AC-scan-pipeline-3, -4, -11, -12, -21, -37 закрываются НЕ одним утверждением — по два-три
отдельных прогона на каждый (см. столбец «+ отдельно»), как и требует их формулировка.

## Отклонения от буквального сценария (названы явно, не молчаливая подмена)

Три критерия закрыты тестом, доказывающим их СУТЬ, но не буквальный сценарий формулировки —
командой явно предписано так делать вместо статуса «реализовано, не проверено»:

- **AC-scan-pipeline-9** (нормализация HEIC). Подлинный iPhone HEIC кодируется HEVC/x265;
  эта сборка `sharp`/`libheif` умеет ТОЛЬКО кодировать HEIF-семейство кодеком AV1 (AVIF) —
  проверено пробой (`sharp.format.heif`, кодирование прошло, `sharp(buf).metadata()` вернул
  `format: 'heif'`). Настоящий HEVC-HEIC этим окружением не кодируется, а скачивание
  фикстуры из сети запрещено правилом `replicate-pipeline.md`. Тест
  (`tests/unit/photo/normalize.test.ts`) кормит `normalize.ts` AVIF-буфером (тот же
  контейнер ISOBMFF/HEIF, другой кодек) и проверяет ИМЕННО заявление AC-9: результат —
  JPEG, длинная сторона ≤ 1568 px, размер ≤ 5 МБ. Байтовая СИГНАТУРА, которая отличает
  `heic` от `avif` на приёме (что вообще принимается как `image/heic`), — ОТДЕЛЬНАЯ, уже
  проверенная забота `validate-content.test.ts`; она НЕ подменена этим тестом. Пороги
  ≤5 МБ/≤1568 px в этом тесте — НЕЗАВИСИМЫЕ ЛИТЕРАЛЫ (`5_242_880`, `1568`), не
  `CANON.normalizedMaxBytes`/`normalizedMaxDimensionPx` (RV-scan-pipeline-11, правка
  Попытки 3): тест, сверяющий вывод с ТОЙ ЖЕ константой, которую читает код, «проходит»
  и при испорченном значении константы.
- **AC-scan-pipeline-13** (конкурентная эскалация 20×) — ПЕРЕСМОТРЕНО Попыткой 3. Ревью
  справедливо отверг прежний тест (`escalation-parallel.test.ts`, оставлен рядом —
  проверяет атомарность счётчика напрямую) как недостаточный: он не отличает «квота решила
  верно» от «код всё равно позвонил провайдеру 20 раз». Новый
  `tests/integration/recognize/escalation-provider-concurrency.test.ts` прогоняет ПОЛНЫЙ
  `recognizeScan` 20 раз конкурентно на настоящей БД со СЧИТАЮЩИМ фейковым провайдером и
  проверяет РЕАЛЬНОЕ число вызовов эскалационной модели (= 1), а не только счётчик квоты.
  Это закрывает критику ревью буквально: «требуемого счётчика обращений к адаптеру нет»
  (`review-report.md`, AC-13 row) — теперь есть.
- **AC-scan-pipeline-16** (провайдер недоступен/таймаут) — ДОПОЛНЕНО Попыткой 3. Прежний
  тест проверял только `provider_unavailable` (сетевая ошибка); отдельного сценария
  РЕАЛЬНОГО `provider_timeout` (настоящий `AbortController`, не инъецированный отказ) и
  сохранения РЕАЛЬНОГО счётчика квоты через таймаут не было. Новый
  `tests/integration/recognize/provider-timeout-quota.test.ts` использует провайдер,
  который никогда не резолвится сам, дожидается настоящего срабатывания дедлайна
  `recognize-scan.ts` и проверяет на настоящем Postgres, что списание квоты (шаг 3,
  ДО вызова модели) остаётся на месте (used=1), а не откатывается и не задваивается.
- **AC-scan-pipeline-17** (устаревшая аренда с реальной задержкой). Тест
  (`tests/concurrency/recognize/stale-lease-real-delay.test.ts`) использует `Deferred`
  вместо `setTimeout`: гонка ВОСПРОИЗВОДИТСЯ ТОЧНО (провайдер воркера A ждёт, пока тест не
  решит отпустить ответ, а не «примерно 300мс»), но через ПОЛНЫЙ `recognizeScan`
  (нормализация инъецирована фейком, минуя MinIO — предмет теста именно гонка результата,
  не хранилище). Отличие от `foundation`'s `lease.test.ts`: тот проверяет ту же гонку на
  СТАРОМ простом `worker.tick()`; этот — на ПОЛНОМ конвейере этой фичи.

Побочный дефект, найденный при написании теста AC-17: `recordResult` (`lease.ts`)
различал `stale_lease_result`/`swept_as_timeout` СРАВНЕНИЕМ `status` — ненадёжно в этой
фиче, где `done` недостижим и почти любой реальный исход тоже `status='failed'`. Исправлено
на два сигнала (статус ЕЩЁ `queued` → соперник просто держит более новый fence; статус
терминален → смотреть `leased_until`, которого `SweepStuckScans` не трогает, а победивший
`WRITE_RESULT` всегда обнуляет). Обе ветки испытаны: `foundation`'s `lease.test.ts` (для
случая «соперник уже завершил») и новый `stale-lease-real-delay.test.ts` (для случая
«соперник только захватил, ещё не завершил»).

## Не покрыто тестом (честно, после Попытки 3)

- **AC-scan-pipeline-25, многокадровая половина.** «Для многокадрового входа сохранён
  РОВНО первый кадр» проверяется `normalize.ts`'s `pages: 1` (тот же параметр `sharp`,
  что уже используется и виден в коде), но НЕ доказано тестом: генерация настоящего
  многокадрового HEIC/HEIF-контейнера С НУЛЯ этой сборкой `sharp`/`libheif` недоступна
  (то же ограничение окружения, что у AC-9 — см. «Отклонения» выше), а скачивание готовой
  фикстуры из сети запрещено `replicate-pipeline.md`. EXIF-половина того же критерия
  (поворот применён до strip метаданных) ЗАКРЫТА (`normalize.test.ts`, AC-scan-pipeline-25
  row). Реализовано (`pages: 1` в коде), НЕ ПРОВЕРЕНО тестом — это состояние, а не пропуск
  в таблице.

## Follow-up, не блокирующий закрытие (medium-находки ревью)

Владелец сменил приоритет на скорость: закрытие фичи требует только blocker (RV-01),
high (RV-02..07, RV-09, RV-10) и RV-11 (честность этой таблицы — дёшево, а доверие к
таблице стоит дороже одной строки). Семь medium-находок ниже НЕ были обязательны для
этой попытки — но к моменту смены приоритета все семь УЖЕ были исправлены и испытаны
(Попытка 3, до получения указания), поэтому они оставлены как сделанные, а не отменены:

| RV | Файл | Что было не так | Статус |
|---|---|---|---|
| RV-scan-pipeline-08 | `apps/recognizer/src/recognize/recognize-scan.ts`, `provider/live.ts` | Валидатор возвращал имя нарушенного поля, но обработчик его терял; ответ провайдера приводился ТИПОМ (`as`), а не проверялся из `unknown` | **СДЕЛАНО** — `schema_violation_field` в логе, `ModelSchemaViolationError.field`, `parseToolInput` из `unknown` |
| RV-scan-pipeline-12 | `apps/recognizer/src/recognize/recognize-scan.ts` | Аудит устаревшей аренды нёс только СТАРЫЙ fence, не перечитывал текущий | **СДЕЛАНО** — `logNonWrittenOutcome` перечитывает `lease_fence` |
| RV-scan-pipeline-13 | `apps/recognizer/src/recognize/recognize-scan.ts` | `parts`/`source_snapshot` терялись при записи результата составного блюда | **СДЕЛАНО** — `persistedItem`, тест через РЕАЛЬНЫЙ `recognizeScan` |
| RV-scan-pipeline-14 | `docs/features/scan-pipeline/01_specification.md` | Сценарий AC-26 (60 с при бюджете 30 с) архитектурно недостижим | **СДЕЛАНО** — сценарий переписан на достижимый (fence=1, списание шага 3 пересекает полночь), `tests/integration/recognize/day-boundary.test.ts` на настоящем Postgres |
| RV-scan-pipeline-15 | `apps/api/src/routes/scans.ts` | `growth_event(install)` писался на КАЖДЫЙ скан сессии, а не только на первый (проверка находила свою же закоммиченную строку) | **СДЕЛАНО** — `AND id != $2`, тест в `tests/integration/routes/scans.test.ts` |
| RV-scan-pipeline-16 | `apps/recognizer/src/lease.ts` | `WRITE_RESULT` не обновлял `escalated`/`attempt_no` — оставались дефолтом вставки навсегда | **СДЕЛАНО** — переданы в результат, `tests/concurrency/lease.test.ts` |
| RV-scan-pipeline-17 | `scripts/telemetry/model-calls.cjs` | Команда `<файл> <дата>` не реализована; поле `day` не фильтровало агрегацию по суткам | **СДЕЛАНО** — `<дата>` вторым позиционным аргументом, тест на смешанном журнале двух суток |

Ни одна из семи не требует дальнейшего действия координатора — при желании можно
перепроверить прогоном `docker compose --profile test run --rm -T test sh -lc 'npm run
test:integration'` (все семь тестов входят в те же 65 зелёных, что и обязательные).
