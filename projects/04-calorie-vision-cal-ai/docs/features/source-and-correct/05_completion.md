# Фича `source-and-correct` — завершение: порядок работ, команды, покрытие критериев

**Ревизия 2** (DEC-A-023): `failed(no_food_matched)` при нуле сопоставлений; `resolve_conflict`
принимает единственное значение `take_db`.

## Статус документа

Написан в Phase 1 (PLAN). Таблица `## Criterion coverage` — ПЛАНОВАЯ: пути файлов и заголовки тестов
ожидаемые, не фактические. Phase 3 заменяет их тем, что действительно написано, и только тогда ворота
`--completion` имеют смысл: они открывают файл и ищут заголовок дословно.

## Предусловие: эта фича не начинается раньше `scan-pipeline`

`UsdaMatchIngredientPort` реализует интерфейс, которого в коде ЕЩЁ НЕТ: `grep MatchIngredientPort`
по `apps/` и `packages/` 2026-09-12 не даёт совпадений. Начинать Phase 3 до завершения
`scan-pipeline` значило бы писать реализацию под интерфейс, объявленный только в документе, — и
получить два расходящихся определения одного контракта.

`foundation` при этом уже реализован: таблицы, индексы триграмм, `CHECK` строгого ИЛИ, пул, раннер
миграций и ограничение частоты существуют (проверено чтением `packages/db/migrations/001_init.sql` и
`apps/api/src/`).

## Порядок выполнения Phase 3

1. **Миграция** (`packages/db/migrations/<следующий свободный>_source_and_correct.sql`): четыре
   колонки `recognition` и два `CHECK`. Прогнать раннер на чистой базе и на базе с данными.
2. **Нормализация** (`packages/shared/src/domain/normalize-ru.ts`) — первой: от неё зависят и seed,
   и поиск, и один и тот же код обязан считать `name_ru_normalized` в обоих местах.
3. **Импорт** (`scripts/import-fdc.ts`) и фикстура из 50 записей. Инструкция оператора
   (`docs/operations/import-fdc.md`) заполняется ФАКТИЧЕСКИМИ адресами и хешами скачанных дампов.
4. **Seed** (`packages/db/seed/food-synonym.ru.json`, 100 позиций) и загрузчик. Курация — работа
   человека; строки помечаются `curated_by`, а доли рецептов объявляются оценкой, а не данными USDA.
5. **Поиск** (`packages/db/src/queries/food-search.ts`) и тест покрытия 50 русских запросов.
6. **Порт** (`apps/recognizer/src/match/`) и замена `NullMatchIngredientPort` в точке сборки.
   Контрактный тест `scan-pipeline` прогоняется БЕЗ правок его текста.
7. **Расчёт и терминальный статус** (`apps/recognizer/src/compute/`): `done` при одном совпадении,
   `failed(no_food_matched)` при нуле — тот же статус, что писала заглушка `scan-pipeline`, поэтому
   её критерий `AC-scan-pipeline-15` остаётся зелёным и не правится.
8. **Маршрут правок** (`apps/api/src/routes/scans-correct.ts`) со всеми четырьмя операциями.
9. **Экран результата** (`apps/web`).
10. **Стражи** и их ИСПЫТАНИЕ МУТАЦИЕЙ — шесть пар прогонов из `04_refinement.md`, обе строки каждой
    пары в квитанции.
11. **Производительность**: синтетика 300 000 строк, p95 ≤ 200 мс.

## Команды

```bash
# из каталога проекта, после foundation и scan-pipeline
npm run migrate                       # применить миграцию этой фичи
npm run seed:synonyms                 # загрузить 100 позиций RU-курации
npm run import:fdc -- --dir ./dumps --snapshot-date 2026-04-01   # дампы скачивает ОПЕРАТОР
npm test                              # unit + integration + contract + concurrency
npm run test:performance              # 300 000 строк, отдельной командой
npm run lint && npm run build
docker compose build api recognizer web
node ../../.claude/hooks/check-model-cost.cjs .   # потолки вызовов модели не изменились
bash /root/.npm/_npx/ac10dded1a3b4a50/node_modules/@dzhechkov/p-replicator/scripts/check-pipeline-gaps.sh . --completion
```

