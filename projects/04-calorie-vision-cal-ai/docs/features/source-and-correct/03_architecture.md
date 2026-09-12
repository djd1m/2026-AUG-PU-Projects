# Фича `source-and-correct` — архитектура

Размещение кода по сервисам канона §6, изменения схемы, внешние зависимости фичи. Системная
архитектура принадлежит [`docs/Architecture.md`](../../Architecture.md) и здесь не переписывается:
ниже только то, что создаёт ЭТА фича поверх `foundation` и `scan-pipeline`.

## Размещение по пакетам и сервисам

| Требование фичи | Пакет / сервис | Файлы (целевые) |
|---|---|---|
| FR-1 импорт USDA | `scripts/` | `scripts/import-fdc.ts`, `scripts/fdc/parse-csv.ts`, `scripts/fdc/nutrient-map.ts`, `docs/operations/import-fdc.md` (инструкция оператору: URL, sha256, порядок) |
| FR-2 курация | `packages/db` | `seed/food-synonym.ru.json` (100 позиций), `src/seed/load-food-synonyms.ts` |
| FR-3 нормализация и поиск | `packages/shared`, `packages/db` | `packages/shared/src/domain/normalize-ru.ts` (одна функция на импорт seed и поиск), `packages/db/src/queries/food-search.ts` |
| FR-4, FR-5 порт | `apps/recognizer` | `src/match/usda-match-port.ts`, `src/match/expand-recipe-parts.ts`, правка точки сборки `src/worker.ts` (замена `NullMatchIngredientPort`) |
| FR-6, FR-7 расчёт и статус | `apps/recognizer` | `src/compute/from-snapshot.ts`, `src/compute/terminal-status.ts` |
| FR-8 расхождение | `apps/recognizer` | `src/compute/discrepancy.ts` — ЕДИНСТВЕННОЕ место чтения `model_estimate_kcal` |
| FR-9…FR-11 маршрут правок | `apps/api` | `src/routes/scans-correct.ts`, `src/correct/apply-op.ts`, `src/correct/validate-input.ts` |
| FR-12 экран результата | `apps/web` | `app/scan/[id]/page.tsx`, `components/source-chip.tsx`, `components/portion-stepper.tsx`, `components/discrepancy-screen.tsx`, `components/replace-item-sheet.tsx` |
| FR-13 страж | `tests/` | `tests/guard/single-model-estimate-read.test.ts` |
| изменения схемы | `packages/db` | `migrations/<следующий свободный номер>_source_and_correct.sql` |

Номер миграции назван «следующим свободным» намеренно: `scan-pipeline` планирует собственные
миграции и выполняется РАНЬШЕ по роадмапу. Прибить номер сейчас значило бы создать коллизию, которую
раннер обязан считать ошибкой, — он по построению отказывается переприменять изменённый файл.

Доменная логика не знает ни `FastifyRequest`, ни клиента `pg`: поиск живёт запросом в `packages/db`,
порт переводит результат в типы `MatchIngredientPort` на границе. `apps/web` не получает ни одного
секрета и в базу не ходит — он читает маршруты `api` (`.claude/rules/secrets-management.md`).

## Изменения схемы

```sql
-- migrations/<N>_source_and_correct.sql
ALTER TABLE recognition
  ADD COLUMN corrections        jsonb        NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN conflict_choice    text,
  ADD COLUMN conflict_choice_at timestamptz,
  ADD COLUMN user_corrected     boolean      NOT NULL DEFAULT false,
  ADD CONSTRAINT recognition_conflict_choice_check
    CHECK (conflict_choice IS NULL OR conflict_choice IN ('base', 'model')),
  ADD CONSTRAINT recognition_conflict_choice_pair
    CHECK ((conflict_choice IS NULL) = (conflict_choice_at IS NULL));
```

Три решения, каждое с причиной:

- **Закрытое множество `conflict_choice` объявлено в СХЕМЕ**, а не только в коде: значение вне
  множества иначе доедет до экрана и будет показано как выбор пользователя.
- **Парный `CHECK`**: выбор без времени и время без выбора — разные виды полуправды, и оба
  выглядят правдоподобно.
- **Новых таблиц НЕТ.** История поправок — колонка, а не пятнадцатая сущность: канон §4 объявляет
  ровно 14, и добавление сущности — изменение канона, а не деталь реализации.

Таблицы `food_item` и `food_synonym` уже созданы миграцией `001_init.sql` вместе с индексами
`food_item_name_en_trgm_idx`, `food_synonym_normalized_trgm_idx` и ограничением
`food_synonym_exactly_one_form`. Эта фича их не трогает — она их НАПОЛНЯЕТ. Проверено чтением
`packages/db/migrations/001_init.sql` 2026-09-12: расширение `pg_trgm` создаётся там же.

## Структура каталогов (добавления)

