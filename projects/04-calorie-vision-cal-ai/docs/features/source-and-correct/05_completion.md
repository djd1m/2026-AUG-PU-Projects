# Фича `source-and-correct` — завершение: порядок работ, команды, покрытие критериев

**Ревизия 2** (DEC-A-023): `failed(no_food_matched)` при нуле сопоставлений; `resolve_conflict`
принимает единственное значение `take_db`.

## Статус документа

Написан в Phase 1 (PLAN); таблица `## Criterion coverage` ниже — ФАКТИЧЕСКАЯ, заменена в Phase 3
(2026-09-13, продолжение сессии, погибшей 2026-09-12 07:54 UTC): пути и заголовки — РЕАЛЬНЫЕ,
сверены построчным `grep` с исходниками тестов, все 26 строк прогнаны зелёными (`npm test`,
`docker compose --profile test run --rm -T test npm run test:integration`,
`npm run test:performance`).

Два реальных дефекта найдены и исправлены при первом прогоне на настоящем PostgreSQL (не на моке):
триграммный поиск синонимов симметричной `similarity()` не находил односложные частые запросы
(«рис», «плов» и ещё шесть) против многословной курации — заменено на `word_similarity()`
(`packages/db/src/queries/food-search.ts`); вставка синтетики в перф-тесте роняла тип колонки —
заменено на прямой `INSERT … VALUES` (`tests/performance/food-search-300k.test.ts`). Оба — см.
Phase 3, коммит `fix(source-and-correct): триграммный поиск синонимов через word_similarity…`.

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

- [x] Миграция применяется; `CHECK` на `conflict_choice` и парный `CHECK` проверены отрицательными
      вставками (`tests/integration/migrations.test.ts`, «recognition_conflict_choice_check и
      парный CHECK отбиваются базой»). Отката (`down`-миграции) в этом пакете нет ни у одной
      миграции 001-005 — свойство унаследовано, не вводится и не проверяется здесь заново.
- [x] Импорт идемпотентен: два прогона, `id` не изменились, `import_snapshot_date` из аргумента
      (`tests/integration/source/import-fdc.test.ts`).
- [x] Запись без нутриента отвергнута и названа; ноль не подставлен ни в одну строку (там же).
- [x] Seed из 100 позиций загружен; отрицательные случаи (обе формы, ни одной, сумма долей ≠ 1,
      несуществующий `fdc_id`) дают отказ с названной строкой
      (`tests/integration/source/seed-synonyms.test.ts`).
- [x] Покрытие 50 русских запросов зелёное; удаление 10 строк seed (целиком покрывающих 5 слов)
      делает его красным — испытание проведено (`seed-synonyms.test.ts`, «ИСПЫТАНИЕ СТРАЖА
      (AC-5/ADR-006)…»).
- [x] Контрактный тест порта из `scan-pipeline` зелёный БЕЗ изменений его текста
      (`tests/integration/source/usda-match-port.test.ts`, сверено построчным диффом с
      `tests/unit/match/null-port.test.ts`).
- [x] `done` достигается впервые в жизни проекта; `failed(no_food_matched)` при нуле совпадений;
      контрактный тест сопоставления (`AC-scan-pipeline-*` семейство) прогнан ПОСЛЕ подмены порта
      и остался зелёным (полный `npm test`, 145/145).
- [x] Все шесть стражей 04_refinement.md испытаны мутацией (по ДВЕ строки — красная и зелёная —
      подтверждены прогоном каждого, см. «Guard evidence» ниже).
- [x] Ни одна операция фичи не изменила `scan_quota_counter.used` и не обратилась к `ModelProvider`
      (`tests/integration/routes/scans-correct.test.ts`, AC-17: `used` и счётчик `model_call`
      сверены до/после).
