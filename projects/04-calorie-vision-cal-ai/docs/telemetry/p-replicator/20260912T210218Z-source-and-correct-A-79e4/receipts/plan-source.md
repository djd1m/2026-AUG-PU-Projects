# Квитанция — Phase 1 PLAN, фича `source-and-correct`, плечо A

RUN_ID: `20260912T210218Z-source-and-correct-A-79e4` · WORK_UNIT_ID: `plan-source` ·
Дата: 2026-09-12 · Роль: исполнитель плеча A (Phase 1 PLAN).
requested: claude-opus-5; actual: unknown to worker (фактическую модель подтверждает координатор
метаданными исполнения, не текст этой квитанции).

## Написанные файлы

| Файл | Строк |
|---|---|
| `docs/features/source-and-correct/01_specification.md` | 492 |
| `docs/features/source-and-correct/02_pseudocode.md` | 438 |
| `docs/features/source-and-correct/03_architecture.md` | 167 |
| `docs/features/source-and-correct/04_refinement.md` | 125 |
| `docs/features/source-and-correct/05_completion.md` | 129 |

Файлов вне каталога фичи и вне этой квитанции НЕ создавалось и НЕ правилось. Кода не написано.

## Содержание

- **13 FR** (`FR-source-and-correct-1…13`): импорт FDC, курация синонимов, нормализация и поиск,
  `UsdaMatchIngredientPort`, раскрытие рецептов, расчёт из снимка, терминальный статус, расхождение,
  три операции правки плюс `resolve_conflict`, экран результата, страж по исходнику.
- **3 NFR** (`NFR-source-and-correct-1…3`): поиск ≤ 200 мс p95 на 300 000 записей, пересчёт после
  правки ≤ 100 мс p95, атрибуция USDA и экранирование чужого текста.
- **26 AC** (`AC-source-and-correct-1…26`), все Given/When/Then с числами: порог триграмм 0,45,
  порог расхождения 0,15 с границами 15,0 / 15,1, диапазон порции 5–2000 г, ≤ 5 кандидатов в
  автоматическом поиске и ≤ 20 в ручном, 100 позиций seed, 50 запросов покрытия ADR-006, фикстура
  50 записей, синтетика 300 000 строк, 200 мс p95.
- **11 алгоритмов**: `ImportFdcDump`, `NormalizeRuName`, `SeedFoodSynonyms`, `SearchFoodCandidates`,
  `MatchIngredients`, `ExpandRecipeParts`, `ComputeFromSnapshot`, `EvaluateDiscrepancy`,
  `CorrectScan`, `RenderResultSurface`, `GuardSingleModelEstimateRead` — плюс `## API Contracts`
  (маршрут 3 целиком, нового маршрута НЕТ), `## State Transitions`, `## Error Handling Strategy`,
  `## Scenario Coverage` (8 сценариев проекта, все заявлены алгоритмом, обе таблицы — `none`).
- **Шесть стражей** с внедряемым дефектом и ожидаемой парой прогонов (красный → зелёный), включая
  оговорку: страж «`done` невозможен при нуле сопоставлений» испытывается на входе С НУЛЁМ
  совпадений, иначе мутация не меняет результат.

## Ворота

```
bash /root/.npm/_npx/ac10dded1a3b4a50/node_modules/@dzhechkov/p-replicator/scripts/check-pipeline-gaps.sh . \
  --traceability --role-map-source ../../.claude/commands/feature.md \
  --project-role-map-source ../../.claude/skills/sparc-prd-mini/SKILL.md
```

Вывод по своему контуру:

```
TRACE contour=source-and-correct specification=./docs/features/source-and-correct/01_specification.md pseudocode=./docs/features/source-and-correct/02_pseudocode.md
COUNT requirements=42 algorithms=42 missing-algorithm=0 orphan-algorithm=0
PASS contour=source-and-correct bidirectional traceability complete
```

Общий код возврата: **1**, и причина — СОСЕДНИЙ контур, не этот:

```
TRACE contour=foundation …
DUPLICATE foundation pseudocode FR-foundation-6
VERDICT traceability=FAIL features=4 gaps=1 inconclusive=0
```

Первый прогон дал шесть разрывов, из них пять — мои: один и тот же ключ был заявлен несколькими
алгоритмами (`FR-source-and-correct-3`, `-5`, `-13`, `AC-source-and-correct-10`, `-24`). Исправлено
перераспределением заявок: каждый ключ заявляет РОВНО один алгоритм. Шестой разрыв
(`DUPLICATE foundation pseudocode FR-foundation-6`) существовал до этой работы и лежит в чужом
файле — не правился.