```
04-calorie-vision-cal-ai/
├── scripts/
│   ├── import-fdc.ts                       # npm run import:fdc
│   └── fdc/{parse-csv.ts,nutrient-map.ts}
├── packages/
│   ├── db/
│   │   ├── seed/food-synonym.ru.json       # 100 позиций RU-курации
│   │   ├── src/seed/load-food-synonyms.ts
│   │   └── src/queries/food-search.ts
│   └── shared/src/domain/normalize-ru.ts
├── apps/
│   ├── recognizer/src/
│   │   ├── match/{usda-match-port.ts,expand-recipe-parts.ts}
│   │   └── compute/{from-snapshot.ts,terminal-status.ts,discrepancy.ts}
│   ├── api/src/
│   │   ├── routes/scans-correct.ts
│   │   └── correct/{apply-op.ts,validate-input.ts}
│   └── web/
│       ├── app/scan/[id]/page.tsx
│       └── components/{source-chip.tsx,portion-stepper.tsx,discrepancy-screen.tsx,replace-item-sheet.tsx}
└── tests/
    ├── unit/{normalize-ru,discrepancy,compute-from-snapshot,correct-validate}.test.ts
    ├── integration/{import-fdc,seed-synonyms,food-search,match-port,scans-correct,coverage-50-ru}.test.ts
    ├── performance/food-search-300k.test.ts
    └── guard/single-model-estimate-read.test.ts
```

Тесты лежат в общем `tests/` с разделением по слою — соглашение `foundation`, здесь не меняется.
Каталог `performance/` добавляется этой фичей: прогон на 300 000 синтетических строк идёт дольше
обычного integration и запускается отдельной командой, чтобы не удлинять каждый `npm test`.

## Зависимости npm (добавления)

| Пакет | Куда | Зачем | Альтернатива, отвергнутая |
|---|---|---|---|
| потоковый разбор CSV (`csv-parse` либо аналог) | `scripts` (devDependency) | дампы FDC — CSV на сотни мегабайт; читать их целиком в память значит зависеть от размера чужого файла | собственный разбор: кавычки и переводы строк внутри полей — источник тихих ошибок |

Больше НИ ОДНОЙ: поиск — SQL с `pg_trgm` (расширение базы, не пакет), нормализация — стандартные
регулярные выражения с `\p{L}` и флагом `/u`, экран — уже установленный Next.js. Клиент HTTP для
USDA не нужен: в пользовательском пути обращений к FDC НЕТ вовсе.

## External Dependencies

