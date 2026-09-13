# Квитанция: source-and-correct — продолжение после гибели сессии 2026-09-12 07:54 UTC

RUN_ID: 20260912T210218Z-source-and-correct-A-79e4
Каталог: /home/dz-projects-2026/n4-wt-source/projects/04-calorie-vision-cal-ai (ветка feat/source-and-correct)
Коммиты этой сессии: dbb7397, 5ef46a0, 2cda321, 0911f3a, 52461c0, 0beb60c

## Ревизия чужой незаконченной работы (первый шаг, до продолжения)

37 незакоммиченных файлов (13 M + 24 untracked). Прочитан весь diff и весь untracked-состав,
сверено с docs/features/source-and-correct/{01_specification,02_pseudocode}.md.

| Область | Состояние на момент ревизии |
|---|---|
| Миграция 006, схема (CHECK на conflict_choice) | готово, соответствует DEC-A-023 |
| normalizeRuName (`\p{L}`/`\p{N}` с `/u`) | готово |
| SearchFoodCandidates (3 стратегии, пороги 0,45/5/20) | готово, но триграммный поиск синонимов был на симметричной `similarity()` — дефект найден при первом прогоне на PostgreSQL, не при ревизии |
| UsdaMatchIngredientPort, ExpandRecipeParts | готово, контракт порта не нарушен |
| ComputeFromSnapshot/EvaluateDiscrepancy (packages/shared, общие recognizer+api) | готово |
| Терминальный статус done/failed(no_food_matched) | готово |
| POST /scans/{id}/correct (4 операции) | готово |
| Страж единственного чтения model_estimate_kcal | готово, испытан мутацией |
| Seed 100 RU-синонимов, скрипт импорта FDC | готово |
| Экран результата apps/web | НЕ НАЧАТО — apps/web нёс только экран камеры (foundation/scan-pipeline) |
| Guard-мутации ADR-005/ADR-006-покрытие/«источник числа» (ADR-001) | НЕ НАЧАТО — 3 из 6 стражей 04_refinement.md отсутствовали |
| 05_completion.md Criterion coverage | ПЛАНОВАЯ таблица (заглушки путей вместо фактических) |

Вывод ревизии: код собирался, но НИ ОДИН тест и НИ ОДНО ворота не запускались погибшей сессией
(«ничего не запускалось» подтвердилось). Решение — закоммитить проверенный базис немедленно, затем
продолжать.

## Что сделано в этой сессии

1. **Коммит базиса** (dbb7397) после typecheck/lint/`npm test` (142/142) — до какой-либо правки, как
   единственная точка отката к проверенному состоянию.
2. **Найдены и исправлены два реальных дефекта прогоном на настоящем PostgreSQL** (5ef46a0):
   - `similarity()` не находила 8 из 50 частых запросов («рис», «лук», «яйцо», «творог», «лосось»,
     «фасоль», «сельдь», «плов») против многословной курации → заменено на `word_similarity()`
     (`packages/db/src/queries/food-search.ts`), измерено на живом PostgreSQL (0,235→1,0 на «рис»),
     опечатка и случайная строка по-прежнему различаются (0,8125 и 0).
   - Перф-тест 300k валился на вставке синтетики (`INSERT … SELECT * FROM (VALUES …)` не даёт типы
     колонок) → прямой `INSERT … VALUES`. После фикса p95 = 21,9 с прогона (требование ≤200 мс на
     поиск выполнено).
3. **Реализован отсутствовавший экран результата** (2cda321): `apps/web/app/result/result-screen.tsx`
   — презентационный компонент (FR-source-and-correct-12), закрывает AC-source-and-correct-26 (чип
   источника, цитата USDA, `unmatched` без нуля, составное блюдо, экран расхождения; чужая разметка
   от модели рендерится текстом — React экранирует JSX сам). Тест —
   `tests/integration/web-result-screen.test.tsx` (4 теста, SSR-рендер тем же приёмом, что и
   `web-shell.test.tsx`). Клиентская интеграция (загрузка по scan_id, POST-вызовы, роут `/result/[id]`,
   замер 100 мс в браузере) НЕ сделана — явно названо недостижимым, согласуется с текстом
   спецификации («E2E после MVP», SC-US-003-1).
4. **Добавлены 3 недостающих из 6 стражей 04_refinement.md** (0911f3a, 52461c0), каждый испытан
   мутацией (guard-must-be-able-to-fail.md):
   - ADR-005 (строка `openfoodfacts` отсутствует в коде и окружении) — `tests/unit/source-guards.test.ts`.
   - ADR-001 «источник числа» — мутационная пара добавлена к существующей статической проверке —
     `tests/guard/single-model-estimate-read.test.ts`.
   - ADR-006 покрытие (удаление 10 строк seed красит AC-5) — `tests/integration/source/seed-synonyms.test.ts`.
   - Дополнительно: `recognition_conflict_choice_check`/`recognition_conflict_choice_pair` (DEC-A-023)
     проверены прямой негативной вставкой в БД — до этого проверялись только валидацией API
     (`tests/integration/migrations.test.ts`).