## Вопросы координатору (четыре стыка, все названы в `01_specification.md`, раздел «Стыки»)

1. **S-1, самый важный.** Ноль сопоставлений теперь даёт `refused(no_food_matched)` — статус
   root-уровня (ADR-001, `Specification.md`), а временный `failed(no_food_matched)` заглушки
   (DEC-A-014) снимается, ровно как обещал план `scan-pipeline`. ПОСЛЕДСТВИЕ: `AC-scan-pipeline-15`
   утверждает `failed(no_food_matched)` на реальном порте и СТАНЕТ КРАСНЫМ при подмене. Тест чужой
   фичи этой квитанцией не правился. Нужно решение: правит его исполнитель `scan-pipeline` заранее
   либо исполнитель `source-and-correct` в Phase 3.
2. **S-2.** Путь seed-файла: роадмап называет `packages/db/seed/food-synonym.ru.json`, поручение
   координатора — `data/ru-synonyms.csv`. План взял путь РОАДМАПА (по нему сверяется закрытие фичи,
   и seed принадлежит применяющему его пакету). Подтвердить либо назвать другой.
3. **S-3.** Число кандидатов: поручение говорит «≤ 5», root `Pseudocode.md` (`ReplaceIngredient`
   шаг 2) — «до 20». План развёл их как ДВА разных поиска: автоматический ≤ 5, ручной ≤ 20.
   Подтвердить.
4. **S-4 и расширение контракта.** `resolve_conflict` принимает `choice ∈ {base, model}`; `base` —
   это root `take_db` (переименование зафиксировано), `refine_composition` на маршрут не
   отправляется вовсе (по root-алгоритму это путь интерфейса). Значение `model` реализовано как
   МАСШТАБИРОВАНИЕ ПОРЦИИ до совпадения с оценкой модели — число по-прежнему считается из снимка
   базы, `model_estimate_kcal` источником не становится: записать его значило бы отменить ADR-001
   через маршрут правки. Кроме того, тело маршрута 3 расширяется полем `query?`, а ответ — полем
   `candidates[]` (нового маршрута не заводится: канон объявляет ровно 14). Расширение канонического
   контракта требует решения владельца канона.

Дополнительно к сведению, решения НЕ требует: порог триграмм **0,45**, предел кандидатов и диапазон
порции объявлены ЛИТЕРАЛАМИ КОДА, а не переменными окружения (прецедент — порог эскалации 0,6,
ADR-004); история поправок сделана КОЛОНКОЙ `recognition.corrections`, а не пятнадцатой сущностью
(канон §4 объявляет ровно 14); номер миграции назван «следующим свободным», потому что
`scan-pipeline` выполняется раньше и свои миграции ещё не создал.

## Проверенные факты и их источники

- Страница дампов USDA открыта WebFetch 2026-09-12: Foundation Foods (апрель 2026), SR Legacy
  (апрель 2018), FNDDS 2021-2023 (октябрь 2024), все в JSON и CSV; «The Full Download file contains
  files for all of the FoodData Central data types». ЛИЦЕНЗИОННОГО ТЕКСТА НА ЭТОЙ СТРАНИЦЕ НЕТ — он
  на `api-guide` (раздел Licensing), и в `03_architecture.md` эти две страницы не смешаны.
- `packages/db/migrations/001_init.sql` прочитан 2026-09-12: `pg_trgm`, `food_item`, `food_synonym`,
  оба GIN-индекса триграмм и `food_synonym_exactly_one_form` уже существуют. Фича их НАПОЛНЯЕТ.
- `grep MatchIngredientPort` по `apps/` и `packages/` совпадений не даёт: `scan-pipeline` не
  реализован, и Phase 3 этой фичи не может начаться раньше него. Записано в `05_completion.md`.

## Что осталось непроверенным

- Точные URL дампов FDC и их sha256 в план НЕ внесены: ссылки версионированы по дате релиза, и
  угаданный адрес был бы непроверенным значением в плане. Заполняются в Phase 3 фактическими.
- Плановые пути и заголовки тестов в `## Criterion coverage` — предсказание, а не измерение; ворота
  `--completion` имеют смысл только после Phase 3.
- Время работы: ~40 минут, в пределах бюджета 45.

Status: completed