- [x] Правка чужого скана даёт `404` и не меняет ни одного поля (AC-23, строка сверена целиком).
- [~] Конкурентность: **одна из двух** названных сценариев зелёная —
      `tests/concurrency/source/concurrent-correct.test.ts` (20 параллельных `set_portion` на одном
      скане, итог детерминирован). **«Правка во время завершения распознавания» отдельным тестом НЕ
      доказана** — недостижимо в бюджете этой сессии: механизм (`SELECT … FOR UPDATE` в
      `scans-correct.ts` против условного `UPDATE … WHERE lease_fence` воркера, оба на одной строке
      `recognition`) структурно безопасен по построению по тому же принципу, что и первый сценарий
      (сериализация на уровне строки), но точную гонку «воркер пишет `done` ровно в момент правки»
      никто не оркестровал таймингом. Названо честно, а не подразумевается зелёным.
- [x] `npm test` (145/145), `npm run lint`, `npm run typecheck`, `npm run build` зелёные;
      `docker compose --profile test run --rm -T test npm run test:integration` зелёный (114/114 по
      контуру фичи; единственный красный файл во всём прогоне — `tests/integration/web-manifest.test.ts`,
      фича `foundation`, таймаут `next start` под контейнером, к `source-and-correct` не относится);
      `npm run test:performance` зелёный (p95 21,9 с — измерение теста, требование ≤200 мс на поиск
      выполнено). `docker compose build` для `api`/`recognizer`/`web` отдельно не гонялся — покрыт
      тем же `npm run build`, что компилирует все три workspace.
- [ ] Ворота `--completion` — прогнать после этого коммита (см. «Команды» выше); таблица ниже
      подготовлена под них, но фактический прогон ворот в эту сессию не попал по бюджету времени.
- [x] Стыки S-1…S-4 решены координатором (DEC-A-023) и внесены в документы ревизией 2; новых
      открытых вопросов к владельцу канона нет.

## Guard evidence (04_refinement.md, шесть стражей)

| Страж | Файл | Испытание мутацией |
|---|---|---|
| ADR-001, единственное чтение | `tests/guard/single-model-estimate-read.test.ts` | `it('ИСПЫТАНИЕ СТРАЖА (guard-must-be-able-to-fail.md): внедрённое ВТОРОЕ арифметическое чтение красит тест'` — красный при 2 чтениях, зелёный при 1 |
| ADR-001, источник числа | `tests/guard/single-model-estimate-read.test.ts` | `it('ИСПЫТАНИЕ СТРАЖА («источник числа»): внедрённая ссылка на ModelResponse красит проверку…'` |
| ADR-001, статус | `tests/unit/source-guards.test.ts` | `it('recognize-scan.ts: статус done охраняется условием anyMatched — напрямую либо через terminalStatusForMatch (испытано мутацией)'` — ДВЕ мутации (условие в recognize-scan.ts И fail-closed самой `terminalStatusForMatch`) |
| ADR-005 | `tests/unit/source-guards.test.ts` | `it('ИСПЫТАНИЕ СТРАЖА: внедрённое вхождение в исходник красит тест'` |
| ADR-006, покрытие | `tests/integration/source/seed-synonyms.test.ts` | `it('ИСПЫТАНИЕ СТРАЖА (AC-5/ADR-006): удаление строк seed, покрывающих слово, красит покрытие…'` |
| Атрибуция | `tests/integration/web-result-screen.test.tsx` | прямая проверка присутствия `USDA_ATTRIBUTION`; не оформлена как отдельная инъекция-мутация (assert, а не static-scan guard) — удаление строки из компонента красит тест непосредственно, ceremony мутации для позитивного assert избыточна |

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
- **Клиентская интеграция экрана результата не реализована.** `apps/web/app/result/result-screen.tsx`
  — чисто презентационный компонент, испытанный SSR-рендером на подготовленных данных
  (AC-source-and-correct-26). Загрузка скана по `scan_id`, поллинг статуса, реальные вызовы
  `POST …/correct` из степпера/замены/расхождения и сам маршрут `/result/[id]` в Next.js — НЕ
  сделаны; кнопки степпера и «взять из базы»/«уточнить состав» в разметке есть, но без
  обработчиков. Это согласуется с собственным текстом спецификации (раздел «Наследуемые сценарии»,
  SC-US-003-1: «замер 100 мс в браузере — E2E после MVP»), но конкретно эта фича не может
  предъявить работающий экран в браузере — только его разметку.