| Capability needed | Provider / API | Evidence | Verdict | Requirements relying on it |
|---|---|---|---|---|
| отдаёт полные наборы данных дампами (Foundation Foods, SR Legacy, FNDDS 2021-2023) в CSV | USDA FoodData Central, раздел Download Data Sets | [fdc.nal.usda.gov/download-datasets/](http://fdc.nal.usda.gov/download-datasets/) · проверено WebFetch 2026-09-12 · «Foundation Foods» (релиз апрель 2026, JSON и CSV), «SR Legacy» (апрель 2018, JSON и CSV), «FNDDS 2021-2023» (октябрь 2024, JSON и CSV), «The Full Download file contains files for all of the FoodData Central data types» | CONFIRMED | FR-source-and-correct-1 |
| FNDDS несёт порции в граммах и бытовых мерах | FNDDS 2021-2023 (внутри FDC) | факт-лист ARS, цитируется `docs/discovery/research/market-and-data.md` §B: «Продукты и порции в граммах и бытовых мерах для NHANES/WWEIA», 65 нутриентов на позицию, обновление раз в два года | CONFIRMED (унаследовано из исследования) | FR-source-and-correct-1, AC-source-and-correct-2 |
| право использовать данные FDC в закрытом коммерческом продукте (CC0) с просьбой называть источник | USDA FoodData Central, раздел Licensing | `docs/Architecture.md`, External Dependencies, строка про Licensing — дословно «USDA FoodData Central data are in the public domain and they are not copyrighted» и «No permission is needed for their use, but we request that users list FoodData Central as the source of the data»; независимо подтверждено записью data.gov (License = `usa.gov/publicdomain/label/1.0/`, сверено 2026-09-10) | CONFIRMED (унаследовано) | NFR-source-and-correct-3, FR-source-and-correct-12 |
| нечёткое совпадение по триграммам | PostgreSQL 16, расширение `pg_trgm` | `packages/db/migrations/001_init.sql` строка 14 `CREATE EXTENSION IF NOT EXISTS pg_trgm`; индексы `food_item_name_en_trgm_idx`, `food_synonym_normalized_trgm_idx` созданы там же (прочитано 2026-09-12) | CONFIRMED — расширение уже в схеме, не новая зависимость | FR-source-and-correct-3, NFR-source-and-correct-1 |

**Граница подтверждённого названа явно.** Страница Download Data Sets перечисляет наборы, форматы и
даты релизов, но НЕ содержит лицензионного текста — при проверке 2026-09-12 его там нет. Лицензия
подтверждена ДРУГОЙ страницей (`api-guide`, раздел Licensing), и именно она цитируется в
`docs/Architecture.md`. Смешивать две страницы в одну ссылку значило бы приписать первоисточнику
то, чего на нём не написано.

**Чего в списке нет и почему.** В пользовательском пути обращений к USDA НЕТ: база импортируется
заранее, поэтому ни лимит FDC (1000 запросов в час на ключ), ни доступность чужого сервиса на
распознавание не влияют. Ключ `data.gov` этой фиче не нужен вовсе — дампы скачиваются без ключа.
Open Food Facts не подключается ни по API, ни дампом (ADR-005); строка `openfoodfacts` не должна
встречаться ни в коде, ни в окружении.

**Точные URL дампов и их sha256 в плане НЕ ЗАФИКСИРОВАНЫ.** Страница перечисляет наборы, но
конкретные ссылки версионированы по дате релиза и меняются; записать сюда угаданный адрес значило бы
поставить в план непроверенное значение. Инструкция оператора (`docs/operations/import-fdc.md`)
заполняется в Phase 3 ФАКТИЧЕСКИМИ адресами и хешами скачанных файлов — то есть измерением, а не
предсказанием.

## Переменные окружения

Фича НЕ добавляет ни одной переменной. Порог триграмм 0,45, диапазон порции 5–2000 г, порог
расхождения 0,15 и предел кандидатов 5/20 — ЛИТЕРАЛЫ КОДА, а не конфигурация:

- вынесенное наружу число однажды приедет пустым или неверным, и `honest-configuration.md` требовал
  бы валить старт ради значения, которое никто не собирается менять от окружения к окружению;
- понижение порога тихо превращает «не нашли» в «нашли не то», а это ровно то число, которое
  пользователь примет за свой результат.

Прецедент — порог эскалации 0,6: канон объявляет его числом, а не переменной (ADR-004). Потолки
вызовов модели остаются переменными по той же логике наоборот: они про ДЕНЬГИ и отличаются на
стенде и в проде.

## Зависимости от соседних фич

| Что нужно | Откуда | Состояние на 2026-09-12 |
|---|---|---|
| интерфейс `MatchIngredientPort`, контрактный тест порта, вызывающий код `RecognizeScanWithinScanPipeline` | `scan-pipeline` | ЗАПЛАНИРОВАНО, не реализовано: `grep MatchIngredientPort` по `apps/`, `packages/` не даёт совпадений. Эта фича НЕ МОЖЕТ начать Phase 3 раньше, чем `scan-pipeline` завершит свою |
| таблицы `food_item`, `food_synonym`, `pg_trgm`, индексы триграмм | `foundation` | РЕАЛИЗОВАНО, проверено чтением `packages/db/migrations/001_init.sql` |
| пул соединений, раннер миграций, формат ответа `{data, meta}`, ограничение частоты, проверка владения по `owner_key` | `foundation` | РЕАЛИЗОВАНО (`packages/db/src/pool.ts`, `apps/api/src/http/rate-limit.ts` и соседи) |
| `AC-scan-pipeline-15` утверждает `failed(no_food_matched)` на реальном порте | `scan-pipeline` | СТАНЕТ КРАСНЫМ при подмене порта. Правка теста соседней фичи — не работа этой квитанции; стык S-1 маршрутизирован координатору |

## Границы, которые фича обязана сохранить

- **Число только из базы (ADR-001).** Единственное чтение `model_estimate_kcal` — в
  `compute/discrepancy.ts`; маршрут правок не принимает от клиента ни калорийность, ни значения на
  100 г. Страж по исходнику испытывается мутацией.
- **`web` без секретов и без базы.** Экран результата читает маршруты `api`; `ANTHROPIC_API_KEY`
  остаётся только у `recognizer`, `TELEGRAM_BOT_TOKEN` — только у `api`.
- **`db` и `storage` не публикуют портов** (без изменений к `foundation`).
- **Квота не списывается ни одной операцией этой фичи.** Ни правка, ни поиск, ни импорт не зовут
  модель; проверяется счётчиком обращений к `ModelProvider`, а не текстом журнала.
- **Порядок операций.** Ограничение частоты ДО разбора тела; проверка владения ДО любой мутации;
  валидация диапазонов ДО записи. Недоступность базы — исключение, а не возвращаемое значение:
  штатный возврат из колбэка транзакции её коммитит.
- **Импорт — не сервис compose.** `npm run import:fdc` остаётся разовой задачей оператора; седьмого
  сервиса не появляется (канон §6 объявляет ровно шесть).