`docker compose up` — только после `node ../../.claude/hooks/check-ports.cjs .` и
`bash ../../scripts/check-port-conflicts.sh .`.

## Чеклист готовности

- [ ] Миграция применяется и откатывается; `CHECK` на `conflict_choice` и парный `CHECK` проверены
      отрицательными вставками.
- [ ] Импорт идемпотентен: два прогона, `id` не изменились, `import_snapshot_date` из аргумента.
- [ ] Запись без нутриента отвергнута и названа; ноль не подставлен ни в одну строку.
- [ ] Seed из 100 позиций загружен; отрицательные случаи (обе формы, ни одной, сумма долей ≠ 1,
      несуществующий `fdc_id`) дают отказ с названной строкой.
- [ ] Покрытие 50 русских запросов зелёное; удаление 10 строк seed делает его красным (испытание).
- [ ] Контрактный тест порта из `scan-pipeline` зелёный БЕЗ изменений его текста.
- [ ] `done` достигается впервые в жизни проекта; `failed(no_food_matched)` при нуле совпадений;
      `AC-scan-pipeline-15` прогнан ПОСЛЕ подмены порта и остался зелёным.
- [ ] Все шесть стражей испытаны мутацией; в квитанции по ДВЕ строки на каждый (красный и зелёный).
- [ ] Ни одна операция фичи не изменила `scan_quota_counter.used` и не обратилась к `ModelProvider`
      (проверено счётчиками, а не журналом).
- [ ] Правка чужого скана даёт `404` и не меняет ни одного поля.
- [ ] Два конкурентных прогона (две правки одного скана; правка во время завершения) зелёные.
- [ ] `npm test`, `npm run lint`, `npm run build` зелёные; `docker compose build` для `api`,
      `recognizer`, `web` проходит.
- [ ] Ворота `--completion` возвращают `0` на ФАКТИЧЕСКИХ заголовках тестов.
- [ ] Стыки S-1…S-4 решены координатором (DEC-A-023) и внесены в документы ревизией 2; новых
      открытых вопросов к владельцу канона нет.

## Что эта фича НЕ доказывает

- **Живого распознавания не было** (DEC-A-009: ключа `ANTHROPIC_API_KEY` в окружении нет). Качество
  реального сопоставления «что сняла камера → запись USDA» не измерено и измерено быть не может.
- **Полный дамп FDC не импортирован.** Тесты идут на фикстуре из 50 записей и синтетике из 300 000
  строк; настоящий импорт — операция оператора, её результат предъявляется отдельно.
- **Покрытие русской кухни — 100 позиций seed'а**, а не 300 из ADR-006 и не произвольное меню.
  Тест покрытия доказывает отсутствие регресса против ЭТОГО списка.
- **Доли рецептов — курация человека, а не данные USDA.** Число для «борща» настолько верно,
  насколько верна оценка состава.
- **NFR-PERF-001 (6 с p95) этой фичей не измеряется**: он про полный путь скана и снимается на
  развёрнутом стенде по выданному адресу.
- **Замер 100 мс в браузере не выполнен**: проверяется серверная часть пересчёта, клиентская —
  предмет E2E после MVP.
- **Дневник, карточка, коды партнёра, вход через Telegram, согласие и экран лимита** не реализованы:
  их вводят более поздние фичи роадмапа.

## Criterion coverage

**Таблица ПЛАНОВАЯ.** Phase 3 заменяет пути и заголовки фактическими.