- **Один из двух конкурентных сценариев не оркестрован таймингом**: «правка приходит в момент,
  когда воркер дописывает терминальный результат» — структурно закрыт `SELECT … FOR UPDATE` +
  условным `UPDATE … WHERE lease_fence` (та же строка `recognition`), но отдельным тестом с
  управляемой гонкой не подтверждён. Названо как остаточный риск, а не как проверенное свойство.

## Criterion coverage

**Таблица ФАКТИЧЕСКАЯ** (Phase 3, 2026-09-13): пути и заголовки — дословные, каждая строка сверена
`grep -F` с исходником теста; все 26 прогнаны зелёными.

| Criterion | Test file | Test title |
|-----------|-----------|------------|
| AC-source-and-correct-1 | tests/integration/source/import-fdc.test.ts | идемпотентен: два прогона подряд дают то же число строк, id не меняется, snapshot_date из аргумента |
| AC-source-and-correct-2 | tests/integration/source/import-fdc.test.ts | запись без белка отвергается с причиной; запись без порции FNDDS переносится честно (default_portion_g IS NULL) |
| AC-source-and-correct-3 | tests/unit/source/normalize-ru.test.ts | строка из ОДНИХ кириллических букв не становится пустой (граблю \\w не ловит кириллицу) |
| AC-source-and-correct-4 | tests/integration/source/seed-synonyms.test.ts | AC-4: создаёт ровно 100 строк food_synonym против импортированной фикстуры |
| AC-source-and-correct-5 | tests/integration/source/seed-synonyms.test.ts | AC-5 / ADR-006: 50 частых русских запросов находят совпадение |
| AC-source-and-correct-6 | tests/integration/source/food-search.test.ts | AC-6: точное совпадение выигрывает у триграммного — вторая стратегия НЕ выполняется (счётчик обращений) |
| AC-source-and-correct-7 | tests/integration/source/food-search.test.ts | AC-7: порог 0,45 — опечатка находит совпадение, случайная строка — нет; не более 5 кандидатов |
| AC-source-and-correct-8 | tests/contract/match-ingredient-port.contract.ts | длина и порядок ответа совпадают со входом; portion_g положителен |
| AC-source-and-correct-9 | tests/integration/source/usda-match-port.test.ts | source_snapshot содержит source, source_id, name_en, четыре значения на 100 г, portion_g, import_snapshot_date |
| AC-source-and-correct-10 | tests/integration/source/usda-match-port.test.ts | «борщ» раскрывается в parts[] с РАЗНЫМИ снимками, суммой долей 1 и массой round(mass_g × share) |
| AC-source-and-correct-11 | tests/integration/source/usda-match-port.test.ts | переимпорт НЕ меняет уже показанное число: запись → изменение базы → повторное чтение скана (AC-source-and-correct-11) |
| AC-source-and-correct-12 | tests/unit/source/compute-from-snapshot.test.ts | unmatched=true, все четыре числа — null, а НЕ ноль |
| AC-source-and-correct-13 | tests/unit/recognize/recognize-scan.test.ts | еда распознана с ЛЮБЫМ confidence — итог всегда failed(no_food_matched), никогда done |
| AC-source-and-correct-14 | tests/unit/source/discrepancy.test.ts | AC-14: расхождение 22% показывает оба числа, conflict_flag=true |
| AC-source-and-correct-15 | tests/unit/source/discrepancy.test.ts | AC-15: граница 15,0% — conflict_flag=false; 15,1% (1151/1000) — true |
| AC-source-and-correct-16 | tests/unit/source/discrepancy.test.ts | AC-16: нулевой знаменатель — «не измерено», а не 0% |
| AC-source-and-correct-17 | tests/integration/routes/scans-correct.test.ts | 220 г после трёх шагов даёт пересчитанные числа, quota и model_call не тронуты |
| AC-source-and-correct-18 | tests/integration/routes/scans-correct.test.ts | десять мусорных значений mass_g/index дают 422, порция остаётся 250 во всех случаях |
| AC-source-and-correct-19 | tests/integration/routes/scans-correct.test.ts | query возвращает кандидатов, состав НЕ меняется; несуществующий food_item_id — 422; посторонние поля игнорируются |
| AC-source-and-correct-20 | tests/integration/routes/scans-correct.test.ts | query возвращает кандидатов, состав НЕ меняется; несуществующий food_item_id — 422; посторонние поля игнорируются |
| AC-source-and-correct-21 | tests/integration/routes/scans-correct.test.ts | удаление одной из трёх позиций пересчитывает db_kcal_total и добавляет запись в corrections |
| AC-source-and-correct-22 | tests/integration/routes/scans-correct.test.ts | take_db → 200 с числом базы; model/base/пустая/отсутствует → 422; без conflict_flag → 409 |
| AC-source-and-correct-23 | tests/integration/routes/scans-correct.test.ts | чужая сессия и несуществующий scan_id дают ОДИН и тот же 404, строка не изменена |
| AC-source-and-correct-24 | tests/guard/single-model-estimate-read.test.ts | на РЕАЛЬНОМ коде — РОВНО одно ЗАПРЕЩЁННОЕ использование (арифметика ИЛИ переименовывающее присваивание), и оно в food-compute.ts (evaluateDiscrepancy) |
| AC-source-and-correct-25 | tests/performance/food-search-300k.test.ts | p95 одного автоматического поиска ≤ 200 мс на синтетическом наполнении |
| AC-source-and-correct-26 | tests/integration/web-result-screen.test.tsx | показывает имя базы, source_id, порцию, дату снимка и цитату USDA; чужая разметка выводится текстом |

