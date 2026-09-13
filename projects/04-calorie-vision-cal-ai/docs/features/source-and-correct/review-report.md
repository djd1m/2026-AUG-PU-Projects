Reviewer family: codex
Spec revision: sha256:ccc0a67772d2eb4d8ce733baa9a40c3c8f01d96f81ada3f82d5f989b30c8e2e6

# Review — source-and-correct

## Verdict

CHANGES_REQUIRED — пользовательский экран не подключён, импорт может перепутать единицы энергии, обязательный страж пропускает подмену источника числа, а заявленное покрытие превышает фактическое.

Проверен HEAD `cf78cfe6e64452e4d5558c17d5c1f6508a45a0b5`. Обычный `npm test` завершился ошибкой `EROFS` при загрузке конфигурации; `npm test -- --configLoader runner --no-cache` успешно выполнил **145 тестов, 18 файлов, 6,48 с**. Интеграционные, конкурентные и performance-тесты **не запускал: требует стенд**.

База `09cab1a` не является предком HEAD; общий предок — `336085e875bf94f847e880d25d3e2ab01f1cbc57`. Заданный дифф включает отсутствие реализации согласия, Telegram-входа, удаления данных и миграций 003–005. Это расхождение веток; причинность этих потерь данной фичей не установлена. Приёмка интеграции с указанной базой остаётся неподтверждённой.

## Spec conformance

`met` означает подтверждение выполненным тестом и чтением соответствующего кода; `unverifiable` — отсутствие достаточного подтверждения всего критерия. Заголовки ниже сокращены.