| Criterion | Test file | Test title |
|-----------|-----------|------------|
| AC-source-and-correct-1 | tests/integration/import-fdc.test.ts | повторный импорт того же дампа не двоит строки и сохраняет дату снимка из аргумента |
| AC-source-and-correct-2 | tests/integration/import-fdc.test.ts | запись без нутриента отвергается а запись без порции получает null вместо ста граммов |
| AC-source-and-correct-3 | tests/unit/normalize-ru.test.ts | нормализует кириллицу и букву ё не превращая русское название в пустую строку |
| AC-source-and-correct-4 | tests/integration/seed-synonyms.test.ts | загружает сто позиций курации и отвергает строку с обеими формами и строку без единой |
| AC-source-and-correct-5 | tests/integration/coverage-50-ru.test.ts | пятьдесят частых русских запросов находят совпадение в таблице синонимов |
| AC-source-and-correct-6 | tests/integration/food-search.test.ts | точное совпадение синонима выигрывает у триграммного и вторая стратегия не выполняется |
| AC-source-and-correct-7 | tests/integration/food-search.test.ts | порог сорок пять сотых отсекает посторонний запрос и число кандидатов не превышает пяти |
| AC-source-and-correct-8 | tests/contract/match-ingredient-port.test.ts | контрактный тест порта проходит на реализации USDA без изменений и порция берётся от модели |
| AC-source-and-correct-9 | tests/integration/match-port.test.ts | сопоставленная позиция несёт снимок с идентификатором записи порцией и датой импорта |
| AC-source-and-correct-10 | tests/integration/match-port.test.ts | составное блюдо даёт часть со своим снимком и отвергается при сумме долей меньше единицы |
| AC-source-and-correct-11 | tests/integration/compute-snapshot-reimport.test.ts | переимпорт записи базы не меняет уже показанное число |
| AC-source-and-correct-12 | tests/integration/match-port.test.ts | одна сопоставленная позиция из трёх даёт done с двумя пометками нет в базе без нуля |
| AC-source-and-correct-13 | tests/integration/match-port.test.ts | ноль сопоставлений даёт failed no_food_matched а не done с нулевым итогом |
| AC-source-and-correct-14 | tests/unit/discrepancy.test.ts | расхождение двадцать два процента поднимает флаг и сохраняет оба числа |
| AC-source-and-correct-15 | tests/unit/discrepancy.test.ts | ровно пятнадцать процентов экрана не вызывают а пятнадцать и одна десятая вызывают |
| AC-source-and-correct-16 | tests/unit/discrepancy.test.ts | нулевой знаменатель даёт не измерено вместо нуля процентов |
| AC-source-and-correct-17 | tests/integration/scans-correct.test.ts | три шага степпера дают двести двадцать граммов без вызова модели и без списания квоты |
| AC-source-and-correct-18 | tests/integration/scans-correct-bounds.test.ts | десять недопустимых значений порции и индекса дают четыреста двадцать два и сохраняют прежнюю порцию |
| AC-source-and-correct-19 | tests/integration/scans-correct-search.test.ts | поиск кандидатов идёт через маршрут правки и отдельного маршрута поиска не существует |
| AC-source-and-correct-20 | tests/integration/scans-correct.test.ts | замена на несуществующую запись даёт четыреста двадцать два а числа от клиента игнорируются |
| AC-source-and-correct-21 | tests/integration/scans-correct.test.ts | удаление позиции пересчитывает итог и записывает поправку в историю |
| AC-source-and-correct-22 | tests/integration/scans-correct-conflict.test.ts | маршрут принимает только take_db сохраняет оба числа и отвергает четыре других значения |
| AC-source-and-correct-23 | tests/integration/scans-correct-ownership.test.ts | чужой и несуществующий скан дают один и тот же ответ четыреста четыре без изменения полей |
| AC-source-and-correct-24 | tests/guard/single-model-estimate-read.test.ts | оценка модели читается ровно в одном месте кодовой базы |
| AC-source-and-correct-25 | tests/performance/food-search-300k.test.ts | поиск по тремстам тысячам записей укладывается в двести миллисекунд на девяносто пятом перцентиле |
| AC-source-and-correct-26 | tests/integration/result-surface.test.ts | экран результата показывает цитату USDA и выводит разметку из названия текстом |