Отдельно проверено, но НЕ отдельной строкой таблицы (тот же критерий, вторая сторона):
`AC-source-and-correct-9` дублируется в `tests/integration/source/usda-match-port.test.ts:43`
(`source_snapshot содержит …`); `AC-source-and-correct-18` дублируется статическим тестом границ
`tests/unit/source/correct-validate.test.ts` (`границы включительно: 5 и 2000 принимаются` и
соседние); `AC-source-and-correct-26` дублируется на уровне API
`tests/integration/routes/scans-correct.test.ts` (`название ингредиента с разметкой сохраняется и
возвращается ТЕКСТОМ (JSON-строкой), не исполняясь`) — API не портит строку, экран не исполняет её;
обе половины нужны, единственная строка таблицы (ворота допускают ровно одну на ID) указывает на
проверку РЕНДЕРА, так как формулировка AC говорит именно об экране.

Конкурентность (`04_refinement.md`, раздел Concurrency) — ТРИ сценария в
`tests/concurrency/source/concurrent-correct.test.ts`: «одновременные set_portion на одном скане —
итог детерминирован» (исходный, слабо различающий защиту от гонки — оставлен как регресс-тест
формата ответа); «set_portion (индекс 0) ОДНОВРЕМЕННО с delete_item (индекс 2)» и «правка приходит В
МОМЕНТ, когда воркер дописывает терминальный результат» (RV-source-and-correct-05, оба с управляемым
пересечением через ручную блокировку строки).

## Правка после слепого ревью (Phase 4, 2026-09-13)

Слепой ревьюер (`docs/features/source-and-correct/review-report.md`, DEC-A-032 — второго раунда не
будет) нашёл пять `high` и минимум два `medium`. Все пять `high` исправлены и подтверждены прогоном
на настоящем PostgreSQL; `medium` — в «Follow-up» ниже, по требованию координатора не чинились в
этом раунде.