| Criterion | Verdict | Evidence |
|---|---|---|
| AC-source-and-correct-1 | not met | `tests/integration/source/import-fdc.test.ts`, «идемпотентен…»: фикстура содержит 43 записи, из них 42 полные; ожидаемые 50 не проверяются. Второй запуск использует другую дату. |
| AC-source-and-correct-2 | unverifiable | `tests/integration/source/import-fdc.test.ts`, «запись без белка отвергается…»: проверки отказа и NULL присутствуют; нужен PostgreSQL. |
| AC-source-and-correct-3 | met | `tests/unit/source/normalize-ru.test.ts`, «регистр, пробелы…» и «строка из ОДНИХ кириллических букв…»: прошли. |
| AC-source-and-correct-4 | unverifiable | `tests/integration/source/seed-synonyms.test.ts`, «создаёт ровно 100 строк…», «база… отвергает…»: отрицательные SQL-вставки присутствуют; не запускались. |
| AC-source-and-correct-5 | unverifiable | `tests/integration/source/seed-synonyms.test.ts`, «50 частых русских запросов…»: проверяет отсутствие промахов; нужен стенд. |
| AC-source-and-correct-6 | unverifiable | `tests/integration/source/food-search.test.ts`, «точное совпадение выигрывает…»: есть счётчик SQL-вызовов; не запускался. |
| AC-source-and-correct-7 | unverifiable | `tests/integration/source/food-search.test.ts`, «порог 0,45…»: предел сравнивается с импортированным `AUTO_CANDIDATE_LIMIT`, независимой проверки литерала 5 нет. |
| AC-source-and-correct-8 | not met | `tests/integration/source/usda-match-port.test.ts`, «длина и порядок…»: исходный контрактный тест скопирован с изменёнными входами и заголовком; требование неизменного текста не выполнено. |
| AC-source-and-correct-9 | unverifiable | `tests/integration/source/usda-match-port.test.ts`, «source_snapshot содержит…»: проверяет типы полей, но не требуемый `source_id = 168878`; нужен стенд. |
| AC-source-and-correct-10 | not met | `tests/integration/source/usda-match-port.test.ts`, «борщ раскрывается…»: seed содержит пять компонентов вместо четырёх; тест не проверяет массы частей и точную длину. |
| AC-source-and-correct-11 | unverifiable | `tests/integration/source/usda-match-port.test.ts`, «переимпорт НЕ меняет…»: после UPDATE проверяется прежняя локальная переменная; повторного чтения скана нет. |
| AC-source-and-correct-12 | unverifiable | `tests/unit/source/compute-from-snapshot.test.ts`, «unmatched=true…»: прошёл для отдельной позиции; завершение распознавания с одной сопоставленной из трёх не проверено. |
| AC-source-and-correct-13 | met | `tests/unit/recognize/recognize-scan.test.ts`, «еда распознана с ЛЮБЫМ confidence…»: прошёл; ветка `failedRecord` сохраняет `dbKcalTotal: null`. |
| AC-source-and-correct-14 | not met | `tests/unit/source/discrepancy.test.ts`, «расхождение 22%…»: арифметика прошла; `buildScanResponse` не называет выбор по умолчанию `base`. |
| AC-source-and-correct-15 | met | `tests/unit/source/discrepancy.test.ts`, «граница 15,0%…»: литералы 1150, 1151 и 1000; тест прошёл. |
| AC-source-and-correct-16 | met | `tests/unit/source/discrepancy.test.ts`, «нулевой знаменатель…»: прошёл; `response.ts` передаёт `discrepancy_ratio` без замены NULL нулём. |
| AC-source-and-correct-17 | unverifiable | `tests/integration/routes/scans-correct.test.ts`, «220 г после трёх шагов…»: нет проверки трёх макронутриентов, счётчика вызовов модели, существующих `used` и p95. |
| AC-source-and-correct-18 | unverifiable | `tests/integration/routes/scans-correct.test.ts`, «десять мусорных значений…»: проверяет 422, но сохранность порции только после всего цикла; серверный прогон не выполнен. |
| AC-source-and-correct-19 | unverifiable | `tests/integration/routes/scans-correct.test.ts`, «query возвращает кандидатов…»: допускает пустой массив, не проверяет поля кандидатов и перечень зарегистрированных маршрутов. |
| AC-source-and-correct-20 | unverifiable | `tests/integration/routes/scans-correct.test.ts`, «…посторонние поля игнорируются»: часть проверок присутствует; сохранённая строка целиком не сверяется, нужен стенд. |
| AC-source-and-correct-21 | unverifiable | `tests/integration/routes/scans-correct.test.ts`, «удаление одной из трёх…»: фактически две позиции; проверяет 550 и длину corrections, но не содержание поправки и p95. |
| AC-source-and-correct-22 | unverifiable | `tests/integration/routes/scans-correct.test.ts`, «take_db → 200…»: не проверяет время выбора, сохранность обоих чисел и неизменность строки после каждого отказа. |
| AC-source-and-correct-23 | unverifiable | `tests/integration/routes/scans-correct.test.ts`, «чужая сессия…»: сравнивает только `items, db_kcal_total`; для отсутствующего ID проверена одна операция, тела ошибок не сравниваются. |
| AC-source-and-correct-24 | not met | `tests/guard/single-model-estimate-read.test.ts`: воспроизведён пропуск прямого присваивания `finalResponse.modelEstimateKcal` в `dbKcalTotal`. |
| AC-source-and-correct-25 | unverifiable | `tests/performance/food-search-300k.test.ts`, «p95 одного автоматического поиска…»: объёмы и бюджет заданы независимо; фактический замер здесь не выполнялся. |
| AC-source-and-correct-26 | not met | `tests/integration/web-result-screen.test.tsx`, «показывает имя базы…»: проверяет изолированный SSR-компонент; открыть этот экран через приложение невозможно. |

## Findings

**RV-source-and-correct-01 — high — `apps/web/app/result/result-screen.tsx:156`.** Компонент нигде в приложении не используется; маршрута результата нет. Степпер, замена и удаление отсутствуют, кнопки разрешения расхождения не имеют обработчиков. Перенос браузерного замера на E2E не отменяет реализацию действий. Подключить экран к скану, реализовать операции и проверить пользовательский путь.

**RV-source-and-correct-02 — high — `scripts/fdc/nutrient-map.ts:31`.** Энергия выбирается по первому имени `Energy`, единица `unit_name` игнорируется. Локальное воспроизведение со строками `1062/Energy/kJ` перед `1008/Energy/kcal` вернуло `energyId: '1062'`; импорт затем записывает это значение как ккал. Выбирать нутриент с проверкой идентификатора и единицы, отказывать при неоднозначности; добавить тест с обеими единицами и перестановкой строк.