5. **05_completion.md переписан с плановой таблицы на фактическую** (52461c0, 0beb60c): все 26 строк
   Criterion coverage — реальные пути и заголовки, каждая сверена `grep -F` (тем же правилом, что
   используют ворота `--completion`). Чеклист и раздел «Что эта фича НЕ доказывает» дополнены честно:
   назван непроверенный конкурентный сценарий («правка во время завершения распознавания» — структурно
   обоснован через `SELECT FOR UPDATE`+`lease_fence`, но не оркестрован таймингом) и отсутствие
   клиентской интеграции экрана результата.

## Испытание стражей (guard-must-be-able-to-fail.md) — все шесть, красный→зелёный

| Страж | Файл | Результат |
|---|---|---|
| ADR-001, единственное чтение | tests/guard/single-model-estimate-read.test.ts | КРАСНЫЙ на 2 чтениях → ЗЕЛЁНЫЙ на 1 (уже было до этой сессии) |
| ADR-001, источник числа | tests/guard/single-model-estimate-read.test.ts | КРАСНЫЙ на внедрённой ссылке ModelResponse → ЗЕЛЁНЫЙ восстановленный (добавлено) |
| ADR-001, статус | tests/unit/source-guards.test.ts | КРАСНЫЙ на двух независимых мутациях → ЗЕЛЁНЫЙ (уже было) |
| ADR-005 | tests/unit/source-guards.test.ts | КРАСНЫЙ на внедрённом `openfoodfacts.org` → ЗЕЛЁНЫЙ (добавлено) |
| ADR-006, покрытие | tests/integration/source/seed-synonyms.test.ts | КРАСНЫЙ на удалении 10 строк (5 слов) → ЗЕЛЁНЫЙ (добавлено) |
| Атрибуция (цитата USDA) | tests/integration/web-result-screen.test.tsx | прямой assert (не static-scan-guard, ceremony мутации избыточна для присутствия строки) |

## Финальные прогоны (все зелёные, на РЕАЛЬНОМ PostgreSQL через docker compose --profile test)

- `npm run typecheck` — 0
- `npm run lint` — 0
- `npm test` — 145/145 (18 файлов)
- `npm run build` — api/recognizer/shared/db/web — 0
- `docker compose --profile test run --rm -T test npm run test:integration` — 33 файла / 123 теста,
  ВСЕ зелёные (включая ранее нестабильный `web-manifest.test.ts`, foundation, не относящийся к этой
  фиче)
- `npm run test:performance` (в контейнере) — p95 21,9 с (300 000/300 строк), требование ≤200 мс
  выполнено
- `node ../../.claude/hooks/check-ports.cjs .` — 0
- `bash scripts/check-env-wiring.sh .` — 0 (api/recognizer — все переменные проброшены; web — читаемых
  переменных нет, проверять нечего)
- `bash /root/.npm/_npx/ac10dded1a3b4a50/node_modules/@dzhechkov/p-replicator/scripts/check-pipeline-gaps.sh . --completion --role-map-source ../../.claude/commands/feature.md --project-role-map-source ../../.claude/skills/sparc-prd-mini/SKILL.md` — контур `source-and-correct` — 0 GAP.
  Остальные GAP/NOT-ESTABLISHED в общем выводе принадлежат ДРУГИМ, ещё не реализованным фичам роадмапа
  (consent-and-telegram-auth, diary-and-streak, partner-codes-and-cabinet, share-card-and-growth-events,
  pro-interest-and-limits-ui) и корневому `docs/Completion.md` — вне области этой фичи, не трогались.

`docker compose down -v` выполнен после каждого прогона.

## Честные остаточные пробелы (названы, не скрыты)

1. Клиентская интеграция экрана результата (fetch по scan_id, поллинг, реальные POST-вызовы из
   степпера/замены/расхождения, роут `/result/[id]`) — не реализована. Компонент презентационный.
2. Конкурентный сценарий «правка приходит в момент, когда воркер дописывает терминальный результат» —
   структурно безопасен (та же строка `recognition`, `SELECT FOR UPDATE` против условного `UPDATE …
   WHERE lease_fence`), но НЕ подтверждён отдельным тестом с управляемой гонкой.
   **СНЯТО в Phase 4 (см. ниже, RV-05)**: сценарий теперь покрыт управляемым тестом.