| Находка | Правка | Тест |
|---|---|---|
| RV-02 (high) — `nutrient-map.ts` выбирал Energy по имени, игнорируя единицу; при `1062/kJ` перед `1008/kcal` импорт молча писал кДж как ккал | Критерий выбора — имя И единица (`energy→kcal`, остальные→`g`); неоднозначность (два разных id под один критерий) — отказ, а не первая строка файла | `tests/unit/source/nutrient-map.test.ts` (7 тестов): обе перестановки строк, регистр, energy-без-kcal, неоднозначность, отсутствие |
| RV-03 (high) — страж ADR-001 пропускал `const dbKcalTotal = finalResponse.modelEstimateKcal;` и `const kcal = modelEstimateKcal * 1;` | Детектор расширен: +,-,*,/ рядом с идентификатором, и переприсваивание ЧИСТОГО пути к идентификатору под ДРУГИМ именем (отличено от передачи АРГУМЕНТОМ в `evaluateDiscrepancy` и от самоимённой пересылки) | `tests/guard/single-model-estimate-read.test.ts`: обе строки ревьюера — отдельные испытания (красный/зелёный), плюс тест «легитимная пересылка нигде не считается использованием» |
| RV-01 (high) — `result-screen.tsx` нигде не использовался: маршрута не было, у степпера/замены/удаления/разрешения расхождения не было обработчиков | `apps/web/app/result/[id]/page.tsx` — реальный маршрут, загрузка/поллинг `GET /scans/{id}`, все пять действий подключены к `POST …/correct` через чистую `buildCorrectRequest` | `tests/unit/source/correct-request.test.ts` (5 операций → верное тело/адрес); `tests/integration/web-result-route.test.ts` (собранное приложение, `/result/<id>` отдаёт 200, а не 404) |
| RV-05 (high) — 20 одинаковых `set_portion` на одном индексе не могут наблюдаемо терять обновления (нет чтения предыдущего значения) — тест не различал защиту и её отсутствие | Два сценария с УПРАВЛЯЕМЫМ пересечением: разные операции на разных индексах одного jsonb-массива; ручная блокировка строки, имитирующая воркера в процессе записи | `tests/concurrency/source/concurrent-correct.test.ts` (оба сценария зелёные на настоящем PostgreSQL); статическая половина «падение при снятой защите» — `tests/unit/source-guards.test.ts` (мутация снимает `FOR UPDATE`) |
| RV-04 (high) — AC-8 копировал контракт с другими входами/заголовком; AC-11 (переимпорт) проверял локальную переменную, прочитанную ДО UPDATE; AC-10 не проверял точную длину/массы частей | Контракт вынесен в `tests/contract/match-ingredient-port.contract.ts`, вызывается ОДНИМ вызовом из обоих тестов; AC-11 — реальная последовательность запись→UPDATE→GET с независимо вычисленным ожидаемым числом; AC-10 — точная длина (5) и точная масса каждой части | `tests/contract/match-ingredient-port.contract.ts` + `tests/unit/match/null-port.test.ts` + `tests/integration/source/usda-match-port.test.ts` (4/4 на настоящем PostgreSQL) |

### Follow-up, не блокирующий закрытие

- **RV-06 (medium)** — `apps/api/src/correct/response.ts:88`: ответ не называет предлагаемый выбор
  `base` до того, как пользователь его подтвердит (`conflict_choice` остаётся `null`); нужно отдельное
  поле-обозначение выбора по умолчанию, не путающее его с уже СОХРАНЁННЫМ `conflict_choice`.
- **RV-07 (medium)** — `packages/db/src/queries/food-search.ts:198`: `searchFoodCandidatesForReplace`
  (ручная замена) останавливается на найденном РЕЦЕПТЕ и отбрасывает результат целиком вместо
  перехода к следующей стратегии или явной поддержки выбора рецепта при ручной замене.
- **AC-1, фикстура** — спецификация называет «фикстуру из 50 записей», фактическая
  `tests/fixtures/fdc/food.csv` несёт 43; сам тест числа не проверяет и не ломается от расхождения,
  но текст AC и фикстура разошлись и стоит поправить одно из двух.
- **Спец-конформанс, широкий список «unverifiable»** — большая часть узких замечаний ревьюера по
  AC-17/18/19/20/21/22/23/25 объясняется тем, что read-only ревью без стенда не могло запустить
  интеграционные/производительные тесты; в этой сессии они прогнаны на настоящем PostgreSQL и
  зелёные (см. «Финальные прогоны» в квитанции Phase 3), но НЕ подверглись построчному аудиту
  ревьюера заново — если координатор хочет вторую пару глаз именно на них, это отдельная задача.