**RV-source-and-correct-03 — high — `tests/guard/single-model-estimate-read.test.ts:64`.** Страж распознаёт лишь узкие формы вычитания и `Math.abs`. На реальной функции детектора обе строки `const dbKcalTotal = finalResponse.modelEstimateKcal;` и `const kcal = modelEstimateKcal * 1;` дали `false`. Проверка источника дополнительно ищет имена типов только в одном файле. Зелёные мутации не доказывают запрет подмены итога. Испытать именно присваивание оценки модели в результат и проверять все соответствующие места чтения, включая присваивания и алиасы.

**RV-source-and-correct-04 — high — `tests/integration/source/usda-match-port.test.ts:82`.** Проверка переимпорта утверждает только, что сохранённое до UPDATE число не равно 999. Она останется зелёной при любом ошибочном повторном чтении скана. Аналогично таблица покрытия завышает проверки импорта, состава, четырёх чисел, квоты, времени и владения — конкретные пропуски перечислены выше. Добавить реальные последовательности «записать → изменить базу → GET», независимые ожидаемые значения и сверки состояния; исправить `Criterion coverage` по фактическим утверждениям.

**RV-source-and-correct-05 — high — `tests/concurrency/source/concurrent-correct.test.ts:89`.** Двадцать запросов действительно запускаются параллельно, но итоговое значение «любое от 100 до 119» допустимо и при потерянных обновлениях без блокировки. Проверка согласованности массы и ккал этого не различает. Требуемые `set_portion` одновременно с `delete_item` и правка одновременно с завершением воркера отсутствуют. Реализовать оба сценария с управляемым пересечением операций и показать падение при удалении защиты.

**RV-source-and-correct-06 — medium — `apps/api/src/correct/response.ts:88`.** Ответ передаёт только сохранённый `conflict_choice`, первоначально NULL; требуемого обозначения выбора по умолчанию `base` нет. CSS-класс кнопки не выполняет контракт ответа, а `aria-pressed` при NULL также false. Согласовать и реализовать отдельное представление предлагаемого выбора, сохранив `take_db` как единственную допустимую операцию подтверждения; проверить API и интерфейс.

**RV-source-and-correct-07 — medium — `packages/db/src/queries/food-search.ts:198`.** Ручной поиск останавливается на найденном рецепте, после чего обёртка удаляет все результаты типа `recipe`. Локальное воспроизведение точного совпадения «борщ» вернуло `[]` после одного SQL-вызова; следующие стратегии не выполнялись. Применять фильтрацию допустимых кандидатов до решения об остановке поиска либо явно поддержать выбор рецепта.

## Что проверено без замечаний

- Unit-набор и стражи в текущем виде проходят; их ограниченность отдельно отражена в находках.
- Нормализация сохраняет кириллицу; арифметика отдельной позиции использует снимок; неизвестные значения позиции остаются NULL.
- Ограничитель частоты установлен на `onRequest`, до разбора тела. Правки выполняются под `SELECT … FOR UPDATE`; ошибки внутри транзакции вызывают откат.
- Квота списывается атомарным UPSERT до платного вызова; повторные попытки и эскалация проходят соответствующие проверки. Тесты квоты и аренды содержат настоящий параллельный запуск, хотя здесь не исполнялись.
- Отсутствующие потолки обрабатываются fail-closed; проверки конфигурации прошли. Владение в запросе правки ограничено сессией, чужой ресурс получает 404.
- В compose единственная публикация — loopback-порт прокси; у БД и хранилища публикации нет. Среди проверенных отслеживаемых env-файлов только `.env.example`; явных действующих секретов в просмотренном коде не обнаружено.
- Выполненные проверки не требовали интернета или Docker. Интеграционные тесты импорта используют локальные CSV.
- Согласие перед записью дневника и проверка Telegram-подписи в данном HEAD не подтверждены: соответствующая реализация отсутствует.

Профиль: read-only REVIEW, один исполнитель Codex; точный ID модели, полный расход и длительность обзора не измерены. Контекст прогона: `docs/telemetry/p-replicator/20260912T210218Z-source-and-correct-A-79e4/`. Файлы и историческая телеметрия не изменялись.