3. Полный дамп FDC не импортирован (тесты — на фикстуре 50 записей и синтетике 300 000); импорт
   реальных дампов — операция оператора, вне этой сессии (DEC-A-009 контекст).

## Правка после слепого ревью (Phase 4, 2026-09-13)

Слепой ревьюер (codex, `docs/features/source-and-correct/review-report.md`) нашёл 5 `high`, 0
блокеров, 2+ `medium`. По DEC-A-032 второго раунда не будет — правка последняя. Все пять `high`
исправлены в порядке, заданном координатором, и подтверждены прогоном на настоящем PostgreSQL.
`Medium` (RV-06, RV-07) НЕ чинились — выписаны в `05_completion.md`, раздел «Follow-up, не
блокирующий закрытие».

| Находка | Правка | Тест |
|---|---|---|
| RV-02 (high, `scripts/fdc/nutrient-map.ts:31`) — энергия выбиралась по имени «Energy» без учёта единицы; `1062/Energy/kJ` перед `1008/Energy/kcal` записал бы кДж как ккал | Критерий — имя И единица; неоднозначность (два id под один критерий) — отказ импорта | `tests/unit/source/nutrient-map.test.ts`, 7 тестов: обе перестановки строк, регистр единицы, energy-без-kcal-формы, неоднозначность, отсутствие |
| RV-03 (high, `tests/guard/single-model-estimate-read.test.ts:64`) — страж пропускал `const dbKcalTotal = finalResponse.modelEstimateKcal;` и `const kcal = modelEstimateKcal * 1;` | Детектор: +,-,*,/ рядом с идентификатором, плюс переприсваивание ЧИСТОГО пути к идентификатору под другим именем (отличено от аргумента `evaluateDiscrepancy` и самоимённой пересылки) | Обе строки ревьюера — отдельные испытания стража (красный/зелёный) + тест «легитимная пересылка нигде не считается использованием» |
| RV-01 (high, `apps/web/app/result/result-screen.tsx:156`) — компонент нигде не использовался, маршрута не было, кнопки без обработчиков | `apps/web/app/result/[id]/page.tsx` — реальный маршрут с загрузкой/поллингом и пятью действиями, подключёнными к `POST …/correct` через `buildCorrectRequest` | `tests/unit/source/correct-request.test.ts` (5 операций); `tests/integration/web-result-route.test.ts` (собранное приложение, `/result/<id>` → 200) |
| RV-05 (high, `tests/concurrency/source/concurrent-correct.test.ts:89`) — 20 одинаковых `set_portion` на одном индексе не могут наблюдаемо терять обновления | Два сценария с управляемым пересечением: разные операции на разных индексах; ручная блокировка строки имитирует воркера в процессе записи | Оба сценария зелёные на настоящем PostgreSQL; статическая половина «падение при снятой защите» в `tests/unit/source-guards.test.ts` |
| RV-04 (high, `tests/integration/source/usda-match-port.test.ts:82`) — AC-8 копировал контракт с другими входами/заголовком; AC-11 проверял локальную переменную ДО UPDATE; AC-10 не проверял точную длину/массы | Контракт вынесен в `tests/contract/match-ingredient-port.contract.ts`, ОДИН вызов из обоих тестов; AC-11 — реальная запись→UPDATE→GET с независимым ожидаемым числом; AC-10 — точная длина (5) и масса каждой части | 4/4 в `usda-match-port.test.ts`, 3/3 в `null-port.test.ts`, оба на настоящем PostgreSQL |

### Финальные прогоны после правок (все зелёные)

- `npm run typecheck`, `npm run lint`, `npm run build` — 0
- `npm test` — 163/163 (18→20 файлов, +18 тестов с начала Phase 3)
- `docker compose --profile test run --rm -T test npm run test:integration` — 34 файла / 127 тестов,
  ВСЕ зелёные (включая ранее нестабильный `web-manifest.test.ts` и новые
  `web-result-route.test.ts`, `concurrent-correct.test.ts` с двумя новыми сценариями)
- `npm run test:performance` (в контейнере) — p95 23,7 с прогона, требование ≤200 мс выполнено
- `node ../../.claude/hooks/check-ports.cjs .` — 0; `bash scripts/check-env-wiring.sh .` — 0
- `bash .../check-pipeline-gaps.sh . --completion --role-map-source … --project-role-map-source …`
  — контур `source-and-correct` — 0 GAP (остальные GAP/NOT-ESTABLISHED в общем выводе — другие,
  ещё не реализованные фичи роадмапа, вне области этой фичи)
- `docker compose down -v` выполнен после каждого прогона в контейнере

Status: completed
